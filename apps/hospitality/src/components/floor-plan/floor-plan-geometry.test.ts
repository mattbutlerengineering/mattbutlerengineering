import { describe, it, expect } from "vitest";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  CANVAS_CENTER,
  SHAPE_DEFAULTS,
  snapToGrid,
} from "./floor-plan-geometry.js";

describe("floor-plan-geometry", () => {
  describe("constants", () => {
    it("exports CANVAS_WIDTH of 800", () => {
      expect(CANVAS_WIDTH).toBe(800);
    });

    it("exports CANVAS_HEIGHT of 600", () => {
      expect(CANVAS_HEIGHT).toBe(600);
    });

    it("exports GRID_SIZE of 20", () => {
      expect(GRID_SIZE).toBe(20);
    });

    it("derives CANVAS_CENTER from canvas dimensions", () => {
      expect(CANVAS_CENTER).toEqual({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
    });
  });

  describe("SHAPE_DEFAULTS", () => {
    it("rectangle is 80×60", () => {
      expect(SHAPE_DEFAULTS.rectangle).toEqual({ width: 80, height: 60 });
    });

    it("square is 60×60", () => {
      expect(SHAPE_DEFAULTS.square).toEqual({ width: 60, height: 60 });
    });

    it("circle is 70×70 (diameter of radius 35)", () => {
      expect(SHAPE_DEFAULTS.circle).toEqual({ width: 70, height: 70 });
    });
  });

  describe("snapToGrid", () => {
    it("returns zero for zero input", () => {
      expect(snapToGrid(0)).toBe(0);
    });

    it("snaps a value exactly on the grid back to itself", () => {
      expect(snapToGrid(40)).toBe(40);
      expect(snapToGrid(100)).toBe(100);
      expect(snapToGrid(200)).toBe(200);
    });

    it("rounds up when value is past the midpoint", () => {
      // midpoint of [40, 60] is 50 — value of 51 should round to 60
      expect(snapToGrid(51)).toBe(60);
    });

    it("rounds down when value is before the midpoint", () => {
      // midpoint of [40, 60] is 50 — value of 49 should round to 40
      expect(snapToGrid(49)).toBe(40);
    });

    it("rounds to nearest grid line at the midpoint (rounds up)", () => {
      // Math.round(50/20)*20 = Math.round(2.5)*20 = 3*20 = 60
      expect(snapToGrid(50)).toBe(60);
    });

    it("handles negative values", () => {
      // -21 / 20 = -1.05 → Math.round = -1 → -20
      expect(snapToGrid(-21)).toBe(-20);
      // -39 / 20 = -1.95 → Math.round = -2 → -40
      expect(snapToGrid(-39)).toBe(-40);
    });

    it("accepts a custom grid size", () => {
      expect(snapToGrid(37, 10)).toBe(40);
      expect(snapToGrid(34, 10)).toBe(30);
    });
  });
});
