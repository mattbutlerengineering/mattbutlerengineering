import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrchestratorConfig } from "../task-decomposer.js";
import { DEFAULT_ORCHESTRATOR_CONFIG } from "../task-decomposer.js";

// Mock the SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn((_name, _desc, _schema, handler) => ({
    name: _name,
    handler,
  })),
  createSdkMcpServer: vi.fn(() => ({
    name: "session-manager",
  })),
}));

// Mock global fetch for API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { query, tool } from "@anthropic-ai/claude-agent-sdk";
import { runOrchestrator } from "../orchestrator.js";

function createConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    taskDescription: "Implement a notification system with email and SMS",
    ...overrides,
  };
}

function createMockAsyncGenerator(messages: unknown[]) {
  return async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };
}

describe("runOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns succeeded when the orchestrator completes successfully", async () => {
    // Mock the SDK query to return a successful result
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "All 2 sub-tasks completed successfully",
          total_cost_usd: 0.05,
          num_turns: 10,
          session_id: "orch-session-1",
        },
      ])() as ReturnType<typeof query>
    );

    // Mock fetch for child session status checks (none created in this simple case)
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: "child-1", status: "succeeded", costUsd: 0.5 } }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("All 2 sub-tasks completed successfully");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(query).toHaveBeenCalledOnce();
  });

  it("returns failed when SDK throws an error", async () => {
    vi.mocked(query).mockReturnValueOnce(
      (async function* () {
        yield { type: "system" as const }; // yield before throwing to satisfy require-yield
        throw new Error("SDK connection failed");
      })() as ReturnType<typeof query>
    );

    const events: Array<{ type: string; message: string }> = [];
    const result = await runOrchestrator(createConfig(), (e) => events.push(e));

    expect(result.status).toBe("failed");
    expect(result.summary).toBe("SDK connection failed");
    expect(events.some((e) => e.type === "orchestrator:error")).toBe(true);
  });

  it("tracks child session IDs from assistant messages", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-session-abc" }),
        },
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-session-def" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Created 2 sessions",
          total_cost_usd: 0.03,
          num_turns: 5,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    // Mock fetch for child session status lookups
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "child-session-abc", status: "succeeded", costUsd: 0.4, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.childSessionIds).toContain("child-session-abc");
    expect(result.childSessionIds).toContain("child-session-def");
  });

  it("emits start and complete events", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    const events: Array<{ type: string; message: string }> = [];
    await runOrchestrator(createConfig(), (e) => events.push(e));

    expect(events[0]?.type).toBe("orchestrator:start");
    expect(events[events.length - 1]?.type).toBe("orchestrator:complete");
  });

  it("passes correct model and tool configuration to query", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0,
          num_turns: 1,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    await runOrchestrator(createConfig({ model: "claude-haiku-4-5" }));

    const callArgs = vi.mocked(query).mock.calls[0]?.[0] as {
      options: {
        model: string;
        allowedTools: string[];
      };
    };

    expect(callArgs.options.model).toBe("claude-haiku-4-5");
    expect(callArgs.options.allowedTools).toContain("mcp__session-manager__create_session");
    expect(callArgs.options.allowedTools).toContain("mcp__session-manager__check_session");
    expect(callArgs.options.allowedTools).toContain("mcp__session-manager__list_sessions");
    expect(callArgs.options.allowedTools).toContain("mcp__session-manager__cancel_session");
  });

  it("calculates total cost including orchestrator and child sessions", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-1" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.02,
          num_turns: 3,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "child-1", status: "succeeded", costUsd: 0.75, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    // 0.75 (child) + 0.02 (orchestrator)
    expect(result.totalCostUsd).toBeCloseTo(0.77, 2);
  });

  it("returns partially_succeeded when some children fail", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-ok" }),
        },
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-fail" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Mixed results",
          total_cost_usd: 0.01,
          num_turns: 4,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { id: "child-ok", status: "succeeded", costUsd: 0.5, errors: [] },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { id: "child-fail", status: "failed", costUsd: 0.3, errors: ["Build failed"] },
        }),
      };
    });

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("partially_succeeded");
  });

  it("returns failed when child session status check throws", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-error" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    // Simulate fetch throwing for the child session status check
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await runOrchestrator(createConfig());

    // allSucceeded should be false because the catch sets it to false
    expect(result.status).toBe("failed");
    expect(result.childSessionIds).toContain("child-error");
  });

  it("returns failed when all child sessions fail", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-a" }),
        },
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "child-b" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "child-a", status: "failed", costUsd: 0.1, errors: ["Build broke"] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("failed");
  });

  it("handles result message without total_cost_usd", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: undefined,
          num_turns: 1,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("succeeded");
    expect(result.totalCostUsd).toBe(0);
  });

  it("uses non-success result subtype for summary fallback", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "error_max_turns",
          result: "Ran out of turns",
          total_cost_usd: 0.05,
          num_turns: 200,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    const result = await runOrchestrator(createConfig());

    // Non-success subtype — summary should fall back to default
    expect(result.summary).toBe("Orchestration completed");
  });

  it("extracts session IDs from deeply nested structures", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          // Session ID in a nested JSON string
          content: JSON.stringify({
            response: {
              sessions: [{ sessionId: "deep-child-1" }],
            },
          }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "deep-child-1", status: "succeeded", costUsd: 0.2, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.childSessionIds).toContain("deep-child-1");
  });

  it("extracts session IDs from arrays", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify([{ sessionId: "arr-child-1" }, { sessionId: "arr-child-2" }]),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "arr-child-1", status: "succeeded", costUsd: 0.1, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.childSessionIds).toContain("arr-child-1");
    expect(result.childSessionIds).toContain("arr-child-2");
  });

  it("does not duplicate session IDs already tracked", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "dupe-child" }),
        },
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "dupe-child" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 3,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "dupe-child", status: "succeeded", costUsd: 0.2, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.childSessionIds.filter((id) => id === "dupe-child")).toHaveLength(1);
  });

  it("handles child sessions with null costUsd", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: JSON.stringify({ sessionId: "null-cost-child" }),
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.02,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "null-cost-child", status: "succeeded", costUsd: null, errors: [] },
      }),
    });

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("succeeded");
    // Only orchestrator cost since child cost is null
    expect(result.totalCostUsd).toBeCloseTo(0.02, 2);
  });

  it("respects parentSessionId in config", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 1,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    await runOrchestrator(createConfig({ parentSessionId: "parent-123" }));

    // Verify query was called (the parentSessionId goes into the MCP tool handler
    // so we just confirm no crash and successful completion)
    expect(query).toHaveBeenCalledOnce();
  });

  it("handles non-JSON string content in messages gracefully", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "assistant",
          content: "This is not JSON",
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    const result = await runOrchestrator(createConfig());

    // Should not crash on non-JSON content
    expect(result.status).toBe("succeeded");
    expect(result.childSessionIds).toHaveLength(0);
  });

  it("handles messages without content field", async () => {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "system",
          subtype: "init",
        },
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0.01,
          num_turns: 2,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    const result = await runOrchestrator(createConfig());

    expect(result.status).toBe("succeeded");
    expect(result.childSessionIds).toHaveLength(0);
  });
});

// ── MCP tool handlers (exercised directly via mock capture) ─────────

describe("orchestrator MCP tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper: run orchestrator and capture the tool handlers registered via the
   * `tool()` mock. Returns a map of tool-name → handler function.
   */
  async function captureToolHandlers(): Promise<
    Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  > {
    vi.mocked(query).mockReturnValueOnce(
      createMockAsyncGenerator([
        {
          type: "result",
          subtype: "success",
          result: "Done",
          total_cost_usd: 0,
          num_turns: 1,
          session_id: "orch-1",
        },
      ])() as ReturnType<typeof query>
    );

    await runOrchestrator(createConfig());

    const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
    for (const call of vi.mocked(tool).mock.calls) {
      const [name, , , handler] = call as [
        string,
        string,
        unknown,
        (args: Record<string, unknown>) => Promise<unknown>,
      ];
      handlers[name] = handler;
    }
    return handlers;
  }

  it("create_session calls API and returns session ID", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "new-session-1", status: "pending", taskDescription: "Do X" },
      }),
    });

    const result = await handlers["create_session"]({
      taskDescription: "Do X",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sessionId: "new-session-1",
            status: "pending",
            taskDescription: "Do X",
          }),
        },
      ],
    });
  });

  it("check_session returns full session details", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: "sess-123",
          status: "succeeded",
          taskDescription: "Fix bug",
          branchName: "agent/fix-bug",
          prUrl: "https://github.com/repo/pull/5",
          costUsd: 0.45,
          errors: [],
        },
      }),
    });

    const result = await handlers["check_session"]({ sessionId: "sess-123" });

    const parsed = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    expect(parsed.id).toBe("sess-123");
    expect(parsed.status).toBe("succeeded");
    expect(parsed.prUrl).toBe("https://github.com/repo/pull/5");
    expect(parsed.costUsd).toBe(0.45);
  });

  it("list_sessions returns paginated summary", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: "s1",
            status: "succeeded",
            taskDescription: "Task one with a very long description that should be truncated",
            prUrl: "https://github.com/repo/pull/1",
            costUsd: 0.3,
            branchName: null,
            errors: [],
          },
        ],
        pagination: { page: 1, total: 1, totalPages: 1 },
      }),
    });

    const result = await handlers["list_sessions"]({});

    const parsed = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].id).toBe("s1");
    expect(parsed.total).toBe(1);
    expect(parsed.page).toBe(1);
  });

  it("list_sessions passes status and page params to API", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        pagination: { page: 2, total: 5, totalPages: 3 },
      }),
    });

    await handlers["list_sessions"]({ status: "running", page: 2, limit: 10 });

    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain("status=running");
    expect(fetchUrl).toContain("page=2");
    expect(fetchUrl).toContain("limit=10");
  });

  it("cancel_session returns success on successful cancellation", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: "cancel-me", status: "cancelled" },
      }),
    });

    const result = await handlers["cancel_session"]({ sessionId: "cancel-me" });

    const parsed = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
    expect(parsed.id).toBe("cancel-me");
    expect(parsed.status).toBe("cancelled");
    expect(parsed.message).toBe("Session cancelled successfully");
  });

  it("cancel_session returns error response on API failure", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ message: "Session already completed" }),
    });

    const result = await handlers["cancel_session"]({ sessionId: "already-done" });

    const response = result as { content: Array<{ text: string }>; isError: boolean };
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    // ApiClientError includes method+path prefix; check the original message is present
    expect(parsed.error).toContain("Session already completed");
  });

  it("cancel_session handles non-Error thrown exceptions", async () => {
    const handlers = await captureToolHandlers();

    mockFetch.mockRejectedValueOnce("network down");

    const result = await handlers["cancel_session"]({ sessionId: "net-err" });

    const response = result as { content: Array<{ text: string }>; isError: boolean };
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toBe("network down");
  });

  it("apiCall throws on non-ok response with fallback message", async () => {
    const handlers = await captureToolHandlers();

    // Simulate json() failing (e.g. empty body). Use 500 (not 503) to avoid
    // ApiClient's retry-on-503 logic consuming more mock invocations.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("no body");
      },
    });

    const result = await handlers["cancel_session"]({ sessionId: "no-body" });

    const response = result as { content: Array<{ text: string }>; isError: boolean };
    expect(response.isError).toBe(true);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error).toContain("Internal Server Error");
  });

  it("apiCall handles 204 No Content response", async () => {
    const handlers = await captureToolHandlers();

    // The cancel endpoint might return 204
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => undefined,
    });

    // cancel_session wraps apiCall — if 204, data is undefined and accessing .data throws
    // This exercises the 204 branch in apiCall
    const result = await handlers["cancel_session"]({ sessionId: "204-test" });

    // Since cancel expects session.data.id, getting undefined causes a TypeError → caught
    const response = result as { content: Array<{ text: string }>; isError: boolean };
    expect(response.isError).toBe(true);
  });
});
