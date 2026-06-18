import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, ApiError } from "@mbe/types";
import type { OrchestratorResult } from "@mbe/agent-core";
import { requireAuth } from "@mbe/auth/fastify";
import { runOrchestrator, DEFAULT_ORCHESTRATOR_CONFIG } from "@mbe/agent-core";
import { sessionService } from "../services/session.js";

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
    Reply: ApiResponse<OrchestrateResponse> | ApiError;
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
              description: "Budget cap per child session in USD",
            },
            maxTurnsPerSession: {
              type: "number",
              description: "Max turns per child session",
            },
            baseBranch: { type: "string" },
            maxConcurrentSessions: {
              type: "number",
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
                    enum: ["succeeded", "failed", "partially_succeeded"],
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
        },
      },
    },
    async (request, reply) => {
      const { taskDescription, ...overrides } = request.body;

      // Resolve the API base URL — the orchestrator calls back into this service
      const port = process.env.PORT ?? "3003";
      const apiBaseUrl = process.env.AGENT_API_URL ?? `http://localhost:${port}`;

      // Create a parent session to track the orchestration
      const parentSession = await sessionService.create({
        taskDescription: `[Orchestrator] ${taskDescription}`,
        model: overrides.model ?? DEFAULT_ORCHESTRATOR_CONFIG.model,
        maxTurns: 200,
        maxBudgetUsd:
          (overrides.maxBudgetPerSession ?? DEFAULT_ORCHESTRATOR_CONFIG.maxBudgetPerSession) *
          (overrides.maxConcurrentSessions ?? DEFAULT_ORCHESTRATOR_CONFIG.maxConcurrentSessions) *
          2,
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

      // Update parent session with final status
      const finalStatus = result.status === "succeeded" ? "SUCCEEDED" : "FAILED";
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
    }
  );
};
