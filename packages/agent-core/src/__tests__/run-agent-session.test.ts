import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig } from "../types.js";
import type { PhaseDeps } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Infra-level mocks ───────────────────────────────────────────────
//
// runAgentSession() defaults to a real ClaudeAdapter, which delegates to the
// real session-runner.ts runSession() — the exact pipeline `mbe agent run
// --adapter claude` already relies on. Only cross-cutting infrastructure
// (Langfuse tracing, the worktree reaper, cost logging, and retry backoff)
// is stubbed, matching session-runner.test.ts's mocking strategy. Its two
// private in-implementation collaborators — git-diff (success-evaluator)
// and the post-commit gateway — are module-mocked with `vi.mock` (#3120);
// the remaining pipeline collaborators (worktree, PR creator) are injected
// via PhaseDeps so the full pipeline — including GateRunner and
// PublishPhase — genuinely executes through the seam.

vi.mock("@langfuse/tracing", () => ({
  startActiveObservation: vi
    .fn()
    .mockImplementation(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
      const mockSpan = {
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        score: vi.fn(),
        startObservation: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnThis(),
          end: vi.fn(),
        }),
      };
      return fn(mockSpan);
    }),
  startObservation: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    end: vi.fn(),
  }),
  propagateAttributes: vi
    .fn()
    .mockImplementation(async (_attrs: unknown, fn: () => Promise<unknown>) => fn()),
  updateActiveObservation: vi.fn(),
}));

vi.mock("../worktree-reaper.js", () => ({
  scheduleWorktreeReap: vi.fn().mockResolvedValue({ succeeded: true, attempts: 1 }),
}));

const mockRecordSpend = vi.fn();
vi.mock("../spend-recorder.js", () => ({
  recordSpend: (...args: unknown[]) => mockRecordSpend(...args),
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

vi.mock("../success-evaluator.js", async () => {
  const actual = (await vi.importActual("../success-evaluator.js")) as Record<string, unknown>;
  return { ...actual, getGitDiff: vi.fn() };
});

vi.mock("../post-commit-gateway.js", async () => {
  const actual = (await vi.importActual("../post-commit-gateway.js")) as Record<string, unknown>;
  return { ...actual, runPostCommitGateway: vi.fn() };
});

import { runAgentSession } from "../run-agent-session.js";
import type { AgentSessionAdapter } from "../run-agent-session.js";
import { getGitDiff } from "../success-evaluator.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";

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

function createMockResultMessage(overrides?: Record<string, unknown>) {
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
    ...overrides,
  };
}

function withResult(deps: PhaseDeps, resultMessage: unknown): void {
  vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue({
    resultMessage: resultMessage as never,
    stuckReason: null,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage: null,
    contextMetrics: null,
  });
}

describe("runAgentSession — resolution", () => {
  it("resolves to an injected fake adapter instead of the default ClaudeAdapter", async () => {
    const fakeResult = {
      sessionId: "sess-1",
      status: "succeeded" as const,
      branchName: "fix/fake",
      prUrl: null,
      costUsd: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      numTurns: 0,
      resultText: "",
      errors: [],
    };
    const fakeAdapter: AgentSessionAdapter = {
      runSession: vi.fn().mockResolvedValue(fakeResult),
    };

    const result = await runAgentSession(BASE_CONFIG, { adapter: fakeAdapter });

    expect(fakeAdapter.runSession).toHaveBeenCalledWith(
      BASE_CONFIG,
      undefined,
      undefined,
      undefined
    );
    expect(result).toBe(fakeResult);
  });

  it("forwards onEvent, deps, and signal through to the resolved adapter", async () => {
    const onEvent = vi.fn();
    const deps = {} as PhaseDeps;
    const controller = new AbortController();
    const fakeAdapter: AgentSessionAdapter = {
      runSession: vi.fn().mockResolvedValue({
        sessionId: "",
        status: "failed" as const,
        branchName: "",
        prUrl: null,
        costUsd: 0,
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 0,
        numTurns: 0,
        resultText: "",
        errors: [],
      }),
    };

    await runAgentSession(BASE_CONFIG, {
      adapter: fakeAdapter,
      onEvent,
      deps,
      signal: controller.signal,
    });

    expect(fakeAdapter.runSession).toHaveBeenCalledWith(
      BASE_CONFIG,
      onEvent,
      deps,
      controller.signal
    );
  });
});

describe("runAgentSession — claude entry point (full pipeline)", () => {
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    vi.mocked(getGitDiff).mockResolvedValue("diff --git a/file.ts\n+change");
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
  });

  it("runs the full pipeline via the default ClaudeAdapter: gates run, a PR is published, and spend is recorded", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    const result = await runAgentSession(BASE_CONFIG, { deps });

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    // GateRunner suite ran — VerificationPhase invoked the post-commit gateway.
    expect(runPostCommitGateway).toHaveBeenCalledOnce();
    // PublishPhase ran — a real PR was created.
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledOnce();
    // Spend was recorded, same as a direct runSession() call.
    expect(mockRecordSpend).toHaveBeenCalledWith(
      BASE_CONFIG.repoPath,
      expect.objectContaining({
        costUsd: 0.25,
        model: BASE_CONFIG.model,
        adapter: "claude",
        status: "succeeded",
      })
    );
  });

  it("still creates a draft PR when a gate fails, proving the gate verdict reaches PublishPhase", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-draft-pr",
      passed: false,
      gateFailures: ["verification"],
      errors: ["Verification failed: typecheck errors"],
    });
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/2",
      number: 2,
    });

    const result = await runAgentSession(BASE_CONFIG, { deps });

    expect(result.prUrl).toBe("https://github.com/repo/pull/2");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
  });
});
