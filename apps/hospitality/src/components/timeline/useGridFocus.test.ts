import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGridFocus } from "./useGridFocus.js";

describe("useGridFocus", () => {
  describe("initial state", () => {
    it("starts at cell (0, 0)", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });

    it("honors an initial coordinate", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 1, col: 2 } })
      );
      expect(result.current.active).toEqual({ row: 1, col: 2 });
    });
  });

  describe("moveRight / moveLeft", () => {
    it("moves right within bounds", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      act(() => result.current.moveRight());
      expect(result.current.active).toEqual({ row: 0, col: 1 });
    });

    it("clamps at the last column", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 0, col: 3 } })
      );
      act(() => result.current.moveRight());
      expect(result.current.active).toEqual({ row: 0, col: 3 });
    });

    it("moves left within bounds", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 0, col: 2 } })
      );
      act(() => result.current.moveLeft());
      expect(result.current.active).toEqual({ row: 0, col: 1 });
    });

    it("clamps at the first column", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      act(() => result.current.moveLeft());
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });
  });

  describe("moveDown / moveUp", () => {
    it("moves down within bounds", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      act(() => result.current.moveDown());
      expect(result.current.active).toEqual({ row: 1, col: 0 });
    });

    it("clamps at the last row", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 2, col: 0 } })
      );
      act(() => result.current.moveDown());
      expect(result.current.active).toEqual({ row: 2, col: 0 });
    });

    it("moves up within bounds", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 1, col: 0 } })
      );
      act(() => result.current.moveUp());
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });

    it("clamps at the first row", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      act(() => result.current.moveUp());
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });
  });

  describe("handleKeyDown", () => {
    it("moves on ArrowRight and prevents default", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      const preventDefault = vi.fn();
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowRight",
          preventDefault,
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.active).toEqual({ row: 0, col: 1 });
      expect(preventDefault).toHaveBeenCalled();
    });

    it("moves on ArrowLeft, ArrowUp, ArrowDown", () => {
      const { result } = renderHook(() =>
        useGridFocus({ rowCount: 3, colCount: 4, initial: { row: 1, col: 1 } })
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowDown",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.active).toEqual({ row: 2, col: 1 });
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowUp",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowUp",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.active).toEqual({ row: 0, col: 1 });
      act(() =>
        result.current.handleKeyDown({
          key: "ArrowLeft",
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });

    it("ignores non-arrow keys", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      const preventDefault = vi.fn();
      act(() =>
        result.current.handleKeyDown({
          key: "Enter",
          preventDefault,
        } as unknown as React.KeyboardEvent)
      );
      expect(result.current.active).toEqual({ row: 0, col: 0 });
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  describe("empty grid", () => {
    it("does not move when rowCount or colCount is 0", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 0, colCount: 0 }));
      act(() => result.current.moveRight());
      act(() => result.current.moveDown());
      expect(result.current.active).toEqual({ row: 0, col: 0 });
    });
  });

  describe("setActive", () => {
    it("directly sets the active cell", () => {
      const { result } = renderHook(() => useGridFocus({ rowCount: 3, colCount: 4 }));
      act(() => result.current.setActive({ row: 2, col: 3 }));
      expect(result.current.active).toEqual({ row: 2, col: 3 });
    });
  });
});
