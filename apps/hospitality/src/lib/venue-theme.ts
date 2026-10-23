import { VenueThemeSchema, type VenueTheme } from "@mbe/types/schemas";

const LIGHT_ON_ACCENT = "#fdfcfa";
const DARK_ON_ACCENT = "#1a1918";

function expandHex(hex: string): string {
  const h = hex.slice(1);
  return h.length === 3 ? [...h].map((c) => c + c).join("") : h;
}

function luminance(hex: string): number {
  const h = expandHex(hex);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour (of the two rialto uses) with more contrast on an accent fill. */
export function onAccentColor(accent: string): string {
  return contrastRatio(accent, LIGHT_ON_ACCENT) >= contrastRatio(accent, DARK_ON_ACCENT)
    ? LIGHT_ON_ACCENT
    : DARK_ON_ACCENT;
}

/** How far a hover shade sits from its accent, toward the text that rides on it. */
const HOVER_SHIFT = 0.12;

function channel(hex: string, index: number): number {
  return parseInt(expandHex(hex).slice(index, index + 2), 16);
}

function toHexByte(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * The hover shade of an accent: a step toward whichever text colour rides on
 * it, so a dark accent lightens and a light accent darkens. Used when a palette
 * is extracted from a logo, which yields one colour per slot and no hover.
 */
export function deriveAccentHover(accent: string): string {
  const toward = onAccentColor(accent);
  const shifted = [0, 2, 4].map((i) => {
    const from = channel(accent, i);
    return from + (channel(toward, i) - from) * HOVER_SHIFT;
  });
  return `#${shifted.map(toHexByte).join("")}`;
}

/**
 * A ranked palette (see `lib/logo-palette.ts`) as a venue theme: the dominant
 * colour becomes the accent, its hover shade is derived, and the optional
 * surface/text slots are left to rialto's stock values — a logo says nothing
 * about them, and guessing would risk the contrast gate for no gain. The gate
 * itself is not applied here: `checkThemeContrast` judges an extracted theme on
 * exactly the same terms as a manual one, at the one place that saves.
 */
export function paletteToTheme(palette: readonly string[]): VenueTheme | null {
  const [accent] = palette;
  if (accent === undefined) return null;
  return { accent, accentHover: deriveAccentHover(accent), source: "extracted" };
}

export type ThemeContrastFailure = "accent-text" | "accent-surface" | "text-surface";

export interface ThemeContrastResult {
  ok: boolean;
  failures: ThemeContrastFailure[];
}

// Stock rialto light values — what a pair is judged against when the venue does not override it.
const STOCK_SURFACE = "#f8f6f3";
const STOCK_TEXT = "#1a1918";

/**
 * WCAG AA gate: text on the accent fill (4.5), the accent against the surface it sits on as a
 * UI component (3), and body text on the surface (4.5).
 */
export function checkThemeContrast(theme: VenueTheme): ThemeContrastResult {
  const failures: ThemeContrastFailure[] = [];
  const surface = theme.surface ?? STOCK_SURFACE;
  if (contrastRatio(theme.accent, onAccentColor(theme.accent)) < 4.5) failures.push("accent-text");
  if (contrastRatio(theme.accent, surface) < 3) failures.push("accent-surface");
  const text = theme.textPrimary ?? STOCK_TEXT;
  const surfaces = [surface, theme.surfaceElevated].filter((s): s is string => !!s);
  if (surfaces.some((s) => contrastRatio(text, s) < 4.5)) failures.push("text-surface");
  return { ok: failures.length === 0, failures };
}

/** A venue's theme, or null — absent, unparseable or unreadable palettes fall back to stock. */
export function parseVenueTheme(settings: object | null | undefined): VenueTheme | null {
  const parsed = VenueThemeSchema.safeParse(
    (settings as { theme?: unknown } | null | undefined)?.theme
  );
  if (!parsed.success || !checkThemeContrast(parsed.data).ok) return null;
  return parsed.data;
}

export function themeToCssVars(theme: VenueTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--rialto-accent": theme.accent,
    "--rialto-accent-hover": theme.accentHover,
    "--rialto-text-on-accent": onAccentColor(theme.accent),
  };
  if (theme.surface) vars["--rialto-surface"] = theme.surface;
  if (theme.surfaceElevated) vars["--rialto-surface-elevated"] = theme.surfaceElevated;
  if (theme.textPrimary) vars["--rialto-text-primary"] = theme.textPrimary;
  return vars;
}
