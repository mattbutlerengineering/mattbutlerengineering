import { useState, useCallback } from "react";

export interface GridCoordinate {
  row: number;
  col: number;
}

export interface UseGridFocusParams {
  rowCount: number;
  colCount: number;
  initial?: GridCoordinate;
}

export interface UseGridFocusResult {
  active: GridCoordinate;
  setActive: (coord: GridCoordinate) => void;
  moveUp: () => void;
  moveDown: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

function clamp(value: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(value, count - 1));
}

export function useGridFocus({
  rowCount,
  colCount,
  initial = { row: 0, col: 0 },
}: UseGridFocusParams): UseGridFocusResult {
  const [active, setActive] = useState<GridCoordinate>(initial);

  const move = useCallback(
    (deltaRow: number, deltaCol: number) => {
      if (rowCount <= 0 || colCount <= 0) return;
      setActive((current) => ({
        row: clamp(current.row + deltaRow, rowCount),
        col: clamp(current.col + deltaCol, colCount),
      }));
    },
    [rowCount, colCount]
  );

  const moveUp = useCallback(() => move(-1, 0), [move]);
  const moveDown = useCallback(() => move(1, 0), [move]);
  const moveLeft = useCallback(() => move(0, -1), [move]);
  const moveRight = useCallback(() => move(0, 1), [move]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveUp();
          break;
        case "ArrowDown":
          e.preventDefault();
          moveDown();
          break;
        case "ArrowLeft":
          e.preventDefault();
          moveLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          moveRight();
          break;
      }
    },
    [moveUp, moveDown, moveLeft, moveRight]
  );

  return { active, setActive, moveUp, moveDown, moveLeft, moveRight, handleKeyDown };
}
