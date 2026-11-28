import { describe, it, expect } from "vitest";
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  diagramSize,
  edgeBetween,
  labelLines,
  nodeCenter,
} from "./diagram-geometry.js";

describe("diagram geometry", () => {
  it("centres a node in its grid cell", () => {
    expect(nodeCenter([0, 0])).toEqual({ x: CELL_WIDTH / 2, y: CELL_HEIGHT / 2 });
    expect(nodeCenter([2, 3])).toEqual({
      x: CELL_WIDTH / 2 + 2 * CELL_WIDTH,
      y: CELL_HEIGHT / 2 + 3 * CELL_HEIGHT,
    });
  });

  it("starts a horizontal edge at the box edge and ends it at the target's edge", () => {
    const { start, end } = edgeBetween([0, 0], [1, 0]);
    expect(start.x).toBe(CELL_WIDTH / 2 + NODE_WIDTH / 2);
    expect(end.x).toBe(CELL_WIDTH / 2 + CELL_WIDTH - NODE_WIDTH / 2);
    expect(start.y).toBe(end.y);
  });

  it("starts a vertical edge at the bottom of the box", () => {
    const { start, end } = edgeBetween([0, 0], [0, 1]);
    expect(start.y).toBe(CELL_HEIGHT / 2 + NODE_HEIGHT / 2);
    expect(end.y).toBe(CELL_HEIGHT / 2 + CELL_HEIGHT - NODE_HEIGHT / 2);
  });

  it.each([
    ["Regular hours", ["Regular hours"]],
    ["Booking widget", ["Booking", "widget"]],
    ["Horarios de temporada", ["Horarios de", "temporada"]],
    ["Cliente sin reservación", ["Cliente sin", "reservación"]],
    ["Établissement", ["Établissement"]],
  ])("wraps %s into %j", (label, lines) => {
    expect(labelLines(label)).toEqual(lines);
  });

  it("sizes the diagram to the cells in use", () => {
    expect(
      diagramSize([
        [0, 0],
        [3, 7],
      ])
    ).toEqual({ width: 4 * CELL_WIDTH, height: 8 * CELL_HEIGHT });
  });
});
