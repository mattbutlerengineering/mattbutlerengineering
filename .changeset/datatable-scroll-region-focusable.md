---
"@mattbutlerengineering/rialto": patch
---

DataTable's scrolling wrapper becomes a keyboard tab stop, named by the table `label` (or "Scrollable content"), only while the grid overflows horizontally, with the rialto focus ring. Matches what Table already does and clears axe `scrollable-region-focusable` on narrow screens.
