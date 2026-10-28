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
} as const;

export type FurnitureTheme = "light" | "dark";

/**
 * Chair tones per theme. Light is `assets/chair.svg`; dark is
 * `assets/chair-dark.svg`, a lighter set so the frame keeps 3:1 against the
 * dark floor (`--rialto-surface-recessed`). Both are checked by the drift guard.
 */
export const SEAT_TONES: Record<FurnitureTheme, { frame: string; edge: string; cushion: string }> =
  {
    light: { frame: "#4a3f32", edge: "#3d3228", cushion: "#5c4f40" },
    dark: { frame: "#8a7a66", edge: "#6b5d4c", cushion: "#a08c72" },
  };

/**
 * Contact-shadow tones, following the `--rialto-shadow-*` colour family
 * (`rgb(26 25 24 / x)` light, `rgb(0 0 0 / x)` dark; shadows.css). Canvas cannot
 * read those composite tokens, so only the base colour is mirrored here, in
 * comma syntax, and the drift guard ties it back to shadows.css.
 */
export const SHADOW_TONES: Record<FurnitureTheme, string> = {
  light: "rgba(26,25,24,0.28)",
  dark: "rgba(0,0,0,0.6)",
};

/** Blur radius and drop of the soft contact shadow, in canvas units. */
export const CONTACT_SHADOW = { blur: 6, offsetY: 2 } as const;

/** Corner rounding per table shape, matching each source SVG's `rx`. */
export const TABLE_CORNER_RADIUS: Record<Exclude<TableShapeName, "circle">, number> = {
  rectangle: 6,
  square: 3,
};
