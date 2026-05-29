import { describe, it, expect } from "vitest";
import {
  calculatePosition,
  estimateWaitMinutes,
  recalculatePositions,
} from "./waitlist-utils.js";

describe("calculatePosition", () => {
  it("returns 1 when no existing entries", () => {
    expect(calculatePosition(0)).toBe(1);
  });

  it("returns existingCount + 1", () => {
    expect(calculatePosition(3)).toBe(4);
    expect(calculatePosition(10)).toBe(11);
  });
});

describe("estimateWaitMinutes", () => {
  it("returns position * avgTurnTimeMinutes", () => {
    expect(estimateWaitMinutes(1, 30)).toBe(30);
    expect(estimateWaitMinutes(3, 20)).toBe(60);
    expect(estimateWaitMinutes(5, 15)).toBe(75);
  });

  it("returns 0 for position 0", () => {
    expect(estimateWaitMinutes(0, 30)).toBe(0);
  });
});

describe("recalculatePositions", () => {
  it("returns empty array for empty input", () => {
    expect(recalculatePositions([])).toEqual([]);
  });

  it("reassigns positions 1..N in order", () => {
    const entries = [
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ];
    expect(recalculatePositions(entries)).toEqual([
      { id: "a", position: 1 },
      { id: "b", position: 2 },
      { id: "c", position: 3 },
    ]);
  });

  it("reassigns positions after gap caused by removal", () => {
    const entries = [
      { id: "a", position: 1 },
      { id: "c", position: 3 },
      { id: "d", position: 4 },
    ];
    expect(recalculatePositions(entries)).toEqual([
      { id: "a", position: 1 },
      { id: "c", position: 2 },
      { id: "d", position: 3 },
    ]);
  });

  it("preserves order of entries", () => {
    const entries = [
      { id: "x", position: 5 },
      { id: "y", position: 2 },
    ];
    const result = recalculatePositions(entries);
    expect(result[0]).toEqual({ id: "x", position: 1 });
    expect(result[1]).toEqual({ id: "y", position: 2 });
  });
});
