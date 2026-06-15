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
