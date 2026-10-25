# Rialto reference

Design philosophy, token inventories, file maps and background detail, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time a rialto file is read. The rules an agent must obey on every edit stay in CLAUDE.md; the source of truth for token values is `src/tokens/`.

## Design Philosophy

This component library embodies a design language of material honesty, precision surfaces, restrained luxury, and tactile contrast — inspired by premium industrial design.

### Core Principles

1. **Material honesty** — Every surface communicates what it is. Aluminum looks machined. Glass looks translucent. Recessed inputs feel carved.
2. **Surgical color** — The palette is warm neutral aluminum. Gold/amber is the single jewel accent, used only for focus, active states, and primary actions. Never decorative.
3. **Tactile interaction** — Buttons feel like physical controls. Press states show depth change. Toggles have spring-physics detent feel.
4. **Precision restraint** — Less is more. Three font weights maximum. Tight spacing. Small radii for small elements, larger for containers.
5. **Warmth over coldness** — Despite the precision, everything has warm undertones. No blue-grays. No pure black. No pure white.

## Token inventory

### Colors

- Background surfaces: `--rialto-surface`, `--rialto-surface-elevated`, `--rialto-surface-recessed`
- Text: `--rialto-text-primary`, `--rialto-text-secondary`, `--rialto-text-tertiary`
- Borders: `--rialto-border`, `--rialto-border-strong`
- Semantic: `--rialto-error`, `--rialto-warning`, `--rialto-success` + their `*-muted` variants
- Warning is warm amber (#b8862a light / #d4a030 dark) — distinct from gold accent

### Spacing

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

## Component file structure

```
src/components/ComponentName/
├── ComponentName.tsx          # Component + props interface
├── ComponentName.module.css   # Styles using token variables
├── ComponentName.test.tsx     # Unit tests
└── index.ts                   # Re-exports the component + public types
```

## File Organization

```
src/
├── tokens/          # Design tokens (CSS custom properties + motion TS)
├── styles/          # Surface materials, reset, global styles
├── components/      # Component library (one folder per component)
└── showcase/        # Showcase application
```

## Why `useReturnFocus` captures in a layout effect

That hook captures `document.activeElement` in a `useLayoutEffect`, not a plain `useEffect` — layout effects always flush before passive effects regardless of hook-declaration order, so this is what lets the capture win the race against a component's own layout effect that moves focus into its panel on open (getting this backwards is how `DropdownMenu` silently "restored" focus to its own first menu item instead of the real trigger — #5618).

## Exports Map generation

The `exports` field in `package.json` is auto-generated. `pnpm build` runs `vite build && tsx scripts/generate-all.ts` — the latter parses components once and writes `registry.json`, `dist/manifest.json`, and the `package.json` exports map in a single pass.
