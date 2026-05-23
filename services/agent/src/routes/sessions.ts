import type { FastifyPluginAsync } from "fastify";
import {
  type AgentSession,
  type AgentSessionStatus,
  type ApiResponse,
  type ApiError,
  type PaginatedResponse,
  type CreateAgentSessionRequest,
  createProblemDetails,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { parseListQuery } from "@mbe/database";
import { sessionService } from "../services/session.js";
import {
  executeSession,
  cancelSession,
  getActiveSessionCount,
} from "../services/session-executor.js";

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/sessions — Create + start a new session
  fastify.post<{
    Body: CreateAgentSessionRequest;
    Reply: ApiResponse<AgentSession> | ApiError;
  }>(
    "/",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Create a new agent session",
        operationId: "createSession",
        description: "Creates a session and immediately begins execution in the background.",
        tags: ["Sessions"],
        body: { $ref: "CreateSessionBody#" },
        response: {
          201: {
            description: "Session created and execution started",
            type: "object",
            properties: { data: { $ref: "Session#" } },
          },
          400: { $ref: "AgentError#" },
          429: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_SESSIONS ?? "5", 10);
      if (getActiveSessionCount() >= maxConcurrent) {
        return reply
          .code(429)
          .send(
            createProblemDetails(
              429,
              "Too Many Requests",
              `Maximum concurrent sessions (${maxConcurrent}) reached. Try again later.`
            )
          );
      }

      const session = await sessionService.create(request.body);

      // Fire-and-forget: execution happens in the background
      executeSession(session).catch((err) => {
        fastify.log.error({ sessionId: session.id, err }, "Session execution failed");
      });

      return reply.code(201).send({ data: session });
    }
  );

  // GET /v1/sessions — List sessions (paginated)
  fastify.get<{
    Querystring: { page?: string; limit?: string; status?: string };
    Reply: PaginatedResponse<AgentSession>;
  }>(
    "/",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "List agent sessions",
        operationId: "listSessions",
        description: "Retrieve a paginated list of sessions, optionally filtered by status.",
        tags: ["Sessions"],
        querystring: {
          type: "object",
          properties: {
            page: { type: "string", default: "1" },
            limit: { type: "string", default: "10" },
            status: {
              type: "string",
              enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
            },
          },
        },
        response: {
          200: {
            description: "Paginated list of sessions",
            type: "object",
            properties: {
              data: { type: "array", items: { $ref: "Session#" } },
              pagination: { $ref: "AgentPagination#" },
            },
          },
        },
      },
    },
    async (request) => {
      const { page, limit } = parseListQuery(request.query);
      const status = request.query.status as AgentSessionStatus | undefined;

      const prismaStatus = status?.toUpperCase() as
        | "PENDING"
        | "RUNNING"
        | "SUCCEEDED"
        | "FAILED"
        | "CANCELLED"
        | undefined;

      return sessionService.list({ page, limit, status: prismaStatus });
    }
  );

  // GET /v1/sessions/:id — Get session details
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<AgentSession> | ApiError;
  }>(
    "/:id",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Get session by ID",
        operationId: "getSession",
        tags: ["Sessions"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "Session#" } },
          },
          404: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      const session = await sessionService.getById(request.params.id);
      if (!session) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Session not found"));
      }
      return { data: session };
    }
  );

  // POST /v1/sessions/:id/cancel — Cancel a running session
  fastify.post<{
    Params: { id: string };
    Reply: ApiResponse<AgentSession> | ApiError;
  }>(
    "/:id/cancel",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Cancel a running session",
        operationId: "cancelSession",
        tags: ["Sessions"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: { data: { $ref: "Session#" } },
          },
          404: { $ref: "AgentError#" },
          409: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      const session = await sessionService.getById(request.params.id);
      if (!session) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Session not found"));
      }

      if (session.status !== "running") {
        return reply
          .code(409)
          .send(createProblemDetails(409, "Conflict", `Session is ${session.status}, not running`));
      }

      const cancelled = await cancelSession(session.id);
      if (!cancelled) {
        return reply
          .code(409)
          .send(createProblemDetails(409, "Conflict", "Session is not actively executing"));
      }

      const updated = await sessionService.getById(session.id);
      return { data: updated! };
    }
  );

  // DELETE /v1/sessions/:id — Delete a session
  fastify.delete<{
    Params: { id: string };
    Reply: void | ApiError;
  }>(
    "/:id",
    {
      preHandler: [requireAuth],
      schema: {
        summary: "Delete a session",
        operationId: "deleteSession",
        tags: ["Sessions"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          204: { description: "Session deleted", type: "null" },
          404: { $ref: "AgentError#" },
        },
      },
    },
    async (request, reply) => {
      const deleted = await sessionService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Session not found"));
      }
      return reply.code(204).send();
    }
  );
};
