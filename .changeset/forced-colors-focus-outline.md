---
"@mattbutlerengineering/rialto": patch
---

Keep keyboard focus visible in forced-colors mode (Windows High Contrast). Focus rings drawn with `box-shadow` now also declare a transparent `outline` (`--rialto-focus-ring-width`) instead of `outline: none`, so the browser repaints it in a system colour when it strips shadows. No change outside forced-colors mode.
