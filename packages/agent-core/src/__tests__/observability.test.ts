import { describe, it, expect } from "vitest";
import {
  categorizeFailure,
  buildTurnMetricsList,
  buildToolCallMetricsList,
} from "../observability.js";
import type { StuckPatternType } from "../stuck-detector.js";

// ── categorizeFailure ────────────────────────────────────────────────

describe("categorizeFailure", () => {
  it("returns undefined for empty errors with no stuck pattern", () => {
    expect(categorizeFailure([])).toBeUndefined();
  });

  it("returns stuck_loop when stuckPattern is provided", () => {
    expect(categorizeFailure([], "repeated_action_observation" as StuckPatternType)).toBe(
      "stuck_loop"
    );
  });

  it("returns stuck_loop even when errors are also present", () => {
    expect(categorizeFailure(["some error"], "zero_progress" as StuckPatternType)).toBe(
      "stuck_loop"
    );
  });

  it("returns rate_limited for 429 errors", () => {
    expect(categorizeFailure(["Request failed: 429 Too Many Requests"])).toBe("rate_limited");
  });

  it("returns rate_limited for rate limit message", () => {
    expect(categorizeFailure(["Rate limit exceeded, try again later"])).toBe("rate_limited");
  });

  it("returns rate_limited for overloaded message", () => {
    expect(categorizeFailure(["API overloaded, try later"])).toBe("rate_limited");
  });

  it("returns budget_exceeded for budget messages", () => {
    expect(categorizeFailure(["Cost exceeded budget of $1.00"])).toBe("budget_exceeded");
  });

  it("returns budget_exceeded for max budget message", () => {
    expect(categorizeFailure(["Session max budget reached"])).toBe("budget_exceeded");
  });

  it("returns tool_error for ENOENT errors", () => {
    expect(categorizeFailure(["Tool error: ENOENT: no such file or directory"])).toBe("tool_error");
  });

  it("returns tool_error for permission denied", () => {
    expect(categorizeFailure(["Permission denied: EACCES /etc/shadow"])).toBe("tool_error");
  });

  it("returns api_error for network errors", () => {
    expect(categorizeFailure(["network timeout connecting to api.anthropic.com"])).toBe(
      "api_error"
    );
  });

  it("returns api_error for 500 errors", () => {
    expect(categorizeFailure(["Internal Server Error: 500"])).toBe("api_error");
  });

  it("returns logic_error for evaluation failures", () => {
    expect(categorizeFailure(["Evaluation failed: output did not match"])).toBe("logic_error");
  });

  it("returns logic_error for security review failures", () => {
    expect(categorizeFailure(["Security review failed: hardcoded secret found"])).toBe(
      "logic_error"
    );
  });

  it("returns logic_error as default when errors exist", () => {
    expect(categorizeFailure(["Something went wrong, unknown reason"])).toBe("logic_error");
  });

  it("rate_limited takes priority over api_error signals", () => {
    // Both 429 and network are present — rate_limited should win
    expect(categorizeFailure(["Network error: 429 rate limited"])).toBe("rate_limited");
  });
});

// ── buildTurnMetricsList ─────────────────────────────────────────────

describe("buildTurnMetricsList", () => {
  it("returns an empty array for empty input", () => {
    expect(buildTurnMetricsList([])).toEqual([]);
  });

  it("maps raw turn data to TurnMetrics objects", () => {
    const raw = [
      {
        turnIndex: 1,
        startedAt: "2026-04-05T00:00:00.000Z",
        inputTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 0,
        costUsd: 0.01,
        modelId: "claude-sonnet-4-6",
      },
      {
        turnIndex: 2,
        startedAt: "2026-04-05T00:00:01.000Z",
        inputTokens: 2000,
        outputTokens: 800,
        thinkingTokens: 100,
        costUsd: 0.02,
        modelId: "claude-sonnet-4-6",
      },
    ];

    const result = buildTurnMetricsList(raw);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      turnIndex: 1,
      startedAt: "2026-04-05T00:00:00.000Z",
      inputTokens: 1000,
      outputTokens: 500,
      thinkingTokens: 0,
      costUsd: 0.01,
      modelId: "claude-sonnet-4-6",
    });
    expect(result[1].turnIndex).toBe(2);
  });

  it("preserves all fields immutably", () => {
    const raw = [
      {
        turnIndex: 1,
        startedAt: "2026-04-05T00:00:00.000Z",
        inputTokens: 100,
        outputTokens: 50,
        thinkingTokens: 0,
        costUsd: 0.005,
        modelId: "claude-haiku",
      },
    ];

    const result = buildTurnMetricsList(raw);
    expect(result[0]).not.toBe(raw[0]); // New object
    expect(result[0]).toEqual(raw[0]);
  });
});

// ── buildToolCallMetricsList ─────────────────────────────────────────

describe("buildToolCallMetricsList", () => {
  it("returns an empty array for empty input", () => {
    expect(buildToolCallMetricsList([])).toEqual([]);
  });

  it("maps raw tool call data correctly", () => {
    const raw = [
      {
        toolName: "Read",
        toolUseId: "tu_001",
        latencyMs: 120,
        isError: false,
      },
      {
        toolName: "Bash",
        toolUseId: "tu_002",
        latencyMs: 3500,
        isError: true,
      },
    ];

    const result = buildToolCallMetricsList(raw);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      toolName: "Read",
      toolUseId: "tu_001",
      latencyMs: 120,
      isError: false,
    });
    expect(result[1]).toEqual({
      toolName: "Bash",
      toolUseId: "tu_002",
      latencyMs: 3500,
      isError: true,
    });
  });

  it("preserves all fields immutably", () => {
    const raw = [{ toolName: "Write", toolUseId: "tu_003", latencyMs: 200, isError: false }];

    const result = buildToolCallMetricsList(raw);
    expect(result[0]).not.toBe(raw[0]);
    expect(result[0]).toEqual(raw[0]);
  });
});
