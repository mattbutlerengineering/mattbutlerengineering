/**
 * WCAG 2.1 contrast helpers shared by token-contrast.test.ts and the
 * signature kill-test board (src/stories/SignaturePalette.stories.tsx), so a
 * board caption and the tested value come from one formula.
 */

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
export function contrastRatio(hex1: string, hex2: string): number {
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
export function parseColor(value: string): { hex: string; alpha: number } {
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
export function resolveOn(value: string, bgHex: string): string {
  const { hex, alpha } = parseColor(value);
  return alpha >= 1 ? hex : blendAlpha(hex, bgHex, alpha);
}
