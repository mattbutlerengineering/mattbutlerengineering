# Token Enforcement

All visual values must come from Rialto CSS custom properties. Never hardcode colors, spacing, radii, easing, or shadows.

---

## Surfaces

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-surface` | `#f8f6f3` | Page backgrounds, default component bg |
| `--rialto-surface-elevated` | `#fdfcfa` | Cards, popovers, elevated containers |
| `--rialto-surface-recessed` | `#edeae5` | Input fields, slider tracks, channels |
| `--rialto-surface-matte` | `#d8d4cd` | Disabled fills, subtle divider bg |
| `--rialto-surface-deep` | `#a8a49d` | Heavy separators, decorative accents |

**Rule**: Never use raw hex for backgrounds. Always `var(--rialto-surface-*)`.

---

## Text

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-text-primary` | `#1a1918` | Headings, body text, primary labels |
| `--rialto-text-secondary` | `#6b6660` | Descriptions, helper text |
| `--rialto-text-tertiary` | `#9e9890` | Placeholders, disabled text, timestamps |
| `--rialto-text-on-accent` | `#fdfcfa` | Text on gold/accent-filled backgrounds |

**Rule**: Never use `color: black` or `color: #333`. Always use text tokens.

---

## Borders

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-border` | `#d8d4cd` | Default borders (cards, inputs) |
| `--rialto-border-strong` | `#b8b4ad` | Emphasized borders, active outlines |

---

## Accent (Gold — Surgical Use Only)

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-accent` | `#c4922a` | Primary buttons, focus rings, active states |
| `--rialto-accent-hover` | `#d4a23a` | Primary button hover |
| `--rialto-accent-muted` | `rgb(196 146 42 / 0.12)` | Selected rows, active tab bg |
| `--rialto-accent-glow` | `rgb(196 146 42 / 0.35)` | Focus ring outer glow |

**Rule**: Gold accent is ONLY for:
- Focus rings on interactive elements
- Active/selected state indicators
- Primary action button fills
- Text on gold-filled backgrounds (`--rialto-text-on-accent`)

**Never use gold for**: decorative purposes, backgrounds, body text, borders, dividers, or icons.

---

## Semantic

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-error` | `#b84a3c` | Error text, destructive action labels |
| `--rialto-error-muted` | `rgb(184 74 60 / 0.1)` | Error alert/badge backgrounds |
| `--rialto-success` | `#7a8a3c` | Success text, confirmation indicators |
| `--rialto-success-muted` | `rgb(122 138 60 / 0.1)` | Success alert/badge backgrounds |

**Rule**: Never hardcode `red` or `green`. Use semantic tokens.

---

## Shadows

| Token | When to Use |
|-------|-------------|
| `--rialto-shadow-xs` | Resting buttons/tags |
| `--rialto-shadow-sm` | Cards at rest |
| `--rialto-shadow-md` | Hovered cards |
| `--rialto-shadow-lg` | Modals, floating panels |
| `--rialto-shadow-elevated` | Alias for `sm` — cards, dropdowns, popovers |
| `--rialto-shadow-pressed` | Recessed inputs, slider tracks, active press (inset) |
| `--rialto-shadow-focus` | Focus-visible ring on all interactive elements (gold glow) |
| `--rialto-shadow-glass` | Floating glass panels, command palette |

---

## Radius (Hierarchy-Based)

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-radius-none` | `0` | No rounding |
| `--rialto-radius-sharp` | `2px` | Chips, badges, small elements |
| `--rialto-radius-default` | `6px` | Buttons, inputs, interactive elements |
| `--rialto-radius-soft` | `10px` | Cards, dialogs, containers |
| `--rialto-radius-round` | `9999px` | Pills, avatars, full-round |

**Rule**: Radius correlates with element hierarchy. Small elements get small radii, containers get larger.

---

## Spacing (4px Base)

| Token | Value | When to Use |
|-------|-------|-------------|
| `--rialto-space-2xs` | `4px` | Icon padding, tight chip internals |
| `--rialto-space-xs` | `8px` | Badge padding, tight gaps |
| `--rialto-space-sm` | `12px` | Button padding, input spacing |
| `--rialto-space-md` | `16px` | Default component padding |
| `--rialto-space-lg` | `24px` | Card padding, form gaps |
| `--rialto-space-xl` | `32px` | Between card groups, dialog body |
| `--rialto-space-2xl` | `48px` | Section spacing |
| `--rialto-space-3xl` | `64px` | Major page sections |
| `--rialto-space-4xl` | `96px` | Hero spacing, full-page gaps |

**Rule**: Never use raw pixel values. Always `var(--rialto-space-*)`.

---

## Easing

| Token | When to Use |
|-------|-------------|
| `--rialto-ease-precision` | Crisp transitions (hover, color changes, small movements) |
| `--rialto-ease-smooth` | Gentle entrances and exits |

**Rule**: Never hardcode `cubic-bezier()`. Always use easing tokens for CSS transitions.

For interactive animations, use Framer Motion presets instead:
- `precision` — standard UI transitions
- `spring` — toggles, sliders, detent-feel
- `springGentle` — dialogs, drawers, card expansions
- `reduced` — fallback when `useReducedMotion()` is true

---

## Typography

| Font | Token | When to Use |
|------|-------|-------------|
| DM Sans | `--rialto-font-sans` | Body text, buttons, labels, all UI |
| Bricolage Grotesque | `--rialto-font-display` | Hero titles, PageHeader, `Text variant="display"` |

- Maximum 3 weights: 300 (light), 400 (regular), 500 (medium)
- Headings: `--rialto-tracking-tight` for tighter letter-spacing
- Type scale: `--rialto-text-xs` through `--rialto-text-4xl`

---

## Anti-Patterns

| Wrong | Correct |
|-------|---------|
| `color: #1a1918` | `color: var(--rialto-text-primary)` |
| `background: #f8f6f3` | `background: var(--rialto-surface)` |
| `border-radius: 6px` | `border-radius: var(--rialto-radius-default)` |
| `padding: 16px` | `padding: var(--rialto-space-md)` |
| `gap: 24px` | `gap: var(--rialto-space-lg)` |
| `box-shadow: 0 1px 3px rgba(0,0,0,0.1)` | `box-shadow: var(--rialto-shadow-sm)` |
| `transition: all 0.2s ease` | `transition: all 0.2s var(--rialto-ease-precision)` |
| `color: #c4922a` | `color: var(--rialto-accent)` |
| `background: red` | `background: var(--rialto-error)` |
| `margin-left: 8px` | `margin-inline-start: var(--rialto-space-xs)` |
