import { describe, it, expect } from "vitest";
import { taskDidNotRun, suiteDidNotRun } from "../run-detection.js";
import type { EvalReport, TaskScore } from "../types.js";

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
