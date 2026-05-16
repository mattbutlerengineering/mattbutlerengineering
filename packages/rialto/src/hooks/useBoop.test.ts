import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
    useMotionValue: (initial: number) => {
      let val = initial;
      return {
        set: (v: number) => {
          val = v;
        },
        get: () => val,
      };
    },
    useSpring: (source: unknown) => source,
  };
});

import { useBoop } from "./useBoop";

describe("useBoop", () => {
  it("returns style with scale and event handlers", () => {
    const { result } = renderHook(() => useBoop());
    expect(result.current.style).toHaveProperty("scale");
    expect(result.current.onMouseEnter).toBeTypeOf("function");
    expect(result.current.onMouseLeave).toBeTypeOf("function");
  });

  it("onMouseEnter sets scale to boop.scale (1.03)", () => {
    const { result } = renderHook(() => useBoop());
    const scale = result.current.style.scale as { get: () => number };

    act(() => {
      result.current.onMouseEnter();
    });
    expect(scale.get()).toBe(1.03);
  });

  it("onMouseLeave resets scale to 1", () => {
    const { result } = renderHook(() => useBoop());
    const scale = result.current.style.scale as { get: () => number };

    act(() => {
      result.current.onMouseEnter();
    });
    act(() => {
      result.current.onMouseLeave();
    });
    expect(scale.get()).toBe(1);
  });

  it("does not throw when called repeatedly", () => {
    const { result } = renderHook(() => useBoop());
    expect(() => {
      act(() => result.current.onMouseEnter());
      act(() => result.current.onMouseLeave());
      act(() => result.current.onMouseEnter());
    }).not.toThrow();
  });
});
