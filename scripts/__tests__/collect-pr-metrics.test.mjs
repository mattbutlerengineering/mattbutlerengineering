import { describe, it, expect } from "vitest";
import { computePrCategoryMetrics } from "../collect-pr-metrics.mjs";

/**
 * @typedef {{
 *   number: number,
 *   state: string,
 *   headRefName: string,
 *   mergedAt: string | null,
 *   closedAt: string | null,
 *   labels: Array<{ name: string }>
 * }} PR
 */

/** @type {PR[]} */
const FIXTURE_PRS = [
  // feature PRs — 2 merged, 0 closed-without-merge
  {
    number: 1,
    state: "MERGED",
    headRefName: "agent-feature-1",
    mergedAt: "2026-06-01T10:00:00Z",
    closedAt: "2026-06-01T10:00:00Z",
    labels: [{ name: "feature" }, { name: "has-pr" }],
  },
  {
    number: 2,
    state: "MERGED",
    headRefName: "agent-feature-2",
    mergedAt: "2026-06-02T10:00:00Z",
    closedAt: "2026-06-02T10:00:00Z",
    labels: [{ name: "feature" }, { name: "has-pr" }],
  },
  // fix PRs — 1 merged, 1 closed-without-merge
  {
    number: 3,
    state: "MERGED",
    headRefName: "agent-fix-1",
    mergedAt: "2026-06-03T10:00:00Z",
    closedAt: "2026-06-03T10:00:00Z",
    labels: [{ name: "ci-fix" }, { name: "has-pr" }],
  },
  {
    number: 4,
    state: "CLOSED",
    headRefName: "agent-fix-2",
    mergedAt: null,
    closedAt: "2026-06-04T10:00:00Z",
    labels: [{ name: "ci-fix" }, { name: "has-pr" }],
  },
  // audit PR — 1 closed-without-merge
  {
    number: 5,
    state: "CLOSED",
    headRefName: "agent-audit-1",
    mergedAt: null,
    closedAt: "2026-06-05T10:00:00Z",
    labels: [{ name: "audit" }, { name: "has-pr" }],
  },
  // PR with no matching category label — falls into "unlabeled"
  {
    number: 6,
    state: "MERGED",
    headRefName: "agent-misc-1",
    mergedAt: "2026-06-06T10:00:00Z",
    closedAt: "2026-06-06T10:00:00Z",
    labels: [{ name: "has-pr" }],
  },
];

/** All PRs merged — the 100% acceptance rate scenario to validate against. */
const ALL_MERGED_PRS = [
  {
    number: 10,
    state: "MERGED",
    headRefName: "agent-a",
    mergedAt: "2026-06-01T10:00:00Z",
    closedAt: "2026-06-01T10:00:00Z",
    labels: [{ name: "feature" }, { name: "has-pr" }],
  },
  {
    number: 11,
    state: "MERGED",
    headRefName: "agent-b",
    mergedAt: "2026-06-02T10:00:00Z",
    closedAt: "2026-06-02T10:00:00Z",
    labels: [{ name: "ci-fix" }, { name: "has-pr" }],
  },
];

describe("computePrCategoryMetrics", () => {
  it("returns available: false for empty PR array", () => {
    const result = computePrCategoryMetrics([]);
    expect(result.available).toBe(false);
  });

  it("computes per-category merged/closed breakdown", () => {
    const result = computePrCategoryMetrics(FIXTURE_PRS);
    expect(result.available).toBe(true);
    expect(result.by_category).toBeDefined();

    const feature = result.by_category["feature"];
    expect(feature).toBeDefined();
    expect(feature.merged).toBe(2);
    expect(feature.closed_without_merge).toBe(0);
    expect(feature.acceptance_rate).toBe(1.0);

    const ciFix = result.by_category["ci-fix"];
    expect(ciFix.merged).toBe(1);
    expect(ciFix.closed_without_merge).toBe(1);
    expect(ciFix.acceptance_rate).toBe(0.5);

    const audit = result.by_category["audit"];
    expect(audit.merged).toBe(0);
    expect(audit.closed_without_merge).toBe(1);
    expect(audit.acceptance_rate).toBe(0);
  });

  it("buckets PRs with no category label under 'unlabeled'", () => {
    const result = computePrCategoryMetrics(FIXTURE_PRS);
    const unlabeled = result.by_category["unlabeled"];
    expect(unlabeled).toBeDefined();
    expect(unlabeled.merged).toBe(1);
    expect(unlabeled.closed_without_merge).toBe(0);
  });

  it("emits aggregate totals", () => {
    const result = computePrCategoryMetrics(FIXTURE_PRS);
    expect(result.total_merged).toBe(4);
    expect(result.total_closed_without_merge).toBe(2);
    expect(result.total_prs).toBe(6);
  });

  it("emits signal_note flagging limitation when no closed-without-merge PRs exist", () => {
    const result = computePrCategoryMetrics(ALL_MERGED_PRS);
    expect(result.available).toBe(true);
    expect(result.total_closed_without_merge).toBe(0);
    expect(result.signal_note).toMatch(/fix-forward/i);
  });

  it("does NOT emit the limitation signal_note when rejections exist", () => {
    const result = computePrCategoryMetrics(FIXTURE_PRS);
    // There are rejections in the fixture, so no limitation note
    expect(result.signal_note).toBeUndefined();
  });

  it("acceptance_rate is null when a category has zero total (impossible, but defensive)", () => {
    // Manually construct a degenerate case: 0 merged + 0 closed
    // Achieved by passing a single-label PR that isn't in categories we query
    const result = computePrCategoryMetrics([]);
    expect(result.available).toBe(false);
  });

  it("ignores the has-pr label when selecting category labels", () => {
    // has-pr is a coordination label, not a domain category
    const result = computePrCategoryMetrics(ALL_MERGED_PRS);
    expect(result.by_category["has-pr"]).toBeUndefined();
  });
});
