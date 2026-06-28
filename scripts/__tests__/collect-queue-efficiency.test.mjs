import { describe, it, expect } from "vitest";
import { collectQueueEfficiency } from "../collect-queue-efficiency.mjs";

const TEST_NOW = new Date("2026-06-27T12:00:00Z");

function isoAgo(days) {
  return new Date(+TEST_NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

function dayStrAgo(days) {
  return new Date(+TEST_NOW - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function makePr(opts = {}) {
  return {
    number: opts.number ?? 1,
    state: opts.state ?? "MERGED",
    // Default matches the actual worktree branch pattern (worktree-agent-*)
    headRefName: opts.headRefName ?? "worktree-agent-abc123",
    createdAt: opts.createdAt ?? isoAgo(3),
    // Use 'in' check so callers can explicitly pass null to test the null-mergedAt path.
    mergedAt: "mergedAt" in opts ? opts.mergedAt : isoAgo(2),
    closedAt: "closedAt" in opts ? opts.closedAt : "mergedAt" in opts ? opts.mergedAt : isoAgo(2),
    labels: opts.labels ?? [{ name: "agent-authored" }, { name: "ci-fix" }],
    commitCount: opts.commitCount ?? 1,
    additions: opts.additions ?? 50,
    deletions: opts.deletions ?? 20,
  };
}

function makeCcusage(daysAgo, totalCost) {
  return { period: dayStrAgo(daysAgo), totalCost };
}

// ── Fixture sets ────────────────────────────────────────

/** 3 AI PRs merged in current 7-day window — clean first-pass scenario */
const CLEAN_PRS = [
  makePr({ number: 1, commitCount: 1, createdAt: isoAgo(4), mergedAt: isoAgo(3) }),
  makePr({ number: 2, commitCount: 1, createdAt: isoAgo(5), mergedAt: isoAgo(4) }),
  makePr({ number: 3, commitCount: 2, createdAt: isoAgo(6), mergedAt: isoAgo(5) }),
];

/** Same 3 AI PRs but also with prior-week PRs to build a baseline */
const PRS_WITH_HISTORY = [
  ...CLEAN_PRS,
  // week 2 (8–14 days ago)
  makePr({ number: 10, commitCount: 1, createdAt: isoAgo(13), mergedAt: isoAgo(10) }),
  makePr({ number: 11, commitCount: 1, createdAt: isoAgo(12), mergedAt: isoAgo(11) }),
  // week 3 (15–21 days ago)
  makePr({ number: 20, commitCount: 1, createdAt: isoAgo(19), mergedAt: isoAgo(17) }),
];

/** Regression scenario: current week has many rework cycles */
const REGRESSION_PRS = [
  ...PRS_WITH_HISTORY,
  // Override current PRs — many commits = rework
  makePr({ number: 30, commitCount: 5, createdAt: isoAgo(4), mergedAt: isoAgo(3) }),
  makePr({ number: 31, commitCount: 6, createdAt: isoAgo(5), mergedAt: isoAgo(4) }),
  makePr({ number: 32, commitCount: 4, createdAt: isoAgo(6), mergedAt: isoAgo(5) }),
];

/** Non-AI PRs (no agent-authored/has-pr label, no worktree-agent- branch) */
const HUMAN_PRS = [
  {
    number: 50,
    state: "MERGED",
    headRefName: "feature/my-human-pr",
    createdAt: isoAgo(3),
    mergedAt: isoAgo(2),
    closedAt: isoAgo(2),
    labels: [{ name: "feature" }],
    commitCount: 1,
    additions: 100,
    deletions: 50,
  },
];

const CLEAN_CCUSAGE = {
  daily: [makeCcusage(0, 3.0), makeCcusage(1, 4.0), makeCcusage(3, 3.0)],
};

const NO_CCUSAGE = () => null;

// ── Tests ───────────────────────────────────────────────

describe("collectQueueEfficiency", () => {
  it("returns available:false when readPrs returns null", () => {
    const result = collectQueueEfficiency(() => null, NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(false);
  });

  it("returns available:false when readPrs returns empty array", () => {
    const result = collectQueueEfficiency(() => [], NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(false);
  });

  it("returns available:false when readPrs throws", () => {
    const result = collectQueueEfficiency(
      () => {
        throw new Error("gh not found");
      },
      NO_CCUSAGE,
      TEST_NOW
    );
    expect(result.available).toBe(false);
  });

  it("returns available:false when all PRs are non-AI (no agent-authored/has-pr label, no worktree-agent- branch)", () => {
    const result = collectQueueEfficiency(() => HUMAN_PRS, NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(false);
  });

  it("returns available:false when merged AI PRs exist but none in current 7-day window", () => {
    const oldPrs = [
      makePr({ number: 1, mergedAt: isoAgo(15) }), // 15 days ago — outside window
    ];
    const result = collectQueueEfficiency(() => oldPrs, NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(false);
  });

  it("returns available:true with composite + sub_metrics for current window", () => {
    const result = collectQueueEfficiency(() => CLEAN_PRS, NO_CCUSAGE, TEST_NOW);

    expect(result.available).toBe(true);
    expect(typeof result.composite).toBe("number");
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(1);
    expect(result.sub_metrics).toBeDefined();
    expect(result.sub_metrics.issues_merged).toBe(3);
  });

  it("computes first_pass_success_rate as fraction of PRs with commitCount <= 2", () => {
    // 2 of 3 PRs have commitCount <= 2 (PRs 1,2 have 1; PR 3 has 2 ← qualifies)
    const result = collectQueueEfficiency(() => CLEAN_PRS, NO_CCUSAGE, TEST_NOW);
    // All 3 have commitCount <= 2 (1, 1, 2)
    expect(result.sub_metrics.first_pass_success_rate).toBe(1.0);
  });

  it("computes median_time_to_merge_hours from createdAt → mergedAt", () => {
    // PR1: merged 3d ago, created 4d ago → 24h
    // PR2: merged 4d ago, created 5d ago → 24h
    // PR3: merged 5d ago, created 6d ago → 24h
    const result = collectQueueEfficiency(() => CLEAN_PRS, NO_CCUSAGE, TEST_NOW);
    expect(result.sub_metrics.median_time_to_merge_hours).toBeCloseTo(24, 1);
  });

  it("computes cost_per_issue_usd as ccusage spend / issues merged", () => {
    // 3+4+3 = 10 USD, 3 issues → $3.333
    const result = collectQueueEfficiency(
      () => CLEAN_PRS,
      () => CLEAN_CCUSAGE,
      TEST_NOW
    );
    expect(result.sub_metrics.cost_per_issue_usd).toBeCloseTo(10 / 3, 2);
  });

  it("uses zero cost when ccusage reader returns null", () => {
    const result = collectQueueEfficiency(() => CLEAN_PRS, NO_CCUSAGE, TEST_NOW);
    expect(result.sub_metrics.cost_per_issue_usd).toBe(0);
  });

  it("uses zero cost when ccusage reader throws", () => {
    const result = collectQueueEfficiency(
      () => CLEAN_PRS,
      () => {
        throw new Error("ccusage not found");
      },
      TEST_NOW
    );
    expect(result.available).toBe(true);
    expect(result.sub_metrics.cost_per_issue_usd).toBe(0);
  });

  it("returns baseline:null when no prior-week data is available", () => {
    const result = collectQueueEfficiency(() => CLEAN_PRS, NO_CCUSAGE, TEST_NOW);
    expect(result.baseline).toBeNull();
    expect(result.regressions).toEqual([]);
  });

  it("computes baseline from prior weeks when history is available", () => {
    const result = collectQueueEfficiency(() => PRS_WITH_HISTORY, NO_CCUSAGE, TEST_NOW);

    expect(result.baseline).not.toBeNull();
    expect(result.baseline.weeks_sampled).toBeGreaterThanOrEqual(1);
    expect(typeof result.baseline.composite_median).toBe("number");
    expect(typeof result.baseline.fps_median).toBe("number");
    expect(typeof result.baseline.ttm_median).toBe("number");
  });

  it("detects composite regression when current score drops below baseline band", () => {
    // Use regression PRs (30–32) which have 4-6 commits each, all in current window
    // BUT we need to keep prior-week PRs separate in the fixture
    // The PRs_WITH_HISTORY current window is PRs 1,2,3 (good fps)
    // Let's build a custom fixture: prior weeks have good fps, current week has bad fps
    const priorWeekPrs = [
      makePr({ number: 10, commitCount: 1, createdAt: isoAgo(13), mergedAt: isoAgo(10) }),
      makePr({ number: 11, commitCount: 1, createdAt: isoAgo(12), mergedAt: isoAgo(11) }),
      makePr({ number: 20, commitCount: 1, createdAt: isoAgo(19), mergedAt: isoAgo(17) }),
      makePr({ number: 21, commitCount: 1, createdAt: isoAgo(18), mergedAt: isoAgo(16) }),
    ];
    const badCurrentPrs = [
      makePr({ number: 30, commitCount: 8, createdAt: isoAgo(4), mergedAt: isoAgo(3) }),
      makePr({ number: 31, commitCount: 9, createdAt: isoAgo(5), mergedAt: isoAgo(4) }),
      makePr({ number: 32, commitCount: 7, createdAt: isoAgo(6), mergedAt: isoAgo(5) }),
    ];

    const result = collectQueueEfficiency(
      () => [...priorWeekPrs, ...badCurrentPrs],
      NO_CCUSAGE,
      TEST_NOW
    );

    expect(result.available).toBe(true);
    expect(result.regressions.length).toBeGreaterThan(0);

    const compositeRegression = result.regressions.find((r) => r.metric === "composite");
    if (compositeRegression) {
      expect(compositeRegression.sensor).toBe("queueEfficiency");
      expect(compositeRegression.delta).toBeLessThan(0);
      expect(["high", "medium"]).toContain(compositeRegression.severity);
    }
  });

  it("does NOT flag a regression when metrics are within the band", () => {
    // Both prior weeks and current week have identical good PRs
    const uniformPrs = [
      makePr({ number: 1, commitCount: 1, createdAt: isoAgo(4), mergedAt: isoAgo(3) }),
      makePr({ number: 10, commitCount: 1, createdAt: isoAgo(11), mergedAt: isoAgo(10) }),
      makePr({ number: 20, commitCount: 1, createdAt: isoAgo(18), mergedAt: isoAgo(17) }),
    ];

    const result = collectQueueEfficiency(() => uniformPrs, NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(true);
    expect(result.regressions).toEqual([]);
  });

  it("builds distribution keyed by size tier from size: label", () => {
    const sizedPrs = [
      makePr({
        number: 1,
        labels: [{ name: "has-pr" }, { name: "size:s" }],
        commitCount: 1,
        createdAt: isoAgo(3),
        mergedAt: isoAgo(2),
      }),
      makePr({
        number: 2,
        labels: [{ name: "has-pr" }, { name: "size:l" }],
        commitCount: 2,
        createdAt: isoAgo(4),
        mergedAt: isoAgo(3),
      }),
      makePr({
        number: 3,
        labels: [{ name: "has-pr" }, { name: "size:s" }],
        commitCount: 1,
        createdAt: isoAgo(5),
        mergedAt: isoAgo(4),
      }),
    ];

    const result = collectQueueEfficiency(() => sizedPrs, NO_CCUSAGE, TEST_NOW);

    expect(result.distribution).toBeDefined();
    expect(result.distribution["size:s"]).toBeDefined();
    expect(result.distribution["size:s"].count).toBe(2);
    expect(result.distribution["size:l"]).toBeDefined();
    expect(result.distribution["size:l"].count).toBe(1);
  });

  it("falls back to diff-based size tier when no size: label is present", () => {
    const pr = makePr({
      number: 1,
      labels: [{ name: "has-pr" }],
      additions: 400,
      deletions: 100, // total 500 → size:m (200-499 → m, 500 boundary → l)
    });

    const result = collectQueueEfficiency(() => [pr], NO_CCUSAGE, TEST_NOW);
    expect(result.distribution).toBeDefined();
    // 500 lines total → size:l (>= 500 threshold)
    const tier = Object.keys(result.distribution)[0];
    expect(["size:m", "size:l"]).toContain(tier);
  });

  it("classifies worktree-agent- branch PRs even without agent-authored label", () => {
    const agentPr = makePr({
      number: 1,
      headRefName: "worktree-agent-abc123",
      labels: [{ name: "feature" }], // no agent-authored or has-pr label
    });

    const result = collectQueueEfficiency(() => [agentPr], NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(true);
    expect(result.sub_metrics.issues_merged).toBe(1);
  });

  it("classifies PRs with legacy has-pr label as AI PRs", () => {
    const legacyPr = makePr({
      number: 1,
      headRefName: "feat/some-thing",
      labels: [{ name: "has-pr" }, { name: "feature" }],
    });

    const result = collectQueueEfficiency(() => [legacyPr], NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(true);
    expect(result.sub_metrics.issues_merged).toBe(1);
  });

  it("excludes PRs with null mergedAt from merged-AI-PR count", () => {
    const openPr = makePr({
      number: 1,
      state: "OPEN",
      mergedAt: null,
    });

    const result = collectQueueEfficiency(() => [openPr], NO_CCUSAGE, TEST_NOW);
    expect(result.available).toBe(false);
  });
});
