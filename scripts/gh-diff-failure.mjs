#!/usr/bin/env node

/**
 * gh-diff-failure.mjs — classify a `gh pr diff` failure as "the diff exceeds
 * GitHub's 20000-line cap" vs. any other (genuine) failure (#5156).
 *
 * `auto-review.yml`'s "Get changed files" step ran `gh pr diff --name-only`
 * with no error handling. GitHub's diff endpoint hard-rejects past 20000
 * lines with a `406` carrying the error code `too_large`:
 *
 *   could not find pull request diff: HTTP 406: Sorry, the diff exceeded
 *   the maximum number of lines (20000)
 *   PullRequest.diff too_large
 *
 * That failed the whole "Automated PR Review" job even though the job's own
 * heuristic checks (large files, console.log, TODO comments, secret
 * patterns) have nothing to do with diff *size* — observed on PR #5117,
 * whose ~93K/-5K-line diff (a legitimate bulk llms.txt regen) is exactly
 * the case GitHub's cap exists for.
 *
 * This module is the pure size-vs-other-error decision, unit-tested without
 * any GitHub API calls. The workflow step is a thin wrapper around it: on a
 * non-zero `gh pr diff` exit, it feeds the captured stderr through
 * `isDiffTooLargeError` and only swallows the failure when it matches — any
 * other `gh pr diff` failure (auth, network, 404) still fails the job.
 *
 * Usage:
 *   printf '%s' "$STDERR" | node scripts/gh-diff-failure.mjs is-too-large
 *   (exit 0 = too-large, safe to skip; exit 1 = genuine failure, re-raise)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Patterns that uniquely identify GitHub's diff line-count cap rejection,
 * not a generic 4xx/5xx from `gh pr diff`.
 */
const DIFF_TOO_LARGE_PATTERNS = [/too_large/i, /exceeded the maximum number of lines/i];

/**
 * Was this `gh pr diff` failure caused by GitHub's 20000-line diff cap?
 *
 * Fails closed: empty, non-string, or unrecognized output is treated as NOT
 * the size cap, so a genuine unrelated failure (auth, network, 404) is never
 * silently swallowed — only a confirmed size-cap rejection is.
 *
 * @param {unknown} output Combined stdout+stderr from the failed `gh` call.
 * @returns {boolean}
 */
export function isDiffTooLargeError(output) {
  if (typeof output !== "string" || output === "") return false;
  return DIFF_TOO_LARGE_PATTERNS.some((pattern) => pattern.test(output));
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
  const [subcommand] = process.argv.slice(2);

  if (subcommand === "is-too-large") {
    // Exit code is the answer, so the workflow can branch on it directly.
    process.exit(isDiffTooLargeError(readStdin()) ? 0 : 1);
  }

  console.error("Usage: gh-diff-failure.mjs is-too-large   (reads gh output on stdin)");
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
