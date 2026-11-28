import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * #10038 / #10027: the active sidebar item painted its label in --rialto-accent gold on the
 * accent-muted wash, 2.94:1 in light mode (axe color-contrast on every manager page). The label now
 * uses a contrast-checked text token and the gold stays as the non-text indicator (inline-start
 * border + wash). These read the parsed CSS rules and resolve the tokens from rialto's generated
 * colors.css, so a token change that drops the label under 4.5:1 fails here.
 */
const SIDEBAR_FILES = [
  "src/components/DashboardSidebar.module.css",
  "../../packages/hospitality-sidenav/src/SideNav.module.css",
] as const;
const COLORS_CSS = readFileSync(
  resolve(process.cwd(), "../../packages/rialto/src/tokens/colors.css"),
  "utf-8"
);

type Declarations = ReadonlyMap<string, string>;

function parseTopLevelRules(file: string): ReadonlyMap<string, Declarations> {
  const css = readFileSync(resolve(process.cwd(), file), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
  const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const entries = [...topLevel.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
    const declarations: Declarations = new Map(
      (match[2] ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const colon = d.indexOf(":");
          return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()] as const;
        })
    );
    // A grouped selector ("a, b { … }") applies its declarations to each member.
    return (match[1] ?? "").split(",").map((s) => [s.trim(), declarations] as const);
  });
  return new Map(entries);
}

/** Custom properties declared in the first block whose selector is exactly `selector`. */
function themeTokens(selector: string): ReadonlyMap<string, string> {
  const escaped = selector.replace(/[[\]"]/g, "\\$&");
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(COLORS_CSS)?.[1] ?? "";
  return new Map(
    [...block.matchAll(/(--rialto-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1] ?? "",
      (m[2] ?? "").trim(),
    ])
  );
}

type Rgba = readonly [number, number, number, number];

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1] ?? "0", 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/.exec(value);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  }
  throw new Error(`Unparsed colour ${value}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function tokenName(value: string | undefined): string {
  return /^var\((--rialto-[\w-]+)\)$/.exec(value ?? "")?.[1] ?? "";
}

const LIGHT = themeTokens(":root");
const DARK = new Map([...LIGHT, ...themeTokens('[data-theme="dark"]')]);

describe.each(SIDEBAR_FILES)("%s active nav item (#10038)", (file) => {
  const rules = parseTopLevelRules(file);
  const root = rules.get(".root");
  const active = rules.get(".navLinkActive");
  const activeHover = rules.get(".navLinkActive:hover");

  it("keeps the gold as the non-text indicator", () => {
    expect(active?.get("border-inline-start-color")).toBe("var(--rialto-accent)");
    expect(active?.get("background")).toBe("var(--rialto-accent-muted)");
  });

  it("never paints the label in the accent gold", () => {
    expect(active?.get("color")).not.toBe("var(--rialto-accent)");
    expect(activeHover?.get("color") ?? active?.get("color")).not.toBe("var(--rialto-accent)");
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("label reaches 4.5:1 on the active wash in %s mode", (_theme, tokens) => {
    const resolveToken = (decl: string | undefined) => {
      const value = tokens.get(tokenName(decl));
      expect(value, `token for ${decl}`).toBeDefined();
      return parseColor(value ?? "");
    };
    const sidebar = resolveToken(root?.get("background"));
    const wash = over(resolveToken(active?.get("background")), sidebar);
    const label = over(resolveToken(active?.get("color")), wash);
    expect(contrast(label, wash)).toBeGreaterThanOrEqual(4.5);
  });
});
