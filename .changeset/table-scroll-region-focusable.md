---
"@mattbutlerengineering/rialto": patch
---

Make `Table`'s horizontally scrolling wrapper keyboard-reachable while it actually overflows: it now gets `tabIndex={0}`, `role="region"` and the localized "Scrollable content" label (the same as `ScrollArea`), plus the focus ring. A table that fits adds no tab stop. Previously a table with no sortable columns that scrolled on a narrow screen could not be scrolled from the keyboard (axe `scrollable-region-focusable`).
