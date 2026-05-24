import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PipelineContext } from "../phases/pipeline-types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
}));

vi.mock("../event-mapper.js", () => ({
  mapSdkMessage: vi.fn().mockReturnValue([]),
}));

vi.mock("../sanitize-output.js", () => ({
  sanitizeStreamChunk: vi.fn((s: string) => s),
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

vi.mock("@langfuse/tracing", () => ({
  startObservation: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    end: vi.fn(),
  }),
}));

vi.mock("../circuit-breaker.js", () => {
  class MockCircuitBreaker {
    wrap = vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => fn());
    getState = vi.fn().mockReturnValue("CLOSED");
  }
  return {
    CircuitBreaker: MockCircuitBreaker,
    CircuitState: { Open: "OPEN", Closed: "CLOSED", HalfOpen: "HALF_OPEN" },
  };
});

// ── Imports (after mocks) ───────────────────────────────────────────

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { QueryPhase } from "../phases/query-phase.js";

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
    ...overrides,
  };
}

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

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("QueryPhase", () => {
  const phase = new QueryPhase();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );
  });

  it("has name 'query'", () => {
    expect(phase.name).toBe("query");
  });

  it("returns resultMessage on successful SDK query", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(result.phase).toBe("query");
    expect(ctx.resultMessage).toBeDefined();
    expect(ctx.resultMessage?.session_id).toBe("session-123");
    expect(ctx.stuckReason).toBeUndefined();
  });

  it("returns failed when no worktree in context", async () => {
    const { result } = await phase.run(makeCtx({ worktree: undefined }));

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("requires worktree");
  });

  it("detects context exhaustion from compaction events", async () => {
    const compactMessages = Array.from({ length: 5 }, () => ({
      type: "system",
      subtype: "compact_boundary",
    }));
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([...compactMessages, mockResult]) as ReturnType<typeof query>
    );

    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success"); // phase itself succeeds, stuck is metadata
    expect(ctx.stuckReason).toBeDefined();
    expect(ctx.stuckReason?.type).toBe("context_window_loop");
  });

  it("emits session:stuck events on compaction exhaustion", async () => {
    const compactMessages = Array.from({ length: 5 }, () => ({
      type: "system",
      subtype: "compact_boundary",
    }));
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([...compactMessages, mockResult]) as ReturnType<typeof query>
    );

    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeCtx({ onEvent }));

    const stuckEvents = events.filter((e) => e.type === "session:stuck");
    expect(stuckEvents.length).toBeGreaterThan(0);
  });

  it("records turn metrics for assistant messages", async () => {
    vi.mocked((await import("../event-mapper.js")).mapSdkMessage).mockReturnValue([
      {
        type: "session:turn_metrics",
        turnIndex: 1,
        inputTokens: 100,
        outputTokens: 50,
        thinkingTokens: 0,
        costUsd: 0,
        modelId: "claude-sonnet-4-6",
      },
    ]);

    const assistantMsg = {
      type: "assistant" as const,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "I'll fix the bug" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([assistantMsg, mockResult]) as ReturnType<typeof query>
    );

    const { ctx } = await phase.run(makeCtx());

    expect(ctx.turnMetrics).toBeDefined();
    expect(ctx.turnMetrics!.length).toBeGreaterThan(0);
  });

  it("handles SDK errors gracefully", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("SDK connection failed");
    });

    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("SDK connection failed");
    expect(ctx.errors).toContain("SDK connection failed");
  });
});
