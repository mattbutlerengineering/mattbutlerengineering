# Component Authoring Guide

How to create new Rialto components that follow the design system conventions.

---

## File Structure

```
src/components/ComponentName/
├── ComponentName.tsx          # Component + props interface
└── ComponentName.module.css   # Styles using token variables
```

- One folder per component
- PascalCase for folder and file names
- CSS Module file matches component name

---

## Component Template

```tsx
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./ComponentName.module.css";

export interface ComponentNameProps extends ComponentPropsWithoutRef<"div"> {
  /** Primary visual variant */
  variant?: "primary" | "secondary" | "ghost";
  /** Size preset */
  size?: "sm" | "md" | "lg";
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
}

export const ComponentName = forwardRef<HTMLDivElement, ComponentNameProps>(
  ({ variant = "primary", size = "md", disabled, loading, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`${styles.root} ${styles[variant]} ${styles[size]} ${className ?? ""}`}
        data-disabled={disabled || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ComponentName.displayName = "ComponentName";
```

---

## Props Conventions

- **Extend native HTML element props** where appropriate (`ComponentPropsWithoutRef<"button">`)
- **`variant`** — visual variants (e.g., `"primary" | "secondary" | "ghost"`)
- **`size`** — if multiple sizes exist (e.g., `"sm" | "md" | "lg"`)
- **Boolean props** for states: `disabled`, `loading`
- **Always use `forwardRef`** — every component must forward refs
- **Export props interface** as `ComponentNameProps`
- **Use `data-*` attributes** for CSS state selectors instead of class toggling

---

## CSS Module Patterns

```css
/* ComponentName.module.css */

.root {
  /* Use token variables for ALL values */
  padding: var(--rialto-space-sm) var(--rialto-space-md);
  border-radius: var(--rialto-radius-default);
  background: var(--rialto-surface-elevated);
  color: var(--rialto-text-primary);
  border: 1px solid var(--rialto-border);
  font-family: var(--rialto-font-sans);
  transition: all 0.15s var(--rialto-ease-precision);
}

/* States — REQUIRED for every interactive component */
.root:hover:not([data-disabled]) {
  border-color: var(--rialto-border-strong);
  box-shadow: var(--rialto-shadow-md);
}

.root:active:not([data-disabled]) {
  box-shadow: var(--rialto-shadow-pressed);
}

.root:focus-visible {
  outline: none;
  box-shadow: var(--rialto-shadow-focus);
}

.root[data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Variants */
.primary {
  background: var(--rialto-accent);
  color: var(--rialto-text-on-accent);
}

/* Sizes */
.sm { padding: var(--rialto-space-2xs) var(--rialto-space-xs); }
.md { padding: var(--rialto-space-xs) var(--rialto-space-sm); }
.lg { padding: var(--rialto-space-sm) var(--rialto-space-md); }
```

### Key CSS Rules

- **Never hardcode colors, spacing, radii, or easing** — always use `var(--rialto-*)`
- **Use CSS logical properties** — `margin-inline-start`, not `margin-left`
- **All interactive states required**: hover, active, focus-visible, disabled
- **Focus ring**: always `box-shadow: var(--rialto-shadow-focus)` on `:focus-visible`
- **Use `composes`** from `surfaces.module.css` for shared surface patterns

---

## Accessibility Checklist

- [ ] All interactive elements are keyboard accessible (focusable, activatable)
- [ ] Focus states use the gold glow ring (`--rialto-shadow-focus`)
- [ ] ARIA attributes where semantics aren't implicit
- [ ] Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- [ ] Reduced motion: respect `prefers-reduced-motion` media query
- [ ] Form inputs have associated labels (`aria-label` or visible `<label>`)
- [ ] Error states use `aria-invalid="true"` and `aria-describedby`

---

## Motion Rules

- **Framer Motion** for all interactive animations (not CSS transitions)
- **CSS transitions** acceptable only for simple hover color changes
- **Never animate layout properties directly** — use Framer Motion `layout` prop
- **Disabled elements have no motion**
- **Always check `useReducedMotion()`** — skip animation when true

### Motion Presets

| Preset | Type | When to Use |
|--------|------|-------------|
| `precision` | Duration | Standard UI transitions, hover, small movements |
| `spring` | Spring | Toggles, sliders, detent-feel interactions |
| `springGentle` | Spring | Dialogs, drawers, card expansions |
| `reduced` | Duration | Fallback when `useReducedMotion()` returns true |

Import from `"rialto/tokens/motion"` (or `src/tokens/motion.ts`).

---

## Typography Rules

- Body/UI text: `var(--rialto-font-sans)` (DM Sans)
- Display headings: `var(--rialto-font-display)` (Bricolage Grotesque)
- Maximum 3 weights: 300, 400, 500
- Headings: `letter-spacing: var(--rialto-tracking-tight)`
- Type scale: `--rialto-text-xs` through `--rialto-text-4xl`

---

## Testing Requirements

- Unit tests in `ComponentName.test.tsx` alongside the component
- Test keyboard interactions (Tab, Enter, Space, Escape, Arrow keys)
- Test ARIA attribute presence
- Test variant/size class application
- Test disabled state prevents interaction
- Test ref forwarding works

---

## Barrel Export

After creating a component, add it to the barrel export in `src/index.ts`:

```tsx
export { ComponentName } from "./components/ComponentName/ComponentName.js";
export type { ComponentNameProps } from "./components/ComponentName/ComponentName.js";
```
