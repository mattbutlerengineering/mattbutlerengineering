import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

const blend = (fg: Rgba, bg: Rgb): Rgb => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
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

/** Parse `#rrggbb` or `rgb(r g b [/ a])` into RGBA. */
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

// Read the real files via fs (never ?raw/?inline, which can false-pass).
const readCss = (path: string): string =>
  readFileSync(resolve(__dirname, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokensCss = readCss("../../tokens/colors.css");
const css = readCss("Tag.module.css");

/** Body of the rule whose selector is exactly `selector`. */
const ruleBody = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source)?.[1];
  if (body === undefined) throw new Error(`Rule not found: ${selector}`);
  return body;
};
const declaration = (body: string, prop: string): string | undefined =>
  new RegExp(`(?:^|[\\n;{])\\s*${prop}:\\s*([^;]+);`).exec(body)?.[1]?.trim();

const tokenMap = (selector: string): Map<string, string> => {
  const body = ruleBody(tokensCss, selector);
  return new Map(
    [...body.matchAll(/(--rialto-[\w-]+):\s*([^;]+);/g)].map(
      (m) => [m[1] as string, (m[2] as string).trim()] as const
    )
  );
};

const THEMES = {
  light: tokenMap(":root"),
  dark: tokenMap('[data-theme="dark"]'),
} as const;

const SURFACES = ["--rialto-surface", "--rialto-surface-elevated", "--rialto-surface-recessed"];

const resolveToken = (tokens: Map<string, string>, name: string): Rgba => {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token not found: ${name}`);
  return parseColor(value);
};

/** Resolve `var(--x)` or a literal color to RGBA for a theme. */
const resolveColor = (tokens: Map<string, string>, value: string): Rgba => {
  const v = /^var\((--[\w-]+)\)$/.exec(value.trim());
  return v ? resolveToken(tokens, v[1] as string) : parseColor(value);
};

/** Resolve `color-mix(in srgb, var(a) N%, var(b))` with premultiplied alpha. */
const resolveMix = (tokens: Map<string, string>, value: string): Rgba => {
  const m = /^color-mix\(in srgb,\s*var\((--[\w-]+)\)\s+(\d+)%,\s*var\((--[\w-]+)\)\)$/.exec(value);
  expect(m, `color-mix declaration did not match: ${value}`).not.toBeNull();
  const match = m as RegExpExecArray;
  const a = resolveToken(tokens, match[1] as string);
  const b = resolveToken(tokens, match[3] as string);
  const wa = Number(match[2]) / 100;
  const wb = 1 - wa;
  const alpha = a[3] * wa + b[3] * wb;
  const mix = (i: 0 | 1 | 2): number => (a[i] * a[3] * wa + b[i] * b[3] * wb) / alpha;
  return [mix(0), mix(1), mix(2), alpha];
};

const textColor = (tokens: Map<string, string>, value: string): Rgba =>
  value.startsWith("color-mix(") ? resolveMix(tokens, value) : resolveColor(tokens, value);

/** Effective hover background: variant-scoped rule beats `.interactive:hover`. */
const hoverBackground = (variant: string): string => {
  const scoped = new RegExp(`\\.interactive\\.${variant}:hover\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  const scopedBg = scoped ? declaration(scoped, "background") : undefined;
  return scopedBg ?? (declaration(ruleBody(css, ".interactive:hover"), "background") as string);
};

const VARIANTS = ["error", "success"] as const;

describe("Tag contrast (axe color-contrast, WCAG AA 4.5:1)", () => {
  for (const [themeName, tokens] of Object.entries(THEMES)) {
    for (const variant of VARIANTS) {
      const base = ruleBody(css, `.${variant}`);
      const fgRaw = declaration(base, "color") as string;
      const states = [
        { state: "rest", bgRaw: declaration(base, "background") as string },
        { state: "hover", bgRaw: hoverBackground(variant) },
      ];
      for (const { state, bgRaw } of states) {
        it(`${variant} ${state} meets 4.5:1 in ${themeName} on every surface`, () => {
          const fg = textColor(tokens, fgRaw);
          const bgColor = resolveColor(tokens, bgRaw);
          for (const surfaceName of SURFACES) {
            const surface = resolveToken(tokens, surfaceName);
            const bg = blend(bgColor, [surface[0], surface[1], surface[2]]);
            expect(
              ratio(blend(fg, bg), bg),
              `${variant} ${state} on ${surfaceName}`
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    }
  }
});

describe("Tag selected contrast (axe color-contrast, WCAG AA 4.5:1)", () => {
  for (const [themeName, tokens] of Object.entries(THEMES)) {
    const states = [
      { state: "rest", bgRaw: declaration(ruleBody(css, ".selected"), "background") as string },
      {
        state: "hover",
        bgRaw: declaration(ruleBody(css, ".selected:hover"), "background") as string,
      },
    ];
    for (const { state, bgRaw } of states) {
      it(`selected ${state} meets 4.5:1 in ${themeName}`, () => {
        const fgRaw = declaration(ruleBody(css, ".selected"), "color") as string;
        const fg = textColor(tokens, fgRaw);
        const bg = resolveColor(tokens, bgRaw);
        expect(
          ratio(blend(fg, [bg[0], bg[1], bg[2]]), [bg[0], bg[1], bg[2]])
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
