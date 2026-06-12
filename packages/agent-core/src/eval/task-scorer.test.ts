import { describe, it, expect } from "vitest";
import { scoreTask } from "./task-scorer.js";
import type { DeterministicChecks, Task, TaskRunResult } from "./types.js";
import type { SessionResult } from "../types.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    category: "bugfix",
    prompt: "fix it",
    fixtureRef: "fixtures/t1",
    rubric: {
      testsMustPass: true,
      typecheckMustPass: true,
      lintMustPass: false,
      judgeCriteria: [],
    },
    budget: { maxTurns: 50, maxCostUsd: 1 },
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: "s1",
    status: "completed",
    branchName: "b",
    prUrl: null,
    costUsd: 0.2,
    tokenUsage: { inputTokens: 0, outputTokens: 0 } as SessionResult["tokenUsage"],
    durationMs: 1000,
    numTurns: 7,
    resultText: "",
    errors: [],
    ...overrides,
  };
}

function makeRun(
  checks: DeterministicChecks,
  task = makeTask(),
  session = makeSession()
): TaskRunResult {
  return { task, session, checks };
}

const ALL_PASS: DeterministicChecks = {
  testsPass: true,
  typecheckPass: true,
  lintPass: true,
  withinBudget: true,
};

describe("scoreTask", () => {
  it("passes and scores 1 when all applicable signals hold", () => {
    const score = scoreTask(makeRun(ALL_PASS));
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1);
  });

  it("fails when a required signal (tests) is false", () => {
    const score = scoreTask(makeRun({ ...ALL_PASS, testsPass: false }));
    expect(score.passed).toBe(false);
    expect(score.score).toBeLessThan(1);
  });

  it("ignores lint when rubric.lintMustPass is false", () => {
    // lint failing but not required → still passes (tests, typecheck, budget hold)
    const score = scoreTask(makeRun({ ...ALL_PASS, lintPass: false }));
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1);
  });

  it("counts lint when rubric.lintMustPass is true", () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: true,
        judgeCriteria: [],
      },
    });
    const score = scoreTask(makeRun({ ...ALL_PASS, lintPass: false }, task));
    expect(score.passed).toBe(false);
    // 3 of 4 applicable signals satisfied (tests, typecheck, budget) — lint failed
    expect(score.score).toBeCloseTo(3 / 4);
  });

  it("budget is always an applicable signal", () => {
    const score = scoreTask(makeRun({ ...ALL_PASS, withinBudget: false }));
    expect(score.passed).toBe(false);
  });

  it("carries cost, turns, and self-evaluation through for calibration", () => {
    const session = makeSession({
      costUsd: 0.5,
      numTurns: 12,
      evaluation: { passed: true, confidence: 0.9, reasoning: "looks good" },
    });
    const score = scoreTask(makeRun(ALL_PASS, makeTask(), session));
    expect(score.costUsd).toBe(0.5);
    expect(score.turns).toBe(12);
    expect(score.selfEvaluation?.confidence).toBe(0.9);
  });
});
