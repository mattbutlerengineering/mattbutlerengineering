---
"@mattbutlerengineering/rialto": patch
---

**useFocusTrap: Tab-wrap boundary no longer goes stale during an open session** — the focus trap's `first`/`last` focusable elements were queried once at effect setup and closed over for the trap's lifetime. If a panel's focusable content changed while the trap stayed enabled (a validation error becoming a link, a step adding/removing a field, async content rendering new buttons), the stale boundary let keyboard focus escape the trap on Tab instead of wrapping. The boundary is now re-queried at each Tab keydown, so it always reflects the panel's current DOM. Initial-focus resolution and restore-on-unmount are unchanged.
