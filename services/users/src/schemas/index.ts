import type { FastifyInstance } from "fastify";

// Shared schema definitions
export const UserSchema = {
  $id: "User",
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string" },
    name: { type: "string", nullable: true },
    picture: { type: "string", nullable: true },
    emailVerified: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const PaginationSchema = {
  $id: "Pagination",
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    totalPages: { type: "number" },
    hasNext: { type: "boolean" },
    hasPrev: { type: "boolean" },
  },
} as const;

export const ErrorSchema = {
  $id: "Error",
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    statusCode: { type: "number" },
  },
} as const;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(UserSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
