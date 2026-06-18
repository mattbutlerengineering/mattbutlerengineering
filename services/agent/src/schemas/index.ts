import type { FastifyInstance } from "fastify";
import {
  sessionJsonSchema,
  sessionEventJsonSchema,
  createSessionBodyJsonSchema,
  problemDetailsJsonSchema,
} from "@mbe/types";

// Re-export the derived JSON Schemas so existing imports continue to work.
export const SessionSchema = sessionJsonSchema;
export const SessionEventSchema = sessionEventJsonSchema;
export const CreateSessionBodySchema = createSessionBodyJsonSchema;

// Agent service uses distinct $id values to avoid collisions when schemas
// from multiple services are composed into a single OpenAPI doc.
export const PaginationSchema = {
  $id: "AgentPagination",
  type: "object",
  required: ["page", "limit", "total", "totalPages", "hasNext", "hasPrev"],
  properties: {
    page: { type: "number", example: 1 },
    limit: { type: "number", example: 10 },
    total: { type: "number", example: 42 },
    totalPages: { type: "number", example: 5 },
    hasNext: { type: "boolean", example: true },
    hasPrev: { type: "boolean", example: false },
  },
} as const;

// RFC 7807 problem-details schema — replaces the legacy AgentError shape.
// Uses a distinct $id to avoid collisions when this service's OpenAPI doc
// is composed alongside other services that also register ProblemDetails.
export const ErrorSchema = { ...problemDetailsJsonSchema, $id: "AgentProblemDetails" } as const;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(SessionSchema);
  fastify.addSchema(SessionEventSchema);
  fastify.addSchema(CreateSessionBodySchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
