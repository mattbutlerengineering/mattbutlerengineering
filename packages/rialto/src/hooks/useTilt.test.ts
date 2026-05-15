import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
    useMotionValue: (initial: number) => ({ set: vi.fn(), get: () => initial }),
    useSpring: (source: any) => source,
  };
});

import { useTilt } from "./useTilt";

describe("useTilt", () => {
  it("returns active handlers when enabled", () => {
    const { result } = renderHook(() => useTilt(true, 3));
    expect(result.current.ref).toBeTypeOf("function");
    expect(result.current.onMouseMove).toBeTypeOf("function");
    expect(result.current.onMouseLeave).toBeTypeOf("function");
    expect(result.current.style).toHaveProperty("rotateX");
    expect(result.current.style).toHaveProperty("rotateY");
    expect(result.current.style).toHaveProperty("transformPerspective", 800);
  });

  it("returns noop handlers when disabled", () => {
    const { result } = renderHook(() => useTilt(false));
    expect(result.current.style).toEqual({});
    const { ref, onMouseMove, onMouseLeave } = result.current;
    expect(() => {
      ref(null);
      onMouseMove({} as any);
      onMouseLeave();
    }).not.toThrow();
  });

  it("onMouseMove sets glow CSS custom properties", () => {
    const { result } = renderHook(() => useTilt(true, 5));

    const mockEl = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      style: { setProperty: vi.fn(), removeProperty: vi.fn() },
    } as unknown as HTMLDivElement;

    result.current.ref(mockEl);

    const mockEvent = { clientX: 75, clientY: 25 } as React.MouseEvent;
    result.current.onMouseMove(mockEvent);

    expect(mockEl.style.setProperty).toHaveBeenCalledWith("--tilt-glow-x", "75%");
    expect(mockEl.style.setProperty).toHaveBeenCalledWith("--tilt-glow-y", "25%");
  });

  it("onMouseLeave removes glow properties", () => {
    const { result } = renderHook(() => useTilt(true));

    const mockEl = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      style: { setProperty: vi.fn(), removeProperty: vi.fn() },
    } as unknown as HTMLDivElement;

    result.current.ref(mockEl);
    result.current.onMouseLeave();

    expect(mockEl.style.removeProperty).toHaveBeenCalledWith("--tilt-glow-x");
    expect(mockEl.style.removeProperty).toHaveBeenCalledWith("--tilt-glow-y");
  });

  it("onMouseMove without element ref does not throw", () => {
    const { result } = renderHook(() => useTilt(true));
    expect(() =>
      result.current.onMouseMove({ clientX: 50, clientY: 50 } as React.MouseEvent)
    ).not.toThrow();
  });

  it("onMouseLeave without element ref does not throw", () => {
    const { result } = renderHook(() => useTilt(true));
    expect(() => result.current.onMouseLeave()).not.toThrow();
  });
});
