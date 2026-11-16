/**
 * AvatarGroup's overflow badge paints `--rialto-text-primary` on
 * `--rialto-surface-matte`. Inside `.darkSurface` (PageHeader) text-primary
 * flips light, so matte must flip dark too, or the "+N" is ~1.4:1 (#6422).
 * jsdom cannot resolve CSS-variable contrast, so assert on the source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(__dirname, "surfaces.module.css"), "utf8");
const block = /\.darkSurface\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function lum([r, g, b]: number[]): number {
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

describe(".darkSurface matte badge contrast", () => {
  const matte = /--rialto-surface-matte:\s*rgb\((\d+) (\d+) (\d+)\)/.exec(block);

  it("redefines --rialto-surface-matte for the dark scope", () => {
    expect(matte).not.toBeNull();
  });

  it("keeps text-primary on matte at 4.5:1 or better", () => {
    const bg = (matte?.slice(1, 4) ?? ["255", "255", "255"]).map(Number);
    const fgMatch = /--rialto-text-primary:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(block);
    const alpha = Number(fgMatch?.[4] ?? 1);
    const raw = (fgMatch?.slice(1, 4) ?? ["0", "0", "0"]).map(Number);
    const fg = raw.map((c, i) => c * alpha + (bg[i] ?? 0) * (1 - alpha));
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    expect(((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
