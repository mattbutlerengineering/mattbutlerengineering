import { describe, it, expect } from "vitest";
import {
  detectRegression,
  regressedCriteria,
  buildIssuePayload,
  withUpdatedTimestamp,
  REGRESSION_MARKER,
} from "../acmm-regression-check.mjs";

const STATE = {
  currentLevel: 4,
  levelName: "Integrated",
  lastRun: "2026-06-01T00:00:00.000Z",
  checks: {
    "acmm:prereq-test-suite": { passed: true, evidence: "vitest.config.ts" },
    "acmm:claude-md": { passed: true, evidence: "CLAUDE.md" },
    "acmm:editor-config": { passed: false, evidence: "none" },
    "acmm:repo-bench": { passed: false, evidence: "missing" },
  },
};

// detectRegression is a thin adapter over the shared `lib/ratchet.mjs`
// compare() core — comprehensive comparator edge cases (thresholds,
// direction, missing-baseline handling) live in ratchet.test.mjs. These
// assertions just confirm ACMM's (previousLevel, currentLevel) wiring.
describe("detectRegression", () => {
  it("flags a regression when current level is below previous", () => {
    const result = detectRegression(6, 4);
    expect(result.regressed).toBe(true);
    expect(result.previousLevel).toBe(6);
    expect(result.currentLevel).toBe(4);
  });

  it("does not flag when level is stable", () => {
    expect(detectRegression(4, 4).regressed).toBe(false);
  });

  it("does not flag when level improved", () => {
    expect(detectRegression(3, 5).regressed).toBe(false);
  });

  it("treats a missing previous level as no regression (first run)", () => {
    expect(detectRegression(null, 4).regressed).toBe(false);
    expect(detectRegression(undefined, 4).regressed).toBe(false);
  });
});

describe("regressedCriteria", () => {
  it("returns the ids of failing checks", () => {
    const ids = regressedCriteria(STATE.checks);
    expect(ids).toEqual(["acmm:editor-config", "acmm:repo-bench"]);
  });

  it("returns an empty array when all checks pass", () => {
    expect(regressedCriteria({ "a:foo": { passed: true } })).toEqual([]);
  });

  it("handles missing checks object", () => {
    expect(regressedCriteria(undefined)).toEqual([]);
  });
});

describe("buildIssuePayload", () => {
  it("produces title, body, and acmm+ready labels", () => {
    const payload = buildIssuePayload({
      previousLevel: 6,
      currentLevel: 4,
      levelName: "Integrated",
      failingIds: ["acmm:editor-config", "acmm:repo-bench"],
    });
    expect(payload.labels).toEqual(["acmm", "ready"]);
    expect(payload.title).toContain("6");
    expect(payload.title).toContain("4");
    expect(payload.body).toContain(REGRESSION_MARKER);
    expect(payload.body).toContain("acmm:editor-config");
    expect(payload.body).toContain("acmm:repo-bench");
    expect(payload.body).toContain("6");
    expect(payload.body).toContain("4");
  });

  it("includes the level name when provided", () => {
    const payload = buildIssuePayload({
      previousLevel: 5,
      currentLevel: 3,
      levelName: "Senior Engineer",
      failingIds: [],
    });
    expect(payload.body).toContain("Senior Engineer");
  });
});

describe("withUpdatedTimestamp", () => {
  it("returns a new state object with an updated lastRun, without mutating", () => {
    const next = withUpdatedTimestamp(STATE, "2026-06-14T12:00:00.000Z");
    expect(next.lastRun).toBe("2026-06-14T12:00:00.000Z");
    expect(STATE.lastRun).toBe("2026-06-01T00:00:00.000Z");
    expect(next).not.toBe(STATE);
    expect(next.currentLevel).toBe(STATE.currentLevel);
  });
});
