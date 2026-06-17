import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEscapeKey } from "./useEscapeKey";

function pressEscape() {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
}

function pressEnter() {
  const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
}

describe("useEscapeKey", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("calls onClose when Escape is pressed and enabled=true", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, true));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when enabled=false", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, false));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, true));
    pressEnter();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up listener when disabled", () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useEscapeKey(onClose, enabled),
      { initialProps: { enabled: true } }
    );

    act(() => {
      rerender({ enabled: false });
    });

    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onClose, true));
    unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the latest onClose callback without re-registering listener", () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useEscapeKey(cb, true), {
      initialProps: { cb: onClose1 },
    });

    act(() => {
      rerender({ cb: onClose2 });
    });

    pressEscape();
    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose2).toHaveBeenCalledTimes(1);
  });
});
