import { describe, it, expect } from "vitest";
import {
  FALLBACK_REPO_STATS,
  REPO_STATS,
  RIALTO_COMPONENT_COUNT,
  selectComponentCount,
  isMeasuredStats,
  selectMeasuredStats,
} from "./repo-stats.js";

const VALID = {
  agentPrsMerged: 936,
  totalPrsMerged: 1426,
  testFiles: 833,
  measuredAt: "2026-07-29T12:00:00.000Z",
} as const;

describe("isMeasuredStats", () => {
  it("accepts a well-formed snapshot", () => {
    expect(isMeasuredStats(VALID)).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 42, "stats", [VALID]]) {
      expect(isMeasuredStats(value)).toBe(false);
    }
  });

  it("rejects a snapshot missing any counter", () => {
    for (const key of ["agentPrsMerged", "totalPrsMerged", "testFiles"]) {
      const { [key]: _dropped, ...rest } = VALID as Record<string, unknown>;
      expect(isMeasuredStats(rest)).toBe(false);
    }
  });

  it("rejects counters that are not non-negative integers", () => {
    expect(isMeasuredStats({ ...VALID, testFiles: -1 })).toBe(false);
    expect(isMeasuredStats({ ...VALID, testFiles: 1.5 })).toBe(false);
    expect(isMeasuredStats({ ...VALID, testFiles: "833" })).toBe(false);
    expect(isMeasuredStats({ ...VALID, testFiles: Number.NaN })).toBe(false);
  });

  it("rejects a missing or unparseable measuredAt stamp", () => {
    expect(isMeasuredStats({ ...VALID, measuredAt: undefined })).toBe(false);
    expect(isMeasuredStats({ ...VALID, measuredAt: "last tuesday" })).toBe(false);
    expect(isMeasuredStats({ ...VALID, measuredAt: 1753790400000 })).toBe(false);
  });
});

describe("selectMeasuredStats", () => {
  it("prefers the generated snapshot when it is valid", () => {
    const generated = { ...VALID, totalPrsMerged: 1500 };
    expect(selectMeasuredStats(generated, FALLBACK_REPO_STATS)).toEqual(generated);
  });

  it("falls back when the build produced no generated snapshot", () => {
    expect(selectMeasuredStats(undefined, FALLBACK_REPO_STATS)).toBe(FALLBACK_REPO_STATS);
  });

  it("falls back when the generated snapshot is malformed", () => {
    expect(selectMeasuredStats({ totalPrsMerged: "lots" }, FALLBACK_REPO_STATS)).toBe(
      FALLBACK_REPO_STATS
    );
  });
});

describe("REPO_STATS", () => {
  it("is always a valid snapshot — offline builds included", () => {
    expect(isMeasuredStats(REPO_STATS)).toBe(true);
  });

  it("ships a committed fallback with real, non-zero numbers", () => {
    expect(isMeasuredStats(FALLBACK_REPO_STATS)).toBe(true);
    expect(FALLBACK_REPO_STATS.agentPrsMerged).toBeGreaterThan(0);
    expect(FALLBACK_REPO_STATS.totalPrsMerged).toBeGreaterThan(0);
    expect(FALLBACK_REPO_STATS.testFiles).toBeGreaterThan(0);
  });

  it("sources the component count from the manifest-derived value, never the PR collector", () => {
    expect(REPO_STATS.rialtoComponents).toBe(RIALTO_COMPONENT_COUNT);
    expect(RIALTO_COMPONENT_COUNT).toBeGreaterThan(0);
  });

  it("never claims more agent PRs than total PRs", () => {
    expect(REPO_STATS.agentPrsMerged).toBeLessThanOrEqual(REPO_STATS.totalPrsMerged);
  });
});

describe("selectComponentCount", () => {
  it("prefers a valid generated count", () => {
    expect(selectComponentCount({ rialtoComponents: 200 }, 173)).toBe(200);
  });

  it("falls back on missing or malformed generated data", () => {
    for (const bad of [undefined, null, {}, { rialtoComponents: "9" }, { rialtoComponents: 0 }]) {
      expect(selectComponentCount(bad, 173)).toBe(173);
    }
  });
});
