# Rialto Design System

## Design Philosophy

This component library embodies a design language of material honesty, precision surfaces, restrained luxury, and tactile contrast — inspired by premium industrial design.

### Core Principles

1. **Material honesty** — Every surface communicates what it is. Aluminum looks machined. Glass looks translucent. Recessed inputs feel carved.
2. **Surgical color** — The palette is warm neutral aluminum. Gold/amber is the single jewel accent, used only for focus, active states, and primary actions. Never decorative.
3. **Tactile interaction** — Buttons feel like physical controls. Press states show depth change. Toggles have spring-physics detent feel.
4. **Precision restraint** — Less is more. Three font weights maximum. Tight spacing. Small radii for small elements, larger for containers.
5. **Warmth over coldness** — Despite the precision, everything has warm undertones. No blue-grays. No pure black. No pure white.

---

## Token Usage Rules

### Colors

- **Never hardcode colors.** Always use `var(--rialto-*)` tokens.
- Background surfaces: `--rialto-surface`, `--rialto-surface-elevated`, `--rialto-surface-recessed`
- Text: `--rialto-text-primary`, `--rialto-text-secondary`, `--rialto-text-tertiary`
- Borders: `--rialto-border`, `--rialto-border-strong`
- Gold accent: `--rialto-accent` — ONLY for focus rings, active/selected states, primary action fills
- Semantic: `--rialto-error`, `--rialto-warning`, `--rialto-success` + their `*-muted` variants
- Warning is warm amber (#b8862a light / #d4a030 dark) — distinct from gold accent
- Never use gold for decorative purposes, backgrounds, or text color (except on gold-filled buttons)
- Never hardcode semantic colors — always use the tokens (replaces old `#c49a2a` pattern)

### Typography

- Body/UI text: `var(--rialto-font-sans)` — DM Sans (humanist sans-serif)
- Display headings: `var(--rialto-font-display)` — Bricolage Grotesque (clean, warm grotesque with optical sizing)
- Use display font for Hero titles, PageHeader titles, and `Text variant="display"`
- Use sans font for body text, card titles, buttons, form labels, and all other UI
- Use the type scale tokens: `--rialto-text-xs` through `--rialto-text-4xl`
- Maximum 3 weights: 300 (light), 400 (regular), 500 (medium)
- Headings: slightly tighter letter-spacing via `--rialto-tracking-tight`
- Body: natural letter-spacing

### Spacing

- Base unit: 4px. All spacing uses `--rialto-space-*` tokens.
- Component internal padding: typically `--rialto-space-sm` to `--rialto-space-md`
- Between components: `--rialto-space-lg` to `--rialto-space-xl`
- Section spacing: `--rialto-space-2xl` to `--rialto-space-3xl`

### Radius (hierarchy-based)

- Small elements (badges, chips): `--rialto-radius-sharp` (2px)
- Standard interactive (buttons, inputs): `--rialto-radius-default` (6px)
- Containers (cards, panels): `--rialto-radius-soft` (10px)
- Pills/avatars: `--rialto-radius-round` (9999px)

### Shadows

- Elevation tiers: `--rialto-shadow-xs` → `--rialto-shadow-sm` → `--rialto-shadow-md` → `--rialto-shadow-lg`
- Use `xs` for resting buttons/tags, `sm` for cards, `md` for hovered cards, `lg` for modals/floating panels
- Back-compat alias: `--rialto-shadow-elevated` = `--rialto-shadow-sm`
- Pressed/active states: `--rialto-shadow-pressed` (inset)
- Focus states: `--rialto-shadow-focus` (gold glow)
- Glass panels: `--rialto-shadow-glass`

### Easing

- **Never hardcode easing curves.** Use `var(--rialto-ease-precision)` for crisp transitions
- Use `var(--rialto-ease-smooth)` for gentle entrances and exits
- All CSS transitions must use easing tokens, not raw `cubic-bezier()`

### Direction / RTL

- **Always use CSS logical properties** instead of physical directional properties:
  - `margin-inline-start` / `margin-inline-end` (not `margin-left` / `margin-right`)
  - `padding-inline-start` / `padding-inline-end` (not `padding-left` / `padding-right`)
  - `inset-inline-start` / `inset-inline-end` (not `left` / `right`)
  - `border-inline-start` / `border-inline-end` (not `border-left` / `border-right`)
  - `text-align: start` / `text-align: end` (not `text-align: left` / `text-align: right`)
- **Exception — `transform-origin`:** Does not support logical keywords. Use `left`/`right` with a `[dir='rtl']` override.
- **Exception — `translateX` in animations:** Centering (`translateX(-50%)`) is axis-relative and stays as-is. Directional animations (shimmer, progress) need RTL keyframe variants with `[dir='rtl']` selector.

---

## Motion Rules

### When to use precision easing

- Standard UI transitions (hover, color changes, opacity)
- Small movements (< 4px translation)
- State changes that should feel instant and crisp ("rotary click")
- Import: `precision` from `src/tokens/motion.ts`

### When to use spring physics

- Toggle switches, sliders — anything with a "detent" feel
- AI-driven elements, generative content
- Larger movements (dialogs entering, cards expanding)
- Elements that should feel organic and physical
- Import: `spring` or `springGentle` from `src/tokens/motion.ts`

### General motion rules

- Framer Motion for all animations (not CSS transitions for interactive elements)
- CSS transitions are acceptable for simple hover color changes
- Never animate layout properties directly (use Framer Motion `layout` prop)
- Disabled elements have no motion

---

## Component Authoring Patterns

### File structure

```
src/components/ComponentName/
├── ComponentName.tsx          # Component + props interface
├── ComponentName.module.css   # Styles using token variables
├── ComponentName.test.tsx     # Unit tests
└── index.ts                   # Re-exports the component + public types
```

**Also wire up:**
- Add `export * from "./ComponentName";` to `src/components/index.ts` (the root barrel — components invisible to consumers otherwise)
- Add an axe-core entry in `src/components/accessibility.test.tsx` to guarantee WCAG compliance
- For the showcase app, three touch points: `apps/rialto-web/src/pages/<category>/ComponentNamePage.tsx`, a `lazy()` import + route in `apps/rialto-web/src/routes.tsx`, and a nav entry in `apps/rialto-web/src/data/nav-sections.ts`
- Rebuild the package (`pnpm build`) before typechecking `apps/rialto-web` — consumer sees new exports only via regenerated `.d.ts` files

### Props API conventions

- Extend native HTML element props where appropriate
- `variant` prop for visual variants (e.g., `"primary" | "secondary" | "ghost"`)
- `size` prop if multiple sizes exist (e.g., `"sm" | "md" | "lg"`)
- Boolean props for states: `disabled`, `loading`
- Use `React.forwardRef` for all components
- Export props interface as `ComponentNameProps`

### Styling approach

- CSS Modules for scoping (`.module.css` files)
- All visual values from CSS custom properties — no hardcoded colors, spacing, or radii
- Surface recipes from `surfaces.module.css` composed into component styles
- State styles (hover, active, focus, disabled) are required for every interactive component
- Use `composes` in CSS modules to share surface patterns

### Accessibility requirements

- All interactive elements must be keyboard accessible
- Focus states use the gold glow ring (`--rialto-shadow-focus`)
- ARIA attributes where semantics aren't implicit
- Color contrast: text on surfaces must meet WCAG AA (4.5:1 for normal text)
- Reduced motion: respect `prefers-reduced-motion` media query
- Focus shifts after a state change: use `useEffect` with a mount-guard ref, NOT `requestAnimationFrame`. testing-library doesn't await rAF callbacks, so tests time out.
- Reading a ref's `.current` in JSX triggers `react-hooks/refs` ESLint error — keep values used in render in state, not refs.

---

## File Organization

```
src/
├── tokens/          # Design tokens (CSS custom properties + motion TS)
├── styles/          # Surface materials, reset, global styles
├── components/      # Component library (one folder per component)
└── showcase/        # Showcase application
```

## AI Assistant Reference

For component usage reference (choosing components, props API, composition patterns),
see `llms-full.txt` in the repo root (or `llms.txt` for a condensed overview).
This file (CLAUDE.md) covers authoring and contributing to Rialto;
llms-full.txt covers consuming the library in an application.

## Commands

- `pnpm dev` — Start dev server (run from monorepo root)
- `pnpm build` — Build library for production
- `pnpm test` — Run unit tests
- `pnpm typecheck` — Type-check without emitting
