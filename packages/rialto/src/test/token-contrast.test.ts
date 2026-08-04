/**
 * Token Contrast Test — WCAG AA compliance verification
 *
 * axe-core cannot resolve CSS custom property contrast values in jsdom,
 * so this test is the ONLY reliable way to verify contrast compliance in CI.
 *
 * Both themes are read from the DTCG authoring sources (colors.json,
 * colors.dark.json). src/tokens/colors.css is GENERATED from those same
 * files (scripts/generate-colors-css.ts) and drift-checked by `pnpm
 * regen:check`, so asserting on the JSON asserts on the shipped values.
 *
 * Thresholds:
 *   - Text on surface: 4.5:1 (WCAG AA normal text)
 *   - UI controls on surface: 3:1 (WCAG AA UI components / graphical objects)
 */

import { describe, it, expect } from "vitest";
import colors from "../tokens/colors.json";
import darkColors from "../tokens/colors.dark.json";

// ── Pure utility functions ────────────────────────────────────────────────────

/** Linearize a single sRGB channel value (0–255) per WCAG 2.1 spec */
function sRGB(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a hex color per WCAG 2.1 */
function luminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}

/** WCAG contrast ratio between two hex colors */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composite an rgba foreground over a solid background.
 * Returns the resulting opaque hex color.
 */
function blendAlpha(fgHex: string, bgHex: string, alpha: number): string {
  const fgClean = fgHex.replace(/^#/, "");
  const bgClean = bgHex.replace(/^#/, "");

  const fgR = parseInt(fgClean.slice(0, 2), 16);
  const fgG = parseInt(fgClean.slice(2, 4), 16);
  const fgB = parseInt(fgClean.slice(4, 6), 16);

  const bgR = parseInt(bgClean.slice(0, 2), 16);
  const bgG = parseInt(bgClean.slice(2, 4), 16);
  const bgB = parseInt(bgClean.slice(4, 6), 16);

  const r = Math.round(fgR * alpha + bgR * (1 - alpha));
  const g = Math.round(fgG * alpha + bgG * (1 - alpha));
  const b = Math.round(fgB * alpha + bgB * (1 - alpha));

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Parse a DTCG color $value into a base hex color plus alpha.
 * Accepts `#rrggbb` and the `rgb(R G B / A)` form used by translucent tokens.
 */
function parseColor(value: string): { hex: string; alpha: number } {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return { hex: value, alpha: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (0?\.\d+|[01](?:\.0+)?)\)$/.exec(value);
  if (rgb) {
    const [, r, g, b, a] = rgb;
    const channels = [r, g, b].map(Number);
    if (channels.some((c) => c > 255)) {
      throw new Error(`RGB channel out of range in color token value: ${value}`);
    }
    const hex = `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    return { hex, alpha: Number(a) };
  }
  throw new Error(`Unrecognized color token value: ${value}`);
}

/**
 * Resolve a possibly-translucent foreground token to the opaque color the
 * user actually sees over `bgHex`.
 */
function resolveOn(value: string, bgHex: string): string {
  const { hex, alpha } = parseColor(value);
  return alpha >= 1 ? hex : blendAlpha(hex, bgHex, alpha);
}

// ── Token extraction helpers ──────────────────────────────────────────────────

const surface = colors.color.surface.default.$value;
const surfaceElevated = colors.color.surface.elevated.$value;

const textPrimary = colors.color.text.primary.$value;
const textSecondary = colors.color.text.secondary.$value;
const textTertiary = colors.color.text.tertiary.$value;
const textOnAccent = colors.color["text"]["on-accent"].$value;

const accent = colors.color.accent.default.$value;

const borderDefault = colors.color.border.default.$value;
const borderStrong = colors.color.border.strong.$value;

const error = colors.color.semantic.error.default.$value;
const warning = colors.color.semantic.warning.default.$value;
const success = colors.color.semantic.success.default.$value;

const dark = {
  surface: darkColors.color.surface.default.$value,
  surfaceElevated: darkColors.color.surface.elevated.$value,
  textPrimary: darkColors.color.text.primary.$value,
  textSecondary: darkColors.color.text.secondary.$value,
  textTertiary: darkColors.color.text.tertiary.$value,
  textOnAccent: darkColors.color["text"]["on-accent"].$value,
  accent: darkColors.color.accent.default.$value,
  error: darkColors.color.semantic.error.default.$value,
  warning: darkColors.color.semantic.warning.default.$value,
  success: darkColors.color.semantic.success.default.$value,
  border: darkColors.color.border.default.$value,
  borderStrong: darkColors.color.border.strong.$value,
};

// ── Structural parity ─────────────────────────────────────────────────────────

/** Collect every DTCG leaf path (`a.b.c`) in a token tree. */
function tokenPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [];
  if ("$value" in node) return [prefix];
  const entries: Array<[string, unknown]> = Object.entries(node);
  return entries
    .filter(([key]) => !key.startsWith("$"))
    .flatMap(([key, child]) => tokenPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("Theme parity", () => {
  it("colors.dark.json declares exactly the token paths of colors.json", () => {
    expect(tokenPaths(darkColors).sort()).toEqual(tokenPaths(colors).sort());
  });
});

// ── Light Theme Tests ─────────────────────────────────────────────────────────

describe("Light theme — text on surface (4.5:1 minimum)", () => {
  it("text-primary on surface", () => {
    expect(contrastRatio(textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary on surface", () => {
    expect(contrastRatio(textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary on surface", () => {
    expect(contrastRatio(textTertiary, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-primary on surface-elevated", () => {
    expect(contrastRatio(textPrimary, surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary on surface-elevated", () => {
    expect(contrastRatio(textSecondary, surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Light theme — semantic text on surface (4.5:1 minimum)", () => {
  it("error on surface", () => {
    expect(contrastRatio(error, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("warning on surface", () => {
    expect(contrastRatio(warning, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("success on surface", () => {
    expect(contrastRatio(success, surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Light theme — accent text and UI controls", () => {
  it("text-on-accent on accent (4.5:1 minimum)", () => {
    expect(contrastRatio(textOnAccent, accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent as UI control on surface (3:1 minimum)", () => {
    expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("Light theme — border UI controls on surface (3:1 minimum)", () => {
  it("border on surface", () => {
    expect(contrastRatio(borderDefault, surface)).toBeGreaterThanOrEqual(3);
  });

  it("border-strong on surface", () => {
    expect(contrastRatio(borderStrong, surface)).toBeGreaterThanOrEqual(3);
  });

  it("border on surface-elevated", () => {
    expect(contrastRatio(borderDefault, surfaceElevated)).toBeGreaterThanOrEqual(3);
  });
});

// ── Dark Theme Tests ──────────────────────────────────────────────────────────

describe("Dark theme — text on surface (4.5:1 minimum)", () => {
  it("text-primary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textPrimary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-primary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textPrimary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textSecondary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textSecondary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface", () => {
    const blended = resolveOn(dark.textTertiary, dark.surface);
    expect(contrastRatio(blended, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface-elevated", () => {
    const blended = resolveOn(dark.textTertiary, dark.surfaceElevated);
    expect(contrastRatio(blended, dark.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Dark theme — accent text and UI controls", () => {
  it("accent as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.accent, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("text-on-accent on dark accent (4.5:1 minimum)", () => {
    const accentHex = parseColor(dark.accent).hex;
    expect(
      contrastRatio(resolveOn(dark.textOnAccent, accentHex), accentHex)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("border (blended) as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.border, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });

  it("border-strong (blended) as UI control on dark surface (3:1 minimum)", () => {
    expect(
      contrastRatio(resolveOn(dark.borderStrong, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("Dark theme — semantic text on dark surface (4.5:1 minimum)", () => {
  it("error on dark surface", () => {
    expect(contrastRatio(resolveOn(dark.error, dark.surface), dark.surface)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it("warning on dark surface", () => {
    expect(
      contrastRatio(resolveOn(dark.warning, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("success on dark surface", () => {
    expect(
      contrastRatio(resolveOn(dark.success, dark.surface), dark.surface)
    ).toBeGreaterThanOrEqual(4.5);
  });
});
