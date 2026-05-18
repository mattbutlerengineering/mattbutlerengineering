import { describe, it, expect } from "vitest";
import { transformState } from "../generate-acmm-report.mjs";

const FULL_STATE = {
  currentLevel: 3,
  levelName: "Integrated",
  role: "Senior Engineer",
  lastRun: "2026-05-01T00:00:00.000Z",
  checks: {
    "acmm:prereq-test-suite": { passed: true, evidence: "vitest.config.ts" },
    "acmm:claude-md": { passed: true, evidence: "CLAUDE.md" },
    "acmm:editor-config": { passed: false, evidence: "none" },
  },
  detectedIds: ["acmm:prereq-test-suite", "acmm:claude-md"],
  behavioral: {
    flake: { rate_30d: 0.02 },
    agent_pr: { acceptance_rate_30d: 0.9, revert_rate_30d: 0.01 },
    evals: { passRate: 0.85 },
  },
  computation: {
    behavioralGates: [
      { level: 3, name: "ci-flake-rate", passed: true, value: 0.02, threshold: 0.1 },
    ],
  },
};

describe("transformState", () => {
  it("maps identity fields", () => {
    const ws = transformState(FULL_STATE, "mypackage", "packages/mypackage", "package");
    expect(ws.name).toBe("mypackage");
    expect(ws.path).toBe("packages/mypackage");
    expect(ws.type).toBe("package");
    expect(ws.currentLevel).toBe(3);
    expect(ws.levelName).toBe("Integrated");
    expect(ws.role).toBe("Senior Engineer");
    expect(ws.lastRun).toBe("2026-05-01T00:00:00.000Z");
  });

  it("computes summary from checks and detectedIds", () => {
    const ws = transformState(FULL_STATE, "mypackage", "packages/mypackage", "package");
    expect(ws.summary.total).toBe(3);
    expect(ws.summary.detected).toBe(2);
    expect(ws.summary.coverage).toBeCloseTo(2 / 3);
  });

  it("extracts behavioral metrics", () => {
    const ws = transformState(FULL_STATE, "mypackage", "packages/mypackage", "package");
    expect(ws.behavioral.ciFlakeRate).toBe(0.02);
    expect(ws.behavioral.agentPrAcceptanceRate).toBe(0.9);
    expect(ws.behavioral.agentPrRevertRate).toBe(0.01);
    expect(ws.behavioral.evalPassRate).toBe(0.85);
  });

  it("maps behavioral gates", () => {
    const ws = transformState(FULL_STATE, "mypackage", "packages/mypackage", "package");
    expect(ws.behavioralGates).toHaveLength(1);
    expect(ws.behavioralGates[0]).toEqual({
      level: 3,
      name: "ci-flake-rate",
      passed: true,
      value: 0.02,
      threshold: 0.1,
    });
  });

  it("strips evidence from checks, keeps passed boolean", () => {
    const ws = transformState(FULL_STATE, "mypackage", "packages/mypackage", "package");
    expect(ws.checks["acmm:prereq-test-suite"]).toEqual({ passed: true });
    expect(ws.checks["acmm:editor-config"]).toEqual({ passed: false });
    expect(ws.checks["acmm:prereq-test-suite"].evidence).toBeUndefined();
  });

  it("defaults all fields when state is empty", () => {
    const ws = transformState({}, "bare", "packages/bare", "package");
    expect(ws.currentLevel).toBe(1);
    expect(ws.levelName).toBe("Unknown");
    expect(ws.role).toBe("");
    expect(ws.lastRun).toBeNull();
    expect(ws.summary).toEqual({ detected: 0, total: 0, coverage: 0 });
    expect(ws.behavioral.ciFlakeRate).toBe(0);
    expect(ws.behavioral.agentPrAcceptanceRate).toBe(0);
    expect(ws.behavioral.agentPrRevertRate).toBe(0);
    expect(ws.behavioral.evalPassRate).toBe(0);
    expect(ws.checks).toEqual({});
    expect(ws.behavioralGates).toHaveLength(0);
  });

  it("coverage is 0 when no checks exist (avoids divide-by-zero)", () => {
    const ws = transformState({ detectedIds: ["a"] }, "bare", "packages/bare", "package");
    expect(ws.summary.coverage).toBe(0);
  });

  it("coverage equals 1 when all checks pass", () => {
    const allPass = {
      checks: { "a:foo": { passed: true }, "a:bar": { passed: true } },
      detectedIds: ["a:foo", "a:bar"],
    };
    const ws = transformState(allPass, "full", "packages/full", "package");
    expect(ws.summary.coverage).toBe(1);
  });
});
