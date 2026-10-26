import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiscardGuard } from "./use-discard-guard.js";

function setup() {
  const apply = vi.fn();
  const hook = renderHook(() => useDiscardGuard<string | null>(apply));
  return { apply, ...hook };
}

describe("useDiscardGuard", () => {
  it("lets the drawer move on at once while nothing is unsaved", () => {
    const { result, apply } = setup();
    act(() => result.current.request("2026-11-06"));
    expect(apply).toHaveBeenCalledWith("2026-11-06");
    expect(result.current.pending).toBeNull();
  });

  it("holds the move and asks while there is an unsaved draft", () => {
    const { result, apply } = setup();
    act(() => result.current.setDirty(true));
    act(() => result.current.request(null));
    expect(apply).not.toHaveBeenCalled();
    expect(result.current.pending).toEqual({ next: null });
  });

  it("Keep editing leaves the draft and the drawer as they were", () => {
    const { result, apply } = setup();
    act(() => result.current.setDirty(true));
    act(() => result.current.request("2026-11-06"));
    act(() => result.current.keepEditing());
    expect(result.current.pending).toBeNull();
    expect(result.current.dirty).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("Discard drops the draft and makes the move that was held", () => {
    const { result, apply } = setup();
    act(() => result.current.setDirty(true));
    act(() => result.current.request("2026-11-06"));
    act(() => result.current.confirmDiscard());
    expect(apply).toHaveBeenCalledWith("2026-11-06");
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it("release moves without asking and clears the draft, as after a save", () => {
    const { result, apply } = setup();
    act(() => result.current.setDirty(true));
    act(() => result.current.release(null));
    expect(apply).toHaveBeenCalledWith(null);
    expect(result.current.dirty).toBe(false);
  });
});
