/**
 * Canonical floor-plan geometry constants and pure utilities.
 *
 * Single source of truth for canvas dimensions, grid size, shape defaults,
 * and snap-to-grid math. All floor-plan components consume this module;
 * no inline geometry constants should exist elsewhere.
 *
 * Canonical shape sizes match the renderer (TableShape.tsx) so dialog-created
 * tables and rendered shapes always agree:
 *   rectangle 80×60  (the renderer's rect default; the dialog had 100×60 — wrong)
 *   square    60×60  (the renderer's square.size=60; the dialog had 70×70 — wrong)
 *   circle    70×70  (diameter of radius=35, unchanged in both — this one matched)
 */

import type { WallLayout } from "@mbe/types";

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const GRID_SIZE = 20;

export const CANVAS_CENTER = {
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT / 2,
} as const;

export const SHAPE_DEFAULTS = {
  rectangle: { width: 80, height: 60 },
  square: { width: 60, height: 60 },
  circle: { width: 70, height: 70 },
} as const;

/**
 * Snap a coordinate to the nearest grid line.
 *
 * Pure function — no React or Konva dependencies.
 *
 * @param value   - The coordinate to snap.
 * @param gridSize - Grid cell size (defaults to the canonical GRID_SIZE).
 * @returns The nearest multiple of gridSize.
 */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/* ── Walls & windows ───────────────────────────────────────── */

export const ENDPOINT_HIT_RADIUS = 12;
export const MIN_WALL_THICKNESS = 2;
export const MAX_WALL_THICKNESS = 40;
export const DEFAULT_WALL_THICKNESS = 8;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type WallEnd = 1 | 2;

const clampTo = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function snapPoint(p: Point, gridSize: number = GRID_SIZE): Point {
  return { x: snapToGrid(p.x, gridSize), y: snapToGrid(p.y, gridSize) };
}

/** The wall endpoint nearest `p` within ENDPOINT_HIT_RADIUS, or null. */
export function hitTestEndpoint(
  walls: readonly WallLayout[],
  p: Point
): { wallId: string; end: WallEnd } | null {
  let best: { wallId: string; end: WallEnd; d: number } | null = null;
  for (const w of walls) {
    const ends: [WallEnd, number, number][] = [
      [1, w.x1, w.y1],
      [2, w.x2, w.y2],
    ];
    for (const [end, x, y] of ends) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= ENDPOINT_HIT_RADIUS && (!best || d < best.d)) best = { wallId: w.id, end, d };
    }
  }
  return best && { wallId: best.wallId, end: best.end };
}

/** Move one endpoint to `p`, snapped to the grid and kept inside the canvas. */
export function moveWallEndpoint(
  wall: WallLayout,
  end: WallEnd,
  p: Point,
  gridSize: number = GRID_SIZE
): WallLayout {
  const snapped = snapPoint(p, gridSize);
  const x = clampTo(snapped.x, 0, CANVAS_WIDTH);
  const y = clampTo(snapped.y, 0, CANVAS_HEIGHT);
  return end === 1 ? { ...wall, x1: x, y1: y } : { ...wall, x2: x, y2: y };
}

export function clampThickness(value: number): number {
  return clampTo(value, MIN_WALL_THICKNESS, MAX_WALL_THICKNESS);
}

/** A new horizontal wall/window at the canvas centre, with an id not already in use. */
export function createWall(kind: "wall" | "window", existing: readonly WallLayout[]): WallLayout {
  const ids = new Set(existing.map((w) => w.id));
  let n = existing.length + 1;
  while (ids.has(`${kind}-${n}`)) n += 1;
  const y = snapToGrid(CANVAS_CENTER.y);
  return {
    id: `${kind}-${n}`,
    x1: snapToGrid(CANVAS_CENTER.x - 100),
    y1: y,
    x2: snapToGrid(CANVAS_CENTER.x + 100),
    y2: y,
    thickness: DEFAULT_WALL_THICKNESS,
    wallType: kind,
  };
}
