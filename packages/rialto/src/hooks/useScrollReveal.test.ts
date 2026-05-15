import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockStart = vi.fn();
const mockSet = vi.fn();
const mockUseInView = vi.fn(() => false);

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
    useAnimation: () => ({
      start: mockStart,
      set: mockSet,
    }),
    useInView: (...args: any[]) => mockUseInView(...args),
  };
});

import { useScrollReveal } from "./useScrollReveal";

describe("useScrollReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStart.mockClear();
    mockSet.mockClear();
    mockUseInView.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ref and controls", () => {
    const { result } = renderHook(() => useScrollReveal());
    expect(result.current.ref).toBeDefined();
    expect(result.current.controls).toBeDefined();
  });

  it("starts visible animation when in view", () => {
    mockUseInView.mockReturnValue(true);
    renderHook(() => useScrollReveal());
    expect(mockStart).toHaveBeenCalledWith("visible");
  });

  it("triggers fallback after timeout when not in view", () => {
    mockUseInView.mockReturnValue(false);
    renderHook(() => useScrollReveal({ fallbackTimeout: 1000 }));
    expect(mockStart).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(mockStart).toHaveBeenCalledWith("visible");
  });

  it("does not double-trigger if already revealed by inView", () => {
    mockUseInView.mockReturnValue(true);
    renderHook(() => useScrollReveal({ fallbackTimeout: 500 }));

    const callCount = mockStart.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockStart.mock.calls.length).toBe(callCount);
  });

  it("accepts custom margin option", () => {
    mockUseInView.mockReturnValue(false);
    renderHook(() => useScrollReveal({ margin: "-100px" }));
    expect(mockUseInView).toHaveBeenCalled();
  });
});
