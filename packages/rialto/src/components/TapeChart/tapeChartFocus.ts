/** One reservation bar in reading order, for roving keyboard focus. */
export interface TapeChartFocusBar {
  id: string;
  /** Days from the chart start. Up and Down land on the nearest bar in the adjacent row. */
  startOffset: number;
}

export type TapeChartArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Next bar for arrow-key focus on a tape chart.
 *
 * Left and Right walk the bars of the current room, in start order, and stop
 * at the ends of that room. Up and Down move to the previous or next room that
 * actually has a bar (empty rooms are skipped) and pick the bar whose stay
 * starts nearest the current one. Equal distances keep the earlier bar.
 *
 * With no current bar, Right and Down enter on the first bar and Left and Up
 * enter on the last. Returns null only when the chart has no bars.
 */
export function nextTapeChartBarId(
  rows: readonly (readonly TapeChartFocusBar[])[],
  currentId: string | null,
  key: TapeChartArrowKey
): string | null {
  const occupied = rows.filter((row) => row.length > 0);
  if (occupied.length === 0) return null;

  const first = occupied[0]![0]!;
  const lastRow = occupied[occupied.length - 1]!;
  const last = lastRow[lastRow.length - 1]!;

  let rowIndex = -1;
  let indexInRow = -1;
  if (currentId != null) {
    for (let r = 0; r < occupied.length; r++) {
      const index = occupied[r]!.findIndex((bar) => bar.id === currentId);
      if (index !== -1) {
        rowIndex = r;
        indexInRow = index;
        break;
      }
    }
  }

  if (rowIndex === -1) {
    return key === "ArrowLeft" || key === "ArrowUp" ? last.id : first.id;
  }

  const row = occupied[rowIndex]!;
  const current = row[indexInRow]!;

  switch (key) {
    case "ArrowRight":
      return (row[indexInRow + 1] ?? current).id;
    case "ArrowLeft":
      return (row[indexInRow - 1] ?? current).id;
    case "ArrowDown": {
      const next = occupied[rowIndex + 1];
      return next ? closestBar(next, current.startOffset).id : current.id;
    }
    case "ArrowUp": {
      const prev = occupied[rowIndex - 1];
      return prev ? closestBar(prev, current.startOffset).id : current.id;
    }
    default:
      return current.id;
  }
}

/** Earlier bars win a distance tie, which matches their left-to-right order. */
function closestBar(bars: readonly TapeChartFocusBar[], startOffset: number): TapeChartFocusBar {
  let best = bars[0]!;
  let bestDistance = Math.abs(best.startOffset - startOffset);
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i]!;
    const distance = Math.abs(bar.startOffset - startOffset);
    if (distance < bestDistance) {
      best = bar;
      bestDistance = distance;
    }
  }
  return best;
}
