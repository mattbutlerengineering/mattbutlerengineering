import { describe, it, expect } from "vitest";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { extractTokenUsage, extractCost, buildSessionResult } from "../cost-tracker.js";

function createMockResult(overrides: Partial<SDKResultMessage> = {}): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    uuid: "test-uuid" as SDKResultMessage["uuid"],
    session_id: "session-123",
    duration_ms: 5000,
    duration_api_ms: 4000,
    is_error: false,
    num_turns: 5,
    result: "Task completed successfully",
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

function createMockErrorResult(): SDKResultMessage {
  return {
    type: "result",
    subtype: "error_max_turns",
    uuid: "test-uuid" as SDKResultMessage["uuid"],
    session_id: "session-456",
    duration_ms: 60000,
    duration_api_ms: 55000,
    is_error: true,
    num_turns: 50,
    stop_reason: null,
    total_cost_usd: 1.0,
    usage: {
      input_tokens: 50000,
      output_tokens: 10000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    errors: ["Maximum turns exceeded"],
  } as SDKResultMessage;
}

describe("extractTokenUsage", () => {
  it("extracts input and output tokens", () => {
    const result = createMockResult();
    const usage = extractTokenUsage(result);
    expect(usage).toEqual({
      inputTokens: 10000,
      outputTokens: 2000,
    });
  });

  it("defaults null tokens to 0", () => {
    const result = createMockResult({
      usage: {
        input_tokens: null,
        output_tokens: null,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as Partial<SDKResultMessage>);
    const usage = extractTokenUsage(result);
    expect(usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("extractCost", () => {
  it("returns cost in USD", () => {
    const result = createMockResult();
    expect(extractCost(result)).toBe(0.25);
  });
});

describe("buildSessionResult", () => {
  it("builds a successful session result", () => {
    const result = createMockResult();
    const sessionResult = buildSessionResult(
      result,
      "agent/fix-bug-abc123",
      "https://github.com/pr/1"
    );

    expect(sessionResult).toEqual({
      sessionId: "session-123",
      status: "succeeded",
      branchName: "agent/fix-bug-abc123",
      prUrl: "https://github.com/pr/1",
      costUsd: 0.25,
      tokenUsage: { inputTokens: 10000, outputTokens: 2000 },
      durationMs: 5000,
      numTurns: 5,
      resultText: "Task completed successfully",
      errors: [],
    });
  });

  it("builds a failed session result", () => {
    const result = createMockErrorResult();
    const sessionResult = buildSessionResult(result, "agent/big-task-xyz", null);

    expect(sessionResult.status).toBe("failed");
    expect(sessionResult.errors).toEqual(["Maximum turns exceeded"]);
    expect(sessionResult.prUrl).toBeNull();
    expect(sessionResult.resultText).toBe("");
  });

  it("handles null PR URL", () => {
    const result = createMockResult();
    const sessionResult = buildSessionResult(result, "branch", null);
    expect(sessionResult.prUrl).toBeNull();
  });
});
