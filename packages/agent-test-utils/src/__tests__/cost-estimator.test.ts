import { describe, it, expect } from "vitest";
import {
  estimateTokenCount,
  estimatePromptTokens,
  calculateCost,
  estimateSessionCost,
  createCostProfiler,
  wouldExceedBudget,
  estimateLatency,
  MODEL_PRICING,
  DEFAULT_LATENCY_PROFILE,
} from "../cost-estimator.js";

describe("estimateTokenCount", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("estimates ~4 chars per token", () => {
    const text = "a".repeat(400);
    expect(estimateTokenCount(text)).toBe(100);
  });

  it("rounds up for partial tokens", () => {
    expect(estimateTokenCount("abc")).toBe(1); // 3 chars → ceil(3/4) = 1
  });
});

describe("estimatePromptTokens", () => {
  it("adds system prompt overhead to task estimate", () => {
    const task = "Fix the login bug"; // ~5 tokens
    const result = estimatePromptTokens(task, 2000);
    expect(result).toBeGreaterThan(2000);
  });

  it("uses default overhead of 2000", () => {
    const result = estimatePromptTokens("x");
    expect(result).toBeGreaterThanOrEqual(2000);
  });
});

describe("calculateCost", () => {
  it("calculates cost for sonnet", () => {
    const cost = calculateCost({ inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost.inputCostUsd).toBeCloseTo(3.0);
    expect(cost.model).toBe("claude-sonnet-4-6");
  });

  it("calculates output cost separately", () => {
    const cost = calculateCost({ inputTokens: 0, outputTokens: 1_000_000 });
    expect(cost.outputCostUsd).toBeCloseTo(15.0);
  });

  it("includes cache write cost when provided", () => {
    const cost = calculateCost({
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost.cacheWriteCostUsd).toBeCloseTo(3.75);
  });

  it("includes cache read cost when provided", () => {
    const cost = calculateCost({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    });
    expect(cost.cacheReadCostUsd).toBeCloseTo(0.3);
  });

  it("uses haiku pricing when specified", () => {
    const cost = calculateCost({ inputTokens: 1_000_000, outputTokens: 0 }, "claude-haiku-4-5");
    expect(cost.inputCostUsd).toBeCloseTo(0.8);
    expect(cost.model).toBe("claude-haiku-4-5");
  });

  it("falls back to sonnet for unknown model", () => {
    const cost = calculateCost({ inputTokens: 1_000_000, outputTokens: 0 }, "unknown-model");
    expect(cost.model).toBe("claude-sonnet-4-6");
  });

  it("totalCostUsd is sum of all components", () => {
    const cost = calculateCost({
      inputTokens: 100_000,
      outputTokens: 10_000,
      cacheWriteTokens: 50_000,
      cacheReadTokens: 200_000,
    });
    const expected =
      cost.inputCostUsd + cost.outputCostUsd + cost.cacheWriteCostUsd + cost.cacheReadCostUsd;
    expect(cost.totalCostUsd).toBeCloseTo(expected);
  });
});

describe("estimateSessionCost", () => {
  it("returns a cost breakdown", () => {
    const cost = estimateSessionCost("Fix the login bug");
    expect(cost.totalCostUsd).toBeGreaterThan(0);
    expect(cost.model).toBe("claude-sonnet-4-6");
  });

  it("respects custom turn count (more turns = more cost)", () => {
    const low = estimateSessionCost("task", { numTurns: 1 });
    const high = estimateSessionCost("task", { numTurns: 10 });
    expect(high.totalCostUsd).toBeGreaterThan(low.totalCostUsd);
  });

  it("respects custom model", () => {
    const haiku = estimateSessionCost("task", { model: "claude-haiku-4-5" });
    const sonnet = estimateSessionCost("task", { model: "claude-sonnet-4-6" });
    expect(sonnet.totalCostUsd).toBeGreaterThan(haiku.totalCostUsd);
  });
});

describe("createCostProfiler", () => {
  it("records a session profile", () => {
    const profiler = createCostProfiler();
    profiler.record("sess-1", { inputTokens: 5000, outputTokens: 1000 }, 3000);
    expect(profiler.profiles()).toHaveLength(1);
    expect(profiler.profiles()[0].sessionId).toBe("sess-1");
  });

  it("summary returns zero values when empty", () => {
    const profiler = createCostProfiler();
    const s = profiler.summary();
    expect(s.totalSessions).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.mostExpensiveSession).toBeNull();
  });

  it("aggregates costs across sessions", () => {
    const profiler = createCostProfiler();
    profiler.record("s1", { inputTokens: 10000, outputTokens: 2000 }, 2000);
    profiler.record("s2", { inputTokens: 20000, outputTokens: 5000 }, 5000);
    const s = profiler.summary();
    expect(s.totalSessions).toBe(2);
    expect(s.totalCostUsd).toBeGreaterThan(0);
    expect(s.totalInputTokens).toBe(30000);
    expect(s.totalOutputTokens).toBe(7000);
  });

  it("identifies most and least expensive sessions", () => {
    const profiler = createCostProfiler();
    profiler.record("cheap", { inputTokens: 100, outputTokens: 10 }, 100);
    profiler.record("expensive", { inputTokens: 1_000_000, outputTokens: 200_000 }, 10000);
    const s = profiler.summary();
    expect(s.mostExpensiveSession?.sessionId).toBe("expensive");
    expect(s.cheapestSession?.sessionId).toBe("cheap");
  });

  it("reset clears all profiles", () => {
    const profiler = createCostProfiler();
    profiler.record("s1", { inputTokens: 100, outputTokens: 10 }, 100);
    profiler.reset();
    expect(profiler.profiles()).toHaveLength(0);
    expect(profiler.summary().totalSessions).toBe(0);
  });
});

describe("wouldExceedBudget", () => {
  it("returns false for very generous budget", () => {
    const result = wouldExceedBudget("Fix a small bug", 100);
    expect(result).toBe(false);
  });

  it("returns true for impossibly tight budget", () => {
    const result = wouldExceedBudget("Fix a small bug", 0.000001);
    expect(result).toBe(true);
  });
});

describe("estimateLatency", () => {
  it("returns positive value for non-zero token usage", () => {
    const ms = estimateLatency({ inputTokens: 5000, outputTokens: 1000 });
    expect(ms).toBeGreaterThan(0);
  });

  it("uses base latency as minimum", () => {
    const ms = estimateLatency(
      { inputTokens: 0, outputTokens: 0 },
      { ...DEFAULT_LATENCY_PROFILE, jitterMs: 0 }
    );
    expect(ms).toBe(DEFAULT_LATENCY_PROFILE.baseMs);
  });

  it("more tokens means more latency", () => {
    const low = estimateLatency({ inputTokens: 100, outputTokens: 50 });
    const high = estimateLatency({ inputTokens: 100000, outputTokens: 50000 });
    expect(high).toBeGreaterThan(low);
  });
});

describe("MODEL_PRICING", () => {
  it("contains entries for all main models", () => {
    expect(MODEL_PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-5"]).toBeDefined();
  });

  it("opus is most expensive model", () => {
    const sonnet = MODEL_PRICING["claude-sonnet-4-6"].inputCostPer1MTokens;
    const opus = MODEL_PRICING["claude-opus-4-5"].inputCostPer1MTokens;
    const haiku = MODEL_PRICING["claude-haiku-4-5"].inputCostPer1MTokens;
    expect(opus).toBeGreaterThan(sonnet);
    expect(sonnet).toBeGreaterThan(haiku);
  });
});
