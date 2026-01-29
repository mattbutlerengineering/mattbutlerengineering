import type { FastifyInstance } from "fastify";

// Shared schema definitions
export const UserPreferencesSchema = {
  $id: "UserPreferences",
  type: "object",
  description: "User preference settings for UI and notifications",
  properties: {
    theme: {
      type: "string",
      enum: ["light", "dark", "system"],
      description: "UI theme preference",
      example: "system",
    },
    emailNotifications: {
      type: "boolean",
      description: "Whether to receive email notifications for account activity",
      example: true,
    },
    marketingEmails: {
      type: "boolean",
      description: "Whether to receive marketing and promotional emails",
      example: false,
    },
  },
} as const;

export const UserSchema = {
  $id: "User",
  type: "object",
  description: "A user account in the system",
  required: ["id", "email", "emailVerified", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the user",
      example: "clx1234567890abcdef",
    },
    email: {
      type: "string",
      format: "email",
      description: "User's email address",
      example: "user@example.com",
    },
    name: {
      type: "string",
      nullable: true,
      description: "User's display name",
      example: "John Doe",
    },
    picture: {
      type: "string",
      format: "uri",
      nullable: true,
      description: "URL to the user's profile picture",
      example: "https://example.com/avatars/user.jpg",
    },
    emailVerified: {
      type: "boolean",
      description: "Whether the user's email has been verified",
      example: true,
    },
    preferences: {
      $ref: "UserPreferences#",
      description: "User's preference settings",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the user was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the user was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

export const PaginationSchema = {
  $id: "Pagination",
  type: "object",
  description: "Pagination metadata for list responses",
  required: ["page", "limit", "total", "totalPages", "hasNext", "hasPrev"],
  properties: {
    page: {
      type: "number",
      description: "Current page number (1-indexed)",
      example: 1,
    },
    limit: {
      type: "number",
      description: "Number of items per page",
      example: 10,
    },
    total: {
      type: "number",
      description: "Total number of items across all pages",
      example: 42,
    },
    totalPages: {
      type: "number",
      description: "Total number of pages",
      example: 5,
    },
    hasNext: {
      type: "boolean",
      description: "Whether there is a next page",
      example: true,
    },
    hasPrev: {
      type: "boolean",
      description: "Whether there is a previous page",
      example: false,
    },
  },
} as const;

export const ErrorSchema = {
  $id: "Error",
  type: "object",
  description: "Standard error response",
  required: ["error", "message", "statusCode"],
  properties: {
    error: {
      type: "string",
      description: "Error type or category",
      example: "Not Found",
    },
    message: {
      type: "string",
      description: "Human-readable error message",
      example: "User not found",
    },
    statusCode: {
      type: "number",
      description: "HTTP status code",
      example: 404,
    },
  },
} as const;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(UserPreferencesSchema);
  fastify.addSchema(UserSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
