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
 * Usage: node scripts/check-ci-gate-coverage.mjs
 * Exit code: 0 if every non-advisory job is reachable from ci-gate's needs, 1 otherwise
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

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

/** Returns the `jobs:` block's raw text (everything after the top-level `jobs:` key). */
function jobsBlock(content) {
  const match = content.match(/^jobs:\n([\s\S]*)$/m);
  return match ? match[1] : "";
}

/** Top-level (2-space-indented) job header matches within a `jobs:` block. */
function jobHeaders(block) {
  return [...block.matchAll(/^ {2}([\w-]+):\s*$/gm)];
}

/** Every job name defined in ci.yml, in file order. */
export function extractJobNames(content) {
  return jobHeaders(jobsBlock(content)).map((m) => m[1]);
}

/** The raw body text (everything between one job header and the next) for `jobName`. */
function extractJobBody(content, jobName) {
  const block = jobsBlock(content);
  const headers = jobHeaders(block);
  const index = headers.findIndex((m) => m[1] === jobName);
  if (index === -1) return "";

  const start = headers[index].index + headers[index][0].length;
  const end = index + 1 < headers.length ? headers[index + 1].index : block.length;
  return block.slice(start, end);
}

/** The `needs:` list of `jobName` — supports bracketed, block-list, and inline-scalar forms. */
export function extractJobNeeds(content, jobName) {
  const jobBody = extractJobBody(content, jobName);

  const bracketMatch = jobBody.match(/^\s*needs:\s*\n?\s*\[([\s\S]*?)\]/m);
  if (bracketMatch) {
    return bracketMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const blockMatch = jobBody.match(/^\s*needs:\s*\n((?:\s*-\s*[\w-]+\n?)+)/m);
  if (blockMatch) {
    return [...blockMatch[1].matchAll(/-\s*([\w-]+)/g)].map((m) => m[1]);
  }

  const inlineMatch = jobBody.match(/^\s*needs:\s*([\w-]+)\s*$/m);
  return inlineMatch ? [inlineMatch[1]] : [];
}

/**
 * Pure check: returns job names defined in ci.yml that are neither `ci-gate`
 * itself, in its `needs:` list, nor in the advisory allowlist.
 */
export function findUnreachableJobs(content, advisoryJobs = ADVISORY_JOBS) {
  const jobNames = extractJobNames(content);
  const gateNeeds = new Set(extractJobNeeds(content, GATE_JOB_NAME));

  return jobNames.filter(
    (job) => job !== GATE_JOB_NAME && !gateNeeds.has(job) && !(job in advisoryJobs)
  );
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-ci-gate-coverage.mjs");

if (isMain) {
  const content = readFileSync(CI_WORKFLOW_PATH, "utf-8");
  const findings = findUnreachableJobs(content);

  const exitCode = runCheck({
    name: "CI Gate coverage",
    findings,
    formatFinding: (job) =>
      `${job}: defined in ci.yml but not in ci-gate's \`needs:\` list, and not in ` +
      "ADVISORY_JOBS (scripts/check-ci-gate-coverage.mjs)",
    passMessage: "PASS: Every non-advisory job in ci.yml is reachable from ci-gate's needs.",
    failMessage:
      "FAIL: Some ci.yml jobs can go red without blocking a PR merge. `CI Gate` is the only\n" +
      "required status check on main (.claude/rules/gotchas.md § CI) — add the job to\n" +
      "ci-gate's `needs:` list, or to ADVISORY_JOBS with a one-line reason if it is\n" +
      "deliberately not a merge gate.",
  });
  process.exit(exitCode);
}
