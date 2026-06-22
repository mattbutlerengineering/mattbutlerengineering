import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimelineKeyboard, type TimelineReservationEntry } from "./useTimelineKeyboard.js";

function makeEntry(id: string, tableIndex: number): TimelineReservationEntry {
  return { reservationId: id, tableIndex };
}

describe("useTimelineKeyboard", () => {
  const entries: TimelineReservationEntry[] = [
    makeEntry("res-1", 0),
    makeEntry("res-2", 0),
    makeEntry("res-3", 1),
  ];

  describe("initial state", () => {
    it("starts with no focused reservation", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      expect(result.current.focusedId).toBeNull();
    });
  });

  describe("ArrowRight", () => {
    it("focuses first entry when nothing is focused", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
    });

    it("moves focus to next entry", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-2");
    });

    it("clamps at last entry", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      // jump to last via ArrowLeft
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-3");
    });
  });

  describe("ArrowLeft", () => {
    it("focuses last entry when nothing is focused", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-3");
    });

    it("moves focus to previous entry", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
    });

    it("clamps at first entry", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
    });
  });

  describe("ArrowDown", () => {
    it("moves focus to first entry of next table row", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-3");
    });

    it("does nothing when already on last table row", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      // focus res-3 (tableIndex 1, the last row)
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-3");
    });
  });

  describe("ArrowUp", () => {
    it("moves focus to last entry of previous table row", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      // focus res-3 on tableIndex 1
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowUp",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      // should go to last entry of tableIndex 0 = res-2
      expect(result.current.focusedId).toBe("res-2");
    });

    it("does nothing when already on first table row", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowUp",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
    });
  });

  describe("Enter / Space", () => {
    it("calls onActivate with focused reservationId on Enter", () => {
      const onActivate = vi.fn();
      const { result } = renderHook(() => useTimelineKeyboard({ entries, onActivate }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "Enter",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(onActivate).toHaveBeenCalledWith("res-1");
    });

    it("calls onActivate with focused reservationId on Space", () => {
      const onActivate = vi.fn();
      const { result } = renderHook(() => useTimelineKeyboard({ entries, onActivate }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: " ",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(onActivate).toHaveBeenCalledWith("res-1");
    });

    it("does nothing on Enter when nothing is focused", () => {
      const onActivate = vi.fn();
      const { result } = renderHook(() => useTimelineKeyboard({ entries, onActivate }));
      act(() =>
        result.current.handleKeyDown({
          key: "Enter",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(onActivate).not.toHaveBeenCalled();
    });
  });

  describe("Escape", () => {
    it("clears focused reservation", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBe("res-1");
      act(() =>
        result.current.handleKeyDown({
          key: "Escape",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBeNull();
    });
  });

  describe("empty entries", () => {
    it("does nothing on ArrowRight with empty entries", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries: [] }));
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.focusedId).toBeNull();
    });
  });

  describe("setFocusedId", () => {
    it("can directly set focused id", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() => result.current.setFocusedId("res-2"));
      expect(result.current.focusedId).toBe("res-2");
    });

    it("can clear focused id", () => {
      const { result } = renderHook(() => useTimelineKeyboard({ entries }));
      act(() => result.current.setFocusedId("res-1"));
      act(() => result.current.setFocusedId(null));
      expect(result.current.focusedId).toBeNull();
    });
  });
});
