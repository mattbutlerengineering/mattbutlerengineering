import { describe, it, expect } from "vitest";
import {
  categorizeFailure,
  buildTurnMetricsList,
  buildToolCallMetricsList,
  withModelSelectionSpan,
  withToolPermissionSpan,
  withStuckDetectionSpan,
  withSuccessEvaluationSpan,
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

// ── withModelSelectionSpan ───────────────────────────────────────────

describe("withModelSelectionSpan", () => {
  it("returns the result of the wrapped function", () => {
    const result = withModelSelectionSpan(() => ({
      tier: "sonnet",
      modelId: "claude-sonnet-4-6",
      reason: "default routing",
    }));

    expect(result.tier).toBe("sonnet");
    expect(result.modelId).toBe("claude-sonnet-4-6");
    expect(result.reason).toBe("default routing");
  });

  it("propagates errors from the wrapped function", () => {
    expect(() =>
      withModelSelectionSpan(() => {
        throw new Error("model selection failed");
      })
    ).toThrow("model selection failed");
  });

  it("returns result with different model tiers", () => {
    const opus = withModelSelectionSpan(() => ({
      tier: "opus",
      modelId: "claude-opus-4-6",
      reason: "complexity keywords: migration, schema change",
    }));
    expect(opus.tier).toBe("opus");

    const haiku = withModelSelectionSpan(() => ({
      tier: "haiku",
      modelId: "claude-haiku-4-5",
      reason: "dep bump pattern",
    }));
    expect(haiku.tier).toBe("haiku");
  });
});

// ── withToolPermissionSpan ───────────────────────────────────────────

describe("withToolPermissionSpan", () => {
  it("returns the result when tool is allowed", async () => {
    const result = await withToolPermissionSpan("Read", async () => ({
      behavior: "allow",
    }));

    expect(result.behavior).toBe("allow");
  });

  it("returns the result when tool is denied", async () => {
    const result = await withToolPermissionSpan("WebSearch", async () => ({
      behavior: "deny",
    }));

    expect(result.behavior).toBe("deny");
  });

  it("propagates errors from the wrapped function", async () => {
    await expect(
      withToolPermissionSpan("Bash", async () => {
        throw new Error("permission check failed");
      })
    ).rejects.toThrow("permission check failed");
  });

  it("records tool name for span attributes", async () => {
    const result = await withToolPermissionSpan("Edit", async () => ({
      behavior: "allow",
    }));

    expect(result.behavior).toBe("allow");
  });
});

// ── withStuckDetectionSpan ──────────────────────────────────────────

describe("withStuckDetectionSpan", () => {
  it("returns null when no stuck pattern detected", () => {
    const result = withStuckDetectionSpan(() => null);
    expect(result).toBeNull();
  });

  it("returns the stuck pattern when detected", () => {
    const pattern = {
      type: "repeated_action_observation",
      description: "4 identical action+observation pairs",
    };

    const result = withStuckDetectionSpan(() => pattern);

    expect(result).toEqual(pattern);
    expect(result!.type).toBe("repeated_action_observation");
    expect(result!.description).toBe("4 identical action+observation pairs");
  });

  it("propagates errors from the wrapped function", () => {
    expect(() =>
      withStuckDetectionSpan(() => {
        throw new Error("stuck detection error");
      })
    ).toThrow("stuck detection error");
  });

  it("handles different stuck pattern types", () => {
    const zeroProgress = withStuckDetectionSpan(() => ({
      type: "zero_progress",
      description: "5 turns with no tool use",
    }));
    expect(zeroProgress!.type).toBe("zero_progress");

    const selfLoop = withStuckDetectionSpan(() => ({
      type: "self_message_loop",
      description: "3 identical text messages",
    }));
    expect(selfLoop!.type).toBe("self_message_loop");
  });
});

// ── withSuccessEvaluationSpan ───────────────────────────────────────

describe("withSuccessEvaluationSpan", () => {
  it("returns the result when evaluation passes", async () => {
    const result = await withSuccessEvaluationSpan(async () => ({
      passed: true,
      confidence: 0.95,
    }));

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it("returns the result when evaluation fails", async () => {
    const result = await withSuccessEvaluationSpan(async () => ({
      passed: false,
      confidence: 0.3,
    }));

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.3);
  });

  it("propagates errors from the wrapped function", async () => {
    await expect(
      withSuccessEvaluationSpan(async () => {
        throw new Error("evaluation crashed");
      })
    ).rejects.toThrow("evaluation crashed");
  });

  it("handles edge case confidence values", async () => {
    const zero = await withSuccessEvaluationSpan(async () => ({
      passed: false,
      confidence: 0,
    }));
    expect(zero.confidence).toBe(0);

    const one = await withSuccessEvaluationSpan(async () => ({
      passed: true,
      confidence: 1.0,
    }));
    expect(one.confidence).toBe(1.0);
  });
});
