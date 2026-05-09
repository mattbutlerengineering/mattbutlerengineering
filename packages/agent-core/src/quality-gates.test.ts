import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: vi.fn(() => ({
      startSpan: vi.fn(() => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
      })),
    })),
  },
}));

vi.mock("./success-evaluator.js", () => ({
  evaluateSuccess: vi.fn(),
  shouldEvaluate: vi.fn(),
}));

vi.mock("./diff-reviewer.js", () => ({
  reviewDiff: vi.fn(),
}));

vi.mock("./diff-static-analyzer.js", () => ({
  analyzeDiff: vi.fn(),
}));

vi.mock("./utils.js", () => ({
  emitEvent: vi.fn(),
}));

import { evaluateSuccess, shouldEvaluate } from "./success-evaluator.js";
import { reviewDiff } from "./diff-reviewer.js";
import { analyzeDiff } from "./diff-static-analyzer.js";
import { emitEvent } from "./utils.js";
import { runQualityGates } from "./quality-gates.js";

const SAMPLE_DIFF = "diff --git a/src/main.ts b/src/main.ts\n+const x = 1;";

describe("runQualityGates", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: clean static analysis
    vi.mocked(analyzeDiff).mockReturnValue({
      clean: true,
      violations: [],
      durationMs: 5,
    });

    // Default: should evaluate returns true
    vi.mocked(shouldEvaluate).mockReturnValue(true);

    // Default: evaluation passes
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0.9,
      reasoning: "Looks good",
      issues: [],
    });

    // Default: security review approved
    vi.mocked(reviewDiff).mockResolvedValue({
      approved: true,
      issues: [],
      summary: "No issues found",
    });
  });

  // ── Static Analysis ───────────────────────────────────────────────

  describe("static analysis", () => {
    it("sets staticAnalysisClean=true when no violations", async () => {
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});
      expect(result.staticAnalysisClean).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("sets staticAnalysisClean=false and adds error for error-severity violations", async () => {
      vi.mocked(analyzeDiff).mockReturnValue({
        clean: false,
        violations: [
          { rule: "no-console-log", file: "src/main.ts", line: 5, message: "Remove console.log()", severity: "error" },
        ],
        durationMs: 5,
      });

      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(result.staticAnalysisClean).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Static analysis errors");
      expect(result.errors[0]).toContain("no-console-log");
    });

    it("emits event with error count for error-severity violations", async () => {
      vi.mocked(analyzeDiff).mockReturnValue({
        clean: false,
        violations: [
          { rule: "no-console-log", file: "src/main.ts", line: 5, message: "Remove console.log()", severity: "error" },
        ],
        durationMs: 5,
      });
      const onEvent = vi.fn();

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:verification",
        expect.objectContaining({ message: expect.stringContaining("1 error(s)") })
      );
    });

    it("does not add error for warning-only violations", async () => {
      vi.mocked(analyzeDiff).mockReturnValue({
        clean: false,
        violations: [
          { rule: "no-hardcoded-hex", file: "src/Component.tsx", line: 3, message: "Use design tokens", severity: "warning" },
        ],
        durationMs: 5,
      });

      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(result.errors).toHaveLength(0);
    });

    it("emits warning event for warning-only violations", async () => {
      vi.mocked(analyzeDiff).mockReturnValue({
        clean: false,
        violations: [
          { rule: "no-hardcoded-hex", file: "src/Component.tsx", line: 3, message: "Use design tokens", severity: "warning" },
        ],
        durationMs: 5,
      });
      const onEvent = vi.fn();

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:verification",
        expect.objectContaining({ message: expect.stringContaining("warning(s) (non-blocking)") })
      );
    });

    it("skips static analysis when runStaticAnalysis=false", async () => {
      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", { runStaticAnalysis: false });
      expect(analyzeDiff).not.toHaveBeenCalled();
    });
  });

  // ── LLM Evaluation ────────────────────────────────────────────────

  describe("LLM evaluation", () => {
    it("sets evaluation on result when evaluation passes", async () => {
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});
      expect(result.evaluation?.passed).toBe(true);
      expect(result.evaluation?.confidence).toBe(0.9);
    });

    it("adds error when evaluation fails", async () => {
      vi.mocked(evaluateSuccess).mockResolvedValue({
        passed: false,
        confidence: 0.7,
        reasoning: "Does not address the task",
        issues: ["Missing tests"],
      });

      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(result.errors).toContain("Evaluation failed: Does not address the task");
    });

    it("emits PASS evaluation event", async () => {
      const onEvent = vi.fn();
      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:evaluation",
        expect.objectContaining({ message: expect.stringContaining("PASS") })
      );
    });

    it("emits FAIL evaluation event when evaluation fails", async () => {
      vi.mocked(evaluateSuccess).mockResolvedValue({
        passed: false,
        confidence: 0.6,
        reasoning: "Bad diff",
        issues: [],
      });
      const onEvent = vi.fn();

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:evaluation",
        expect.objectContaining({ message: expect.stringContaining("FAIL") })
      );
    });

    it("emits skip event when shouldEvaluate returns false", async () => {
      vi.mocked(shouldEvaluate).mockReturnValue(false);
      const onEvent = vi.fn();

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:evaluation",
        expect.objectContaining({ message: expect.stringContaining("skipped") })
      );
      expect(evaluateSuccess).not.toHaveBeenCalled();
    });

    it("skips evaluation when evaluateSuccess=false", async () => {
      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", { evaluateSuccess: false });
      expect(evaluateSuccess).not.toHaveBeenCalled();
    });

    it("does not set evaluation result when shouldEvaluate returns false", async () => {
      vi.mocked(shouldEvaluate).mockReturnValue(false);
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});
      expect(result.evaluation).toBeUndefined();
    });
  });

  // ── Security Review ───────────────────────────────────────────────

  describe("security review", () => {
    it("sets securityReview on result when approved", async () => {
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});
      expect(result.securityReview?.approved).toBe(true);
    });

    it("adds error when security review blocked", async () => {
      vi.mocked(reviewDiff).mockResolvedValue({
        approved: false,
        issues: ["Hardcoded API key", "XSS vulnerability"],
        summary: "Security issues found",
      });

      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Security review failed");
      expect(result.errors[0]).toContain("Hardcoded API key");
    });

    it("emits APPROVED event when security review passes", async () => {
      const onEvent = vi.fn();
      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:review",
        expect.objectContaining({ message: "Security review: APPROVED" })
      );
    });

    it("emits BLOCKED event when security review fails", async () => {
      vi.mocked(reviewDiff).mockResolvedValue({
        approved: false,
        issues: ["Hardcoded secret"],
        summary: "Issues found",
      });
      const onEvent = vi.fn();

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {}, onEvent);

      expect(emitEvent).toHaveBeenCalledWith(
        onEvent,
        "session:review",
        expect.objectContaining({ message: expect.stringContaining("BLOCKED") })
      );
    });

    it("skips security review when runSecurityReview=false", async () => {
      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", { runSecurityReview: false });
      expect(reviewDiff).not.toHaveBeenCalled();
    });

    it("skips security review when static analysis has errors", async () => {
      vi.mocked(analyzeDiff).mockReturnValue({
        clean: false,
        violations: [
          { rule: "no-console-log", file: "src/main.ts", line: 1, message: "Remove console.log()", severity: "error" },
        ],
        durationMs: 5,
      });

      await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(reviewDiff).not.toHaveBeenCalled();
    });
  });

  // ── Combined gate results ─────────────────────────────────────────

  describe("combined gate results", () => {
    it("returns empty errors array when all gates pass", async () => {
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});
      expect(result.errors).toHaveLength(0);
    });

    it("accumulates errors from multiple failing gates", async () => {
      vi.mocked(evaluateSuccess).mockResolvedValue({
        passed: false,
        confidence: 0.4,
        reasoning: "Wrong changes",
        issues: [],
      });
      vi.mocked(reviewDiff).mockResolvedValue({
        approved: false,
        issues: ["SQL injection"],
        summary: "Issues found",
      });

      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {});

      expect(result.errors).toHaveLength(2);
    });

    it("returns no securityReview when all options disabled", async () => {
      const result = await runQualityGates("Fix bug", SAMPLE_DIFF, "fix: bug", {
        evaluateSuccess: false,
        runSecurityReview: false,
        runStaticAnalysis: false,
      });

      expect(result.evaluation).toBeUndefined();
      expect(result.securityReview).toBeUndefined();
      expect(result.errors).toHaveLength(0);
    });

    it("passes commitMsg to shouldEvaluate", async () => {
      await runQualityGates("Fix bug", SAMPLE_DIFF, "chore(deps): bump lodash", {});

      expect(shouldEvaluate).toHaveBeenCalledWith(
        SAMPLE_DIFF,
        expect.objectContaining({ commitTitle: "chore(deps): bump lodash" })
      );
    });
  });
});
