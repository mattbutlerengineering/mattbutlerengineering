---
"@mattbutlerengineering/rialto": minor
---

`useMotionPreset()` now owns reduced motion and boop (ADR-025). It returns two new fields — `reduced` (the one `prefers-reduced-motion` signal) and `boop` (a ready `whileHover` target, at-rest under reduced motion) — and 38 components and hooks now resolve their transitions, boop hover, and reduced-motion check through it instead of importing `tokens/motion` statics or calling framer-motion's `useReducedMotion()`.

Behaviour change: under reduced motion, Popover, DropdownMenu, ContextMenu, HoverCard, ToastAnimated, and AnimatedTag now transition in zero time (previously 0.1s), and Button/Dialog's previously ungated `precision` transitions are instant too. The `boop` and `reduced` exports of `./motion` are deprecated in favour of `useMotionPreset()`; nothing is removed.
