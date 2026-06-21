import { describe, it, expect } from "vitest";
import { computeFlakyTests } from "../collect-flaky-tests.mjs";

describe("computeFlakyTests", () => {
  it("returns available: false when given no runs", () => {
    const result = computeFlakyTests([]);
    expect(result.available).toBe(false);
    expect(result.data_gap).toBeDefined();
  });

  it("returns available: false when given null", () => {
    const result = computeFlakyTests(null);
    expect(result.available).toBe(false);
  });

  it("flags a test that both passed and failed on the same SHA as flaky", () => {
    const runs = [
      { sha: "abc123", testName: "auth > login", passed: true },
      { sha: "abc123", testName: "auth > login", passed: false },
      { sha: "abc123", testName: "auth > logout", passed: true },
      { sha: "abc123", testName: "auth > logout", passed: true },
    ];
    const result = computeFlakyTests(runs);
    expect(result.available).toBe(true);
    expect(result.flaky_count).toBe(1);
    expect(result.flaky_tests).toHaveLength(1);
    expect(result.flaky_tests[0].testName).toBe("auth > login");
    expect(result.flaky_tests[0].sha).toBe("abc123");
    expect(result.flaky_tests[0].passCount).toBeGreaterThan(0);
    expect(result.flaky_tests[0].failCount).toBeGreaterThan(0);
  });

  it("does not flag a test that only fails on the same SHA (consistent failure is not flaky)", () => {
    const runs = [
      { sha: "abc123", testName: "db > connect", passed: false },
      { sha: "abc123", testName: "db > connect", passed: false },
    ];
    const result = computeFlakyTests(runs);
    expect(result.available).toBe(true);
    expect(result.flaky_count).toBe(0);
    expect(result.flaky_tests).toHaveLength(0);
  });

  it("does not flag a test that consistently passes", () => {
    const runs = [
      { sha: "def456", testName: "api > health", passed: true },
      { sha: "def456", testName: "api > health", passed: true },
      { sha: "aaa111", testName: "api > health", passed: true },
    ];
    const result = computeFlakyTests(runs);
    expect(result.available).toBe(true);
    expect(result.flaky_count).toBe(0);
  });

  it("detects flakiness across multiple SHAs independently", () => {
    // flaky on sha1, stable on sha2
    const runs = [
      { sha: "sha1", testName: "cache > hit", passed: true },
      { sha: "sha1", testName: "cache > hit", passed: false },
      { sha: "sha2", testName: "cache > hit", passed: true },
      { sha: "sha2", testName: "cache > hit", passed: true },
    ];
    const result = computeFlakyTests(runs);
    expect(result.available).toBe(true);
    // "cache > hit" is flaky on sha1 — should appear
    expect(result.flaky_count).toBe(1);
    expect(result.flaky_tests[0].testName).toBe("cache > hit");
    expect(result.flaky_tests[0].sha).toBe("sha1");
  });

  it("returns total_runs and window_shas in the result", () => {
    const runs = [
      { sha: "abc", testName: "x", passed: true },
      { sha: "def", testName: "y", passed: false },
    ];
    const result = computeFlakyTests(runs);
    expect(result.total_runs).toBe(2);
    expect(result.window_shas).toBeGreaterThan(0);
  });
});
