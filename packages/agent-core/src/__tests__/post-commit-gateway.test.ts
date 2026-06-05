import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../verification-orchestrator.js", () => ({
  orchestrateVerification: vi.fn(),
}));

vi.mock("../diff-static-analyzer.js", () => ({
  analyzeDiff: vi.fn(),
}));

vi.mock("../success-evaluator.js", () => ({
  evaluateSuccess: vi.fn(),
}));

vi.mock("../diff-reviewer.js", () => ({
  reviewDiff: vi.fn(),
}));

vi.mock("../dep-bump-merger.js", () => ({
  isTrivialDepBump: vi.fn(),
  mergeDirectly: vi.fn(),
}));

vi.mock("../utils.js", () => ({
  emitEvent: vi.fn(),
}));

import { orchestrateVerification } from "../verification-orchestrator.js";
import { analyzeDiff } from "../diff-static-analyzer.js";
import { evaluateSuccess } from "../success-evaluator.js";
import { reviewDiff } from "../diff-reviewer.js";
import { isTrivialDepBump } from "../dep-bump-merger.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";

const VALID_INPUT = {
  worktreePath: "/repo/.agent-worktrees/branch-abc",
  diff: "diff --git a/src/index.ts\n+const x = 1;",
  commitMsg: "feat: add feature",
  taskDescription: "Add a new feature",
  config: {
    evaluateSuccess: true,
    runSecurityReview: true,
    runStaticAnalysis: true,
  },
};

describe("runPostCommitGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(orchestrateVerification).mockResolvedValue({ passed: true });
    vi.mocked(analyzeDiff).mockReturnValue({ clean: true, violations: [] });
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0.9,
      reasoning: "Good",
      issues: [],
    });
    vi.mocked(reviewDiff).mockResolvedValue({ approved: true, issues: [] });
    vi.mocked(isTrivialDepBump).mockReturnValue({ isTrivial: false });
  });

  // ── Outcome: merge-direct ──────────────────────────────────────────

  it("returns merge-direct outcome when all gates pass and diff is a trivial dep bump", async () => {
    vi.mocked(isTrivialDepBump).mockReturnValue({ isTrivial: true });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("merge-direct");
    expect(verdict.passed).toBe(true);
    expect(verdict.gateFailures).toEqual([]);
    expect(verdict.errors).toEqual([]);
  });

  // ── Outcome: create-pr ─────────────────────────────────────────────

  it("returns create-pr outcome when all gates pass and diff is not trivial", async () => {
    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-pr");
    expect(verdict.passed).toBe(true);
    expect(verdict.gateFailures).toEqual([]);
    expect(verdict.errors).toEqual([]);
  });

  it("returns create-pr when evaluateSuccess is false but everything else passes", async () => {
    const input = {
      ...VALID_INPUT,
      config: { ...VALID_INPUT.config, evaluateSuccess: false },
    };

    const verdict = await runPostCommitGateway(input);

    expect(verdict.outcome).toBe("create-pr");
    expect(verdict.passed).toBe(true);
    expect(evaluateSuccess).not.toHaveBeenCalled();
  });

  // ── Outcome: create-draft-pr ───────────────────────────────────────

  it("returns create-draft-pr when verification fails", async () => {
    vi.mocked(orchestrateVerification).mockResolvedValue({
      passed: false,
      error: "Verification failed: typecheck: Type error in src/foo.ts",
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("verification");
  });

  it("returns create-draft-pr when static analysis fails", async () => {
    vi.mocked(analyzeDiff).mockReturnValue({
      clean: false,
      violations: [
        {
          file: "src/foo.ts",
          line: 10,
          rule: "no-console",
          message: "console.log detected",
          severity: "error",
        },
      ],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("static-analysis");
  });

  it("returns create-draft-pr when LLM evaluation fails", async () => {
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: false,
      confidence: 0.3,
      reasoning: "Task not addressed",
      issues: [],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("evaluation");
  });

  it("returns create-draft-pr when security review fails", async () => {
    vi.mocked(reviewDiff).mockResolvedValue({
      approved: false,
      issues: ["Hardcoded secret detected"],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("security-review");
  });

  // ── Cross-gate dependencies ────────────────────────────────────────

  it("skips security review when static analysis fails", async () => {
    vi.mocked(analyzeDiff).mockReturnValue({
      clean: false,
      violations: [
        {
          file: "src/foo.ts",
          line: 10,
          rule: "no-console",
          message: "console.log detected",
          severity: "error",
        },
      ],
    });

    await runPostCommitGateway(VALID_INPUT);

    expect(reviewDiff).not.toHaveBeenCalled();
  });

  // ── gateFailures combinations ──────────────────────────────────────

  it("collects evaluation and security-review failures when both fail", async () => {
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: false,
      confidence: 0.2,
      reasoning: "Not addressed",
      issues: [],
    });
    vi.mocked(reviewDiff).mockResolvedValue({
      approved: false,
      issues: ["SQL injection detected"],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("evaluation");
    expect(verdict.gateFailures).toContain("security-review");
  });

  // ── errors propagation ─────────────────────────────────────────────

  it("propagates verification error into verdict errors", async () => {
    vi.mocked(orchestrateVerification).mockResolvedValue({
      passed: false,
      error: "Verification failed: tests: 2 failing",
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.errors).toContain("Verification failed: tests: 2 failing");
  });

  it("propagates gate error details into verdict errors", async () => {
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: false,
      confidence: 0.2,
      reasoning: "diff does not address task",
      issues: [],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.errors.some((e) => e.includes("diff does not address task"))).toBe(true);
  });

  // ── evaluation result passthrough ──────────────────────────────────

  it("includes evaluation result in verdict when evaluation runs", async () => {
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0.95,
      reasoning: "Good work",
      issues: [],
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.evaluation).toEqual({
      passed: true,
      confidence: 0.95,
      reasoning: "Good work",
      issues: [],
    });
  });

  it("carries the skipped evaluation result when the skip policy fires", async () => {
    // evaluateSuccess now absorbs the skip decision internally and returns
    // an inconclusive result marked `skipped` rather than being bypassed.
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0,
      reasoning: "Evaluation unavailable — defaulting to pass",
      issues: [],
      skipped: true,
      skipReason: "small_diff_tests_passed",
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.passed).toBe(true);
    expect(verdict.evaluation?.skipped).toBe(true);
    expect(evaluateSuccess).toHaveBeenCalled();
  });

  // ── Config gating ─────────────────────────────────────────────────

  it("skips quality gates when verification fails", async () => {
    vi.mocked(orchestrateVerification).mockResolvedValue({
      passed: false,
      error: "Typecheck failed",
    });

    await runPostCommitGateway(VALID_INPUT);

    expect(analyzeDiff).not.toHaveBeenCalled();
    expect(evaluateSuccess).not.toHaveBeenCalled();
    expect(reviewDiff).not.toHaveBeenCalled();
  });

  it("skips static analysis when config disables it", async () => {
    const input = {
      ...VALID_INPUT,
      config: { ...VALID_INPUT.config, runStaticAnalysis: false },
    };

    await runPostCommitGateway(input);

    expect(analyzeDiff).not.toHaveBeenCalled();
  });

  it("skips security review when config disables it", async () => {
    const input = {
      ...VALID_INPUT,
      config: { ...VALID_INPUT.config, runSecurityReview: false },
    };

    await runPostCommitGateway(input);

    expect(reviewDiff).not.toHaveBeenCalled();
  });

  it("passes worktreePath to orchestrateVerification", async () => {
    await runPostCommitGateway(VALID_INPUT);

    expect(orchestrateVerification).toHaveBeenCalledWith(VALID_INPUT.worktreePath, undefined);
  });

  it("passes onEvent callback to orchestrateVerification", async () => {
    const onEvent = vi.fn();

    await runPostCommitGateway(VALID_INPUT, onEvent);

    expect(orchestrateVerification).toHaveBeenCalledWith(VALID_INPUT.worktreePath, onEvent);
  });
});
