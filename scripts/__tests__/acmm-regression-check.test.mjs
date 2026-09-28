import { describe, it, expect } from "vitest";
import {
  isUnmeasurable,
  classifyLevelChange,
  regressedCriteria,
  buildIssuePayload,
  REGRESSION_MARKER,
} from "../acmm-regression-check.mjs";

const MEASURED_STATE = {
  currentLevel: 4,
  levelName: "Integrated",
  checks: {
    "acmm:prereq-test-suite": { passed: true, evidence: "vitest.config.ts", verdict: "pass" },
    "acmm:claude-md": { passed: true, evidence: "CLAUDE.md", verdict: "pass" },
    "acmm:editor-config": { passed: false, evidence: "none", verdict: "not-found" },
    "acmm:repo-bench": { passed: false, evidence: "missing", verdict: "not-found" },
  },
  computation: {
    behavioralGates: [
      { level: 3, name: "ci-flake-rate", passed: true, unverifiable: false, dataAvailable: true },
      {
        level: 4,
        name: "agent-pr-acceptance",
        passed: true,
        unverifiable: false,
        dataAvailable: true,
      },
    ],
  },
};

// detectRegression/withUpdatedTimestamp are gone: the pre-#5854 script compared
// `currentLevel` against `history[-1]`, both produced by the same computation,
// so a real drop could never be told apart from noise, and it rewrote
// `lastRun` on every non-regression run whether or not the audit could
// actually measure anything. The workflow now reads the level committed at
// HEAD *before* the audit runs and passes it in via `--previous-level`, so
// `classifyLevelChange` only ever compares two genuinely independent values.

describe("isUnmeasurable", () => {
  it("is false when every check has a real verdict and every gate is verified", () => {
    expect(isUnmeasurable(MEASURED_STATE)).toBe(false);
  });

  it("is true when any check's verdict is unverifiable (gh unavailable / read-only run)", () => {
    const state = {
      ...MEASURED_STATE,
      checks: {
        ...MEASURED_STATE.checks,
        "acmm:nightly-compliance": {
          passed: false,
          evidence: "gh CLI unavailable or error",
          verdict: "unverifiable",
        },
      },
    };
    expect(isUnmeasurable(state)).toBe(true);
  });

  it("is true when any behavioral gate verdict is unverifiable", () => {
    const state = {
      ...MEASURED_STATE,
      computation: {
        behavioralGates: [
          {
            level: 6,
            name: "agent-pr-revert-rate",
            passed: false,
            unverifiable: true,
            dataAvailable: false,
          },
        ],
      },
    };
    expect(isUnmeasurable(state)).toBe(true);
  });

  it("handles a state with no checks or computation at all", () => {
    expect(isUnmeasurable({})).toBe(false);
  });
});

describe("classifyLevelChange", () => {
  it("reports dropped when the current level is below the previous one", () => {
    const result = classifyLevelChange({ previousLevel: 6, currentLevel: 4, unmeasurable: false });
    expect(result).toEqual({ status: "dropped", previousLevel: 6, currentLevel: 4 });
  });

  it("reports same when the level is unchanged", () => {
    const result = classifyLevelChange({ previousLevel: 4, currentLevel: 4, unmeasurable: false });
    expect(result).toEqual({ status: "same", previousLevel: 4, currentLevel: 4 });
  });

  it("reports improved when the current level is above the previous one", () => {
    const result = classifyLevelChange({ previousLevel: 3, currentLevel: 5, unmeasurable: false });
    expect(result).toEqual({ status: "improved", previousLevel: 3, currentLevel: 5 });
  });

  it("reports unmeasurable when the audit could not measure, even if the level also dropped", () => {
    const result = classifyLevelChange({ previousLevel: 6, currentLevel: 4, unmeasurable: true });
    expect(result.status).toBe("unmeasurable");
  });

  it("reports unmeasurable when there is no previous level to compare (first run / HEAD had none)", () => {
    const result = classifyLevelChange({
      previousLevel: null,
      currentLevel: 4,
      unmeasurable: false,
    });
    expect(result.status).toBe("unmeasurable");
  });

  it("reports unmeasurable when the current level could not be computed", () => {
    const result = classifyLevelChange({
      previousLevel: 4,
      currentLevel: null,
      unmeasurable: false,
    });
    expect(result.status).toBe("unmeasurable");
  });
});

describe("regressedCriteria", () => {
  it("returns the ids of failing checks", () => {
    const ids = regressedCriteria(MEASURED_STATE.checks);
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
