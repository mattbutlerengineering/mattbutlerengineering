/**
 * Pure collector for the code-churn sensor.
 *
 * Definition: "churn rate" = lines_deleted_7d / total_lines_added_7d within
 * the rolling 7-day window. Lines deleted within the window are treated as
 * rewrites of recently-introduced code — a proxy for instability.
 *
 * Formula:
 *   churn_rate = min(lines_deleted_7d / total_lines_added_7d, 1.0)
 *
 * Source-instability definition: generated/vendored artifacts are excluded
 * from churn counts. Heavy dependency-bump or deploy-fix activity that
 * regenerates large files (llms.txt, pnpm-lock.yaml, Prisma clients, etc.)
 * should not inflate the churn metric. Use isGeneratedArtifact() as the
 * filter predicate in the numstat parser.
 *
 * Caveat: this metric conflates intentional refactoring and rapid iteration
 * with genuine instability. A high rate during an active feature sprint is
 * expected and should not be treated as a quality regression without examining
 * commit intent. Use alongside CI pass-rate and agent success-rate signals.
 *
 * Extracted as a pure function so it can be unit-tested against fixture data
 * without live git invocations. The caller (sensor-report.mjs) is responsible
 * for running `git log --numstat` and parsing the output into the commit array
 * shape expected here.
 *
 * Input shape: Array<{ hash: string, timestamp: string (ISO), linesAdded: number, linesDeleted: number }>
 */

import { basename } from "node:path";

const WINDOW_DAYS = 7;

// Exact basenames that are always generated artifacts.
const GENERATED_BASENAMES = new Set([
  "llms.txt",
  "llms-full.txt",
  "pnpm-lock.yaml",
  "generated-schemas.ts",
  "dep-graph.json",
  "dependency-graph.md",
  "registry.json",
  "CHANGELOG.md",
]);

/**
 * Returns true when the given file path is a generated or vendored artifact
 * that should be excluded from source-instability churn calculations.
 *
 * Pure function — no filesystem or git calls.
 *
 * @param {string} filePath - Repo-relative or absolute file path.
 * @returns {boolean}
 */
export function isGeneratedArtifact(filePath) {
  const name = basename(filePath);

  // Basename exact-match covers llms.txt, pnpm-lock.yaml, generated-schemas.ts, etc.
  if (GENERATED_BASENAMES.has(name)) return true;

  // Vitest / Jest snapshot files.
  if (name.endsWith(".snap")) return true;

  // Any file nested under a `generated/` directory segment (e.g. Prisma clients).
  if (filePath.includes("/generated/")) return true;

  return false;
}

/**
 * Circuit-breaker threshold for the learning-loop: if churn_rate exceeds
 * this value the sensor report flags a regression. Set conservatively at 0.3
 * (30%) — above this, more than 30% of recently-merged lines were deleted
 * within a week, which warrants investigation.
 */
export const CODE_CHURN_THRESHOLD = 0.3;

/**
 * Compute the code-churn rate from a pre-parsed list of commits.
 *
 * @param {Array<{hash: string, timestamp: string, linesAdded: number, linesDeleted: number}>} commits
 *   Commits in any order; each entry represents one commit's numstat summary.
 * @param {Date} [now] - Reference timestamp (injectable for tests; defaults to current time).
 * @returns {{
 *   available: boolean,
 *   churn_rate?: number,
 *   total_lines_added_7d?: number,
 *   lines_churned_7d?: number,
 *   window_days?: number,
 *   churn_threshold?: number,
 * }}
 */
export function computeCodeChurn(commits, now = new Date()) {
  if (!commits || commits.length === 0) {
    return { available: false };
  }

  const cutoff = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const inWindow = commits.filter((c) => new Date(c.timestamp) >= cutoff);

  if (inWindow.length === 0) {
    return { available: false };
  }

  const totalLinesAdded = inWindow.reduce((sum, c) => sum + (c.linesAdded ?? 0), 0);
  const totalLinesDeleted = inWindow.reduce((sum, c) => sum + (c.linesDeleted ?? 0), 0);

  // Avoid division by zero: if nothing was added, churn rate is 0.
  const churnRate = totalLinesAdded > 0 ? Math.min(totalLinesDeleted / totalLinesAdded, 1.0) : 0;

  return {
    available: true,
    churn_rate: Math.round(churnRate * 1000) / 1000,
    total_lines_added_7d: totalLinesAdded,
    lines_churned_7d: totalLinesDeleted,
    window_days: WINDOW_DAYS,
    churn_threshold: CODE_CHURN_THRESHOLD,
  };
}
