import type { FailureCategory, TurnMetrics, ToolCallMetrics } from "./types.js";
import type { StuckPatternType } from "./stuck-detector.js";

// ── Failure categorization ───────────────────────────────────────────

const RATE_LIMIT_SIGNALS: readonly RegExp[] = [
  /rate[_\s-]?limit/i,
  /too many requests/i,
  /429/,
  /overloaded/i,
];

const API_ERROR_SIGNALS: readonly RegExp[] = [
  /api[_\s-]?error/i,
  /\b5\d{2}\b/,
  /network/i,
  /timeout/i,
  /econnrefused/i,
  /enotfound/i,
];

/**
 * Check whether substrings `a` and `b` both appear in `str` (case-insensitive),
 * with `a` occurring before `b`. Replaces `.*` regex patterns to avoid ReDoS.
 */
function containsInOrder(str: string, a: string, b: string): boolean {
  const lower = str.toLowerCase();
  const idx = lower.indexOf(a);
  return idx !== -1 && lower.indexOf(b, idx + a.length) !== -1;
}

type BudgetSignal = RegExp | ((str: string) => boolean);

const BUDGET_SIGNALS: readonly BudgetSignal[] = [
  /budget/i,
  (str: string) => containsInOrder(str, "cost", "exceeded"),
  (str: string) => containsInOrder(str, "exceeded", "budget"),
  (str: string) => containsInOrder(str, "max", "budget"),
];

const TOOL_ERROR_SIGNALS: readonly RegExp[] = [
  /tool[_\s-]?error/i,
  /is_error/i,
  /ENOENT/,
  /EACCES/,
  /permission denied/i,
];

/**
 * Categorize a failure into a structured `FailureCategory` based on error messages,
 * stuck pattern type, and whether the error was a tool error.
 *
 * Returns `undefined` if no category can be determined (e.g. for successful sessions).
 */
export function categorizeFailure(
  errors: readonly string[],
  stuckPattern?: StuckPatternType
): FailureCategory | undefined {
  // Stuck-loop takes priority — it's always a stuck_loop failure
  if (stuckPattern) {
    return "stuck_loop";
  }

  const combined = errors.join(" ").toLowerCase();

  for (const pattern of RATE_LIMIT_SIGNALS) {
    if (pattern.test(combined)) return "rate_limited";
  }

  for (const signal of BUDGET_SIGNALS) {
    const matched = typeof signal === "function" ? signal(combined) : signal.test(combined);
    if (matched) return "budget_exceeded";
  }

  for (const pattern of TOOL_ERROR_SIGNALS) {
    if (pattern.test(combined)) return "tool_error";
  }

  for (const pattern of API_ERROR_SIGNALS) {
    if (pattern.test(combined)) return "api_error";
  }

  // Evaluation / review failures → logic_error
  if (combined.includes("evaluation failed") || combined.includes("security review")) {
    return "logic_error";
  }

  if (errors.length > 0) {
    return "logic_error";
  }

  return undefined;
}

// ── Per-turn metrics aggregation ─────────────────────────────────────

/**
 * Build the final `turnMetrics` array from events collected during a session.
 */
export function buildTurnMetricsList(
  rawTurns: ReadonlyArray<{
    turnIndex: number;
    startedAt: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    costUsd: number;
    modelId: string;
  }>
): readonly TurnMetrics[] {
  return rawTurns.map((t) => ({
    turnIndex: t.turnIndex,
    startedAt: t.startedAt,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    thinkingTokens: t.thinkingTokens,
    costUsd: t.costUsd,
    modelId: t.modelId,
  }));
}

/**
 * Build the final `toolCallMetrics` array from tool call timings collected
 * during a session.
 */
export function buildToolCallMetricsList(
  rawCalls: ReadonlyArray<{
    toolName: string;
    toolUseId: string;
    latencyMs: number;
    isError: boolean;
  }>
): readonly ToolCallMetrics[] {
  return rawCalls.map((c) => ({
    toolName: c.toolName,
    toolUseId: c.toolUseId,
    latencyMs: c.latencyMs,
    isError: c.isError,
  }));
}
