import { describe, it, expect } from "vitest";
import { calculateCost, MODEL_PRICING } from "../index.js";

describe("calculateCost", () => {
  it("calculates cost for sonnet", () => {
    const cost = calculateCost({ inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost.inputCostUsd).toBeCloseTo(3.0);
    expect(cost.model).toBe("claude-sonnet-5");
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
    expect(cost.model).toBe("claude-sonnet-5");
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

describe("MODEL_PRICING", () => {
  it("contains entries for all main models", () => {
    expect(MODEL_PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-haiku-4-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-8"]).toBeDefined();
  });

  it("opus is most expensive model", () => {
    const sonnet = MODEL_PRICING["claude-sonnet-5"]!.inputCostPer1MTokens;
    const opus = MODEL_PRICING["claude-opus-4-8"]!.inputCostPer1MTokens;
    const haiku = MODEL_PRICING["claude-haiku-4-5"]!.inputCostPer1MTokens;
    expect(opus).toBeGreaterThan(sonnet);
    expect(sonnet).toBeGreaterThan(haiku);
  });
});
