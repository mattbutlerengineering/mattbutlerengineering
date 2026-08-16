---
id: ADR-025
title: Resolve Motion Presets Through Context, Not Imported Constants
status: active
date: 2026-08-15
---

# ADR-025: Resolve Motion Presets Through Context, Not Imported Constants

## Context

ADR-022 earned the vibe seam: `VibeOverrides` — a map of `--rialto-*` CSS
custom properties — is fed by two adapters (a static preset lookup and a
runtime device-driven one), merged by `RialtoProvider` onto a wrapper `<div>`,
and inherited by every child through the CSS cascade.

Designing a vibe that changes how the interface _feels_ (issue #3978) exposed
the seam's reach. Motion in Rialto lives in two places, and the CSS-var seam
reaches only one of them. Measured across `packages/rialto/src/components`:

| Channel                        | Extent                                                                                              | Reachable by a CSS var? |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------- |
| CSS `transition:` declarations | 92 total — easing tokenized in 40, duration in only 6 (the rest hardcode `0.1s` / `0.15s` / `0.3s`) | Yes, once tokenized     |
| `framer-motion` configs        | 56 component files, 37 importing static constants from `tokens/motion.ts`                           | **No**                  |

A `framer-motion` transition is a plain JavaScript object. No CSS custom
property can rewrite one. So a vibe expressed purely as `VibeOverrides` can
change spacing, radii, colour, and — once durations are tokenized — the timing
of CSS transitions, while leaving every spring, every `AnimatePresence`
entrance, and every digit roll exactly as it was. A design language that
cannot change how motion behaves is not carrying the half of the language that
matters most for feel.

The same gap applies to `prefers-reduced-motion`. Zeroing duration tokens
stops CSS transitions travelling; it does nothing to a spring.

## Decision

**Components ask the environment for their motion config instead of importing
a constant.** A new hook, `useMotionPreset()`
(`packages/rialto/src/providers/useMotionPreset.ts`), returns the
`precision` / `spring` / `springGentle` configs resolved from the current
environment. Call sites change from

```ts
import { precision } from "../../tokens/motion";
```

to

```ts
const { precision } = useMotionPreset();
```

This is a **second seam of the same shape as ADR-022's**, not a competing
mechanism: one interface, resolved from the environment, with `tokens/motion.ts`
playing the role `vibes.ts` plays on the CSS side — the static default the
runtime adapters vary from.

### The no-throw contract

`useMotionPreset()` **must never throw**, and therefore must never call
`useUIEnvironment()`, which throws when no `RialtoProvider` is above it. It
reads `useDeviceContext()` instead — a provider-free `useSyncExternalStore`
hook.

This is load-bearing rather than defensive. Rialto is published to npm, and
external consumers render its components standalone. A throwing hook adopted
inside a catalog component would silently convert that component into a
provider-only component: a breaking change for every external consumer,
shipped as a feature. A regression test renders the hook with no provider and
asserts both halves — it does not throw, and it still honours reduced motion.

### Reduced motion

Every preset collapses to `{ duration: 0 }`. Spring physics are dropped
outright rather than shortened, because a fast spring still overshoots, and
overshoot is motion. The state change still happens and still renders; it
lands in one frame instead of travelling. Non-motion tokens are untouched, so
feedback continues to arrive through contrast, weight, and border.

## Consequences

- **Two ways to obtain a motion config coexist during migration.** Components
  not yet migrated keep importing the constants. This is intended and bounded:
  the initial backfill covers only the components a pilot route exercises, and
  a catalog-wide migration is future work, not a prerequisite.
- **Motion becomes environment-dependent.** A component's animation is no
  longer readable from its own imports alone. The hook's name and single
  responsibility are the mitigation.
- **Reduced motion gains a real implementation.** Previously each component
  handled `useReducedMotion()` itself, in 71 files, with no shared definition
  of what "reduced" means for a spring. There is now one answer.
- **CSS durations still need tokenizing to be vibe-adjustable.** The hook
  fixes the JS channel only; 86 of 92 CSS transitions still hardcode duration.

## Alternatives Considered

### Leave `framer-motion` alone; ship the vibe as CSS overrides only

**Rejected.** It is the cheapest option and it concedes the point: the vibe
would be provably unable to change how the interface feels, which is the one
thing the vibe exists to do.

### Move all motion into CSS and drop `framer-motion`

**Rejected.** A far larger migration than the problem warrants, and it would
lose spring physics, which CSS cannot express. The JS channel exists for good
reasons; it just needed a seam.

### Prop-drill the motion config

**Rejected.** Every animated component would gain a prop that almost every
caller would leave at its default — configuration noise, and it puts the
burden on consumers to thread the environment through by hand.

### A provider-required hook that throws outside a provider

**Rejected.** Consistent with `useUIEnvironment` and fails loudly, but see the
no-throw contract above: it would break external npm consumers rendering these
components standalone.

## See Also

- **ADR-022**: Earn the Vibe Seam with a Second (Reduced-Data) Adapter — the
  CSS-side seam this decision mirrors on the JS side.
- **ADR-001**: Design System Unification (Rialto over Tailwind) — the token
  foundation both seams ride on.
- **`docs/features/rialto-game-ui/architecture.md`**: the feature run that
  surfaced the gap, including the measurements quoted above.
- **Issue #3978**: the originating idea.
