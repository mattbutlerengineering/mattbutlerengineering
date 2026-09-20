---
"@mattbutlerengineering/rialto": patch
---

**Button: 44px touch-target floor on `size="sm"` under coarse-pointer (touch) devices** — the compact `.sm` size variant rendered at 23px tall with no minimum, well under the WCAG 2.5.8 target-size minimum for touch. `Button.module.css` now adds `min-block-size: 44px` to `.sm` scoped strictly behind `@media (pointer: coarse)`, so mouse/trackpad density is unchanged and every existing `size="sm"` call site picks up the fix automatically.
