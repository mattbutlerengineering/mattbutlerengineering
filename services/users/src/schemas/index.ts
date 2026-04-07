import type { FastifyInstance } from "fastify";
import {
  userPreferencesJsonSchema,
  userJsonSchema,
  paginationJsonSchema,
  errorJsonSchema,
} from "@mbe/types";

// Re-export the derived JSON Schemas so existing imports continue to work.
export const UserPreferencesSchema = userPreferencesJsonSchema;
export const UserSchema = userJsonSchema;
export const PaginationSchema = paginationJsonSchema;
export const ErrorSchema = errorJsonSchema;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(UserPreferencesSchema);
  fastify.addSchema(UserSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
