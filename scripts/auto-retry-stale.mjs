#!/usr/bin/env node
/**
 * auto-retry-stale.mjs — close the agent-failed feedback loop.
 *
 * Issues left in `agent-failed` are a dead end: once an agent fails, the issue
 * sits untouched until a human re-queues it. This re-queues issues that have
 * been `agent-failed` for 3+ days, measured from the most recent `agent-failed`
 * `labeled` event (never `createdAt`/`updatedAt`; #8874). `agent-skip` (the
 * "give up, needs a human" terminal state) and `stealable` (already failed
 * twice) are excluded, as is any issue whose label time is unknown so a second attempt can run — agent
 * skills may have improved or the description may have been refined since.
 *
 * Invoked from the progress-tracker run (see
 * `.claude/skills/progress-tracker/SKILL.md` → "Auto-retry Stale").
 *
 * Design: the selection logic (`selectStaleForRetry`) is a pure function with an
 * injected `now`, so it is fully unit-testable without the network. The GitHub
 * mutations live behind injected `editLabels` / `comment` callbacks; the CLI
 * wires them to the real `@mbe/gh-client`.
 */

import { execFileSync } from "node:child_process";
import { createGhClient, markReady } from "@mbe/gh-client";

const REPO = "mattbutlerengineering/mattbutlerengineering";

/** 3 days, in milliseconds. */
export const RETRY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/** Max issues to re-queue per run (matches progress-tracker "Max 2 retry/run"). */
export const DEFAULT_RETRY_CAP = 2;

/** Comment posted on each re-queued issue. */
export const RETRY_COMMENT =
  "Auto-retrying — this issue has been in agent-failed state for 3+ days.";

/** Fields required for `gh issue list --json`. */
export const ISSUE_JSON_FIELDS = "number,createdAt,labels";

/** True if `issue` carries `labelName` (supports `["x"]` or `[{name:"x"}]`). */
function hasLabel(issue, labelName) {
  const labels = issue?.labels ?? [];
  return labels.some((l) => (typeof l === "string" ? l : l?.name) === labelName);
}

/**
 * Pure: pick the agent-failed issues that should be re-queued.
 *
 * An issue qualifies when it is labeled `agent-failed`, is NOT labeled
 * `agent-skip` or `stealable`, and `agentFailedAt` (when the label was last
 * applied) is strictly more than `thresholdMs` ago. A missing or unparseable
 * `agentFailedAt` fails closed (skipped). Results are ordered oldest-failure
 * first and capped at `cap`.
 *
 * @param {Array<{number:number, agentFailedAt?:string|null, labels:Array}>} issues
 * @param {number} nowMs - reference timestamp in ms (injected for determinism)
 * @param {{cap?:number, thresholdMs?:number}} [opts]
 * @returns {Array} the issues to retry (a new array; input is not mutated)
 */
export function selectStaleForRetry(issues, nowMs, opts = {}) {
  const { cap = DEFAULT_RETRY_CAP, thresholdMs = RETRY_THRESHOLD_MS } = opts;
  return (issues ?? [])
    .filter(
      (i) => hasLabel(i, "agent-failed") && !hasLabel(i, "agent-skip") && !hasLabel(i, "stealable")
    )
    .map((i) => ({ issue: i, failedMs: i?.agentFailedAt ? Date.parse(i.agentFailedAt) : NaN }))
    .filter(({ failedMs }) => Number.isFinite(failedMs) && nowMs - failedMs > thresholdMs)
    .sort((a, b) => a.failedMs - b.failedMs) // oldest first
    .slice(0, cap)
    .map(({ issue }) => issue);
}

/**
 * Re-queue stale agent-failed issues.
 *
 * @param {{
 *   listIssues: () => Promise<Array>,
 *   editLabels: (number:number, change:{add:string[], remove:string[]}) => Promise<void>,
 *   comment: (number:number, body:string) => Promise<void>,
 *   now?: number,
 *   cap?: number,
 *   dryRun?: boolean,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<number[]>} the issue numbers that were (or would be) retried
 */
export async function runAutoRetry({
  listIssues,
  editLabels,
  comment,
  now = Date.now(),
  cap = DEFAULT_RETRY_CAP,
  dryRun = false,
  log = () => {},
}) {
  const issues = await listIssues();
  const selected = selectStaleForRetry(issues, now, { cap });

  for (const issue of selected) {
    if (dryRun) {
      log(`[dry-run] would auto-retry #${issue.number}`);
      continue;
    }
    // Single source of truth for the re-queue edge (#2933): @mbe/gh-client's
    // markReady owns which labels come off, not this call site.
    const { add, remove } = markReady(issue.number);
    await editLabels(issue.number, { add, remove });
    await comment(issue.number, RETRY_COMMENT);
    log(`auto-retried #${issue.number}`);
  }

  return selected.map((i) => i.number);
}

/**
 * Latest `labeled` event time for `agent-failed` on an issue, or null when it
 * cannot be determined (API error, no event). Null makes the issue skip.
 */
function fetchAgentFailedAt(number) {
  try {
    const out = execFileSync(
      "gh",
      [
        "api",
        "--paginate",
        `repos/${REPO}/issues/${number}/events`,
        "--jq",
        '.[] | select(.event == "labeled" and .label.name == "agent-failed") | .created_at',
      ],
      { encoding: "utf8", timeout: 30_000 }
    );
    const times = out.split("\n").filter(Boolean).sort();
    return times.at(-1) ?? null;
  } catch {
    return null;
  }
}

/** CLI entry: wires the real gh client to {@link runAutoRetry}. */
async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const gh = createGhClient({ timeoutMs: 30_000 });

  const retried = await runAutoRetry({
    listIssues: async () => {
      const issues = await gh.issue.list([
        "--label",
        "agent-failed",
        "--state",
        "open",
        "--json",
        ISSUE_JSON_FIELDS,
      ]);
      return issues.map((i) => ({ ...i, agentFailedAt: fetchAgentFailedAt(i.number) }));
    },
    editLabels: async (number, { add, remove }) =>
      gh.label.apply({ issueNumber: number, add, remove }),
    comment: async (number, body) => gh.issue.comment(number, body),
    dryRun,
    log: (msg) => console.log(`[auto-retry-stale] ${msg}`),
  });

  console.log(
    `[auto-retry-stale] ${dryRun ? "[dry-run] " : ""}re-queued ${retried.length} issue(s): ${
      retried.map((n) => `#${n}`).join(", ") || "none"
    }`
  );
  return retried;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    process.stderr.write(`[auto-retry-stale] Error: ${err.message}\n`);
    process.exit(1);
  });
}
