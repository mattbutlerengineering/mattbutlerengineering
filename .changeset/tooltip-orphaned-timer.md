---
"@mattbutlerengineering/rialto": patch
---

`Tooltip`'s `show()` armed a new `setTimeout` on every call without clearing the previous one, so a single ref could only ever track the most recent timer. Since the wrapper binds `show` to both `onMouseEnter` and `onFocus`, hovering a trigger and then clicking it fired `mouseEnter` and `focus` in sequence — two `show()` calls before any `hide()` — orphaning the first timer. `hide()` could no longer reach it, so moving the pointer away and tabbing away left a ghost timer that reopened the tooltip after the delay with nothing hovered or focused. `show()` now keeps at most one pending timer (a no-op if one is already armed, anchoring the delay to the first trigger rather than restarting it on the second), and a new unmount effect clears any pending timer so a trigger that unmounts inside the delay window doesn't leak one. No API change.
