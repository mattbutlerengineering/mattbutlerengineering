import { describe, expect, it } from "vitest";
import type { WallLayout } from "@mbe/types";
import {
  ENDPOINT_HIT_RADIUS,
  MAX_WALL_THICKNESS,
  MIN_WALL_THICKNESS,
  clampThickness,
  createWall,
  hitTestEndpoint,
  moveWallEndpoint,
  snapPoint,
} from "./floor-plan-geometry.js";

const wall = (o: Partial<WallLayout> = {}): WallLayout => ({
  id: "w1",
  x1: 100,
  y1: 100,
  x2: 300,
  y2: 100,
  thickness: 8,
  ...o,
});

describe("snapPoint", () => {
  it("snaps both axes to the grid", () => {
    expect(snapPoint({ x: 109, y: 131 }, 20)).toEqual({ x: 100, y: 140 });
  });
});

describe("hitTestEndpoint", () => {
  it("finds the nearest endpoint within the radius", () => {
    expect(hitTestEndpoint([wall()], { x: 104, y: 98 })).toEqual({ wallId: "w1", end: 1 });
    expect(hitTestEndpoint([wall()], { x: 297, y: 103 })).toEqual({ wallId: "w1", end: 2 });
  });
  it("returns null outside the radius", () => {
    expect(hitTestEndpoint([wall()], { x: 100 + ENDPOINT_HIT_RADIUS + 1, y: 100 })).toBeNull();
  });
  it("prefers the closest of overlapping endpoints", () => {
    const a = wall({ id: "a", x2: 130 });
    const b = wall({ id: "b", x1: 112, y1: 100, x2: 400 });
    expect(hitTestEndpoint([a, b], { x: 110, y: 100 })).toEqual({ wallId: "b", end: 1 });
  });
});

describe("moveWallEndpoint", () => {
  it("moves one endpoint, snapped and clamped to the canvas, leaving the other", () => {
    const moved = moveWallEndpoint(wall(), 2, { x: 351, y: -30 }, 20);
    expect(moved).toMatchObject({ x1: 100, y1: 100, x2: 360, y2: 0 });
  });
  it("does not mutate its input", () => {
    const w = wall();
    moveWallEndpoint(w, 1, { x: 0, y: 0 }, 20);
    expect(w).toEqual(wall());
  });
});

describe("clampThickness", () => {
  it("keeps thickness inside the allowed range", () => {
    expect(clampThickness(0)).toBe(MIN_WALL_THICKNESS);
    expect(clampThickness(500)).toBe(MAX_WALL_THICKNESS);
    expect(clampThickness(10)).toBe(10);
  });
});

describe("createWall", () => {
  it("creates a grid-aligned wall or window with a unique id", () => {
    const a = createWall("wall", []);
    const b = createWall("window", [a]);
    expect(a.wallType ?? "wall").toBe("wall");
    expect(b.wallType).toBe("window");
    expect(a.id).not.toBe(b.id);
    expect(a.x1 % 20).toBe(0);
  });
});
