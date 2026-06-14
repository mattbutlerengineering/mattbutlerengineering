import { describe, it, expect } from "vitest";
import {
  filterByWindow,
  countPrsPerReviewer,
  meanReviewTimePerReviewer,
  rubberStampRatio,
  buildEntry,
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
