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
 * CLI entry: fetches the run's jobs via `gh api` and prints
 * `smoke_tests_ran_and_failed=true|false`. Degrades to `false` (fail
 * closed) on any fetch/parse error rather than throwing, since "don't
 * assume it's safe to auto-revert" is the safe default either way.
 */
function run() {
  const args = process.argv.slice(2);
  const runIdIdx = args.indexOf("--run-id");
  const runId = runIdIdx !== -1 ? args[runIdIdx + 1] : null;

  if (!runId) {
    console.error("Usage: rollback-smoke-test-gate.mjs --run-id <id>");
    process.exit(1);
  }

  let jobs = [];
  try {
    const response = JSON.parse(
      execFileSync("gh", ["api", `repos/{owner}/{repo}/actions/runs/${runId}/jobs?per_page=100`], {
        encoding: "utf-8",
      })
    );
    jobs = Array.isArray(response.jobs) ? response.jobs : [];
  } catch (error) {
    console.error(`Failed to fetch jobs for run ${runId}: ${error.message}`);
  }

  console.log(`smoke_tests_ran_and_failed=${smokeTestsRanAndFailed(jobs)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
