# RTL / Bi-directional Support

## Summary

Convert all directional CSS properties to logical equivalents across ~23 component CSS module files. Add a showcase RTL toggle for visual verification and an ESLint rule to prevent regressions. No runtime JS changes to components — pure CSS modernization.

## Decisions

- **Approach:** Pure logical properties (not `[dir=rtl]` overrides or PostCSS plugins)
- **Motivation:** Best practice / future-proofing (no immediate RTL consumer)
- **Verification:** Showcase toggle button that sets `dir="rtl"` on the page root
- **Regression prevention:** ESLint rule to flag physical directional properties in CSS

## Property Conversion Map

| Physical                                 | Logical                                       |
| ---------------------------------------- | --------------------------------------------- |
| `margin-left` / `margin-right`           | `margin-inline-start` / `margin-inline-end`   |
| `padding-left` / `padding-right`         | `padding-inline-start` / `padding-inline-end` |
| `left` / `right` (positioning)           | `inset-inline-start` / `inset-inline-end`     |
| `border-left` / `border-right`           | `border-inline-start` / `border-inline-end`   |
| `text-align: left` / `text-align: right` | `text-align: start` / `text-align: end`       |
| `border-top-left-radius` etc.            | `border-start-start-radius` etc.              |

## Special Cases

### `translateX` for centering

`translateX(-50%)` used for centering (Timeline, MegaMenu, Tooltip, Popover, HoverCard) stays as-is. Centering is axis-relative, not direction-relative.

### `translateX` for animations

Skeleton shimmer and Progress indeterminate animations use directional `translateX`. CSS has no logical transform equivalent, so these get `[dir=rtl]` overrides:

```css
/* Example: Skeleton shimmer */
@keyframes shimmer {
  to {
    transform: translateX(100%);
  }
}
[dir='rtl'] .skeleton::after {
  animation-name: shimmer-rtl;
}
@keyframes shimmer-rtl {
  to {
    transform: translateX(-100%);
  }
}
```

### `transform-origin`

6 instances use `left`/`right` in transform-origin. Logical keywords aren't supported for transform-origin yet, so these get `[dir=rtl]` overrides.

## Showcase RTL Toggle

Add a `dir` toggle button (↔ icon) to the existing floating controls bar alongside dark mode and vibe toggles. Sets `dir` attribute on the showcase root `<div>`. Uses `localStorage` for persistence like the dark mode toggle.

## ESLint Rule

Add a `no-restricted-syntax` rule (or `stylelint-use-logical`) that flags directional properties in `.module.css` files. This prevents regressions in new code.

## Audit Results

~48 directional properties across 23 files:

- **margin-left/right:** 15 instances (9 files)
- **padding-left/right:** 8 instances (4 files)
- **left/right positioning:** 24 instances (16 files)
- **border-left/right:** 8 instances (6 files)
- **text-align left/right:** 16 instances (10 files)
- **translateX animations:** 6 instances (3 files) — need `[dir=rtl]` overrides
- **transform-origin:** 6 instances (4 files) — need `[dir=rtl]` overrides
- **border-radius directional:** 4 instances (2 files)

## Files

| Action       | Files                                                         |
| ------------ | ------------------------------------------------------------- |
| MODIFY (~23) | All component `.module.css` files with directional properties |
| MODIFY       | `src/showcase/App.tsx` — RTL toggle                           |
| MODIFY       | ESLint config — logical property rule                         |
| MODIFY       | `TODO.md` — mark complete                                     |

## Testing

- Existing 148 tests pass (CSS-only changes)
- Visual verification via showcase RTL toggle
- Lint rule prevents future regressions
