import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PhaseDeps } from "../phases/index.js";
import type { HardenedQueryResult } from "../run-hardened-query.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// Phase collaborators are injected through `PhaseDeps` (no `vi.mock`).
// Only the three pieces of session-runner *infrastructure* are mocked:
// Langfuse tracing, the worktree reaper, and retry (to skip backoff
// delays and assert retry wrapping).

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
    .mockImplementation(async (_attrs: unknown, fn: () => Promise<unknown>) => {
      return fn();
    }),
  updateActiveObservation: vi.fn(),
}));

vi.mock("../worktree-reaper.js", () => ({
  scheduleWorktreeReap: vi.fn().mockResolvedValue({ succeeded: true, attempts: 2 }),
}));

vi.mock("../retry.js", async () => {
  const actual = (await vi.importActual("../retry.js")) as Record<string, unknown>;
  return {
    ...actual,
    // Override withRetry to skip actual delays in tests
    withRetry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      const value = await fn();
      return { value, attempts: 1 };
    }),
  };
});

import { withRetry } from "../retry.js";
import { scheduleWorktreeReap } from "../worktree-reaper.js";
import {
  startActiveObservation,
  propagateAttributes,
  updateActiveObservation,
} from "@langfuse/tracing";
import { runSession } from "../session-runner.js";

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

function hardenedResult(overrides?: Partial<HardenedQueryResult>): HardenedQueryResult {
  return {
    resultMessage: null,
    stuckReason: null,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage: null,
    contextMetrics: null,
    ...overrides,
  };
}

/** Configures `deps` so the query runner resolves with `resultMessage`. */
function withResult(deps: PhaseDeps, resultMessage: unknown): void {
  vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(
    hardenedResult({ resultMessage: resultMessage as never })
  );
}

describe("runSession", () => {
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();

    vi.mocked(withRetry).mockImplementation(async (fn) => {
      const value = await fn();
      return { value, attempts: 1 };
    });

    vi.mocked(scheduleWorktreeReap).mockResolvedValue({ succeeded: true, attempts: 2 });

    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
  });

  it("runs a successful session with PR creation", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: Fix the login bug");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("PR body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.branchName).toBe("agent/fix-bug-abc123");
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(5);
    expect(deps.worktreeManager.commitChanges).toHaveBeenCalled();
  });

  it("skips PR creation when no changes are made", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(deps.worktreeManager.commitChanges).not.toHaveBeenCalled();
    expect(deps.worktreeManager.pushBranch).not.toHaveBeenCalled();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
  });

  it("skips PR when createPr is false", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);

    const config = { ...BASE_CONFIG, createPr: false };
    const result = await runSession(config, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
  });

  it("returns failed result when no result message is received", async () => {
    withResult(deps, null);
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("No result message received from agent");
  });

  it("handles errors and returns failed result", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockRejectedValue(
      new Error("SDK connection failed")
    );

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("SDK connection failed");
  });

  it("emits events when callback is provided", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    await runSession(BASE_CONFIG, (event) => events.push(event), deps);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("session:start");
  });

  it("cleans up worktree after successful PR creation", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG, undefined, deps);

    expect(deps.worktreeManager.removeWorktree).toHaveBeenCalledWith(
      "/repo",
      "/repo/.agent-worktrees/agent-fix-bug-abc123"
    );
  });

  it("preserves worktree when createPr is false (--no-pr)", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);

    await runSession({ ...BASE_CONFIG, createPr: false }, undefined, deps);

    expect(deps.worktreeManager.removeWorktree).not.toHaveBeenCalled();
  });

  it("surfaces cleanup errors in cleanupErrors when removeWorktree fails", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.worktreeManager.removeWorktree).mockRejectedValue(
      new Error("fatal: worktree is locked")
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.cleanupErrors).toEqual(["fatal: worktree is locked"]);
    expect(warnSpy).toHaveBeenCalledWith("Worktree cleanup failed: fatal: worktree is locked");

    warnSpy.mockRestore();
  });

  it("emits session:cleanup_warning event when removeWorktree fails", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.worktreeManager.removeWorktree).mockRejectedValue(
      new Error("fatal: worktree is locked")
    );

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: SessionEvent[] = [];
    await runSession(BASE_CONFIG, (event) => events.push(event), deps);

    const cleanupEvents = events.filter((e) => e.type === "session:cleanup_warning");
    expect(cleanupEvents).toHaveLength(1);
    expect((cleanupEvents[0].data as { message: string }).message).toContain(
      "fatal: worktree is locked"
    );

    vi.restoreAllMocks();
  });

  it("omits cleanupErrors when removeWorktree succeeds", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.worktreeManager.removeWorktree).mockResolvedValue(undefined);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.cleanupErrors).toBeUndefined();
  });

  it("schedules a worktree reap retry when removeWorktree fails", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.worktreeManager.removeWorktree).mockRejectedValue(
      new Error("fatal: worktree is locked")
    );

    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.cleanupErrors).toEqual(["fatal: worktree is locked"]);
    expect(scheduleWorktreeReap).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: "/repo",
        worktreePath: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      })
    );

    vi.restoreAllMocks();
  });

  it("does not schedule a reap when removeWorktree succeeds first try", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.worktreeManager.removeWorktree).mockResolvedValue(undefined);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(scheduleWorktreeReap).not.toHaveBeenCalled();
  });

  it("handles createWorktree failure gracefully", async () => {
    vi.mocked(deps.worktreeManager.createWorktree).mockRejectedValue(
      new Error("git worktree add failed")
    );

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("git worktree add failed");
    expect(result.branchName).toBe("");
  });

  it("creates draft PR when verification fails", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.gateway.runPostCommitGateway).mockResolvedValue({
      outcome: "create-draft-pr",
      passed: false,
      gateFailures: ["verification"],
      errors: ["Verification failed: typecheck errors"],
    });
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("wip: Fix the login bug");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/2",
      number: 2,
    });

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.prUrl).toBe("https://github.com/repo/pull/2");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
  });

  it("attempts to push partial work when session throws mid-execution", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockRejectedValue(
      new Error("Unexpected API error")
    );
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/3",
      number: 3,
    });

    const events: SessionEvent[] = [];
    const result = await runSession(BASE_CONFIG, (event) => events.push(event), deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("Unexpected API error");
    expect(result.prUrl).toBe("https://github.com/repo/pull/3");
  });

  it("handles partial work push failure gracefully (best-effort)", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockRejectedValue(
      new Error("Unexpected API error")
    );
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.worktreeManager.pushBranch).mockRejectedValue(new Error("git push failed"));

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("Unexpected API error");
    expect(result.prUrl).toBeNull();
  });

  it("handles partial work when no changes exist after crash", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockRejectedValue(
      new Error("Unexpected API error")
    );
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("Unexpected API error");
    expect(result.prUrl).toBeNull();
    expect(deps.worktreeManager.commitChanges).not.toHaveBeenCalled();
  });

  // ── Retry logic tests ──────────────────────────────────────────────

  it("uses withRetry for createWorktree", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    await runSession(BASE_CONFIG, undefined, deps);

    expect(withRetry).toHaveBeenCalled();
    expect(vi.mocked(withRetry).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses withRetry for pushBranch with 3 retries", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG, undefined, deps);

    const retryCalls = vi.mocked(withRetry).mock.calls;
    expect(retryCalls.length).toBeGreaterThanOrEqual(3);

    const pushRetryCall = retryCalls.find(
      (call) => call[1] && (call[1] as { maxRetries?: number }).maxRetries === 3
    );
    expect(pushRetryCall).toBeDefined();
  });

  it("uses withRetry for createPullRequest", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG, undefined, deps);

    expect(deps.prCreator.createPullRequest).toHaveBeenCalled();
  });

  // ── Context window exhaustion detection tests ──────────────────────

  it("detects context exhaustion when stuck reason is context_window_loop", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(
      hardenedResult({
        resultMessage: createMockResultMessage() as never,
        stuckReason: {
          type: "context_window_loop",
          description: "Context window exhaustion detected",
          severity: "error",
        } as never,
      })
    );
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("failed");
    expect(result.stuckPattern).toBe("context_window_loop");
  });

  it("does not abort when no stuck reason is reported", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG, undefined, deps);

    expect(result.status).toBe("succeeded");
    expect(result.stuckPattern).toBeUndefined();
  });

  // ── Feedback loop budget tests ─────────────────────────────────────

  it("uses remaining budget for feedback loop instead of fixed 50%", async () => {
    withResult(deps, createMockResultMessage()); // cost: 0.25
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(deps.feedbackLoop.runFeedbackLoop).mockResolvedValue({
      resolved: true,
      retriesUsed: 1,
      lastFingerprint: null,
    });

    const config = {
      ...BASE_CONFIG,
      maxBudgetUsd: 1.0,
      feedbackLoop: {
        enabled: true,
        maxRetries: 2,
        pollIntervalMs: 30_000,
        pollTimeoutMs: 300_000,
      },
    };

    await runSession(config, undefined, deps);

    expect(deps.feedbackLoop.runFeedbackLoop).toHaveBeenCalled();
    const fbCall = vi.mocked(deps.feedbackLoop.runFeedbackLoop).mock.calls[0][0];
    // Remaining budget: 1.0 - 0.25 = 0.75 (not 0.50 from fixed ratio)
    expect(fbCall.maxBudgetUsd).toBeCloseTo(0.75);
  });

  // ── Cached git diff tests ─────────────────────────────────────────

  it("caches git diff across evaluation, static analysis, and security review", async () => {
    withResult(deps, createMockResultMessage());
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(true);
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG, undefined, deps);

    // getGitDiff should only be called once despite multiple stages using it
    expect(deps.successEvaluator.getGitDiff).toHaveBeenCalledTimes(1);
  });
});

describe("Langfuse tracing", () => {
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(withRetry).mockImplementation(async (fn) => {
      const value = await fn();
      return { value, attempts: 1 };
    });
    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/worktree",
      branchName: "agent/fix-login",
      mode: "full",
    });
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);
  });

  it("wraps session with startActiveObservation", async () => {
    withResult(
      deps,
      createMockResultMessage({ session_id: "sess-1", total_cost_usd: 0.05, num_turns: 3 })
    );

    await runSession(BASE_CONFIG, undefined, deps);

    expect(startActiveObservation).toHaveBeenCalledWith("agent-session", expect.any(Function));
    expect(propagateAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          task: BASE_CONFIG.taskDescription,
          model: BASE_CONFIG.model,
          maxBudgetUsd: String(BASE_CONFIG.maxBudgetUsd),
        }),
      }),
      expect.any(Function)
    );
  });

  it("attaches session metrics to the Langfuse trace", async () => {
    withResult(
      deps,
      createMockResultMessage({ session_id: "sess-1", total_cost_usd: 0.05, num_turns: 3 })
    );

    await runSession(BASE_CONFIG, undefined, deps);

    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          success: "1",
          cost_usd: "0.05",
          num_turns: "3",
          stuck: "0",
        }),
      })
    );
  });
});
