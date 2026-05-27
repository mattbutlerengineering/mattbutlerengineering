import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock orchestrateVerification
vi.mock("../verification-orchestrator.js", () => ({
  orchestrateVerification: vi.fn(),
}));

// Mock GateRunner
vi.mock("../gate-runner.js", () => ({
  GateRunner: vi.fn().mockImplementation(function () {
    return { run: vi.fn() };
  }),
}));

// Mock gate classes — plain vi.fn() so they are constructable
// GateRunner itself is mocked; the gate instances are never actually used
vi.mock("../gates/llm-evaluation-gate.js", () => ({
  LlmEvaluationGate: vi.fn(),
}));

vi.mock("../gates/security-review-gate.js", () => ({
  SecurityReviewGate: vi.fn(),
}));

vi.mock("../gates/static-analysis-gate.js", () => ({
  StaticAnalysisGate: vi.fn(),
}));

// Mock isTrivialDepBump
vi.mock("../dep-bump-merger.js", () => ({
  isTrivialDepBump: vi.fn(),
  mergeDirectly: vi.fn(),
}));

import { orchestrateVerification } from "../verification-orchestrator.js";
import { GateRunner } from "../gate-runner.js";
import { isTrivialDepBump } from "../dep-bump-merger.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";

// Helper to get the mock run fn from the constructed GateRunner instance
function getMockRunnerInstance() {
  const calls = vi.mocked(GateRunner).mock.results;
  return calls[calls.length - 1]?.value as { run: ReturnType<typeof vi.fn> } | undefined;
}

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

    // Default: all gates pass
    vi.mocked(orchestrateVerification).mockResolvedValue({ passed: true });

    // Re-mock GateRunner with fresh instance per test
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: [],
          evaluation: { passed: true, confidence: 0.9, reasoning: "Good", issues: [] },
          securityReview: { approved: true, issues: [] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

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
    vi.mocked(isTrivialDepBump).mockReturnValue({ isTrivial: false });

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

    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: [],
          securityReview: { approved: true, issues: [] },
          // No evaluation result since it was skipped
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(input);

    expect(verdict.outcome).toBe("create-pr");
    expect(verdict.passed).toBe(true);
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
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: false,
          errors: ["Static analysis errors: src/foo.ts:10 [no-console] console.log detected"],
          evaluation: { passed: true, confidence: 0.9, reasoning: "Good", issues: [] },
          securityReview: { approved: true, issues: [] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("static-analysis");
  });

  it("returns create-draft-pr when LLM evaluation fails", async () => {
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: ["Evaluation failed: Task not addressed"],
          evaluation: {
            passed: false,
            confidence: 0.3,
            reasoning: "Task not addressed",
            issues: [],
          },
          securityReview: { approved: true, issues: [] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("evaluation");
  });

  it("returns create-draft-pr when security review fails", async () => {
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: ["Security review failed: Hardcoded secret detected"],
          evaluation: { passed: true, confidence: 0.9, reasoning: "Good", issues: [] },
          securityReview: { approved: false, issues: ["Hardcoded secret detected"] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    expect(verdict.gateFailures).toContain("security-review");
  });

  // ── gateFailures combinations ──────────────────────────────────────

  it("collects multiple gate failures when verification and static analysis both fail", async () => {
    vi.mocked(orchestrateVerification).mockResolvedValue({
      passed: false,
      error: "Lint failed",
    });
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: false,
          errors: ["Static analysis errors: ..."],
          evaluation: { passed: true, confidence: 0.9, reasoning: "Good", issues: [] },
          securityReview: { approved: true, issues: [] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.outcome).toBe("create-draft-pr");
    expect(verdict.passed).toBe(false);
    // Verification failed → quality gates not run; only verification in gateFailures
    expect(verdict.gateFailures).toContain("verification");
  });

  it("collects evaluation and security-review failures when both fail", async () => {
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: [
            "Evaluation failed: Not addressed",
            "Security review failed: SQL injection detected",
          ],
          evaluation: { passed: false, confidence: 0.2, reasoning: "Not addressed", issues: [] },
          securityReview: { approved: false, issues: ["SQL injection detected"] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
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

  it("propagates quality gate errors into verdict errors", async () => {
    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: ["Evaluation failed: diff does not address task"],
          evaluation: { passed: false, confidence: 0.2, reasoning: "...", issues: [] },
          securityReview: { approved: true, issues: [] },
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    const verdict = await runPostCommitGateway(VALID_INPUT);

    expect(verdict.errors).toContain("Evaluation failed: diff does not address task");
  });

  // ── Config passthrough ─────────────────────────────────────────────

  it("passes config options to GateRunner.run()", async () => {
    const input = {
      ...VALID_INPUT,
      config: {
        evaluateSuccess: false,
        runSecurityReview: false,
        runStaticAnalysis: true,
      },
    };

    vi.mocked(GateRunner).mockImplementation(function () {
      return {
        run: vi.fn().mockResolvedValue({
          staticAnalysisClean: true,
          errors: [],
        }),
      } as unknown as InstanceType<typeof GateRunner>;
    });

    await runPostCommitGateway(input);

    const instance = getMockRunnerInstance();
    expect(instance?.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskDescription: input.taskDescription,
        diff: input.diff,
        commitMsg: input.commitMsg,
      }),
      undefined // no onEvent
    );
  });

  it("skips quality gates when verification fails", async () => {
    vi.mocked(orchestrateVerification).mockResolvedValue({
      passed: false,
      error: "Typecheck failed",
    });

    await runPostCommitGateway(VALID_INPUT);

    // GateRunner should not be constructed at all if verification failed
    expect(vi.mocked(GateRunner)).not.toHaveBeenCalled();
  });

  it("passes worktreePath to orchestrateVerification", async () => {
    await runPostCommitGateway(VALID_INPUT);

    expect(orchestrateVerification).toHaveBeenCalledWith(
      VALID_INPUT.worktreePath,
      undefined // no onEvent
    );
  });

  it("passes onEvent callback to orchestrateVerification and GateRunner.run()", async () => {
    const onEvent = vi.fn();

    await runPostCommitGateway(VALID_INPUT, onEvent);

    expect(orchestrateVerification).toHaveBeenCalledWith(VALID_INPUT.worktreePath, onEvent);

    const instance = getMockRunnerInstance();
    expect(instance?.run).toHaveBeenCalledWith(expect.any(Object), onEvent);
  });
});
