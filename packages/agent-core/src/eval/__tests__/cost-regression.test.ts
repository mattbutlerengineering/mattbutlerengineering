import { describe, it, expect } from "vitest";
import { checkCostRegression } from "../cost-regression.js";

describe("checkCostRegression", () => {
  it("returns true (no regression) when baseline is null", () => {
    expect(checkCostRegression(0.5, null, 10)).toBe(true);
  });

  it("returns true when cost increase is within the threshold", () => {
    // baseline 0.10, current 0.10 = 0% increase, threshold 10% → pass
    expect(checkCostRegression(0.1, 0.1, 10)).toBe(true);
    // baseline 0.10, current 0.11 = 10% increase, threshold 10% → pass (at boundary)
    expect(checkCostRegression(0.11, 0.1, 10)).toBe(true);
  });

  it("returns false when cost increase exceeds the threshold", () => {
    // baseline 0.10, current 0.12 = 20% increase, threshold 10% → fail
    expect(checkCostRegression(0.12, 0.1, 10)).toBe(false);
  });

  it("returns true when cost decreases (cost regression is only upward)", () => {
    expect(checkCostRegression(0.05, 0.1, 10)).toBe(true);
  });

  it("handles zero baseline gracefully (returns true — no sensible comparison)", () => {
    expect(checkCostRegression(0, 0, 10)).toBe(true);
  });
});
