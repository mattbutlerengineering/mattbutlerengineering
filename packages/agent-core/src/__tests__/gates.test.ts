/**
 * Tests for the new GateResult.output typed field and shouldSkip(context, previousResults).
 *
 * These tests exercise the new interface BEFORE implementation (TDD red-green-refactor).
 * Old shallow tests that depend on mutable instance state are NOT duplicated here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GateContext, GateResult, QualityGate } from "../gate-runner.js";
import { GateRunner } from "../gate-runner.js";

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

// ── GateResult.output typed field ────────────────────────────────────────────

describe("GateResult.output typed field", () => {
  it("GateRunner passes typed output from gate results to the caller", async () => {
    const domainData = { confidence: 0.9, reasoning: "looks good" };
    const gate: QualityGate = {
      name: "typed-output-gate",
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: true,
          gateName: "typed-output-gate",
          severity: "error",
          output: domainData,
        })
      ),
    };

    const runner = new GateRunner([gate]);
    const result = await runner.run(makeContext());

    expect(result.results[0].output).toEqual(domainData);
  });

  it("GateResult.output is optional — gates without output still work", async () => {
    const gate: QualityGate = {
      name: "no-output-gate",
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: true,
          gateName: "no-output-gate",
          severity: "error",
        })
      ),
    };

    const runner = new GateRunner([gate]);
    const result = await runner.run(makeContext());

    expect(result.results[0].output).toBeUndefined();
  });
});

// ── LlmEvaluationGate returns EvaluationResult via output field ──────────────

describe("LlmEvaluationGate.evaluate — output field carries EvaluationResult", () => {
  let evaluateSuccess: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const evalMod = await import("../success-evaluator.js");
    evaluateSuccess = vi.mocked(evalMod.evaluateSuccess);
  });

  it("returns the EvaluationResult in result.output when evaluation passes", async () => {
    const evalResult = {
      passed: true,
      confidence: 0.92,
      reasoning: "Task addressed thoroughly",
      issues: [],
    };
    evaluateSuccess.mockResolvedValue(evalResult);

    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const gate = new LlmEvaluationGate();
    const result = await gate.evaluate(makeContext());

    expect(result.output).toEqual(evalResult);
    expect(result.passed).toBe(true);
  });

  it("returns the EvaluationResult in result.output when evaluation fails", async () => {
    const evalResult = {
      passed: false,
      confidence: 0.2,
      reasoning: "Task not addressed",
      issues: ["missing tests"],
    };
    evaluateSuccess.mockResolvedValue(evalResult);

    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const gate = new LlmEvaluationGate();
    const result = await gate.evaluate(makeContext());

    expect(result.output).toEqual(evalResult);
    expect(result.passed).toBe(false);
  });

  it("returns skipped EvaluationResult in result.output when skip policy fires", async () => {
    const skippedResult = {
      passed: true,
      confidence: 0,
      reasoning: "Evaluation unavailable",
      issues: [],
      skipped: true,
      skipReason: "small_diff_tests_passed",
    };
    evaluateSuccess.mockResolvedValue(skippedResult);

    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const gate = new LlmEvaluationGate();
    const result = await gate.evaluate(makeContext());

    expect(result.output).toEqual(skippedResult);
    expect((result.output as typeof skippedResult).skipped).toBe(true);
  });

  it("LlmEvaluationGate has no lastResult mutable instance field", async () => {
    evaluateSuccess.mockResolvedValue({
      passed: true,
      confidence: 0.9,
      reasoning: "Good",
      issues: [],
    });

    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const gate = new LlmEvaluationGate();

    // lastResult should not exist on the gate instance
    expect((gate as Record<string, unknown>)["lastResult"]).toBeUndefined();
  });
});

// ── shouldSkip receives previousResults ──────────────────────────────────────

describe("QualityGate.shouldSkip with previousResults parameter", () => {
  it("GateRunner passes previousResults (results so far) to shouldSkip", async () => {
    const capturedArgs: { context: GateContext; previousResults: readonly GateResult[] }[] = [];

    const firstGate: QualityGate = {
      name: "first",
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: false,
          gateName: "first",
          severity: "error",
          details: "first gate failed",
        })
      ),
    };

    const secondGate: QualityGate = {
      name: "second",
      shouldSkip: (ctx, previousResults) => {
        capturedArgs.push({ context: ctx, previousResults: previousResults ?? [] });
        return false;
      },
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: true,
          gateName: "second",
          severity: "error",
        })
      ),
    };

    const runner = new GateRunner([firstGate, secondGate]);
    await runner.run(makeContext());

    expect(capturedArgs).toHaveLength(1);
    expect(capturedArgs[0].previousResults).toHaveLength(1);
    expect(capturedArgs[0].previousResults[0].gateName).toBe("first");
    expect(capturedArgs[0].previousResults[0].passed).toBe(false);
  });

  it("first gate receives empty previousResults array", async () => {
    const capturedPrevious: readonly GateResult[][] = [];

    const gate: QualityGate = {
      name: "gate-a",
      shouldSkip: (_ctx, previousResults) => {
        capturedPrevious.push(previousResults ?? []);
        return false;
      },
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: true,
          gateName: "gate-a",
          severity: "error",
        })
      ),
    };

    const runner = new GateRunner([gate]);
    await runner.run(makeContext());

    expect(capturedPrevious[0]).toHaveLength(0);
  });

  it("shouldSkip can use previousResults to skip based on prior gate failure", async () => {
    const failingFirst: QualityGate = {
      name: "failing-first",
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: false,
          gateName: "failing-first",
          severity: "error",
        })
      ),
    };

    const conditionalGate: QualityGate = {
      name: "conditional",
      shouldSkip: (_ctx, previousResults) => {
        return (previousResults ?? []).some((r) => r.gateName === "failing-first" && !r.passed);
      },
      evaluate: vi.fn(
        async (): Promise<GateResult> => ({
          passed: true,
          gateName: "conditional",
          severity: "error",
        })
      ),
    };

    const runner = new GateRunner([failingFirst, conditionalGate]);
    const result = await runner.run(makeContext());

    expect(conditionalGate.evaluate).not.toHaveBeenCalled();
    expect(result.results.find((r) => r.gateName === "conditional")?.details).toBe("skipped");
  });
});

// ── SecurityReviewGate skips via previousResults (no closure) ────────────────

describe("SecurityReviewGate skip via previousResults", () => {
  let analyzeDiff: ReturnType<typeof vi.fn>;
  let reviewDiff: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const staticMod = await import("../diff-static-analyzer.js");
    const reviewMod = await import("../diff-reviewer.js");
    analyzeDiff = vi.mocked(staticMod.analyzeDiff);
    reviewDiff = vi.mocked(reviewMod.reviewDiff);
  });

  it("SecurityReviewGate skips when static-analysis gate failed in previousResults", async () => {
    analyzeDiff.mockReturnValue({
      clean: false,
      violations: [
        { file: "src/a.ts", line: 1, rule: "no-secret", message: "secret", severity: "error" },
      ],
    });
    reviewDiff.mockResolvedValue({ approved: true, issues: [] });

    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([new StaticAnalysisGate(), new SecurityReviewGate()]);
    await runner.run(makeContext());

    // Security review must NOT have run when static analysis failed
    expect(reviewDiff).not.toHaveBeenCalled();
  });

  it("SecurityReviewGate runs when static-analysis gate passed in previousResults", async () => {
    analyzeDiff.mockReturnValue({ clean: true, violations: [] });
    reviewDiff.mockResolvedValue({ approved: true, issues: [] });

    const { StaticAnalysisGate } = await import("../gates/static-analysis-gate.js");
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    const runner = new GateRunner([new StaticAnalysisGate(), new SecurityReviewGate()]);
    await runner.run(makeContext());

    expect(reviewDiff).toHaveBeenCalled();
  });

  it("SecurityReviewGate has no constructor closure parameter for skipWhen", async () => {
    const { SecurityReviewGate } = await import("../gates/security-review-gate.js");

    // Constructing without opts is still valid
    const gate = new SecurityReviewGate();
    expect(gate).toBeInstanceOf(SecurityReviewGate);

    // The gate's shouldSkip signature should accept previousResults as second param
    // (tested indirectly via GateRunner integration above)
  });
});

// ── post-commit-gateway extracts evaluation from GateResult.output ────────────

describe("post-commit-gateway extracts evaluation from GateResult output", () => {
  it("GateRunner integration: evaluation extracted from results, no evalGate.lastResult needed", async () => {
    const evalMod = await import("../success-evaluator.js");
    const evalResult = {
      passed: true,
      confidence: 0.95,
      reasoning: "Task fully addressed",
      issues: [],
    };
    vi.mocked(evalMod.evaluateSuccess).mockResolvedValue(evalResult);

    const staticMod = await import("../diff-static-analyzer.js");
    vi.mocked(staticMod.analyzeDiff).mockReturnValue({ clean: true, violations: [] });

    const { LlmEvaluationGate } = await import("../gates/llm-evaluation-gate.js");
    const gate = new LlmEvaluationGate();
    const runner = new GateRunner([gate]);
    const runResult = await runner.run(makeContext());

    // Caller can extract EvaluationResult from results by name — no instance state needed
    const evalGateResult = runResult.results.find((r) => r.gateName === "evaluation");
    expect(evalGateResult?.output).toEqual(evalResult);
  });
});
