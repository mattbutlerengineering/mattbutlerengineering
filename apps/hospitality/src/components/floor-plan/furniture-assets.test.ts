import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FURNITURE_PALETTE,
  SEAT_TONES,
  SHADOW_TONES,
  TABLE_CORNER_RADIUS,
} from "./furniture-tokens.js";
import { contrastRatio, relativeLuminance } from "../../test/png-luminance.js";

/* Resolved from `process.cwd()` (vitest runs from apps/hospitality) for the
 * same reason TableShape.test.tsx does — see the note there. */
const ASSET_DIR = resolve(process.cwd(), "src/components/floor-plan/assets");
const RIALTO_TOKENS_DIR = resolve(process.cwd(), "../../packages/rialto/src/tokens");
const RIALTO_SHADOWS_CSS = resolve(RIALTO_TOKENS_DIR, "shadows.css");

function readRecessedSurface(theme: "light" | "dark"): string {
  const css = readFileSync(resolve(RIALTO_TOKENS_DIR, "colors.css"), "utf-8");
  const selector = theme === "light" ? ":root" : '\\[data-theme="dark"\\]';
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const value = block.match(/--rialto-surface-recessed:\s*(#[0-9a-f]{6});/i)?.[1];
  if (!value) throw new Error(`--rialto-surface-recessed not found in ${theme} block`);
  return value;
}

function hexLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return relativeLuminance((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
}

/**
 * The furniture art ported from the retired eat-sheet project. `FurnitureArt`
 * reproduces the first four as Konva primitives; the last three are committed
 * for the later issues in the same migration batch (booths need a banquette
 * flag the data model does not have yet, and bar stools need bar seating).
 */
const PORTED_ASSETS = [
  "table-round.svg",
  "table-square.svg",
  "table-rect.svg",
  "chair.svg",
  "chair-dark.svg",
];
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

  /* Chair tones are keyed by theme (#7845). The light set is the committed
   * `chair.svg`; the dark set is its committed `chair-dark.svg` counterpart. */
  it.each(Object.entries(SEAT_TONES.light))(
    "the light chair %s tone (%s) still appears in chair.svg",
    (_tone, value) => {
      expect(readAsset("chair.svg")).toContain(value);
    }
  );

  it.each(Object.entries(SEAT_TONES.dark))(
    "the dark chair %s tone (%s) still appears in chair-dark.svg",
    (_tone, value) => {
      expect(readAsset("chair-dark.svg")).toContain(value);
    }
  );

  /* Shadow tones follow the rialto `--rialto-shadow-*` colour family
   * (shadows.css): the light theme's base is `rgb(26 25 24 / x)`, the dark
   * theme's `rgb(0 0 0 / x)`. Canvas cannot read the composite `box-shadow`
   * tokens, so only the base channels are mirrored, and this ties them back. */
  it.each([
    ["light", ":root", "26,25,24"],
    ["dark", '[data-theme="dark"]', "0,0,0"],
  ] as const)(
    "the %s shadow tone uses the shadows.css base colour",
    (theme, selector, channels) => {
      const css = readFileSync(RIALTO_SHADOWS_CSS, "utf-8");
      const block = css.slice(css.indexOf(selector));
      const spaced = channels.replace(/,/g, " ");
      expect(block).toContain(`rgb(${spaced} /`);
      expect(SHADOW_TONES[theme]).toMatch(new RegExp(`^rgba\\(${channels},`));
    }
  );

  /* WCAG 1.4.11 non-text contrast: a chair that blends into the floor is a
   * chair the host cannot count. Measured against the real floor token. */
  it.each(["light", "dark"] as const)(
    "the %s chair frame has at least 3:1 against --rialto-surface-recessed",
    (theme) => {
      const floor = readRecessedSurface(theme);
      const ratio = contrastRatio(hexLuminance(SEAT_TONES[theme].frame), hexLuminance(floor));
      expect(ratio).toBeGreaterThanOrEqual(3);
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
