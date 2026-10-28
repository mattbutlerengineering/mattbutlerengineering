import type { CSSProperties } from "react";
import { GRID_SIZE } from "./floor-plan-geometry.js";

/** Below this on-screen cell size the grid reads as noise rather than a guide. */
export const MIN_GRID_CELL_PX = 8;

// Drawn as two repeating-linear-gradients mixed from the rialto border token
// rather than a data-URI SVG: a data URI can't resolve `var(--rialto-*)`, which
// painted a light-theme-only grid in dark mode. A weak mix keeps the grid a
// guide that the tables and sections sit above, not a diagram of its own.
const GRID_LINE_COLOR = "color-mix(in srgb, var(--rialto-border) 35%, transparent)";
const GRID_PATTERN = [
  `repeating-linear-gradient(0deg, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent ${GRID_SIZE}px)`,
  `repeating-linear-gradient(90deg, ${GRID_LINE_COLOR} 0, ${GRID_LINE_COLOR} 1px, transparent 1px, transparent ${GRID_SIZE}px)`,
].join(", ");

/**
 * Background style for the editing grid, or `undefined` when there should be
 * none: a read-only canvas has nothing to align, and a cell under
 * `MIN_GRID_CELL_PX` on screen (a narrow viewport) is just dense hatching.
 */
export function floorPlanGridStyle({
  readOnly,
  scale,
}: {
  readOnly: boolean;
  scale: number;
}): Pick<CSSProperties, "backgroundImage" | "backgroundSize"> | undefined {
  const cell = GRID_SIZE * scale;
  if (readOnly || cell < MIN_GRID_CELL_PX) return undefined;
  return { backgroundImage: GRID_PATTERN, backgroundSize: `${cell}px ${cell}px` };
}
