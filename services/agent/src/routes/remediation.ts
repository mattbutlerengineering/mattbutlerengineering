import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiError } from "@mbe/types";
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
  payload: string,
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
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Remediation webhook secret not configured",
          statusCode: 401,
        });
      }

      const signature = request.headers["x-remediation-signature"] as string | undefined;
      const rawBody = JSON.stringify(request.body);

      if (!verifyRemediationSignature(rawBody, signature, secret)) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid webhook signature",
          statusCode: 401,
        });
      }

      // 2. Validate payload
      const parseResult = AlertPayloadSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Invalid alert payload: ${parseResult.error.message}`,
          statusCode: 400,
        });
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
        return reply.code(503).send({
          error: "Service Unavailable",
          message: circuitCheck.reason ?? "Circuit breaker open",
          statusCode: 503,
        });
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
