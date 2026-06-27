/**
 * Cost eval suite — a fixed, representative task set for tracking cost-per-task
 * trends over time, independent of the pass-rate threshold.
 *
 * Tasks live as JSON in {@link COST_SUITE_DIR}. Use {@link resolveSuitePath} to
 * translate the short name `"cost"` to the directory path before calling `loadSuite`.
 *
 * Suite design:
 *   - Fixed tasks (deterministic selection) — same set every run
 *   - Tight budgets (maxTurns ≤ 20, maxCostUsd ≤ 0.5) — keep per-run cost low
 *   - One task per common category (bugfix, refactor, test-writing)
 *   - All tasks target `packages/agent-core` to minimise fixture setup
 */

/** Relative path (from repo root) to the cost eval suite task directory. */
export const COST_SUITE_DIR = "packages/agent-core/eval-suite/cost";

/** Short-name → relative-path map for built-in named suites. */
const NAMED_SUITES: Readonly<Record<string, string>> = {
  cost: COST_SUITE_DIR,
};

/**
 * Resolves a suite identifier to a relative directory path.
 *
 * Named suites (e.g. `"cost"`) are mapped to their canonical directory.
 * Any other value is returned unchanged so callers can still pass an
 * explicit relative or absolute path.
 */
export function resolveSuitePath(suite: string): string {
  return NAMED_SUITES[suite] ?? suite;
}
