import { describe, it, expect, vi } from "vitest";
import { createEvalJudge } from "../llm-judge.js";
import type { TaskRunResult } from "../types.js";

const run = { diff: "diff --git a/x b/x" } as unknown as TaskRunResult;

describe("createEvalJudge", () => {
  it("evaluates the run's diff against the criteria and never lets the skip policy fire", async () => {
    const verdict = { passed: true, confidence: 1, reasoning: "", issues: [] };
    const evaluate = vi.fn().mockResolvedValue(verdict);
    const result = await createEvalJudge(run, evaluate)("fix it", "- a\n- b");
    expect(result).toBe(verdict);
    const [task, diff, config] = evaluate.mock.calls[0]!;
    expect(task).toContain("fix it");
    expect(task).toContain("- a\n- b");
    expect(diff).toBe("diff --git a/x b/x");
    expect(config).toEqual({ forceEvaluate: true });
  });

  it("passes an empty diff through when the runner captured none", async () => {
    const evaluate = vi.fn().mockResolvedValue({ passed: false });
    await createEvalJudge({} as TaskRunResult, evaluate)("p", "c");
    expect(evaluate.mock.calls[0]![1]).toBe("");
  });
});
