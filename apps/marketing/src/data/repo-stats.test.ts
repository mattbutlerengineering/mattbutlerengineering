import { describe, it, expect } from "vitest";
import { FALLBACK_REPO_STATS, REPO_STATS, isRepoStats, selectRepoStats } from "./repo-stats.js";

const VALID = {
  agentPrsMerged: 936,
  totalPrsMerged: 1426,
  rialtoComponents: 84,
  testFiles: 833,
  measuredAt: "2026-07-29T12:00:00.000Z",
} as const;

describe("isRepoStats", () => {
  it("accepts a well-formed snapshot", () => {
    expect(isRepoStats(VALID)).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 42, "stats", [VALID]]) {
      expect(isRepoStats(value)).toBe(false);
    }
  });

  it("rejects a snapshot missing any counter", () => {
    for (const key of ["agentPrsMerged", "totalPrsMerged", "rialtoComponents", "testFiles"]) {
      const { [key]: _dropped, ...rest } = VALID as Record<string, unknown>;
      expect(isRepoStats(rest)).toBe(false);
    }
  });

  it("rejects counters that are not non-negative integers", () => {
    expect(isRepoStats({ ...VALID, testFiles: -1 })).toBe(false);
    expect(isRepoStats({ ...VALID, testFiles: 1.5 })).toBe(false);
    expect(isRepoStats({ ...VALID, testFiles: "833" })).toBe(false);
    expect(isRepoStats({ ...VALID, testFiles: Number.NaN })).toBe(false);
  });

  it("rejects a missing or unparseable measuredAt stamp", () => {
    expect(isRepoStats({ ...VALID, measuredAt: undefined })).toBe(false);
    expect(isRepoStats({ ...VALID, measuredAt: "last tuesday" })).toBe(false);
    expect(isRepoStats({ ...VALID, measuredAt: 1753790400000 })).toBe(false);
  });
});

describe("selectRepoStats", () => {
  it("prefers the generated snapshot when it is valid", () => {
    const generated = { ...VALID, totalPrsMerged: 1500 };
    expect(selectRepoStats(generated, FALLBACK_REPO_STATS)).toEqual(generated);
  });

  it("falls back when the build produced no generated snapshot", () => {
    expect(selectRepoStats(undefined, FALLBACK_REPO_STATS)).toBe(FALLBACK_REPO_STATS);
  });

  it("falls back when the generated snapshot is malformed", () => {
    expect(selectRepoStats({ totalPrsMerged: "lots" }, FALLBACK_REPO_STATS)).toBe(
      FALLBACK_REPO_STATS
    );
  });
});

describe("REPO_STATS", () => {
  it("is always a valid snapshot — offline builds included", () => {
    expect(isRepoStats(REPO_STATS)).toBe(true);
  });

  it("ships a committed fallback with real, non-zero numbers", () => {
    expect(isRepoStats(FALLBACK_REPO_STATS)).toBe(true);
    expect(FALLBACK_REPO_STATS.agentPrsMerged).toBeGreaterThan(0);
    expect(FALLBACK_REPO_STATS.totalPrsMerged).toBeGreaterThan(0);
    expect(FALLBACK_REPO_STATS.rialtoComponents).toBeGreaterThan(0);
    expect(FALLBACK_REPO_STATS.testFiles).toBeGreaterThan(0);
  });

  it("never claims more agent PRs than total PRs", () => {
    expect(REPO_STATS.agentPrsMerged).toBeLessThanOrEqual(REPO_STATS.totalPrsMerged);
  });
});
