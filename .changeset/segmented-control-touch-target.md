---
"@mattbutlerengineering/rialto": patch
---

SegmentedControl's compact `size="sm"` segments now get a 44px WCAG 2.5.8 touch-target floor under `(pointer: coarse)`, matching the fix already shipped for `Button.sm` (#4989); mouse/trackpad density is unchanged.
