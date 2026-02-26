# Light 3D Card Tilt — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a subtle cursor-tracking 3D tilt effect to Card components via a `tilt` prop, with a specular highlight that follows the mouse.

**Architecture:** A private `useTilt` hook manages all 3D behavior using Framer Motion's `useMotionValue` + `useSpring` for zero-rerender animation. The hook writes rotation to MotionValues and glow position to CSS custom properties on the DOM element directly. Card gains a `tilt?: boolean` prop that activates the hook (disabled for `glass` variant and when `useReducedMotion()` is true). A `::after` pseudo-element provides the specular highlight.

**Tech Stack:** React, Framer Motion (`useMotionValue`, `useSpring`, `useReducedMotion`, `motion.div`, `MotionStyle`), CSS Modules, Vitest + React Testing Library

**Design doc:** `docs/plans/2026-02-22-light-3d-card-tilt-design.md`

---

### Task 1: Create `useTilt` hook

**Files:**

- Create: `src/components/Card/useTilt.ts`

**Step 1: Create the hook file**

```ts
import { useCallback, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion, type MotionStyle } from "framer-motion";

const SPRING = { stiffness: 300, damping: 20, mass: 0.5 };

const NOOP_STYLE: MotionStyle = {};
const noop = () => {};

export function useTilt(
  enabled: boolean,
  maxTilt = 2.5
): {
  ref: (el: HTMLDivElement | null) => void;
  style: MotionStyle;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const elRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const springX = useSpring(rotateX, SPRING);
  const springY = useSpring(rotateY, SPRING);

  const ref = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = elRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // Normalize cursor position to (-1, 1) from center
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      // rotateX is inverted: cursor at top → positive rotation (tilt toward viewer)
      rotateX.set(-ny * maxTilt);
      rotateY.set(nx * maxTilt);

      // Set CSS vars for glow position (as percentages)
      const glowX = ((e.clientX - rect.left) / rect.width) * 100;
      const glowY = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--tilt-glow-x", `${glowX}%`);
      el.style.setProperty("--tilt-glow-y", `${glowY}%`);
    },
    [rotateX, rotateY, maxTilt]
  );

  const onMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    const el = elRef.current;
    if (el) {
      el.style.removeProperty("--tilt-glow-x");
      el.style.removeProperty("--tilt-glow-y");
    }
  }, [rotateX, rotateY]);

  if (!enabled || shouldReduceMotion) {
    return {
      ref: noop,
      style: NOOP_STYLE,
      onMouseMove: noop,
      onMouseLeave: noop,
    };
  }

  const style: MotionStyle = {
    rotateX: springX,
    rotateY: springY,
    transformPerspective: 800,
  };

  return { ref, style, onMouseMove, onMouseLeave };
}
```

**Step 2: Run typecheck to verify it compiles**

Run: `npx tsc --noEmit`
Expected: Clean (0 errors)

**Step 3: Commit**

```bash
git add src/components/Card/useTilt.ts
git commit -m "feat(Card): add useTilt hook for cursor-tracking 3D tilt"
```

---

### Task 2: Add specular highlight CSS

**Files:**

- Modify: `src/components/Card/Card.module.css`

**Step 1: Add `position: relative` and `overflow: hidden` to `.card` and `.flat`**

The `.card` class (line 1-7) and `.flat` class (line 17-22) need `position: relative` and `overflow: hidden` so the `::after` pseudo-element is positioned correctly and clipped at card edges. The `.glass` variant does NOT get these — tilt is excluded for glass.

Add to `.card` (after line 6, before the closing `}`):

```css
position: relative;
overflow: hidden;
```

Add the same two properties to `.flat` (after line 21, before the closing `}`):

```css
position: relative;
overflow: hidden;
```

**Step 2: Add the specular highlight `::after` styles**

Append to the end of `Card.module.css`:

```css
/* ── 3D tilt specular highlight ─────────────── */
.card[data-tilt]::after,
.flat[data-tilt]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    circle 300px at var(--tilt-glow-x, 50%) var(--tilt-glow-y, 50%),
    rgb(255 255 255 / 0.12) 0%,
    transparent 70%
  );
  transition: opacity 0.15s cubic-bezier(0.2, 0, 0, 1);
}

.card[data-tilt]:hover::after,
.flat[data-tilt]:hover::after {
  opacity: 1;
}
```

**Step 3: Run lint to verify**

Run: `npm run lint`
Expected: 0 errors

**Step 4: Commit**

```bash
git add src/components/Card/Card.module.css
git commit -m "style(Card): add specular highlight CSS for 3D tilt effect"
```

---

### Task 3: Integrate `useTilt` into Card component

**Files:**

- Modify: `src/components/Card/Card.tsx`

**Step 1: Update Card.tsx**

The current Card component (`src/components/Card/Card.tsx`) is a simple `forwardRef` wrapping a `<div>`. We need to:

1. Import `motion` and `useReducedMotion` from `framer-motion`
2. Import `useTilt` from `./useTilt`
3. Add `tilt?: boolean` to `CardProps`
4. Change `<div>` → `<motion.div>`
5. Call `useTilt` and merge its ref with the forwarded ref
6. Spread `useTilt`'s style and handlers onto `<motion.div>`
7. Set `data-tilt` attribute when tilt is active

Replace the full contents of `src/components/Card/Card.tsx` with:

```tsx
import { forwardRef, useCallback, type HTMLAttributes, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { useTilt } from "./useTilt";
import styles from "./Card.module.css";

/**
 * A content container with elevated, glass, or flat surface treatments.
 * Use Card to group related content into a visually distinct panel.
 *
 * @example
 * <Card variant="elevated" title="Session Data">
 *   <p>Lap times and telemetry info</p>
 * </Card>
 *
 * @example
 * <Card tilt title="Interactive Card">
 *   <p>Hover to see 3D tilt effect</p>
 * </Card>
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface treatment: `"elevated"` (shadow), `"glass"` (translucent blur), or `"flat"` (no shadow) */
  variant?: "elevated" | "glass" | "flat";
  /** Enable subtle cursor-tracking 3D tilt on hover. Disabled for `glass` variant. */
  tilt?: boolean;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { variant = "elevated", tilt = false, title, subtitle, className, children, ...props },
    forwardedRef
  ) => {
    const tiltEnabled = tilt && variant !== "glass";
    const { ref: tiltRef, style, onMouseMove, onMouseLeave } = useTilt(tiltEnabled);

    // Merge forwarded ref and tilt callback ref
    const mergedRef = useCallback(
      (el: HTMLDivElement | null) => {
        tiltRef(el);
        if (typeof forwardedRef === "function") {
          forwardedRef(el);
        } else if (forwardedRef) {
          forwardedRef.current = el;
        }
      },
      [forwardedRef, tiltRef]
    );

    const variantClass =
      variant === "glass" ? styles.glass : variant === "flat" ? styles.flat : styles.card;

    const classes = [variantClass, className].filter(Boolean).join(" ");

    return (
      <motion.div
        ref={mergedRef}
        className={classes}
        style={style}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        data-tilt={tiltEnabled || undefined}
        {...(props as HTMLMotionProps<"div">)}
      >
        {(title || subtitle) && (
          <div className={styles.header}>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        )}
        {children}
      </motion.div>
    );
  }
);

Card.displayName = "Card";
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean (0 errors)

**Step 3: Run existing tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass (the existing Card smoke test and accessibility test should still work since `tilt` defaults to `false`)

**Step 4: Commit**

```bash
git add src/components/Card/Card.tsx
git commit -m "feat(Card): integrate useTilt hook with tilt prop"
```

---

### Task 4: Add tests

**Files:**

- Modify: `src/components/components.test.tsx`
- Modify: `src/components/interactions.test.tsx`
- Modify: `src/components/accessibility.test.tsx`

**Step 1: Add smoke test for Card with tilt**

In `src/components/components.test.tsx`, find the existing Card smoke test (line 129-132). Add a new test after it:

```tsx
it("Card with tilt", () => {
  render(
    <Card tilt title="Tilt">
      Tilt content
    </Card>
  );
  expect(screen.getByText("Tilt content")).toBeInTheDocument();
});
```

**Step 2: Add interaction test for data-tilt attribute**

In `src/components/interactions.test.tsx`, add import for `Card` at the top alongside existing component imports:

```tsx
import { Card } from "./Card/Card";
```

Then add tests at the end of the `describe('Interaction tests', ...)` block:

```tsx
it("Card with tilt applies data-tilt attribute", () => {
  render(
    <Card tilt title="Tilt">
      Content
    </Card>
  );
  const card = screen.getByText("Content").closest("[data-tilt]");
  expect(card).toBeInTheDocument();
  expect(card).toHaveAttribute("data-tilt");
});

it("Card with tilt on glass variant does not apply data-tilt", () => {
  render(
    <Card tilt variant="glass" title="Glass">
      Content
    </Card>
  );
  const card = screen.getByText("Content").parentElement;
  expect(card).not.toHaveAttribute("data-tilt");
});
```

**Step 3: Add accessibility test for Card with tilt**

In `src/components/accessibility.test.tsx`, find the existing Card accessibility test. Add a new test after it:

```tsx
it("Card with tilt has no violations", async () => {
  const { container } = render(
    <Card tilt title="Tilt Card">
      <p>Content</p>
    </Card>
  );
  expect(await axe(container)).toHaveNoViolations();
});
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + 3 new)

**Step 5: Commit**

```bash
git add src/components/components.test.tsx src/components/interactions.test.tsx src/components/accessibility.test.tsx
git commit -m "test(Card): add smoke, attribute, and a11y tests for tilt prop"
```

---

### Task 5: Add showcase example + update TODO

**Files:**

- Modify: `src/showcase/App.tsx`
- Modify: `TODO.md`

**Step 1: Add tilt card example to showcase**

In `src/showcase/App.tsx`, find the Card section (line 1240). The existing section shows 3 cards in a `cardGrid`. Add a fourth card with `tilt` after the Flat card (after line 1283, before the closing `</div>` of `cardGrid`):

```tsx
<Card tilt title="3D Tilt" subtitle="Hover to interact">
  <p
    style={{
      fontSize: "var(--rialto-text-sm)",
      color: "var(--rialto-text-secondary)",
    }}
  >
    Cursor-tracking tilt with specular highlight. Move your mouse across the card surface.
  </p>
</Card>
```

**Step 2: Update TODO.md**

In `TODO.md`, find the "Priority 4" table (around line 325). Change the "Light 3D effect on surfaces" row status:

Before: `| Light 3D effect on surfaces | Low-Med | Medium | Subtle CSS 3D transforms (perspective, rotateX/Y) on cards/buttons for depth — enhances tactile feel |`

After: `| ~~Light 3D effect on surfaces~~ | Low-Med | Medium | ~~Subtle CSS 3D transforms (perspective, rotateX/Y) on cards/buttons for depth — enhances tactile feel~~ ✅ `<Card tilt>` prop with useTilt hook |`

**Step 3: Run full verification**

Run these sequentially:

```bash
npm run lint
npx tsc --noEmit
npx vitest run
npm run build
```

Expected:

- Lint: 0 errors
- Typecheck: clean
- Tests: all pass
- Build: successful

**Step 4: Commit**

```bash
git add src/showcase/App.tsx TODO.md
git commit -m "docs(Card): add 3D tilt showcase example and update TODO"
```
