import { describe, expect, it } from "vitest";
import { nextTapeChartBarId, type TapeChartFocusBar } from "./tapeChartFocus";

const ROWS: TapeChartFocusBar[][] = [
  [
    { id: "a", startOffset: 0 },
    { id: "b", startOffset: 5 },
  ],
  [],
  [
    { id: "c", startOffset: 4 },
    { id: "d", startOffset: 1 },
  ],
];

describe("nextTapeChartBarId", () => {
  it("returns null when every row is empty", () => {
    expect(nextTapeChartBarId([[], []], null, "ArrowRight")).toBeNull();
  });

  it("enters on the first bar for Right and Down, and the last bar for Left and Up", () => {
    expect(nextTapeChartBarId(ROWS, null, "ArrowRight")).toBe("a");
    expect(nextTapeChartBarId(ROWS, null, "ArrowDown")).toBe("a");
    expect(nextTapeChartBarId(ROWS, null, "ArrowLeft")).toBe("d");
    expect(nextTapeChartBarId(ROWS, null, "ArrowUp")).toBe("d");
  });

  it("treats an unknown id the same as having no current bar", () => {
    expect(nextTapeChartBarId(ROWS, "missing", "ArrowLeft")).toBe("d");
  });

  it("walks a row with Left and Right and clamps at the ends", () => {
    expect(nextTapeChartBarId(ROWS, "a", "ArrowRight")).toBe("b");
    expect(nextTapeChartBarId(ROWS, "b", "ArrowRight")).toBe("b");
    expect(nextTapeChartBarId(ROWS, "b", "ArrowLeft")).toBe("a");
    expect(nextTapeChartBarId(ROWS, "a", "ArrowLeft")).toBe("a");
  });

  it("skips empty rows and picks the nearest bar, keeping the earlier bar on a tie", () => {
    // From offset 0, d (offset 1) is closer than c (offset 4).
    expect(nextTapeChartBarId(ROWS, "a", "ArrowDown")).toBe("d");
    // From offset 5, c (offset 4) is closer than d (offset 1).
    expect(nextTapeChartBarId(ROWS, "b", "ArrowDown")).toBe("c");
    // From offset 4, b (distance 1) beats a (distance 4).
    expect(nextTapeChartBarId(ROWS, "c", "ArrowUp")).toBe("b");
    // From offset 1, a (distance 1) beats b (distance 4).
    expect(nextTapeChartBarId(ROWS, "d", "ArrowUp")).toBe("a");
  });

  it("keeps the earlier bar when two neighbors are the same distance away", () => {
    const rows = [
      [
        { id: "left", startOffset: 3 },
        { id: "right", startOffset: 7 },
      ],
      [{ id: "mid", startOffset: 5 }],
    ];
    expect(nextTapeChartBarId(rows, "mid", "ArrowUp")).toBe("left");
  });

  it("clamps Up and Down at the first and last occupied rows", () => {
    expect(nextTapeChartBarId(ROWS, "a", "ArrowUp")).toBe("a");
    expect(nextTapeChartBarId(ROWS, "c", "ArrowDown")).toBe("c");
    expect(nextTapeChartBarId(ROWS, "d", "ArrowDown")).toBe("d");
  });
});
