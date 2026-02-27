import type { FastifyInstance } from "fastify";

export const SessionStatusEnum = {
  type: "string",
  enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
} as const;

export const SessionSchema = {
  $id: "Session",
  type: "object",
  description: "An agent coding session",
  required: ["id", "status", "taskDescription", "baseBranch", "model", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", description: "Unique identifier", example: "clx1234567890" },
    status: { ...SessionStatusEnum, description: "Current session status" },
    taskDescription: { type: "string", description: "Task the agent is working on" },
    branchName: { type: "string", nullable: true, description: "Git branch name" },
    baseBranch: { type: "string", description: "Base branch", example: "main" },
    model: { type: "string", description: "Claude model used", example: "claude-sonnet-4-6" },
    maxTurns: { type: "number", description: "Maximum conversation turns", example: 50 },
    maxBudgetUsd: { type: "number", description: "Budget cap in USD", example: 1.0 },
    createPr: { type: "boolean", description: "Whether to create a PR" },
    prUrl: { type: "string", nullable: true, description: "Pull request URL" },
    prNumber: { type: "number", nullable: true, description: "Pull request number" },
    resultText: { type: "string", nullable: true, description: "Agent result text" },
    costUsd: { type: "number", nullable: true, description: "Actual cost in USD" },
    inputTokens: { type: "number", nullable: true },
    outputTokens: { type: "number", nullable: true },
    numTurns: { type: "number", nullable: true, description: "Actual turns used" },
    durationMs: { type: "number", nullable: true, description: "Duration in milliseconds" },
    errors: { type: "array", items: { type: "string" } },
    parentId: { type: "string", nullable: true },
    startedAt: { type: "string", format: "date-time", nullable: true },
    completedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const SessionEventSchema = {
  $id: "SessionEvent",
  type: "object",
  required: ["id", "sessionId", "type", "createdAt"],
  properties: {
    id: { type: "string" },
    sessionId: { type: "string" },
    type: { type: "string" },
    data: { type: "object", additionalProperties: true },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const CreateSessionBodySchema = {
  $id: "CreateSessionBody",
  type: "object",
  required: ["taskDescription"],
  properties: {
    taskDescription: { type: "string", minLength: 1, description: "Task for the agent" },
    model: { type: "string", description: "Claude model to use" },
    maxTurns: { type: "number", minimum: 1, maximum: 200 },
    maxBudgetUsd: { type: "number", minimum: 0.01, maximum: 10.0 },
    baseBranch: { type: "string" },
    createPr: { type: "boolean" },
    parentId: { type: "string", description: "Parent session ID for orchestrated child sessions" },
  },
} as const;

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

export const ErrorSchema = {
  $id: "AgentError",
  type: "object",
  required: ["error", "message", "statusCode"],
  properties: {
    error: { type: "string", example: "Not Found" },
    message: { type: "string", example: "Session not found" },
    statusCode: { type: "number", example: 404 },
  },
} as const;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(SessionSchema);
  fastify.addSchema(SessionEventSchema);
  fastify.addSchema(CreateSessionBodySchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
