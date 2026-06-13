import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCombobox, type ComboboxItem } from "./useCombobox";

const items: ComboboxItem[] = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "mx", label: "Mexico" },
];

const withDisabled: ComboboxItem[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta", disabled: true },
  { value: "c", label: "Gamma" },
];

/** Build a KeyboardEvent-like object the hook's handler can consume. */
function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...mods,
  } as unknown as React.KeyboardEvent;
}

describe("useCombobox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("open/close", () => {
    it("starts closed with no focused item", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      expect(result.current.open).toBe(false);
      expect(result.current.focusedIndex).toBe(-1);
    });

    it("openWithFocus opens and focuses index 0 when no value", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      expect(result.current.open).toBe(true);
      expect(result.current.focusedIndex).toBe(0);
    });

    it("openWithFocus focuses the selected value's index", () => {
      const { result } = renderHook(() => useCombobox({ items, value: "mx" }));
      act(() => result.current.openWithFocus());
      expect(result.current.focusedIndex).toBe(2);
    });

    it("close closes the menu", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.close());
      expect(result.current.open).toBe(false);
    });

    it("toggle flips open state", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.toggle());
      expect(result.current.open).toBe(true);
      act(() => result.current.toggle());
      expect(result.current.open).toBe(false);
    });
  });

  describe("arrow navigation", () => {
    it("ArrowDown moves focus down", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      expect(result.current.focusedIndex).toBe(1);
    });

    it("ArrowUp moves focus up", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      act(() => result.current.handleKeyDown(keyEvent("ArrowUp")));
      expect(result.current.focusedIndex).toBe(0);
    });

    it("ArrowDown does not move past the last item", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      expect(result.current.focusedIndex).toBe(2);
    });

    it("ArrowDown skips disabled items", () => {
      const { result } = renderHook(() => useCombobox({ items: withDisabled }));
      act(() => result.current.openWithFocus()); // index 0
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      // index 1 is disabled, so should land on 2
      expect(result.current.focusedIndex).toBe(2);
    });

    it("ArrowUp skips disabled items", () => {
      const { result } = renderHook(() => useCombobox({ items: withDisabled }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("End"))); // index 2
      act(() => result.current.handleKeyDown(keyEvent("ArrowUp")));
      // index 1 disabled, so should land on 0
      expect(result.current.focusedIndex).toBe(0);
    });

    it("opens on ArrowDown when closed", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.handleKeyDown(keyEvent("ArrowDown")));
      expect(result.current.open).toBe(true);
    });
  });

  describe("Home/End navigation", () => {
    it("Home focuses the first enabled item", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("End")));
      act(() => result.current.handleKeyDown(keyEvent("Home")));
      expect(result.current.focusedIndex).toBe(0);
    });

    it("End focuses the last enabled item", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("End")));
      expect(result.current.focusedIndex).toBe(2);
    });

    it("End skips a trailing disabled item", () => {
      const trailing: ComboboxItem[] = [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma", disabled: true },
      ];
      const { result } = renderHook(() => useCombobox({ items: trailing }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("End")));
      expect(result.current.focusedIndex).toBe(1);
    });
  });

  describe("type-ahead", () => {
    it("focuses a matching item when open", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("c")));
      expect(result.current.focusedIndex).toBe(1); // Canada
    });

    it("matches multi-character queries before the timeout resets", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("m")));
      act(() => result.current.handleKeyDown(keyEvent("e")));
      expect(result.current.focusedIndex).toBe(2); // Mexico ("me")
    });

    it("resets the query after the timeout", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("m"))); // Mexico
      act(() => vi.advanceTimersByTime(600)); // query resets
      act(() => result.current.handleKeyDown(keyEvent("c"))); // Canada, not "mc"
      expect(result.current.focusedIndex).toBe(1);
    });

    it("selects directly when closed", () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useCombobox({ items, onSelect }));
      act(() => result.current.handleKeyDown(keyEvent("c")));
      expect(onSelect).toHaveBeenCalledWith("ca");
    });
  });

  describe("selection", () => {
    it("Enter selects the focused item", () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useCombobox({ items, onSelect }));
      act(() => result.current.openWithFocus()); // index 0
      act(() => result.current.handleKeyDown(keyEvent("Enter")));
      expect(onSelect).toHaveBeenCalledWith("us");
    });

    it("Enter does not select a disabled item", () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useCombobox({ items: withDisabled, onSelect }));
      act(() => result.current.openWithFocus());
      // force focus onto disabled index 1
      act(() => result.current.setFocusedIndex(1));
      act(() => result.current.handleKeyDown(keyEvent("Enter")));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("select() invokes onSelect and closes", () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useCombobox({ items, onSelect }));
      act(() => result.current.openWithFocus());
      act(() => result.current.select("ca"));
      expect(onSelect).toHaveBeenCalledWith("ca");
      expect(result.current.open).toBe(false);
    });
  });

  describe("Escape and Tab", () => {
    it("Escape closes the menu", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("Escape")));
      expect(result.current.open).toBe(false);
    });

    it("Tab closes the menu", () => {
      const { result } = renderHook(() => useCombobox({ items }));
      act(() => result.current.openWithFocus());
      act(() => result.current.handleKeyDown(keyEvent("Tab")));
      expect(result.current.open).toBe(false);
    });
  });

  describe("click-outside", () => {
    it("closes when a mousedown lands outside the container", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const { result } = renderHook(() =>
        useCombobox({ items, containerRef: { current: container } })
      );
      act(() => result.current.openWithFocus());
      expect(result.current.open).toBe(true);

      const outside = document.createElement("div");
      document.body.appendChild(outside);
      act(() => {
        outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(result.current.open).toBe(false);

      document.body.removeChild(container);
      document.body.removeChild(outside);
    });

    it("stays open when mousedown lands inside the container", () => {
      const container = document.createElement("div");
      const inner = document.createElement("button");
      container.appendChild(inner);
      document.body.appendChild(container);
      const { result } = renderHook(() =>
        useCombobox({ items, containerRef: { current: container } })
      );
      act(() => result.current.openWithFocus());
      act(() => {
        inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      expect(result.current.open).toBe(true);

      document.body.removeChild(container);
    });
  });
});
