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

/** A table's centre and footprint, as the canvas stores it. */
export interface PlacedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a new table of `size` goes on a plan with the given `canvas`: the canvas
 * centre, or the nearest free grid cell when that would overlap an existing table.
 * Nearest-first ring search; falls back to the centre if the canvas is full.
 */
export function placeNewTable(
  canvas: { width: number; height: number },
  size: { width: number; height: number },
  existing: readonly PlacedRect[]
): { x: number; y: number } {
  const centre = { x: canvas.width / 2, y: canvas.height / 2 };
  const free = (x: number, y: number) =>
    existing.every(
      (t) =>
        Math.abs(x - t.x) >= (size.width + t.width) / 2 ||
        Math.abs(y - t.y) >= (size.height + t.height) / 2
    );
  const inside = (x: number, y: number) =>
    x >= size.width / 2 &&
    x <= canvas.width - size.width / 2 &&
    y >= size.height / 2 &&
    y <= canvas.height - size.height / 2;
  if (free(centre.x, centre.y)) return centre;

  const cx = snapToGrid(centre.x);
  const cy = snapToGrid(centre.y);
  const maxRing = Math.ceil(Math.max(canvas.width, canvas.height) / GRID_SIZE);
  for (let ring = 1; ring <= maxRing; ring++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx * GRID_SIZE;
        const y = cy + dy * GRID_SIZE;
        const d = dx * dx + dy * dy;
        if (inside(x, y) && free(x, y) && (!best || d < best.d)) best = { x, y, d };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return centre;
}

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
const DEFAULT_WALL_THICKNESS = 8;

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

/**
 * Move one endpoint to `p`, snapped to the grid and kept inside the canvas.
 *
 * `canvas` is the **plan's own** size. It defaults to 800x600 for a plan whose
 * `layoutJson` carries no dimensions, but passing the real one matters: room
 * templates (#7256) create plans up to 2000x1200, and clamping those to the
 * default would silently drag the right or bottom perimeter wall inwards —
 * dragging a Grand plan's right edge would snap it from x=2000 to x=800, and
 * `FloorPlanEditorPage` would then persist that.
 */
export function moveWallEndpoint(
  wall: WallLayout,
  end: WallEnd,
  p: Point,
  gridSize: number = GRID_SIZE,
  canvas: { width: number; height: number } = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
): WallLayout {
  const snapped = snapPoint(p, gridSize);
  const x = clampTo(snapped.x, 0, canvas.width);
  const y = clampTo(snapped.y, 0, canvas.height);
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

/* ── Seat placement ──────────────────────────────────────────────── */

export type TableShapeName = keyof typeof SHAPE_DEFAULTS;

/** Clearance between the table edge and the near edge of a seat, in canvas units. */
export const SEAT_GAP = 7;

/**
 * Ceiling on rendered seats. A table's `capacity` is staff-entered data, so a
 * typo ("40" for "4") must not spray unreadable art across the floor plan.
 */
export const MAX_RENDERED_SEATS = 20;

/**
 * Where one seat sits relative to its table's centre, in the table's own
 * (unrotated) coordinate space — the same space the Konva table group uses.
 *
 * `rotation` is degrees clockwise, and assumes seat art drawn facing "up"
 * (towards -y) at rotation 0. A seat below the table therefore has rotation 0
 * and a seat above it has rotation 180, so every seat faces the table.
 */
export interface SeatPlacement {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export interface SeatPlacementInput {
  readonly shape: TableShapeName;
  readonly capacity: number;
  /** Clearance from the table edge; defaults to the canonical SEAT_GAP. */
  readonly gap?: number;
}

/** The sides of a rectangular table, in the order seats are assigned to them. */
const RECTANGLE_SIDES = ["top", "bottom", "left", "right"] as const;

type RectangleSide = (typeof RECTANGLE_SIDES)[number];

/** Degrees of rotation that make seat art on each side face the table. */
const SIDE_ROTATION: Record<RectangleSide, number> = {
  top: 180,
  bottom: 0,
  left: 90,
  right: 270,
};

/** Usable seat count: a non-finite, negative or implausible capacity yields none. */
function usableSeatCount(capacity: number): number {
  if (!Number.isFinite(capacity) || capacity < 1) return 0;
  return Math.min(MAX_RENDERED_SEATS, Math.floor(capacity));
}

/**
 * Round a canvas coordinate to sub-pixel precision. Trigonometry leaves float
 * noise (cos(-90°) is 6.1e-17, not 0), which is invisible on screen but makes
 * placements awkward to assert on and to diff.
 */
function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Evenly spaced offsets along a side of `length`, centred on 0. */
function evenOffsets(count: number, length: number): readonly number[] {
  return Array.from({ length: count }, (_, i) =>
    roundCoord((length * (i + 1)) / (count + 1) - length / 2)
  );
}

function circleSeats(count: number, radius: number): readonly SeatPlacement[] {
  return Array.from({ length: count }, (_, i) => {
    const degrees = -90 + (360 * i) / count;
    const radians = (degrees * Math.PI) / 180;
    return {
      x: roundCoord(radius * Math.cos(radians)),
      y: roundCoord(radius * Math.sin(radians)),
      rotation: (degrees + 270) % 360,
    };
  });
}

function rectangleSeats(
  count: number,
  width: number,
  height: number,
  gap: number
): readonly SeatPlacement[] {
  // Round-robin across the four sides so a 2-top faces across the table, a
  // 4-top takes one per side, and larger parties double up evenly.
  const perSide = RECTANGLE_SIDES.map(
    (_, sideIndex) => Math.floor(count / 4) + (count % 4 > sideIndex ? 1 : 0)
  );

  return RECTANGLE_SIDES.flatMap((side, sideIndex) => {
    const sideCount = perSide[sideIndex] ?? 0;
    const horizontal = side === "top" || side === "bottom";
    const offsets = evenOffsets(sideCount, horizontal ? width : height);
    const distance = (horizontal ? height : width) / 2 + gap;
    const sign = side === "top" || side === "left" ? -1 : 1;

    return offsets.map((offset) => ({
      x: horizontal ? offset : sign * distance,
      y: horizontal ? sign * distance : offset,
      rotation: SIDE_ROTATION[side],
    }));
  });
}

/**
 * Place `capacity` seats around a table of the given shape.
 *
 * Pure function — no React or Konva dependencies, no mutation of `input`, and
 * a fresh array on every call.
 */
export function seatPlacements(input: SeatPlacementInput): readonly SeatPlacement[] {
  const gap = input.gap ?? SEAT_GAP;
  const count = usableSeatCount(input.capacity);
  if (count === 0) return [];

  const { width, height } = SHAPE_DEFAULTS[input.shape];
  return input.shape === "circle"
    ? circleSeats(count, width / 2 + gap)
    : rectangleSeats(count, width, height, gap);
}
