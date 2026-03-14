# Rialto Motion + AppBar + Marketing Polish

**Date:** 2026-03-14
**Status:** Approved

## Problem

The marketing site Hero section is premium and animated (spring stagger, atmospheric gradient mesh, machined edge). Everything below it — Projects, About, Contact — drops to static blocks with no entrance animations or micro-interactions. The custom navbar pattern is duplicated between marketing and rialto-web.

## Design

### 1. `useScrollReveal` hook (packages/rialto)

A Framer Motion hook that triggers `staggerReveal` variants when an element scrolls into the viewport.

**API:**
```tsx
const { ref, controls } = useScrollReveal({ margin?: string, once?: boolean });
```

- `margin` — IntersectionObserver rootMargin, default `"-80px"` (triggers slightly before fully visible)
- `once` — trigger only once, default `true`
- Returns `ref` (attach to container) and `controls` (pass to `animate`)
- Respects `prefers-reduced-motion` via `useReducedMotion` — if reduced, starts in `"visible"` state

**Implementation:** Uses `useInView` from Framer Motion + `useAnimationControls`. When `inView` becomes true, fires `controls.start("visible")`.

**Usage:**
```tsx
import { useScrollReveal, staggerReveal } from "@mbe/rialto";

const { ref, controls } = useScrollReveal();

<motion.div ref={ref} variants={staggerReveal.container} initial="hidden" animate={controls}>
  {items.map(item => (
    <motion.div key={item.id} variants={staggerReveal.item}>{item}</motion.div>
  ))}
</motion.div>
```

**File:** `packages/rialto/src/hooks/useScrollReveal.ts`
**Export from:** `packages/rialto/src/lib-entry.ts`

### 2. `<AppBar>` component (packages/rialto)

Horizontal sticky top bar with glass surface.

**Props:**
```tsx
interface AppBarProps extends HTMLAttributes<HTMLElement> {
  logo?: ReactNode;
  actions?: ReactNode;
  glass?: boolean;       // default true
  height?: string;       // default "56px"
}
```

**Styling:**
- Composes `.glass` from `surfaces.module.css` when `glass` is true
- `position: sticky; top: 0; z-index: var(--rialto-z-sticky)`
- Flexbox: `justify-content: space-between; align-items: center`
- Padding: `var(--rialto-space-sm) var(--rialto-space-lg)`
- Border-bottom: `1px solid var(--rialto-border)`
- Entrance animation: fade + slide-down from -8px on mount (springGentle)

**Files:**
- `packages/rialto/src/components/AppBar/AppBar.tsx`
- `packages/rialto/src/components/AppBar/AppBar.module.css`
- `packages/rialto/src/components/AppBar/index.ts`
- Add to `packages/rialto/src/components/index.ts`

### 3. Marketing site motion polish (apps/marketing)

| Section | Change |
|---------|--------|
| Navbar | Replace custom `Navbar.tsx` + `Navbar.module.css` with `<AppBar>` from Rialto |
| Projects | Wrap card grid in `useScrollReveal` with `staggerReveal` variants |
| About | Wrap paragraphs in `useScrollReveal` — text fades up sequentially |
| Contact | Wrap links in `useScrollReveal` + add `boop` hover scale to link buttons |
| Section separators | Add machined accent edge lines between sections (reuse Hero `::after` gradient pattern via a shared CSS class) |

### 4. Out of scope (YAGNI)

- No `<Section>` wrapper component — padding is simple with tokens
- No `<Grid>` component — CSS grid one-liners don't need abstraction
- No parallax effects — complexity without proportional payoff
- No hospitality app changes — different layout needs
- No rialto-web AppBar migration — can be done later as follow-up

## Implementation Order

1. `useScrollReveal` hook in Rialto (no dependencies)
2. `<AppBar>` component in Rialto (depends on existing glass surface)
3. Marketing: replace navbar with AppBar
4. Marketing: add scroll reveal to Projects, About, Contact sections
5. Marketing: add section separator accent lines
6. Build + test + verify
