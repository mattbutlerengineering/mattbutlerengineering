import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionEvent } from "../types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
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

vi.mock("../event-mapper.js", () => ({
  mapSdkMessage: vi.fn().mockReturnValue([]),
}));

vi.mock("../sanitize-output.js", () => ({
  sanitizeStreamChunk: vi.fn((s: string) => s),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
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

vi.mock("../observability.js", () => ({
  buildTurnMetricsList: vi.fn().mockReturnValue([]),
  buildToolCallMetricsList: vi.fn().mockReturnValue([]),
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { runHardenedQuery } from "../run-hardened-query.js";
import type { HardenedQueryConfig } from "../run-hardened-query.js";

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_CONFIG: HardenedQueryConfig = {
  prompt: "Fix the login bug",
  cwd: "/repo/.agent-worktrees/fix-bug-abc123",
  model: "claude-sonnet-4-6",
  maxTurns: 30,
  maxBudgetUsd: 0.5,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
  systemPromptAppend: "You are fixing feedback on an existing PR. Work in the current branch.",
  heartbeatConfig: {
    intervalMs: 50, // Very short for testing
    inactivityTimeoutMs: 150, // Abort after 150ms of silence
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

// An async iterable that stalls using setTimeout so fake timers can advance it.
// The AbortController abort() cancels the wait via the signal so the for-await exits.
function makeStalledQueryGenerator(signal: AbortSignal): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<never> {
      return {
        next(): Promise<IteratorResult<never>> {
          return new Promise<IteratorResult<never>>((resolve) => {
            if (signal.aborted) {
              resolve({ value: undefined as never, done: true });
              return;
            }
            const tid = setTimeout(() => {
              resolve({ value: undefined as never, done: true });
            }, 9_999_999); // never fires in practice
            signal.addEventListener("abort", () => {
              clearTimeout(tid);
              resolve({ value: undefined as never, done: true });
            });
          });
        },
      };
    },
  };
}

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("runHardenedQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns resultMessage on successful SDK query", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const resultPromise = runHardenedQuery(BASE_CONFIG);
    await vi.runAllTimersAsync();
    const { resultMessage, stuckReason } = await resultPromise;

    expect(resultMessage).toBeDefined();
    expect(resultMessage?.session_id).toBe("session-123");
    expect(stuckReason).toBeNull();
  });

  it("aborts a stalled fix-session via the inactivity timeout", async () => {
    // Capture the abortController passed from runHardenedQuery to the SDK query mock,
    // so the stalled generator can react to abort and let the loop exit.
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(query).mockImplementation((opts) => {
      const signal = (opts.options as { abortController?: AbortController }).abortController
        ?.signal;
      capturedSignal = signal;
      return makeStalledQueryGenerator(signal!) as unknown as ReturnType<typeof query>;
    });

    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    const resultPromise = runHardenedQuery(BASE_CONFIG, onEvent);

    // Advance timers past the inactivity timeout (150ms) + one heartbeat interval (50ms)
    await vi.advanceTimersByTimeAsync(210);

    const { stuckReason } = await resultPromise;

    expect(capturedSignal).toBeDefined();
    expect(stuckReason).not.toBeNull();
    expect(stuckReason?.type).toBe("zero_progress");
    expect(stuckReason?.description).toMatch(/inactivity|hung|No SDK activity/i);

    const stuckEvents = events.filter((e) => e.type === "session:stuck");
    expect(stuckEvents.length).toBeGreaterThan(0);
  });

  it("detects context window exhaustion from compaction events", async () => {
    const compactMessages = Array.from({ length: 5 }, () => ({
      type: "system",
      subtype: "compact_boundary",
    }));
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([...compactMessages, mockResult]) as ReturnType<typeof query>
    );

    const resultPromise = runHardenedQuery(BASE_CONFIG);
    await vi.runAllTimersAsync();
    const { stuckReason } = await resultPromise;

    expect(stuckReason?.type).toBe("context_window_loop");
  });

  it("emits heartbeat events during execution", async () => {
    // Use a generator that waits for a timer tick before yielding the result,
    // so the heartbeat interval (50ms) fires at least once first.
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockImplementation(() => {
      return (async function* () {
        // Pause long enough for the heartbeat (50ms interval) to fire
        await new Promise<void>((resolve) => setTimeout(resolve, 60));
        yield mockResult;
      })() as unknown as ReturnType<typeof query>;
    });

    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    const resultPromise = runHardenedQuery(BASE_CONFIG, onEvent);
    // Advance past the first heartbeat interval
    await vi.advanceTimersByTimeAsync(70);
    await resultPromise;

    const heartbeatEvents = events.filter((e) => e.type === "session:heartbeat");
    expect(heartbeatEvents.length).toBeGreaterThan(0);
  });

  it("returns null resultMessage and null stuckReason on empty stream", async () => {
    vi.mocked(query).mockReturnValue(mockQueryGenerator([]) as ReturnType<typeof query>);

    const resultPromise = runHardenedQuery(BASE_CONFIG);
    await vi.runAllTimersAsync();
    const { resultMessage, stuckReason } = await resultPromise;

    expect(resultMessage).toBeNull();
    expect(stuckReason).toBeNull();
  });

  it("records turn and tool-call metrics", async () => {
    const { mapSdkMessage } = await import("../event-mapper.js");
    vi.mocked(mapSdkMessage).mockReturnValue([
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
        content: [{ type: "text", text: "Working on it" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    const mockResult = createMockResultMessage();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([assistantMsg, mockResult]) as ReturnType<typeof query>
    );

    const resultPromise = runHardenedQuery(BASE_CONFIG);
    await vi.runAllTimersAsync();
    const { rawTurnMetrics } = await resultPromise;

    expect(rawTurnMetrics.length).toBeGreaterThan(0);
  });
});
