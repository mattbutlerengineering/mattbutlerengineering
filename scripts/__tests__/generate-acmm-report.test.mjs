import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transformRepoState, loadRootState } from "../generate-acmm-report.mjs";

const NOW = new Date("2026-09-28T16:07:00.000Z");

const BASE_STATE = {
  currentLevel: 6,
  levelName: "Fully Autonomous",
  role: "Strategist",
  lastRun: "2026-09-28T16:07:00.403Z",
  checks: {
    "acmm:prereq-test-suite": { passed: true, evidence: "vitest.config.ts" },
    "acmm:claude-md": { passed: true, evidence: "CLAUDE.md" },
    "acmm:editor-config": { passed: false, evidence: "none" },
  },
  detectedIds: ["acmm:prereq-test-suite", "acmm:claude-md"],
  behavioral: {
    flake: { rate_30d: 0.02 },
    agent_pr: { acceptance_rate_30d: 0.98, revert_rate_30d: 0 },
    // Mirrors the real root state.json: a reading whose suite last ran
    // 2026-05-10, well outside the 30-day window measured from NOW.
    evals: { n: 37, passRate: 0.8649, lastRun: "2026-05-10T21:42:57.095Z", windowDays: 30 },
  },
  computation: {
    behavioralGates: [
      {
        level: 3,
        name: "ci-flake-rate",
        passed: true,
        value: 0.02,
        threshold: 0.2,
        unverifiable: false,
      },
      // #5852 introduces gates with `unverifiable: true` and a null value
      // when the underlying signal can't be checked (e.g. no `gh` access).
      {
        level: 6,
        name: "human-touch-ratio",
        passed: false,
        value: null,
        threshold: 0.5,
        unverifiable: true,
      },
    ],
  },
};

describe("transformRepoState", () => {
  it("maps identity fields", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.currentLevel).toBe(6);
    expect(repo.levelName).toBe("Fully Autonomous");
    expect(repo.role).toBe("Strategist");
    expect(repo.lastRun).toBe("2026-09-28T16:07:00.403Z");
  });

  it("computes summary from checks and detectedIds", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.summary.total).toBe(3);
    expect(repo.summary.detected).toBe(2);
    expect(repo.summary.coverage).toBeCloseTo(2 / 3);
  });

  it("extracts ci flake / agent PR behavioral metrics", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.behavioral.ciFlakeRate).toBe(0.02);
    expect(repo.behavioral.agentPrAcceptanceRate).toBe(0.98);
    expect(repo.behavioral.agentPrRevertRate).toBe(0);
  });

  it("a stale eval reading emits evalPassRate: null and evalsStale: true, never a percentage", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.behavioral.evalsStale).toBe(true);
    expect(repo.behavioral.evalPassRate).toBeNull();
    expect(repo.behavioral.evalsLastRun).toBe("2026-05-10T21:42:57.095Z");
  });

  it("a fresh eval reading (inside the freshness window) emits the live pass rate", () => {
    const fresh = {
      ...BASE_STATE,
      behavioral: {
        ...BASE_STATE.behavioral,
        evals: { n: 5, passRate: 0.8, lastRun: "2026-09-25T00:00:00.000Z", windowDays: 30 },
      },
    };
    const repo = transformRepoState(fresh, { now: NOW });
    expect(repo.behavioral.evalsStale).toBe(false);
    expect(repo.behavioral.evalPassRate).toBe(0.8);
    expect(repo.behavioral.evalsLastRun).toBe("2026-09-25T00:00:00.000Z");
  });

  it("a missing evals reading is treated as stale with no lastRun (never crashes)", () => {
    const noEvals = {
      ...BASE_STATE,
      behavioral: { flake: BASE_STATE.behavioral.flake, agent_pr: BASE_STATE.behavioral.agent_pr },
    };
    const repo = transformRepoState(noEvals, { now: NOW });
    expect(repo.behavioral.evalsStale).toBe(true);
    expect(repo.behavioral.evalPassRate).toBeNull();
    expect(repo.behavioral.evalsLastRun).toBeNull();
  });

  it("maps behavioral gates, tolerating an unverifiable gate with a null value", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.behavioralGates).toHaveLength(2);
    expect(repo.behavioralGates[0]).toEqual({
      level: 3,
      name: "ci-flake-rate",
      passed: true,
      value: 0.02,
      threshold: 0.2,
      unverifiable: false,
    });
    expect(repo.behavioralGates[1]).toEqual({
      level: 6,
      name: "human-touch-ratio",
      passed: false,
      value: null,
      threshold: 0.5,
      unverifiable: true,
    });
  });

  it("defaults unverifiable to false and value to null when a gate omits them", () => {
    const withBareGate = {
      ...BASE_STATE,
      computation: {
        behavioralGates: [{ level: 4, name: "agent-pr-acceptance", passed: true, threshold: 0.5 }],
      },
    };
    const repo = transformRepoState(withBareGate, { now: NOW });
    expect(repo.behavioralGates[0]).toEqual({
      level: 4,
      name: "agent-pr-acceptance",
      passed: true,
      value: null,
      threshold: 0.5,
      unverifiable: false,
    });
  });

  it("strips evidence from checks, keeps only the passed boolean", () => {
    const repo = transformRepoState(BASE_STATE, { now: NOW });
    expect(repo.checks["acmm:prereq-test-suite"]).toEqual({ passed: true });
    expect(repo.checks["acmm:prereq-test-suite"].evidence).toBeUndefined();
  });

  it("defaults all fields when state is empty", () => {
    const repo = transformRepoState({}, { now: NOW });
    expect(repo.currentLevel).toBe(1);
    expect(repo.levelName).toBe("Unknown");
    expect(repo.role).toBe("");
    expect(repo.lastRun).toBeNull();
    expect(repo.summary).toEqual({ detected: 0, total: 0, coverage: 0 });
    expect(repo.behavioral.ciFlakeRate).toBe(0);
    expect(repo.behavioral.agentPrAcceptanceRate).toBe(0);
    expect(repo.behavioral.agentPrRevertRate).toBe(0);
    expect(repo.behavioral.evalPassRate).toBeNull();
    expect(repo.behavioral.evalsStale).toBe(true);
    expect(repo.checks).toEqual({});
    expect(repo.behavioralGates).toEqual([]);
  });

  it("coverage is 0 when no checks exist (avoids divide-by-zero)", () => {
    const repo = transformRepoState({ detectedIds: ["a"] }, { now: NOW });
    expect(repo.summary.coverage).toBe(0);
  });
});

describe("loadRootState", () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "acmm-report-root-"));
    return {
      root,
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  it("reads only the root .claude/acmm/state.json, never a per-workspace one", () => {
    const fx = fixture();
    try {
      mkdirSync(join(fx.root, ".claude", "acmm"), { recursive: true });
      writeFileSync(
        join(fx.root, ".claude", "acmm", "state.json"),
        JSON.stringify({ currentLevel: 6, levelName: "Fully Autonomous" })
      );
      // A stale per-workspace state file that must never be read or merged in.
      mkdirSync(join(fx.root, "packages", "foo", ".claude", "acmm"), { recursive: true });
      writeFileSync(
        join(fx.root, "packages", "foo", ".claude", "acmm", "state.json"),
        JSON.stringify({ currentLevel: 1, levelName: "Should never surface" })
      );

      const state = loadRootState(fx.root);
      expect(state.currentLevel).toBe(6);
      expect(state.levelName).toBe("Fully Autonomous");
    } finally {
      fx.cleanup();
    }
  });

  it("returns null when no root state.json exists", () => {
    const fx = fixture();
    try {
      expect(loadRootState(fx.root)).toBeNull();
    } finally {
      fx.cleanup();
    }
  });
});
