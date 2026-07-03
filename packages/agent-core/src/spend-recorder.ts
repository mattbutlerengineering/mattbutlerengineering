import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The single spend-recording seam for the whole agent runtime.
 *
 * Every path that spends money — `runSession()` (the Claude SDK adapter), the
 * CLI's gemini/opencode adapter path, and the issue-worker escalation script —
 * records through {@link recordSpend}, producing exactly one JSON line per run.
 *
 * ## Canonical sink
 *
 *     <repo>/.claude/agent-spend/sessions.jsonl
 *
 * There is intentionally NO sibling `.claude/agent-spend.jsonl` file — it was a
 * second, divergent sink that double-counted claude runs and missed
 * gemini/opencode runs entirely. All readers now consume this one file:
 *   - `.claude/skills/learning-loop/scripts/sensor-report.mjs` (session count)
 *   - `scripts/collect-agent-cost.mjs` (per-issue attribution)
 *   - `plugins/acmm/scripts/backfill-metrics.js` (weekly run/cost rollup)
 */
export const SPEND_SINK_DIR = ".claude/agent-spend";
export const SPEND_SINK_FILE = "sessions.jsonl";

/**
 * A single recorded spend entry (the on-disk schema).
 *
 * Superset schema: `date`, `timestamp` and `costUsd` are always present; token,
 * turn and issue attribution are populated where the caller has them (the
 * Claude SDK path) and omitted where the backend does not report them (the
 * gemini/opencode subprocess adapters record cost 0 with adapter attribution
 * so the run is at least visible).
 */
export interface SpendEntry {
  /** UTC calendar date (YYYY-MM-DD) — used by daily-spend readers. */
  readonly date: string;
  /** Full ISO-8601 timestamp of when the entry was recorded. */
  readonly timestamp: string;
  /** Session cost in USD (0 when the backend does not report cost). */
  readonly costUsd: number;
  /** Owning issue number, or null when the run is not issue-scoped. */
  readonly issueNumber?: number | null;
  /** Model identifier used for the run. */
  readonly model?: string;
  /** Backend that produced the run: "claude" | "gemini" | "opencode". */
  readonly adapter?: string;
  /** SDK session id (Claude path only). */
  readonly sessionId?: string;
  /** Terminal session status (e.g. "succeeded" | "failed"). */
  readonly status?: string;
  /** Prompt tokens consumed (Claude path only). */
  readonly inputTokens?: number;
  /** Completion tokens produced (Claude path only). */
  readonly outputTokens?: number;
  /** Number of conversation turns (Claude path only). */
  readonly numTurns?: number;
}

/** Caller-supplied fields for a spend entry (date/timestamp are stamped here). */
export interface SpendEntryInput {
  readonly costUsd: number;
  readonly issueNumber?: number | null;
  readonly model?: string;
  readonly adapter?: string;
  readonly sessionId?: string;
  readonly status?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly numTurns?: number;
}

/**
 * Append one spend entry to the canonical sink
 * (`<repo>/.claude/agent-spend/sessions.jsonl`).
 *
 * Called after every agent run (success or fail) so the token-cost sensors,
 * progress-tracker, and learning-loop have accurate, single-sourced data.
 * Best-effort by contract: callers wrap this so a logging failure never fails
 * a session.
 */
export function recordSpend(repoPath: string, input: SpendEntryInput): void {
  const dir = join(repoPath, SPEND_SINK_DIR);
  const filePath = join(dir, SPEND_SINK_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const now = new Date();
  const entry: SpendEntry = {
    date: now.toISOString().slice(0, 10),
    timestamp: now.toISOString(),
    costUsd: input.costUsd,
    ...(input.issueNumber !== undefined ? { issueNumber: input.issueNumber } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.adapter !== undefined ? { adapter: input.adapter } : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
    ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
    ...(input.numTurns !== undefined ? { numTurns: input.numTurns } : {}),
  };

  appendFileSync(filePath, JSON.stringify(entry) + "\n");
}
