import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StuckDetectorConfig } from "./stuck-detector.js";

// ── Failure categorization ───────────────────────────────────────────

/**
 * Structured failure categories for analytics and alerting.
 *
 * - api_error:        Anthropic API returned an error (5xx, network, etc.)
 * - rate_limited:     Request was throttled by the API (429)
 * - stuck_loop:       Stuck detector fired (repeated actions, zero progress, etc.)
 * - budget_exceeded:  Session cost exceeded maxBudgetUsd
 * - tool_error:       A tool call returned an error
 * - logic_error:      Agent produced incorrect output (evaluation / review failed)
 */
export type FailureCategory =
  | "api_error"
  | "rate_limited"
  | "stuck_loop"
  | "budget_exceeded"
  | "tool_error"
  | "logic_error";

// ── Per-turn observability metrics ───────────────────────────────────

export interface TurnMetrics {
  /** 1-based turn index within the session */
  readonly turnIndex: number;
  /** ISO timestamp when this turn started */
  readonly startedAt: string;
  /** Input tokens consumed in this turn */
  readonly inputTokens: number;
  /** Output tokens produced in this turn */
  readonly outputTokens: number;
  /** Extended-thinking tokens (if applicable) */
  readonly thinkingTokens: number;
  /** Incremental cost in USD for this turn */
  readonly costUsd: number;
  /** Model ID that handled this turn */
  readonly modelId: string;
}

export interface ToolCallMetrics {
  /** Tool name (e.g. "Read", "Bash") */
  readonly toolName: string;
  /** Unique tool-use ID from the SDK */
  readonly toolUseId: string;
  /** Wall-clock latency in milliseconds */
  readonly latencyMs: number;
  /** Whether the tool call resulted in an error */
  readonly isError: boolean;
}

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
  readonly stuckDetectorConfig?: Partial<StuckDetectorConfig>;
  /** The reason string from model routing (e.g. "Feature label with simple scope") */
  readonly modelRoutingReason?: string;
  /** The selected model tier from routing (e.g. "haiku", "sonnet", "opus") */
  readonly modelRoutingTier?: string;
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
  readonly failureCategory?: FailureCategory;
  readonly turnMetrics?: readonly TurnMetrics[];
  readonly toolCallMetrics?: readonly ToolCallMetrics[];
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
  | "session:tool_result"
  | "session:turn_metrics"
  | "session:tool_latency"
  | "session:heartbeat";

// ── Heartbeat / liveness configuration ──────────────────────────────

export interface HeartbeatConfig {
  /** Interval between heartbeat emissions (ms). Default: 60_000 (1 min) */
  readonly intervalMs: number;
  /** Max time with no SDK messages before auto-cancel (ms). Default: 600_000 (10 min) */
  readonly inactivityTimeoutMs: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 60_000,
  inactivityTimeoutMs: 600_000,
};

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
