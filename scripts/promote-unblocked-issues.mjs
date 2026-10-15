#!/usr/bin/env node

/**
 * promote-unblocked-issues.mjs — promote a blocked issue to `ready` the
 * moment every one of its `Depends on: #N` blockers closes (#6635).
 *
 * `scheduled-issue-completion.yml` only promotes issues to `ready` every
 * 12 h, and only when no issue is already `ready` at all (see that
 * workflow's own comment). Measured during the localization feature run
 * (2026-10-13/14, PR #6591): the breakdown became 19 issues (#6612-#6630)
 * chained by `Depends on: #N`, so a dependent item could wait up to 12 h —
 * or indefinitely while other work stayed `ready` — after its blocker
 * merged, and independent items couldn't fan out across `/implement-queue`
 * workers promptly.
 *
 * This script is the event-driven complement: `.github/workflows/
 * promote-unblocked-issues.yml` runs it on every `issues: closed` and
 * `pull_request: closed` event, so a dependent issue is promoted within
 * seconds of its last blocker closing, instead of on the next 12 h tick.
 *
 * GitHub's Issues REST API (`GET /repos/{owner}/{repo}/issues/{number}`)
 * answers for pull requests too — a PR's `state` is `"closed"` whether it
 * merged or was closed unmerged, which is exactly the "closed (an issue or
 * a merged/closed PR)" semantics this issue's body specifies. So building
 * `closedNumbers` from that one endpoint, for both issue and PR blocker
 * numbers, is sufficient — no separate PR-specific lookup is needed, and no
 * `pull-requests` permission scope either (see `check-workflow-pr-scope.mjs`
 * in `.claude/rules/gotchas.md` § CI).
 *
 * Design mirrors `scripts/rescue-automation-prs.mjs`: a pure selection
 * function (`findPromotable`), unit-tested without the network
 * (`scripts/__tests__/promote-unblocked-issues.test.mjs`), an orchestration
 * function (`runPromote`) with every GitHub call behind an injected
 * callback, and a thin CLI below wiring those callbacks to `gh api` REST
 * calls — never a GraphQL-backed `gh issue`/`gh pr` subcommand, so this also
 * runs from a Claude Code Remote session for the dry-run (see
 * `.claude/rules/gotchas.md` § Claude Code Remote).
 *
 * Usage:
 *   node scripts/promote-unblocked-issues.mjs
 *   node scripts/promote-unblocked-issues.mjs --dry-run
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Labels that mean "this issue is already in, or past, the ready queue" —
 * promoting it again would be a no-op at best and a label race at worst.
 * `tracking` is excluded because a tracking/parent issue is never meant to
 * be worked by `/implement-queue` directly.
 */
export const PROMOTION_BLOCKING_LABELS = ["ready", "in-progress", "has-pr", "blocked", "tracking"];

/** A `Depends on: #N` (or `- Depends on: #N, #M`) line, case-insensitive. */
const DEPENDS_ON_LINE_RE = /^\s*[-*]?\s*depends on:\s*(.+)$/im;

/**
 * Pure: extracts the distinct blocker issue/PR numbers an issue body
 * declares via one or more `Depends on: #N` lines.
 *
 * A line with no `#<digits>` after it (`Depends on: none`, `Depends on:
 * TBD`) is malformed per the acceptance criteria and contributes nothing —
 * it is not treated as a parse error, just as "no blocker on this line".
 * Multiple blockers may appear on one line (`Depends on: #10, #11`) or
 * across separate lines; both are merged into one de-duplicated, ordered
 * list.
 *
 * @param {unknown} body
 * @returns {number[]}
 */
export function extractDependsOnNumbers(body) {
  if (typeof body !== "string") return [];

  const numbers = [];
  const seen = new Set();

  for (const line of body.split(/\r?\n/)) {
    const match = line.match(DEPENDS_ON_LINE_RE);
    if (!match) continue;
    for (const hashMatch of match[1].matchAll(/#(\d+)/g)) {
      const n = Number(hashMatch[1]);
      if (!seen.has(n)) {
        seen.add(n);
        numbers.push(n);
      }
    }
  }

  return numbers;
}

/** True if `issue` carries `labelName` (supports `["x"]` or `[{name:"x"}]`). */
function hasLabel(issue, labelName) {
  const labels = issue?.labels ?? [];
  return labels.some((label) => (typeof label === "string" ? label : label?.name) === labelName);
}

/**
 * Pure: selects open issues whose `Depends on: #N` blockers are ALL closed
 * and that are not already queued/tracked.
 *
 * Issues with no `Depends on` line are out of scope by design (the 12 h
 * triager still owns them) rather than treated as "no blockers, promote
 * immediately" — this script only ever accelerates a dependency chain, it
 * never substitutes for triage.
 *
 * @param {{ issues: object[], closedNumbers: Iterable<number> }} input
 * @returns {object[]} the subset of issues to promote (new array; input not mutated)
 */
export function findPromotable({ issues, closedNumbers }) {
  const closed = new Set(closedNumbers ?? []);

  return (issues ?? []).filter((issue) => {
    if (issue?.state && issue.state !== "open") return false;

    const blockers = extractDependsOnNumbers(issue?.body);
    if (blockers.length === 0) return false;

    if (PROMOTION_BLOCKING_LABELS.some((label) => hasLabel(issue, label))) return false;

    return blockers.every((n) => closed.has(n));
  });
}

/**
 * Orchestrates a promotion pass: lists open issues, resolves every
 * referenced blocker's state, selects the promotable subset via
 * {@link findPromotable}, and labels each one `ready`.
 *
 * Each issue's label call is isolated (try/catch) so one failure doesn't
 * abort the rest of the batch — same isolation `runRescue` in
 * `rescue-automation-prs.mjs` uses.
 *
 * @param {{
 *   listOpenIssues: () => Promise<object[]>,
 *   getIssueState: (number: number) => Promise<string | null>,
 *   labelReady: (number: number) => Promise<void>,
 *   dryRun?: boolean,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Promise<number[]>} the issue numbers that were (or would be) promoted
 */
export async function runPromote({
  listOpenIssues,
  getIssueState,
  labelReady,
  dryRun = false,
  log = () => {},
}) {
  const issues = await listOpenIssues();

  const blockerNumbers = new Set();
  for (const issue of issues) {
    for (const n of extractDependsOnNumbers(issue?.body)) blockerNumbers.add(n);
  }

  const closedNumbers = new Set();
  for (const n of blockerNumbers) {
    const state = await getIssueState(n);
    if (state === "closed") closedNumbers.add(n);
  }

  const promotable = findPromotable({ issues, closedNumbers });
  const promoted = [];

  for (const issue of promotable) {
    if (dryRun) {
      log(`[dry-run] would promote #${issue.number} to ready`);
      promoted.push(issue.number);
      continue;
    }
    try {
      await labelReady(issue.number);
      log(`promoted #${issue.number} to ready`);
      promoted.push(issue.number);
    } catch (err) {
      log(`failed to promote #${issue.number}: ${err.message}`);
    }
  }

  return promoted;
}

/** Parses the newline-delimited JSON objects `gh api --jq '.[] | {...}'` emits. */
function parseJsonLines(output) {
  return output
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/** CLI entry: wires raw `gh api` REST calls to {@link runPromote}. */
async function run() {
  const dryRun = process.argv.includes("--dry-run");

  const promoted = await runPromote({
    listOpenIssues: async () => {
      const output = execFileSync(
        "gh",
        [
          "api",
          // `-X GET` is required: `gh api` defaults to POST whenever `-f`
          // form fields are present, which 422s a read-only endpoint like
          // this one ('"title" wasn't supplied' — the Issues *create*
          // validation firing on a list call). Measured against the live
          // repo while building this dry-run.
          "-X",
          "GET",
          "--paginate",
          "repos/{owner}/{repo}/issues",
          "-f",
          "state=open",
          "-f",
          "per_page=100",
          "--jq",
          ".[] | {number: .number, body: .body, state: .state, labels: [.labels[].name], isPullRequest: (.pull_request != null)}",
        ],
        { encoding: "utf-8" }
      );
      return parseJsonLines(output).filter((issue) => !issue.isPullRequest);
    },
    getIssueState: async (number) => {
      try {
        return execFileSync(
          "gh",
          ["api", `repos/{owner}/{repo}/issues/${number}`, "--jq", ".state"],
          { encoding: "utf-8" }
        ).trim();
      } catch {
        // A 404 (deleted/invalid reference) must never read as "closed" —
        // fail closed so a malformed blocker number can't force a promotion.
        return null;
      }
    },
    labelReady: async (number) => {
      execFileSync(
        "gh",
        [
          "api",
          "-X",
          "POST",
          `repos/{owner}/{repo}/issues/${number}/labels`,
          "-f",
          "labels[]=ready",
        ],
        { stdio: "inherit" }
      );
    },
    dryRun,
    log: (msg) => process.stdout.write(`[promote-unblocked-issues] ${msg}\n`),
  });

  process.stdout.write(
    `[promote-unblocked-issues] ${dryRun ? "[dry-run] " : ""}promoted ${promoted.length} issue(s): ${
      promoted.map((n) => `#${n}`).join(", ") || "none"
    }\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    process.stderr.write(`[promote-unblocked-issues] Error: ${err.message}\n`);
    process.exit(1);
  });
}
