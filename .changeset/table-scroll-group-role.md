---
"@mattbutlerengineering/rialto": patch
---

`Table`'s scrolling wrapper is now `role="group"` instead of `role="region"` while it overflows. Every overflowing table shared the "Scrollable content" name, so a page with several tables failed axe `landmark-unique`. The wrapper stays focusable and labelled.
