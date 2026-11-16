#!/usr/bin/env node

/**
 * reconcile-issue-states.mjs — find open issues that leaked out of the
 * implement-queue's `ready` state without closing (#8915).
 *
 * `/idea-to-prod:implement-queue` claims only `ready` issues. Two leaks are
 * detectable deterministically:
 *   1. open issues carrying no state label (resolved without a PR, or filed
 *      without `ready`) — reported as promotion candidates for the session;
 *   2. `has-pr` issues whose linked PRs are all closed. All unmerged → the
 *      work never landed, so back to `ready`. Any merged → a human or the
 *      reviewer decides whether the acceptance criteria were met: report only.
 *
 * Linked PRs come from the issue timeline's `cross-referenced` events whose
 * source is a pull request (a cross-reference from a plain issue is not a PR),
 * plus open PRs whose body closes the issue. An unreadable timeline throws:
 * it is never read as "no PRs".
 *
 * Usage:
 *   node scripts/reconcile-issue-states.mjs check
 *   node scripts/reconcile-issue-states.mjs check --apply   # only has-pr → ready
 *
 * `--apply` goes through `mbe issue transition` (`@mbe/gh-client` label
 * machine: `markReady` removes `has-pr`); build the CLI first with
 * `pnpm build --filter @mbe/cli...`.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const STATE_LABELS = [
  "ready",
  "in-progress",
  "has-pr",
  "needs-review",
  "agent-failed",
  "stealable",
  "blocked",
  "ready-for-human",
  "needs-human",
];

export const EXCLUDED_LABELS = ["tracking", "feature-proposal", "ideation-batch"];

const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)/gi;

const hasAny = (issue, names) => (issue.labels ?? []).some((label) => names.includes(label));

/**
 * Pure: classify open issues given their linked PRs.
 *
 * @param {Array<{ issue: { number: number, labels: string[] }, prs: Array<{ number: number, state: string, merged: boolean }> }>} entries
 */
export function classifyIssues(entries) {
  const out = { stateless: [], toReady: [], mergedReport: [], noPr: [] };
  for (const { issue, prs } of entries) {
    if (hasAny(issue, EXCLUDED_LABELS)) continue;
    if (!hasAny(issue, STATE_LABELS)) {
      out.stateless.push(issue.number);
      continue;
    }
    if (!hasAny(issue, ["has-pr"])) continue;
    if (prs.length === 0) out.noPr.push(issue.number);
    else if (prs.some((p) => p.state === "open")) continue;
    else if (prs.some((p) => p.merged)) out.mergedReport.push(issue.number);
    else out.toReady.push(issue.number);
  }
  return out;
}

/**
 * Pure: pull-request references from an issue timeline.
 *
 * @param {unknown} events
 * @returns {Array<{ number: number, state: string, merged: boolean }>}
 */
export function linkedPullRequests(events) {
  if (!Array.isArray(events)) throw new Error("issue timeline was not an array");
  const byNumber = new Map();
  for (const event of events) {
    if (event?.event !== "cross-referenced") continue;
    const source = event.source?.issue;
    if (!source?.pull_request) continue;
    if (typeof source.number !== "number" || typeof source.state !== "string") {
      throw new Error("timeline cross-reference is missing number or state");
    }
    byNumber.set(source.number, {
      number: source.number,
      state: source.state,
      merged: Boolean(source.pull_request.merged_at),
    });
  }
  return [...byNumber.values()];
}

/**
 * Pure: open PRs whose body closes each issue number.
 *
 * @param {Array<{ number: number, body?: string | null }>} openPulls
 * @returns {Map<number, Array<{ number: number, state: string, merged: boolean }>>}
 */
function openPrsClosing(openPulls) {
  const closing = new Map();
  for (const { number, body } of openPulls) {
    for (const match of (body ?? "").matchAll(CLOSING_RE)) {
      const issueNumber = Number(match[1]);
      closing.set(issueNumber, [
        ...(closing.get(issueNumber) ?? []),
        { number, state: "open", merged: false },
      ]);
    }
  }
  return closing;
}

const fmt = (numbers) => (numbers.length ? numbers.map((n) => `#${n}`).join(", ") : "none");

/** @param {ReturnType<typeof classifyIssues>} result */
export function formatReport(result) {
  const line = (label, numbers) => `${label}: ${numbers.length} (${fmt(numbers)})`;
  return [
    line("stateless", result.stateless),
    line("has-pr, all PRs closed unmerged -> ready", result.toReady),
    line("has-pr, a PR merged (report only)", result.mergedReport),
    line("has-pr, no linked PR (report only)", result.noPr),
  ].join("\n");
}

/* c8 ignore start -- thin `gh api` shell; decisions live in the pure core above. */
/** Paginated GET; `--slurp` wraps pages in an array, flattened here. */
const gh = (args) => {
  const pages = JSON.parse(
    execFileSync("gh", ["api", "--paginate", "--slurp", ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
  if (!Array.isArray(pages)) throw new Error("gh api --slurp did not return an array");
  return pages.flat();
};

function listOpenIssues() {
  const rows = gh([
    "-X",
    "GET",
    "repos/{owner}/{repo}/issues",
    "-f",
    "state=open",
    "-f",
    "per_page=100",
  ]);
  if (!Array.isArray(rows)) throw new Error("issues list was not an array");
  return rows
    .filter((row) => !row.pull_request)
    .map((row) => ({
      number: row.number,
      title: row.title,
      labels: (row.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
    }));
}

function listOpenPulls() {
  const rows = gh([
    "-X",
    "GET",
    "repos/{owner}/{repo}/pulls",
    "-f",
    "state=open",
    "-f",
    "per_page=100",
  ]);
  if (!Array.isArray(rows)) throw new Error("pulls list was not an array");
  return rows.map((row) => ({ number: row.number, body: row.body }));
}

function gather() {
  const issues = listOpenIssues();
  const closing = openPrsClosing(listOpenPulls());
  return issues.map((issue) => {
    const needsPrs = issue.labels.includes("has-pr") && !hasAny(issue, EXCLUDED_LABELS);
    const timeline = needsPrs
      ? linkedPullRequests(gh([`repos/{owner}/{repo}/issues/${issue.number}/timeline`]))
      : [];
    const openPrs = closing.get(issue.number) ?? [];
    const merged = new Map(timeline.map((p) => [p.number, p]));
    for (const p of openPrs) merged.set(p.number, p);
    return { issue, prs: [...merged.values()] };
  });
}

function apply(numbers) {
  for (const n of numbers) {
    execFileSync(
      "node",
      ["tools/cli/dist/index.js", "issue", "transition", String(n), "--to", "ready"],
      { stdio: "inherit" }
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== "check") throw new Error("usage: reconcile-issue-states.mjs check [--apply]");
    const result = classifyIssues(gather());
    process.stdout.write(`${formatReport(result)}\n`);
    if (args.includes("--apply")) apply(result.toReady);
  } catch (err) {
    process.stderr.write(`[reconcile-issue-states] Error: ${err.message}\n`);
    process.exit(1);
  }
}
/* c8 ignore stop */
