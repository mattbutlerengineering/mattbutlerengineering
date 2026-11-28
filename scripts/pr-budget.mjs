#!/usr/bin/env node
/**
 * pr-budget.mjs — block a non-draft PR while the CI queue is saturated (#10188).
 *
 * Every non-draft PR runs the full `ci.yml` chain. When many small PRs open at
 * once, every one of them queues, and merges keep cancelling the deploy's
 * main CI run (#9948). Draft PRs skip CI, so they always pass: build a batch
 * on a draft, mark it ready once.
 *
 * Called by `.claude/hooks/pre-bash-guard.sh` for commands that look like PR
 * creation. CLI: `node scripts/pr-budget.mjs --command "<bash command>"`.
 * Exit 2 with a message on stderr when blocked, exit 0 otherwise. Any failure
 * to measure the queue allows the PR (fail open): a rate-limited `gh` must
 * never block a hotfix.
 *
 * @module pr-budget
 */

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Queued + running `ci.yml` pull_request runs at which a non-draft PR is blocked. */
export const PR_BUDGET_THRESHOLD = 6;

// `gh` only at a command position: line start, after ; & | or $( , optionally
// after VAR=value prefixes. A quoted mention (grep, commit message) never matches.
const CMD_START = String.raw`(?:^|[;&|]\s*|\$\(\s*)(?:\w+=\S*\s+)*`;
const GH_PR_CREATE = new RegExp(`${CMD_START}gh\\s+pr\\s+create\\b`);
const GH_PR_DRAFT_FLAG = /\s(--draft(=true)?|-d)(\s|$)/;
const GH_API = new RegExp(`${CMD_START}gh\\s+api\\b`);
// The pulls collection itself, not a single PR or its sub-resources.
const PULLS_COLLECTION = /\/pulls(\?|\s|$|["'])/;
const NON_POST_METHOD = /(-X|--method)\s+(GET|PATCH|PUT|DELETE)\b/i;
const FIELD_FLAG = /\s(-f|-F|--field|--raw-field)\s/;
const DRAFT_TRUE = /draft=true\b/;

/**
 * True when the command creates a PR that is not a draft.
 * @param {string} command
 * @returns {boolean}
 */
export function isNonDraftPrCreate(command) {
  if (GH_PR_CREATE.test(command)) return !GH_PR_DRAFT_FLAG.test(command);
  if (!GH_API.test(command) || !PULLS_COLLECTION.test(command)) return false;
  if (NON_POST_METHOD.test(command)) return false;
  // `gh api` without -X sends POST only when fields are given.
  const isPost = /(-X|--method)\s+POST\b/i.test(command) || FIELD_FLAG.test(command);
  return isPost && !DRAFT_TRUE.test(command);
}

/**
 * @param {{ command: string, queuedPrRuns: number | null, threshold?: number, override?: boolean }} input
 * @returns {{ action: "allow" | "block", reason: string }}
 */
export function decidePrBudget({
  command,
  queuedPrRuns,
  threshold = PR_BUDGET_THRESHOLD,
  override = false,
}) {
  if (!isNonDraftPrCreate(command)) return { action: "allow", reason: "not a non-draft PR" };
  if (override) return { action: "allow", reason: "PR_BUDGET_OVERRIDE=1" };
  if (queuedPrRuns === null)
    return { action: "allow", reason: "could not measure the CI queue; failing open" };
  if (queuedPrRuns < threshold) {
    return {
      action: "allow",
      reason: `${queuedPrRuns} PR CI runs queued or running (< ${threshold})`,
    };
  }
  return {
    action: "block",
    reason: [
      `PR budget: ${queuedPrRuns} PR CI runs are queued or running (threshold ${threshold}), #10188.`,
      "A non-draft PR adds a full CI run to a saturated queue. Instead:",
      "  - add this change as a commit to your open PR (one PR per batch), or",
      "  - open it with --draft (drafts skip CI) and mark it ready once the batch is complete, or",
      "  - wait for the queue to drain.",
      "Security fixes, a red main, or a deploy unblocker: prefix the command with PR_BUDGET_OVERRIDE=1.",
    ].join("\n"),
  };
}

/** @returns {number | null} queued + in-progress ci.yml pull_request runs, or null on any failure. */
function measureQueuedPrRuns() {
  try {
    let total = 0;
    for (const runStatus of ["queued", "in_progress"]) {
      const out = execFileSync(
        "gh",
        [
          "api",
          `repos/{owner}/{repo}/actions/workflows/ci.yml/runs?event=pull_request&status=${runStatus}&per_page=1`,
          "--jq",
          ".total_count",
        ],
        { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }
      );
      const count = Number.parseInt(out.trim(), 10);
      if (!Number.isFinite(count)) return null;
      total += count;
    }
    return total;
  } catch {
    return null;
  }
}

function main(argv) {
  const index = argv.indexOf("--command");
  const command = index >= 0 ? (argv[index + 1] ?? "") : "";
  if (!isNonDraftPrCreate(command)) return 0;
  const override =
    process.env.PR_BUDGET_OVERRIDE === "1" || /\bPR_BUDGET_OVERRIDE=1\b/.test(command);
  // PR_BUDGET_QUEUED_RUNS replaces the measurement; the hook tests use it to run offline.
  const injected = process.env.PR_BUDGET_QUEUED_RUNS;
  const queuedPrRuns = override
    ? 0
    : injected !== undefined
      ? Number(injected)
      : measureQueuedPrRuns();
  const decision = decidePrBudget({ command, queuedPrRuns, override });
  if (decision.action === "block") {
    process.stderr.write(`BLOCK: ${decision.reason}\n`);
    return 2;
  }
  if (queuedPrRuns === null) process.stderr.write(`pr-budget: ${decision.reason}\n`);
  return 0;
}

// realpath both sides: the hook may reach this file through a symlinked scripts/.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = main(process.argv.slice(2));
}
