import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockStart = vi.fn();
const mockSet = vi.fn();
const mockUseInView = vi.fn((_ref?: unknown, _options?: unknown) => false);
const mockUseReducedMotion = vi.fn(() => false);
const mockControls = { start: mockStart, set: mockSet };

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => mockUseReducedMotion(),
    // Stable across renders, like the real `useAnimation` (which is a
    // `useConstant`) — a fresh object per render would make every effect
    // depending on `controls` re-run on any state change.
    useAnimation: () => mockControls,
    useInView: (ref: unknown, options?: unknown) => mockUseInView(ref, options),
  };
});

import { useScrollReveal } from "./useScrollReveal";

describe("useScrollReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStart.mockClear();
    mockSet.mockClear();
    mockUseInView.mockReturnValue(false);
    mockUseReducedMotion.mockReturnValue(false);
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

// `revealed` lets a consumer defer work that a variant cannot express — a
// count-up that should start when the figures are actually on screen, say —
// to the same moment the reveal itself fires, fallback and reduced-motion
// paths included.
describe("useScrollReveal revealed flag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseInView.mockReturnValue(false);
    mockUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays false while the element is out of view", () => {
    const { result } = renderHook(() => useScrollReveal());
    expect(result.current.revealed).toBe(false);
  });

  it("turns true once the element scrolls into view", () => {
    mockUseInView.mockReturnValue(true);
    const { result } = renderHook(() => useScrollReveal());
    expect(result.current.revealed).toBe(true);
  });

  it("turns true immediately under prefers-reduced-motion", () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useScrollReveal());
    expect(result.current.revealed).toBe(true);
  });

  it("turns true on the fallback timeout, so a never-scrolled page still resolves", () => {
    const { result } = renderHook(() => useScrollReveal({ fallbackTimeout: 1000 }));
    expect(result.current.revealed).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.revealed).toBe(true);
  });
});
