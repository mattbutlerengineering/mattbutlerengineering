/**
 * Token Contrast Test — WCAG AA compliance verification
 *
 * axe-core cannot resolve CSS custom property contrast values in jsdom,
 * so this test is the ONLY reliable way to verify contrast compliance in CI.
 *
 * Thresholds:
 *   - Text on surface: 4.5:1 (WCAG AA normal text)
 *   - UI controls on surface: 3:1 (WCAG AA UI components / graphical objects)
 */

import { describe, it, expect } from "vitest";
import colors from "../tokens/colors.json";

// Dark theme values from colors.css — keep in sync manually
const DARK = {
  surface: "#1e1c1a",
  surfaceElevated: "#2a2725",
  textPrimaryOpacity: 0.92,
  textSecondaryOpacity: 0.6,
  textTertiaryOpacity: 0.5,
  textOnBase: "#fdfcfa", // base before alpha blend
  accent: "#d4a23a",
  textOnAccent: "#1a1918",
  error: "#e06050",
  warning: "#d4a030",
  success: "#9aaa4c",
};

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

// ── Token extraction helpers ──────────────────────────────────────────────────

const surface = colors.color.surface.default.$value;
const surfaceElevated = colors.color.surface.elevated.$value;

const textPrimary = colors.color.text.primary.$value;
const textSecondary = colors.color.text.secondary.$value;
const textTertiary = colors.color.text.tertiary.$value;
const textOnAccent = colors.color["text"]["on-accent"].$value;

const accent = colors.color.accent.default.$value;

const error = colors.color.semantic.error.default.$value;
const warning = colors.color.semantic.warning.default.$value;
const success = colors.color.semantic.success.default.$value;

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

// ── Dark Theme Tests ──────────────────────────────────────────────────────────

describe("Dark theme — text on surface (4.5:1 minimum)", () => {
  it("text-primary (blended) on dark surface", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surface, DARK.textPrimaryOpacity);
    expect(contrastRatio(blended, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-primary (blended) on dark surface-elevated", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surfaceElevated, DARK.textPrimaryOpacity);
    expect(contrastRatio(blended, DARK.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surface, DARK.textSecondaryOpacity);
    expect(contrastRatio(blended, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-secondary (blended) on dark surface-elevated", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surfaceElevated, DARK.textSecondaryOpacity);
    expect(contrastRatio(blended, DARK.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surface, DARK.textTertiaryOpacity);
    expect(contrastRatio(blended, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("text-tertiary (blended) on dark surface-elevated", () => {
    const blended = blendAlpha(DARK.textOnBase, DARK.surfaceElevated, DARK.textTertiaryOpacity);
    expect(contrastRatio(blended, DARK.surfaceElevated)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Dark theme — accent text and UI controls", () => {
  it("accent as UI control on dark surface (3:1 minimum)", () => {
    expect(contrastRatio(DARK.accent, DARK.surface)).toBeGreaterThanOrEqual(3);
  });

  it("text-on-accent on dark accent (4.5:1 minimum)", () => {
    expect(contrastRatio(DARK.textOnAccent, DARK.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Dark theme — semantic text on dark surface (4.5:1 minimum)", () => {
  it("error on dark surface", () => {
    expect(contrastRatio(DARK.error, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("warning on dark surface", () => {
    expect(contrastRatio(DARK.warning, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("success on dark surface", () => {
    expect(contrastRatio(DARK.success, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
