import { describe, it, expect } from "vitest";
import { computeE2eStability } from "../collect-e2e-stability.mjs";

/**
 * Fixture helpers — build run objects with explicit timestamps so tests are
 * TZ-safe (no wall-clock or Date.now() calls inside the collector).
 *
 * @param {object} overrides
 * @returns {{
 *   sha: string,
 *   conclusion: string,
 *   changedPaths: string[],
 *   headRefName: string,
 *   createdAt: string,
 * }}
 */
function makeRun({
  sha = "abc0000",
  conclusion = "success",
  changedPaths = [],
  headRefName = "main",
  createdAt = "2026-06-01T00:00:00Z",
} = {}) {
  return { sha, conclusion, changedPaths, headRefName, createdAt };
}

describe("computeE2eStability", () => {
  it("returns available: false when runs array is empty", () => {
    const result = computeE2eStability([]);
    expect(result.available).toBe(false);
  });

  it("returns available: false when runs is null", () => {
    const result = computeE2eStability(null);
    expect(result.available).toBe(false);
  });

  it("returns consecutive_failures: 0 when the most recent non-frontend run passed", () => {
    const runs = [
      makeRun({
        sha: "aaa001",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.available).toBe(true);
    expect(result.consecutive_failures).toBe(0);
  });

  it("counts consecutive failures from most recent non-frontend run", () => {
    const runs = [
      // most recent first
      makeRun({
        sha: "aaa003",
        conclusion: "failure",
        changedPaths: ["services/reservations/src/routes.ts"],
        createdAt: "2026-06-03T00:00:00Z",
      }),
      makeRun({
        sha: "aaa002",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.available).toBe(true);
    expect(result.consecutive_failures).toBe(2);
  });

  it("excludes runs that touch frontend paths (apps/**) from the streak", () => {
    const runs = [
      // frontend run — should be excluded from the count
      makeRun({
        sha: "aaa003",
        conclusion: "failure",
        changedPaths: ["apps/hospitality/src/index.tsx"],
        createdAt: "2026-06-03T00:00:00Z",
      }),
      // non-frontend — most recent non-frontend run; determines the streak
      makeRun({
        sha: "aaa002",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.available).toBe(true);
    // Most recent NON-frontend run passed → streak = 0
    expect(result.consecutive_failures).toBe(0);
  });

  it("excludes runs that touch packages/rialto/** from the streak", () => {
    const runs = [
      makeRun({
        sha: "aaa002",
        conclusion: "failure",
        changedPaths: ["packages/rialto/src/Button.tsx"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "failure",
        changedPaths: ["services/reservations/src/routes.ts"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    // Only non-frontend runs: aaa001 (failure) → streak = 1
    expect(result.available).toBe(true);
    expect(result.consecutive_failures).toBe(1);
  });

  it("treats cancelled/skipped runs as non-failures (ignored in streak)", () => {
    const runs = [
      makeRun({
        sha: "aaa003",
        conclusion: "cancelled",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-03T00:00:00Z",
      }),
      makeRun({
        sha: "aaa002",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    // cancelled is skipped; first meaningful result is failure at aaa002, then success breaks streak
    expect(result.available).toBe(true);
    expect(result.consecutive_failures).toBe(1);
  });

  it("includes total_non_frontend_runs in the result", () => {
    const runs = [
      makeRun({
        sha: "aaa002",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "failure",
        changedPaths: ["apps/hospitality/src/App.tsx"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.available).toBe(true);
    // Only aaa002 is non-frontend
    expect(result.total_non_frontend_runs).toBe(1);
  });

  it("includes total_runs in the result", () => {
    const runs = [
      makeRun({
        sha: "aaa002",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "failure",
        changedPaths: ["apps/hospitality/src/App.tsx"],
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.total_runs).toBe(2);
  });

  it("returns available: false when all runs are frontend runs (nothing to measure)", () => {
    const runs = [
      makeRun({
        sha: "aaa001",
        conclusion: "failure",
        changedPaths: ["apps/hospitality/src/App.tsx"],
      }),
      makeRun({
        sha: "aaa002",
        conclusion: "success",
        changedPaths: ["packages/rialto/src/Button.tsx"],
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.available).toBe(false);
  });

  it("uses createdAt for ordering (sorts by createdAt descending internally)", () => {
    // Provide runs in ascending order; collector must sort by createdAt desc
    const runs = [
      makeRun({
        sha: "aaa001",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
      makeRun({
        sha: "aaa002",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa003",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-03T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    // Most recent first: aaa003 (fail), aaa002 (fail), aaa001 (success) → streak = 2
    expect(result.consecutive_failures).toBe(2);
  });

  it("includes a human-readable summary string", () => {
    const runs = [
      makeRun({
        sha: "aaa002",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-02T00:00:00Z",
      }),
      makeRun({
        sha: "aaa001",
        conclusion: "success",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("does not block merges — no blocking or gating field set", () => {
    const runs = [
      makeRun({
        sha: "aaa001",
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
      }),
    ];
    const result = computeE2eStability(runs);
    // Must not have any field that signals auto-blocking behavior
    expect(result.blocks_merge).toBeUndefined();
    expect(result.auto_block).toBeUndefined();
  });
});
