import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";
import { GateRunner } from "../gate-runner.js";

// ── Mocks for real gate integration tests ────────────────────────────
vi.mock("../diff-static-analyzer.js", () => ({
  analyzeDiff: vi.fn(),
}));

vi.mock("../success-evaluator.js", () => ({
  evaluateSuccess: vi.fn(),
}));

vi.mock("../diff-reviewer.js", () => ({
  reviewDiff: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
      }),
    }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────

function makeContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    diff: "diff --git a/src/foo.ts b/src/foo.ts\n+const x = 1;",
    taskDescription: "Fix the bug",
    commitMsg: "fix: the bug",
    evaluateSuccess: true,
    runStaticAnalysis: true,
    runSecurityReview: true,
    ...overrides,
  };
}

function passingGate(name: string): QualityGate {
  return {
    name,
    evaluate: vi.fn(
      async (): Promise<GateResult> => ({
        passed: true,
        gateName: name,
        severity: "error",
      })
    ),
  };
}

function failingGate(name: string, details = "something went wrong"): QualityGate {
  return {
    name,
    evaluate: vi.fn(
      async (): Promise<GateResult> => ({
        passed: false,
        gateName: name,
        severity: "error",
        details,
      })
    ),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("GateRunner", () => {
  describe("basic execution", () => {
    it("returns passed=true when gate list is empty", async () => {
      const runner = new GateRunner([]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it("runs gates in order and collects results", async () => {
      const order: string[] = [];
      const gates: QualityGate[] = [
        {
          name: "gate-a",
          evaluate: vi.fn(async () => {
            order.push("a");
            return { passed: true, gateName: "gate-a", severity: "error" as const };
          }),
        },
        {
          name: "gate-b",
          evaluate: vi.fn(async () => {
            order.push("b");
            return { passed: true, gateName: "gate-b", severity: "error" as const };
          }),
        },
        {
          name: "gate-c",
          evaluate: vi.fn(async () => {
            order.push("c");
            return { passed: true, gateName: "gate-c", severity: "error" as const };
          }),
        },
      ];

      const runner = new GateRunner(gates);
      await runner.run(makeContext());
      expect(order).toEqual(["a", "b", "c"]);
    });

    it("returns all gate results in the results array", async () => {
      const runner = new GateRunner([passingGate("alpha"), passingGate("beta")]);
      const result = await runner.run(makeContext());
      expect(result.results).toHaveLength(2);
      expect(result.results[0].gateName).toBe("alpha");
      expect(result.results[1].gateName).toBe("beta");
    });

    it("passes context to each gate", async () => {
      const ctx = makeContext({ taskDescription: "special task" });
      const gate = passingGate("ctx-gate");
      const runner = new GateRunner([gate]);
      await runner.run(ctx);
      expect(gate.evaluate).toHaveBeenCalledWith(ctx);
    });
  });

  describe("pass/fail determination", () => {
    it("returns passed=true when all gates pass", async () => {
      const runner = new GateRunner([passingGate("a"), passingGate("b")]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });

    it("returns passed=false when any gate fails", async () => {
      const runner = new GateRunner([passingGate("a"), failingGate("b"), passingGate("c")]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(false);
    });

    it("includes details from failing gates in the result", async () => {
      const runner = new GateRunner([failingGate("broken", "specific error detail")]);
      const result = await runner.run(makeContext());
      expect(result.results[0].details).toBe("specific error detail");
    });

    it("continues running gates after a failure", async () => {
      const last = passingGate("last");
      const runner = new GateRunner([failingGate("first"), last]);
      await runner.run(makeContext());
      expect(last.evaluate).toHaveBeenCalled();
    });
  });

  describe("shouldSkip", () => {
    it("skips gate when shouldSkip returns true", async () => {
      const gate: QualityGate = {
        name: "skip-me",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skip-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => true),
      };

      const runner = new GateRunner([gate]);
      const result = await runner.run(makeContext());

      expect(gate.evaluate).not.toHaveBeenCalled();
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].details).toBe("skipped");
    });

    it("does not skip gate when shouldSkip returns false", async () => {
      const gate: QualityGate = {
        name: "run-me",
        evaluate: vi.fn(async () => ({
          passed: true,
          gateName: "run-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => false),
      };

      const runner = new GateRunner([gate]);
      await runner.run(makeContext());

      expect(gate.evaluate).toHaveBeenCalled();
    });

    it("skipped gates do not cause overall failure", async () => {
      const gate: QualityGate = {
        name: "skip-me",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skip-me",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => true),
      };

      const runner = new GateRunner([gate]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });

    it("passes context to shouldSkip", async () => {
      const ctx = makeContext({ evaluateSuccess: false });
      const gate: QualityGate = {
        name: "ctx-skip",
        evaluate: vi.fn(async () => ({
          passed: true,
          gateName: "ctx-skip",
          severity: "error" as const,
        })),
        shouldSkip: vi.fn(() => false),
      };

      const runner = new GateRunner([gate]);
      await runner.run(ctx);
      expect(gate.shouldSkip).toHaveBeenCalledWith(ctx);
    });

    it("gates without shouldSkip always run", async () => {
      const gate = passingGate("always-runs");
      const runner = new GateRunner([gate]);
      await runner.run(makeContext());
      expect(gate.evaluate).toHaveBeenCalled();
    });

    it("mixed skipped and non-skipped gates only fail on non-skipped failures", async () => {
      const skipped: QualityGate = {
        name: "skipped",
        evaluate: vi.fn(async () => ({
          passed: false,
          gateName: "skipped",
          severity: "error" as const,
        })),
        shouldSkip: () => true,
      };
      const passed = passingGate("passed");

      const runner = new GateRunner([skipped, passed]);
      const result = await runner.run(makeContext());
      expect(result.passed).toBe(true);
    });
  });
});

// ── Integration: GateRunner composed with real gate implementations ──

describe("GateRunner integration with real gates", () => {
  let analyzeDiff: ReturnType<typeof vi.fn>;
  let evaluateSuccess: ReturnType<typeof vi.fn>;
  let reviewDiff: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const staticMod = await import("../diff-static-analyzer.js");
    const evalMod = await import("../success-evaluator.js");
    const reviewMod = await import("../diff-reviewer.js");
    analyzeDiff = vi.mocked(staticMod.analyzeDiff);
    evaluateSuccess = vi.mocked(evalMod.evaluateSuccess);
    reviewDiff = vi.mocked(reviewMod.reviewDiff);

    analyzeDiff.mockReturnValue({ clean: true, violations: [] });
    evaluateSuccess.mockResolvedValue({
      passed: true,
      confidence: 0.9,
      reasoning: "Good",
      issues: [],
    });
    reviewDiff.mockResolvedValue({ approved: true, issues: [] });
  });

  function makeRealContext(overrides: Partial<GateContext> = {}): GateContext {
    return {
      diff: "diff --git a/src/foo.ts b/src/foo.ts\n+const x = 1;",
      taskDescription: "Fix the bug",
      commitMsg: "fix: the bug",
      evaluateSuccess: true,
      runStaticAnalysis: true,
      runSecurityReview: true,
      ...overrides,
    };
  }

  it("passes when all real gates pass", async () => {
    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    const result = await runner.run(makeRealContext());

    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(3);
  });

  it("fails when static analysis gate finds error violations", async () => {
    analyzeDiff.mockReturnValue({
      clean: false,
      violations: [
        {
          file: "src/foo.ts",
          line: 5,
          rule: "no-secret",
          message: "hardcoded secret",
          severity: "error",
        },
      ],
    });

    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    const result = await runner.run(makeRealContext());

    expect(result.passed).toBe(false);
    const staticResult = result.results.find((r) => r.gateName === "static-analysis");
    expect(staticResult?.passed).toBe(false);
    expect(staticResult?.details).toContain("hardcoded secret");
  });

  it("fails when LLM evaluation gate returns failed result", async () => {
    evaluateSuccess.mockResolvedValue({
      passed: false,
      confidence: 0.2,
      reasoning: "Task not addressed",
      issues: [],
    });

    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    const result = await runner.run(makeRealContext());

    expect(result.passed).toBe(false);
    const evalResult = result.results.find((r) => r.gateName === "evaluation");
    expect(evalResult?.passed).toBe(false);
    expect(evalResult?.details).toContain("Task not addressed");
  });

  it("fails when security review gate rejects", async () => {
    reviewDiff.mockResolvedValue({ approved: false, issues: ["SQL injection detected"] });

    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    const result = await runner.run(makeRealContext());

    expect(result.passed).toBe(false);
    const secResult = result.results.find((r) => r.gateName === "security-review");
    expect(secResult?.passed).toBe(false);
    expect(secResult?.details).toContain("SQL injection detected");
  });

  it("skips LLM evaluation gate when evaluateSuccess=false in context", async () => {
    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    await runner.run(makeRealContext({ evaluateSuccess: false }));

    expect(evaluateSuccess).not.toHaveBeenCalled();
  });

  it("skips security review gate when runSecurityReview=false in context", async () => {
    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([
      new StaticAnalysisGate(),
      new LlmEvaluationGate(),
      new SecurityReviewGate(),
    ]);

    await runner.run(makeRealContext({ runSecurityReview: false }));

    expect(reviewDiff).not.toHaveBeenCalled();
  });

  it("SecurityReviewGate skips when skipWhen callback returns true", async () => {
    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    // Static analysis fails — security review should be skipped via skipWhen
    analyzeDiff.mockReturnValue({
      clean: false,
      violations: [
        { file: "src/a.ts", line: 1, rule: "no-secret", message: "secret", severity: "error" },
      ],
    });
    let staticPassed = true;
    const staticGate = new StaticAnalysisGate();
    const secGate = new SecurityReviewGate({ skipWhen: () => !staticPassed });

    // First gate will fail and we track that
    const patchedStatic: QualityGate = {
      name: staticGate.name,
      shouldSkip: staticGate.shouldSkip?.bind(staticGate),
      evaluate: async (ctx) => {
        const r = await staticGate.evaluate(ctx);
        staticPassed = r.passed;
        return r;
      },
    };

    const runner = new GateRunner([new LlmEvaluationGate(), patchedStatic, secGate]);

    const result = await runner.run(makeRealContext());

    expect(reviewDiff).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
  });
});
