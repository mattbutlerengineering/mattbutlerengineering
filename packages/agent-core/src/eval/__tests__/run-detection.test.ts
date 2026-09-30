import { describe, it, expect } from "vitest";
import { taskDidNotRun, suiteDidNotRun } from "../run-detection.js";
import { runEvalSuite } from "../eval-harness.js";
import type { EvalReport, Task, TaskScore } from "../types.js";
import type { SessionResult } from "../../types.js";

function score(overrides: Partial<TaskScore> = {}): TaskScore {
  return {
    taskId: "t1",
    category: "bugfix",
    passed: false,
    score: 0.33,
    deterministic: {
      testsPass: false,
      typecheckPass: false,
      lintPass: true,
      withinBudget: true,
    },
    costUsd: 0,
    turns: 0,
    ...overrides,
  };
}

function report(tasks: readonly TaskScore[]): EvalReport {
  return {
    runId: "r1",
    tasks,
    aggregate: {
      total: tasks.length,
      passRate: 0,
      meanScore: 0,
      meanCostUsd: 0,
      meanTurns: 0,
      stuckCount: 0,
    },
    byCategory: {},
    nonRunCount: 0,
  };
}

describe("taskDidNotRun", () => {
  it("is true when both turns and cost are zero", () => {
    expect(taskDidNotRun({ turns: 0, costUsd: 0 })).toBe(true);
  });

  it("is false when turns are non-zero, even at $0 cost", () => {
    expect(taskDidNotRun({ turns: 3, costUsd: 0 })).toBe(false);
  });

  it("is false when cost is non-zero, even at 0 turns", () => {
    expect(taskDidNotRun({ turns: 0, costUsd: 0.01 })).toBe(false);
  });
});

describe("suiteDidNotRun", () => {
  it("is true when every task in the report has 0 turns and $0 cost", () => {
    expect(suiteDidNotRun(report([score(), score({ taskId: "t2" })]))).toBe(true);
  });

  it("is false when at least one task genuinely executed", () => {
    expect(suiteDidNotRun(report([score(), score({ taskId: "t2", turns: 4, costUsd: 0.1 })]))).toBe(
      false
    );
  });

  it("is false for a genuine low-but-real score (non-zero turns)", () => {
    expect(suiteDidNotRun(report([score({ turns: 12, costUsd: 0.5 })]))).toBe(false);
  });

  it("is false when the report has no tasks", () => {
    expect(suiteDidNotRun(report([]))).toBe(false);
  });
});

// Errored-with-usage (amendment 2026-09-29): a session that ran and then failed
// a post-dispatch step is a scored task, never a non-run, and not "stuck".
describe("errored-with-usage", () => {
  const sessionErrors = ["git commit -m … failed"];

  it("is not a non-run, and a suite containing it did run", () => {
    const errored = score({ turns: 15, costUsd: 0.6, sessionErrors });
    expect(taskDidNotRun(errored)).toBe(false);
    expect(suiteDidNotRun(report([errored, score({ taskId: "t2" })]))).toBe(false);
  });

  it("is not counted in stuckCount (only a thrown task's `error` is)", async () => {
    const task: Task = {
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
      budget: { maxTurns: 20, maxCostUsd: 1 },
    };
    const session: SessionResult = {
      sessionId: "",
      status: "failed",
      branchName: "agent/t1",
      prUrl: null,
      costUsd: 0.6,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 1,
      numTurns: 15,
      resultText: "",
      errors: sessionErrors,
    };
    const result = await runEvalSuite([task], {
      runId: "r1",
      runTask: async (t) => ({
        task: t,
        session,
        checks: { testsPass: false, typecheckPass: false, lintPass: true, withinBudget: true },
      }),
    });
    expect(result.tasks[0]!.sessionErrors).toEqual(sessionErrors);
    expect(result.tasks[0]!.error).toBeUndefined();
    expect(result.aggregate.stuckCount).toBe(0);
    expect(result.nonRunCount).toBe(0);
    expect(suiteDidNotRun(result)).toBe(false);
  });
});
