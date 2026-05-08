import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, CircuitState } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in CLOSED state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000 });
    expect(cb.getState()).toBe(CircuitState.Closed);
  });

  it("transitions to OPEN after threshold reached", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.wrap(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe(CircuitState.Closed);

    await expect(cb.wrap(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe(CircuitState.Open);
  });

  it("fails fast when OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.wrap(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe(CircuitState.Open);

    const fn2 = vi.fn().mockResolvedValue("ok");
    await expect(cb.wrap(fn2)).rejects.toThrow(/Circuit breaker is OPEN/);
    expect(fn2).not.toHaveBeenCalled();
  });

  it("transitions to HALF_OPEN after reset timeout", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.wrap(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe(CircuitState.Open);

    vi.advanceTimersByTime(1001);

    const fn2 = vi.fn().mockResolvedValue("ok");
    const result = await cb.wrap(fn2);
    expect(result).toBe("ok");
    expect(cb.getState()).toBe(CircuitState.Closed);
  });

  it("transitions back to OPEN if HALF_OPEN request fails", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(cb.wrap(fn)).rejects.toThrow("fail");
    expect(cb.getState()).toBe(CircuitState.Open);

    vi.advanceTimersByTime(1001);

    const fn2 = vi.fn().mockRejectedValue(new Error("fail again"));
    await expect(cb.wrap(fn2)).rejects.toThrow("fail again");
    expect(cb.getState()).toBe(CircuitState.Open);
  });

  it("calls onStateChange callback", async () => {
    const onStateChange = vi.fn();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      onStateChange,
    });

    await expect(cb.wrap(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    expect(onStateChange).toHaveBeenCalledWith(CircuitState.Open, expect.any(Error));
  });
});
