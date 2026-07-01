import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Span } from "@opentelemetry/api";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { SessionConfig, SessionEvent } from "./types.js";

vi.mock("@langfuse/tracing", () => ({
  updateActiveObservation: vi.fn(),
}));

vi.mock("./failure-memory.js", () => ({
  recordFailure: vi.fn().mockResolvedValue(undefined),
}));

import { updateActiveObservation } from "@langfuse/tracing";
import { recordFailure } from "./failure-memory.js";
import { buildFinalResult, buildRootSpanAttributes } from "./result-builder.js";
import type { SessionState } from "./result-builder.js";

// ── Fixtures ──────────────────────────────────────────────────────────

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

function makeState(overrides?: Partial<SessionState>): SessionState {
  return {
    turnMetrics: [],
    toolCallMetrics: [],
    hasChanges: false,
    prUrl: null,
    errors: [],
    ...overrides,
  };
}

function makeResultMessage(overrides?: Partial<SDKResultMessage>): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
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
  } as SDKResultMessage;
}

function makeFakeSpan(): Span {
  return {
    setAttribute: vi.fn(),
  } as unknown as Span;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildFinalResult", () => {
  it("assembles a succeeded result from a successful SDK result message", () => {
    const state = makeState({
      worktree: { path: "/repo/.agent-worktrees/agent-fix", branchName: "agent/fix", mode: "full" },
      resultMessage: makeResultMessage(),
      prUrl: "https://github.com/repo/pull/1",
      prNumber: 1,
    });
    const rootSpan = makeFakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, rootSpan, undefined);

    expect(result.status).toBe("succeeded");
    expect(result.sessionId).toBe("session-123");
    expect(result.branchName).toBe("agent/fix");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
    expect(result.costUsd).toBe(0.25);
    expect(result.numTurns).toBe(5);
    expect(result.errors).toEqual([]);
    expect(rootSpan.setAttribute).toHaveBeenCalledWith("session.status", "succeeded");
    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ success: "1", stuck: "0" }),
      })
    );
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("emits a session:result event with the final status", () => {
    const state = makeState({ resultMessage: makeResultMessage() });
    const events: SessionEvent[] = [];

    buildFinalResult(BASE_CONFIG, state, makeFakeSpan(), (event) => events.push(event));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("session:result");
  });

  it("builds a failed partial-work result with a draft PR when no result message was received", () => {
    const state = makeState({
      worktree: { path: "/repo/.agent-worktrees/agent-fix", branchName: "agent/fix", mode: "full" },
      prUrl: "https://github.com/repo/pull/2",
      errors: ["Phase failed: worktree phase"],
    });
    const rootSpan = makeFakeSpan();

    const result = buildFinalResult(BASE_CONFIG, state, rootSpan, undefined);

    expect(result.status).toBe("failed");
    expect(result.prUrl).toBe("https://github.com/repo/pull/2");
    expect(result.errors).toEqual([
      "Phase failed: worktree phase",
      "No result message received from agent",
    ]);
    expect(result.sessionId).toBe("");
    expect(rootSpan.setAttribute).toHaveBeenCalledWith("session.status", "failed");
  });

  it("marks the session failed and records the failure when the budget was enforced and breached", () => {
    const state = makeState({
      resultMessage: makeResultMessage(),
      budgetEnforced: true,
      errors: ["Budget breached: accumulated $1.5000 exceeds limit $1"],
    });

    const result = buildFinalResult(BASE_CONFIG, state, makeFakeSpan(), undefined);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("Budget breached: accumulated $1.5000 exceeds limit $1");
    expect(result.failureCategory).toBe("budget_exceeded");
    expect(recordFailure).toHaveBeenCalledWith(
      BASE_CONFIG.repoPath,
      expect.objectContaining({
        taskDescription: BASE_CONFIG.taskDescription,
        errors: ["Budget breached: accumulated $1.5000 exceeds limit $1"],
      })
    );
  });

  it("attaches the gateway evaluation summary without flipping status when the quality gate fails", () => {
    const state = makeState({
      resultMessage: makeResultMessage(),
      gatewayEvaluation: {
        passed: false,
        confidence: 0.4,
        reasoning: "Diff does not address the task",
        issues: ["missing test"],
      },
    });

    const result = buildFinalResult(BASE_CONFIG, state, makeFakeSpan(), undefined);

    expect(result.status).toBe("succeeded");
    expect(result.evaluation).toEqual({
      passed: false,
      confidence: 0.4,
      reasoning: "Diff does not address the task",
    });
  });

  it("deduplicates a stuck message already present in errors", () => {
    const state = makeState({
      resultMessage: makeResultMessage(),
      stuckReason: {
        type: "zero_progress",
        count: 5,
        threshold: 5,
        description: "no progress",
        severity: "error",
      },
      errors: ["Stuck: no progress"],
    });

    const result = buildFinalResult(BASE_CONFIG, state, makeFakeSpan(), undefined);

    expect(result.status).toBe("failed");
    expect(result.stuckPattern).toBe("zero_progress");
  });

  it("includes turn and tool-call metrics in the result even when empty", () => {
    const state = makeState({ resultMessage: makeResultMessage() });

    const result = buildFinalResult(BASE_CONFIG, state, makeFakeSpan(), undefined);

    expect(result.turnMetrics).toEqual([]);
    expect(result.toolCallMetrics).toEqual([]);
  });

  it("sets context-metric span attributes when contextMetrics are present", () => {
    const state = makeState({
      resultMessage: makeResultMessage(),
      contextMetrics: {
        contextPercentAtExit: 42,
        peakContextPercent: 60,
        contextLimit: 200_000,
        compactionCount: 1,
      },
    });
    const rootSpan = makeFakeSpan();

    buildFinalResult(BASE_CONFIG, state, rootSpan, undefined);

    expect(rootSpan.setAttribute).toHaveBeenCalledWith("session.context_percent_at_exit", 42);
    expect(rootSpan.setAttribute).toHaveBeenCalledWith("session.peak_context_percent", 60);
    expect(rootSpan.setAttribute).toHaveBeenCalledWith("session.context_compaction_count", 1);
  });
});

describe("buildRootSpanAttributes", () => {
  it("builds base attributes from config with no tuning applied", () => {
    const attrs = buildRootSpanAttributes(BASE_CONFIG, null);

    expect(attrs).toEqual({
      "session.task": BASE_CONFIG.taskDescription,
      "session.model": BASE_CONFIG.model,
      "session.max_turns": BASE_CONFIG.maxTurns,
      "session.max_budget_usd": BASE_CONFIG.maxBudgetUsd,
      "session.base_branch": BASE_CONFIG.baseBranch,
    });
  });

  it("truncates long task descriptions to 200 characters", () => {
    const longTask = "x".repeat(300);
    const attrs = buildRootSpanAttributes({ ...BASE_CONFIG, taskDescription: longTask }, null);

    expect(attrs["session.task"]).toBe("x".repeat(200));
  });

  it("flags session.qa_tuning_applied when tuning thresholds are provided", () => {
    const attrs = buildRootSpanAttributes(BASE_CONFIG, {
      acceptanceRateFloor: 0.5,
      maxBudgetUSD: 1.0,
      maxRetries: 2,
      stuckTurnsThreshold: 5,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.5,
    });

    expect(attrs["session.qa_tuning_applied"]).toBe(true);
  });

  it("includes model routing reason/tier when present on config", () => {
    const attrs = buildRootSpanAttributes(
      { ...BASE_CONFIG, modelRoutingReason: "Feature label", modelRoutingTier: "sonnet" },
      null
    );

    expect(attrs["session.model_routing_reason"]).toBe("Feature label");
    expect(attrs["session.model_routing_tier"]).toBe("sonnet");
  });
});
