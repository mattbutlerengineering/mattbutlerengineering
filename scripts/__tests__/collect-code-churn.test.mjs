import { describe, it, expect } from "vitest";
import { computeCodeChurn, isGeneratedArtifact } from "../collect-code-churn.mjs";

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

describe("isGeneratedArtifact", () => {
  // TRUE cases — generated/vendored paths that should be excluded from churn
  it("identifies root llms.txt as generated", () => {
    expect(isGeneratedArtifact("llms.txt")).toBe(true);
  });

  it("identifies package-scoped llms.txt as generated", () => {
    expect(isGeneratedArtifact("packages/rialto/llms.txt")).toBe(true);
  });

  it("identifies root llms-full.txt as generated", () => {
    expect(isGeneratedArtifact("llms-full.txt")).toBe(true);
  });

  it("identifies package-scoped llms-full.txt as generated", () => {
    expect(isGeneratedArtifact("packages/rialto-catalog/llms-full.txt")).toBe(true);
  });

  it("identifies pnpm-lock.yaml as generated", () => {
    expect(isGeneratedArtifact("pnpm-lock.yaml")).toBe(true);
  });

  it("identifies generated-schemas.ts as generated", () => {
    expect(isGeneratedArtifact("packages/rialto-catalog/src/generated-schemas.ts")).toBe(true);
  });

  it("identifies dep-graph.json as generated", () => {
    expect(isGeneratedArtifact("infrastructure/worker/dep-graph.json")).toBe(true);
  });

  it("identifies dependency-graph.md as generated", () => {
    expect(isGeneratedArtifact("docs/architecture/dependency-graph.md")).toBe(true);
  });

  it("identifies rialto registry.json as generated", () => {
    expect(isGeneratedArtifact("packages/rialto/registry.json")).toBe(true);
  });

  it("identifies files under generated/ directory as generated", () => {
    expect(isGeneratedArtifact("services/reservations/src/generated/prisma/client.ts")).toBe(true);
  });

  it("identifies vitest snapshots (.snap) as generated", () => {
    expect(
      isGeneratedArtifact("packages/rialto-catalog/src/__snapshots__/schemas.test.ts.snap")
    ).toBe(true);
  });

  it("identifies CHANGELOG.md files as generated", () => {
    expect(isGeneratedArtifact("packages/rialto/CHANGELOG.md")).toBe(true);
  });

  // FALSE cases — real source files that should count toward churn
  it("does NOT flag service source files as generated", () => {
    expect(isGeneratedArtifact("services/reservations/src/app.ts")).toBe(false);
  });

  it("does NOT flag rialto component source as generated", () => {
    expect(isGeneratedArtifact("packages/rialto/src/components/Button/Button.tsx")).toBe(false);
  });

  it("does NOT flag regular package.json as generated", () => {
    expect(isGeneratedArtifact("packages/rialto/package.json")).toBe(false);
  });

  it("does NOT flag test files as generated", () => {
    expect(isGeneratedArtifact("scripts/__tests__/collect-code-churn.test.mjs")).toBe(false);
  });

  it("does NOT flag arbitrary markdown as generated", () => {
    expect(isGeneratedArtifact("docs/architecture/decisions/ADR-001.md")).toBe(false);
  });
});
