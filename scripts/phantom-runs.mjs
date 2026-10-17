/**
 * phantom-runs.mjs — classifies "phantom" workflow runs (#6344).
 *
 * GITHUB_TOKEN-authored pushes create `pull_request` runs that are parked for
 * approval before any job exists and later resolve to `failure` with
 * `/actions/runs/{id}/jobs` -> `total_count: 0`. They are not CI signal, so any
 * repo-wide failure count must report them separately instead of counting them.
 *
 * A run is phantom only when ALL hold: conclusion is `failure`, the head
 * branch is a bot-authored class, and its job count is a known 0. The branch
 * name alone never decides; an unknown job count is never phantom.
 */

const BOT_BRANCH_PREFIXES = [
  "automation/",
  "changeset-release/",
  "revert-broken-main/",
  "chore/acmm",
];

/** @param {unknown} branch */
export function isBotBranch(branch) {
  return typeof branch === "string" && BOT_BRANCH_PREFIXES.some((p) => branch.startsWith(p));
}

/**
 * @param {{ conclusion?: string|null, headBranch?: string, jobCount?: number|null }} run
 *   `jobCount` is `total_count` from `/actions/runs/{id}/jobs`.
 */
export function isPhantomRun(run) {
  return run?.conclusion === "failure" && isBotBranch(run.headBranch) && run.jobCount === 0;
}

/**
 * @template T
 * @param {T[]} runs
 * @returns {{ counted: T[], phantom: T[] }}
 */
export function partitionPhantomRuns(runs) {
  const phantom = runs.filter((r) => isPhantomRun(r));
  const counted = runs.filter((r) => !isPhantomRun(r));
  return { counted, phantom };
}
