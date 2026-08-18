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
 * Also owns the publish step's transient/non-transient classification. That
 * started life as an inline `grep -qiE` in `ci.yml` (#4333) and immediately
 * showed why an untested inline regex is the wrong home for a decision:
 * run 32081722175 on PR #4349 had every substantive job green and
 * `OUTCOME: success`, but `gh` printed `unexpected end of JSON input`, which
 * the pattern did not match — so a transport-level failure was classified
 * non-transient, failed fast with no retry, and turned a fully green run
 * red. See {@link isTransientPublishError}.
 *
 * Usage:
 *   node scripts/ci-gate-commit-status.mjs state --outcome success
 *   printf '%s' "$OUTPUT" | node scripts/ci-gate-commit-status.mjs transient
 */

import { readFileSync } from "node:fs";
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

/**
 * Output patterns that mean "the request never got a verdict from GitHub".
 *
 * `unexpected end of JSON input` belongs here because a 4xx rejection always
 * comes back as well-formed JSON carrying a message — a body `gh` cannot
 * parse means a truncated or empty response, which is a transport failure,
 * never a considered refusal.
 */
const TRANSIENT_PUBLISH_PATTERNS = [
  /\(HTTP 5\d{2}\)/i,
  /unexpected end of JSON input/i,
  /timed out/i,
  /could not connect/i,
  /connection reset/i,
  /network is unreachable/i,
];

/**
 * Is this `gh` failure output worth retrying?
 *
 * Fails closed: anything unrecognized — including empty or non-string output
 * — is treated as non-transient, so a genuine rejection still fails fast
 * instead of burning three attempts on a verdict that will not change.
 *
 * @param {unknown} output Combined stdout+stderr from the failed `gh` call.
 * @returns {boolean}
 */
export function isTransientPublishError(output) {
  if (typeof output !== "string" || output === "") return false;
  return TRANSIENT_PUBLISH_PATTERNS.some((pattern) => pattern.test(output));
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

/** Read all of stdin, or "" when there is nothing to read. */
function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand === "state") {
    const outcome = readFlag(rest, "--outcome") ?? "";
    console.log(mapOutcomeToCommitStatusState(outcome));
    return;
  }

  if (subcommand === "transient") {
    // Exit code is the answer, so the workflow can branch on it directly:
    // 0 = retry this, 1 = give up now.
    process.exit(isTransientPublishError(readStdin()) ? 0 : 1);
  }

  console.error(
    "Usage: ci-gate-commit-status.mjs state --outcome <outcome>\n" +
      "       ci-gate-commit-status.mjs transient   (reads gh output on stdin)"
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
