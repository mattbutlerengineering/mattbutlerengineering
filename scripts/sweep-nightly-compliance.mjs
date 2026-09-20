#!/usr/bin/env node
/**
 * `node scripts/sweep-nightly-compliance.mjs` — completion sweep for
 * `[nightly-compliance ...]` issues (#5454).
 *
 * Runs right after `nightly-compliance.yml` files (or matches) this run's
 * drift issue. Finds every other OPEN issue labeled `meta-improvement`
 * whose title starts with `[nightly-compliance`, and closes (as
 * `not planned`, with an explanatory comment) any of them whose recorded
 * failures are a subset of — or equal to — this run's failure set: nothing
 * left in them is new or unfixed relative to the current/latest issue.
 *
 * Deliberately dependency-free (only `node:*` builtins + the sibling
 * `lib/nightly-compliance-sweep.mjs`), matching `lib/file-issue-cli.mjs`'s
 * rationale: it runs in a workflow step that has already checked the repo
 * out, no extra install required.
 *
 * Usage:
 *   node scripts/sweep-nightly-compliance.mjs \
 *     --report /tmp/report.md \
 *     --exclude-issue <issueNumber> \
 *     --new-issue-url <url>
 *
 * `--exclude-issue` is the issue number `file-issue-cli.mjs` just
 * created/matched/reopened for *this* run — it is always excluded from the
 * sweep (an issue can't supersede itself), regardless of which of the three
 * actions produced it.
 *
 * Prints one JSON line to stdout: {"closed":[123,124]}
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planSweep } from "./lib/nightly-compliance-sweep.mjs";

const TITLE_PREFIX = "[nightly-compliance";

const FLAGS_WITH_VALUE = new Set(["--report", "--exclude-issue", "--new-issue-url"]);

/**
 * @param {string[]} argv
 * @returns {{ reportPath: string, excludeIssue: number|null, newIssueUrl: string }}
 */
export function parseArgs(argv) {
  const opts = { reportPath: null, excludeIssue: null, newIssueUrl: null };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!FLAGS_WITH_VALUE.has(flag)) {
      throw new Error(`Unknown flag: ${flag}`);
    }
    const value = argv[i + 1];
    i += 1;

    if (flag === "--report") opts.reportPath = value;
    else if (flag === "--exclude-issue") opts.excludeIssue = Number(value);
    else if (flag === "--new-issue-url") opts.newIssueUrl = value;
  }

  if (!opts.reportPath) throw new Error("--report is required");
  if (!opts.newIssueUrl) throw new Error("--new-issue-url is required");

  return opts;
}

/**
 * Builds the explanatory close comment — never a silent close.
 *
 * @param {string} newIssueUrl
 * @returns {string}
 */
export function buildCloseComment(newIssueUrl) {
  return (
    `Superseded by ${newIssueUrl} — every failure recorded in this issue is still ` +
    "present in that newer run's report, so nothing here is new or unfixed. Closing " +
    "as not planned rather than leaving it open indefinitely; if this recurs without " +
    "the newer issue, nightly-compliance will file (or reopen) a fresh one."
  );
}

/**
 * @typedef {Object} SweepCliDeps
 * @property {(path: string) => string} readFile
 * @property {() => Array<{ number: number, title: string, body: string }>} searchOpenIssues
 * @property {(issueNumber: number, comment: string) => void} closeIssue
 */

/**
 * @param {string[]} argv
 * @param {SweepCliDeps} deps
 * @returns {{ closed: number[] }}
 */
export function runSweepCli(argv, deps) {
  const opts = parseArgs(argv);
  const newReport = deps.readFile(opts.reportPath);

  let issues = [];
  try {
    issues = deps.searchOpenIssues();
  } catch (err) {
    // Mirrors file-issue-cli.mjs: a failed search is "nothing to sweep",
    // never a fatal error — this step must never be why the workflow fails.
    // Falls through with `issues` still `[]`, so the sweep below is a no-op.
    process.stderr.write(
      `[sweep-nightly-compliance] search failed, skipping sweep: ${err.message}\n`
    );
  }

  const candidates = issues.filter(
    (issue) => issue.number !== opts.excludeIssue && issue.title.startsWith(TITLE_PREFIX)
  );

  const toClose = planSweep(candidates, newReport);
  const comment = buildCloseComment(opts.newIssueUrl);
  for (const number of toClose) {
    deps.closeIssue(number, comment);
  }

  return { closed: toClose };
}

/** Real deps: raw `gh` CLI via execFileSync — no npm dependencies. */
export function createRealDeps() {
  const run = (args) => execFileSync("gh", args, { encoding: "utf-8", timeout: 30_000 }).trim();

  return {
    readFile: (path) => readFileSync(path, "utf-8"),

    searchOpenIssues() {
      return JSON.parse(
        run([
          "issue",
          "list",
          "--state",
          "open",
          "--label",
          "meta-improvement",
          "--json",
          "number,title,body",
        ])
      );
    },

    closeIssue(issueNumber, comment) {
      run(["issue", "close", String(issueNumber), "--reason", "not planned", "--comment", comment]);
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runSweepCli(process.argv.slice(2), createRealDeps());
  console.log(JSON.stringify(result));
}
