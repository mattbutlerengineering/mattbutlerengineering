#!/usr/bin/env node

/**
 * circuit-breaker-deploy-failures.mjs — decides how many *deploys* have
 * consecutively failed, for `.github/workflows/circuit-breaker.yml`.
 *
 * The breaker used to count run-level conclusions straight off
 * `gh run list --workflow "Deploy Services" --json conclusion`. A
 * `Deploy Services` run can fail without ever attempting a deployment —
 * its `Wait for CI` job fails when CI on that commit is not green, and its
 * own `Deploy Blocked` path short-circuits when the breaker is already
 * open. Counting those as deploy failures conflates "we tried to deploy and
 * it broke" with "we never got as far as deploying", and the breaker then
 * blocks production deploys over an unrelated CI failure.
 *
 * That is exactly what happened on 2026-09-22 (run 35674731430): the two
 * runs it counted had *different, unrelated* causes — 35654241232 failed at
 * `Wait for CI` and never deployed at all, and 35672268342 failed on DO's
 * side with `BuildJobTerminated` ("terminated… due to resource
 * exhaustion"). The breaker tripped, filed #5659, and blocked deploys while
 * production was healthy and no deploy had actually regressed.
 *
 * Same class as the `ciHealth` sensor's false regressions already recorded
 * in `.claude/rules/gotchas.md`: a signal computed over raw workflow-run
 * counts, with non-outcome conclusions folded into it, reports a problem
 * that is not there. The fix is the same shape — decide on the outcome of
 * the step that actually carries the signal, and treat everything else as
 * carrying none.
 *
 * Usage (from the workflow):
 *   echo "$RUNS_JSON" | node scripts/circuit-breaker-deploy-failures.mjs count
 *
 * where RUNS_JSON is newest-first:
 *   [{ "deployJobConclusion": "failure" }, { "deployJobConclusion": "success" }]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The job inside `deploy-services.yml` that performs the actual deployment. */
export const DEPLOY_JOB_NAME = "Deploy API Services";

/** Conclusions that mean the deploy job ran and did not succeed. */
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out"]);

/**
 * Classifies one `Deploy Services` run by what it says about deploy health.
 *
 * The deploy job's own conclusion is the only authority. A run whose deploy
 * job is `skipped`, absent, or still pending never produced a deployment
 * outcome, so it carries no signal in either direction — deliberately NOT
 * treated as a failure (that is the false-trip bug) and NOT as a success
 * (that would silently reset a genuine failure streak).
 *
 * @param {{deployJobConclusion?: string|null}} run
 * @returns {"deploy-failure" | "deploy-success" | "not-a-deploy"}
 */
export function classifyDeployRun(run) {
  const conclusion = String(run?.deployJobConclusion ?? "")
    .trim()
    .toLowerCase();

  if (FAILED_CONCLUSIONS.has(conclusion)) return "deploy-failure";
  if (conclusion === "success") return "deploy-success";
  return "not-a-deploy";
}

/**
 * Counts consecutive failed deploys, newest first.
 *
 * Stops at the first genuine deploy success — deploy health is proven good
 * from that point back. Runs that never deployed are skipped without
 * breaking the streak: if the newest run died in a pre-deploy gate, the two
 * failed deploys behind it are still the last thing known about deploying.
 *
 * @param {Array<{deployJobConclusion?: string|null}>} runs — newest first
 * @returns {number}
 */
export function countConsecutiveDeployFailures(runs = []) {
  let failures = 0;

  for (const run of runs) {
    const verdict = classifyDeployRun(run);
    if (verdict === "deploy-failure") {
      failures += 1;
    } else if (verdict === "deploy-success") {
      break;
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const subcommand = process.argv[2];

  if (subcommand !== "count") {
    console.error("Usage: circuit-breaker-deploy-failures.mjs count  (runs JSON on stdin)");
    process.exit(1);
  }

  const raw = readStdin().trim();
  let runs;
  try {
    runs = raw ? JSON.parse(raw) : [];
  } catch (err) {
    // Fail loud. A parse error must never silently print 0, which the
    // workflow would read as "deploys are fine".
    console.error(`Could not parse runs JSON from stdin: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(runs)) {
    console.error("Runs JSON must be an array, newest run first.");
    process.exit(1);
  }

  console.log(String(countConsecutiveDeployFailures(runs)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
