#!/usr/bin/env node

/**
 * ci-gate-commit-status.mjs — map the `CI Gate` job's step outcome to a
 * GitHub commit-status `state` (#4025).
 *
 * `ci.yml`'s `CI Gate` job is the sole required *check run* on `main`, but
 * check runs produced by a `workflow_dispatch`-triggered run are invisible
 * to `statusCheckRollup` and to branch protection's merge evaluation — see
 * `scripts/ci-gate-status.mjs`'s `gate-unattributed` state and #4025's
 * measurement on PR #4011: a dispatch-produced `CI Gate: success` check run
 * existed on the head SHA, `gh pr merge --auto` was accepted, and the PR
 * still sat `mergeStateStatus=BLOCKED` for 6+ minutes. Never merged.
 *
 * Commit *statuses* (`POST /repos/{owner}/{repo}/statuses/{sha}`), unlike
 * check runs, surface in `statusCheckRollup` and in the required-status
 * evaluation regardless of which event produced them. `ci.yml`'s `CI Gate`
 * job publishes one, named `CI Gate`, on every conclusion it can reach —
 * this module is the pure conclusion -> state mapping, unit-tested without
 * any GitHub API calls. The workflow step is a thin CLI wrapper around it.
 *
 * Must cover cancellation too: a red/cancelled CI run must never leave a
 * stale *green* `CI Gate` status sitting on a commit — GitHub's status API
 * has no "success"/"failure"/"error" ambiguity tolerance, so `cancelled`
 * (and anything unrecognized) maps to `error`, never `success`.
 *
 * Usage:
 *   node scripts/ci-gate-commit-status.mjs state --outcome success
 */

import { fileURLToPath } from "node:url";

/** GitHub commit-status states this module ever emits. */
export const COMMIT_STATUS_STATES = ["success", "failure", "error"];

/**
 * Pure mapping from a GitHub Actions step `outcome` (or `conclusion`) to the
 * commit-status `state` to publish for `CI Gate`.
 *
 * @param {string} outcome - e.g. "success", "failure", "cancelled", "skipped".
 * @returns {"success" | "failure" | "error"}
 */
export function mapOutcomeToCommitStatusState(outcome) {
  switch (outcome) {
    case "success":
      return "success";
    case "failure":
      return "failure";
    default:
      // "cancelled", "skipped" (shouldn't happen for an always()-run step),
      // or anything unrecognized — fail closed, never report green.
      return "error";
  }
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand !== "state") {
    console.error("Usage: ci-gate-commit-status.mjs state --outcome <outcome>");
    process.exit(1);
  }

  const outcome = readFlag(rest, "--outcome") ?? "";
  console.log(mapOutcomeToCommitStatusState(outcome));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
