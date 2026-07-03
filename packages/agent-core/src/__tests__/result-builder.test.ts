import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Span } from "@opentelemetry/api";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SessionConfig } from "../types.js";
import type { QaTuningThresholds } from "../qa-tuning-loader.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// buildFinalResult has two real side effects beyond computing the return
// value: a best-effort disk write (recordFailure) and a Langfuse span
// update. Both are mocked so this test stays a pure unit test over
// SessionState fixtures — no full-session mocking.

vi.mock("../failure-memory.js", () => ({
  recordFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/tracing", () => ({
  updateActiveObservation: vi.fn(),
}));

import { recordFailure } from "../failure-memory.js";
import { updateActiveObservation } from "@langfuse/tracing";
import { buildFinalResult, buildRootSpanAttributes } from "../result-builder.js";
import type { SessionState } from "../result-builder.js";

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

function fakeSpan(): Span {
  return { setAttribute: vi.fn() } as unknown as Span;
}

function baseState(overrides?: Partial<SessionState>): SessionState {
  return {
    turnMetrics: [],
    toolCallMetrics: [],
    hasChanges: false,
    prUrl: null,
    errors: [],
    ...overrides,
  };
}

function successResultMessage(overrides?: Record<string, unknown>): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    uuid: "test-uuid",
    session_id: "sess-1",
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
  } as unknown as SDKResultMessage;
}

function errorResultMessage(overrides?: Record<string, unknown>): SDKResultMessage {
  return {
    type: "result",
    subtype: "error_max_turns",
    uuid: "test-uuid-2",
    session_id: "sess-2",
    duration_ms: 9000,
    duration_api_ms: 8000,
    is_error: true,
    num_turns: 50,
    stop_reason: null,
    total_cost_usd: 0.9,
    usage: {
      input_tokens: 40000,
      output_tokens: 5000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    errors: ["Max turns exceeded before completion"],
    ...overrides,
  } as unknown as SDKResultMessage;
}

describe("buildFinalResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a succeeded result for a clean session", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      resultMessage: successResultMessage(),
      turnMetrics: [
        {
          turnIndex: 1,
          startedAt: "2026-06-30T00:00:00.000Z",
          inputTokens: 100,
          outputTokens: 50,
          thinkingTokens: 0,
          costUsd: 0.25,
          modelId: "claude-sonnet-4-6",
        },
      ],
      toolCallMetrics: [{ toolName: "Read", toolUseId: "tool-1", latencyMs: 12, isError: false }],
      hasChanges: true,
      gatewayVerdict: { outcome: "create-pr", passed: true, gateFailures: [], errors: [] },
      gatewayEvaluation: { passed: true, confidence: 0.9, reasoning: "Looks good", issues: [] },
      prUrl: "https://github.com/repo/pull/1",
      prNumber: 1,
    });
    const span = fakeSpan();
    const onEvent = vi.fn();

    const result = buildFinalResult(BASE_CONFIG, state, span, onEvent);

    expect(result.status).toBe("succeeded");
    expect(result.sessionId).toBe("sess-1");
    expect(result.branchName).toBe("agent/fix-login");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(5);
    expect(result.errors).toEqual([]);
    expect(result.evaluation).toEqual({
      passed: true,
      confidence: 0.9,
      reasoning: "Looks good",
    });
    expect(result.failureCategory).toBeUndefined();
    expect(result.turnMetrics).toHaveLength(1);
    expect(result.toolCallMetrics).toHaveLength(1);

    expect(span.setAttribute).toHaveBeenCalledWith("session.status", "succeeded");
    expect(span.setAttribute).toHaveBeenCalledWith("session.cost_usd", 0.25);
    expect(span.setAttribute).toHaveBeenCalledWith(
      "session.pr_url",
      "https://github.com/repo/pull/1"
    );
    expect(span.setAttribute).not.toHaveBeenCalledWith(
      "session.failure_category",
      expect.anything()
    );

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "session:result" }));
    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ success: "1", stuck: "0" }),
      })
    );
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("keeps status succeeded for a partial-work draft-PR session (existing quirk: state.errors do not surface unless budget-enforced)", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      resultMessage: successResultMessage(),
      hasChanges: true,
      gatewayVerdict: {
        outcome: "create-draft-pr",
        passed: false,
        gateFailures: ["verification"],
        errors: ["Verification failed: typecheck errors"],
      },
      prUrl: "https://github.com/repo/pull/2",
      prNumber: 2,
      errors: ["Verification failed: typecheck errors"],
    });
    const span = fakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, span, undefined);

    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/2");
    expect(result.errors).toEqual([]);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("halts with a failed status when the budget was enforced", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      resultMessage: successResultMessage(),
      errors: ["Budget breached: accumulated $1.5000 exceeds limit $1.0"],
      budgetEnforced: true,
    });
    const span = fakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, span, undefined);

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual(["Budget breached: accumulated $1.5000 exceeds limit $1.0"]);
    expect(result.failureCategory).toBe("budget_exceeded");
    expect(recordFailure).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({
        taskDescription: "Fix the login bug",
        errors: ["Budget breached: accumulated $1.5000 exceeds limit $1.0"],
      })
    );
  });

  it("builds a failed result when the gateway rejects a failed agent result", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      resultMessage: errorResultMessage(),
      gatewayVerdict: {
        outcome: "create-draft-pr",
        passed: false,
        gateFailures: ["verification"],
        errors: ["Verification failed: typecheck errors"],
      },
      prUrl: "https://github.com/repo/pull/3",
      errors: ["Verification failed: typecheck errors"],
    });
    const span = fakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, span, undefined);

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual(["Max turns exceeded before completion"]);
    expect(result.failureCategory).toBe("logic_error");
    expect(recordFailure).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({ errors: ["Verification failed: typecheck errors"] })
    );
  });

  it("builds a failed result with no result message and never calls recordFailure/onEvent/updateActiveObservation", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      errors: ["git worktree add failed"],
    });
    const span = fakeSpan();
    const onEvent = vi.fn();

    const result = buildFinalResult(BASE_CONFIG, state, span, onEvent);

    expect(result.status).toBe("failed");
    expect(result.sessionId).toBe("");
    expect(result.branchName).toBe("agent/fix-login");
    expect(result.errors).toEqual([
      "git worktree add failed",
      "No result message received from agent",
    ]);
    expect(result.failureCategory).toBe("logic_error");
    expect(span.setAttribute).toHaveBeenCalledWith("session.status", "failed");
    expect(span.setAttribute).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
    expect(updateActiveObservation).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("deduplicates the stuck message and marks the session failed", () => {
    const state = baseState({
      worktree: { path: "/repo/.worktree", branchName: "agent/fix-login", mode: "full" },
      resultMessage: successResultMessage(),
      stuckReason: {
        type: "context_window_loop",
        count: 5,
        threshold: 5,
        description: "Context window exhaustion detected",
        severity: "error",
      },
    });
    const span = fakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, span, undefined);

    expect(result.status).toBe("failed");
    expect(result.stuckPattern).toBe("context_window_loop");
    expect(result.failureCategory).toBe("stuck_loop");
  });
});

describe("buildRootSpanAttributes", () => {
  it("builds base attributes without tuning or routing metadata", () => {
    const attrs = buildRootSpanAttributes(BASE_CONFIG, null);

    expect(attrs).toEqual({
      "session.task": "Fix the login bug",
      "session.model": "claude-sonnet-4-6",
      "session.max_turns": 50,
      "session.max_budget_usd": 1.0,
      "session.base_branch": "main",
    });
  });

  it("includes qa_tuning_applied when tuning is present", () => {
    const tuning: QaTuningThresholds = {
      acceptanceRateFloor: 0.8,
      maxBudgetUSD: 1.0,
      maxRetries: 2,
      stuckTurnsThreshold: 5,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.5,
    };

    const attrs = buildRootSpanAttributes(BASE_CONFIG, tuning);

    expect(attrs["session.qa_tuning_applied"]).toBe(true);
  });

  it("includes model routing metadata when present", () => {
    const config: SessionConfig = {
      ...BASE_CONFIG,
      modelRoutingReason: "Feature label with simple scope",
      modelRoutingTier: "sonnet",
    };

    const attrs = buildRootSpanAttributes(config, null);

    expect(attrs["session.model_routing_reason"]).toBe("Feature label with simple scope");
    expect(attrs["session.model_routing_tier"]).toBe("sonnet");
  });

  it("truncates the task description to 200 characters", () => {
    const config: SessionConfig = {
      ...BASE_CONFIG,
      taskDescription: "x".repeat(300),
    };

    const attrs = buildRootSpanAttributes(config, null);

    expect((attrs["session.task"] as string).length).toBe(200);
  });
});
