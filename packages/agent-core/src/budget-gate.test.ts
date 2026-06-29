import { describe, it, expect } from "vitest";
import { shouldHaltForBudget } from "./budget-gate.js";
import type { TurnMetrics } from "./types.js";

function makeTurn(costUsd: number, turnIndex = 1): TurnMetrics {
  return {
    turnIndex,
    startedAt: new Date().toISOString(),
    inputTokens: 100,
    outputTokens: 50,
    thinkingTokens: 0,
    costUsd,
    modelId: "claude-sonnet-4-6",
  };
}

describe("shouldHaltForBudget", () => {
  it("returns exceeded=false with no turns", () => {
    const result = shouldHaltForBudget([], 1.0);
    expect(result.exceeded).toBe(false);
    expect(result.accumulatedCostUsd).toBe(0);
    expect(result.overageUsd).toBe(0);
  });

  it("returns exceeded=false when under budget", () => {
    const turns = [makeTurn(0.4), makeTurn(0.3, 2)];
    const result = shouldHaltForBudget(turns, 1.0);
    expect(result.exceeded).toBe(false);
    expect(result.accumulatedCostUsd).toBeCloseTo(0.7);
    expect(result.overageUsd).toBe(0);
  });

  it("returns exceeded=false when exactly at budget", () => {
    const turns = [makeTurn(0.5), makeTurn(0.5, 2)];
    const result = shouldHaltForBudget(turns, 1.0);
    expect(result.exceeded).toBe(false);
    expect(result.accumulatedCostUsd).toBeCloseTo(1.0);
    expect(result.overageUsd).toBe(0);
  });

  it("returns exceeded=true when over budget", () => {
    const turns = [makeTurn(0.6), makeTurn(0.6, 2)];
    const result = shouldHaltForBudget(turns, 1.0);
    expect(result.exceeded).toBe(true);
    expect(result.accumulatedCostUsd).toBeCloseTo(1.2);
    expect(result.overageUsd).toBeCloseTo(0.2);
    expect(result.maxBudgetUsd).toBe(1.0);
  });

  it("returns exceeded=true with a single turn that exceeds the budget", () => {
    const result = shouldHaltForBudget([makeTurn(2.5)], 1.0);
    expect(result.exceeded).toBe(true);
    expect(result.accumulatedCostUsd).toBe(2.5);
    expect(result.overageUsd).toBeCloseTo(1.5);
  });

  it("exposes maxBudgetUsd in the result", () => {
    const result = shouldHaltForBudget([makeTurn(0.1)], 2.0);
    expect(result.maxBudgetUsd).toBe(2.0);
    expect(result.exceeded).toBe(false);
  });
});
