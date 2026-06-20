import { describe, it, expect, vi } from "vitest";
import { scoreTask } from "./task-scorer.js";
import type { DeterministicChecks, JudgeFunction, Task, TaskRunResult } from "./types.js";
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

describe("scoreTask — deterministic only (no judgeCriteria)", () => {
  it("passes and scores 1 when all applicable signals hold", async () => {
    const score = await scoreTask(makeRun(ALL_PASS));
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1);
  });

  it("fails when a required signal (tests) is false", async () => {
    const score = await scoreTask(makeRun({ ...ALL_PASS, testsPass: false }));
    expect(score.passed).toBe(false);
    expect(score.score).toBeLessThan(1);
  });

  it("ignores lint when rubric.lintMustPass is false", async () => {
    // lint failing but not required → still passes (tests, typecheck, budget hold)
    const score = await scoreTask(makeRun({ ...ALL_PASS, lintPass: false }));
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1);
  });

  it("counts lint when rubric.lintMustPass is true", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: true,
        judgeCriteria: [],
      },
    });
    const score = await scoreTask(makeRun({ ...ALL_PASS, lintPass: false }, task));
    expect(score.passed).toBe(false);
    // 3 of 4 applicable signals satisfied (tests, typecheck, budget) — lint failed
    expect(score.score).toBeCloseTo(3 / 4);
  });

  it("budget is always an applicable signal", async () => {
    const score = await scoreTask(makeRun({ ...ALL_PASS, withinBudget: false }));
    expect(score.passed).toBe(false);
  });

  it("carries cost, turns, and self-evaluation through for calibration", async () => {
    const session = makeSession({
      costUsd: 0.5,
      numTurns: 12,
      evaluation: { passed: true, confidence: 0.9, reasoning: "looks good" },
    });
    const score = await scoreTask(makeRun(ALL_PASS, makeTask(), session));
    expect(score.costUsd).toBe(0.5);
    expect(score.turns).toBe(12);
    expect(score.selfEvaluation?.confidence).toBe(0.9);
  });
});

describe("scoreTask — LLM judge (stubbed via JudgeFunction seam)", () => {
  const passingJudge: JudgeFunction = vi.fn().mockResolvedValue({
    passed: true,
    confidence: 0.9,
    reasoning: "change solves the task",
    issues: [],
  });

  const failingJudge: JudgeFunction = vi.fn().mockResolvedValue({
    passed: false,
    confidence: 0.85,
    reasoning: "change does not address the task",
    issues: ["Missing implementation"],
  });

  it("does NOT invoke judge when judgeCriteria is empty", async () => {
    const judge = vi.fn();
    await scoreTask(makeRun(ALL_PASS), judge);
    expect(judge).not.toHaveBeenCalled();
  });

  it("invokes judge when rubric has judgeCriteria", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["change actually fixes the reported bug"],
      },
    });
    const judge: JudgeFunction = vi.fn().mockResolvedValue({
      passed: true,
      confidence: 0.9,
      reasoning: "ok",
      issues: [],
    });
    await scoreTask(makeRun(ALL_PASS, task), judge);
    expect(judge).toHaveBeenCalledOnce();
    expect(judge).toHaveBeenCalledWith(
      task.prompt,
      expect.stringContaining("change actually fixes the reported bug")
    );
  });

  it("combines passing judge with passing deterministic → score 1, passed true", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["fix is correct"],
      },
    });
    const score = await scoreTask(makeRun(ALL_PASS, task), passingJudge);
    expect(score.passed).toBe(true);
    expect(score.score).toBe(1);
    expect(score.judgeResult?.passed).toBe(true);
  });

  it("combines failing judge with passing deterministic → passed false", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["fix is correct"],
      },
    });
    const score = await scoreTask(makeRun(ALL_PASS, task), failingJudge);
    expect(score.passed).toBe(false);
    // 3 deterministic pass + 1 judge fails → 3/4
    expect(score.score).toBeCloseTo(3 / 4);
    expect(score.judgeResult?.passed).toBe(false);
    expect(score.judgeResult?.reasoning).toMatch(/does not address/);
  });

  it("combines passing judge with failing deterministic → passed false", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["fix is correct"],
      },
    });
    const score = await scoreTask(makeRun({ ...ALL_PASS, testsPass: false }, task), passingJudge);
    expect(score.passed).toBe(false);
    // tests fail (1/4 deterministic applicable), judge passes → 3/4
    expect(score.score).toBeCloseTo(3 / 4);
  });

  it("attaches judgeResult to TaskScore when judge runs", async () => {
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["fix is correct"],
      },
    });
    const score = await scoreTask(makeRun(ALL_PASS, task), passingJudge);
    expect(score.judgeResult).toBeDefined();
    expect(score.judgeResult?.confidence).toBe(0.9);
  });

  it("does NOT attach judgeResult when no judgeCriteria", async () => {
    const score = await scoreTask(makeRun(ALL_PASS));
    expect(score.judgeResult).toBeUndefined();
  });

  it("treats judge as passed when no judge function provided but judgeCriteria present", async () => {
    // No judge passed — should default to passing (don't block deterministic tasks)
    const task = makeTask({
      rubric: {
        testsMustPass: true,
        typecheckMustPass: true,
        lintMustPass: false,
        judgeCriteria: ["fix is correct"],
      },
    });
    const score = await scoreTask(makeRun(ALL_PASS, task));
    // judge not provided, criteria ignored → pure deterministic scoring
    expect(score.passed).toBe(true);
    expect(score.judgeResult).toBeUndefined();
  });
});
