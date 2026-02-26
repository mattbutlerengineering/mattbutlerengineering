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
 */

export type VibeName = 'default' | 'transacting' | 'presenting';

export type VibeOverrides = Record<string, string>;

export const vibes: Record<VibeName, VibeOverrides> = {
  default: {},

  transacting: {
    '--rialto-space-sm': '10px',
    '--rialto-space-md': '14px',
    '--rialto-radius-default': '4px',
    '--rialto-radius-soft': '8px',
    '--rialto-weight-medium': '600',
  },

  presenting: {
    '--rialto-space-md': '20px',
    '--rialto-space-lg': '32px',
    '--rialto-text-sm': '0.9375rem',
    '--rialto-radius-soft': '14px',
    '--rialto-radius-default': '8px',
  },
};
