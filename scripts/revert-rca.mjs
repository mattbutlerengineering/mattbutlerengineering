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
import { fileIssue } from "./lib/issue-filing.mjs";

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
 * Pure: builds `gh pr list` args that fetch revert-PR candidates without
 * going through the Search API (#3613). `gh pr list --search`/`--search "…"
 * in:title` is backed by GitHub's Search API, which lags minutes-to-hours
 * behind reality — a revert PR merged seconds before this script runs (the
 * `revert-rca-loop.yml` merge-triggered path fires immediately on the
 * webhook) can be invisible to Search, causing a genuine merged revert to
 * silently get no RCA. The REST `/pulls` list endpoint has no such lag, so
 * candidates are fetched by direct list and filtered locally via
 * `findRevertPr` instead of asking Search to filter server-side.
 *
 * This list is sorted by `createdAt` descending and bounded by `limit`
 * (#3873) — a revert PR that sits open for a while (e.g. #3691, open 2.5
 * days) carries an old `createdAt` and can fall outside the window once
 * enough newer PRs are created. `findRevertPr` is always called against the
 * union of this list and `buildRevertPrSearchArgs`'s relevance-ranked
 * results (see `mergeRevertCandidates`), so that boundedness alone does not
 * reintroduce the silent-miss failure mode.
 *
 * @param {number} [limit]
 * @returns {string[]}
 */
export function buildRevertPrListArgs(limit = 300) {
  return [
    "--state",
    "all",
    "--limit",
    String(limit),
    "--json",
    "number,title,state,mergedAt,mergeCommit",
  ];
}

/**
 * Pure: builds `gh pr list --search` args that find revert-PR candidates by
 * title relevance rather than recency (#3873). Unlike `buildRevertPrListArgs`,
 * this is not bounded by creation-date window — GitHub's Search API ranks by
 * match relevance, so an old-but-still-open revert PR is found regardless of
 * how many newer PRs exist. Used only as a *second*, unioned source (via
 * `mergeRevertCandidates`) alongside the direct list — never as the sole
 * source, which is what caused #3613's index-lag gap (a revert merged
 * seconds ago can be invisible to Search).
 *
 * @param {number|string} prNumber
 * @returns {string[]}
 */
export function buildRevertPrSearchArgs(prNumber) {
  return [
    "--search",
    `revert: #${prNumber} in:title`,
    "--state",
    "all",
    "--json",
    "number,title,state,mergedAt,mergeCommit",
  ];
}

/**
 * Pure: unions two revert-PR candidate lists (direct list + search results),
 * deduped by PR number. Candidates from `listA` win on collision; order is
 * otherwise `listA` followed by any new candidates from `listB` (#3873).
 *
 * @param {Array<{number:number}>} listA
 * @param {Array<{number:number}>} listB
 * @returns {Array<{number:number}>}
 */
export function mergeRevertCandidates(listA, listB) {
  const seen = new Map((listA ?? []).map((candidate) => [candidate.number, candidate]));
  for (const candidate of listB ?? []) {
    if (!seen.has(candidate.number)) {
      seen.set(candidate.number, candidate);
    }
  }
  return Array.from(seen.values());
}

/**
 * Pure: finds the PR (if any) that proposes/performs a revert of `prNumber`,
 * among a list of candidate PRs already fetched via `gh pr list`.
 *
 * When more than one `revert:`-titled PR matches (e.g. an abandoned/closed
 * attempt followed later by a genuine merged one), a MERGED candidate is
 * always preferred — search-result/list ordering must never decide the
 * winner (#3613). Falls back to the first match when none is merged, same
 * as before.
 *
 * Known residual (#3873): callers are expected to pass the *union* of
 * `buildRevertPrListArgs`'s bounded, recency-sorted results and
 * `buildRevertPrSearchArgs`'s relevance-ranked results (via
 * `mergeRevertCandidates`), not the direct list alone. The direct list is
 * bounded by `limit` and sorted `createdAt` descending, so a revert PR that
 * sat open for days (old `createdAt`) can fall outside that window once
 * enough newer PRs exist. The search-sourced list has no such recency bound,
 * so it backstops the direct list's window instead of being the sole source
 * (which would reintroduce #3613's index-lag gap — a revert merged seconds
 * ago can be invisible to Search). This function itself is a plain filter
 * over whatever candidate list it's given; it has no opinion on how that
 * list was assembled.
 *
 * @param {Array<{number:number, title:string, state?:string, mergedAt?:string|null}>} candidatePrs
 * @param {number|string} prNumber
 * @returns {object|null}
 */
export function findRevertPr(candidatePrs, prNumber) {
  const numberPattern = new RegExp(`#${prNumber}\\b`);
  const matches = (candidatePrs ?? []).filter(
    (candidate) =>
      REVERT_TITLE_PATTERN.test((candidate?.title ?? "").trim()) &&
      numberPattern.test(candidate?.title ?? "")
  );

  if (matches.length === 0) return null;

  const merged = matches.find(
    (candidate) => candidate?.state === "MERGED" || Boolean(candidate?.mergedAt)
  );
  return merged ?? matches[0];
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

const RCA_ISSUE_TITLE_PATTERN = /^\[RCA\] Reflection: Reverted PR #(\d+)\b/;

/** Pure: extracts the original PR number an RCA issue was filed for, from its title. */
export function extractRcaPrNumber(issue) {
  const match = RCA_ISSUE_TITLE_PATTERN.exec(issue?.title ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Pure: finds a prior RCA issue for `prNumber` among candidate issues (any
 * state). Feeds `fileIssue()`'s dedupe-by-ledger decision (#3775): a rerun
 * for the same reverted PR skips (still open) or reopens (previously
 * closed) instead of filing a duplicate RCA — this producer previously had
 * no dedup ledger at all beyond its own merged-revert-state gate (#3590).
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @param {number} prNumber
 * @returns {number | null}
 */
export function findPriorRcaIssue(candidates, prNumber) {
  const match = (candidates ?? []).find((issue) => extractRcaPrNumber(issue) === prNumber);
  return match ? match.number : null;
}

/**
 * Orchestrates the RCA decision with injected gh operations (testable
 * without the network). Only files an RCA issue when a revert of `prNumber`
 * is actually merged (#3583) — a proposed-but-open revert, or no revert at
 * all, is skipped rather than conflated with "was reverted." The
 * create/skip/reopen decision itself routes through the shared `fileIssue()`
 * seam (#3775).
 *
 * @param {{
 *   prNumber: number,
 *   fetchPr: () => object,
 *   searchRevertPrs: () => Array<object>,
 *   searchRcaIssues?: () => Array<{number: number, title: string}>,
 *   getIssueState?: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   reopenIssue?: (issueNumber: number) => void,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {{action: "skipped"|"created"|"reopened", state: string, issueNumber?: number}}
 */
export function runRevertRca({
  prNumber,
  fetchPr,
  searchRevertPrs,
  searchRcaIssues = () => [],
  getIssueState = () => "missing",
  createIssue,
  reopenIssue = () => {},
  log = () => {},
}) {
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
  const labels = ["meta-improvement", COORDINATION_LABELS.READY, "critical"];

  // A failed search must not swallow a genuine confirmed revert — fail open
  // (treat as "no prior found", file the issue) rather than closed.
  let candidates = [];
  try {
    candidates = searchRcaIssues();
  } catch (err) {
    log(`search for a prior RCA issue failed, proceeding as no-match: ${err.message}`);
  }
  const priorNumber = findPriorRcaIssue(candidates, prNumber);
  const ledger = priorNumber !== null ? { [prNumber]: priorNumber } : {};

  const result = fileIssue(
    { title: rcaTitle, body: rcaBody, labels, dedupeKey: prNumber },
    ledger,
    {
      getIssueState,
      createIssue,
      reopenIssue,
    }
  );

  if (result.action === "skip") {
    log(`RCA issue #${result.issueNumber} already tracks reverted PR #${prNumber} — skipping.`);
    return { action: "skipped", state: revertState.state, issueNumber: result.issueNumber };
  }

  log(
    result.action === "reopen"
      ? `Reopened RCA issue #${result.issueNumber} for reverted PR #${prNumber}.`
      : `Created RCA issue #${result.issueNumber} for reverted PR #${prNumber}.`
  );

  return {
    action: result.action === "reopen" ? "reopened" : "created",
    state: revertState.state,
    issueNumber: result.issueNumber,
  };
}

/** Real `getIssueState` dep for `fileIssue()`, backed by `gh issue view`. */
function getIssueStateViaGhClient(client, issueNumber) {
  try {
    const state = String(client.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
  } catch {
    return "missing";
  }
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
function parseIssueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
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
    searchRevertPrs: () => {
      const directList = ghClient.pr.list(buildRevertPrListArgs());
      // A failed search must not crash the whole run — fail open to the
      // direct list alone (the previously-sole, reliable source) rather
      // than losing a genuine confirmed revert to an unhandled throw.
      // Mirrors searchRcaIssues's fail-open pattern above.
      let searchList = [];
      try {
        searchList = ghClient.pr.list(buildRevertPrSearchArgs(prNumber));
      } catch (err) {
        console.error(
          `search for revert-PR candidates failed, using direct list only: ${err.message}`
        );
      }
      return mergeRevertCandidates(directList, searchList);
    },
    searchRcaIssues: () =>
      ghClient.issue.list([
        "--label",
        "meta-improvement",
        "--state",
        "all",
        "--json",
        "number,title",
      ]),
    getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
    createIssue: (title, body) =>
      parseIssueNumberFromUrl(ghClient.issue.create(buildRcaCreateArgs(title, body))),
    reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
    log: (msg) => console.log(msg),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
