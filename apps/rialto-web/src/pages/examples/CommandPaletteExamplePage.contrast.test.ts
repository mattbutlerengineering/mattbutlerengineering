/**
 * The command-palette example's gold trigger must use the same foreground as
 * other primary buttons: `--rialto-text-on-accent` on the accent fill
 * (light 5.15:1, dark 7.55:1). `Text` variant body paints
 * `--rialto-text-primary` (near-white in dark mode, ~2.1:1 on the gold), and
 * `Kbd` paints `--rialto-text-secondary` (~1.7:1 on the gold).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(__dirname, "./CommandPaletteExamplePage.tsx"), "utf-8");
const css = readFileSync(resolve(__dirname, "./CommandPaletteExamplePage.module.css"), "utf-8");

const tokensDir = resolve(__dirname, "../../../../../packages/rialto/src/tokens");

interface ColorToken {
  $value: string;
}

interface ThemeFile {
  color: {
    text: { "on-accent": ColorToken };
    accent: { default: ColorToken; hover: ColorToken };
  };
}

function triggerMarkup(): string {
  const start = page.indexOf("styles.triggerRow");
  const end = page.indexOf("</Button>", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return page.slice(start, end);
}

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

/** WCAG 2.1 relative luminance for #rrggbb. */
function luminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const channels = [0, 2, 4].map((i) => {
    const s = parseInt(clean.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(hex1: string, hex2: string): number {
  const lighter = Math.max(luminance(hex1), luminance(hex2));
  const darker = Math.min(luminance(hex1), luminance(hex2));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("CommandPaletteExamplePage trigger contrast", () => {
  it("lets the primary button paint the label, instead of a Text body color", () => {
    const trigger = triggerMarkup();
    expect(trigger).toContain('variant="primary"');
    expect(trigger).toContain("Search everything");
    // Text's body variant sets --rialto-text-primary, which overrides the
    // button's --rialto-text-on-accent. A <p> is also outside the button's
    // phrasing-content model.
    expect(trigger).not.toMatch(/<Text\b/);
    expect(trigger).not.toMatch(/aria-hidden/);
  });

  it("paints the shortcut chips with the on-accent foreground on the gold fill", () => {
    const body = ruleBody("\\.triggerRow kbd");
    expect(body).toMatch(/color:\s*var\(--rialto-text-on-accent\)/);
    expect(body).toMatch(/background:\s*transparent/);
    expect(body).toMatch(/border-color:\s*var\(--rialto-text-on-accent\)/);
    expect(body).not.toMatch(/--rialto-text-primary|--rialto-text-secondary|--rialto-surface/);
  });

  it("the on-accent token clears WCAG AA on the accent fill in both themes", () => {
    for (const file of ["colors.json", "colors.dark.json"]) {
      const theme = JSON.parse(readFileSync(resolve(tokensDir, file), "utf-8")) as ThemeFile;
      const ink = theme.color.text["on-accent"].$value;
      const accent = theme.color.accent.default.$value;
      const hover = theme.color.accent.hover.$value;
      expect(ink).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(contrastRatio(ink, accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, hover)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
