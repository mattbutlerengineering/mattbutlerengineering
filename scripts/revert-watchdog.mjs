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
 * #3622 adds the baseline/blame decision that used to live as inline bash in
 * `revert-watchdog.yml` ("Check for baseline failure"), which only skipped
 * on an exact `parent_conclusion = "failure"` match — any other value
 * (`cancelled`, `null`, `unknown`, `skipped`, empty) fell through as an
 * innocent parent and blamed the child commit. The fix walks back past
 * inconclusive parents to the nearest conclusive ancestor (capped at
 * `BASELINE_WALK_CAP` commits), and — before proposing a destructive revert
 * on a genuine green-baseline break — checks whether the failing job's test
 * paths even overlap the culprit PR's changed files, downgrading to an
 * issue when they're disjoint. Same design: pure decision functions
 * (`classifyConclusion`, `extractFailingTestPaths`, `pathsAreDisjoint`,
 * `decideBaselineAction`) plus async orchestration with injected
 * collaborators (`walkToBaseline`, `resolveRevertAction`).
 *
 * Usage:
 *   node scripts/revert-watchdog.mjs create-issue --sha <sha> --pr <number>
 *   node scripts/revert-watchdog.mjs close-recovered --sha <green-sha>
 *   node scripts/revert-watchdog.mjs check-baseline --sha <sha> --pr <number> --run-id <id>
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

// ---------------------------------------------------------------------------
// Baseline / blame decision (#3622)
// ---------------------------------------------------------------------------

/** Max ancestors to walk back past inconclusive CI runs before giving up. */
export const BASELINE_WALK_CAP = 10;

const CONCLUSIVE_CONCLUSIONS = new Set(["success", "failure"]);

/**
 * Pure: classifies a `gh run list` conclusion into the three states that
 * matter for blame — a real pass, a real fail, or "we don't actually know"
 * (`cancelled`, `skipped`, `null`, `undefined`, `""`, anything else).
 */
export function classifyConclusion(conclusion) {
  return CONCLUSIVE_CONCLUSIONS.has(conclusion) ? conclusion : "inconclusive";
}

const FAIL_LINE_PATTERN = /FAIL\s+(\S+\.\w+)/g;

/**
 * Pure: extracts the unique file paths named on vitest `FAIL <path> > ...`
 * lines out of `gh run view --log-failed` output. Best-effort — a log
 * format vitest doesn't use yields `[]`, which callers treat as "no
 * evidence either way" rather than an error.
 */
export function extractFailingTestPaths(logText) {
  if (!logText) return [];
  const paths = new Set();
  for (const match of logText.matchAll(FAIL_LINE_PATTERN)) {
    paths.add(match[1]);
  }
  return [...paths];
}

/** The first two path segments — this monorepo's `<category>/<package>` boundary. */
function pathArea(filePath) {
  return filePath.split("/").slice(0, 2).join("/");
}

/**
 * Pure: true when none of `changedFiles` share a package area with any of
 * `failingTestPaths`. Empty input on either side is "not disjoint" — with no
 * evidence of a mismatch, don't downgrade the revert.
 */
export function pathsAreDisjoint(failingTestPaths, changedFiles) {
  if (!failingTestPaths?.length || !changedFiles?.length) return false;
  const failingAreas = new Set(failingTestPaths.map(pathArea));
  return !changedFiles.some((f) => failingAreas.has(pathArea(f)));
}

/**
 * Pure: combines a resolved baseline with the failing-test/changed-file
 * overlap check into the action the workflow should take.
 *
 * @param {{baseline: {sha:string, conclusion:"success"|"failure"}|null, failingTestPaths?:string[], changedFiles?:string[]}} args
 * @returns {{action:"skip"|"issue-only"|"issue-and-revert", reason:string}}
 */
export function decideBaselineAction({ baseline, failingTestPaths = [], changedFiles = [] }) {
  if (baseline?.conclusion === "failure") {
    return {
      action: "skip",
      reason: `parent CI baseline was a pre-existing failure at ${baseline.sha}`,
    };
  }

  if (baseline?.conclusion !== "success") {
    return {
      action: "issue-only",
      reason: `no conclusive CI baseline found within ${BASELINE_WALK_CAP} commits`,
    };
  }

  if (pathsAreDisjoint(failingTestPaths, changedFiles)) {
    return {
      action: "issue-only",
      reason: "failing test paths are disjoint from the culprit PR's changed files",
    };
  }

  return {
    action: "issue-and-revert",
    reason: `genuine break on green baseline ${baseline.sha}`,
  };
}

/**
 * Walks back from `parentSha` through ancestor commits (via injected
 * `getParentSha`), classifying each one's CI conclusion (via injected
 * `getConclusionForSha`) until it finds a conclusive one or hits `cap`.
 *
 * @param {{
 *   parentSha: string,
 *   getConclusionForSha: (sha:string) => Promise<string|null|undefined>,
 *   getParentSha: (sha:string) => Promise<string|null>,
 *   cap?: number,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<{sha:string, conclusion:"success"|"failure"}|null>}
 */
export async function walkToBaseline({
  parentSha,
  getConclusionForSha,
  getParentSha,
  cap = BASELINE_WALK_CAP,
  log = () => {},
}) {
  let sha = parentSha;
  for (let i = 0; i < cap && sha; i++) {
    const conclusion = await getConclusionForSha(sha);
    const classified = classifyConclusion(conclusion);
    if (classified !== "inconclusive") {
      return { sha, conclusion: classified };
    }
    log(`baseline walk: ${sha} was ${conclusion ?? "no CI run found"} — checking its parent`);
    sha = await getParentSha(sha);
  }
  return null;
}

/**
 * Top-level orchestrator: resolves the baseline, then — only for a green
 * baseline, where the overlap check is actually relevant — fetches the
 * failing test paths and the culprit PR's changed files to decide the
 * final action.
 *
 * @param {{
 *   parentSha: string,
 *   prNumber: number|string,
 *   getConclusionForSha: (sha:string) => Promise<string|null|undefined>,
 *   getParentSha: (sha:string) => Promise<string|null>,
 *   getFailingTestPaths: () => Promise<string[]>,
 *   getChangedFiles: (prNumber:number|string) => Promise<string[]>,
 *   cap?: number,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<{action:"skip"|"issue-only"|"issue-and-revert", reason:string}>}
 */
export async function resolveRevertAction({
  parentSha,
  prNumber,
  getConclusionForSha,
  getParentSha,
  getFailingTestPaths,
  getChangedFiles,
  cap = BASELINE_WALK_CAP,
  log = () => {},
}) {
  const baseline = await walkToBaseline({ parentSha, getConclusionForSha, getParentSha, cap, log });

  if (baseline?.conclusion !== "success") {
    return decideBaselineAction({ baseline });
  }

  const [failingTestPaths, changedFiles] = await Promise.all([
    getFailingTestPaths(),
    getChangedFiles(prNumber),
  ]);

  return decideBaselineAction({ baseline, failingTestPaths, changedFiles });
}

// ---------------------------------------------------------------------------
// Revert PR lifecycle (#3691)
//
// A revert PR proposed by "Propose Revert PR" (above) asserts the repo is
// broken. When main is fixed forward instead — the common case, per the
// 2026-08-02 process retro (4 revert PRs opened, 0 merged) — nothing ever
// told the revert PR that. It's left open, a stale false signal.
//
// Design mirrors runAutoCloseWatchdog: pure title/body/decision functions,
// unit-tested without the network; the GitHub mutations live behind injected
// callbacks in runCloseStaleRevertPrs.
// ---------------------------------------------------------------------------

/** Pure: builds a revert PR body carrying a machine-readable link to the
 * breakage issue it was opened for, alongside the pre-existing culprit-PR
 * reference. `extractBreakageIssueNumber` parses the link back out — do not
 * change the "Opened for #<n>" phrasing without updating both. */
export function buildRevertPrBody(culpritPrNumber, issueNumber) {
  return `Automatically proposed revert of #${culpritPrNumber} due to CI failure on main.

Opened for #${issueNumber}.`;
}

const BREAKAGE_ISSUE_PATTERN = /Opened for #(\d+)/;

/** Pure: extracts the breakage-issue number from a revert PR body, or null. */
export function extractBreakageIssueNumber(body) {
  const match = BREAKAGE_ISSUE_PATTERN.exec(body ?? "");
  return match ? Number(match[1]) : null;
}

const REVERT_WATCHDOG_TITLE_PATTERN = /^revert: #\d+ \(fixes broken main\)$/;

/** Pure: true for a PR opened by this script's "Propose Revert PR" step.
 * Deliberately narrower than "any PR titled revert: ..." — the unrelated
 * auto-rollback workflow also opens PRs titled "revert: auto-rollback ..."
 * with no breakage-issue link, and must not be auto-closed by this logic. */
export function isRevertWatchdogPr(pr) {
  return REVERT_WATCHDOG_TITLE_PATTERN.test(pr?.title ?? "");
}

/** Pure: true when a PR carries the `needs-review` label — the escape hatch
 * for a revert that's a human product call (as #3559 was, per #3584), never
 * auto-closed by this logic. */
export function hasNeedsReviewLabel(pr) {
  return (pr?.labels ?? []).some((label) => label?.name === "needs-review");
}

/** Pure: comment posted when auto-closing a revert PR main fixed forward. */
export function buildRevertClosedComment(greenSha) {
  return `Main was fixed forward — commit ${greenSha} passed CI, and the breakage issue this revert was opened for is now closed. Auto-closing; no revert needed.`;
}

/**
 * Pure: the three-input close decision. All three must line up — the
 * breakage issue closed, main green, and no human review flag — before a
 * revert PR is ever auto-closed.
 */
export function shouldCloseRevertPr({ issueState, mainConclusion, hasNeedsReview }) {
  if (hasNeedsReview) return false;
  if (issueState !== "closed") return false;
  if (mainConclusion !== "success") return false;
  return true;
}

/**
 * Pure: given already-filtered revert-watchdog PRs, a lookup of breakage
 * issue state by number, and main's CI conclusion, returns the subset that
 * should be auto-closed (new array; input is not mutated).
 *
 * @param {Array<{number:number, body:string, labels?:Array<{name:string}>}>} prs
 * @param {{issueStateByNumber: Record<number, string>, mainConclusion: string|null}} args
 */
export function selectRevertPrsToClose(prs, { issueStateByNumber, mainConclusion }) {
  return (prs ?? []).filter((pr) => {
    if (hasNeedsReviewLabel(pr)) return false;
    const issueNumber = extractBreakageIssueNumber(pr.body);
    if (issueNumber == null) return false;
    return shouldCloseRevertPr({
      issueState: issueStateByNumber[issueNumber],
      mainConclusion,
      hasNeedsReview: false,
    });
  });
}

/**
 * Auto-close revert PRs whose breakage issue has closed and whose base
 * branch (main) is green. Fetches each unique breakage issue's state once,
 * even when multiple revert PRs reference the same issue.
 *
 * @param {{
 *   listOpenRevertPrs: () => Promise<Array>,
 *   getIssueState: (issueNumber:number) => Promise<string|null>,
 *   getMainConclusion: (mainSha:string) => Promise<string|null>,
 *   closePr: (number:number, comment:string) => Promise<void>,
 *   mainSha: string,
 *   log?: (msg:string) => void,
 * }} deps
 * @returns {Promise<number[]>} the PR numbers that were closed
 */
export async function runCloseStaleRevertPrs({
  listOpenRevertPrs,
  getIssueState,
  getMainConclusion,
  closePr,
  mainSha,
  log = () => {},
}) {
  const revertPrs = (await listOpenRevertPrs()).filter(isRevertWatchdogPr);
  if (revertPrs.length === 0) return [];

  const mainConclusion = await getMainConclusion(mainSha);

  const issueNumbers = [
    ...new Set(revertPrs.map((pr) => extractBreakageIssueNumber(pr.body)).filter((n) => n != null)),
  ];
  const issueStateByNumber = {};
  for (const issueNumber of issueNumbers) {
    issueStateByNumber[issueNumber] = await getIssueState(issueNumber);
  }

  const toClose = selectRevertPrsToClose(revertPrs, { issueStateByNumber, mainConclusion });
  const comment = buildRevertClosedComment(mainSha);

  for (const pr of toClose) {
    await closePr(pr.number, comment);
    log(`closed #${pr.number} (breakage issue closed, main green at ${mainSha})`);
  }

  return toClose.map((pr) => pr.number);
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

/** The parent SHA of `sha` in local git history, or null at the root commit. */
function getParentShaViaGit(sha) {
  try {
    return execFileSync("git", ["rev-parse", `${sha}^`], { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Failing test file paths for a CI run, via `gh run view --log-failed`.
 * Best-effort: any failure to fetch/parse the log (run too old, log
 * expired, network hiccup) yields `[]` — "no evidence of overlap", which
 * `decideBaselineAction` already treats as "not disjoint" (fail-safe: don't
 * downgrade a genuine revert just because the log was unavailable).
 */
function getFailingTestPathsViaGh(runId) {
  if (!runId) return [];
  try {
    const log = execFileSync("gh", ["run", "view", runId, "--log-failed"], {
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return extractFailingTestPaths(log);
  } catch {
    return [];
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

/**
 * Resolves the baseline/blame decision for a culprit commit and prints it as
 * a single-line JSON object (`{action, reason}`) for the workflow to parse
 * with `jq`. `--sha` is the culprit commit; its parent is where the baseline
 * walk starts. `--run-id` (the failing CI run's database id) and `--pr` are
 * optional — omitting either just means the overlap check runs with no
 * evidence, which is never treated as grounds to downgrade a revert.
 */
async function checkBaseline(ghClient, args) {
  const sha = readFlag(args, "--sha");
  const pr = readFlag(args, "--pr");
  const runId = readFlag(args, "--run-id");

  if (!sha) {
    console.error("Missing --sha <culprit-sha>");
    process.exit(1);
  }

  const result = await resolveRevertAction({
    parentSha: getParentShaViaGit(sha),
    prNumber: pr,
    getConclusionForSha: async (candidateSha) => {
      try {
        const runs = ghClient.workflow.runs([
          "--commit",
          candidateSha,
          "--workflow",
          "CI",
          "--json",
          "conclusion",
        ]);
        return runs[0]?.conclusion ?? null;
      } catch {
        // gh transient failure (rate limit, network) — treated as inconclusive,
        // same as the original bash's `2>/dev/null || echo "unknown"` fallback.
        return null;
      }
    },
    getParentSha: async (candidateSha) => getParentShaViaGit(candidateSha),
    getFailingTestPaths: async () => getFailingTestPathsViaGh(runId),
    getChangedFiles: async () => {
      if (!pr) return [];
      const view = ghClient.pr.view(Number(pr), ["--json", "files"]);
      return (view?.files ?? []).map((f) => f.path);
    },
    log: (msg) => console.error(`[revert-watchdog] ${msg}`),
  });

  console.log(JSON.stringify(result));
}

/**
 * Prints the revert PR body (with its machine-readable breakage-issue link)
 * for the workflow's "Propose Revert PR" step to pass to `gh pr create --body`.
 * A missing `--issue` (both issue-filing attempts upstream failed) degrades
 * to the pre-#3691 unlinked body rather than aborting — this revert PR is
 * the one thing that unbreaks main, and a missing link only means it won't
 * be auto-closed later, not that it shouldn't be opened at all.
 */
function revertPrBody(args) {
  const pr = readFlag(args, "--pr");
  const issue = readFlag(args, "--issue");

  if (!pr) {
    console.error("Missing --pr <culprit-pr-number>");
    process.exit(1);
  }

  if (!issue) {
    console.log(`Automatically proposed revert of #${pr} due to CI failure on main.`);
    return;
  }

  console.log(buildRevertPrBody(pr, issue));
}

/**
 * Auto-closes open revert PRs (opened by "Propose Revert PR" above) whose
 * breakage issue has since closed and whose base branch (main) is green at
 * `--sha`. See `runCloseStaleRevertPrs` for the decision logic.
 */
async function closeStaleReverts(ghClient, args) {
  const mainSha = readFlag(args, "--sha");

  if (!mainSha) {
    console.error("Missing --sha <main-sha>");
    process.exit(1);
  }

  const closed = await runCloseStaleRevertPrs({
    listOpenRevertPrs: async () =>
      ghClient.pr.list([
        "--search",
        "revert: in:title",
        "--state",
        "open",
        "--json",
        "number,title,body,labels",
      ]),
    getIssueState: async (issueNumber) => {
      try {
        const view = ghClient.issue.view(issueNumber, ["--json", "state"]);
        return typeof view?.state === "string" ? view.state.toLowerCase() : null;
      } catch {
        // gh transient failure or deleted issue — treated as inconclusive,
        // same fail-safe fallback as checkBaseline's getConclusionForSha.
        return null;
      }
    },
    getMainConclusion: async (sha) => {
      try {
        const runs = ghClient.workflow.runs([
          "--commit",
          sha,
          "--workflow",
          "CI",
          "--json",
          "conclusion",
        ]);
        return runs[0]?.conclusion ?? null;
      } catch {
        return null;
      }
    },
    closePr: async (number, comment) => ghClient.pr.close(number, ["--comment", comment]),
    mainSha,
    log: (msg) => console.log(`[revert-watchdog] ${msg}`),
  });

  console.log(
    `[revert-watchdog] closed ${closed.length} revert PR(s): ${
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
  } else if (subcommand === "check-baseline") {
    await checkBaseline(ghClient, rest);
  } else if (subcommand === "revert-pr-body") {
    revertPrBody(rest);
  } else if (subcommand === "close-stale-reverts") {
    await closeStaleReverts(ghClient, rest);
  } else {
    console.error(
      "Usage: revert-watchdog.mjs <create-issue|close-recovered|check-baseline|revert-pr-body|close-stale-reverts> [...args]"
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[revert-watchdog] Error: ${err.message}`);
    process.exit(1);
  });
}
