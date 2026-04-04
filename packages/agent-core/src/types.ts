import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Session configuration ────────────────────────────────────────────

export interface FeedbackLoopConfig {
  readonly enabled: boolean;
  readonly maxRetries: number;
  readonly pollIntervalMs: number;
  readonly pollTimeoutMs: number;
}

export const DEFAULT_FEEDBACK_LOOP_CONFIG: FeedbackLoopConfig = {
  enabled: true,
  maxRetries: 2,
  pollIntervalMs: 30_000,
  pollTimeoutMs: 300_000,
};

export interface SessionConfig {
  readonly taskDescription: string;
  readonly repoPath: string;
  readonly baseBranch: string;
  readonly model: string;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly allowedTools: readonly string[];
  readonly createPr: boolean;
  readonly evaluateSuccess?: boolean;
  readonly sourceFiles?: readonly string[];
  readonly feedbackLoop?: FeedbackLoopConfig;
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
  readonly stuckPattern?: string;
  readonly evaluation?: {
    readonly passed: boolean;
    readonly confidence: number;
    readonly reasoning: string;
  };
}

// ── Session events (for streaming) ───────────────────────────────────

export type SessionEventType =
  | "session:start"
  | "session:message"
  | "session:tool_use"
  | "session:assistant"
  | "session:result"
  | "session:error"
  | "session:stuck"
  | "session:evaluation"
  | "session:verification"
  | "session:review"
  | "session:tool_result";

export interface SessionEvent {
  readonly type: SessionEventType;
  readonly timestamp: string;
  readonly data: SDKMessage | SDKResultMessage | { message: string };
}

export type SessionEventCallback = (event: SessionEvent) => void;

// ── Worktree ─────────────────────────────────────────────────────────

/**
 * 'full'        – git worktree add (full working tree, current behavior)
 * 'lightweight' – shallow clone + checkout -b (faster for small changes)
 */
export type WorktreeMode = "full" | "lightweight";

export interface WorktreeInfo {
  readonly path: string;
  readonly branchName: string;
  readonly mode: WorktreeMode;
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
  readonly draft?: boolean;
}
