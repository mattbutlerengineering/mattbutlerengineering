import { describe, it, expect } from "vitest";
import { runEvalSuite } from "./eval-harness.js";
import type { DeterministicChecks, Task, TaskRunResult, TaskRunner } from "./types.js";
import type { SessionResult } from "../types.js";

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    category: "bugfix",
    prompt: `do ${id}`,
    fixtureRef: `fixtures/${id}`,
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

function session(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: "s",
    status: "completed",
    branchName: "b",
    prUrl: null,
    costUsd: 0.1,
    tokenUsage: { inputTokens: 0, outputTokens: 0 } as SessionResult["tokenUsage"],
    durationMs: 1,
    numTurns: 5,
    resultText: "",
    errors: [],
    ...overrides,
  };
}

const PASS: DeterministicChecks = {
  testsPass: true,
  typecheckPass: true,
  lintPass: true,
  withinBudget: true,
};
const FAIL: DeterministicChecks = {
  testsPass: false,
  typecheckPass: true,
  lintPass: true,
  withinBudget: true,
};

function runnerFrom(
  map: Record<string, { checks: DeterministicChecks; session?: SessionResult }>
): TaskRunner {
  return async (task: Task): Promise<TaskRunResult> => {
    const entry = map[task.id];
    return { task, session: entry.session ?? session(), checks: entry.checks };
  };
}

describe("runEvalSuite", () => {
  it("scores every task and aggregates pass rate", async () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const report = await runEvalSuite(tasks, {
      runId: "run-1",
      runTask: runnerFrom({ a: { checks: PASS }, b: { checks: FAIL } }),
    });

    expect(report.runId).toBe("run-1");
    expect(report.tasks).toHaveLength(2);
    expect(report.aggregate.total).toBe(2);
    expect(report.aggregate.passRate).toBe(0.5);
  });

  it("records a thrown task as a failed score and continues the suite", async () => {
    const tasks = [makeTask("ok"), makeTask("boom")];
    const runTask: TaskRunner = async (task) => {
      if (task.id === "boom") throw new Error("agent crashed");
      return { task, session: session(), checks: PASS };
    };

    const report = await runEvalSuite(tasks, { runId: "r", runTask });

    expect(report.tasks).toHaveLength(2);
    const boom = report.tasks.find((t) => t.taskId === "boom");
    expect(boom?.passed).toBe(false);
    expect(boom?.score).toBe(0);
    expect(boom?.error).toMatch(/agent crashed/);
    expect(report.aggregate.stuckCount).toBe(1);
    // the healthy task still scored
    expect(report.tasks.find((t) => t.taskId === "ok")?.passed).toBe(true);
  });

  it("runs only the selected task when `only` is set", async () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const report = await runEvalSuite(tasks, {
      runId: "r",
      only: "b",
      runTask: runnerFrom({ a: { checks: PASS }, b: { checks: PASS } }),
    });

    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0].taskId).toBe("b");
  });

  it("returns a zeroed aggregate for an empty suite", async () => {
    const report = await runEvalSuite([], { runId: "r", runTask: runnerFrom({}) });
    expect(report.aggregate).toEqual({
      total: 0,
      passRate: 0,
      meanScore: 0,
      meanCostUsd: 0,
      meanTurns: 0,
      stuckCount: 0,
      byCategory: {},
    });
  });

  it("averages cost and turns across tasks", async () => {
    const tasks = [makeTask("a"), makeTask("b")];
    const report = await runEvalSuite(tasks, {
      runId: "r",
      runTask: runnerFrom({
        a: { checks: PASS, session: session({ costUsd: 0.2, numTurns: 4 }) },
        b: { checks: PASS, session: session({ costUsd: 0.4, numTurns: 8 }) },
      }),
    });
    expect(report.aggregate.meanCostUsd).toBeCloseTo(0.3);
    expect(report.aggregate.meanTurns).toBe(6);
  });

  it("breaks down pass rate by category in aggregate.byCategory", async () => {
    const tasks = [
      makeTask("a", { category: "bugfix" }),
      makeTask("b", { category: "bugfix" }),
      makeTask("c", { category: "refactor" }),
    ];
    const report = await runEvalSuite(tasks, {
      runId: "r",
      runTask: runnerFrom({
        a: { checks: PASS },
        b: { checks: FAIL },
        c: { checks: PASS },
      }),
    });

    const byCategory = report.aggregate.byCategory;
    expect(byCategory["bugfix"]).toEqual({ total: 2, passRate: 0.5 });
    expect(byCategory["refactor"]).toEqual({ total: 1, passRate: 1 });
    // categories not in the suite should not appear
    expect(byCategory["dep-bump"]).toBeUndefined();
  });

  it("byCategory is empty object for empty suite", async () => {
    const report = await runEvalSuite([], { runId: "r", runTask: runnerFrom({}) });
    expect(report.aggregate.byCategory).toEqual({});
  });
});
