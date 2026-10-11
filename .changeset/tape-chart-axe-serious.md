---
"@mattbutlerengineering/rialto": patch
---

Fix axe-serious findings on `TapeChart` and `SegmentedControl`: unselected `SegmentedControl` segments now use `--rialto-text-secondary` (was tertiary, 4.07:1 on the recessed track), checked-in `TapeChart` bar metadata uses primary text (was 4.33:1), and the horizontally scrolling `TapeChart` grid is keyboard-focusable.
