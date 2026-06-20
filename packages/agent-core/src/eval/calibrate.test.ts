import { describe, it, expect } from "vitest";
import { calibrate } from "./calibrate.js";
import type { EvalReport, TaskScore } from "./types.js";

function makeScore(
  taskId: string,
  opts: {
    passed: boolean;
    confidence?: number;
  }
): TaskScore {
  return {
    taskId,
    category: "bugfix",
    passed: opts.passed,
    score: opts.passed ? 1 : 0,
    deterministic: {
      testsPass: opts.passed,
      typecheckPass: true,
      lintPass: true,
      withinBudget: true,
    },
    selfEvaluation:
      opts.confidence !== undefined
        ? { passed: opts.confidence >= 0.7, confidence: opts.confidence, reasoning: "auto" }
        : undefined,
    costUsd: 0.1,
    turns: 5,
  };
}

function makeReport(scores: TaskScore[]): EvalReport {
  const total = scores.length;
  const passed = scores.filter((s) => s.passed).length;
  return {
    runId: "test-run",
    tasks: scores,
    aggregate: {
      total,
      passRate: total === 0 ? 0 : passed / total,
      meanScore: total === 0 ? 0 : scores.reduce((a, s) => a + s.score, 0) / total,
      meanCostUsd: 0.1,
      meanTurns: 5,
      stuckCount: 0,
    },
  };
}

describe("calibrate", () => {
  it("returns correct bucketed accuracy for mixed high/med/low confidence", () => {
    const report = makeReport([
      makeScore("t1", { passed: true, confidence: 0.9 }), // high, passed
      makeScore("t2", { passed: true, confidence: 0.85 }), // high, passed
      makeScore("t3", { passed: false, confidence: 0.8 }), // high, failed
      makeScore("t4", { passed: true, confidence: 0.6 }), // med, passed
      makeScore("t5", { passed: false, confidence: 0.5 }), // med, failed
      makeScore("t6", { passed: false, confidence: 0.3 }), // low, failed
    ]);

    const summary = calibrate(report);

    expect(summary.high.count).toBe(3);
    expect(summary.high.passRate).toBeCloseTo(2 / 3);

    expect(summary.medium.count).toBe(2);
    expect(summary.medium.passRate).toBeCloseTo(1 / 2);

    expect(summary.low.count).toBe(1);
    expect(summary.low.passRate).toBe(0);

    expect(summary.totalWithSelfEval).toBe(6);
    expect(summary.totalWithoutSelfEval).toBe(0);
  });

  it("returns zero-counts for an empty report", () => {
    const summary = calibrate(makeReport([]));
    expect(summary.high.count).toBe(0);
    expect(summary.medium.count).toBe(0);
    expect(summary.low.count).toBe(0);
    expect(summary.totalWithSelfEval).toBe(0);
    expect(summary.totalWithoutSelfEval).toBe(0);
  });

  it("tracks tasks without self-evaluation separately", () => {
    const report = makeReport([
      makeScore("t1", { passed: true, confidence: 0.9 }),
      makeScore("t2", { passed: true }), // no selfEvaluation
    ]);

    const summary = calibrate(report);

    expect(summary.totalWithSelfEval).toBe(1);
    expect(summary.totalWithoutSelfEval).toBe(1);
    expect(summary.high.count).toBe(1);
  });

  it("handles all-pass report with high confidence correctly", () => {
    const report = makeReport([
      makeScore("t1", { passed: true, confidence: 0.9 }),
      makeScore("t2", { passed: true, confidence: 0.95 }),
    ]);

    const summary = calibrate(report);

    expect(summary.high.count).toBe(2);
    expect(summary.high.passRate).toBe(1);
    expect(summary.medium.count).toBe(0);
    expect(summary.low.count).toBe(0);
  });

  it("handles all-fail report with low confidence correctly", () => {
    const report = makeReport([
      makeScore("t1", { passed: false, confidence: 0.2 }),
      makeScore("t2", { passed: false, confidence: 0.3 }),
    ]);

    const summary = calibrate(report);

    expect(summary.low.count).toBe(2);
    expect(summary.low.passRate).toBe(0);
    expect(summary.high.count).toBe(0);
    expect(summary.medium.count).toBe(0);
  });

  it("boundary: confidence exactly 0.7 is high, exactly 0.4 is medium", () => {
    const report = makeReport([
      makeScore("boundary-high", { passed: true, confidence: 0.7 }),
      makeScore("boundary-med", { passed: false, confidence: 0.4 }),
    ]);

    const summary = calibrate(report);

    expect(summary.high.count).toBe(1);
    expect(summary.medium.count).toBe(1);
    expect(summary.low.count).toBe(0);
  });

  it("is a pure function — does not mutate the input report", () => {
    const scores = [makeScore("t1", { passed: true, confidence: 0.9 })];
    const report = makeReport(scores);
    const tasksBefore = report.tasks;

    calibrate(report);

    expect(report.tasks).toBe(tasksBefore);
  });
});
