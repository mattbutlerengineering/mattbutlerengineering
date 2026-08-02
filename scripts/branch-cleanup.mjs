#!/usr/bin/env node

/**
 * branch-cleanup.mjs — decision logic + CLI runner for the consolidated
 * "Branch Cleanup" workflow (#3624).
 *
 * Two workflows used to do this job and between them reached 13 of 239
 * remote branches: `branch-cleanup.yml` scanned *local* branches (a no-op
 * after `actions/checkout`) and was permanently stuck in dry-run
 * (`github.inputs` is not a valid Actions context); `worktree-cleanup.yml`
 * scanned remote branches correctly but its pattern never matched
 * `worktree-agent-*` — the actual prefix Claude Code worktree agents create.
 *
 * This script replaces both: it enumerates *remote* branches, matches a
 * widened pattern (including `worktree-agent-*`), and applies four
 * non-negotiable safety rails before a branch is ever eligible for deletion:
 * protected-branch list, merged-into-main, no open PR, and a 7-day age
 * floor. The decision logic is pure and unit-tested (see
 * `scripts/__tests__/branch-cleanup.test.mjs`); only `main()` shells out to
 * git/gh, via `execFileSync` with argv arrays (never string interpolation).
 *
 * Usage:
 *   node scripts/branch-cleanup.mjs                # honors env DRY_RUN (default "true")
 *   DRY_RUN=false node scripts/branch-cleanup.mjs  # actually deletes eligible branches
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGhClient } from "@mbe/gh-client";

export const AGE_FLOOR_DAYS = 7;

const PROTECTED_BRANCHES = new Set(["main", "production"]);
const PROTECTED_PATTERNS = [/^release\//];

const CLEANUP_PATTERNS = [
  /^agent\//,
  /^fix\/issue-/,
  /^feat\/issue-/,
  /^chore\/issue-/,
  /^worktree-agent-/,
];

/** Pure: true if `name` must never be deleted, regardless of any other signal. */
export function isProtectedBranch(name) {
  if (PROTECTED_BRANCHES.has(name)) return true;
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(name));
}

/** Pure: true if `name` matches one of the disposable-branch naming conventions. */
export function matchesCleanupPattern(name) {
  return CLEANUP_PATTERNS.some((pattern) => pattern.test(name));
}

/** Pure: fractional days elapsed between `dateStr` and `now`. */
function daysSince(dateStr, now) {
  const then = new Date(dateStr).getTime();
  return (now.getTime() - then) / 86_400_000;
}

/** Pure: true if `dateStr` is at least `thresholdDays` in the past relative to `now`. */
export function isOldEnough(dateStr, now = new Date(), thresholdDays = AGE_FLOOR_DAYS) {
  return daysSince(dateStr, now) >= thresholdDays;
}

/**
 * Pure: true if any entry in a `gh pr list --json number,mergedAt` response
 * represents an actually-merged PR. This — not local git ancestry — is the
 * correct way to detect "was this branch merged": this repo merges via
 * squash (`gh pr merge --squash`, per gotchas.md), so a squash-merged
 * branch's tip commit is never literally an ancestor of `main` (its diff was
 * replayed as a brand-new commit). `git branch --merged main` / `git
 * merge-base --is-ancestor` therefore report *false* for the overwhelming
 * majority of real merged branches — reproducing the exact "reports
 * success, deletes nothing" failure this cleanup exists to fix. A PR's
 * `merged`/`mergedAt` field is server-side truth, independent of ancestry.
 */
export function hasMergedPr(prEntries) {
  return (prEntries ?? []).some((pr) => pr.mergedAt != null);
}

/**
 * Pure: applies every safety rail to a single branch and returns the
 * decision plus a human-readable reason.
 *
 * @param {{name:string, mergedIntoMain:boolean, lastCommitDate:string, hasOpenPr:boolean}} branch
 * @param {{now?:Date, thresholdDays?:number}} [opts]
 * @returns {{eligible:boolean, reason:string}}
 */
export function decideBranch(branch, opts = {}) {
  const now = opts.now ?? new Date();
  const thresholdDays = opts.thresholdDays ?? AGE_FLOOR_DAYS;

  if (isProtectedBranch(branch.name)) return { eligible: false, reason: "protected" };
  if (!matchesCleanupPattern(branch.name)) return { eligible: false, reason: "pattern-mismatch" };
  if (!branch.mergedIntoMain) return { eligible: false, reason: "not-merged" };
  if (branch.hasOpenPr) return { eligible: false, reason: "open-pr" };
  if (!isOldEnough(branch.lastCommitDate, now, thresholdDays)) {
    return { eligible: false, reason: "too-recent" };
  }
  return { eligible: true, reason: "eligible" };
}

/**
 * Pure: builds the full cleanup plan for a batch of remote branches.
 *
 * @param {Array<{name:string, mergedIntoMain:boolean, lastCommitDate:string, hasOpenPr:boolean}>} branches
 * @param {{now?:Date, thresholdDays?:number}} [opts]
 * @returns {{considered:number, matched:number, toDelete:Array, retained:Array}}
 */
export function planCleanup(branches, opts = {}) {
  const decided = (branches ?? []).map((branch) => ({
    ...branch,
    decision: decideBranch(branch, opts),
  }));

  const matched = decided.filter((branch) => matchesCleanupPattern(branch.name));
  const toDelete = decided.filter((branch) => branch.decision.eligible);
  const retained = decided.filter((branch) => !branch.decision.eligible);

  return {
    considered: decided.length,
    matched: matched.length,
    toDelete,
    retained,
  };
}

// ---------------------------------------------------------------------------
// CLI orchestration — side effects live below; everything above is pure.
// ---------------------------------------------------------------------------

function listRemoteBranchNames() {
  const raw = execFileSync("git", ["branch", "-r"], { encoding: "utf8" });
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.includes("->") && line.startsWith("origin/"))
    .map((line) => line.slice("origin/".length));
}

/** True if `name` ever had a PR that GitHub reports as merged (server-side, squash-merge safe). */
function wasBranchMerged(ghClient, name) {
  const prs = ghClient.pr.list(["--head", name, "--state", "all", "--json", "number,mergedAt"]);
  return hasMergedPr(prs);
}

function getLastCommitDate(name) {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cI", `origin/${name}`], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function listOpenPrBranchNames(ghClient) {
  const prs = ghClient.pr.list(["--state", "open", "--json", "headRefName", "--limit", "500"]);
  return new Set(prs.map((pr) => pr.headRefName));
}

function deleteBranch(name) {
  execFileSync("git", ["push", "origin", "--delete", name]);
}

/**
 * Builds the branch inventory used by `planCleanup` from injected data
 * sources — kept separate from `planCleanup` so it stays pure/testable.
 *
 * Merged-status and last-commit-date lookups are skipped for branches that
 * don't match the cleanup pattern or are protected: `decideBranch` never
 * reaches those fields for them, and skipping avoids an unnecessary `gh`/
 * `git` call per non-candidate branch (most of the 240 remote branches).
 */
function buildBranchInventory({ allBranchNames, openPrBranchNames, ghClient }) {
  return allBranchNames.map((name) => {
    const isCandidate = matchesCleanupPattern(name) && !isProtectedBranch(name);
    return {
      name,
      mergedIntoMain: isCandidate ? wasBranchMerged(ghClient, name) : false,
      lastCommitDate: isCandidate ? getLastCommitDate(name) : null,
      hasOpenPr: openPrBranchNames.has(name),
    };
  });
}

function formatSummary(plan, dryRun) {
  const lines = [
    "=== Branch Cleanup ===",
    `Mode: ${dryRun ? "DRY RUN" : "LIVE"}`,
    `Considered: ${plan.considered}`,
    `Matched cleanup pattern: ${plan.matched}`,
    `Eligible for deletion: ${plan.toDelete.length}`,
    "",
  ];
  for (const branch of plan.toDelete) {
    lines.push(`${dryRun ? "[DRY RUN] Would delete" : "Deleting"}: ${branch.name}`);
  }
  return lines.join("\n");
}

async function main() {
  const dryRun = (process.env.DRY_RUN ?? "true") === "true";
  const ghClient = createGhClient();

  execFileSync("git", ["fetch", "--prune", "origin"], { stdio: "inherit" });

  const allBranchNames = listRemoteBranchNames();
  const openPrBranchNames = listOpenPrBranchNames(ghClient);

  const branches = buildBranchInventory({ allBranchNames, openPrBranchNames, ghClient });
  const plan = planCleanup(branches, { now: new Date() });

  console.log(formatSummary(plan, dryRun));

  if (!dryRun) {
    for (const branch of plan.toDelete) {
      try {
        deleteBranch(branch.name);
      } catch (err) {
        console.error(`Failed to delete ${branch.name}: ${err.message}`);
      }
    }
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryPath, `\n${formatSummary(plan, dryRun)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[branch-cleanup] Error: ${err.message}`);
    process.exit(1);
  });
}
