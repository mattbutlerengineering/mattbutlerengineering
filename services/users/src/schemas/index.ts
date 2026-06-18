import type { FastifyInstance } from "fastify";
import {
  userPreferencesJsonSchema,
  userJsonSchema,
  paginationJsonSchema,
  problemDetailsJsonSchema,
} from "@mbe/types";

// Re-export the derived JSON Schemas so existing imports continue to work.
export const UserPreferencesSchema = userPreferencesJsonSchema;
export const UserSchema = userJsonSchema;
export const PaginationSchema = paginationJsonSchema;
// RFC 7807 problem-details schema — replaces the legacy ErrorResponseSchema shape.
export const ErrorSchema = problemDetailsJsonSchema;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(UserPreferencesSchema);
  fastify.addSchema(UserSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
