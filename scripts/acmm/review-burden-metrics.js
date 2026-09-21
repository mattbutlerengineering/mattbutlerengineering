#!/usr/bin/env node

/**
 * Review Burden Metrics — detects human review fatigue signals.
 *
 * As agent PR volume increases, reviewers may rubber-stamp approvals
 * undetected. This script computes per-reviewer workload metrics to
 * surface fatigue before quality degrades.
 *
 * Metrics computed:
 *   - PRs per reviewer in a 7-day window
 *   - Mean review turnaround time per reviewer
 *   - Rubber-stamp ratio (PRs approved < 5 min after creation)
 *
 * Usage:
 *   node scripts/acmm/review-burden-metrics.js               # default: 7-day window
 *   node scripts/acmm/review-burden-metrics.js --days 14      # custom window
 *   node scripts/acmm/review-burden-metrics.js --dry-run      # stdout only, no file write
 *   node scripts/acmm/review-burden-metrics.js --threshold 10 # custom rubber-stamp minutes
 *
 * Closes #1086
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { read, write, resolvePath } from "../metrics-store.mjs";

const METRICS_PATH = resolvePath("review-burden");

const RUBBER_STAMP_DEFAULT_MINUTES = 5;

/* ── CLI args ────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? "7", 10) : 7;

  const threshIdx = args.indexOf("--threshold");
  const thresholdMinutes =
    threshIdx >= 0
      ? parseInt(args[threshIdx + 1] ?? String(RUBBER_STAMP_DEFAULT_MINUTES), 10)
      : RUBBER_STAMP_DEFAULT_MINUTES;

  return { dryRun, days, thresholdMinutes };
}

/* ── Data fetching ───────────────────────────────────────── */

/**
 * @typedef {{
 *   author: { login: string },
 *   reviews: Array<{ author: { login: string }, submittedAt: string, state: string }>,
 *   createdAt: string,
 *   closedAt: string | null
 * }} ClosedPR
 */

/**
 * Fetch closed PRs from GitHub CLI.
 *
 * @param {number} limit
 * @returns {ClosedPR[]}
 */
function fetchClosedPrs(limit) {
  const raw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "closed",
      "--limit",
      String(limit),
      "--json",
      "author,reviews,createdAt,closedAt",
    ],
    { encoding: "utf-8" }
  );
  return JSON.parse(raw);
}

/**
 * Filter PRs to those closed within the given window.
 *
 * @param {ClosedPR[]} prs
 * @param {number} sinceMs - epoch ms for window start
 * @returns {ClosedPR[]}
 */
function filterByWindow(prs, sinceMs) {
  return prs.filter((pr) => {
    if (!pr.closedAt) return false;
    return new Date(pr.closedAt).getTime() >= sinceMs;
  });
}

/* ── Metric calculations (pure functions) ────────────────── */

/**
 * Count PRs reviewed per reviewer.
 *
 * @param {ClosedPR[]} prs
 * @returns {Record<string, number>}
 */
function countPrsPerReviewer(prs) {
  /** @type {Record<string, Set<number>>} */
  const reviewerPrSets = {};

  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i];
    for (const review of pr.reviews ?? []) {
      const login = review.author?.login;
      if (!login) continue;
      // Skip self-reviews (author reviewing their own PR)
      if (login === pr.author?.login) continue;
      if (!reviewerPrSets[login]) {
        reviewerPrSets[login] = new Set();
      }
      reviewerPrSets[login].add(i);
    }
  }

  /** @type {Record<string, number>} */
  const counts = {};
  for (const [login, prSet] of Object.entries(reviewerPrSets)) {
    counts[login] = prSet.size;
  }
  return counts;
}

/**
 * Calculate mean review turnaround time per reviewer (in minutes).
 * Turnaround = time from PR creation to first review by that reviewer.
 *
 * @param {ClosedPR[]} prs
 * @returns {Record<string, number>}
 */
function meanReviewTimePerReviewer(prs) {
  /** @type {Record<string, number[]>} */
  const reviewerTimes = {};

  for (const pr of prs) {
    const createdMs = new Date(pr.createdAt).getTime();

    // Group reviews by reviewer, take earliest per reviewer
    /** @type {Record<string, number>} */
    const firstReviewByReviewer = {};

    for (const review of pr.reviews ?? []) {
      const login = review.author?.login;
      if (!login) continue;
      if (login === pr.author?.login) continue;
      const reviewedMs = new Date(review.submittedAt).getTime();
      if (!firstReviewByReviewer[login] || reviewedMs < firstReviewByReviewer[login]) {
        firstReviewByReviewer[login] = reviewedMs;
      }
    }

    for (const [login, reviewedMs] of Object.entries(firstReviewByReviewer)) {
      const turnaroundMinutes = (reviewedMs - createdMs) / (1000 * 60);
      if (!reviewerTimes[login]) {
        reviewerTimes[login] = [];
      }
      reviewerTimes[login].push(turnaroundMinutes);
    }
  }

  /** @type {Record<string, number>} */
  const means = {};
  for (const [login, times] of Object.entries(reviewerTimes)) {
    const sum = times.reduce((acc, t) => acc + t, 0);
    means[login] = Math.round((sum / times.length) * 100) / 100;
  }
  return means;
}

/**
 * Calculate rubber-stamp ratio per reviewer.
 * A rubber-stamp is an approval submitted within `thresholdMinutes` of PR creation.
 *
 * @param {ClosedPR[]} prs
 * @param {number} thresholdMinutes
 * @returns {{ perReviewer: Record<string, { total: number, rubberStamped: number, ratio: number }>, overall: { total: number, rubberStamped: number, ratio: number } }}
 */
function rubberStampRatio(prs, thresholdMinutes) {
  const thresholdMs = thresholdMinutes * 60 * 1000;

  /** @type {Record<string, { total: number, rubberStamped: number }>} */
  const perReviewer = {};
  let overallTotal = 0;
  let overallStamped = 0;

  for (const pr of prs) {
    const createdMs = new Date(pr.createdAt).getTime();

    // Deduplicate: one vote per reviewer per PR (earliest approval wins)
    /** @type {Record<string, { approved: boolean, firstApprovalMs: number | null }>} */
    const reviewerVotes = {};

    for (const review of pr.reviews ?? []) {
      const login = review.author?.login;
      if (!login) continue;
      if (login === pr.author?.login) continue;

      if (!reviewerVotes[login]) {
        reviewerVotes[login] = { approved: false, firstApprovalMs: null };
      }

      if (review.state === "APPROVED") {
        const submittedMs = new Date(review.submittedAt).getTime();
        reviewerVotes[login] = {
          ...reviewerVotes[login],
          approved: true,
          firstApprovalMs:
            reviewerVotes[login].firstApprovalMs === null
              ? submittedMs
              : Math.min(reviewerVotes[login].firstApprovalMs, submittedMs),
        };
      }
    }

    for (const [login, vote] of Object.entries(reviewerVotes)) {
      if (!vote.approved) continue;

      if (!perReviewer[login]) {
        perReviewer[login] = { total: 0, rubberStamped: 0 };
      }
      perReviewer[login] = {
        ...perReviewer[login],
        total: perReviewer[login].total + 1,
      };
      overallTotal++;

      const elapsed = vote.firstApprovalMs - createdMs;
      if (elapsed < thresholdMs) {
        perReviewer[login] = {
          ...perReviewer[login],
          rubberStamped: perReviewer[login].rubberStamped + 1,
        };
        overallStamped++;
      }
    }
  }

  /** @type {Record<string, { total: number, rubberStamped: number, ratio: number }>} */
  const perReviewerWithRatio = {};
  for (const [login, data] of Object.entries(perReviewer)) {
    perReviewerWithRatio[login] = {
      ...data,
      ratio: data.total === 0 ? 0 : Math.round((data.rubberStamped / data.total) * 100) / 100,
    };
  }

  return {
    perReviewer: perReviewerWithRatio,
    overall: {
      total: overallTotal,
      rubberStamped: overallStamped,
      ratio: overallTotal === 0 ? 0 : Math.round((overallStamped / overallTotal) * 100) / 100,
    },
  };
}

/* ── Review-coverage classification ──────────────────────── */

/**
 * The three ways a review count can end up at zero, kept distinguishable so a
 * consumer can never read one as the other (#5619).
 *
 * Measured 2026-09-21 on this repo: `gh pr list --state closed --limit 100
 * --json reviews` reports zero reviews on all 100 PRs, and
 * `GET /repos/.../pulls/{n}/reviews` independently agrees on 0 for the same PR
 * numbers — while both sources agree on 1 APPROVED review for PR #3711. So the
 * extraction is correct and the zero is structural: PRs here merge on green CI,
 * and the "Automated PR Review" that runs on every one of them is a GitHub
 * *check run*, not a `PullRequestReview` submission. Only 3 PRs in the repo's
 * entire history carry a formal review (#397, #3687, #3711).
 *
 * Without this field a structural zero and a collector that fetched nothing
 * both serialize as `total_reviews: 0`, which is the silent-zero defect class
 * documented in `.claude/rules/gotchas.md` § Metrics / staleness detection.
 */
const REVIEW_COVERAGE = {
  /** At least one formal review was counted — the burden metrics mean something. */
  MEASURED: "measured",
  /** PRs were sampled, none carried a formal review. An honest structural zero. */
  NO_FORMAL_REVIEW_STAGE: "no-formal-review-stage",
  /** Nothing was sampled, so nothing was assessed. Never a clean bill of health. */
  NO_PRS_SAMPLED: "no-prs-sampled",
};

/**
 * Classify why (or whether) the review counts are zero.
 *
 * @param {{ totalClosedPrs: number, totalReviews: number }} counts
 * @returns {"measured"|"no-formal-review-stage"|"no-prs-sampled"}
 */
function classifyReviewCoverage({ totalClosedPrs, totalReviews }) {
  if (totalClosedPrs <= 0) return REVIEW_COVERAGE.NO_PRS_SAMPLED;
  if (totalReviews <= 0) return REVIEW_COVERAGE.NO_FORMAL_REVIEW_STAGE;
  return REVIEW_COVERAGE.MEASURED;
}

/* ── Output / persistence ────────────────────────────────── */

/**
 * Build the final metrics entry.
 *
 * @param {object} params
 * @param {number} params.days
 * @param {number} params.thresholdMinutes
 * @param {ClosedPR[]} params.prs
 * @returns {object}
 */
function buildEntry({ days, thresholdMinutes, prs }) {
  const prsPerReviewer = countPrsPerReviewer(prs);
  const meanTimes = meanReviewTimePerReviewer(prs);
  const stamps = rubberStampRatio(prs, thresholdMinutes);

  const totalClosedPrs = prs.length;
  const totalReviews = Object.values(prsPerReviewer).reduce((a, b) => a + b, 0);
  const reviewCoverage = classifyReviewCoverage({ totalClosedPrs, totalReviews });

  return {
    timestamp: new Date().toISOString(),
    window_days: days,
    rubber_stamp_threshold_minutes: thresholdMinutes,
    total_closed_prs: totalClosedPrs,
    reviewers: Object.keys(prsPerReviewer).map((login) => ({
      login,
      prs_reviewed: prsPerReviewer[login] ?? 0,
      mean_review_minutes: meanTimes[login] ?? null,
      approvals: stamps.perReviewer[login]?.total ?? 0,
      rubber_stamps: stamps.perReviewer[login]?.rubberStamped ?? 0,
      rubber_stamp_ratio: stamps.perReviewer[login]?.ratio ?? 0,
    })),
    summary: {
      total_reviewers: Object.keys(prsPerReviewer).length,
      total_reviews: totalReviews,
      overall_rubber_stamp_ratio: stamps.overall.ratio,
      overall_rubber_stamps: stamps.overall.rubberStamped,
      overall_approvals: stamps.overall.total,
      // #5619: the reason behind a zero, so a consumer never has to guess.
      review_coverage: reviewCoverage,
      no_formal_review_stage: reviewCoverage === REVIEW_COVERAGE.NO_FORMAL_REVIEW_STAGE,
    },
  };
}

/**
 * Render the overall rubber-stamp line.
 *
 * #5619: a 0.0% ratio reads as a clean result, so a zero is never printed as a
 * percentage — the line says which kind of zero it is instead.
 *
 * @param {object} entry
 * @returns {string}
 */
function formatOverallLine(entry) {
  const { review_coverage, overall_rubber_stamp_ratio, overall_rubber_stamps, overall_approvals } =
    entry.summary;

  if (review_coverage === REVIEW_COVERAGE.NO_FORMAL_REVIEW_STAGE) {
    return (
      "  Overall rubber-stamp ratio: not measured — no formal review stage.\n" +
      `  All ${entry.total_closed_prs} sampled PRs merged with zero GitHub review submissions.`
    );
  }
  if (review_coverage === REVIEW_COVERAGE.NO_PRS_SAMPLED) {
    return "  Overall rubber-stamp ratio: not measured — no PRs in window.";
  }
  return (
    `  Overall rubber-stamp ratio: ${(overall_rubber_stamp_ratio * 100).toFixed(1)}% ` +
    `(${overall_rubber_stamps}/${overall_approvals})`
  );
}

/**
 * Print a human-readable summary to stdout.
 *
 * @param {object} entry
 */
function printSummary(entry) {
  console.log("");
  console.log(`Review burden metrics — last ${entry.window_days} days`);
  console.log(`Rubber-stamp threshold: < ${entry.rubber_stamp_threshold_minutes} minutes`);
  console.log("");
  console.log(`  Closed PRs in window: ${entry.total_closed_prs}`);
  console.log(`  Unique reviewers:     ${entry.summary.total_reviewers}`);
  console.log(`  Total reviews:        ${entry.summary.total_reviews}`);
  console.log("");

  if (entry.reviewers.length > 0) {
    console.log("  Per-reviewer breakdown:");
    for (const r of entry.reviewers) {
      const meanStr = r.mean_review_minutes !== null ? `${r.mean_review_minutes} min` : "n/a";
      console.log(
        `    ${r.login}: ${r.prs_reviewed} PRs, mean ${meanStr}, ` +
          `rubber-stamp ${(r.rubber_stamp_ratio * 100).toFixed(1)}% (${r.rubber_stamps}/${r.approvals})`
      );
    }
    console.log("");
  }

  console.log(formatOverallLine(entry));
  console.log("");
}

/**
 * Persist the entry by appending to the metrics JSON file.
 *
 * @param {object} entry
 */
function persistEntry(entry) {
  let entries = [];
  try {
    const existing = read("review-burden");
    if (Array.isArray(existing)) {
      entries = existing;
    } else if (existing !== null) {
      console.error(`Expected array in ${METRICS_PATH}, got ${typeof existing}. Resetting.`);
    }
  } catch {
    console.error(`Failed to parse ${METRICS_PATH}. Starting fresh.`);
  }

  const updated = [...entries, entry];
  write("review-burden", updated);

  console.log(`Appended entry to: ${METRICS_PATH}`);
  console.log(`Total entries: ${updated.length}`);
}

/* ── Main ────────────────────────────────────────────────── */

function main() {
  const { dryRun, days, thresholdMinutes } = parseArgs(process.argv);

  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  let allPrs;
  try {
    allPrs = fetchClosedPrs(100);
  } catch (err) {
    console.error(`Failed to fetch PRs: ${err.message}`);
    process.exit(1);
  }

  const prs = filterByWindow(allPrs, sinceMs);
  const entry = buildEntry({ days, thresholdMinutes, prs });

  printSummary(entry);

  if (dryRun) {
    console.log("--dry-run: not writing. Entry would have been:");
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  persistEntry(entry);
}

/* ── Exports (pure metric functions, testable) ───────────── */

export {
  parseArgs,
  filterByWindow,
  countPrsPerReviewer,
  meanReviewTimePerReviewer,
  rubberStampRatio,
  buildEntry,
  classifyReviewCoverage,
  formatOverallLine,
  REVIEW_COVERAGE,
};

/* Only run the collector when invoked directly, not when imported by tests. */
const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
