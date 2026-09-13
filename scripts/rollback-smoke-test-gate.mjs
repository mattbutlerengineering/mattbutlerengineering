#!/usr/bin/env node

/**
 * scripts/rollback-smoke-test-gate.mjs
 *
 * Interlock for `.github/workflows/auto-rollback.yml`: decides whether a
 * failed "Post-Deploy Check" run represents a genuine smoke-test failure
 * (real regression evidence) or a deploy that could not be verified within
 * its poll budget (no evidence either way).
 *
 * Follow-up to #5006: that PR made post-deploy-check.yml's "Poll for deploy
 * to land" step fail the job on a poll timeout instead of warning and
 * falling through. That was the right fix for post-deploy-check.yml itself,
 * but it exposed a pre-existing blunt trigger in auto-rollback.yml, which
 * reverts on ANY `workflow_run` conclusion of `failure` from "Post-Deploy
 * Check" with no distinction between "smoke tests ran and failed" and "the
 * deploy could not be confirmed live, so smoke tests never ran". After
 * #5006, a slow-but-healthy deploy (propagation > the 6-minute poll budget)
 * now produces exactly the `conclusion: failure` this trigger fires on,
 * which would open a false-positive revert PR against a commit that
 * introduced no defect.
 *
 * `smokeTestsRanAndFailed` is pure and network-free: it takes an
 * already-fetched `jobs` array (the shape returned by `GET
 * /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`) and decides, per job,
 * whether that job's failure is genuine evidence or is fully explained by a
 * poll-timeout skip. Only the "Playwright Smoke Tests" job (post-deploy-
 * check.yml) has this ambiguity — it alone contains a "Poll for deploy to
 * land" step gating a "Run smoke tests" step. The other two post-deploy jobs
 * ("Post-Deploy Smoke Test", "API Surface Invariants") have no such step, so
 * any failure reported there is treated as genuine, preserving the existing
 * rollback coverage for those checks.
 *
 * Fails closed in both directions that matter for auto-rollback safety:
 *   - Ambiguous/malformed input (non-array, missing steps, an absent
 *     "Run smoke tests" step) never counts as a genuine failure — the
 *     revert PR must not fire on data we can't interpret.
 *   - A job with no poll-timeout ambiguity is never suppressed just because
 *     a *different* job happened to fail on a poll timeout — one genuine
 *     failure anywhere in the run is enough.
 *
 * `smokeTestsRanAndFailed` answers "is this failure genuine evidence of
 * anything?". It does NOT answer "did THIS commit cause it?", and on
 * 2026-09-11 that gap opened five false-positive revert PRs (#5200, #5221,
 * #5230, #5238, #5263). `API Surface Invariants` had been red on every
 * deploy since 2026-09-07 -- the /public/v1 ingress defect, which is
 * Pulumi state, not application code -- so each new deploy inherited a
 * standing red and the newest commit was blamed for it. The commits blamed
 * included a Gen playground entry (#5217), a rialto-web example page
 * (#5226), a revert of a revert, and -- #5238 -- the fix to post-deploy-
 * check's own dedupe logic (#5236).
 *
 * A regression is a *transition*, not a state. `isRegressionTransition`
 * adds the missing half: a genuine failure only counts when the same job
 * was demonstrably `success` on the previous completed Post-Deploy Check
 * run for this branch. `shouldAutoRevert` is the conjunction, and is what
 * the workflow gates on.
 *
 * Both fail closed, in the same direction and for the same reason as the
 * original gate: auto-revert is the destructive action, so absence of
 * evidence must never authorize it. No previous run, the job absent from
 * it, or a previous conclusion of anything but `success` (cancelled,
 * skipped, null) all mean "cannot prove this commit caused it" -- and so
 * mean no revert.
 *
 * Usage:
 *   node scripts/rollback-smoke-test-gate.mjs --run-id <id>
 * Prints `smoke_tests_ran_and_failed=true|false` to stdout for the caller
 * to append directly to `$GITHUB_OUTPUT`.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The step that gates whether "Run smoke tests" ran at all (#5006). */
const POLL_STEP_NAME = "Poll for deploy to land";

/** The step whose conclusion is the actual regression signal. */
const SMOKE_TEST_STEP_NAME = "Run smoke tests";

/**
 * @param {{ name?: string, conclusion?: string|null }[]|undefined} steps
 * @param {string} name
 * @returns {{ name?: string, conclusion?: string|null }|undefined}
 */
function findStep(steps, name) {
  return Array.isArray(steps) ? steps.find((step) => step?.name === name) : undefined;
}

/**
 * @param {{ name?: string, conclusion?: string|null, steps?: object[] }} job
 * @returns {boolean}
 */
function isGenuineJobFailure(job) {
  if (job?.conclusion !== "failure") return false;

  const pollStep = findStep(job.steps, POLL_STEP_NAME);
  if (!pollStep) {
    // No poll-timeout ambiguity in this job (e.g. "Post-Deploy Smoke Test",
    // "API Surface Invariants") -- a failure here is always genuine.
    return true;
  }

  if (pollStep.conclusion !== "failure") {
    // Deploy was confirmed; "Run smoke tests" (if it failed) is genuine.
    const testsStep = findStep(job.steps, SMOKE_TEST_STEP_NAME);
    return testsStep?.conclusion === "failure";
  }

  // Poll step itself failed (timeout). The job conclusion is "failure" as a
  // side effect, but only a *failed* (not skipped/cancelled/absent)
  // "Run smoke tests" step counts as genuine evidence -- fail closed.
  const testsStep = findStep(job.steps, SMOKE_TEST_STEP_NAME);
  return testsStep?.conclusion === "failure";
}

/**
 * @param {{ name?: string, conclusion?: string|null, steps?: object[] }[]|undefined} jobs
 * @returns {boolean}
 */
export function smokeTestsRanAndFailed(jobs) {
  if (!Array.isArray(jobs)) return false;
  return jobs.some(isGenuineJobFailure);
}

/**
 * Did any genuinely-failing job in this run go from `success` to `failure`?
 *
 * Pure and network-free. Both arguments take the shape returned by
 * `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`.
 *
 * @param {{ name?: string, conclusion?: string|null, steps?: object[] }[]|undefined} currentJobs
 * @param {{ name?: string, conclusion?: string|null }[]|undefined} previousJobs
 * @returns {boolean}
 */
export function isRegressionTransition(currentJobs, previousJobs) {
  if (!Array.isArray(currentJobs) || !Array.isArray(previousJobs)) return false;

  return currentJobs.filter(isGenuineJobFailure).some((job) => {
    const previous = previousJobs.find((candidate) => candidate?.name === job?.name);
    // Absent from the previous run, or not demonstrably green there
    // (cancelled / skipped / null), is not proof this commit turned it red.
    return previous?.conclusion === "success";
  });
}

/**
 * The decision `.github/workflows/auto-rollback.yml` gates its revert PR on:
 * the failure must be genuine evidence AND newly red on this deploy.
 *
 * @param {{ name?: string, conclusion?: string|null, steps?: object[] }[]|undefined} currentJobs
 * @param {{ name?: string, conclusion?: string|null }[]|undefined} previousJobs
 * @returns {boolean}
 */
export function shouldAutoRevert(currentJobs, previousJobs) {
  return smokeTestsRanAndFailed(currentJobs) && isRegressionTransition(currentJobs, previousJobs);
}

/**
 * Fetch a run's jobs. Returns `[]` on any failure — the callers treat an
 * empty list as "no evidence", which fails closed in both directions.
 *
 * @param {string|number} runId
 * @returns {{ name?: string, conclusion?: string|null, steps?: object[] }[]}
 */
function fetchJobs(runId) {
  try {
    const response = JSON.parse(
      execFileSync("gh", ["api", `repos/{owner}/{repo}/actions/runs/${runId}/jobs?per_page=100`], {
        encoding: "utf-8",
      })
    );
    return Array.isArray(response.jobs) ? response.jobs : [];
  } catch (error) {
    console.error(`Failed to fetch jobs for run ${runId}: ${error.message}`);
    return [];
  }
}

/**
 * The most recent completed run of the same workflow, on the same branch,
 * that finished before this one — the baseline `isRegressionTransition`
 * compares against. `null` when there is no such run (first-ever deploy, or
 * any API failure), which fails closed.
 *
 * Only `success` and `failure` conclusions are considered: a `cancelled` or
 * `skipped` run carries no verdict about production's health, so treating
 * one as the baseline would let a standing red masquerade as newly red.
 *
 * @param {string} runId
 * @returns {{ id: number }|null}
 */
function findPreviousRun(runId) {
  try {
    const current = JSON.parse(
      execFileSync("gh", ["api", `repos/{owner}/{repo}/actions/runs/${runId}`], {
        encoding: "utf-8",
      })
    );
    const runs = JSON.parse(
      execFileSync("gh", [
        "api",
        `repos/{owner}/{repo}/actions/workflows/${current.workflow_id}/runs` +
          `?branch=${encodeURIComponent(current.head_branch)}&status=completed&per_page=50`,
      ]).toString()
    );

    const candidates = (Array.isArray(runs.workflow_runs) ? runs.workflow_runs : [])
      .filter((run) => run?.id !== current.id)
      .filter((run) => run?.conclusion === "success" || run?.conclusion === "failure")
      .filter((run) => Date.parse(run?.created_at) < Date.parse(current.created_at))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return candidates[0] ?? null;
  } catch (error) {
    console.error(`Failed to resolve the previous run for ${runId}: ${error.message}`);
    return null;
  }
}

/**
 * CLI entry: resolves this run's jobs and the previous completed run's jobs,
 * then prints the three decisions for the caller to append directly to
 * `$GITHUB_OUTPUT`:
 *
 *   smoke_tests_ran_and_failed=  is the failure genuine evidence at all
 *   regression_transition=       did a genuine failure go success -> failure
 *   should_auto_revert=          both of the above (what the workflow gates on)
 *
 * Degrades to `false` on any fetch/parse error rather than throwing, since
 * "don't assume it's safe to auto-revert" is the safe default either way.
 */
function run() {
  const args = process.argv.slice(2);
  const runIdIdx = args.indexOf("--run-id");
  const runId = runIdIdx !== -1 ? args[runIdIdx + 1] : null;

  if (!runId) {
    console.error("Usage: rollback-smoke-test-gate.mjs --run-id <id>");
    process.exit(1);
  }

  const currentJobs = fetchJobs(runId);
  const previousRun = findPreviousRun(runId);
  const previousJobs = previousRun ? fetchJobs(previousRun.id) : [];

  const genuine = smokeTestsRanAndFailed(currentJobs);
  const transition = isRegressionTransition(currentJobs, previousJobs);

  console.error(
    previousRun
      ? `Baseline: run ${previousRun.id} (${previousRun.conclusion}).`
      : "Baseline: none found — failing closed, no revert."
  );
  if (genuine && !transition) {
    console.error(
      "Failure is genuine but was already red on the baseline run — a standing " +
        "failure, not a regression this commit introduced. No revert."
    );
  }

  // One emit, not three: the AI-antipattern ratchet counts console.log
  // occurrences, and three lines of one output block is one write.
  console.log(
    [
      `smoke_tests_ran_and_failed=${genuine}`,
      `regression_transition=${transition}`,
      `should_auto_revert=${shouldAutoRevert(currentJobs, previousJobs)}`,
    ].join("\n")
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
