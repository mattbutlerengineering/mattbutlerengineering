import { test } from "node:test";
import assert from "node:assert/strict";

import { latestSnapshot, computeAdjustments, buildHistoryEntry } from "../auto-qa-tune.js";

// ---------------------------------------------------------------------------
// latestSnapshot
// ---------------------------------------------------------------------------

test("latestSnapshot: returns null for empty array", () => {
  assert.equal(latestSnapshot([]), null);
});

test("latestSnapshot: returns null for non-array", () => {
  assert.equal(latestSnapshot(null), null);
  assert.equal(latestSnapshot(undefined), null);
});

test("latestSnapshot: returns most recent by date", () => {
  const snapshots = [
    { date: "2026-04-01", total_ai_prs: 10 },
    { date: "2026-05-01", total_ai_prs: 20 },
    { date: "2026-03-15", total_ai_prs: 5 },
  ];
  const result = latestSnapshot(snapshots);
  assert.equal(result.date, "2026-05-01");
  assert.equal(result.total_ai_prs, 20);
});

test("latestSnapshot: single entry returns that entry", () => {
  const snapshots = [{ date: "2026-04-25", total_ai_prs: 7 }];
  assert.equal(latestSnapshot(snapshots).date, "2026-04-25");
});

// ---------------------------------------------------------------------------
// computeAdjustments — insufficient data
// ---------------------------------------------------------------------------

test("computeAdjustments: insufficient data (< 5 PRs) skips adjustments", () => {
  const snapshot = { total_ai_prs: 3, merged: 2, rejected: 1, acceptance_rate: 0.67 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.maxBudgetUSD, 1.5, "Budget should not change");
  assert.equal(result.adjustments.length, 1);
  assert.ok(result.adjustments[0].includes("Insufficient data"));
});

// ---------------------------------------------------------------------------
// computeAdjustments — acceptance rate below floor
// ---------------------------------------------------------------------------

test("computeAdjustments: rate below floor reduces budget by 25%", () => {
  const snapshot = { total_ai_prs: 20, merged: 15, rejected: 5, acceptance_rate: 0.75 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.maxBudgetUSD, 1.13, "1.5 * 0.75 = 1.125 rounded to 1.13");
  assert.ok(result.adjustments[0].includes("below the 85% floor"));
  assert.ok(result.adjustments[0].includes("Budget reduced"));
});

test("computeAdjustments: budget never goes below $0.25 floor", () => {
  const snapshot = { total_ai_prs: 10, merged: 3, rejected: 7, acceptance_rate: 0.3 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 0.3 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.maxBudgetUSD, 0.25, "Floor is $0.25");
});

// ---------------------------------------------------------------------------
// computeAdjustments — acceptance rate meets floor
// ---------------------------------------------------------------------------

test("computeAdjustments: rate at floor produces no changes", () => {
  const snapshot = { total_ai_prs: 40, merged: 34, rejected: 6, acceptance_rate: 0.85 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.maxBudgetUSD, 1.5, "Budget unchanged");
  assert.ok(result.adjustments[0].includes("No adjustments needed"));
});

test("computeAdjustments: rate above floor produces no changes", () => {
  const snapshot = { total_ai_prs: 40, merged: 40, rejected: 0, acceptance_rate: 1.0 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.maxBudgetUSD, 1.5, "Budget unchanged");
  assert.ok(result.adjustments[0].includes("No adjustments needed"));
});

// ---------------------------------------------------------------------------
// computeAdjustments — immutability
// ---------------------------------------------------------------------------

test("computeAdjustments: does not mutate input thresholds", () => {
  const snapshot = { total_ai_prs: 20, merged: 10, rejected: 10, acceptance_rate: 0.5 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  computeAdjustments(snapshot, thresholds);

  assert.equal(thresholds.maxBudgetUSD, 1.5, "Original should be untouched");
});

// ---------------------------------------------------------------------------
// computeAdjustments — stuck threshold tuning
// ---------------------------------------------------------------------------

test("computeAdjustments: rate below floor tightens stuck threshold", () => {
  const snapshot = { total_ai_prs: 20, merged: 15, rejected: 5, acceptance_rate: 0.75 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5, stuckTurnsThreshold: 8 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.stuckTurnsThreshold, 7, "Stuck threshold should decrease by 1");
  assert.ok(result.adjustments.some((a) => a.includes("Stuck-turns threshold tightened")));
});

test("computeAdjustments: stuck threshold never goes below 3", () => {
  const snapshot = { total_ai_prs: 20, merged: 10, rejected: 10, acceptance_rate: 0.5 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5, stuckTurnsThreshold: 3 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.stuckTurnsThreshold, 3, "Floor is 3");
});

test("computeAdjustments: excellent acceptance (>=95%) relaxes stuck threshold", () => {
  const snapshot = { total_ai_prs: 40, merged: 39, rejected: 1, acceptance_rate: 0.975 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5, stuckTurnsThreshold: 8 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.stuckTurnsThreshold, 9, "Should increase by 1");
  assert.ok(result.adjustments.some((a) => a.includes("Stuck-turns threshold relaxed")));
});

test("computeAdjustments: stuck threshold never goes above 12", () => {
  const snapshot = { total_ai_prs: 40, merged: 40, rejected: 0, acceptance_rate: 1.0 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5, stuckTurnsThreshold: 12 };
  const result = computeAdjustments(snapshot, thresholds);

  assert.equal(result.thresholds.stuckTurnsThreshold, 12, "Ceiling is 12");
});

test("computeAdjustments: missing stuckTurnsThreshold is handled gracefully", () => {
  const snapshot = { total_ai_prs: 20, merged: 15, rejected: 5, acceptance_rate: 0.75 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5 };
  const result = computeAdjustments(snapshot, thresholds);

  // Budget should still be adjusted even without stuckTurnsThreshold
  assert.equal(result.thresholds.maxBudgetUSD, 1.13);
  assert.equal(result.thresholds.stuckTurnsThreshold, undefined);
});

test("computeAdjustments: does not mutate input stuckTurnsThreshold", () => {
  const snapshot = { total_ai_prs: 20, merged: 15, rejected: 5, acceptance_rate: 0.75 };
  const thresholds = { acceptanceRateFloor: 0.85, maxBudgetUSD: 1.5, stuckTurnsThreshold: 8 };
  computeAdjustments(snapshot, thresholds);

  assert.equal(thresholds.stuckTurnsThreshold, 8, "Original should be untouched");
});

// ---------------------------------------------------------------------------
// buildHistoryEntry
// ---------------------------------------------------------------------------

test("buildHistoryEntry: adjustment present flags as tuned", () => {
  const entry = buildHistoryEntry({
    adjustments: ["Budget reduced from $1.50 to $1.13 because rate was low."],
    date: "2026-05-02",
    snapshotDate: "2026-05-01",
  });

  assert.equal(entry.date, "2026-05-02");
  assert.equal(entry.trigger, "auto-qa-tune");
  assert.equal(entry.snapshotDate, "2026-05-01");
  assert.ok(entry.note.includes("Tuned thresholds"));
});

test("buildHistoryEntry: no adjustments flags as reviewed-only", () => {
  const entry = buildHistoryEntry({
    adjustments: ["Acceptance rate 100% meets or exceeds the 85% floor. No adjustments needed."],
    date: "2026-05-02",
    snapshotDate: "2026-05-01",
  });

  assert.ok(entry.note.includes("All metrics within acceptable ranges"));
});

test("buildHistoryEntry: insufficient data flags as reviewed-only", () => {
  const entry = buildHistoryEntry({
    adjustments: ["Insufficient data: only 2 AI PRs in window (need >= 5). No adjustments made."],
    date: "2026-05-02",
    snapshotDate: "2026-05-01",
  });

  assert.ok(entry.note.includes("All metrics within acceptable ranges"));
});
