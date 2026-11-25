import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutopilotDismissals } from "./useAutopilotDismissals.js";

describe("useAutopilotDismissals", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with nothing dismissed", () => {
    const { result } = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    expect(result.current.nightDismissed).toBe(false);
    expect(result.current.isMoveDismissed("m1")).toBe(false);
  });

  it("remembers a dismissed move after a reload", () => {
    const first = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    act(() => first.result.current.dismissMove("m1"));
    expect(first.result.current.isMoveDismissed("m1")).toBe(true);
    first.unmount();

    const second = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    expect(second.result.current.isMoveDismissed("m1")).toBe(true);
    expect(second.result.current.isMoveDismissed("m2")).toBe(false);
  });

  it("dismisses for tonight only: the next service date starts fresh", () => {
    const tonight = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    act(() => tonight.result.current.dismissNight());
    expect(tonight.result.current.nightDismissed).toBe(true);

    const nextNight = renderHook(() => useAutopilotDismissals("v1", "2026-06-20"));
    expect(nextNight.result.current.nightDismissed).toBe(false);
  });

  it("keeps each venue's dismissal separate", () => {
    const a = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    act(() => a.result.current.dismissNight());

    const b = renderHook(() => useAutopilotDismissals("v2", "2026-06-19"));
    expect(b.result.current.nightDismissed).toBe(false);
  });

  it("still works for the session when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { result } = renderHook(() => useAutopilotDismissals("v1", "2026-06-19"));
    act(() => result.current.dismissNight());
    expect(result.current.nightDismissed).toBe(true);
  });
});
