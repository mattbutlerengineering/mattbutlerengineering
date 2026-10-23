/**
 * Floor-material textures, ported from the retired eat-sheet project.
 *
 * The five PNGs are served from `public/floor-plan/textures/` and referenced by
 * URL — deliberately **not** `import`ed. An import would make Vite bundle them
 * as assets and inline the small ones, and five 64x64 PNGs do not fit the
 * `apps/hospitality` size budget. `floor-textures.test.ts` is the guard: it
 * fails if any `.png` import appears anywhere under `src/`.
 *
 * Geometry note: `TEXTURE_TILE_PX` is expressed in canvas units and is
 * deliberately a constant, independent of the stage's zoom. Konva builds a
 * fill-pattern transform from `fillPatternScale`/`fillPatternOffset` alone, so
 * a constant scale means the pattern lives in the same coordinate space as the
 * geometry it fills — the stage transform scales both together, and the pattern
 * stays anchored to its rectangle under pan and zoom. Deriving the scale from
 * the live zoom instead is what makes a Konva pattern slide and smear.
 */

import { type FloorMaterial } from "@mbe/types";
import { GRID_SIZE } from "./floor-plan-geometry.js";

/** Path under the app's `public/`, and so also under its base URL. */
export const FLOOR_TEXTURE_DIR = "floor-plan/textures";

/** Every texture is this square. Asserted against the committed PNGs. */
export const TEXTURE_SOURCE_PX = 64;

/** Canvas units one texture tile covers — a whole number of grid cells, so seams land on grid lines. */
export const TEXTURE_TILE_PX = GRID_SIZE * 4;

/** Konva pattern scale that maps a `TEXTURE_SOURCE_PX` tile onto `TEXTURE_TILE_PX` canvas units. */
export const TEXTURE_PATTERN_SCALE = {
  x: TEXTURE_TILE_PX / TEXTURE_SOURCE_PX,
  y: TEXTURE_TILE_PX / TEXTURE_SOURCE_PX,
} as const;

/** URL of a material's texture, resolved against the app's base URL (`/hospitality/`). */
export function floorTextureUrl(material: FloorMaterial, baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${FLOOR_TEXTURE_DIR}/${material}.png`;
}
