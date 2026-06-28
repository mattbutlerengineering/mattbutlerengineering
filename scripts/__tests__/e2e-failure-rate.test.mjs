import { describe, it, expect } from "vitest";
import {
  computeFailureRate,
  exceedsThreshold,
  parsePlaywrightResults,
} from "../e2e-failure-rate.mjs";

// Playwright JSON reporter stats shapes
const ALL_PASSING = {
  stats: {
    startTime: "2024-01-01T00:00:00.000Z",
    duration: 12345,
    expected: 20,
    unexpected: 0,
    flaky: 0,
    skipped: 0,
  },
};

const SOME_FAILING = {
  stats: {
    startTime: "2024-01-01T00:00:00.000Z",
    duration: 12345,
    expected: 16,
    unexpected: 4,
    flaky: 0,
    skipped: 0,
  },
};

const HIGH_FAILURE = {
  stats: {
    startTime: "2024-01-01T00:00:00.000Z",
    duration: 12345,
    expected: 7,
    unexpected: 3,
    flaky: 0,
    skipped: 0,
  },
};

const WITH_FLAKY = {
  stats: {
    startTime: "2024-01-01T00:00:00.000Z",
    duration: 12345,
    expected: 18,
    unexpected: 2,
    flaky: 2,
    skipped: 1,
  },
};

const ALL_SKIPPED = {
  stats: {
    startTime: "2024-01-01T00:00:00.000Z",
    duration: 0,
    expected: 0,
    unexpected: 0,
    flaky: 0,
    skipped: 5,
  },
};

describe("parsePlaywrightResults", () => {
  it("extracts stats from playwright JSON reporter output", () => {
    const stats = parsePlaywrightResults(ALL_PASSING);
    expect(stats).toEqual({
      expected: 20,
      unexpected: 0,
      flaky: 0,
    });
  });

  it("extracts stats when some tests fail", () => {
    const stats = parsePlaywrightResults(SOME_FAILING);
    expect(stats.unexpected).toBe(4);
    expect(stats.expected).toBe(16);
  });

  it("throws on missing stats field", () => {
    expect(() => parsePlaywrightResults({})).toThrow(/invalid playwright results/i);
  });
});

describe("computeFailureRate", () => {
  it("returns 0 when no tests ran", () => {
    const result = computeFailureRate({ expected: 0, unexpected: 0, flaky: 0 });
    expect(result.rate).toBe(0);
    expect(result.total).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns 0 when all tests pass", () => {
    const stats = parsePlaywrightResults(ALL_PASSING);
    const result = computeFailureRate(stats);
    expect(result.rate).toBe(0);
    expect(result.total).toBe(20);
    expect(result.failed).toBe(0);
  });

  it("computes 20% failure rate for 4/20 failing", () => {
    const stats = parsePlaywrightResults(SOME_FAILING);
    const result = computeFailureRate(stats);
    expect(result.rate).toBe(20);
    expect(result.total).toBe(20);
    expect(result.failed).toBe(4);
  });

  it("computes 30% failure rate for 3/10 failing", () => {
    const stats = parsePlaywrightResults(HIGH_FAILURE);
    const result = computeFailureRate(stats);
    expect(result.rate).toBe(30);
    expect(result.total).toBe(10);
    expect(result.failed).toBe(3);
  });

  it("excludes skipped tests from the total denominator", () => {
    const stats = parsePlaywrightResults(WITH_FLAKY);
    // total = expected(18) + unexpected(2) + flaky(2) = 22 (skipped excluded)
    const result = computeFailureRate(stats);
    expect(result.total).toBe(22);
    expect(result.failed).toBe(2);
    // rate = 2/22 * 100 ≈ 9.09
    expect(result.rate).toBeCloseTo(9.09, 1);
  });

  it("returns 0 when all tests are skipped (no division by zero)", () => {
    const stats = parsePlaywrightResults(ALL_SKIPPED);
    const result = computeFailureRate(stats);
    expect(result.rate).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("exceedsThreshold", () => {
  it("returns false when rate is below threshold", () => {
    expect(exceedsThreshold(10, 20)).toBe(false);
  });

  it("returns false when rate equals threshold", () => {
    expect(exceedsThreshold(20, 20)).toBe(false);
  });

  it("returns true when rate exceeds threshold", () => {
    expect(exceedsThreshold(25, 20)).toBe(true);
  });

  it("returns false at 0% failure", () => {
    expect(exceedsThreshold(0, 20)).toBe(false);
  });

  it("returns true at 100% failure with any threshold", () => {
    expect(exceedsThreshold(100, 20)).toBe(true);
  });
});
