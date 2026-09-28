/**
 * CI flake-rate measurement for ACMM behavioral signal (issue #646).
 *
 * Test-signal quality is the #1 blocker for AI autonomy: if `pnpm test` fails
 * randomly, an agent can't distinguish regression from flake. ACMM normally
 * checks whether `vitest.config.ts` exists; this script measures whether the
 * suite *gives reliable signal*.
 *
 * Approach:
 *   1. Query the last N completed runs of the CI workflow on `main` via
 *      `gh run list --workflow=ci.yml --branch=main --created=">=<date>"
 *      --limit=N --json …`, bounded to a real N-day window rather than
 *      whatever `--limit` happens to reach back to (#5852 AC7).
 *   2. A "flake" is a `headSha` that either (a) produced both a failed and a
 *      successful run across attempts, OR (b) has any run with `attempt > 1`
 *      whose own conclusion is `success` — a rerun-to-green, the shape a
 *      single-attempt-per-SHA sample can't see at all (#5852 AC8).
 *   3. The ratio is reported, never enforced — observability first.
 *
 * Failure modes are non-fatal: if `gh` is missing or returns nothing, the
 * caller logs a warning and skips reporting rather than aborting the audit.
 */

import { execFileSync } from "node:child_process";

const DEFAULT_WORKFLOW = "ci.yml";
const DEFAULT_BRANCH = "main";
const DEFAULT_LIMIT = 1000;
const WINDOW_DAYS = 30;
const MIN_SAMPLE = 5;

/**
 * Compute flake rate from a flat list of run records.
 *
 * A SHA counts as flaky when either:
 *   - across its runs, both `success` and `failure` conclusions appear, OR
 *   - any one of its runs has `attempt > 1` (a rerun) whose own conclusion is
 *     `success` — a rerun-to-green. Without this, a workflow that reruns a
 *     failed job to green shows `gh run list` exactly one record per SHA (its
 *     latest attempt), so the flip is invisible to outcome-set comparison
 *     alone (#5852 AC8).
 *
 * @param {Array<{ headSha: string, conclusion: string, createdAt: string, attempt?: number }>} runs
 * @param {{ now?: Date, windowDays?: number, minSample?: number }} [opts]
 * @returns {{ flake_rate_30d: number, flake_sample_size: number, flaky_shas: string[], insufficient_data: boolean, oldest_record_at: string|null }}
 *   - `flake_rate_30d`: ratio in [0, 1] (NaN-safe; 0 when sample size 0)
 *   - `flake_sample_size`: count of distinct SHAs in window
 *   - `flaky_shas`: SHAs that flipped outcome (or reran to green), sorted
 *   - `insufficient_data`: true when the sample is below MIN_SAMPLE
 *   - `oldest_record_at`: oldest `createdAt` in the FULL `runs` input, so
 *     truncation by `--limit` is visible even though it isn't reflected in
 *     `flake_sample_size` (which counts distinct SHAs, not raw records)
 */
export function computeFlakeRate(runs, opts = {}) {
  const now = opts.now ?? new Date();
  const windowMs = (opts.windowDays ?? WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  const minSample = opts.minSample ?? MIN_SAMPLE;

  const inWindow = runs.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t >= cutoff;
  });

  // headSha → { outcomes: set of distinct conclusions, rerunToGreen: bool }
  const shaInfo = new Map();
  for (const r of inWindow) {
    if (!r.headSha || !r.conclusion) continue;
    const info = shaInfo.get(r.headSha) ?? { outcomes: new Set(), rerunToGreen: false };
    info.outcomes.add(r.conclusion);
    if (Number(r.attempt) > 1 && r.conclusion === "success") info.rerunToGreen = true;
    shaInfo.set(r.headSha, info);
  }

  const flaky = [];
  for (const [sha, info] of shaInfo) {
    const flippedOutcome = info.outcomes.has("success") && info.outcomes.has("failure");
    if (flippedOutcome || info.rerunToGreen) flaky.push(sha);
  }
  flaky.sort();

  const sample = shaInfo.size;
  const rate = sample === 0 ? 0 : flaky.length / sample;

  return {
    flake_rate_30d: rate,
    flake_sample_size: sample,
    flaky_shas: flaky,
    insufficient_data: sample < minSample,
    oldest_record_at: oldestTimestamp(runs),
  };
}

/** @param {Array<{createdAt: string}>} records */
function oldestTimestamp(records) {
  let oldest = null;
  for (const r of records) {
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t)) continue;
    if (oldest === null || t < oldest) oldest = t;
  }
  return oldest === null ? null : new Date(oldest).toISOString();
}

/**
 * Build the `gh run list` args for a date-bounded fetch. Extracted so tests
 * can assert the date bound without shelling out (#5852 AC7).
 *
 * @param {{ workflow?: string, branch?: string, limit?: number, windowDays?: number, now?: Date }} [opts]
 */
export function buildRunListArgs(opts = {}) {
  const workflow = opts.workflow ?? DEFAULT_WORKFLOW;
  const branch = opts.branch ?? DEFAULT_BRANCH;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowDays = opts.windowDays ?? WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return [
    "run",
    "list",
    `--workflow=${workflow}`,
    `--branch=${branch}`,
    "--created",
    `>=${since}`,
    `--limit=${limit}`,
    "--json",
    "headSha,conclusion,createdAt,attempt,databaseId",
  ];
}

/**
 * Fetch raw CI run data via `gh run list`.
 *
 * Returns `null` (not an empty array) on any failure so callers can
 * distinguish "no signal" from "tool unavailable" and skip reporting.
 *
 * @param {{ workflow?: string, branch?: string, limit?: number, ghBin?: string, windowDays?: number, now?: Date }} [opts]
 * @returns {Array<{ headSha: string, conclusion: string, createdAt: string, attempt: number }> | null}
 */
export function fetchRuns(opts = {}) {
  const ghBin = opts.ghBin ?? "gh";

  try {
    const stdout = execFileSync(ghBin, buildRunListArgs(opts), {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        headSha: String(r.headSha ?? ""),
        conclusion: String(r.conclusion ?? ""),
        createdAt: String(r.createdAt ?? ""),
        attempt: Number(r.attempt ?? 1),
      }));
  } catch {
    return null;
  }
}

/**
 * Top-level convenience: fetch + compute. Returns `null` if `gh` failed.
 *
 * @param {{ workflow?: string, branch?: string, limit?: number, ghBin?: string, now?: Date, windowDays?: number }} [opts]
 * @returns {ReturnType<typeof computeFlakeRate> | null}
 */
export function measureFlakeRate(opts = {}) {
  const runs = fetchRuns(opts);
  if (runs === null) return null;
  return computeFlakeRate(runs, opts);
}
