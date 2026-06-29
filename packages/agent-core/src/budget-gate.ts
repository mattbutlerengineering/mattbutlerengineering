import type { TurnMetrics } from "./types.js";

// ── Budget breach result ─────────────────────────────────────────────

export interface BudgetBreachResult {
  /** Whether the accumulated turn costs strictly exceed the budget ceiling. */
  readonly exceeded: boolean;
  /** Sum of all per-turn costUsd values. */
  readonly accumulatedCostUsd: number;
  /** The budget ceiling passed in by the caller. */
  readonly maxBudgetUsd: number;
  /** Amount by which the budget was exceeded (0 when not exceeded). */
  readonly overageUsd: number;
}

// ── Pure predicate ───────────────────────────────────────────────────

/**
 * Pure per-turn budget enforcement predicate.
 *
 * Sums `costUsd` across all completed turns and compares to `maxBudgetUsd`.
 * Returns `exceeded: true` only when the accumulated cost STRICTLY exceeds
 * the ceiling — equality is not a breach (conservative by design).
 *
 * **Session-level enforcement is opt-in** via `SessionConfig.enforceBudget`.
 * The default session-runner behavior is observe/warn only: it emits a
 * `session:budget_breach` event but does NOT halt the session unless
 * `enforceBudget` is explicitly set to `true`.
 */
export function shouldHaltForBudget(
  turnMetrics: readonly TurnMetrics[],
  maxBudgetUsd: number
): BudgetBreachResult {
  const accumulatedCostUsd = turnMetrics.reduce((sum, t) => sum + t.costUsd, 0);
  const exceeded = accumulatedCostUsd > maxBudgetUsd;
  return {
    exceeded,
    accumulatedCostUsd,
    maxBudgetUsd,
    overageUsd: exceeded ? accumulatedCostUsd - maxBudgetUsd : 0,
  };
}
