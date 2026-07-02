#!/usr/bin/env node

/**
 * revert-watchdog.mjs — GitHub-issue side effects for the Revert Watchdog (#2958).
 *
 * The `.github/workflows/revert-watchdog.yml` "Revert Watchdog" job files a
 * 🚨 broken-main issue when main CI fails, then proposes a revert. Two gaps
 * (#2958, found via #2949):
 *
 *   1. The issue only carried `priority:critical` — invisible to the
 *      implement-queue, which claims exclusively from `--label "ready"` and
 *      prioritizes `ci-fix`. Fix: file with `ci-fix,ready,priority:critical`.
 *   2. Nothing ever closed the issue once main recovered. Fix: when a later
 *      main CI run is green, close any open watchdog issue whose culprit
 *      commit is an ancestor of the green run's SHA.
 *
 * Design: label/title/body construction and the close decision are pure
 * functions, unit-tested without the network. The GitHub + git mutations
 * live behind injected callbacks (`listOpenIssues` / `isAncestor` /
 * `closeIssue`); the CLI wires them to the real `@mbe/gh-client` and
 * `git merge-base --is-ancestor`.
 *
 * Usage:
 *   node scripts/revert-watchdog.mjs create-issue --sha <sha> --pr <number>
 *   node scripts/revert-watchdog.mjs close-recovered --sha <green-sha>
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";

/** Pure: builds the original watchdog issue title (format unchanged, #2958). */
export function buildBrokenMainTitle(sha) {
  return `🚨 CRITICAL: Broken Main at commit ${sha}`;
}

/** Pure: builds the original watchdog issue body (culprit/PR detection unchanged). */
export function buildBrokenMainBody(sha, prNumber) {
  return `The main branch CI is currently FAILING.

**Culprit:** commit ${sha}
**PR:** #${prNumber}
**Action Required:** Investigating or revert immediately.`;
}

/**
 * Pure: builds the `gh issue create` args for a broken-main issue. Carries
 * `ci-fix` + `ready` (#2958) alongside the pre-existing `priority:critical`
 * so the implement-queue's Phase 1 (`--label ready`, prioritized by
 * `ci-fix`) actually sees it. `ready` is sourced from `@mbe/gh-client`'s
 * coordination-label machine rather than a re-typed string literal.
 */
export function buildBrokenMainCreateArgs(title, body) {
  return [
    "--title",
    title,
    "--body",
    body,
    "--label",
    "ci-fix",
    "--label",
    COORDINATION_LABELS.READY,
    "--label",
    "priority:critical",
  ];
}

const CULPRIT_SHA_PATTERN = /Broken Main at commit ([0-9a-f]{7,40})/;

/** Pure: extracts the culprit commit SHA from a watchdog issue's title, or null. */
export function extractCulpritSha(issue) {
  const match = CULPRIT_SHA_PATTERN.exec(issue?.title ?? "");
  return match ? match[1] : null;
}

/** Pure: comment posted when auto-closing a recovered watchdog issue. */
export function buildRecoveryComment(greenSha) {
  return `Main has recovered — commit ${greenSha} passed CI and is a descendant of the culprit commit. Auto-closing.`;
}

/**
 * Pure: given open watchdog issues and a precomputed ancestry lookup
 * (culprit SHA -> "is this SHA an ancestor of the green run" boolean),
 * return the issues that should be auto-closed.
 *
 * @param {Array<{number:number, title:string}>} openIssues
 * @param {Record<string, boolean>} ancestryBySha
 * @returns {Array} subset of openIssues (new array; input is not mutated)
 */
export function selectIssuesToClose(openIssues, ancestryBySha) {
  return (openIssues ?? []).filter((issue) => {
    const sha = extractCulpritSha(issue);
    return sha != null && ancestryBySha[sha] === true;
  });
}

/**
 * Auto-close watchdog issues whose culprit commit is now an ancestor of a
 * green main CI run.
 *
 * @param {{
 *   listOpenIssues: () => Promise<Array>,
 *   isAncestor: (culpritSha:string, greenSha:string) => Promise<boolean>,
 *   closeIssue: (number:number, comment:string) => Promise<void>,
 *   greenSha: string,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<number[]>} the issue numbers that were closed
 */
export async function runAutoCloseWatchdog({
  listOpenIssues,
  isAncestor,
  closeIssue,
  greenSha,
  log = () => {},
}) {
  const issues = await listOpenIssues();
  const culpritShas = [...new Set(issues.map(extractCulpritSha).filter((sha) => sha != null))];

  const ancestryBySha = {};
  for (const sha of culpritShas) {
    ancestryBySha[sha] = await isAncestor(sha, greenSha);
  }

  const toClose = selectIssuesToClose(issues, ancestryBySha);
  const comment = buildRecoveryComment(greenSha);

  for (const issue of toClose) {
    await closeIssue(issue.number, comment);
    log(`closed #${issue.number} (recovered at ${greenSha})`);
  }

  return toClose.map((issue) => issue.number);
}

/** True if `culpritSha` is an ancestor of `greenSha` in local git history. */
function isAncestorViaGit(culpritSha, greenSha) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", culpritSha, greenSha], {
      stdio: "ignore",
    });
    return true;
  } catch {
    // Non-zero exit: not an ancestor (or SHA unknown locally) — treat as "not yet recovered".
    return false;
  }
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function createIssue(ghClient, args) {
  const sha = readFlag(args, "--sha");
  const pr = readFlag(args, "--pr") ?? "";

  if (!sha) {
    console.error("Missing --sha <sha>");
    process.exit(1);
  }

  const title = buildBrokenMainTitle(sha);
  const body = buildBrokenMainBody(sha, pr);
  const url = ghClient.issue.create(buildBrokenMainCreateArgs(title, body));
  console.log(url);
}

async function closeRecovered(ghClient, args) {
  const greenSha = readFlag(args, "--sha");

  if (!greenSha) {
    console.error("Missing --sha <green-sha>");
    process.exit(1);
  }

  const closed = await runAutoCloseWatchdog({
    listOpenIssues: async () =>
      ghClient.issue.list([
        "--label",
        "priority:critical",
        "--state",
        "open",
        "--json",
        "number,title",
      ]),
    isAncestor: async (culpritSha) => isAncestorViaGit(culpritSha, greenSha),
    closeIssue: async (number, comment) => ghClient.issue.close(number, ["--comment", comment]),
    greenSha,
    log: (msg) => console.log(`[revert-watchdog] ${msg}`),
  });

  console.log(
    `[revert-watchdog] closed ${closed.length} issue(s): ${
      closed.map((n) => `#${n}`).join(", ") || "none"
    }`
  );
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const ghClient = createGhClient();

  if (subcommand === "create-issue") {
    createIssue(ghClient, rest);
  } else if (subcommand === "close-recovered") {
    await closeRecovered(ghClient, rest);
  } else {
    console.error("Usage: revert-watchdog.mjs <create-issue|close-recovered> [...args]");
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[revert-watchdog] Error: ${err.message}`);
    process.exit(1);
  });
}
