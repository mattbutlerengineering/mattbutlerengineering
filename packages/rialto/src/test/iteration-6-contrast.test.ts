/**
 * A11y audit loop, Iteration 6 (#6715): axe `color-contrast` findings on the
 * rialto-web showcase pages. jsdom cannot resolve CSS custom properties, so
 * this reads the real stylesheets via fs and resolves the tokens itself (the
 * same approach as NeonSign.contrast.test.ts). Never ?raw/?inline: they can
 * false-pass.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

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
const over = (fg: Rgba, bg: Rgb): Rgb => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
];

const parseColor = (raw: string): Rgba => {
  const s = raw.trim();
  if (s.startsWith("#")) {
    return [
      parseInt(s.slice(1, 3), 16),
      parseInt(s.slice(3, 5), 16),
      parseInt(s.slice(5, 7), 16),
      1,
    ];
  }
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[/,]\s*([\d.]+))?\s*\)$/.exec(s);
  if (!m) throw new Error(`Unparseable color: ${raw}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1];
};

const readCss = (path: string): string =>
  readFileSync(resolve(__dirname, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const ruleBody = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source)?.[1];
  if (body === undefined) throw new Error(`Rule not found: ${selector}`);
  return body;
};
const declaration = (source: string, selector: string, prop: string): string => {
  const value = new RegExp(`(?:^|[\\n;{])\\s*${prop}:\\s*([^;]+);`)
    .exec(ruleBody(source, selector))?.[1]
    ?.trim();
  if (value === undefined) throw new Error(`${selector} has no ${prop}`);
  return value;
};

const tokensCss = readCss("../tokens/colors.css");
const tokenMap = (selector: string): Map<string, string> =>
  new Map(
    [...ruleBody(tokensCss, selector).matchAll(/(--rialto-[\w-]+):\s*([^;]+);/g)].map(
      (m) => [m[1] as string, (m[2] as string).trim()] as const
    )
  );
const THEMES = { light: tokenMap(":root"), dark: tokenMap('[data-theme="dark"]') } as const;

const token = (tokens: Map<string, string>, name: string): Rgba => {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token not found: ${name}`);
  return parseColor(value);
};

/** `var(--x)` or `color-mix(in srgb, var(a) N%, var(b))` (premultiplied alpha). */
const resolve1 = (tokens: Map<string, string>, value: string): Rgba => {
  const v = /^var\((--[\w-]+)\)$/.exec(value);
  if (v) return token(tokens, v[1] as string);
  const m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+)%,\s*var\((--[\w-]+)\)\)$/.exec(value);
  if (!m) throw new Error(`Cannot resolve: ${value}`);
  const a = token(tokens, m[1] as string);
  const b = token(tokens, m[3] as string);
  const wa = Number(m[2]) / 100;
  const wb = 1 - wa;
  const alpha = a[3] * wa + b[3] * wb;
  const mix = (i: 0 | 1 | 2): number => (a[i] * a[3] * wa + b[i] * b[3] * wb) / alpha;
  return [mix(0), mix(1), mix(2), alpha];
};

const solid = (tokens: Map<string, string>, value: string): Rgb => {
  const c = resolve1(tokens, value);
  return [c[0], c[1], c[2]];
};
const contrast = (tokens: Map<string, string>, fg: string, bg: string): number => {
  const bgRgb = solid(tokens, bg);
  return ratio(over(resolve1(tokens, fg), bgRgb), bgRgb);
};

const pagination = readCss("../components/Pagination/Pagination.module.css");
const divider = readCss("../components/Divider/Divider.module.css");
const dataList = readCss("../components/DataList/DataList.module.css");

describe("Iteration 6 contrast (axe color-contrast, WCAG AA 4.5:1)", () => {
  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`Pagination active page text meets 4.5:1 on the accent fill (${theme})`, () => {
      const fg = declaration(pagination, ".active", "color");
      expect(contrast(tokens, fg, "var(--rialto-accent)")).toBeGreaterThanOrEqual(4.5);
      const hoverFg = declaration(pagination, ".active:hover", "color");
      expect(contrast(tokens, hoverFg, "var(--rialto-accent-hover)")).toBeGreaterThanOrEqual(4.5);
    });

    it(`Divider accent label meets 4.5:1 on the surface (${theme})`, () => {
      const fg = declaration(divider, ".accent .label", "color");
      expect(contrast(tokens, fg, "var(--rialto-surface)")).toBeGreaterThanOrEqual(4.5);
    });

    it(`DataList striped label meets 4.5:1 on the recessed stripe (${theme})`, () => {
      const fg = declaration(dataList, ".striped .label", "color");
      expect(contrast(tokens, fg, "var(--rialto-surface-recessed)")).toBeGreaterThanOrEqual(4.5);
    });
  }
});
