#!/usr/bin/env node

/**
 * Revert RCA Trigger — Handles reflection on AI PR reversions (#1191).
 *
 * This script is triggered when a PR *may* have been reverted. It
 * independently verifies whether a revert of `--pr` is actually merged
 * (rather than trusting a caller-supplied sha, which was the root cause of
 * #3583's false RCA) and only then creates an issue tasking an agent to
 * perform a Root Cause Analysis (RCA) and update project guidelines
 * (gotchas.md) to prevent future occurrences.
 *
 * Usage:
 *   node scripts/revert-rca.mjs --pr <number>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ghClient = createGhClient();

/**
 * Pure: builds the `gh issue create` args for an RCA issue. The `ready`
 * label is sourced from `@mbe/gh-client`'s coordination-label machine
 * (#2933) rather than a re-typed string literal, so it can never drift from
 * the canonical label name.
 */
export function buildRcaCreateArgs(title, body) {
  return [
    "--title",
    title,
    "--body",
    body,
    "--label",
    "meta-improvement",
    "--label",
    COORDINATION_LABELS.READY,
    "--label",
    "critical",
  ];
}

// A revert PR is always titled `revert: #<N> ...` by the watchdog (see
// `.github/workflows/revert-watchdog.yml`'s "Propose Revert PR" step) and by
// `revert-rca-loop.yml`'s own trigger condition. Matching on this title is
// how we tell "a commit/PR that reverts #<N>" apart from #<N>'s own merge
// commit (#3583) — never assume the two are the same thing.
const REVERT_TITLE_PATTERN = /^revert:/i;

/**
 * Pure: finds the PR (if any) that proposes/performs a revert of `prNumber`,
 * among a list of candidate PRs already fetched via `gh pr list`.
 *
 * @param {Array<{number:number, title:string}>} candidatePrs
 * @param {number|string} prNumber
 * @returns {object|null}
 */
export function findRevertPr(candidatePrs, prNumber) {
  const numberPattern = new RegExp(`#${prNumber}\\b`);
  return (
    (candidatePrs ?? []).find(
      (candidate) =>
        REVERT_TITLE_PATTERN.test((candidate?.title ?? "").trim()) &&
        numberPattern.test(candidate?.title ?? "")
    ) ?? null
  );
}

/**
 * Pure: classifies the revert state of a PR given the (possibly null) revert
 * PR found by `findRevertPr`. Three states (#3583):
 *   - "none"     — no revert PR/commit exists at all
 *   - "proposed" — a revert PR was opened but not merged (must NOT be
 *                  reported as "was reverted")
 *   - "merged"   — the revert PR is merged; its own merge commit is the
 *                  real revert commit
 *
 * @param {{number:number, state?:string, mergedAt?:string|null, mergeCommit?:{oid?:string}}|null} revertPr
 * @returns {{state: "none"|"proposed"|"merged", revertSha: string|null, revertPrNumber: number|null}}
 */
export function classifyRevertState(revertPr) {
  if (!revertPr) {
    return { state: "none", revertSha: null, revertPrNumber: null };
  }

  const isMerged = revertPr.state === "MERGED" || Boolean(revertPr.mergedAt);
  if (!isMerged) {
    return { state: "proposed", revertSha: null, revertPrNumber: revertPr.number };
  }

  return {
    state: "merged",
    revertSha: revertPr.mergeCommit?.oid ?? null,
    revertPrNumber: revertPr.number,
  };
}

/** Pure: builds the RCA issue title (unchanged format). */
export function buildRcaTitle(prNumber, prTitle) {
  return `[RCA] Reflection: Reverted PR #${prNumber} — ${prTitle}`;
}

/**
 * Pure: builds the RCA issue body for a *confirmed, merged* revert. Links
 * both the original merge PR and the revert PR/commit (#3583) — never
 * reports the original PR's own merge commit as "the revert."
 */
export function buildRcaBody({ prNumber, pr, revertPrNumber, revertSha }) {
  return `## Root Cause Analysis Request

The AI-generated PR #${prNumber} was reverted in commit ${revertSha} (merged via #${revertPrNumber}).

### Original PR Details
- **Title:** ${pr.title}
- **Author:** ${pr.author.login}
- **Branch:** ${pr.headRefName}
- **Revert PR:** #${revertPrNumber}

### Task for Agent
1. **Analyze:** Examine the diff of #${prNumber} and the reasons for its revert (check CI logs, PR comments, or broken main alerts).
2. **Identify:** What was the root cause? (e.g., missing edge case, flaky test, bad import, logic error).
3. **Prevent:**
   - Add a new entry to \`.claude/rules/gotchas.md\` or \`AGENTS.md\` to prevent this specific failure mode.
   - Propose a fix that addresses the original issue without the bug.
4. **Document:** Write the RCA findings to \`.claude/reflections/RCA-PR-${prNumber}.md\`.

Labels: \`meta-improvement\`, \`${COORDINATION_LABELS.READY}\`, \`critical\``;
}

/**
 * Orchestrates the RCA decision with injected gh operations (testable
 * without the network). Only files an RCA issue when a revert of `prNumber`
 * is actually merged (#3583) — a proposed-but-open revert, or no revert at
 * all, is skipped rather than conflated with "was reverted."
 *
 * @param {{
 *   prNumber: number,
 *   fetchPr: () => object,
 *   searchRevertPrs: () => Array<object>,
 *   createIssue: (args: string[]) => string,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {{action: "skipped"|"created", state: string, issueUrl?: string}}
 */
export function runRevertRca({ prNumber, fetchPr, searchRevertPrs, createIssue, log = () => {} }) {
  const pr = fetchPr(prNumber);
  const revertPr = findRevertPr(searchRevertPrs(prNumber), prNumber);
  const revertState = classifyRevertState(revertPr);

  if (revertState.state === "proposed") {
    log(
      `Revert of PR #${prNumber} was proposed in #${revertState.revertPrNumber} but has not been merged — skipping RCA (not a confirmed revert).`
    );
    return { action: "skipped", state: revertState.state };
  }

  if (revertState.state === "none") {
    log(`No revert found for PR #${prNumber} — skipping RCA.`);
    return { action: "skipped", state: revertState.state };
  }

  const rcaTitle = buildRcaTitle(prNumber, pr.title);
  const rcaBody = buildRcaBody({
    prNumber,
    pr,
    revertPrNumber: revertState.revertPrNumber,
    revertSha: revertState.revertSha,
  });
  const issueUrl = createIssue(buildRcaCreateArgs(rcaTitle, rcaBody));
  log(`Created RCA issue: ${issueUrl}`);

  return { action: "created", state: revertState.state, issueUrl };
}

function main() {
  const args = process.argv.slice(2);
  const prIdx = args.indexOf("--pr");

  if (prIdx === -1 || !args[prIdx + 1]) {
    console.error("Missing --pr <number>");
    process.exit(1);
  }

  const prNumber = Number(args[prIdx + 1]);

  console.log(`Checking revert status for PR #${prNumber}...`);

  let pr;
  try {
    pr = ghClient.pr.view(prNumber, ["--json", "title,body,author,headRefName,labels"]);
  } catch (e) {
    console.error(`Could not find PR #${prNumber}: ${e.message}`);
    process.exit(1);
  }

  // Check if it's an agent PR (based on labels or author)
  const isAgent =
    pr.labels.some((l) => l.name === "has-pr") ||
    pr.author.login.includes("bot") ||
    pr.headRefName.startsWith("agent-") ||
    pr.headRefName.startsWith("worktree-agent-");

  if (!isAgent) {
    console.log(`PR #${prNumber} is not an agent PR, skipping automatic RCA trigger.`);
    // We might still want to do it for humans, but the request specifically mentioned "AI PR reversion"
    // process.exit(0);
  }

  runRevertRca({
    prNumber,
    fetchPr: () => pr,
    searchRevertPrs: () =>
      ghClient.pr.list([
        "--search",
        `"revert: #${prNumber}" in:title`,
        "--state",
        "all",
        "--json",
        "number,title,state,mergedAt,mergeCommit",
      ]),
    createIssue: (createArgs) => ghClient.issue.create(createArgs),
    log: (msg) => console.log(msg),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
