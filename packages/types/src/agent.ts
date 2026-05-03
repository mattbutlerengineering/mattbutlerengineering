// ── Agent session types (shared across CLI and API service) ──────────

export type AgentSessionStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface AgentSession {
  id: string;
  status: AgentSessionStatus;
  taskDescription: string;
  branchName: string | null;
  baseBranch: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  prUrl: string | null;
  prNumber: number | null;
  resultText: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  numTurns: number | null;
  durationMs: number | null;
  parentId: string | null;
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentSessionRequest {
  taskDescription: string;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  baseBranch?: string;
  createPr?: boolean;
  parentId?: string;
}

export interface AgentSessionEvent {
  id: string;
  sessionId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}
