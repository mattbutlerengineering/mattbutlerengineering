---
"@mattbutlerengineering/rialto": patch
---

Popover no longer dismisses on a press inside a descendant portaled to `document.body` (such as a `Select` listbox), so mouse picks in a Select inside a Popover now register. `useDismiss` gains an optional `isInside` predicate.
