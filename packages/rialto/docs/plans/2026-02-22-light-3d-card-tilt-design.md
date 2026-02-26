# Light 3D Card Tilt Effect

## Summary

Add a subtle cursor-tracking 3D tilt to Card components. On hover, the card rotates up to 2.5 degrees toward the cursor with a specular highlight that follows the mouse, simulating light reflecting off a physical surface.

## Decisions

- **Scope:** Cards only (not buttons or other surfaces)
- **Trigger:** Mouse hover with cursor tracking
- **Intensity:** 2-3 degrees maximum ("whisper" level)
- **Specular highlight:** Faint white radial gradient follows cursor
- **API:** `<Card tilt>` prop on Card component
- **Glass variant excluded:** `backdrop-filter` conflicts with CSS `perspective` in some browsers

## Architecture

### `useTilt` hook (`src/components/Card/useTilt.ts`)

Private hook, not exported from barrel. Handles all 3D behavior.

**Signature:**

```ts
function useTilt(
  enabled: boolean,
  maxTilt?: number
): {
  ref: (el: HTMLDivElement | null) => void;
  style: MotionStyle;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
};
```

**Behavior:**

1. `onMouseMove` computes cursor position relative to card center as normalized (-1, 1)
2. Maps to `rotateX`/`rotateY` via `useMotionValue` + `useSpring` (zero re-renders)
3. Sets `--tilt-glow-x`/`--tilt-glow-y` CSS vars on the element directly for highlight position
4. `onMouseLeave` springs rotation back to (0, 0) and clears glow vars
5. Returns no-op values when `useReducedMotion()` is true
6. `style` includes `transformPerspective: 800` for the 3D projection

**Performance:** Writes directly to MotionValues and DOM element style, bypassing React re-renders entirely during hover.

### Card changes (`src/components/Card/Card.tsx`)

- Add `tilt?: boolean` to `CardProps`
- Change `<div>` to `<motion.div>` (consistent with Button's `motion.button`)
- When `tilt && variant !== 'glass'`: call `useTilt(true)`, merge refs, spread style + handlers
- Set `data-tilt` attribute when tilt is active

### Specular highlight CSS (`src/components/Card/Card.module.css`)

```css
.card[data-tilt]::after {
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

.card[data-tilt]:hover::after {
  opacity: 1;
}
```

Requires `position: relative; overflow: hidden` on `.card` (overflow to clip the glow at card edges).

## Reduced motion

`useTilt` checks `useReducedMotion()`. When true, returns identity styles and no-op handlers. No tilt, no glow.

## Testing

- Smoke test: Card with `tilt` renders without crashing
- Attribute test: Card with `tilt` applies `data-tilt`
- Accessibility: Card with `tilt` passes axe-core
- Showcase: "3D Tilt" row in Card section

## Files

| File                                                       | Action |
| ---------------------------------------------------------- | ------ |
| `src/components/Card/useTilt.ts`                           | CREATE |
| `src/components/Card/Card.tsx`                             | MODIFY |
| `src/components/Card/Card.module.css`                      | MODIFY |
| `src/components/smoke.test.tsx` or `interactions.test.tsx` | MODIFY |
| `src/components/accessibility.test.tsx`                    | MODIFY |
| `src/showcase/App.tsx`                                     | MODIFY |
| `TODO.md`                                                  | MODIFY |
