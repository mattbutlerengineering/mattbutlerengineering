import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { type ApiResponse, type ProblemDetails, createProblemDetails } from "@mbe/types";
import type { OrchestratorResult } from "@mbe/agent-core";
import { requireAuth } from "@mbe/auth/fastify";
import { runOrchestrator, DEFAULT_ORCHESTRATOR_CONFIG } from "@mbe/agent-core";
import { sessionService } from "../services/session.js";
import { defaultConcurrency } from "../services/session-concurrency.js";

interface OrchestrateBody {
  taskDescription: string;
  model?: string;
  sessionModel?: string;
  maxBudgetPerSession?: number;
  maxTurnsPerSession?: number;
  baseBranch?: string;
  maxConcurrentSessions?: number;
}

interface OrchestrateResponse {
  parentSessionId: string;
  status: OrchestratorResult["status"];
  childSessionIds: readonly string[];
  summary: string;
  totalCostUsd: number;
  durationMs: number;
}

export const orchestrateRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/orchestrate — Decompose a task into sub-sessions
  fastify.post<{
    Body: OrchestrateBody;
    Reply: ApiResponse<OrchestrateResponse> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Orchestrate a complex task",
        operationId: "orchestrateTask",
        description:
          "Decomposes a complex task into independent sub-tasks, creates agent sessions " +
          "for each, monitors them to completion, and returns a synthesis.",
        tags: ["Orchestration"],
        body: {
          type: "object",
          required: ["taskDescription"],
          properties: {
            taskDescription: { type: "string", minLength: 1 },
            model: {
              type: "string",
              description: "Model for the orchestrator agent",
            },
            sessionModel: {
              type: "string",
              description: "Model for child coding sessions",
            },
            maxBudgetPerSession: {
              type: "number",
              minimum: 0.01,
              maximum: 10.0,
              description: "Budget cap per child session in USD",
            },
            maxTurnsPerSession: {
              type: "number",
              minimum: 1,
              maximum: 200,
              description: "Max turns per child session",
            },
            baseBranch: { type: "string" },
            maxConcurrentSessions: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Max child sessions to run in parallel",
            },
          },
        },
        response: {
          200: {
            description: "Orchestration result",
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: {
                  parentSessionId: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["succeeded", "failed", "partially_succeeded", "in_progress"],
                  },
                  childSessionIds: {
                    type: "array",
                    items: { type: "string" },
                  },
                  summary: { type: "string" },
                  totalCostUsd: { type: "number" },
                  durationMs: { type: "number" },
                },
              },
            },
          },
          400: { $ref: "AgentProblemDetails#" },
          429: { $ref: "AgentProblemDetails#" },
        },
      },
    },
    async (request, reply) => {
      const { taskDescription, ...overrides } = request.body;

      // Admit through the same gate POST /v1/sessions uses (#5148). The
      // orchestrator's parent IS an agent session — it holds a request thread
      // for the whole blocking call and runs its own `query` loop — so it has
      // to consume a slot, not merely check for one. A `canStart()`-only check
      // would be decorative here: parents would never enter the active set, so
      // it could never go false however many orchestrations were in flight.
      //
      // The slot is keyed on a provisional id, not the parent session id,
      // because nothing else manages this session's lifecycle — it never goes
      // through executeSession, so the liveness monitor could otherwise
      // release the slot out from under a still-running orchestration.
      const slotId = `orchestrate:${randomUUID()}`;
      if (!defaultConcurrency.acquire(slotId)) {
        return reply
          .code(429)
          .send(
            createProblemDetails(
              429,
              "Too Many Requests",
              `Maximum concurrent sessions (${defaultConcurrency.limit}) reached. Try again later.`
            )
          );
      }

      try {
        // Resolve the API base URL — the orchestrator calls back into this service
        const port = process.env.PORT ?? "3003";
        const apiBaseUrl = process.env.AGENT_API_URL ?? `http://localhost:${port}`;

        // Create a parent session to track the orchestration. Stamp the
        // authenticated caller's id — sourced exclusively from the verified
        // auth context (requireAuth preHandler, mandatory on this route) —
        // the same pattern POST /v1/sessions uses, so the caller who starts
        // the orchestration can read/cancel/delete it afterward instead of
        // getting a 404 from requireSessionAccess's null-owner deny.
        const parentSession = await sessionService.create({
          taskDescription: `[Orchestrator] ${taskDescription}`,
          model: overrides.model ?? DEFAULT_ORCHESTRATOR_CONFIG.model,
          maxTurns: 200,
          maxBudgetUsd:
            (overrides.maxBudgetPerSession ?? DEFAULT_ORCHESTRATOR_CONFIG.maxBudgetPerSession) *
            (overrides.maxConcurrentSessions ?? DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentSessions) *
            2,
          userId: request.user?.id,
        });

        await sessionService.updateStatus(parentSession.id, "RUNNING");
        await sessionService.addEvent(parentSession.id, "orchestrator:start", {
          message: `Decomposing: ${taskDescription}`,
        });

        // Run orchestrator (blocking — this is a long-running request)
        const result = await runOrchestrator(
          {
            taskDescription,
            apiBaseUrl,
            parentSessionId: parentSession.id,
            model: overrides.model ?? DEFAULT_ORCHESTRATOR_CONFIG.model,
            sessionModel: overrides.sessionModel ?? DEFAULT_ORCHESTRATOR_CONFIG.sessionModel,
            maxBudgetPerSession:
              overrides.maxBudgetPerSession ?? DEFAULT_ORCHESTRATOR_CONFIG.maxBudgetPerSession,
            maxTurnsPerSession:
              overrides.maxTurnsPerSession ?? DEFAULT_ORCHESTRATOR_CONFIG.maxTurnsPerSession,
            baseBranch: overrides.baseBranch ?? DEFAULT_ORCHESTRATOR_CONFIG.baseBranch,
            maxConcurrentSessions:
              overrides.maxConcurrentSessions ?? DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentSessions,
          },
          async (event) => {
            await sessionService.addEvent(parentSession.id, event.type, {
              message: event.message,
            });
          }
        );

        // Update parent session with final status. "in_progress" means children are still
        // running/pending — leave the parent RUNNING rather than falsely marking it FAILED.
        const finalStatus =
          result.status === "succeeded"
            ? "SUCCEEDED"
            : result.status === "in_progress"
              ? "RUNNING"
              : "FAILED";
        await sessionService.updateStatus(parentSession.id, finalStatus, {
          resultText: result.summary,
          costUsd: result.totalCostUsd,
          durationMs: result.durationMs,
        });

        await sessionService.addEvent(parentSession.id, "orchestrator:complete", {
          status: result.status,
          childSessionIds: result.childSessionIds,
          totalCostUsd: result.totalCostUsd,
        });

        return reply.code(200).send({
          data: {
            parentSessionId: parentSession.id,
            status: result.status,
            childSessionIds: result.childSessionIds,
            summary: result.summary,
            totalCostUsd: result.totalCostUsd,
            durationMs: result.durationMs,
          },
        });
      } finally {
        // Releasing in `finally` matters more than the acquire: a leaked
        // slot is permanent, shrinking capacity for the process lifetime.
        defaultConcurrency.release(slotId);
      }
    }
  );
};
