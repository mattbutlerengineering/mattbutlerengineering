import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PhaseDeps, VerificationPhaseInput } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// Only retry (skip delays) is module-mocked; all collaborators are
// injected via `PhaseDeps`.

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

// ── Imports (after mocks) ───────────────────────────────────────────

import { VerificationPhase } from "../phases/verification-phase.js";

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

function createMockResultMessage() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    uuid: "test-uuid",
    session_id: "session-123",
    duration_ms: 5000,
    duration_api_ms: 4000,
    is_error: false,
    num_turns: 5,
    result: "Task completed",
    stop_reason: "end_turn",
    total_cost_usd: 0.25,
    usage: {
      input_tokens: 10000,
      output_tokens: 2000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
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
    resultMessage: createMockResultMessage() as VerificationPhaseInput["resultMessage"],
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
    expect(deps.gateway.runPostCommitGateway).not.toHaveBeenCalled();
    expect(output?.gatewayVerdict).toBeUndefined();
  });

  it("collects gateway errors into the phase result", async () => {
    vi.mocked(deps.gateway.runPostCommitGateway).mockResolvedValue({
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

    expect(deps.successEvaluator.getGitDiff).toHaveBeenCalledTimes(1);
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
