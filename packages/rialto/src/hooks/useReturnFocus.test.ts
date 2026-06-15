import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useReturnFocus } from "./useReturnFocus";

describe("useReturnFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures document.activeElement when open transitions to true", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);

    const { rerender } = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: false },
    });

    act(() => {
      rerender({ open: true });
    });

    // Move focus away (simulating overlay taking focus)
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);

    // Close — should schedule restore
    act(() => {
      rerender({ open: false });
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(button);

    document.body.removeChild(button);
    document.body.removeChild(other);
  });

  it("restores focus to captured trigger when open transitions to false", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: false },
    });

    // Open — captures trigger
    act(() => {
      rerender({ open: true });
    });

    // Close — restores to trigger after rAF
    act(() => {
      rerender({ open: false });
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it("does not restore focus when trigger was not focusable (null activeElement)", () => {
    // Ensure no focused element
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }

    const { rerender } = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: false },
    });

    act(() => {
      rerender({ open: true });
    });
    act(() => {
      rerender({ open: false });
    });
    act(() => {
      vi.runAllTimers();
    });

    // Should not throw — focus stays on body
    expect(document.activeElement).toBe(document.body);
  });

  it("handles unmount while open without throwing", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender, unmount } = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: false },
    });

    act(() => {
      rerender({ open: true });
    });

    // Unmount while still open — should not throw
    expect(() => {
      act(() => {
        unmount();
      });
      act(() => {
        vi.runAllTimers();
      });
    }).not.toThrow();

    document.body.removeChild(trigger);
  });

  it("clears the captured trigger after restoring focus", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = renderHook(({ open }) => useReturnFocus(open), {
      initialProps: { open: false },
    });

    // First open/close cycle
    act(() => rerender({ open: true }));
    act(() => rerender({ open: false }));
    act(() => vi.runAllTimers());

    expect(document.activeElement).toBe(trigger);

    // Move focus away; open/close again without re-focusing trigger
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();

    act(() => rerender({ open: true }));
    act(() => rerender({ open: false }));
    act(() => vi.runAllTimers());

    // Second cycle: trigger was `other` this time
    expect(document.activeElement).toBe(other);

    document.body.removeChild(trigger);
    document.body.removeChild(other);
  });
});
