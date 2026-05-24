import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PipelineContext } from "../phases/pipeline-types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("../worktree-manager.js", () => ({
  createWorktree: vi.fn(),
  commitChanges: vi.fn(),
  pushBranch: vi.fn(),
  hasChanges: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../success-evaluator.js", () => ({
  getGitDiff: vi.fn(),
}));

vi.mock("../post-commit-gateway.js", () => ({
  runPostCommitGateway: vi.fn(),
}));

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

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
      }),
    }),
  },
  SpanStatusCode: { ERROR: 2 },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { commitChanges, pushBranch, hasChanges } from "../worktree-manager.js";
import { getGitDiff } from "../success-evaluator.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";
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

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    config: BASE_CONFIG,
    errors: [],
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    systemPrompt: "system prompt",
    resultMessage: createMockResultMessage() as PipelineContext["resultMessage"],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("VerificationPhase", () => {
  const phase = new VerificationPhase();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
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
    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(commitChanges).toHaveBeenCalled();
    expect(pushBranch).toHaveBeenCalled();
    expect(ctx.hasChanges).toBe(true);
    expect(ctx.gatewayVerdict).toBeDefined();
    expect(ctx.gatewayVerdict?.outcome).toBe("create-pr");
  });

  it("skips commit/push when no changes", async () => {
    vi.mocked(hasChanges).mockResolvedValue(false);

    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(ctx.hasChanges).toBe(false);
    expect(commitChanges).not.toHaveBeenCalled();
    expect(pushBranch).not.toHaveBeenCalled();
  });

  it("skips when no worktree in context", async () => {
    const { result } = await phase.run(makeCtx({ worktree: undefined }));

    expect(result.status).toBe("skipped");
  });

  it("runs gateway only when session succeeded (no stuck)", async () => {
    const { ctx } = await phase.run(
      makeCtx({
        stuckReason: {
          type: "repeated_action_observation",
          count: 4,
          threshold: 4,
          description: "stuck",
          severity: "error",
        },
      })
    );

    // Should still commit/push, but not run gateway
    expect(commitChanges).toHaveBeenCalled();
    expect(runPostCommitGateway).not.toHaveBeenCalled();
    expect(ctx.gatewayVerdict).toBeUndefined();
  });

  it("collects errors from gateway failures", async () => {
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-draft-pr",
      passed: false,
      gateFailures: ["verification"],
      errors: ["Verification failed: typecheck errors"],
    });

    const { ctx } = await phase.run(makeCtx());

    expect(ctx.errors).toContain("Verification failed: typecheck errors");
    expect(ctx.gatewayVerdict?.outcome).toBe("create-draft-pr");
  });

  it("caches git diff (only calls getGitDiff once)", async () => {
    await phase.run(makeCtx());

    expect(getGitDiff).toHaveBeenCalledTimes(1);
  });

  it("emits 'no changes' event when nothing changed", async () => {
    vi.mocked(hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeCtx({ onEvent }));

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("No changes");
  });
});
