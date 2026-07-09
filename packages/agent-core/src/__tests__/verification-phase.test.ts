import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent, SessionResultSummary } from "../types.js";
import type { PhaseDeps, VerificationPhaseInput } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// retry (skip delays) plus VerificationPhase's private collaborators —
// git-diff (success-evaluator) and the post-commit gateway — are module-
// mocked with `vi.mock` (#3120); worktree-manager stays injected via
// `PhaseDeps`.

vi.mock("../retry.js", async () => {
  const actual = (await vi.importActual("../retry.js")) as Record<string, unknown>;
  return {
    ...actual,
    withRetry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      const value = await fn();
      return { value, attempts: 1 };
    }),
  };
});

vi.mock("../success-evaluator.js", async () => {
  const actual = (await vi.importActual("../success-evaluator.js")) as Record<string, unknown>;
  return { ...actual, getGitDiff: vi.fn() };
});

vi.mock("../post-commit-gateway.js", async () => {
  const actual = (await vi.importActual("../post-commit-gateway.js")) as Record<string, unknown>;
  return { ...actual, runPostCommitGateway: vi.fn() };
});

// ── Imports (after mocks) ───────────────────────────────────────────

import { VerificationPhase } from "../phases/verification-phase.js";
import { getGitDiff } from "../success-evaluator.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_CONFIG: SessionConfig = {
  taskDescription: "Fix the login bug",
  repoPath: "/repo",
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
  createPr: true,
};

function createMockResultMessage(): SessionResultSummary {
  return {
    success: true,
    sessionId: "session-123",
    costUsd: 0.25,
    numTurns: 5,
  };
}

function makeInput(overrides?: Partial<VerificationPhaseInput>): VerificationPhaseInput {
  return {
    config: BASE_CONFIG,
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    resultMessage: createMockResultMessage(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("VerificationPhase", () => {
  const phase = new VerificationPhase();
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(getGitDiff).mockResolvedValue("diff --git a/file.ts\n+change");
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
  });

  it("has name 'verification'", () => {
    expect(phase.name).toBe("verification");
  });

  it("commits, pushes, and runs gateway when changes exist", async () => {
    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(deps.worktreeManager.commitChanges).toHaveBeenCalled();
    expect(deps.worktreeManager.pushBranch).toHaveBeenCalled();
    expect(output?.hasChanges).toBe(true);
    expect(output?.gatewayVerdict).toBeDefined();
    expect(output?.gatewayVerdict?.outcome).toBe("create-pr");
  });

  it("skips commit/push when no changes", async () => {
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(output?.hasChanges).toBe(false);
    expect(deps.worktreeManager.commitChanges).not.toHaveBeenCalled();
    expect(deps.worktreeManager.pushBranch).not.toHaveBeenCalled();
  });

  it("runs gateway only when session succeeded (no stuck)", async () => {
    const { output } = await phase.run(
      makeInput({
        stuckReason: {
          type: "repeated_action_observation",
          count: 4,
          threshold: 4,
          description: "stuck",
          severity: "error",
        } as VerificationPhaseInput["stuckReason"],
      }),
      deps
    );

    // Should still commit/push, but not run gateway
    expect(deps.worktreeManager.commitChanges).toHaveBeenCalled();
    expect(runPostCommitGateway).not.toHaveBeenCalled();
    expect(output?.gatewayVerdict).toBeUndefined();
  });

  it("collects gateway errors into the phase result", async () => {
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-draft-pr",
      passed: false,
      gateFailures: ["verification"],
      errors: ["Verification failed: typecheck errors"],
    });

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.errors).toContain("Verification failed: typecheck errors");
    expect(output?.gatewayVerdict?.outcome).toBe("create-draft-pr");
  });

  it("caches git diff (only calls getGitDiff once)", async () => {
    await phase.run(makeInput(), deps);

    expect(getGitDiff).toHaveBeenCalledTimes(1);
  });

  it("emits 'no changes' event when nothing changed", async () => {
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeInput({ onEvent }), deps);

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("No changes");
  });
});
