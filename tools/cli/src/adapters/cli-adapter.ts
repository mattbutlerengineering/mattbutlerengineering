/**
 * Shared interface for all agent backends (Claude SDK, Gemini CLI, OpenCode CLI).
 *
 * AdapterConfig is intentionally simpler than SessionConfig — it represents the
 * lowest common denominator of configuration across heterogeneous CLIs.
 *
 * @see {@link ../commands/agent.ts} for the CLI command that uses these adapters.
 */

// ── Adapter configuration ───────────────────────────────────────────

export interface AdapterConfig {
  /** Human-readable description of the task for the agent to perform. */
  readonly taskDescription: string;
  /** Absolute path to the isolated worktree where the agent operates. */
  readonly worktreePath: string;
  /** Absolute path to the original repository root. */
  readonly repoPath: string;
  /** Git branch to base work on (e.g. "main"). */
  readonly baseBranch: string;
  /** Model identifier override (adapter-specific, e.g. "claude-sonnet-4-6", "gemini-2.5-pro"). */
  readonly model?: string;
  /** Maximum number of conversation turns before the adapter should stop. */
  readonly maxTurns?: number;
  /** Hard wall-clock timeout in milliseconds for the entire run. */
  readonly timeoutMs?: number;
}

// ── Adapter result ──────────────────────────────────────────────────

export interface AdapterResult {
  /** Whether the agent session completed successfully. */
  readonly success: boolean;
  /** Whether the agent made any git-visible changes in the worktree. */
  readonly hasChanges: boolean;
  /** Whether the run was terminated due to rate limiting (maps to FailureCategory "rate_limited"). */
  readonly rateLimited: boolean;
  /** Human-readable error message when success is false. */
  readonly error?: string;
  /** Wall-clock duration of the run in milliseconds. */
  readonly durationMs: number;
}

// ── Adapter state (for multi-adapter rotation / cooldown) ───────────

export interface AdapterState {
  /** Unique adapter name (e.g. "claude-sdk", "gemini-cli", "opencode-cli"). */
  readonly name: string;
  /** Whether this adapter is currently available for use. */
  available: boolean;
  /** Unix timestamp (ms) until which this adapter is in cooldown, or null if not cooling down. */
  cooldownUntil: number | null;
  /** Number of consecutive failures — used for backoff / rotation decisions. */
  consecutiveFailures: number;
}

// ── Agent adapter interface ─────────────────────────────────────────

export interface AgentAdapter {
  /** Unique adapter name matching AdapterState.name. */
  readonly name: string;
  /** Check whether the adapter's CLI / SDK dependency is installed and reachable. */
  isAvailable(): Promise<boolean>;
  /** Execute the agent task and return a normalized result. */
  run(config: AdapterConfig): Promise<AdapterResult>;
}
