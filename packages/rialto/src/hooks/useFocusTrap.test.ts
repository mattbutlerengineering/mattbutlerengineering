import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import type { RefObject } from "react";
import { useFocusTrap } from "./useFocusTrap";

function makePanel(...tagNames: string[]) {
  const panel = document.createElement("div");
  for (const tag of tagNames) {
    const el = document.createElement(tag);
    panel.appendChild(el);
  }
  document.body.appendChild(panel);
  return panel;
}

function makeRef(el: HTMLDivElement) {
  const ref = { current: el };
  return ref as React.RefObject<HTMLDivElement>;
}

function tabKeyDown(shiftKey = false) {
  const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses first focusable element when enabled", () => {
    const panel = makePanel("button", "button");
    const [first] = Array.from(panel.querySelectorAll<HTMLElement>("button"));

    renderHook(() => useFocusTrap(makeRef(panel), true));

    expect(document.activeElement).toBe(first);
  });

  it("does not move focus when disabled", () => {
    const panel = makePanel("button", "button");
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    renderHook(() => useFocusTrap(makeRef(panel), false));

    expect(document.activeElement).toBe(outside);
  });

  it("wraps Tab from last element to first", () => {
    const panel = makePanel("button", "button");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button"));
    const [first, last] = focusable;

    renderHook(() => useFocusTrap(makeRef(panel), true));

    // Simulate focus at last element, then Tab
    last!.focus();
    const e = tabKeyDown(false);

    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from first element to last", () => {
    const panel = makePanel("button", "button");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button"));
    const [first, last] = focusable;

    renderHook(() => useFocusTrap(makeRef(panel), true));

    // Simulate focus at first element, then Shift+Tab
    first!.focus();
    const e = tabKeyDown(true);

    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("skips an element marked data-focus-trap-skip-initial when choosing initial focus", () => {
    const panel = makePanel("button", "button");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button"));
    const [close, other] = focusable;
    close!.setAttribute("data-focus-trap-skip-initial", "true");

    renderHook(() => useFocusTrap(makeRef(panel), true));

    expect(document.activeElement).toBe(other);
  });

  it("focuses the explicit initialFocus target when provided", () => {
    const panel = makePanel("button", "button", "input");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, input"));
    const target = focusable[2];
    const initialFocus = { current: target } as RefObject<HTMLElement>;

    renderHook(() => useFocusTrap(makeRef(panel), true, { initialFocus }));

    expect(document.activeElement).toBe(target);
  });

  it("does not intercept Tab when focus is not at boundary", () => {
    const panel = makePanel("button", "button", "button");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button"));
    const middle = focusable[1];

    renderHook(() => useFocusTrap(makeRef(panel), true));

    middle!.focus();
    const e = tabKeyDown(false);

    // No wrapping — Tab on middle should not be prevented
    expect(e.defaultPrevented).toBe(false);
  });

  it("cleans up listeners when disabled", () => {
    const panel = makePanel("button", "button");
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button"));
    const [, last] = focusable;

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFocusTrap(makeRef(panel), enabled),
      { initialProps: { enabled: true } }
    );

    // Disable the trap
    act(() => {
      rerender({ enabled: false });
    });

    // Tab from last should NOT be intercepted after disabling
    last!.focus();
    const e = tabKeyDown(false);
    expect(e.defaultPrevented).toBe(false);
  });
});
