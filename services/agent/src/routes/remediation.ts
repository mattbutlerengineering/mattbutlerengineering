import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { type ApiError, createProblemDetails } from "@mbe/types";
import { sessionService } from "../services/session.js";
import { executeSession } from "../services/session-executor.js";
import {
  checkCircuitBreaker,
  recordRemediationOutcome,
} from "../services/remediation-circuit-breaker.js";

// ── Alert payload schema ─────────────────────────────────────────────

const AlertPayloadSchema = z.object({
  source: z.enum(["grafana", "pagerduty", "custom"]),
  alertName: z.string().max(200),
  severity: z.enum(["critical", "warning", "info"]),
  summary: z.string().max(2000),
  labels: z.record(z.string(), z.string()).optional(),
  generatorURL: z.string().url().optional(),
  startsAt: z.string().optional(),
});

type AlertPayload = z.infer<typeof AlertPayloadSchema>;

// ── Signature verification ───────────────────────────────────────────

function verifyRemediationSignature(
  payload: Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Route ────────────────────────────────────────────────────────────

export const remediationRoutes: FastifyPluginAsync = async (fastify) => {
  // Capture raw request body before Fastify parses JSON.
  // Webhook senders sign the original bytes; re-serializing via JSON.stringify
  // can produce a different byte sequence and break HMAC verification.
  fastify.addHook("preParsing", async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const rawBody = Buffer.concat(chunks);
    (request as unknown as Record<string, unknown>).rawBody = rawBody;
    return Readable.from(rawBody);
  });

  // lgtm[js/missing-rate-limiting] — rate limiting is applied globally via @fastify/rate-limit in app.ts
  fastify.post<{
    Body: unknown;
    Reply: { sessionId: string } | ApiError;
  }>(
    "/remediation",
    {
      schema: {
        summary: "Remediation webhook receiver",
        operationId: "handleRemediationWebhook",
        description:
          "Receives monitoring alerts (Grafana, PagerDuty, etc.) and triggers " +
          "agent investigation sessions. Circuit breaker prevents alert storms.",
        tags: ["Webhooks"],
        response: {
          200: {
            type: "object",
            properties: { sessionId: { type: "string" } },
          },
          400: { $ref: "AgentError#" },
          401: { $ref: "AgentError#" },
          503: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      // 1. Verify webhook secret
      const secret = process.env.REMEDIATION_WEBHOOK_SECRET;
      if (!secret) {
        fastify.log.warn("REMEDIATION_WEBHOOK_SECRET not configured — rejecting");
        return reply
          .code(401)
          .send(
            createProblemDetails(
              401,
              "Unauthorized",
              "Remediation webhook secret not configured"
            )
          );
      }

      // Verify signature against the original raw bytes (not re-serialized JSON)
      const signature = request.headers["x-remediation-signature"] as string | undefined;
      const rawBody = (request as unknown as Record<string, unknown>).rawBody as Buffer;

      if (!verifyRemediationSignature(rawBody, signature, secret)) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Invalid webhook signature"));
      }

      // 2. Validate payload
      const parseResult = AlertPayloadSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .code(400)
          .send(
            createProblemDetails(
              400,
              "Bad Request",
              `Invalid alert payload: ${parseResult.error.message}`
            )
          );
      }

      const payload: AlertPayload = parseResult.data;

      // 3. Skip info-level alerts (log only)
      if (payload.severity === "info") {
        fastify.log.info(
          { alertName: payload.alertName, source: payload.source },
          "Info-level alert received — no action taken"
        );
        return reply.code(200).send({ sessionId: "" });
      }

      // 4. Check circuit breaker
      const circuitCheck = checkCircuitBreaker();
      if (!circuitCheck.allowed) {
        fastify.log.warn(
          { alertName: payload.alertName, reason: circuitCheck.reason },
          "Remediation circuit breaker is open"
        );
        return reply
          .code(503)
          .send(
            createProblemDetails(
              503,
              "Service Unavailable",
              circuitCheck.reason ?? "Circuit breaker open"
            )
          );
      }

      // 5. Build investigation task
      const taskDescription =
        `[PRODUCTION ALERT — ${payload.severity.toUpperCase()}] ${payload.alertName}\n\n` +
        `Alert summary: ${payload.summary}\n\n` +
        `Source: ${payload.source}\n` +
        (payload.generatorURL ? `Dashboard: ${payload.generatorURL}\n` : "") +
        (payload.labels ? `Labels: ${JSON.stringify(payload.labels)}\n` : "") +
        `\nInvestigate the production issue described above. ` +
        `Check recent deployments (git log --oneline -10), error logs, and the affected code paths. ` +
        `If the root cause is identifiable from the codebase, create a fix PR. ` +
        `If it requires infrastructure or environment changes outside the codebase, ` +
        `create a draft PR documenting the investigation findings and recommended action.`;

      fastify.log.info(
        { alertName: payload.alertName, severity: payload.severity, source: payload.source },
        "Creating remediation session"
      );

      const session = await sessionService.create({
        taskDescription,
        baseBranch: "main",
      });

      // Fire and forget — record outcome when complete
      executeSession(session)
        .then(() => recordRemediationOutcome(true))
        .catch((err) => {
          recordRemediationOutcome(false);
          fastify.log.error(
            { sessionId: session.id, err },
            "Remediation session failed"
          );
        });

      return { sessionId: session.id };
    }
  );
};
