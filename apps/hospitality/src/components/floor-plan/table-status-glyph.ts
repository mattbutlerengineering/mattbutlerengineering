/**
 * Non-colour status cue for floor-plan tables. Colour alone cannot tell
 * `reserved-soon` from `needs-bussing` (1.5:1 in light, 1.02:1 in dark), so each
 * status also carries a glyph: check, clock, lines, filled dot, and a cross for
 * an inactive table. The same path data draws the canvas glyph (Konva `Path`)
 * and the legend swatch (SVG `path`), so the two cannot drift apart.
 */

import { TABLE_STATUS_COLOR_TOKEN, type TableDisplayStatus } from "./table-status.js";

export type StatusGlyphKey = TableDisplayStatus | "inactive";

export const STATUS_GLYPH_KEYS: readonly StatusGlyphKey[] = [
  "available",
  "reserved-soon",
  "seated",
  "needs-bussing",
  "inactive",
];

/** Glyph paths are drawn in a square of this many units. */
export const GLYPH_VIEWBOX = 10;
/** Stroke width, in glyph units, for the outlined glyphs. */
export const GLYPH_STROKE_WIDTH = 1.4;

export interface StatusGlyph {
  /** SVG path data inside a `GLYPH_VIEWBOX` square. */
  readonly path: string;
  /** Filled glyphs are solid; the rest are outlines. */
  readonly filled: boolean;
}

export const STATUS_GLYPHS: Readonly<Record<StatusGlyphKey, StatusGlyph>> = {
  available: { path: "M1.5 5.5 L4 8 L8.5 2", filled: false },
  "reserved-soon": {
    path: "M5 0.9 A4.1 4.1 0 1 1 4.99 0.9 M5 2.8 V5.2 L6.8 6.2",
    filled: false,
  },
  "needs-bussing": { path: "M1.5 2.5 H8.5 M1.5 5 H8.5 M1.5 7.5 H8.5", filled: false },
  seated: { path: "M5 1 A4 4 0 1 1 4.99 1 Z", filled: true },
  inactive: { path: "M2 2 L8 8 M8 2 L2 8", filled: false },
};

/** i18n key of each key's name, shared by the legend and the overlay buttons' accessible names. */
export const STATUS_LABEL_KEY = {
  available: "floorPlan.statusLegend.available",
  "reserved-soon": "floorPlan.statusLegend.reservedSoon",
  seated: "floorPlan.statusLegend.seated",
  "needs-bussing": "floorPlan.statusLegend.needsBussing",
  inactive: "floorPlan.statusLegend.inactive",
} as const satisfies Record<StatusGlyphKey, string>;

/**
 * Which glyph a table wears. No glyph without a supplied status (editor-only
 * usage has no legend to explain one); an inactive table is always "inactive".
 */
export function glyphKeyFor(
  status: TableDisplayStatus | undefined,
  isActive: boolean
): StatusGlyphKey | null {
  if (status === undefined) return null;
  return isActive ? status : "inactive";
}

/** The rialto token behind a key's swatch. */
export function statusFillToken(key: StatusGlyphKey): string {
  return key === "inactive" ? "var(--rialto-surface-deep)" : TABLE_STATUS_COLOR_TOKEN[key];
}
