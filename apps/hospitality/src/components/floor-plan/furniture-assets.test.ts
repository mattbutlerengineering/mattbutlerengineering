import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FURNITURE_PALETTE, TABLE_CORNER_RADIUS } from "./furniture-tokens.js";

/* Resolved from `process.cwd()` (vitest runs from apps/hospitality) for the
 * same reason TableShape.test.tsx does — see the note there. */
const ASSET_DIR = resolve(process.cwd(), "src/components/floor-plan/assets");

/**
 * The furniture art ported from the retired eat-sheet project. `FurnitureArt`
 * reproduces the first four as Konva primitives; the last three are committed
 * for the later issues in the same migration batch (booths need a banquette
 * flag the data model does not have yet, and bar stools need bar seating).
 */
const PORTED_ASSETS = ["table-round.svg", "table-square.svg", "table-rect.svg", "chair.svg"];
const RESERVED_ASSETS = ["booth.svg", "bar-stool.svg", "place-setting.svg"];
const ALL_ASSETS = [...PORTED_ASSETS, ...RESERVED_ASSETS];

function readAsset(name: string): string {
  return readFileSync(resolve(ASSET_DIR, name), "utf-8");
}

describe("floor-plan furniture assets", () => {
  it.each(ALL_ASSETS)("%s is committed and is a sized SVG", (name) => {
    const markup = readAsset(name);
    expect(markup).toContain("<svg");
    expect(markup).toMatch(/viewBox="0 0 \d+(\.\d+)? \d+(\.\d+)?"/);
    expect(markup.trimEnd().endsWith("</svg>")).toBe(true);
  });

  /* ── Drift guard ────────────────────────────────────────────────
   * `FurnitureArt` reproduces these SVGs as Konva primitives, because a
   * canvas image cannot be recoloured by table status and the floor-plan
   * chunk has no room for the inlined markup. Nothing mechanically ties the
   * two together, so these assertions do: re-tone an asset without updating
   * the palette (or vice versa) and this fails instead of the art quietly
   * drifting away from its source. */
  it.each(Object.entries(FURNITURE_PALETTE))(
    "the ported %s tone (%s) still appears in the source art",
    (_tone, value) => {
      const sources = PORTED_ASSETS.map(readAsset);
      expect(sources.some((markup) => markup.includes(value))).toBe(true);
    }
  );

  it("takes each table's corner rounding straight from its source SVG", () => {
    expect(readAsset("table-rect.svg")).toContain(`rx="${TABLE_CORNER_RADIUS.rectangle}"`);
    expect(readAsset("table-square.svg")).toContain(`rx="${TABLE_CORNER_RADIUS.square}"`);
  });

  it("reproduces the round table from a circle, not a rounded rect", () => {
    const markup = readAsset("table-round.svg");
    expect(markup).toContain("<circle");
    expect(markup).not.toContain("<rect");
  });
});
