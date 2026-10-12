#!/usr/bin/env node

/**
 * Architecture fitness test: every job in ci.yml whose purpose is to fail
 * the build must be reachable from `ci-gate`'s `needs:` list.
 *
 * `CI Gate` is the only required status check on `main` (see
 * .claude/rules/gotchas.md § CI) — `gh pr merge --auto` waits only on it.
 * A job defined in ci.yml but never added to `ci-gate`'s `needs:` still
 * runs and can still go red, but blocks nothing: it merges invisibly. #5003
 * found `a11y-attribution` (added specifically to fail on accessibility
 * regressions in AI-generated code) sitting in exactly this state — the
 * same shape `visual-tolerance-check` was added to `needs:` to close for
 * its own sibling gap (see the comment above that job in ci.yml).
 *
 * Jobs that are deliberately advisory — not meant to gate a merge — are
 * named in ADVISORY_JOBS below, each with a one-line reason. Any other job
 * defined in ci.yml that `ci-gate` does not depend on fails this check, so
 * the next omission breaks a check instead of being invisible.
 *
 * Being in `needs:` is not sufficient on its own (#5050): `ci-gate` runs
 * with `if: always()`, so a job that's in `needs:` but whose `.result` is
 * never read by the "Check required job results" step's env block / for-loop
 * still lets the gate exit 0 on its failure — invisible in a different way
 * than a job missing from `needs:` entirely, but just as unguarded. This
 * check therefore also requires every non-advisory job in `needs:` to have
 * a `VAR: ${{ needs.<job>.result }}` env entry on that step AND for `$VAR`
 * to be read inside its `for job_result in ...` loop — or for the step to
 * pass `NEEDS_JSON: ${{ toJSON(needs) }}` to scripts/ci-gate-required-results.mjs,
 * which evaluates every job in `needs` (the current, fail-closed form).
 *
 * Usage: node scripts/check-ci-gate-coverage.mjs
 * Exit code: 0 if every non-advisory job is reachable from ci-gate's needs
 * AND evaluated by its result-check loop, 1 otherwise
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";
import { getJob, parseWorkflow } from "./lib/workflow.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CI_WORKFLOW_PATH = join(DEFAULT_ROOT, ".github", "workflows", "ci.yml");

const GATE_JOB_NAME = "ci-gate";

/**
 * Jobs defined in ci.yml that are intentionally NOT in ci-gate's `needs:`.
 * Each entry names why that job's result must never block a PR merge.
 */
export const ADVISORY_JOBS = {
  "report-health":
    "writes CI status to a Cloudflare KV store for dashboards; gated to `github.ref == " +
    "'refs/heads/main'` push runs only, never runs on a PR, and reports informationally " +
    "(if: always()) regardless of upstream results — it has nothing to gate.",
};

/** Every job name defined in ci.yml, in file order. */
export function extractJobNames(content) {
  return Object.keys(parseWorkflow(content).jobs);
}

/** The `needs:` list of `jobName` — scalar, flow, and block forms all resolve to an array. */
export function extractJobNeeds(content, jobName) {
  return getJob(parseWorkflow(content), jobName)?.needs ?? [];
}

const NEEDS_RESULT_REF = /^\$\{\{\s*needs\.([\w-]+)\.result\s*\}\}$/;
const TO_JSON_NEEDS_REF = /^\$\{\{\s*toJSON\(needs\)\s*\}\}$/;

/** Maps shell env-var names to job names via `VAR: ${{ needs.<job>.result }}` entries. */
function extractEnvVarJobMap(step) {
  const map = new Map();
  for (const [name, value] of Object.entries(step.env)) {
    const m = String(value).trim().match(NEEDS_RESULT_REF);
    if (m) map.set(name, m[1]);
  }
  return map;
}

/** Shell env-var names referenced inside a `for job_result in "$A" "$B" ...; do` loop. */
function extractForLoopVarNames(run) {
  const match = run.match(/for\s+\w+\s+in\s+((?:"\$[A-Z_][A-Z0-9_]*"\s*)+);\s*do/);
  if (!match) return [];
  return [...match[1].matchAll(/\$([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]);
}

/** True when the step passes `toJSON(needs)` to ci-gate-required-results.mjs. */
function passesNeedsToModule(step) {
  return (
    TO_JSON_NEEDS_REF.test(String(step.env.NEEDS_JSON ?? "").trim()) &&
    /node scripts\/ci-gate-required-results\.mjs/.test(step.run ?? "")
  );
}

/**
 * Job names in `ci-gate`'s `needs:` whose `.result` is both exposed via an
 * env var on a gate step AND read inside that step's `for job_result in ...`
 * loop — i.e. actually capable of failing the gate, not merely listed in
 * `needs:` (#5050).
 */
export function extractEvaluatedJobs(content) {
  const gate = getJob(parseWorkflow(content), GATE_JOB_NAME);
  if (!gate) return [];
  // Fail-closed form (PR #6077 incident, 2026-10-05): the step hands the
  // whole `needs` context to scripts/ci-gate-required-results.mjs, which
  // evaluates every job in it — so every job in `needs:` is evaluated.
  if (gate.steps.some(passesNeedsToModule)) return gate.needs;

  return gate.steps.flatMap((step) => {
    const envVarToJob = extractEnvVarJobMap(step);
    return extractForLoopVarNames(step.run ?? "")
      .map((varName) => envVarToJob.get(varName))
      .filter(Boolean);
  });
}

/**
 * Pure check: returns job names defined in ci.yml that are neither `ci-gate`
 * itself nor in the advisory allowlist, and that either are missing from its
 * `needs:` list or are present there but never evaluated by its result-check
 * loop (#5050).
 */
export function findUnreachableJobs(content, advisoryJobs = ADVISORY_JOBS) {
  const jobNames = extractJobNames(content);
  const gateNeeds = new Set(extractJobNeeds(content, GATE_JOB_NAME));
  const evaluatedJobs = new Set(extractEvaluatedJobs(content));

  return jobNames.filter((job) => {
    if (job === GATE_JOB_NAME || job in advisoryJobs) return false;
    if (!gateNeeds.has(job)) return true;
    return !evaluatedJobs.has(job);
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-ci-gate-coverage.mjs");

if (isMain) {
  const content = readFileSync(CI_WORKFLOW_PATH, "utf-8");
  const findings = findUnreachableJobs(content);
  const gateNeeds = new Set(extractJobNeeds(content, GATE_JOB_NAME));

  const exitCode = runCheck({
    name: "CI Gate coverage",
    findings,
    formatFinding: (job) =>
      gateNeeds.has(job)
        ? `${job}: in ci-gate's \`needs:\` list but its result is never read by the "Check ` +
          'required job results" env block / for-loop (scripts/check-ci-gate-coverage.mjs)'
        : `${job}: defined in ci.yml but not in ci-gate's \`needs:\` list, and not in ` +
          "ADVISORY_JOBS (scripts/check-ci-gate-coverage.mjs)",
    passMessage:
      "PASS: Every non-advisory job in ci.yml is reachable from ci-gate's needs and " +
      "evaluated by its result-check loop.",
    failMessage:
      "FAIL: Some ci.yml jobs can go red without blocking a PR merge. `CI Gate` is the only\n" +
      "required status check on main (.claude/rules/gotchas.md § CI) — add the job to\n" +
      'ci-gate\'s `needs:` list AND wire its result into the "Check required job results"\n' +
      "env block / for-loop, or add it to ADVISORY_JOBS with a one-line reason if it is\n" +
      "deliberately not a merge gate.",
  });
  process.exit(exitCode);
}
