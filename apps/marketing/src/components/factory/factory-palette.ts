/** A colour the scene uploads to the GPU: linear-ish sRGB components, 0–1. */
export type Rgb = readonly [number, number, number];

/** Colours the factory floor paints with, resolved from live Rialto tokens. */
export interface FactoryPalette {
  /** Page surface behind the scene — the clear colour. */
  readonly surface: Rgb;
  /** Neutral structure: the rail, the gate posts, unfinished work. */
  readonly line: Rgb;
  /** Gold. Reserved for the travelling pulse and gate flashes. */
  readonly accent: Rgb;
  /** Work that passed its tests. */
  readonly pass: Rgb;
  /** Work mid-red-phase, and work a gate rejected. */
  readonly fail: Rgb;
  /** Nearest `data-theme` scope, so the scene can bias its contrast. */
  readonly isDark: boolean;
}

/** `#fff` and `#fff8` — the alpha nibble, if present, is dropped. */
const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/i;
/**
 * `#1a1918` and `#fdfcfaeb`. The eight-digit form matters: Chrome normalises
 * the dark theme's `rgb(253 252 250 / 0.92)` tokens to it, and treating that as
 * unparseable would paint the scene in the fallback colour.
 */
const HEX_FULL = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/i;
/** `rgb(253 252 250 / 0.92)` and `rgb(176, 132, 30)` — both token spellings. */
const RGB_FUNCTION = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

/**
 * Parse a CSS colour into GPU components.
 *
 * Only the spellings Rialto's token files actually use are supported; anything
 * else (an unset property, a `color-mix`) yields the caller's fallback so a
 * missing token can never paint the scene black.
 *
 * @param value - Raw `getPropertyValue` result.
 * @param fallback - Colour to use when `value` is not a supported spelling.
 */
export function parseCssColor(value: string, fallback: Rgb): Rgb {
  const trimmed = value.trim();

  const short = HEX_SHORT.exec(trimmed);
  if (short) {
    return [
      parseInt(`${short[1]}${short[1]}`, 16) / 255,
      parseInt(`${short[2]}${short[2]}`, 16) / 255,
      parseInt(`${short[3]}${short[3]}`, 16) / 255,
    ];
  }

  const full = HEX_FULL.exec(trimmed);
  if (full) {
    return [
      parseInt(full[1]!, 16) / 255,
      parseInt(full[2]!, 16) / 255,
      parseInt(full[3]!, 16) / 255,
    ];
  }

  const rgb = RGB_FUNCTION.exec(trimmed);
  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }

  return fallback;
}

/** Warm neutrals matching the light theme — used only if a token is missing. */
const FALLBACKS = {
  surface: [0.972, 0.965, 0.953],
  line: [0.102, 0.098, 0.094],
  accent: [0.69, 0.518, 0.118],
  pass: [0.369, 0.416, 0.18],
  fail: [0.722, 0.29, 0.235],
} as const satisfies Record<string, Rgb>;

/**
 * Resolve the live theme tokens off `element`, so the cascade applies and the
 * scene repaints correctly when `data-theme` flips.
 */
export function readFactoryPalette(element: Element): FactoryPalette {
  const computed = getComputedStyle(element);
  const token = (name: string, fallback: Rgb): Rgb =>
    parseCssColor(computed.getPropertyValue(name), fallback);

  return {
    surface: token("--rialto-surface", FALLBACKS.surface),
    line: token("--rialto-text-primary", FALLBACKS.line),
    accent: token("--rialto-accent", FALLBACKS.accent),
    pass: token("--rialto-success", FALLBACKS.pass),
    fail: token("--rialto-error", FALLBACKS.fail),
    isDark: element.closest("[data-theme]")?.getAttribute("data-theme") === "dark",
  };
}
