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

export const CreateAgentSessionRequestSchema = z.object({
  taskDescription: z.string(),
  model: z.string().optional(),
  maxTurns: z.number().optional(),
  maxBudgetUsd: z.number().optional(),
  baseBranch: z.string().optional(),
  parentId: z.string().optional(),
});
