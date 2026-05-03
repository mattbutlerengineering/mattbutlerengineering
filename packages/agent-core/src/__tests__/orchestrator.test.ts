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

import { query } from "@anthropic-ai/claude-agent-sdk";
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
});
