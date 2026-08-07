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
 * "Human touch" signal: in this repo, agent worktree commits and any
 * follow-up fixup commits are pushed under the same GitHub account (there is
 * no separate bot identity), so commit-author-login comparison — the
 * approach `isAgentPr()`'s sibling `prHasNonAuthorCommit()` uses elsewhere —
 * cannot distinguish an agent's own commit from a later manual fixup here.
 * The practical, observable proxy is `commits.length > 1`: a merged agent PR
 * that landed in more than one commit needed *some* additional touch beyond
 * the worker's initial submission. The first commit after the original
 * (`commits[1]`) is treated as that touch and fed to `classifyHumanTouch()`.
 *
 * BEST EFFORT, NOT 100% COVERAGE: rows with no PR, an unreconciled outcome,
 * an unfetchable PR, a PR that doesn't look like an agent PR, or no rework
 * commit are left untouched — no field is written, existing values are never
 * overwritten. This matches the classifier's own "directional signal, not
 * ground truth" posture.
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
 * one check-runs lookup when a rework commit exists).
 *
 * @param {number} prNumber
 * @param {import("@mbe/gh-client").GhClient} [ghClient]
 * @returns {{ pr: { headRefName: string, labels: string[] }, humanCommit: { message: string, ciConclusion: string|null, reviewCommentsBefore: number }|null }}
 */
export function defaultFetchPrDetails(prNumber, ghClient = createGhClient()) {
  const data = ghClient.pr.view(prNumber, ["--json", "headRefName,labels,commits,reviews"]);
  const pr = {
    headRefName: data.headRefName,
    labels: Array.isArray(data.labels) ? data.labels.map((l) => l.name) : [],
  };
  const commits = Array.isArray(data.commits) ? data.commits : [];
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];

  if (commits.length < 2) {
    return { pr, humanCommit: null };
  }

  const reworkCommit = commits[1];
  const message = [reworkCommit.messageHeadline, reworkCommit.messageBody]
    .filter(Boolean)
    .join("\n");
  const commitMs = Date.parse(reworkCommit.authoredDate ?? "");
  const reviewCommentsBefore = reviews.filter((r) => {
    const t = Date.parse(r.submittedAt ?? "");
    return Number.isFinite(t) && Number.isFinite(commitMs) && t < commitMs;
  }).length;

  return {
    pr,
    humanCommit: {
      message,
      ciConclusion: fetchCiConclusion(commits[0]?.oid),
      reviewCommentsBefore,
    },
  };
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

    let details;
    try {
      details = fetchPrDetails(row.pr_number);
    } catch {
      // Unmatchable (fetch failed, PR gone, transient gh error) — leave
      // pending for the next run rather than guessing.
      skipped += 1;
      return { ...row };
    }

    if (!details?.pr || !isAgentPr(details.pr)) {
      skipped += 1;
      return { ...row };
    }
    if (!details.humanCommit) {
      // No rework commit found — no human touch occurred, nothing to classify.
      skipped += 1;
      return { ...row };
    }

    const reason = classifyHumanTouch(details.pr, details.humanCommit);
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
