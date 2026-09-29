import { describe, it, expect } from "vitest";
import { SCANNABLE_IDS_BY_LEVEL } from "../../plugins/acmm/scripts/scannableIdsByLevel.js";
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

// A criterion id that actually gates L5 and one that gates L6, pulled from
// the real catalog rather than hardcoded — the fixture below has to stay
// meaningful if #5853 renames or reshuffles ids.
const L5_GATING_ID = SCANNABLE_IDS_BY_LEVEL[5][0];
const L6_GATING_ID = SCANNABLE_IDS_BY_LEVEL[6][0];

// Real-shaped: five `meta:*` criteria that are unverifiable on every run,
// with or without `gh` (`gh run list --workflow=metrics/x.jsonl` errors) —
// the exact shape that made every drop misclassify as `unmeasurable` before
// this fix, since none of the five ever gates any level (source: "meta",
// not "acmm", so SCANNABLE_IDS_BY_LEVEL never contains them).
function realShapedState(overrides = {}) {
  return {
    currentLevel: 4,
    levelName: "Integrated",
    checks: {
      [L5_GATING_ID]: { passed: true, evidence: "measured", verdict: "pass" },
      [L6_GATING_ID]: { passed: true, evidence: "measured", verdict: "pass" },
      "meta:threshold-tuning": {
        passed: false,
        evidence: "gh CLI unavailable or error querying improvement issues",
        verdict: "unverifiable",
      },
      "meta:instruction-evolution": {
        passed: false,
        evidence: "gh CLI unavailable or error querying improvement issues",
        verdict: "unverifiable",
      },
      "meta:process-metrics": {
        passed: false,
        evidence: "gh CLI unavailable or error querying improvement issues",
        verdict: "unverifiable",
      },
      "meta:fp-rate-healthy": {
        passed: false,
        evidence: "gh CLI unavailable or error querying improvement issues",
        verdict: "unverifiable",
      },
      "meta:audit-freshness": {
        passed: false,
        evidence: "gh CLI unavailable or error querying improvement issues",
        verdict: "unverifiable",
      },
    },
    computation: {
      behavioralGates: [
        { level: 3, name: "ci-flake-rate", passed: true, unverifiable: false },
        { level: 6, name: "agent-pr-revert-rate", passed: true, unverifiable: false },
      ],
    },
    ...overrides,
  };
}

describe("isUnmeasurable", () => {
  it("is false when the level did not drop, no matter what is unverifiable", () => {
    const state = realShapedState();
    expect(isUnmeasurable(state, { previousLevel: 4, currentLevel: 4 })).toBe(false);
    expect(isUnmeasurable(state, { previousLevel: 3, currentLevel: 5 })).toBe(false);
  });

  it("is true when either level is missing (no baseline / audit failed to compute one)", () => {
    const state = realShapedState();
    expect(isUnmeasurable(state, { previousLevel: null, currentLevel: 4 })).toBe(true);
    expect(isUnmeasurable(state, { previousLevel: 6, currentLevel: null })).toBe(true);
  });

  it("does not flag a drop as unmeasurable when only non-gating meta:* criteria are unverifiable (5 meta:* unverifiable, drop 6->4 -> dropped)", () => {
    const state = realShapedState({ currentLevel: 4 });
    const unmeasurable = isUnmeasurable(state, { previousLevel: 6, currentLevel: 4 });
    expect(unmeasurable).toBe(false);
    expect(classifyLevelChange({ previousLevel: 6, currentLevel: 4, unmeasurable }).status).toBe(
      "dropped"
    );
  });

  it("flags unmeasurable when the single explaining level's (L5) gating acmm:* criterion is unverifiable (drop 6->4 -> unmeasurable)", () => {
    const state = realShapedState({
      currentLevel: 4,
      checks: {
        ...realShapedState().checks,
        [L5_GATING_ID]: {
          passed: false,
          evidence: "gh CLI unavailable or error",
          verdict: "unverifiable",
        },
      },
    });
    expect(isUnmeasurable(state, { previousLevel: 6, currentLevel: 4 })).toBe(true);
  });

  it("flags unmeasurable when the single explaining level's (L6) behavioral gate is unverifiable (drop 6->5 -> unmeasurable)", () => {
    const state = realShapedState({
      currentLevel: 5,
      computation: {
        behavioralGates: [
          { level: 6, name: "agent-pr-revert-rate", passed: false, unverifiable: true },
        ],
      },
    });
    expect(isUnmeasurable(state, { previousLevel: 6, currentLevel: 5 })).toBe(true);
  });

  it("ignores an unverifiable gate at a level other than the one explaining the drop (L3 gate is irrelevant; drop 6->4's explaining level is L5)", () => {
    const state = realShapedState({
      currentLevel: 4,
      computation: {
        behavioralGates: [{ level: 3, name: "ci-flake-rate", passed: false, unverifiable: true }],
      },
    });
    expect(isUnmeasurable(state, { previousLevel: 6, currentLevel: 4 })).toBe(false);
  });

  it("does not flag unmeasurable from an unverifiable item at a level the walk never would have reached (drop 6->3, only L6 unverifiable -> dropped, not unmeasurable)", () => {
    // computeLevel.js's walk breaks at the FIRST failing level above
    // currentLevel — for a 6->3 drop that's L4, not L6. An unverifiable L6
    // item can't explain why the walk stopped at 3, so it must not suppress
    // the regression (the wider previousLevel..currentLevel range this
    // function used before #5854 review round 2 would have wrongly
    // considered L6 in-range for this drop and flagged it unmeasurable).
    const state = realShapedState({
      currentLevel: 3,
      checks: {
        ...realShapedState().checks,
        [L6_GATING_ID]: {
          passed: false,
          evidence: "gh CLI unavailable or error",
          verdict: "unverifiable",
        },
      },
    });
    const unmeasurable = isUnmeasurable(state, { previousLevel: 6, currentLevel: 3 });
    expect(unmeasurable).toBe(false);
    expect(classifyLevelChange({ previousLevel: 6, currentLevel: 3, unmeasurable }).status).toBe(
      "dropped"
    );
  });

  it("expands the virtual acmm:agent-instructions id back to its real constituent checks when L2 is the level explaining the drop", () => {
    const state = {
      currentLevel: 1,
      checks: {
        "acmm:claude-md": {
          passed: false,
          evidence: "gh CLI unavailable or error",
          verdict: "unverifiable",
        },
      },
      computation: { behavioralGates: [] },
    };
    expect(isUnmeasurable(state, { previousLevel: 3, currentLevel: 1 })).toBe(true);
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
