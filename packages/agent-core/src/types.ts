import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Session configuration ────────────────────────────────────────────

export interface SessionConfig {
  readonly taskDescription: string;
  readonly repoPath: string;
  readonly baseBranch: string;
  readonly model: string;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly allowedTools: readonly string[];
  readonly createPr: boolean;
}

export const DEFAULT_SESSION_CONFIG: Omit<SessionConfig, "taskDescription" | "repoPath"> = {
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  allowedTools: [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
    "NotebookEdit",
  ],
  createPr: true,
};

// ── Session result ───────────────────────────────────────────────────

export type SessionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface SessionResult {
  readonly sessionId: string;
  readonly status: SessionStatus;
  readonly branchName: string;
  readonly prUrl: string | null;
  readonly costUsd: number;
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
  readonly numTurns: number;
  readonly resultText: string;
  readonly errors: readonly string[];
}

// ── Session events (for streaming) ───────────────────────────────────

export type SessionEventType =
  | "session:start"
  | "session:message"
  | "session:tool_use"
  | "session:assistant"
  | "session:result"
  | "session:error";

export interface SessionEvent {
  readonly type: SessionEventType;
  readonly timestamp: string;
  readonly data: SDKMessage | SDKResultMessage | { message: string };
}

export type SessionEventCallback = (event: SessionEvent) => void;

// ── Worktree ─────────────────────────────────────────────────────────

export interface WorktreeInfo {
  readonly path: string;
  readonly branchName: string;
}

// ── PR creation ──────────────────────────────────────────────────────

export interface PrResult {
  readonly url: string;
  readonly number: number;
}

export interface PrOptions {
  readonly title: string;
  readonly body: string;
  readonly baseBranch: string;
  readonly branchName: string;
  readonly repoPath: string;
}
