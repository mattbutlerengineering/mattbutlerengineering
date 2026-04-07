import { z } from "zod";

export const AgentSessionStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const AgentSessionSchema = z.object({
  id: z.string(),
  status: AgentSessionStatusSchema,
  taskDescription: z.string(),
  branchName: z.string().nullable(),
  baseBranch: z.string(),
  model: z.string(),
  maxTurns: z.number(),
  maxBudgetUsd: z.number(),
  createPr: z.boolean().optional(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  resultText: z.string().nullable(),
  costUsd: z.number().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  numTurns: z.number().nullable(),
  durationMs: z.number().nullable(),
  parentId: z.string().nullable(),
  errors: z.array(z.string()),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AgentSessionEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

export const CreateAgentSessionRequestSchema = z.object({
  taskDescription: z.string().min(1).max(10_000),
  model: z.string().optional(),
  maxTurns: z.number().min(1).max(200).optional(),
  maxBudgetUsd: z.number().min(0.01).max(10.0).optional(),
  baseBranch: z.string().optional(),
  createPr: z.boolean().optional(),
  parentId: z.string().optional(),
});
