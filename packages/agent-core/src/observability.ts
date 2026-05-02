import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Span, Tracer } from "@opentelemetry/api";
import type { FailureCategory, TurnMetrics, ToolCallMetrics } from "./types.js";
import type { StuckPatternType } from "./stuck-detector.js";

// ── OTel tracer ──────────────────────────────────────────────────────

export const observabilityTracer: Tracer = trace.getTracer("@mbe/agent-core");

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

// ── OTel decision-point spans ─────────────────────────────────────────

/**
 * Wrap a model-selection call in an OTel span.
 * The span records the resolved tier, model ID, and reason.
 */
export function withModelSelectionSpan<T extends { tier: string; modelId: string; reason: string }>(
  fn: () => T
): T {
  const span: Span = observabilityTracer.startSpan("agent_core.model_selection");
  try {
    const result = fn();
    span.setAttribute("model.tier", result.tier);
    span.setAttribute("model.id", result.modelId);
    span.setAttribute("model.selection_reason", result.reason);
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Wrap a tool-permission check in an OTel span.
 * The span records the tool name and whether it was allowed or denied.
 */
export async function withToolPermissionSpan<T extends { behavior: string }>(
  toolName: string,
  fn: () => Promise<T>
): Promise<T> {
  const span: Span = observabilityTracer.startSpan("agent_core.tool_permission_check");
  span.setAttribute("tool.name", toolName);
  try {
    const result = await fn();
    span.setAttribute("tool.allowed", result.behavior === "allow");
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Wrap a stuck-detection ingestion step in an OTel span.
 * The span records whether a stuck pattern was detected and its type.
 */
export function withStuckDetectionSpan<T extends { type: string; description: string } | null>(
  fn: () => T
): T {
  const span: Span = observabilityTracer.startSpan("agent_core.stuck_detection");
  try {
    const result = fn();
    span.setAttribute("stuck.detected", result !== null);
    if (result !== null) {
      span.setAttribute("stuck.pattern_type", result.type);
      span.setAttribute("stuck.description", result.description);
    }
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Wrap a success-evaluation call in an OTel span.
 * The span records whether the evaluation passed and its confidence.
 */
export async function withSuccessEvaluationSpan<T extends { passed: boolean; confidence: number }>(
  fn: () => Promise<T>
): Promise<T> {
  const span: Span = observabilityTracer.startSpan("agent_core.success_evaluation");
  try {
    const result = await fn();
    span.setAttribute("evaluation.passed", result.passed);
    span.setAttribute("evaluation.confidence", result.confidence);
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end();
  }
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
