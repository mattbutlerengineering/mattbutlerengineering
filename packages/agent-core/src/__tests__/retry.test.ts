import { describe, it, expect, vi } from "vitest";
import {
  isTransientError,
  isContextWindowExhausted,
  calculateDelay,
  withRetry,
  ContextWindowExhaustedError,
} from "../retry.js";

describe("isTransientError", () => {
  it("returns true for network timeout errors", () => {
    expect(isTransientError(new Error("connect ETIMEDOUT 1.2.3.4:443"))).toBe(true);
  });

  it("returns true for connection reset errors", () => {
    expect(isTransientError(new Error("read ECONNRESET"))).toBe(true);
  });

  it("returns true for rate limit errors", () => {
    expect(isTransientError(new Error("rate limit exceeded"))).toBe(true);
    expect(isTransientError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
  });

  it("returns true for server errors (502, 503, 504)", () => {
    expect(isTransientError(new Error("HTTP 502 Bad Gateway"))).toBe(true);
    expect(isTransientError(new Error("HTTP 503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("HTTP 504 Gateway Timeout"))).toBe(true);
  });

  it("returns true for git remote errors", () => {
    expect(isTransientError(new Error("Could not read from remote repository"))).toBe(true);
    expect(isTransientError(new Error("unable to access 'https://github.com/...'"))).toBe(true);
  });

  it("returns true for fetch failures", () => {
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    expect(isTransientError(new Error("File not found"))).toBe(false);
    expect(isTransientError(new Error("Permission denied"))).toBe(false);
    expect(isTransientError(new Error("Syntax error"))).toBe(false);
  });

  it("handles non-Error values", () => {
    expect(isTransientError("ETIMEDOUT")).toBe(true);
    expect(isTransientError("some other string")).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe("isContextWindowExhausted", () => {
  it("detects context window exceeded errors", () => {
    expect(isContextWindowExhausted(new Error("context window exceeded"))).toBe(true);
    expect(isContextWindowExhausted(new Error("context length limit reached"))).toBe(true);
  });

  it("detects maximum context length errors", () => {
    expect(isContextWindowExhausted(new Error("maximum context length exceeded"))).toBe(true);
  });

  it("detects token limit errors", () => {
    expect(isContextWindowExhausted(new Error("token limit exceeded"))).toBe(true);
    expect(isContextWindowExhausted(new Error("token limit reached"))).toBe(true);
  });

  it("detects max_tokens_exceeded error code", () => {
    expect(isContextWindowExhausted(new Error("max_tokens_exceeded"))).toBe(true);
  });

  it("detects prompt too long errors", () => {
    expect(isContextWindowExhausted(new Error("prompt is too long"))).toBe(true);
    expect(isContextWindowExhausted(new Error("input too long for model"))).toBe(true);
  });

  it("detects context_length_exceeded error code", () => {
    expect(isContextWindowExhausted(new Error("context_length_exceeded"))).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isContextWindowExhausted(new Error("Network error"))).toBe(false);
    expect(isContextWindowExhausted(new Error("Rate limit exceeded"))).toBe(false);
    expect(isContextWindowExhausted(new Error("File not found"))).toBe(false);
  });

  it("handles non-Error values", () => {
    expect(isContextWindowExhausted("context_length_exceeded")).toBe(true);
    expect(isContextWindowExhausted(42)).toBe(false);
  });
});

describe("calculateDelay", () => {
  it("returns a value within expected range for first attempt", () => {
    const delay = calculateDelay(0, 1000, 30_000);
    // For attempt 0: base * 2^0 = 1000, jitter 50-100% => 500-1000
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it("increases delay exponentially", () => {
    // Attempt 2: base * 2^2 = 4000, jitter 50-100% => 2000-4000
    const delay = calculateDelay(2, 1000, 30_000);
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThanOrEqual(4000);
  });

  it("caps delay at maxDelayMs", () => {
    // Attempt 10: base * 2^10 = 1,024,000 > maxDelay of 5000
    const delay = calculateDelay(10, 1000, 5000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 });

    expect(result).toEqual({ value: "ok", attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ETIMEDOUT"))
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 });

    expect(result).toEqual({ value: "ok", attempts: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after maxRetries transient failures", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow(
      "connect ETIMEDOUT"
    );
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("throws immediately on non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("File not found"));

    await expect(withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow(
      "File not found"
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws ContextWindowExhaustedError on context length errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("context_length_exceeded"));

    await expect(withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow(
      ContextWindowExhaustedError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never retries context window exhaustion errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("maximum context length exceeded"));

    await expect(withRetry(fn, { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 5 })).rejects.toThrow(
      ContextWindowExhaustedError
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects custom isRetryable predicate", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom-retriable"))
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, {
      baseDelayMs: 1,
      maxDelayMs: 5,
      isRetryable: (err) => (err as Error).message === "custom-retriable",
    });

    expect(result).toEqual({ value: "ok", attempts: 2 });
  });
});

describe("ContextWindowExhaustedError", () => {
  it("includes the original message and guidance", () => {
    const err = new ContextWindowExhaustedError("max_tokens_exceeded");
    expect(err.name).toBe("ContextWindowExhaustedError");
    expect(err.message).toContain("max_tokens_exceeded");
    expect(err.message).toContain("smaller sub-tasks");
  });

  it("is an instance of Error", () => {
    const err = new ContextWindowExhaustedError("test");
    expect(err).toBeInstanceOf(Error);
  });
});
