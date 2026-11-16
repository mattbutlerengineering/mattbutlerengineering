import { describe, it, expect } from "vitest";
import { deltaColor } from "./delta-color";

// Light-theme tokens (packages/rialto/src/tokens/colors.css) and the striped
// table row background measured live on /demos/dashboard.
const ERROR = [184, 74, 60];
const TEXT_PRIMARY = [26, 25, 24];
const ROW_BG = [237, 234, 229];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function lum(rgb: number[]): number {
  return (
    0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0)
  );
}
function ratio(a: number[], b: number[]): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("deltaColor", () => {
  it("keeps success and tertiary tokens for positive and zero deltas", () => {
    expect(deltaColor(3)).toBe("var(--rialto-success)");
    expect(deltaColor(0)).toBe("var(--rialto-text-tertiary)");
  });

  it("does not use raw --rialto-error for negative deltas (4.28:1 on the row)", () => {
    expect(ratio(ERROR, ROW_BG)).toBeLessThan(4.5);
    expect(deltaColor(-4)).not.toBe("var(--rialto-error)");
  });

  it("mixes error toward text-primary enough to reach AA on the row", () => {
    const match = /(\d+)%/.exec(deltaColor(-4));
    const errorShare = Number(match?.[1] ?? 100) / 100;
    const mixed = ERROR.map((c, i) => c * errorShare + (TEXT_PRIMARY[i] ?? 0) * (1 - errorShare));
    expect(ratio(mixed, ROW_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
