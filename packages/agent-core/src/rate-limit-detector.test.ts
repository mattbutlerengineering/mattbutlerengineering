import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scanForRateLimitPatterns, RateLimitDetector } from "./rate-limit-detector.js";

describe("scanForRateLimitPatterns", () => {
  it("returns true for 'rate limit exceeded'", () => {
    expect(scanForRateLimitPatterns("Error: rate limit exceeded")).toBe(true);
  });

  it("returns true for 'rate_limit' with underscore", () => {
    expect(scanForRateLimitPatterns("rate_limit hit")).toBe(true);
  });

  it("returns true for 'ratelimit' without separator", () => {
    expect(scanForRateLimitPatterns("ratelimit error")).toBe(true);
  });

  it("returns true for '429 Too Many Requests'", () => {
    expect(scanForRateLimitPatterns("HTTP 429 Too Many Requests")).toBe(true);
  });

  it("returns true for 'quota exceeded'", () => {
    expect(scanForRateLimitPatterns("API quota exceeded for project")).toBe(true);
  });

  it("returns true for 'quota_exceeded' with underscore", () => {
    expect(scanForRateLimitPatterns("quota_exceeded")).toBe(true);
  });

  it("returns true for 'throttled'", () => {
    expect(scanForRateLimitPatterns("Request was throttled")).toBe(true);
  });

  it("returns true for 'too many requests'", () => {
    expect(scanForRateLimitPatterns("too many requests, slow down")).toBe(true);
  });

  it("returns true for 'usage limit'", () => {
    expect(scanForRateLimitPatterns("usage limit reached")).toBe(true);
  });

  it("returns true for 'try again later'", () => {
    expect(scanForRateLimitPatterns("Please try again later")).toBe(true);
  });

  it("returns false for normal output", () => {
    expect(scanForRateLimitPatterns("Build succeeded with 0 errors")).toBe(false);
  });

  it("returns false for 'rate' alone (not 'rate limit')", () => {
    expect(scanForRateLimitPatterns("the rate of change is high")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(scanForRateLimitPatterns("")).toBe(false);
  });

  it("returns false for '429' embedded in a larger number", () => {
    // \b429\b should not match "14290"
    expect(scanForRateLimitPatterns("port 14290 is open")).toBe(false);
  });
});

describe("RateLimitDetector", () => {
  const ADAPTERS = ["claude-sdk", "gemini-cli", "opencode-cli"] as const;
  const COOLDOWN_MS = 60_000; // 1 minute for tests

  let detector: RateLimitDetector;

  beforeEach(() => {
    detector = new RateLimitDetector(ADAPTERS, COOLDOWN_MS);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks all adapters available initially", () => {
    for (const name of ADAPTERS) {
      expect(detector.isAvailable(name)).toBe(true);
    }
    expect(detector.getAvailableAdapters()).toEqual([...ADAPTERS]);
  });

  it("returns initial state with zero consecutive failures", () => {
    const state = detector.getState("claude-sdk");
    expect(state).toEqual({
      name: "claude-sdk",
      available: true,
      cooldownUntil: null,
      consecutiveFailures: 0,
    });
  });

  it("markRateLimited makes adapter unavailable", () => {
    detector.markRateLimited("claude-sdk");

    expect(detector.isAvailable("claude-sdk")).toBe(false);
    const state = detector.getState("claude-sdk");
    expect(state?.available).toBe(false);
    expect(state?.cooldownUntil).toBe(Date.now() + COOLDOWN_MS);
  });

  it("markSuccess makes adapter available and resets failures", () => {
    detector.markRateLimited("claude-sdk");
    detector.markRateLimited("claude-sdk"); // consecutiveFailures = 2
    detector.markSuccess("claude-sdk");

    expect(detector.isAvailable("claude-sdk")).toBe(true);
    const state = detector.getState("claude-sdk");
    expect(state?.available).toBe(true);
    expect(state?.cooldownUntil).toBeNull();
    expect(state?.consecutiveFailures).toBe(0);
  });

  it("cooldown expires and adapter becomes available again", () => {
    detector.markRateLimited("gemini-cli");
    expect(detector.isAvailable("gemini-cli")).toBe(false);

    // Advance time past cooldown
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    expect(detector.isAvailable("gemini-cli")).toBe(true);

    // Verify state was updated after cooldown expiry check
    const state = detector.getState("gemini-cli");
    expect(state?.available).toBe(true);
    expect(state?.cooldownUntil).toBeNull();
  });

  it("adapter remains unavailable before cooldown expires", () => {
    detector.markRateLimited("gemini-cli");
    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    expect(detector.isAvailable("gemini-cli")).toBe(false);
  });

  it("getAvailableAdapters excludes rate-limited adapters", () => {
    detector.markRateLimited("claude-sdk");
    detector.markRateLimited("opencode-cli");

    expect(detector.getAvailableAdapters()).toEqual(["gemini-cli"]);
  });

  it("getAvailableAdapters returns empty when all are rate-limited", () => {
    for (const name of ADAPTERS) {
      detector.markRateLimited(name);
    }
    expect(detector.getAvailableAdapters()).toEqual([]);
  });

  it("consecutiveFailures increments on each rate limit", () => {
    detector.markRateLimited("claude-sdk");
    expect(detector.getState("claude-sdk")?.consecutiveFailures).toBe(1);

    // Simulate cooldown expiry so markRateLimited can be called again meaningfully
    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    detector.markRateLimited("claude-sdk");
    expect(detector.getState("claude-sdk")?.consecutiveFailures).toBe(2);

    vi.advanceTimersByTime(COOLDOWN_MS + 1);
    detector.markRateLimited("claude-sdk");
    expect(detector.getState("claude-sdk")?.consecutiveFailures).toBe(3);
  });

  it("returns false for unknown adapter name in isAvailable", () => {
    expect(detector.isAvailable("nonexistent")).toBe(false);
  });

  it("returns undefined for unknown adapter name in getState", () => {
    expect(detector.getState("nonexistent")).toBeUndefined();
  });

  it("ignores markRateLimited for unknown adapter", () => {
    // Should not throw
    detector.markRateLimited("nonexistent");
    expect(detector.getAvailableAdapters()).toEqual([...ADAPTERS]);
  });

  it("ignores markSuccess for unknown adapter", () => {
    // Should not throw
    detector.markSuccess("nonexistent");
    expect(detector.getAvailableAdapters()).toEqual([...ADAPTERS]);
  });

  it("uses default cooldown of 5 minutes when not specified", () => {
    const defaultDetector = new RateLimitDetector(["test-adapter"]);
    defaultDetector.markRateLimited("test-adapter");

    const state = defaultDetector.getState("test-adapter");
    expect(state?.cooldownUntil).toBe(Date.now() + 300_000);
  });

  it("does not mutate previous state objects", () => {
    const stateBefore = detector.getState("claude-sdk");
    detector.markRateLimited("claude-sdk");
    const stateAfter = detector.getState("claude-sdk");

    // The state objects should be different references
    expect(stateBefore).not.toBe(stateAfter);
    // Original state should still show available
    expect(stateBefore?.available).toBe(true);
    expect(stateAfter?.available).toBe(false);
  });
});
