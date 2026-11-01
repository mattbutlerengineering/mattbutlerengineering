import { useRef } from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useFocusTrap } from "./useFocusTrap";
import { useReturnFocus } from "./useReturnFocus";

/** An open modal: a panel in the document with a live focus trap. */
function trapPanel(panel: HTMLDivElement) {
  return renderHook(() => {
    const ref = useRef<HTMLDivElement | null>(panel);
    useFocusTrap(ref, true);
  });
}

describe("useReturnFocus under another open overlay", () => {
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  let inPanel: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    trigger = document.body.appendChild(document.createElement("button"));
    panel = document.body.appendChild(document.createElement("div"));
    inPanel = panel.appendChild(document.createElement("button"));
    trigger.focus();
  });

  afterEach(() => {
    vi.useRealTimers();
    trigger.remove();
    panel.remove();
  });

  const openThenClose = () => {
    const overlay = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: true },
    });
    return () => {
      act(() => overlay.rerender({ open: false }));
      act(() => {
        vi.runAllTimers();
      });
    };
  };

  it("does not pull focus behind a trap that opened on top in the meantime", () => {
    const close = openThenClose();
    const trap = trapPanel(panel);
    expect(document.activeElement).toBe(inPanel);

    close();

    expect(document.activeElement).toBe(inPanel);
    trap.unmount();
  });

  it("does not pull focus behind a surface that mounted as the overlay closed", () => {
    const close = openThenClose();

    const overlayClosing = trapPanel(panel);
    close();

    expect(document.activeElement).toBe(inPanel);
    overlayClosing.unmount();
  });

  it("restores to a trigger inside the trap on top, a dialog closing over its drawer", () => {
    const inside = panel.appendChild(document.createElement("button"));
    const trap = trapPanel(panel);
    inside.focus();
    const close = openThenClose();
    inPanel.focus();

    close();

    expect(document.activeElement).toBe(inside);
    trap.unmount();
  });

  it("restores as before once no trap is open", () => {
    const close = openThenClose();
    inPanel.focus();

    close();

    expect(document.activeElement).toBe(trigger);
  });
});
