#!/usr/bin/env node
/**
 * Reports the outcome of the daily synthetic venue-onboarding journey.
 *
 * Reads the JSON report written by
 * apps/hospitality/e2e/journeys/venue-journey.spec.ts and:
 *   1. writes a per-step-timings job summary (always — green or not),
 *   2. files/comment-bumps ONE deduped `audit` + `ready` issue on hard failure,
 *   3. appends a dated entry to the single rolling `audit` friction-log issue
 *      when the run was green but slow or console-noisy.
 *
 * A fully green, friction-free run files nothing. All formatting/dedupe logic
 * is the pure, unit-tested module in ./report.mjs — this file is I/O glue.
 *
 * Usage: node scripts/venue-journey/file-issues.mjs <report.json>
 * Requires: GH_TOKEN with issues:write (for `gh`).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  buildFailureIssue,
  buildFrictionEntry,
  buildJobSummary,
  findDuplicateIssue,
  FRICTION_ISSUE_TITLE,
  redactSecrets,
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

/** Error text for a log line. A `gh` failure echoes its argv, so redact. */
function message(err) {
  return redactSecrets(err instanceof Error ? err.message : String(err));
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

  const failure = buildFailureIssue(report);
  const friction = buildFrictionEntry(report);
  if (!failure && !friction) {
    log("::notice::Journey green with no friction — no issues filed.");
    return;
  }

  // A `gh` outage must never turn a GREEN journey red. When there is a hard
  // failure to report, filing is load-bearing and errors propagate; when the
  // only thing to file is the advisory friction log, they degrade to warnings.
  let openIssues;
  try {
    openIssues = listOpenAuditIssues();
  } catch (err) {
    if (failure) throw err;
    log(`::warning::Could not list open audit issues — friction log not updated: ${message(err)}`);
    return;
  }

  if (failure) {
    fileOrBump({ openIssues, ...failure });
  }

  // Friction is advisory: one rolling log issue, `audit` only (never `ready`),
  // so it never enters the implement-queue as actionable work on its own.
  if (friction) {
    try {
      fileOrBump({
        openIssues,
        title: FRICTION_ISSUE_TITLE,
        searchPhrase: FRICTION_ISSUE_TITLE,
        body: `Rolling log of soft friction seen by the daily venue-onboarding journey (.github/workflows/venue-journey.yml). Not individually actionable — read it for trends.\n\n${friction}`,
        commentBody: friction,
        labels: ["audit"],
      });
    } catch (err) {
      log(`::warning::Could not update the friction log: ${message(err)}`);
    }
  }
}

main();
