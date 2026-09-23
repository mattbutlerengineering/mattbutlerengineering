#!/usr/bin/env node
/**
 * Reports the outcome of the daily synthetic venue-onboarding journey.
 *
 * Reads the JSON report written by
 * apps/hospitality/e2e/journeys/venue-journey.spec.ts and:
 *   1. writes a per-step-timings job summary (always — green or not), which
 *      includes a "Friction" section when the run was slow or console-noisy
 *      (#3547 — soft friction used to also get a comment on a rolling
 *      GitHub issue; 60+ comments on one issue was noise nobody read, so it
 *      now lives only in the job summary),
 *   2. files/comment-bumps ONE deduped `audit` + `ready` issue on hard failure,
 *      or an `audit` + `ready-for-human` one when a step was `blocked` on an
 *      unset credential instead (#4527).
 *
 * A fully green run (friction or not) files no issue. All formatting/dedupe
 * logic is the pure, unit-tested module in ./report.mjs — this file is I/O
 * glue.
 *
 * Usage: node scripts/venue-journey/file-issues.mjs <report.json>
 * Requires: GH_TOKEN with issues:write (for `gh`) — still needed for the
 * hard-failure/blocked path above.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  buildBlockedIssue,
  buildFailureIssue,
  buildJobSummary,
  findDuplicateIssue,
} from "./report.mjs";

/** Runs `gh` with argv-array arguments (never a shell string). */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8" });
}

/** Open `audit` issues, used for client-side dedupe (search index lags). */
function listOpenAuditIssues() {
  const raw = gh([
    "issue",
    "list",
    "--label",
    "audit",
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,body",
  ]);
  return JSON.parse(raw);
}

function writeSummary(markdown) {
  const target = process.env["GITHUB_STEP_SUMMARY"];
  if (target) {
    appendFileSync(target, `${markdown}\n`);
  } else {
    process.stdout.write(`${markdown}\n`);
  }
}

/** Emits a GitHub Actions workflow-command line to the job log. */
function log(line) {
  process.stdout.write(`${line}\n`);
}

/** Creates the issue, or comments on the existing duplicate. */
function fileOrBump({ openIssues, title, searchPhrase, body, commentBody, labels }) {
  const duplicate = findDuplicateIssue(openIssues, { title, searchPhrase });
  if (duplicate !== null) {
    gh(["issue", "comment", String(duplicate), "--body", commentBody]);
    log(`::notice::Bumped existing issue #${duplicate}: ${title}`);
    return;
  }
  const labelArgs = labels.flatMap((label) => ["--label", label]);
  gh(["issue", "create", "--title", title, "--body", body, ...labelArgs]);
  log(`::notice::Filed issue: ${title}`);
}

function main() {
  const reportPath = process.argv[2];
  if (!reportPath || !existsSync(reportPath)) {
    log(`::warning::No journey report at ${reportPath ?? "(no path given)"} — nothing to report.`);
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8"));
  writeSummary(buildJobSummary(report));

  // Precedence: a hard failure is a product regression and outranks a step
  // that could not run. Both share the step signature, so whichever is filed
  // comment-bumps the same issue on a recurrence, and the step table in either
  // body shows the other's state anyway. A green run — friction or not, the
  // job summary above already carries the friction section — files nothing.
  const issue = buildFailureIssue(report) ?? buildBlockedIssue(report);
  if (!issue) {
    log("::notice::Journey green — no issues filed.");
    return;
  }

  const openIssues = listOpenAuditIssues();
  fileOrBump({ openIssues, ...issue });
}

main();
