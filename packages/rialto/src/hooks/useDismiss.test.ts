import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { type RefObject } from "react";
import { useDismiss } from "./useDismiss";

function mouseDown(target: EventTarget): MouseEvent {
  const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

describe("useDismiss", () => {
  let inside: HTMLDivElement;
  let child: HTMLButtonElement;
  let outside: HTMLDivElement;
  let ref: RefObject<HTMLDivElement | null>;

  beforeEach(() => {
    document.body.innerHTML = "";
    inside = document.createElement("div");
    child = document.createElement("button");
    inside.appendChild(child);
    outside = document.createElement("div");
    document.body.append(inside, outside);
    ref = { current: inside };
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls onClose on an outside mousedown when enabled", () => {
    const onClose = vi.fn();
    renderHook(() => useDismiss(ref, onClose, { enabled: true }));
    mouseDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on a mousedown inside the ref", () => {
    const onClose = vi.fn();
    renderHook(() => useDismiss(ref, onClose, { enabled: true }));
    mouseDown(child); // bubbles up to `inside` → contained
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is inert when enabled=false", () => {
    const onClose = vi.fn();
    renderHook(() => useDismiss(ref, onClose, { enabled: false }));
    mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing when the ref is unset", () => {
    const onClose = vi.fn();
    const emptyRef: RefObject<HTMLDivElement | null> = { current: null };
    renderHook(() => useDismiss(emptyRef, onClose, { enabled: true }));
    mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up the listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useDismiss(ref, onClose, { enabled: true }));
    unmount();
    mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up the listener when disabled", () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDismiss(ref, onClose, { enabled }),
      { initialProps: { enabled: true } }
    );
    act(() => rerender({ enabled: false }));
    mouseDown(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the latest onClose callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useDismiss(ref, cb, { enabled: true }),
      { initialProps: { cb: first } }
    );
    act(() => rerender({ cb: second }));
    mouseDown(outside);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
