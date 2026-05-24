import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PipelineContext } from "../phases/pipeline-types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("../feedback-loop.js", () => ({
  runFeedbackLoop: vi.fn(),
}));

vi.mock("../model-router.js", () => ({
  getFeedbackLoopModel: vi.fn().mockReturnValue("claude-haiku-4-5"),
  resolveModelId: vi.fn().mockReturnValue("claude-sonnet-4-6"),
}));

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

import { runFeedbackLoop } from "../feedback-loop.js";
import { FeedbackPhase } from "../phases/feedback-phase.js";

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
  feedbackLoop: {
    enabled: true,
    maxRetries: 2,
    pollIntervalMs: 30_000,
    pollTimeoutMs: 300_000,
  },
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
    hasChanges: true,
    prUrl: "https://github.com/repo/pull/1",
    prNumber: 1,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("FeedbackPhase", () => {
  const phase = new FeedbackPhase();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runFeedbackLoop).mockResolvedValue({ resolved: true, retriesUsed: 1 });
  });

  it("has name 'feedback'", () => {
    expect(phase.name).toBe("feedback");
  });

  it("runs feedback loop when enabled and PR exists", async () => {
    const { result } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(runFeedbackLoop).toHaveBeenCalled();
  });

  it("skips when feedbackLoop is not enabled", async () => {
    const { result } = await phase.run(
      makeCtx({ config: { ...BASE_CONFIG, feedbackLoop: undefined } })
    );

    expect(result.status).toBe("skipped");
    expect(runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("skips when feedbackLoop.enabled is false", async () => {
    const { result } = await phase.run(
      makeCtx({
        config: {
          ...BASE_CONFIG,
          feedbackLoop: {
            enabled: false,
            maxRetries: 2,
            pollIntervalMs: 30_000,
            pollTimeoutMs: 300_000,
          },
        },
      })
    );

    expect(result.status).toBe("skipped");
    expect(runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("skips when no PR was created", async () => {
    const { result } = await phase.run(makeCtx({ prUrl: null, prNumber: undefined }));

    expect(result.status).toBe("skipped");
    expect(runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("uses remaining budget (total - session cost)", async () => {
    await phase.run(makeCtx());

    const fbCall = vi.mocked(runFeedbackLoop).mock.calls[0][0];
    // maxBudgetUsd = 1.0, resultMessage.total_cost_usd = 0.25 → remaining = 0.75
    expect(fbCall.maxBudgetUsd).toBeCloseTo(0.75);
  });

  it("emits session:result event with feedback outcome", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeCtx({ onEvent }));

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("Feedback loop");
  });
});
