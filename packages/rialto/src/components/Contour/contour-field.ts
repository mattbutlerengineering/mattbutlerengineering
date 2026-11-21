/**
 * Pure maths behind the Contour isolines — no DOM, no canvas.
 *
 * A smooth, evolving scalar field is sampled on a grid, and marching squares
 * traces the lines where it crosses fixed levels, like the topography on a
 * terroir map. Kept separate from the engine so it can be tested in isolation.
 */

import type { ValueNoise } from "../SilkFlow/silk-flow-field";

/** One straight piece of an isoline, in unit-cell coordinates `[0, 1]`. */
export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Isoline heights across the noise range, low to high. */
export const CONTOUR_LEVELS: readonly number[] = [0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78];

/** The one level stroked in the gold accent. */
export const GOLD_LEVEL_INDEX = 3;

/** Preferred grid cell size in CSS pixels. */
const BASE_CELL = 14;
/** Cap on cells per frame so a huge canvas stays cheap. */
const MAX_CELLS = 9000;

/** How tightly the noise is sampled in screen space (lattice ~ 1/scale px). */
const FIELD_SCALE = 0.0038;
/** Field evolution per frame. */
export const FIELD_TIME_STEP = 0.0022;
/** The second octave drifts against the first, so ridges keep reshaping. */
const DETAIL_SCALE = 2.3;
const DETAIL_WEIGHT = 0.3;

/** Reach of the pointer's hill, in CSS pixels (gaussian sigma). */
const HILL_SIGMA = 120;
/** Peak height the pointer adds under the cursor. */
const HILL_HEIGHT = 0.32;

export interface GridDimensions {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
}

/** Cells covering a canvas of the given CSS size; the cell grows to respect the cap. */
export function gridDimensions(width: number, height: number): GridDimensions {
  if (width <= 0 || height <= 0) return { cols: 0, rows: 0, cell: BASE_CELL };
  const cell = Math.max(BASE_CELL, Math.sqrt((width * height) / MAX_CELLS));
  return { cols: Math.ceil(width / cell), rows: Math.ceil(height / cell), cell };
}

/** Field height at a screen point at time `t`, in `[0, 1]`, before the pointer. */
export function fieldHeight(noise: ValueNoise, x: number, y: number, t: number): number {
  const base = noise(x * FIELD_SCALE + t, y * FIELD_SCALE - 0.6 * t);
  const detail = noise(
    x * FIELD_SCALE * DETAIL_SCALE - t * 1.3 + 31,
    y * FIELD_SCALE * DETAIL_SCALE + t + 17
  );
  return base * (1 - DETAIL_WEIGHT) + detail * DETAIL_WEIGHT;
}

/**
 * Height the pointer adds at an offset `(dx, dy)` from the cursor. Zero while the
 * pointer has never entered the canvas (its coordinates are infinite).
 */
export function pointerLift(dx: number, dy: number): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  return HILL_HEIGHT * Math.exp(-(dx * dx + dy * dy) / (2 * HILL_SIGMA * HILL_SIGMA));
}

/** Where `level` crosses between corner values `a` and `b`, as a fraction. */
function crossing(a: number, b: number, level: number): number {
  return b === a ? 0.5 : (level - a) / (b - a);
}

/**
 * Marching squares for one cell. Corners are top-left, top-right, bottom-right,
 * bottom-left. Ambiguous saddles are resolved by the cell's mean value.
 */
export function marchCell(
  tl: number,
  tr: number,
  br: number,
  bl: number,
  level: number
): Segment[] {
  const code =
    (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
  if (code === 0 || code === 15) return [];

  const top = { x: crossing(tl, tr, level), y: 0 };
  const right = { x: 1, y: crossing(tr, br, level) };
  const bottom = { x: crossing(bl, br, level), y: 1 };
  const left = { x: 0, y: crossing(tl, bl, level) };
  const line = (a: { x: number; y: number }, b: { x: number; y: number }): Segment => ({
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
  });

  switch (code) {
    case 1:
    case 14:
      return [line(left, bottom)];
    case 2:
    case 13:
      return [line(bottom, right)];
    case 3:
    case 12:
      return [line(left, right)];
    case 4:
    case 11:
      return [line(top, right)];
    case 6:
    case 9:
      return [line(top, bottom)];
    case 7:
    case 8:
      return [line(top, left)];
    default: {
      // Saddles: 5 = tr and bl high, 10 = tl and br high.
      const centreHigh = (tl + tr + br + bl) / 4 >= level;
      const isolatesLowTlBr = code === 5 ? centreHigh : !centreHigh;
      return isolatesLowTlBr
        ? [line(top, left), line(bottom, right)]
        : [line(top, right), line(left, bottom)];
    }
  }
}
