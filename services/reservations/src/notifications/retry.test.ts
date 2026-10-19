import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retry } from "./retry.js";

describe("retry()", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result of a successful fn on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 100 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and returns result when a later attempt succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("ok");

    const result = await retry(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting all retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(retry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow("permanent");
    // 1 initial + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when maxRetries is 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(retry(fn, { maxRetries: 0, baseDelayMs: 10 })).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry when isRetryable returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("not retryable"));
    await expect(
      retry(fn, { maxRetries: 3, baseDelayMs: 10, isRetryable: () => false })
    ).rejects.toThrow("not retryable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries only when isRetryable returns true", async () => {
    const retryableError = new Error("retryable");
    const fn = vi.fn().mockRejectedValueOnce(retryableError).mockResolvedValue("ok");

    const result = await retry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      isRetryable: (e) => e === retryableError,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies exponential backoff between attempts", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      delays.push(ms as number);
      return originalSetTimeout(fn as () => void, 0);
    });

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    await retry(fn, { maxRetries: 3, baseDelayMs: 1000, jitter: false });

    setTimeoutSpy.mockRestore();

    // attempt 0 → 1000ms, attempt 1 → 2000ms
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
  });

  it("applies jitter when jitter is true (default)", async () => {
    const delays: number[] = [];
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms) => {
      delays.push(ms as number);
      // run immediately
      (fn as () => void)();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");

    await retry(fn, { maxRetries: 3, baseDelayMs: 1000, jitter: true });

    setTimeoutSpy.mockRestore();

    // With jitter, delay should be within ±20% of baseDelayMs (800–1200)
    expect(delays[0]).toBeGreaterThan(0);
    expect(delays[0]).toBeGreaterThanOrEqual(800);
    expect(delays[0]).toBeLessThanOrEqual(1200);
  });
});
