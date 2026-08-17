#!/usr/bin/env node
/**
 * backfill-human-touch-reasons.mjs — one-shot, best-effort backfill of
 * `human_touch_reason` onto existing `metrics/queue-telemetry.jsonl` rows.
 *
 * Part 3 of 4 for the human-touch-reason-telemetry chain (proposal #3805,
 * ideation batch #3806). Part 1 (#3843) shipped the taxonomy, part 2 (#3844)
 * shipped `classifyHumanTouch()`. This script is the caller that decides
 * *which* rows/commits to feed the classifier and writes the result back.
 *
 * "Human touch" signal: author-identity comparison, same idea as
 * `isAgentPr()`'s sibling `prHasNonAuthorCommit()`, with two corrections
 * this repo's real data requires:
 *
 * 1. PR-level bot authors are reported by `gh` with an "app/" login prefix
 *    (`pr.author.login === "app/claude"`) while that same bot's *commits*
 *    carry the unprefixed login (`commit.authors[].login === "claude"`).
 *    Naive string comparison treats every commit from a bot-authored PR as
 *    a "different author" — exactly backwards. The PR author login is
 *    normalized (prefix stripped) before comparing.
 * 2. Some commits differ in author but are still not a human decision:
 *    branch-freshening merges (`Merge branch '...' into ...`,
 *    `Merge remote-tracking branch '...' into ...`) and the
 *    `regen-after-update-branch.sh` hook's fixup commit
 *    (`chore: regenerate stale artifacts`) are automation, regardless of
 *    which identity's credentials pushed them. These are excluded from
 *    consideration outright.
 *
 * A known blind spot, not worked around: commits pushed by `/implement-queue`
 * worktree workers use the operator's own local git identity, so an
 * agent-authored PR opened under that same account has *no* commit-level
 * signal to discriminate agent-vs-human by — every commit shares one login.
 * Per the identity, the row is genuinely unmatchable and is skipped, per
 * #3845's explicit "missing/unmatchable data is fine — skip silently"
 * guidance. This is a real coverage ceiling, not a bug: only PRs opened
 * through the `claude` GitHub App identity are discriminable at all.
 *
 * BEST EFFORT, NOT 100% COVERAGE: rows with no PR, an unreconciled outcome,
 * an unfetchable PR, a PR that doesn't look like an agent PR, a PR whose
 * author identity can't be determined, or a PR where no commit clears both
 * the identity and mechanical-commit checks are left untouched — no field is
 * written, existing values are never overwritten. This matches the
 * classifier's own "directional signal, not ground truth" posture.
 *
 * Idempotent: a row that already carries `human_touch_reason` is never
 * re-fetched or rewritten. Re-running is always safe.
 *
 * Pure core (`backfillHumanTouchReasons`) with dependency injection, matching
 * `reconcile-queue-telemetry.mjs`. GitHub lookups are capped per run
 * (default 50); remaining rows backfill on the next run.
 */

import { execFileSync } from "node:child_process";
import { createGhClient } from "@mbe/gh-client";
import { read, write, resolvePath } from "./metrics-store.mjs";
import { classifyHumanTouch } from "./classify-human-touch.mjs";
import { isAgentPr } from "../plugins/acmm/scripts/pr-outcomes.js";

const DEFAULT_MAX_CALLS = 50;

/** `gh` prefixes a PR-level bot author's login with "app/"; commit-level
 * author logins for that same bot do not carry the prefix. Strip it so both
 * sides compare on the same identity.
 *
 * @param {unknown} login
 * @returns {string}
 */
export function normalizeAuthorLogin(login) {
  if (typeof login !== "string") return "";
  return login.startsWith("app/") ? login.slice(4) : login;
}

const MERGE_COMMIT_RE = /^Merge (branch|pull request|remote-tracking branch) /;
const REGEN_FIXUP_MESSAGE = "chore: regenerate stale artifacts";

/** Branch-freshening merges and the regen-fixup hook's commit are automation,
 * not a human decision, regardless of whose identity pushed them.
 *
 * @param {unknown} messageHeadline
 * @returns {boolean}
 */
export function isMechanicalCommit(messageHeadline) {
  if (typeof messageHeadline !== "string") return false;
  return MERGE_COMMIT_RE.test(messageHeadline) || messageHeadline.trim() === REGEN_FIXUP_MESSAGE;
}

/**
 * The first commit authored by someone other than the (normalized) PR author
 * that isn't mechanical — the closest available signal to "a human decision
 * happened here". Returns -1 when no commit qualifies (including when the PR
 * author identity itself is unknown — nothing to discriminate against).
 *
 * @param {Array<{ authors?: Array<{ login?: string }>, messageHeadline?: string }>} commits
 * @param {string} prAuthorLogin
 * @returns {number}
 */
function findHumanCommitIndex(commits, prAuthorLogin) {
  if (!prAuthorLogin) return -1;
  return commits.findIndex((c) => {
    const authors = Array.isArray(c.authors) ? c.authors : [];
    const sharesAuthor = authors.some((a) => a?.login === prAuthorLogin);
    return !sharesAuthor && !isMechanicalCommit(c.messageHeadline);
  });
}

/**
 * Best-effort CI conclusion for a commit's check runs. Returns "failure" if
 * any check run concluded failure, "success" if at least one concluded and
 * none failed, or null when nothing can be determined — never throws.
 *
 * @param {string|undefined} sha
 * @returns {string|null}
 */
function fetchCiConclusion(sha) {
  if (!sha) return null;
  try {
    const stdout = execFileSync(
      "gh",
      ["api", `repos/{owner}/{repo}/commits/${sha}/check-runs`, "--jq", ".check_runs[].conclusion"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const conclusions = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (conclusions.length === 0) return null;
    return conclusions.includes("failure") ? "failure" : "success";
  } catch {
    return null;
  }
}

/**
 * Default PR detail fetcher — one `gh pr view` per PR (plus, best-effort,
 * one check-runs lookup when a discriminable human commit is found).
 *
 * @param {number} prNumber
 * @param {object} [deps]
 * @param {import("@mbe/gh-client").GhClient} [deps.ghClient]
 * @param {(sha: string|undefined) => string|null} [deps.fetchCiConclusion] - Injectable for tests.
 * @returns {{ pr: { headRefName: string, labels: string[] }, humanCommit: { message: string, ciConclusion: string|null, reviewCommentsBefore: number }|null }}
 */
export function defaultFetchPrDetails(
  prNumber,
  { ghClient = createGhClient(), fetchCiConclusion: fetchCi = fetchCiConclusion } = {}
) {
  const data = ghClient.pr.view(prNumber, ["--json", "author,headRefName,labels,commits,reviews"]);
  const pr = {
    headRefName: data.headRefName,
    labels: Array.isArray(data.labels) ? data.labels.map((l) => l.name) : [],
  };
  const prAuthorLogin = normalizeAuthorLogin(data.author?.login);
  const commits = Array.isArray(data.commits) ? data.commits : [];
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];

  const idx = findHumanCommitIndex(commits, prAuthorLogin);
  if (idx === -1) {
    return { pr, humanCommit: null };
  }

  const humanCommitRaw = commits[idx];
  const message = [humanCommitRaw.messageHeadline, humanCommitRaw.messageBody]
    .filter(Boolean)
    .join("\n");
  const commitMs = Date.parse(humanCommitRaw.authoredDate ?? "");
  const reviewCommentsBefore = reviews.filter((r) => {
    const t = Date.parse(r.submittedAt ?? "");
    return Number.isFinite(t) && Number.isFinite(commitMs) && t < commitMs;
  }).length;

  return {
    pr,
    humanCommit: {
      message,
      ciConclusion: fetchCi(commits[idx - 1]?.oid),
      reviewCommentsBefore,
    },
  };
}

/**
 * Resolve the human-touch reason for one PR, or `null` when the row should be
 * left unclassified — the fetch failed, the PR isn't an agent PR, or no
 * discriminable human commit exists (the "unmatchable" case). Never throws.
 *
 * Shared with `reconcile-queue-telemetry.mjs` (#4239) so the identity
 * normalization and mechanical-commit rules this file already worked out
 * against real repo data have exactly one implementation.
 *
 * @param {number} prNumber
 * @param {(prNumber: number) => { pr: object, humanCommit: object|null }} fetchPrDetails
 * @returns {string|null}
 */
export function resolveHumanTouchReason(prNumber, fetchPrDetails) {
  let details;
  try {
    details = fetchPrDetails(prNumber);
  } catch {
    // Unmatchable (fetch failed, PR gone, transient gh error) — leave
    // unclassified rather than guessing.
    return null;
  }

  if (!details?.pr || !isAgentPr(details.pr)) return null;
  // No rework commit found — no human touch occurred, nothing to classify.
  if (!details.humanCommit) return null;

  return classifyHumanTouch(details.pr, details.humanCommit);
}

/**
 * Backfill `human_touch_reason` onto rows that need it. Pure — returns new
 * row objects, never mutates the input.
 *
 * @param {Array<object>} inputRows - Parsed queue-telemetry rows.
 * @param {object} opts
 * @param {(prNumber: number) => { pr: object, humanCommit: object|null }} opts.fetchPrDetails
 * @param {number} [opts.maxCalls]
 * @returns {{ rows: Array<object>, classified: number, skipped: number, calls: number }}
 */
export function backfillHumanTouchReasons(
  inputRows,
  { fetchPrDetails, maxCalls = DEFAULT_MAX_CALLS }
) {
  let classified = 0;
  let skipped = 0;
  let calls = 0;

  const rows = inputRows.map((row) => {
    if (row.human_touch_reason !== undefined) return { ...row };

    if (row.merged !== true || row.pr_number == null) {
      skipped += 1;
      return { ...row };
    }

    if (calls >= maxCalls) {
      skipped += 1;
      return { ...row };
    }
    calls += 1;

    const reason = resolveHumanTouchReason(row.pr_number, fetchPrDetails);
    if (reason === null) {
      skipped += 1;
      return { ...row };
    }

    classified += 1;
    return { ...row, human_touch_reason: reason };
  });

  return { rows, classified, skipped, calls };
}

/**
 * Read the telemetry sink, backfill, and (unless `dryRun`) write the result
 * back. `root` is injectable so tests operate on a temp fixture, never the
 * real sink.
 *
 * @param {object} opts
 * @param {string} [opts.root]
 * @param {(prNumber: number) => object} opts.fetchPrDetails
 * @param {number} [opts.maxCalls]
 * @param {boolean} [opts.dryRun]
 * @returns {{ classified: number, skipped: number, calls: number, written: boolean }}
 */
export function runBackfill({ root, fetchPrDetails, maxCalls, dryRun = false } = {}) {
  const inputRows = read("queue-telemetry", { root });
  if (!inputRows || inputRows.length === 0) {
    return { classified: 0, skipped: 0, calls: 0, written: false };
  }

  const { rows, classified, skipped, calls } = backfillHumanTouchReasons(inputRows, {
    fetchPrDetails,
    maxCalls,
  });

  const written = !dryRun && classified > 0;
  if (written) {
    write("queue-telemetry", rows, { root });
  }

  return { classified, skipped, calls, written };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes("--dry-run");
  const { classified, skipped, calls, written } = runBackfill({
    fetchPrDetails: defaultFetchPrDetails,
    dryRun,
  });

  process.stdout.write(
    `[backfill-human-touch-reasons] ${classified} classified, ${skipped} skipped ` +
      `(${calls} GitHub lookups)${dryRun ? " [dry-run, not written]" : written ? " → written" : " (nothing to write)"} ` +
      `→ ${resolvePath("queue-telemetry")}\n`
  );
}
