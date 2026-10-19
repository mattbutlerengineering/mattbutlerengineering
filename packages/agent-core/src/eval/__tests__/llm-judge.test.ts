import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMockQueryStream } from "../../testing/index.js";
import { createEvalJudge } from "../llm-judge.js";
import { EMPTY_DIFF_MARKER } from "../../success-evaluator.js";
import type { TaskRunResult } from "../types.js";

const run = { diff: "diff --git a/x b/x" } as unknown as TaskRunResult;

function mockJudgeVerdict(): void {
  vi.mocked(query).mockReturnValue(
    createMockQueryStream([
      {
        type: "result",
        subtype: "success",
        structured_output: { passed: true, confidence: 0.9, reasoning: "ok", issues: [] },
      },
    ]) as ReturnType<typeof query>
  );
}

function sentPrompt(): string {
  return String(vi.mocked(query).mock.calls[0]![0].prompt);
}

describe("createEvalJudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates the run's diff against the criteria and never lets the skip policy fire", async () => {
    const verdict = { passed: true, confidence: 1, reasoning: "", issues: [] };
    const evaluate = vi.fn().mockResolvedValue(verdict);
    const result = await createEvalJudge(run, evaluate)("fix it", "a\nb");
    expect(result).toBe(verdict);
    const [task, diff, config] = evaluate.mock.calls[0]!;
    expect(task).toContain("fix it");
    expect(task).toContain("## Acceptance Criteria\n- [ ] a\n- [ ] b");
    expect(diff).toBe("diff --git a/x b/x");
    expect(config).toEqual({ forceEvaluate: true });
  });

  it("passes a captured-but-empty diff through with forceEvaluate so the judge rules on the criteria", async () => {
    const evaluate = vi.fn().mockResolvedValue({ passed: true });
    await createEvalJudge({ diff: "" } as TaskRunResult, evaluate)("p", "c");
    expect(evaluate.mock.calls[0]![1]).toBe("");
    expect(evaluate.mock.calls[0]![2]).toEqual({ forceEvaluate: true });
  });

  it("is inconclusive (evaluationFailed) without calling the evaluator when the diff was not captured", async () => {
    const evaluate = vi.fn();
    const result = await createEvalJudge({} as TaskRunResult, evaluate)("p", "c");
    expect(evaluate).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.evaluationFailed).toBe(true);
  });

  it("emits the per-criterion section in the real evaluator prompt", async () => {
    mockJudgeVerdict();
    await createEvalJudge(run)("fix it", "criterion one\ncriterion two");
    const prompt = sentPrompt();
    expect(prompt).toContain("## Acceptance Criteria (from the issue)");
    expect(prompt).toContain("1. criterion one");
    expect(prompt).toContain("2. criterion two");
  });

  it("sends an empty diff to the real evaluator with a no-op marker instead of short-circuiting", async () => {
    mockJudgeVerdict();
    const result = await createEvalJudge({ diff: "" } as TaskRunResult)(
      "bump js-yaml",
      "already there, confirmed as a no-op"
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(sentPrompt()).toContain(EMPTY_DIFF_MARKER);
    expect(result.passed).toBe(true);
    expect(result.issues).not.toContain("Empty diff");
  });
});
