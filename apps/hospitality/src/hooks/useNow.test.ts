import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNow } from "./useNow.js";

const START = new Date("2026-08-31T23:59:30Z");

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current time on first render", () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBeInstanceOf(Date);
    expect(result.current.getTime()).toBe(START.getTime());
  });

  it("returns the same object until the first minute has elapsed", () => {
    const { result } = renderHook(() => useNow());
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(initial);
  });

  it("yields a fresh Date at the advanced time after one minute", () => {
    const { result } = renderHook(() => useNow());
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).not.toBe(initial);
    expect(result.current.getTime()).toBe(START.getTime() + 60_000);
  });

  it("ticks at a custom interval", () => {
    const { result } = renderHook(() => useNow(1_000));
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).not.toBe(initial);
    expect(result.current.getTime()).toBe(START.getTime() + 1_000);
  });

  it("restarts with a single timer when the interval changes", () => {
    const { result, rerender } = renderHook(({ intervalMs }) => useNow(intervalMs), {
      initialProps: { intervalMs: 60_000 },
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const beforeChange = result.current;

    rerender({ intervalMs: 1_000 });
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).not.toBe(beforeChange);
    expect(result.current.getTime()).toBe(START.getTime() + 31_000);
  });

  it("clears its interval on unmount", () => {
    const { unmount } = renderHook(() => useNow());
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
