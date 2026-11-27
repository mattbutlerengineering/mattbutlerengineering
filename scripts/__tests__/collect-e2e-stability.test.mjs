import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { E2E_SUITE_FILTERS } from "../e2e-changed-suites.mjs";
import {
  computeE2eStability,
  E2E_SUITE_JOB_NAME,
  E2E_SUITE_PATHS,
  suiteRanFromJobs,
} from "../collect-e2e-stability.mjs";

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
    expect(result).toEqual({ available: false, reason: "no_runs" });
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
    expect(result).toEqual({ available: false, reason: "no_non_frontend_runs" });
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

/**
 * e2e.yml starts on every PR (#9834); its `changes` job skips the suites when no
 * suite path changed, and the run still concludes `success`. Such a run tested
 * nothing, so it must neither pass nor break a failure streak.
 */
describe("computeE2eStability ignores runs where no suite ran", () => {
  it("keeps a failure streak across a docs-only run", () => {
    const runs = [
      makeRun({
        conclusion: "success",
        changedPaths: ["docs/notes.md"],
        createdAt: "2026-06-01T04:00:00Z",
      }),
      makeRun({
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T03:00:00Z",
      }),
      makeRun({
        conclusion: "failure",
        changedPaths: ["services/users/src/index.ts"],
        createdAt: "2026-06-01T02:00:00Z",
      }),
    ];
    const result = computeE2eStability(runs);
    expect(result.consecutive_failures).toBe(2);
    expect(result.total_non_frontend_runs).toBe(2);
  });

  it("counts a docs-only head commit when the run's suite job actually ran (multi-commit PR)", () => {
    const result = computeE2eStability([
      {
        ...makeRun({ conclusion: "failure", changedPaths: ["docs/notes.md"] }),
        suiteRan: true,
      },
    ]);
    expect(result).toMatchObject({ available: true, consecutive_failures: 1 });
  });

  it("excludes a run whose suite jobs were all skipped even if head paths look like a suite", () => {
    const result = computeE2eStability([
      {
        ...makeRun({ conclusion: "success", changedPaths: ["services/users/src/index.ts"] }),
        suiteRan: false,
      },
    ]);
    expect(result).toEqual({ available: false, reason: "no_non_frontend_runs" });
  });

  it("suiteRanFromJobs reads job-level conclusions (shape captured from gh api actions/runs/<id>/jobs)", () => {
    // Real skipped-run shape: matrix job keeps its unexpanded name.
    const skipped = [
      { name: "Detect changed apps", conclusion: "success" },
      { name: "Hospitality E2E (shard ${{ matrix.shard }})", conclusion: "skipped" },
      { name: "Hospitality E2E", conclusion: "skipped" },
      { name: "Marketing E2E", conclusion: "skipped" },
      { name: "Gen E2E", conclusion: "skipped" },
    ];
    expect(suiteRanFromJobs(skipped)).toBe(false);
    expect(suiteRanFromJobs([...skipped, { name: "Gen E2E", conclusion: "failure" }])).toBe(true);
    expect(suiteRanFromJobs([{ name: "Marketing E2E", conclusion: "success" }])).toBe(true);
    expect(suiteRanFromJobs([])).toBe(false);
  });

  it("suiteRanFromJobs handles the real full and in-progress run shapes", () => {
    // captured 2026-11-27: gh api repos/mattbutlerengineering/mattbutlerengineering/actions/runs/45943698753/jobs
    const fullRun = [
      { name: "Detect changed apps", conclusion: "success" },
      { name: "Gen E2E", conclusion: "success" },
      { name: "Hospitality E2E (shard 2)", conclusion: "success" },
      { name: "Hospitality E2E (shard 1)", conclusion: "success" },
      { name: "Marketing E2E", conclusion: "success" },
      { name: "Hospitality E2E (shard 3)", conclusion: "success" },
      { name: "Hospitality E2E", conclusion: "success" },
    ];
    expect(suiteRanFromJobs(fullRun)).toBe(true);
    // captured 2026-11-27: run 45946277559 while Marketing E2E was still running
    const inProgress = [
      { name: "Detect changed apps", conclusion: "success" },
      { name: "Marketing E2E", conclusion: null },
      { name: "Gen E2E", conclusion: "skipped" },
      { name: "Hospitality E2E", conclusion: "skipped" },
      { name: "Hospitality E2E (shard ${{ matrix.shard }})", conclusion: "skipped" },
    ];
    expect(suiteRanFromJobs(inProgress)).toBe(true);
    expect(suiteRanFromJobs([{ name: "Detect changed apps", conclusion: "failure" }])).toBe(false);
  });

  it("E2E_SUITE_JOB_NAME matches every suite job name declared in e2e.yml", () => {
    const yml = readFileSync(new URL("../../.github/workflows/e2e.yml", import.meta.url), "utf8");
    const names = [...yml.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]);
    const suiteNames = names.filter((n) => n !== "Detect changed apps");
    expect(suiteNames.length).toBeGreaterThanOrEqual(3);
    for (const n of suiteNames) expect(E2E_SUITE_JOB_NAME.test(n)).toBe(true);
  });

  it("is the union of the filters e2e.yml's changes job applies (#10025)", () => {
    const yml = readFileSync(new URL("../../.github/workflows/e2e.yml", import.meta.url), "utf8");
    expect(yml).toContain("scripts/e2e-changed-suites.mjs diff");
    const union = Object.values(E2E_SUITE_FILTERS).flat();
    expect([...E2E_SUITE_PATHS].sort()).toEqual([...new Set(union)].sort());
  });
});
