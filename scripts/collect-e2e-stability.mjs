/**
 * Pure collector for E2E stability metric.
 *
 * Tracks consecutive E2E failures across runs that do NOT touch the frontend.
 * The #1968 pattern — backend-only changes failing unrelated E2E suites — signals
 * an unstable ENVIRONMENT, not a real regression. This sensor surfaces the trend
 * for reporting only; it does NOT auto-block merges.
 *
 * "Frontend" paths: `apps/**` or `packages/rialto/**`.
 * All other changed paths are classified as backend/non-frontend.
 *
 * Input shape:
 *   Array<{
 *     sha: string,           // commit SHA
 *     conclusion: string,    // "success" | "failure" | "cancelled" | "skipped" | null
 *     changedPaths: string[], // file paths changed in this run's associated PR/commit
 *     headRefName: string,   // branch name (informational)
 *     createdAt: string,     // ISO 8601 timestamp — used for ordering
 *   }>
 *
 * Output shape:
 *   { available: false }
 *   OR
 *   {
 *     available: true,
 *     consecutive_failures: number,
 *     total_runs: number,
 *     total_non_frontend_runs: number,
 *     summary: string,       // human-readable one-liner
 *   }
 */

/** Path prefixes that classify a run as "frontend". */
const FRONTEND_PREFIXES = ["apps/", "packages/rialto/"];

/**
 * Returns true when any changed path touches the frontend layer.
 *
 * @param {string[]} changedPaths
 * @returns {boolean}
 */
function isFrontendRun(changedPaths) {
  return changedPaths.some((p) => FRONTEND_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

/**
 * Count consecutive E2E failures in non-frontend runs, from most recent backward.
 * Runs with conclusion "cancelled" or "skipped" (or null) are skipped — they do
 * not reset the streak nor contribute to it.
 *
 * @param {Array<{ sha: string, conclusion: string, changedPaths: string[], headRefName: string, createdAt: string }> | null} runs
 * @returns {object}
 */
export function computeE2eStability(runs) {
  if (!runs || runs.length === 0) {
    return { available: false };
  }

  // Sort by createdAt descending (most recent first) — immutable copy.
  const sorted = [...runs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Filter to non-frontend runs.
  const nonFrontend = sorted.filter((r) => !isFrontendRun(r.changedPaths));

  if (nonFrontend.length === 0) {
    return { available: false };
  }

  // Count consecutive failures from the top of the sorted list.
  // Skip cancelled/skipped/null — they don't count as pass or fail.
  let consecutiveFailures = 0;
  for (const run of nonFrontend) {
    if (run.conclusion === "failure") {
      consecutiveFailures++;
    } else if (run.conclusion === "success") {
      break;
    }
    // cancelled / skipped / null → skip (continue without incrementing or breaking)
  }

  const summary =
    consecutiveFailures === 0
      ? `E2E stable: no consecutive failures on non-frontend runs (${nonFrontend.length} runs checked)`
      : `E2E instability: ${consecutiveFailures} consecutive failure(s) on non-frontend runs — likely environment issue, not a regression`;

  return {
    available: true,
    consecutive_failures: consecutiveFailures,
    total_runs: runs.length,
    total_non_frontend_runs: nonFrontend.length,
    summary,
  };
}
