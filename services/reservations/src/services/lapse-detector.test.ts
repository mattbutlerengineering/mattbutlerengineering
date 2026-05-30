import { describe, it, expect } from "vitest";
import { detectLapse } from "./lapse-detector.js";

describe("detectLapse", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function daysAgo(n: number): string {
    return new Date(Date.now() - n * DAY_MS).toISOString();
  }

  it("returns isLapsing=false for fewer than 3 visits", () => {
    // Single-visit guest — never lapsing
    const result = detectLapse([daysAgo(30)]);
    expect(result.isLapsing).toBe(false);
  });

  it("returns isLapsing=false for exactly 2 visits", () => {
    const result = detectLapse([daysAgo(60), daysAgo(30)]);
    expect(result.isLapsing).toBe(false);
  });

  it("detects lapsing weekly regular missing 3 weeks", () => {
    // Weekly guest (visits every 7 days), last visit 21 days ago → 21 > 7*2=14
    const result = detectLapse([daysAgo(35), daysAgo(28), daysAgo(21)]);
    expect(result.isLapsing).toBe(true);
    expect(result.avgFrequencyDays).toBeCloseTo(7, 0);
    expect(result.daysSinceLastVisit).toBeGreaterThanOrEqual(20);
  });

  it("detects lapsing monthly regular missing 2 months", () => {
    // Monthly guest (visits every 30 days), last visit 61 days ago → 61 > 30*2=60
    const result = detectLapse([daysAgo(121), daysAgo(91), daysAgo(61)]);
    expect(result.isLapsing).toBe(true);
    expect(result.avgFrequencyDays).toBeCloseTo(30, 0);
    expect(result.daysSinceLastVisit).toBeGreaterThanOrEqual(60);
  });

  it("does NOT flag a regular guest who is within threshold", () => {
    // Weekly guest, last visit 13 days ago → 13 < 14 → not lapsing
    const result = detectLapse([daysAgo(27), daysAgo(20), daysAgo(13)]);
    expect(result.isLapsing).toBe(false);
  });

  it("computes avgFrequencyDays correctly", () => {
    // 3 visits, gaps of 7 and 7 days → avg = 7
    const result = detectLapse([daysAgo(14), daysAgo(7), daysAgo(0)]);
    expect(result.avgFrequencyDays).toBeCloseTo(7, 0);
  });

  it("handles unsorted visit dates", () => {
    // Dates out of order should still work
    const result = detectLapse([daysAgo(7), daysAgo(21), daysAgo(14)]);
    expect(result.avgFrequencyDays).toBeCloseTo(7, 0);
  });

  it("returns empty array → isLapsing false", () => {
    const result = detectLapse([]);
    expect(result.isLapsing).toBe(false);
  });

  it("daysSinceLastVisit is correct", () => {
    const result = detectLapse([daysAgo(28), daysAgo(14), daysAgo(7)]);
    expect(result.daysSinceLastVisit).toBeCloseTo(7, 0);
  });
});
