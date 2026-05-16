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
 *      `gh run list --workflow=ci.yml --branch=main --limit=N --json …`.
 *   2. A "flake" is a `headSha` that produced both a failed and a successful
 *      run (across attempts). The ratio of such SHAs to total SHAs over the
 *      last 30 days is the flake rate.
 *   3. The ratio is reported, never enforced — observability first.
 *
 * Failure modes are non-fatal: if `gh` is missing or returns nothing, the
 * caller logs a warning and skips reporting rather than aborting the audit.
 */

import { execFileSync } from "node:child_process";

const DEFAULT_WORKFLOW = "ci.yml";
const DEFAULT_BRANCH = "main";
const DEFAULT_LIMIT = 100;
const WINDOW_DAYS = 30;

/**
 * Compute flake rate from a flat list of run records.
 *
 * @param {Array<{ headSha: string, conclusion: string, createdAt: string }>} runs
 * @param {{ now?: Date, windowDays?: number }} [opts]
 * @returns {{ flake_rate_30d: number, flake_sample_size: number, flaky_shas: string[] }}
 *   - `flake_rate_30d`: ratio in [0, 1] (NaN-safe; 0 when sample size 0)
 *   - `flake_sample_size`: count of distinct SHAs in window
 *   - `flaky_shas`: SHAs that flipped outcome at least once (sorted)
 */
export function computeFlakeRate(runs, opts = {}) {
  const now = opts.now ?? new Date();
  const windowMs = (opts.windowDays ?? WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;

  const inWindow = runs.filter((r) => {
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && t >= cutoff;
  });

  // headSha → set of distinct conclusions seen
  const shaOutcomes = new Map();
  for (const r of inWindow) {
    if (!r.headSha || !r.conclusion) continue;
    const set = shaOutcomes.get(r.headSha) ?? new Set();
    set.add(r.conclusion);
    shaOutcomes.set(r.headSha, set);
  }

  const flaky = [];
  for (const [sha, outcomes] of shaOutcomes) {
    if (outcomes.has("success") && outcomes.has("failure")) flaky.push(sha);
  }
  flaky.sort();

  const sample = shaOutcomes.size;
  const rate = sample === 0 ? 0 : flaky.length / sample;

  return {
    flake_rate_30d: rate,
    flake_sample_size: sample,
    flaky_shas: flaky,
  };
}

/**
 * Fetch raw CI run data via `gh run list`.
 *
 * Returns `null` (not an empty array) on any failure so callers can
 * distinguish "no signal" from "tool unavailable" and skip reporting.
 *
 * @param {{ workflow?: string, branch?: string, limit?: number, ghBin?: string }} [opts]
 * @returns {Array<{ headSha: string, conclusion: string, createdAt: string }> | null}
 */
export function fetchRuns(opts = {}) {
  const workflow = opts.workflow ?? DEFAULT_WORKFLOW;
  const branch = opts.branch ?? DEFAULT_BRANCH;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const ghBin = opts.ghBin ?? "gh";

  try {
    const stdout = execFileSync(
      ghBin,
      [
        "run",
        "list",
        `--workflow=${workflow}`,
        `--branch=${branch}`,
        `--limit=${limit}`,
        "--json",
        "headSha,conclusion,createdAt,attempt,databaseId",
      ],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        headSha: String(r.headSha ?? ""),
        conclusion: String(r.conclusion ?? ""),
        createdAt: String(r.createdAt ?? ""),
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
