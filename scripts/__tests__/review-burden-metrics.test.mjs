import { describe, it, expect } from "vitest";
import {
  filterByWindow,
  countPrsPerReviewer,
  meanReviewTimePerReviewer,
  rubberStampRatio,
  buildEntry,
  classifyReviewCoverage,
  formatOverallLine,
} from "../acmm/review-burden-metrics.js";

/**
 * Fixture: three closed PRs with reviews.
 *
 * - PR by "alice", reviewed by "bob" (approved 30 min after open) and "carol".
 * - PR by "bob", reviewed by "carol" (approved 2 min after open → rubber-stamp).
 * - PR by "alice", reviewed by "bob" who is also the author of nothing here;
 *   bob approves 120 min after open.
 */
const PRS = [
  {
    author: { login: "alice" },
    createdAt: "2026-06-01T00:00:00Z",
    closedAt: "2026-06-01T02:00:00Z",
    reviews: [
      { author: { login: "bob" }, submittedAt: "2026-06-01T00:30:00Z", state: "APPROVED" },
      { author: { login: "carol" }, submittedAt: "2026-06-01T00:45:00Z", state: "COMMENTED" },
    ],
  },
  {
    author: { login: "bob" },
    createdAt: "2026-06-02T00:00:00Z",
    closedAt: "2026-06-02T00:10:00Z",
    reviews: [
      { author: { login: "carol" }, submittedAt: "2026-06-02T00:02:00Z", state: "APPROVED" },
    ],
  },
  {
    author: { login: "alice" },
    createdAt: "2026-06-03T00:00:00Z",
    closedAt: "2026-06-03T03:00:00Z",
    reviews: [{ author: { login: "bob" }, submittedAt: "2026-06-03T02:00:00Z", state: "APPROVED" }],
  },
];

describe("filterByWindow", () => {
  it("keeps PRs closed at or after the window start", () => {
    const sinceMs = new Date("2026-06-02T00:00:00Z").getTime();
    const result = filterByWindow(PRS, sinceMs);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.author.login)).toEqual(["bob", "alice"]);
  });

  it("drops PRs with a null closedAt", () => {
    const open = [{ author: { login: "x" }, createdAt: "2026-06-02T00:00:00Z", closedAt: null }];
    expect(filterByWindow(open, 0)).toHaveLength(0);
  });
});

describe("countPrsPerReviewer", () => {
  it("counts each PR a reviewer touched, excluding self-reviews", () => {
    const counts = countPrsPerReviewer(PRS);
    // bob reviewed PR0 and PR2 → 2; carol reviewed PR0 and PR1 → 2
    expect(counts).toEqual({ bob: 2, carol: 2 });
  });

  it("does not count an author reviewing their own PR", () => {
    const selfReviewed = [
      {
        author: { login: "alice" },
        createdAt: "2026-06-01T00:00:00Z",
        closedAt: "2026-06-01T01:00:00Z",
        reviews: [
          { author: { login: "alice" }, submittedAt: "2026-06-01T00:05:00Z", state: "APPROVED" },
        ],
      },
    ];
    expect(countPrsPerReviewer(selfReviewed)).toEqual({});
  });
});

describe("meanReviewTimePerReviewer", () => {
  it("computes mean minutes from PR open to each reviewer's first review", () => {
    const means = meanReviewTimePerReviewer(PRS);
    // bob: PR0 30 min, PR2 120 min → mean 75
    expect(means.bob).toBe(75);
    // carol: PR0 45 min, PR1 2 min → mean 23.5
    expect(means.carol).toBe(23.5);
  });
});

describe("rubberStampRatio", () => {
  it("flags approvals submitted within the threshold window", () => {
    const result = rubberStampRatio(PRS, 5);
    // carol approved PR1 2 min after open → rubber-stamp; bob's approvals are 30 & 120 min → clean
    expect(result.perReviewer.carol).toEqual({ total: 1, rubberStamped: 1, ratio: 1 });
    expect(result.perReviewer.bob).toEqual({ total: 2, rubberStamped: 0, ratio: 0 });
    expect(result.overall).toEqual({ total: 3, rubberStamped: 1, ratio: 0.33 });
  });

  it("only counts APPROVED reviews, not COMMENTED", () => {
    const commentOnly = [
      {
        author: { login: "alice" },
        createdAt: "2026-06-01T00:00:00Z",
        closedAt: "2026-06-01T01:00:00Z",
        reviews: [
          { author: { login: "bob" }, submittedAt: "2026-06-01T00:01:00Z", state: "COMMENTED" },
        ],
      },
    ];
    expect(rubberStampRatio(commentOnly, 5).overall.total).toBe(0);
  });
});

describe("buildEntry", () => {
  it("assembles a queryable entry with per-reviewer and summary blocks", () => {
    const entry = buildEntry({ days: 30, thresholdMinutes: 5, prs: PRS });
    expect(entry.window_days).toBe(30);
    expect(entry.total_closed_prs).toBe(3);
    expect(entry.summary.total_reviewers).toBe(2);
    const bob = entry.reviewers.find((r) => r.login === "bob");
    expect(bob).toMatchObject({ prs_reviewed: 2, mean_review_minutes: 75, approvals: 2 });
    expect(typeof entry.timestamp).toBe("string");
  });
});

// #5619. Measured 2026-09-21: `gh pr list --state closed --limit 100 --json
// reviews` returns zero reviews for all 100 PRs, and
// `GET /repos/.../pulls/{n}/reviews` agrees on 0 for the same PR numbers —
// while both sources agree on 1 APPROVED review for PR #3711. The extraction
// is therefore correct and the zero is structural: this repo merges on green
// CI, and its "Automated PR Review" is a check run, not a review submission.
//
// The defect was that a structural zero and a collector that fetched nothing
// both rendered as `total_reviews: 0`, so the marketing panel read a
// no-review-stage repo as a healthy 0% rubber-stamp rate.
describe("classifyReviewCoverage", () => {
  it("reports no-formal-review-stage when PRs were sampled but none carry a review", () => {
    expect(classifyReviewCoverage({ totalClosedPrs: 100, totalReviews: 0 })).toBe(
      "no-formal-review-stage"
    );
  });

  it("reports no-prs-sampled when the sample itself is empty, not a structural zero", () => {
    expect(classifyReviewCoverage({ totalClosedPrs: 0, totalReviews: 0 })).toBe("no-prs-sampled");
  });

  it("reports measured once at least one review is counted", () => {
    expect(classifyReviewCoverage({ totalClosedPrs: 100, totalReviews: 1 })).toBe("measured");
  });
});

describe("buildEntry review-coverage state", () => {
  it("marks a real sample with reviews as measured", () => {
    const entry = buildEntry({ days: 30, thresholdMinutes: 5, prs: PRS });
    expect(entry.summary.review_coverage).toBe("measured");
    expect(entry.summary.no_formal_review_stage).toBe(false);
  });

  it("marks a sample of review-free PRs as a structural zero, not a collector miss", () => {
    const unreviewed = PRS.map((pr) => ({ ...pr, reviews: [] }));
    const entry = buildEntry({ days: 30, thresholdMinutes: 5, prs: unreviewed });
    expect(entry.total_closed_prs).toBe(3);
    expect(entry.summary.total_reviews).toBe(0);
    expect(entry.summary.review_coverage).toBe("no-formal-review-stage");
    expect(entry.summary.no_formal_review_stage).toBe(true);
  });

  it("does not claim a structural zero when nothing was sampled at all", () => {
    const entry = buildEntry({ days: 30, thresholdMinutes: 5, prs: [] });
    expect(entry.summary.review_coverage).toBe("no-prs-sampled");
    expect(entry.summary.no_formal_review_stage).toBe(false);
  });
});

describe("formatOverallLine", () => {
  it("prints the percentage only when a ratio was actually measured", () => {
    const entry = buildEntry({ days: 30, thresholdMinutes: 5, prs: PRS });
    expect(formatOverallLine(entry)).toContain("33.0%");
  });

  it("never prints a percentage for a structural zero", () => {
    const unreviewed = PRS.map((pr) => ({ ...pr, reviews: [] }));
    const line = formatOverallLine(buildEntry({ days: 30, thresholdMinutes: 5, prs: unreviewed }));
    expect(line).not.toMatch(/\d%/);
    expect(line).toContain("no formal review stage");
    expect(line).toContain("3 sampled PRs");
  });

  it("never prints a percentage when nothing was sampled", () => {
    const line = formatOverallLine(buildEntry({ days: 30, thresholdMinutes: 5, prs: [] }));
    expect(line).not.toMatch(/\d%/);
    expect(line).toContain("no PRs in window");
  });
});
