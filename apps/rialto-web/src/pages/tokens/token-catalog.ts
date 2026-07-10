/**
 * Token catalog — curated metadata for the Color, Typography, and Surfaces
 * documentation pages.
 *
 * This module carries only the *identity* of each token (its custom-property
 * name), its semantic grouping, and human usage guidance. The *resolved value*
 * shown on each page is never stored here — it is read from the live CSS cascade
 * at render time (see `use-live-tokens.ts`) so the docs can never drift from the
 * compiled stylesheet.
 */

export interface TokenDoc {
  /** The custom-property name, e.g. `--rialto-surface`. */
  name: string;
  /** Human guidance on where the token is meant to be used. */
  usage: string;
}

export interface TokenGroup {
  /** Section heading, e.g. `Surfaces`. */
  label: string;
  /** Short prose describing the group's purpose. */
  description: string;
  tokens: readonly TokenDoc[];
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export const COLOR_GROUPS: readonly TokenGroup[] = [
  {
    label: "Surfaces",
    description: "Background layers, from the page base up to raised panels.",
    tokens: [
      { name: "--rialto-surface", usage: "Page and default component backgrounds" },
      { name: "--rialto-surface-elevated", usage: "Cards, popovers, elevated containers" },
      { name: "--rialto-surface-recessed", usage: "Input fields, slider tracks, recessed channels" },
      { name: "--rialto-surface-matte", usage: "Disabled fills, subtle divider backgrounds" },
      { name: "--rialto-surface-deep", usage: "Heavy separators, decorative dark accents" },
    ],
  },
  {
    label: "Text",
    description: "Foreground text colors, tuned to WCAG contrast on the surface.",
    tokens: [
      { name: "--rialto-text-primary", usage: "Headings, body text, primary labels" },
      { name: "--rialto-text-secondary", usage: "Descriptions, helper text, secondary labels" },
      { name: "--rialto-text-tertiary", usage: "Placeholders, disabled text, timestamps" },
      { name: "--rialto-text-on-accent", usage: "Text on accent-filled backgrounds" },
    ],
  },
  {
    label: "Borders",
    description: "Separators and outlines for cards, inputs, and dividers.",
    tokens: [
      { name: "--rialto-border", usage: "Default borders for cards, inputs, dividers" },
      { name: "--rialto-border-strong", usage: "Emphasized borders, active input outlines" },
    ],
  },
  {
    label: "Accent",
    description: "Amber gold — surgical use for primary actions and focus.",
    tokens: [
      { name: "--rialto-accent", usage: "Primary buttons, focus rings, active/selected states" },
      { name: "--rialto-accent-hover", usage: "Primary button hover state" },
      { name: "--rialto-accent-muted", usage: "Subtle accent backgrounds (selected rows, active tabs)" },
      { name: "--rialto-accent-glow", usage: "Focus ring outer glow" },
    ],
  },
  {
    label: "Semantic",
    description: "Status colors for error, warning, and success states.",
    tokens: [
      { name: "--rialto-error", usage: "Error text, destructive fills, invalid borders" },
      { name: "--rialto-error-muted", usage: "Error alert backgrounds, error badge tints" },
      { name: "--rialto-warning", usage: "Warning text, caution banners, pending states" },
      { name: "--rialto-warning-muted", usage: "Warning alert backgrounds, warning badge tints" },
      { name: "--rialto-success", usage: "Success text, confirmation icons" },
      { name: "--rialto-success-muted", usage: "Success alert backgrounds, success badge tints" },
    ],
  },
  {
    label: "Overlay",
    description: "Scrim behind modal and drawer surfaces.",
    tokens: [{ name: "--rialto-overlay", usage: "Modal/drawer backdrop, scrim behind overlays" }],
  },
];

export const COLOR_TOKEN_NAMES: readonly string[] = COLOR_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.name)
);

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const TYPOGRAPHY_GROUPS: readonly TokenGroup[] = [
  {
    label: "Font families",
    description: "Three families: sans for UI, display for headings, mono for values.",
    tokens: [
      { name: "--rialto-font-sans", usage: "Default body and UI text" },
      { name: "--rialto-font-display", usage: "Display headings, hero text" },
      { name: "--rialto-font-mono", usage: "Code, Kbd, monospaced values" },
    ],
  },
  {
    label: "Type scale",
    description: "A minor-third (1.2) scale from fine print to hero display.",
    tokens: [
      { name: "--rialto-text-xs", usage: "Badges, fine print, legal text" },
      { name: "--rialto-text-sm", usage: "Captions, helper text, timestamps" },
      { name: "--rialto-text-base", usage: "Body text (default size)" },
      { name: "--rialto-text-md", usage: "Subheadings, card titles" },
      { name: "--rialto-text-lg", usage: "Section headings" },
      { name: "--rialto-text-xl", usage: "Page headings" },
      { name: "--rialto-text-2xl", usage: "Major headings, dialog titles" },
      { name: "--rialto-text-3xl", usage: "Hero display text" },
      { name: "--rialto-text-4xl", usage: "Dramatic display, landing pages" },
    ],
  },
  {
    label: "Font weights",
    description: "Restrained weight range, including variable-font intermediates.",
    tokens: [
      { name: "--rialto-weight-light", usage: "De-emphasized text, large display numerals" },
      { name: "--rialto-weight-book", usage: "Between light and regular — subtle de-emphasis" },
      { name: "--rialto-weight-regular", usage: "Body text (default weight)" },
      { name: "--rialto-weight-demi", usage: "Between regular and medium — gentle emphasis" },
      { name: "--rialto-weight-medium", usage: "Labels, headings, emphasized text" },
    ],
  },
  {
    label: "Line heights",
    description: "Leading for headings, body, and long-form prose.",
    tokens: [
      { name: "--rialto-leading-tight", usage: "Headings, single-line labels" },
      { name: "--rialto-leading-normal", usage: "Body text, descriptions" },
      { name: "--rialto-leading-relaxed", usage: "Long-form prose, multi-line descriptions" },
    ],
  },
  {
    label: "Letter spacing",
    description: "Tracking for headings, body, and uppercase labels.",
    tokens: [
      { name: "--rialto-tracking-tight", usage: "Headings, large display text" },
      { name: "--rialto-tracking-normal", usage: "Body text (default tracking)" },
      { name: "--rialto-tracking-wide", usage: "Uppercase labels, badge text, small caps" },
    ],
  },
];

export const TYPOGRAPHY_TOKEN_NAMES: readonly string[] = TYPOGRAPHY_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.name)
);

// ---------------------------------------------------------------------------
// Surfaces & elevation
// ---------------------------------------------------------------------------

export const SURFACE_LEVELS: TokenGroup = {
  label: "Surface levels",
  description: "Background layers composed as stacked panels, base to deepest.",
  tokens: [
    { name: "--rialto-surface", usage: "Page and default component backgrounds" },
    { name: "--rialto-surface-elevated", usage: "Cards, popovers, elevated containers" },
    { name: "--rialto-surface-recessed", usage: "Input fields, slider tracks, recessed channels" },
    { name: "--rialto-surface-matte", usage: "Disabled fills, subtle divider backgrounds" },
    { name: "--rialto-surface-deep", usage: "Heavy separators, decorative dark accents" },
  ],
};

export const ELEVATION_LEVELS: TokenGroup = {
  label: "Elevation",
  description: "Shadow tiers composed on elevated panels, subtle lift to dramatic.",
  tokens: [
    { name: "--rialto-shadow-xs", usage: "Subtle lift — buttons at rest, tags, badges" },
    { name: "--rialto-shadow-sm", usage: "Standard elevation — cards, dropdowns" },
    { name: "--rialto-shadow-md", usage: "Pronounced elevation — hovered cards, active dropdowns" },
    { name: "--rialto-shadow-lg", usage: "Dramatic elevation — modals, floating panels" },
    { name: "--rialto-shadow-pressed", usage: "Recessed inputs, slider tracks, active press" },
    { name: "--rialto-shadow-glass", usage: "Floating frosted-glass overlays" },
    { name: "--rialto-shadow-ambient", usage: "Warm gold halo for CTAs and active selections" },
    { name: "--rialto-shadow-luminous", usage: "Cards lit from within — elevation plus warm bloom" },
  ],
};

export const SURFACE_TOKEN_NAMES: readonly string[] = [
  ...SURFACE_LEVELS.tokens.map((token) => token.name),
  ...ELEVATION_LEVELS.tokens.map((token) => token.name),
];
