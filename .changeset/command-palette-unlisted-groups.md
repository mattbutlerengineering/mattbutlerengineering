---
"@mattbutlerengineering/rialto": patch
---

`CommandPalette` no longer drops items whose `group` is missing from the `groups` prop. `groups` now controls order only: listed groups render first, and any other group that has items is appended after them.
