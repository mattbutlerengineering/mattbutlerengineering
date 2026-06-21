import { describe, it, expect } from "vitest";
import { computeCodeChurn } from "../collect-code-churn.mjs";

/**
 * Fixture git-log data for testing.
 *
 * Format mirrors `git log --numstat` output parsed into objects:
 *   { hash, isMerge, timestamp, linesAdded, linesDeleted }
 *
 * Churn definition: lines introduced by a merge commit (or direct commit to
 * main) that are deleted or modified (deleted + re-added) by a later commit
 * within the 7-day window. Specifically:
 *   churn_rate = lines_churned / total_lines_merged
 * where "lines_churned" are lines added in one commit that are then deleted
 * (via a deletion line) in a later commit within the window.
 *
 * Caveat: this metric conflates intentional refactoring / iteration with
 * genuine churn. A high rate during active feature development is expected
 * and should not be treated as a quality signal without additional context.
 */

describe("computeCodeChurn", () => {
  it("returns available: false when given empty commit list", () => {
    const result = computeCodeChurn([]);
    expect(result.available).toBe(false);
  });

  it("returns available: false when all commits are outside the window", () => {
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const commits = [
      { hash: "aaa", timestamp: old, linesAdded: 100, linesDeleted: 0 },
      { hash: "bbb", timestamp: old, linesAdded: 0, linesDeleted: 50 },
    ];
    const result = computeCodeChurn(commits);
    expect(result.available).toBe(false);
  });

  it("returns churn_rate of 0 when no lines are deleted within the window", () => {
    const now = new Date();
    const d1 = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const d2 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const commits = [
      { hash: "aaa", timestamp: d1, linesAdded: 100, linesDeleted: 0 },
      { hash: "bbb", timestamp: d2, linesAdded: 50, linesDeleted: 0 },
    ];
    const result = computeCodeChurn(commits);
    expect(result.available).toBe(true);
    expect(result.churn_rate).toBe(0);
    expect(result.total_lines_added_7d).toBe(150);
    expect(result.lines_churned_7d).toBe(0);
    expect(result.window_days).toBe(7);
  });

  it("computes churn_rate as ratio of deleted lines to added lines", () => {
    const now = new Date();
    const d1 = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const d2 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    // 200 lines added, 50 deleted later — 25% churn
    const commits = [
      { hash: "aaa", timestamp: d1, linesAdded: 200, linesDeleted: 0 },
      { hash: "bbb", timestamp: d2, linesAdded: 10, linesDeleted: 50 },
    ];
    const result = computeCodeChurn(commits);
    expect(result.available).toBe(true);
    expect(result.total_lines_added_7d).toBe(210);
    expect(result.lines_churned_7d).toBe(50);
    expect(result.churn_rate).toBeCloseTo(0.238, 2); // 50/210
  });

  it("caps churn_rate at 1.0 even when deletions exceed additions", () => {
    const now = new Date();
    const d1 = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const commits = [{ hash: "aaa", timestamp: d1, linesAdded: 10, linesDeleted: 200 }];
    const result = computeCodeChurn(commits);
    expect(result.available).toBe(true);
    expect(result.churn_rate).toBeLessThanOrEqual(1.0);
  });

  it("respects a custom reference timestamp (injectable now)", () => {
    // All commits older than 7d from reference date should be excluded
    const refNow = new Date("2026-01-20T12:00:00Z");
    const within = new Date("2026-01-15T12:00:00Z").toISOString(); // 5d before ref
    const outside = new Date("2026-01-10T12:00:00Z").toISOString(); // 10d before ref

    const commits = [
      { hash: "aaa", timestamp: outside, linesAdded: 999, linesDeleted: 500 },
      { hash: "bbb", timestamp: within, linesAdded: 100, linesDeleted: 20 },
    ];
    const result = computeCodeChurn(commits, refNow);
    expect(result.available).toBe(true);
    expect(result.total_lines_added_7d).toBe(100);
    expect(result.lines_churned_7d).toBe(20);
  });

  it("includes churn_threshold field matching sensor-report threshold key", () => {
    const now = new Date();
    const d1 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const commits = [{ hash: "aaa", timestamp: d1, linesAdded: 50, linesDeleted: 10 }];
    const result = computeCodeChurn(commits);
    expect(result).toHaveProperty("churn_threshold");
    expect(typeof result.churn_threshold).toBe("number");
  });
});
