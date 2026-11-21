import { describe, it, expect } from "vitest";
import {
  CONTOUR_LEVELS,
  fieldHeight,
  GOLD_LEVEL_INDEX,
  gridDimensions,
  marchCell,
  pointerLift,
} from "./contour-field";

const flat = (x: number, y: number) => 0.5 + 0 * (x + y);

describe("marchCell", () => {
  it("draws nothing when every corner is below the level", () => {
    expect(marchCell(0.1, 0.2, 0.1, 0.2, 0.5)).toEqual([]);
  });

  it("draws nothing when every corner is above the level", () => {
    expect(marchCell(0.9, 0.8, 0.9, 0.8, 0.5)).toEqual([]);
  });

  it("cuts a single corner with one segment", () => {
    expect(marchCell(0.9, 0.1, 0.1, 0.1, 0.5)).toHaveLength(1);
  });

  it("interpolates the crossing along the edge", () => {
    // Top half high, bottom half low: the line crosses both side edges halfway down.
    const [segment] = marchCell(0.8, 0.8, 0.2, 0.2, 0.5);
    expect(segment?.y1).toBeCloseTo(0.5, 9);
    expect(segment?.y2).toBeCloseTo(0.5, 9);
  });

  it("keeps every endpoint inside the unit cell", () => {
    for (const corners of [
      [0.9, 0.1, 0.1, 0.1],
      [0.9, 0.9, 0.1, 0.1],
      [0.9, 0.1, 0.9, 0.1],
      [0.1, 0.9, 0.1, 0.9],
    ] as const) {
      for (const s of marchCell(corners[0], corners[1], corners[2], corners[3], 0.5)) {
        for (const v of [s.x1, s.y1, s.x2, s.y2]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("resolves a saddle into two segments", () => {
    expect(marchCell(0.9, 0.1, 0.9, 0.1, 0.5)).toHaveLength(2);
    expect(marchCell(0.1, 0.9, 0.1, 0.9, 0.5)).toHaveLength(2);
  });

  it("splits a saddle differently depending on the cell centre", () => {
    const high = marchCell(0.9, 0.1, 0.9, 0.1, 0.4);
    const low = marchCell(0.9, 0.1, 0.9, 0.1, 0.6);
    expect(high).not.toEqual(low);
  });
});

describe("CONTOUR_LEVELS", () => {
  it("has a single gold level inside the stack", () => {
    expect(GOLD_LEVEL_INDEX).toBeGreaterThanOrEqual(0);
    expect(GOLD_LEVEL_INDEX).toBeLessThan(CONTOUR_LEVELS.length);
  });

  it("rises strictly and stays inside the noise range", () => {
    for (let i = 1; i < CONTOUR_LEVELS.length; i++) {
      expect(CONTOUR_LEVELS[i] as number).toBeGreaterThan(CONTOUR_LEVELS[i - 1] as number);
    }
    expect(CONTOUR_LEVELS[0] as number).toBeGreaterThan(0);
    expect(CONTOUR_LEVELS[CONTOUR_LEVELS.length - 1] as number).toBeLessThan(1);
  });
});

describe("gridDimensions", () => {
  it("covers the canvas with whole cells", () => {
    const { cols, rows, cell } = gridDimensions(800, 600);
    expect(cols * cell).toBeGreaterThanOrEqual(800);
    expect(rows * cell).toBeGreaterThanOrEqual(600);
  });

  it("coarsens the grid on a very large canvas", () => {
    const small = gridDimensions(800, 600);
    const huge = gridDimensions(4000, 3000);
    expect(huge.cell).toBeGreaterThan(small.cell);
  });

  it("is empty for a collapsed container", () => {
    expect(gridDimensions(0, 0)).toMatchObject({ cols: 0, rows: 0 });
  });
});

describe("pointerLift", () => {
  it("peaks directly under the pointer", () => {
    expect(pointerLift(0, 0)).toBeGreaterThan(pointerLift(80, 0));
  });

  it("fades to nothing far away", () => {
    expect(pointerLift(2000, 2000)).toBeCloseTo(0, 6);
  });

  it("is zero while the pointer has never entered the canvas", () => {
    expect(pointerLift(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("fieldHeight", () => {
  it("evolves over time", () => {
    const noise = (x: number, y: number) => (Math.sin(x * 3) + Math.cos(y * 2) + 2) / 4;
    expect(fieldHeight(noise, 100, 100, 0)).not.toBeCloseTo(fieldHeight(noise, 100, 100, 5), 3);
  });

  it("stays inside the noise range", () => {
    const h = fieldHeight(flat, 10, 10, 1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });
});
