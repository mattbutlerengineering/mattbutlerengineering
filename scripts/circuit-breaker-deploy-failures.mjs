#!/usr/bin/env node

/**
 * circuit-breaker-deploy-failures.mjs — decides how many *deploys* have
 * consecutively failed, for `.github/workflows/circuit-breaker.yml`.
 *
 * The breaker used to count run-level conclusions straight off
 * `gh run list --workflow "Deploy Services" --json conclusion`. A
 * `Deploy Services` run can fail without ever attempting a deployment: its
 * `Wait for CI` job fails when CI on that commit is not green, which leaves
 * `Deploy API Services` as `skipped`. Counting that as a deploy failure
 * conflates "we tried to deploy and it broke" with "we never got as far as
 * deploying", and the breaker then blocks production deploys over an
 * unrelated CI failure.
 *
 * Note what this is NOT: a breaker-blocked run does not accumulate against
 * itself. Measured on run 35152567274 — `Deploy Blocked: success`,
 * `Deploy API Services: skipped`, run conclusion **success**, because the
 * blocked job only echoes a warning and exits 0 and a skipped job does not
 * fail a run. So the old logic *reset* the count on blocked runs rather
 * than compounding them. Treating `skipped` as no-signal removes that
 * false close. The price is stickiness in the other direction: once open,
 * the breaker is escaped by a `force=true` dispatch or by enough later
 * `Deploy Services` runs to scroll the failures out of the `--limit 5`
 * window.
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
 *   [{ "deployJobConclusion": "failure", "verifyJobConclusion": "" },
 *    { "deployJobConclusion": "success", "verifyJobConclusion": "success" }]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The job inside `deploy-services.yml` that performs the actual deployment. */
export const DEPLOY_JOB_NAME = "Deploy API Services";

/**
 * The job that curls production's health endpoints after a deploy.
 *
 * It carries no `continue-on-error` and exits 1 on any non-200, so a deploy
 * that ships and leaves production unhealthy produces
 * `Deploy API Services: success` + `Post-Deploy Verification: failure`.
 * Reading the deploy job alone would classify that as a SUCCESS and reset a
 * genuine failure streak — a deploy circuit breaker exists for precisely
 * that outcome. `post-deploy-check.yml`'s smoke test does not cover the gap
 * either: it is gated `if: github.event.workflow_run.conclusion == 'success'`
 * and is skipped on exactly this run shape.
 */
export const VERIFY_JOB_NAME = "Post-Deploy Verification";

/** Conclusions that mean the deploy job ran and did not succeed. */
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out"]);

/**
 * Classifies one `Deploy Services` run by what it says about deploy health.
 *
 * The deploy job's conclusion decides first; when it succeeded, the verify
 * job gets a veto (see VERIFY_JOB_NAME). A run whose deploy job is
 * `skipped`, absent, or still pending never produced a deployment outcome,
 * so it carries no signal in either direction — deliberately NOT treated as
 * a failure (that is the false-trip bug) and NOT as a success (that would
 * silently reset a genuine failure streak).
 *
 * @param {{deployJobConclusion?: string|null, verifyJobConclusion?: string|null}} run
 * @returns {"deploy-failure" | "deploy-success" | "not-a-deploy"}
 */
export function classifyDeployRun(run) {
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase();

  const deployConclusion = normalize(run?.deployJobConclusion);
  const verifyConclusion = normalize(run?.verifyJobConclusion);

  if (FAILED_CONCLUSIONS.has(deployConclusion)) return "deploy-failure";

  if (deployConclusion === "success") {
    // Shipped, then production failed its own health check. That is a
    // deploy failure in every sense that matters to a breaker.
    if (FAILED_CONCLUSIONS.has(verifyConclusion)) return "deploy-failure";
    return "deploy-success";
  }

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
 * @param {Array<{deployJobConclusion?: string|null, verifyJobConclusion?: string|null}>} runs — newest first
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

  // `process.stdout.write`, not `console.log`: this value is consumed by
  // command substitution in circuit-breaker.yml (`FAIL_COUNT=$(... | node
  // ... count)`), so it is a return value rather than a log line. It also
  // keeps the repo's console.log ratchet flat — the count regressed
  // 715 -> 716 on 328467be5 and reddened main, which is how this was found.
  process.stdout.write(`${countConsecutiveDeployFailures(runs)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
