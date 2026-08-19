/**
 * Rialto Vibe System
 *
 * Vibes are CSS custom property override sets that shift the design
 * language to match user intent. They work via the CSS cascade — the
 * same proven pattern as `.darkSurface` in surfaces.module.css.
 *
 * - `default` — no overrides, standard Rialto tokens
 * - `transacting` — tighter spacing, sharper radii, bolder weight for urgency
 * - `presenting` — more whitespace, larger type, softer radii for presentation
 * - `game` — instrument density: tight spacing, near-square corners, bolder
 *   labels, and a duration scale entirely inside a 100ms feedback budget
 */

export type VibeName = "default" | "transacting" | "presenting" | "game";

export type VibeOverrides = Record<string, string>;

export const vibes: Record<VibeName, VibeOverrides> = {
  default: {},

  transacting: {
    "--rialto-space-sm": "10px",
    "--rialto-space-md": "14px",
    "--rialto-radius-default": "4px",
    "--rialto-radius-soft": "8px",
    "--rialto-weight-medium": "600",
  },

  presenting: {
    "--rialto-space-md": "20px",
    "--rialto-space-lg": "32px",
    "--rialto-text-sm": "0.9375rem",
    "--rialto-radius-soft": "14px",
    "--rialto-radius-default": "8px",
  },

  /**
   * Game-UI vibe — the design language of an instrument panel rather than a
   * document. Three shifts, no colour:
   *
   * 1. **Density** below every other preset (sm 12→8, md 16→12, lg 24→18), so
   *    a lot of live state fits without the eye having to travel.
   * 2. **Near-square corners** (default 6→2, soft 10→4) — rounding reads as
   *    soft and document-like; instruments have edges.
   * 3. **A duration scale inside the 100ms feedback budget** (fast 0.1→0.06,
   *    standard 0.15→0.09, slow 0.2→0.12) with a fast-attack easing curve.
   *    Encoding the budget in the preset means the whole catalog inherits it,
   *    instead of every component being audited for it one at a time.
   *
   * Colour is deliberately absent: it stays the theme's job (`data-theme`), so
   * this vibe composes with light and dark instead of fighting them.
   */
  game: {
    "--rialto-space-sm": "8px",
    "--rialto-space-md": "12px",
    "--rialto-space-lg": "18px",
    "--rialto-radius-default": "2px",
    "--rialto-radius-soft": "4px",
    "--rialto-weight-medium": "600",
    "--rialto-duration-fast": "0.06s",
    "--rialto-duration-standard": "0.09s",
    "--rialto-duration-slow": "0.12s",
    "--rialto-ease-precision": "cubic-bezier(0.16, 1, 0.3, 1)",
  },
};
