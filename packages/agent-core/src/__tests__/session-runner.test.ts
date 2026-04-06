import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";

// Mock all dependencies
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../worktree-manager.js", () => ({
  createWorktree: vi.fn(),
  commitChanges: vi.fn(),
  pushBranch: vi.fn(),
  hasChanges: vi.fn(),
  removeWorktree: vi.fn(),
  runVerification: vi.fn(),
}));

vi.mock("../pr-creator.js", () => ({
  createPullRequest: vi.fn(),
  buildPrTitle: vi.fn(),
  buildPrBody: vi.fn(),
  buildFailurePrBody: vi.fn(),
}));

vi.mock("../success-evaluator.js", () => ({
  evaluateSuccess: vi.fn(),
  getGitDiff: vi.fn(),
  shouldEvaluate: vi.fn().mockReturnValue(true),
}));

vi.mock("../diff-reviewer.js", () => ({
  reviewDiff: vi.fn(),
}));

vi.mock("../diff-static-analyzer.js", () => ({
  analyzeDiff: vi.fn(),
}));

vi.mock("../feedback-loop.js", () => ({
  runFeedbackLoop: vi.fn(),
}));

vi.mock("../failure-memory.js", () => ({
  loadMemory: vi.fn(),
  queryPastFailures: vi.fn(),
  buildFailureContext: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn(),
  loadSourceFiles: vi.fn().mockResolvedValue([]),
  loadProjectContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
}));

vi.mock("@langfuse/tracing", () => ({
  startActiveObservation: vi.fn().mockImplementation(
    async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
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
    }
  ),
  startObservation: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    end: vi.fn(),
  }),
  propagateAttributes: vi.fn().mockImplementation(
    async (_attrs: unknown, fn: () => Promise<unknown>) => {
      return fn();
    }
  ),
  updateActiveObservation: vi.fn(),
}));

vi.mock("../retry.js", async () => {
  const actual = await vi.importActual("../retry.js") as Record<string, unknown>;
  return {
    ...actual,
    // Override withRetry to skip actual delays in tests
    withRetry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      const value = await fn();
      return { value, attempts: 1 };
    }),
  };
});

import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  createWorktree,
  commitChanges,
  pushBranch,
  hasChanges,
  removeWorktree,
  runVerification,
} from "../worktree-manager.js";
import { createPullRequest, buildPrTitle, buildPrBody } from "../pr-creator.js";
import { evaluateSuccess, getGitDiff } from "../success-evaluator.js";
import { reviewDiff } from "../diff-reviewer.js";
import { analyzeDiff } from "../diff-static-analyzer.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import { loadMemory, queryPastFailures, buildFailureContext } from "../failure-memory.js";
import { buildSystemPrompt } from "../prompt-builder.js";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { withRetry } from "../retry.js";
import { startActiveObservation, startObservation, propagateAttributes, updateActiveObservation } from "@langfuse/tracing";
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

// Helper to create an async generator from an array of messages
async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

describe("runSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset withRetry to default pass-through
    vi.mocked(withRetry).mockImplementation(async (fn) => {
      const value = await fn();
      return { value, attempts: 1 };
    });

    vi.mocked(createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
    });

    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );

    vi.mocked(loadMemory).mockResolvedValue({ records: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");

    vi.mocked(runVerification).mockResolvedValue({
      passed: true,
      lintOk: true,
      typecheckOk: true,
      testsOk: true,
    });

    vi.mocked(reviewDiff).mockResolvedValue({ approved: true, issues: [] });
    vi.mocked(analyzeDiff).mockReturnValue({ clean: true, violations: [], durationMs: 1 });
    vi.mocked(runFeedbackLoop).mockResolvedValue({ resolved: false, retriesUsed: 0 });

    vi.mocked(getGitDiff).mockResolvedValue("diff --git a/file.ts\n+change");
    vi.mocked(evaluateSuccess).mockResolvedValue({
      passed: true,
      confidence: 0.95,
      reasoning: "Changes address the task",
      issues: [],
    });
  });

  it("runs a successful session with PR creation", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: Fix the login bug");
    vi.mocked(buildPrBody).mockReturnValue("PR body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.branchName).toBe("agent/fix-bug-abc123");
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(5);
    expect(commitChanges).toHaveBeenCalled();
  });

  it("skips PR creation when no changes are made", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(commitChanges).not.toHaveBeenCalled();
    expect(pushBranch).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("skips PR when createPr is false", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);

    const config = { ...BASE_CONFIG, createPr: false };
    const result = await runSession(config);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("returns failed result when no result message is received", async () => {
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([{ type: "system", subtype: "init" }]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("No result message received from agent");
  });

  it("handles errors and returns failed result", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("SDK connection failed");
    });

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("SDK connection failed");
  });

  it("emits events when callback is provided", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    await runSession(BASE_CONFIG, (event) => events.push(event));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("session:start");
  });

  it("cleans up worktree after successful PR creation", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG);

    expect(removeWorktree).toHaveBeenCalledWith(
      "/repo",
      "/repo/.agent-worktrees/agent-fix-bug-abc123"
    );
  });

  it("preserves worktree when createPr is false (--no-pr)", async () => {
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);

    await runSession({ ...BASE_CONFIG, createPr: false });

    expect(removeWorktree).not.toHaveBeenCalled();
  });

  it("handles createWorktree failure gracefully", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new Error("git worktree add failed"));

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("git worktree add failed");
    expect(result.branchName).toBe("");
  });

  // ── Retry logic tests ──────────────────────────────────────────────

  it("uses withRetry for createWorktree", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    await runSession(BASE_CONFIG);

    // withRetry should have been called for createWorktree
    expect(withRetry).toHaveBeenCalled();
    const calls = vi.mocked(withRetry).mock.calls;
    // First call is for createWorktree
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("uses withRetry for pushBranch with 3 retries", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG);

    // withRetry should be called for push and PR creation
    const retryCalls = vi.mocked(withRetry).mock.calls;
    // At least: createWorktree, pushBranch, createPullRequest
    expect(retryCalls.length).toBeGreaterThanOrEqual(3);

    // Verify push retry has maxRetries: 3
    const pushRetryCall = retryCalls.find(
      (call) => call[1] && (call[1] as { maxRetries?: number }).maxRetries === 3
    );
    expect(pushRetryCall).toBeDefined();
  });

  it("uses withRetry for createPullRequest", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG);

    // Verify createPullRequest was called through withRetry
    expect(createPullRequest).toHaveBeenCalled();
  });

  // ── Context window exhaustion detection tests ──────────────────────

  it("detects context exhaustion when compaction threshold exceeded", async () => {
    // Create 5 compact_boundary messages followed by a result
    const compactMessages = Array.from({ length: 5 }, () => ({
      type: "system",
      subtype: "compact_boundary",
    }));
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([...compactMessages, mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const events: SessionEvent[] = [];
    const result = await runSession(BASE_CONFIG, (event) => events.push(event));

    expect(result.status).toBe("failed");
    expect(result.stuckPattern).toBe("context_window_loop");

    // Verify context exhaustion stuck event was emitted
    const stuckEvents = events.filter((e) => e.type === "session:stuck");
    expect(stuckEvents.length).toBeGreaterThan(0);
    const exhaustionEvent = stuckEvents.find(
      (e) => (e.data as { message: string }).message.includes("Context window exhaustion")
    );
    expect(exhaustionEvent).toBeDefined();
  });

  it("does not abort when compaction count is below threshold", async () => {
    // 3 compactions (below threshold of 5)
    const compactMessages = Array.from({ length: 3 }, () => ({
      type: "system",
      subtype: "compact_boundary",
    }));
    const mockResult = createMockResultMessage();

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([...compactMessages, mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(false);

    const result = await runSession(BASE_CONFIG);

    expect(result.status).toBe("succeeded");
    expect(result.stuckPattern).toBeUndefined();
  });

  // ── Feedback loop budget tests ─────────────────────────────────────

  it("uses remaining budget for feedback loop instead of fixed 50%", async () => {
    const mockResult = createMockResultMessage(); // cost: 0.25
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
    vi.mocked(runFeedbackLoop).mockResolvedValue({ resolved: true, retriesUsed: 1 });

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

    await runSession(config);

    expect(runFeedbackLoop).toHaveBeenCalled();
    const fbCall = vi.mocked(runFeedbackLoop).mock.calls[0][0];
    // Remaining budget: 1.0 - 0.25 = 0.75 (not 0.50 from fixed ratio)
    expect(fbCall.maxBudgetUsd).toBeCloseTo(0.75);
  });

  // ── Cached git diff tests ─────────────────────────────────────────

  it("caches git diff across evaluation, static analysis, and security review", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([mockResult]) as ReturnType<typeof query>
    );
    vi.mocked(hasChanges).mockResolvedValue(true);
    vi.mocked(commitChanges).mockResolvedValue("abc123");
    vi.mocked(pushBranch).mockResolvedValue(undefined);
    vi.mocked(buildPrTitle).mockReturnValue("feat: test");
    vi.mocked(buildPrBody).mockReturnValue("body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    await runSession(BASE_CONFIG);

    // getGitDiff should only be called once despite multiple stages using it
    // (evaluation, static analysis, security review, dep-bump check)
    expect(getGitDiff).toHaveBeenCalledTimes(1);
  });
});

describe("Langfuse tracing", () => {
  it("wraps session with startActiveObservation", async () => {
    vi.mocked(createWorktree).mockResolvedValue({
      path: "/worktree",
      branchName: "agent/fix-login",
      mode: "full",
    });
    vi.mocked(loadMemory).mockResolvedValue({ failures: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");
    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(createToolPermissionHandler).mockReturnValue(async () => true);
    vi.mocked(hasChanges).mockResolvedValue(false);

    const resultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      uuid: "test-uuid",
      session_id: "sess-1",
      result: "Done",
      total_cost_usd: 0.05,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 3,
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    };

    vi.mocked(query).mockReturnValue(
      (async function* () {
        yield resultMessage;
      })() as ReturnType<typeof query>
    );

    await runSession(BASE_CONFIG);

    expect(startActiveObservation).toHaveBeenCalledWith(
      "agent-session",
      expect.any(Function)
    );
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

  it("creates generation observations for assistant messages", async () => {
    vi.mocked(createWorktree).mockResolvedValue({
      path: "/worktree",
      branchName: "agent/fix-login",
      mode: "full",
    });
    vi.mocked(loadMemory).mockResolvedValue({ failures: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");
    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(createToolPermissionHandler).mockReturnValue(async () => true);
    vi.mocked(hasChanges).mockResolvedValue(false);

    const assistantMessage = {
      type: "assistant" as const,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "I'll fix the bug" }],
        usage: { input_tokens: 50, output_tokens: 25 },
      },
    };

    const resultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      uuid: "test-uuid",
      session_id: "sess-1",
      result: "Done",
      total_cost_usd: 0.05,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 3,
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    };

    vi.mocked(query).mockReturnValue(
      (async function* () {
        yield assistantMessage;
        yield resultMessage;
      })() as ReturnType<typeof query>
    );

    await runSession(BASE_CONFIG);

    expect(startObservation).toHaveBeenCalledWith(
      "llm-turn-0",
      expect.objectContaining({ model: BASE_CONFIG.model }),
      { asType: "generation" }
    );
  });

  it("attaches session metrics to the Langfuse trace", async () => {
    vi.mocked(createWorktree).mockResolvedValue({
      path: "/worktree",
      branchName: "agent/fix-login",
      mode: "full",
    });
    vi.mocked(loadMemory).mockResolvedValue({ failures: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");
    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(createToolPermissionHandler).mockReturnValue(async () => true);
    vi.mocked(hasChanges).mockResolvedValue(false);

    const resultMessage = {
      type: "result" as const,
      subtype: "success" as const,
      uuid: "test-uuid",
      session_id: "sess-1",
      result: "Done",
      total_cost_usd: 0.05,
      duration_ms: 1000,
      duration_api_ms: 800,
      is_error: false,
      num_turns: 3,
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    };

    vi.mocked(query).mockReturnValue(
      (async function* () {
        yield resultMessage;
      })() as ReturnType<typeof query>
    );

    await runSession(BASE_CONFIG);

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
