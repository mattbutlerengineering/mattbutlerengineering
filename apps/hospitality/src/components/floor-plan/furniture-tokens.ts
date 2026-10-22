/**
 * Material tones and node names shared by the floor-plan furniture art and its
 * callers.
 *
 * Kept out of `FurnitureArt.tsx` so that file exports components only (React
 * fast refresh) and so plain Node tests can read these without loading a
 * canvas renderer. Dimensions used by the art alone stay private to
 * `FurnitureArt.tsx`. `furniture-assets.test.ts` is the drift guard tying
 * these tones back to the hand-drawn SVGs in `./assets/`.
 */

import type { TableShapeName } from "./floor-plan-geometry.js";

/** Konva `name`s, so callers and tests can address a node in the art. */
export const TABLE_SURFACE_NAME = "table-surface";
export const TABLE_SHADOW_NAME = "table-shadow";
export const SEAT_NAME = "seat";

/**
 * Tones taken from the committed SVGs. Canvas cannot resolve
 * `var(--rialto-*)` (see apps/hospitality/CLAUDE.md), and these are furniture
 * material tones rather than theme colours, so they are literals by design.
 */
export const FURNITURE_PALETTE = {
  /**
   * The wood tone the art was drawn in. The table surface is filled with the
   * live status colour instead, so nothing renders in this tone — it is kept
   * as the documented design intent and checked by the asset drift guard.
   */
  wood: "#8B7355",
  grain: "#806A4E",
  highlight: "#9C8468",
  edge: "#6B5740",
  shadow: "rgba(0,0,0,0.12)",
  seatFrame: "#4a3f32",
  seatEdge: "#3d3228",
  seatCushion: "#5c4f40",
} as const;

/** Corner rounding per table shape, matching each source SVG's `rx`. */
export const TABLE_CORNER_RADIUS: Record<Exclude<TableShapeName, "circle">, number> = {
  rectangle: 6,
  square: 3,
};
