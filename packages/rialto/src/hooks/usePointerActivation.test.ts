import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePointerActivation } from "./usePointerActivation";

function moveMouse(clientX: number, clientY: number): void {
  document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY }));
}

describe("usePointerActivation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reports no movement before the pointer moves", () => {
    const { result } = renderHook(() => usePointerActivation(true));
    expect(result.current.hasPointerMoved()).toBe(false);
  });

  it("ignores movement below the threshold", () => {
    const { result } = renderHook(() => usePointerActivation(true, 4));
    act(() => moveMouse(0, 0)); // establishes the baseline
    act(() => moveMouse(1, 1)); // ~1.41px from baseline — below threshold
    expect(result.current.hasPointerMoved()).toBe(false);
  });

  it("reports movement once the pointer travels past the threshold", () => {
    const { result } = renderHook(() => usePointerActivation(true, 4));
    act(() => moveMouse(0, 0)); // baseline
    act(() => moveMouse(10, 10)); // ~14px from baseline — beyond threshold
    expect(result.current.hasPointerMoved()).toBe(true);
  });

  it("accumulates slow drift against a fixed baseline", () => {
    const { result } = renderHook(() => usePointerActivation(true, 4));
    act(() => moveMouse(0, 0)); // baseline
    act(() => moveMouse(2, 0)); // 2px — below threshold
    act(() => moveMouse(5, 0)); // 5px from baseline — beyond threshold
    expect(result.current.hasPointerMoved()).toBe(true);
  });

  it("stays inert when disabled", () => {
    const { result } = renderHook(() => usePointerActivation(false, 4));
    act(() => moveMouse(0, 0));
    act(() => moveMouse(50, 50));
    expect(result.current.hasPointerMoved()).toBe(false);
  });

  it("resetPointerMovement clears movement and re-baselines", () => {
    const { result } = renderHook(() => usePointerActivation(true, 4));
    act(() => moveMouse(0, 0));
    act(() => moveMouse(20, 20));
    expect(result.current.hasPointerMoved()).toBe(true);

    act(() => result.current.resetPointerMovement());
    expect(result.current.hasPointerMoved()).toBe(false);

    act(() => moveMouse(21, 21)); // new baseline, tiny delta → still false
    expect(result.current.hasPointerMoved()).toBe(false);
  });

  it("cleans up the listener on unmount", () => {
    const { result, unmount } = renderHook(() => usePointerActivation(true, 4));
    unmount();
    act(() => moveMouse(0, 0));
    act(() => moveMouse(50, 50));
    expect(result.current.hasPointerMoved()).toBe(false);
  });
});
