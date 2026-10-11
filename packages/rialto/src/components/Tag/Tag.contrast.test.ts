import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = readonly [number, number, number];

const hex = (s: string): Rgb => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];
const blend = (fg: Rgb, alpha: number, bg: Rgb): Rgb => [
  fg[0] * alpha + bg[0] * (1 - alpha),
  fg[1] * alpha + bg[1] * (1 - alpha),
  fg[2] * alpha + bg[2] * (1 - alpha),
];
const channel = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
};

const css = readFileSync(resolve(__dirname, "Tag.module.css"), "utf8");
const errorRule = /\.error\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
const colorDecl = /(?:^|\n)\s*color:\s*([^;]+);/.exec(errorRule)?.[1] ?? "";

// Token values from src/tokens/colors.css (generated from colors*.json).
const THEMES = {
  light: {
    error: hex("#b84a3c"),
    text: hex("#1a1918"),
    surfaces: ["#f8f6f3", "#fdfcfa", "#edeae5"].map(hex),
  },
  dark: {
    error: hex("#e06050"),
    text: blend(hex("#fdfcfa"), 0.92, hex("#1e1c1a")),
    surfaces: ["#1e1c1a", "#2a2725", "#141312"].map(hex),
  },
} as const;

const TINT: Rgb = [180, 60, 50]; // rgb(180 60 50 / 0.08) in .error background
const TINT_ALPHA = 0.08;

describe("Tag error variant contrast (axe color-contrast)", () => {
  const mixMatch =
    /color-mix\(in srgb,\s*var\(--rialto-error\)\s+(\d+)%,\s*var\(--rialto-text-primary\)\)/.exec(
      colorDecl
    );
  const errorWeight = mixMatch ? Number(mixMatch[1]) / 100 : 1;

  for (const [name, theme] of Object.entries(THEMES)) {
    it(`meets 4.5:1 in ${name} theme on every surface`, () => {
      const fg: Rgb = [
        theme.error[0] * errorWeight + theme.text[0] * (1 - errorWeight),
        theme.error[1] * errorWeight + theme.text[1] * (1 - errorWeight),
        theme.error[2] * errorWeight + theme.text[2] * (1 - errorWeight),
      ];
      for (const surface of theme.surfaces) {
        const bg = blend(TINT, TINT_ALPHA, surface);
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
