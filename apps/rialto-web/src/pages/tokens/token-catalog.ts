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

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const MOTION_GROUPS: readonly TokenGroup[] = [
  {
    label: "Duration",
    description: "Timing tokens for state changes, from micro-interactions to deliberate movement.",
    tokens: [
      { name: "--rialto-duration-fast", usage: "Micro-interactions — hover color, icon swaps" },
      { name: "--rialto-duration-standard", usage: "Standard state changes — most UI transitions" },
      { name: "--rialto-duration-slow", usage: "Deliberate movement — card hover lift, panel slide" },
    ],
  },
  {
    label: "Easing",
    description: "Acceleration curves — precision for crisp UI, smooth for gentle entrances.",
    tokens: [
      {
        name: "--rialto-ease-precision",
        usage: "Crisp, instant-feeling transitions and hover states",
      },
      { name: "--rialto-ease-smooth", usage: "Gentle entrances and exits, larger movements" },
    ],
  },
];

export const MOTION_TOKEN_NAMES: readonly string[] = MOTION_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.name)
);

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const SPACING_SCALE: TokenGroup = {
  label: "Spacing scale",
  description: "A 4px-based scale for padding, gaps, and layout rhythm.",
  tokens: [
    { name: "--rialto-space-2xs", usage: "Icon padding, tight chip internals" },
    { name: "--rialto-space-xs", usage: "Badge padding, tight gaps between related items" },
    { name: "--rialto-space-sm", usage: "Button padding, input internal spacing" },
    { name: "--rialto-space-md", usage: "Default component padding, Stack gaps" },
    { name: "--rialto-space-lg", usage: "Card padding, between components in a form" },
    { name: "--rialto-space-xl", usage: "Between card groups, dialog body padding" },
    { name: "--rialto-space-2xl", usage: "Section spacing within a page" },
    { name: "--rialto-space-3xl", usage: "Major page sections" },
    { name: "--rialto-space-4xl", usage: "Hero spacing, full-page layout gaps" },
  ],
};

export const SPACING_TOKEN_NAMES: readonly string[] = SPACING_SCALE.tokens.map((token) => token.name);

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export const RADIUS_SCALE: TokenGroup = {
  label: "Radius scale",
  description: "Corner rounding by hierarchy, from square edges to fully round.",
  tokens: [
    { name: "--rialto-radius-none", usage: "Square corners — flush panels, full-bleed media" },
    { name: "--rialto-radius-sharp", usage: "Chips, badges, small inline elements" },
    { name: "--rialto-radius-default", usage: "Buttons, inputs, standard interactive elements" },
    { name: "--rialto-radius-soft", usage: "Cards, dialogs, containers" },
    { name: "--rialto-radius-round", usage: "Pills, avatars, full-round elements" },
  ],
};

export const RADIUS_TOKEN_NAMES: readonly string[] = RADIUS_SCALE.tokens.map((token) => token.name);

// ---------------------------------------------------------------------------
// Shadows & elevation
// ---------------------------------------------------------------------------

export const SHADOW_GROUPS: readonly TokenGroup[] = [
  {
    label: "Elevation",
    description: "Ambient drop shadows lifting a surface off the page, subtle to dramatic.",
    tokens: [
      { name: "--rialto-shadow-xs", usage: "Subtle lift — buttons at rest, tags, badges" },
      { name: "--rialto-shadow-sm", usage: "Standard elevation — cards, dropdowns" },
      { name: "--rialto-shadow-md", usage: "Pronounced elevation — hovered cards, active dropdowns" },
      { name: "--rialto-shadow-lg", usage: "Dramatic elevation — modals, floating panels" },
    ],
  },
  {
    label: "Interaction & depth",
    description: "Inset and ring shadows for tactile press, focus, and frosted-glass panels.",
    tokens: [
      { name: "--rialto-shadow-pressed", usage: "Recessed inputs, slider tracks, active press" },
      { name: "--rialto-shadow-focus", usage: "Focus-visible ring for interactive elements" },
      { name: "--rialto-shadow-glass", usage: "Floating frosted-glass overlays, command palette" },
    ],
  },
  {
    label: "Warm glow",
    description: "Gold ambient bloom for CTAs and elements that should breathe warmth.",
    tokens: [
      { name: "--rialto-shadow-ambient", usage: "Warm gold halo — CTAs, active selections" },
      { name: "--rialto-shadow-luminous", usage: "Cards lit from within — elevation plus warm bloom" },
    ],
  },
];

export const SHADOW_TOKEN_NAMES: readonly string[] = SHADOW_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.name)
);

// ---------------------------------------------------------------------------
// Icon vocabulary — semantic usage guidance per category.
//
// The icon set itself (concepts, labels, components) is owned by rialto's
// `iconVocabulary`; the docs page reads it live so new icons appear here
// automatically. This map carries only the documentation prose describing how
// each category should be used.
// ---------------------------------------------------------------------------

export interface IconCategoryGuidance {
  /** Human-readable section heading for the category. */
  label: string;
  /** Semantic guidance on when to reach for icons in this category. */
  description: string;
}

export const ICON_CATEGORY_GUIDANCE: Record<string, IconCategoryGuidance> = {
  navigation: {
    label: "Navigation",
    description: "Wayfinding and directional affordances — move between views and reveal structure.",
  },
  actions: {
    label: "Actions",
    description:
      "Verbs the user performs on content — reserve filled or primary styling for the main action.",
  },
  communication: {
    label: "Communication",
    description: "Messaging, notifications, and contact channels.",
  },
  status: {
    label: "Status",
    description: "Outcome and state signals — pair with the matching semantic color, never color alone.",
  },
  content: {
    label: "Content",
    description: "Files, folders, and media objects.",
  },
  user: {
    label: "User",
    description: "People, accounts, and identity.",
  },
  data: {
    label: "Data",
    description: "Sorting, filtering, and quantitative trends.",
  },
  media: {
    label: "Media",
    description: "Playback and capture controls.",
  },
  commerce: {
    label: "Commerce",
    description: "Cart, payment, and fulfillment.",
  },
};
