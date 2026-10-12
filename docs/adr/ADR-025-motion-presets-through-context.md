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

## Amendment 2026-10-11: the hook owns reduced motion and boop (#6279)

**Status of this amendment:** decided. It ships in PR #6328, which is batch 1
of #6279. The sections above are unchanged. Where they describe the hook as
returning only `precision` / `spring` / `springGentle`, or describe framer's
`useReducedMotion()` as an acceptable signal during migration, this amendment
supersedes them.

### What the hook returns

`useMotionPreset()` returns three more fields than the Decision lists:

- **`tilt`**: the `useSpring` config `useTilt` reads. It has no instant form;
  under reduced motion `useTilt` switches tilt off at the source instead. It
  shipped in the same PR as this ADR (#4252), together with the `game` vibe
  preset, but the Decision above never listed it.
- **`reduced`** (new in #6328): whether the user prefers reduced motion.
- **`boop`** (new in #6328): a `whileHover` target ready to pass as-is. Under
  reduced motion it is `{ scale: 1, transition: { duration: 0 } }`.

### One reduced-motion signal

`reduced` is **the single source** for the reduced-motion preference. It comes
from `useDeviceContext()`, the same read that resolves every transition field,
so the no-throw contract holds unchanged. Transition fields already resolve
reduced motion inside the hook, so callers never hand-build a
`reduced ? { duration: 0 } : preset` fallback. A component that has to choose a
keyframe target (for example, dropping a slide offset from `initial`) reads
`reduced`. It **must not** call framer-motion's `useReducedMotion()`.

### Sanctioned remainder (bounded, tracked under #6279)

Batch 1 migrated 38 components and hooks. This ADR sanctions the following as
a bounded transition, the same way the original Consequences sanctioned
unmigrated importers. Each will be migrated in the #6279 follow-up:

- The nine remaining `useReducedMotion()` call sites. Each uses the flag as a
  behaviour gate (canvas/RAF loops, CSS classes, timers), not to pick a
  transition config: `Avatar`, `DepartureBoard`, `Ferrofluid`, `Handshake`,
  `NeonSign`, `SilkFlow`, `SplitFlap`, `WatchLoader`, and
  `hooks/useScrollReveal.ts`.
- `hooks/useBoop.ts`'s import of the deprecated `boop` token constant. It needs
  the spring physics for `useSpring`, which the reduced `boop` field does not
  carry. It already reads the reduced-motion preference from `reduced`.

**2026-10-11, transition complete (batch 2 of #6279).** The sanctioned
remainder above is gone. All nine call sites read `useMotionPreset().reduced`,
and `useBoop` takes its spring from the preset's `boop` field instead of the
deprecated token. No rialto source calls framer-motion's `useReducedMotion()`.
`src/test/setup.ts` now mocks that hook to throw, so any component that calls
it fails the tests that render it, and
`src/test/motion/no-framer-reduced-motion.test.tsx` checks the tripwire is
armed. Batch 2 also makes `useDeviceContext` read the media queries on its
first snapshot instead of on its first subscribe, which happens after the first
commit. framer's hook was synchronous, so without this change a reduced-motion
user's first mount would have started a canvas loop or timer for one commit.

### Deprecations

The `boop` and `reduced` exports of `tokens/motion.ts` (published as
`./motion`) are deprecated in favour of `useMotionPreset().boop` and the hook's
own instant transitions. They are deprecated, not removed. Removing them would
be a breaking change for npm consumers. The `precision` / `spring` /
`springGentle` statics are not deprecated. They remain the defaults the hook
returns and may still be imported outside a component.
