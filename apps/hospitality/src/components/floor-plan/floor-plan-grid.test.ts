import { describe, it, expect } from "vitest";
import { GRID_SIZE } from "./floor-plan-geometry.js";
import { floorPlanGridStyle, MIN_GRID_CELL_PX } from "./floor-plan-grid.js";

describe("floorPlanGridStyle", () => {
  it("draws no grid when the canvas is read-only", () => {
    expect(floorPlanGridStyle({ readOnly: true, scale: 1 })).toBeUndefined();
  });

  it("draws the grid in the editor, as a weak mix of the border token", () => {
    const style = floorPlanGridStyle({ readOnly: false, scale: 1 });
    expect(style?.backgroundImage).toContain("color-mix(in srgb, var(--rialto-border) 35%");
    expect(style?.backgroundSize).toBe(`${GRID_SIZE}px ${GRID_SIZE}px`);
  });

  it("sizes cells to the on-screen scale", () => {
    expect(floorPlanGridStyle({ readOnly: false, scale: 1.5 })?.backgroundSize).toBe(
      `${GRID_SIZE * 1.5}px ${GRID_SIZE * 1.5}px`
    );
  });

  it("hides the grid once a cell would be under 8px on screen", () => {
    const justUnder = (MIN_GRID_CELL_PX - 0.01) / GRID_SIZE;
    expect(floorPlanGridStyle({ readOnly: false, scale: justUnder })).toBeUndefined();
    expect(
      floorPlanGridStyle({ readOnly: false, scale: MIN_GRID_CELL_PX / GRID_SIZE })
    ).toBeDefined();
    expect(MIN_GRID_CELL_PX).toBe(8);
  });
});
