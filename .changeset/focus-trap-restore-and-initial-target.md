---
"@mattbutlerengineering/rialto": patch
---

**Dialog/Drawer: fix focus trap initial target and restore-on-unmount** — `useFocusTrap` no longer defaults keyboard focus to a dismiss/Close button; it now skips any element marked `data-focus-trap-skip-initial` (Dialog and Drawer mark their Close buttons this way) and falls back to the first remaining focusable element. Consumers can also pass an explicit `{ initialFocus }` ref to `useFocusTrap` to target a specific element.

`useReturnFocus` now restores focus to the trigger both when `open` transitions to `false` and when the component unmounts entirely while still open (previously only the former was handled) — fixing the case where a parent stops rendering the Dialog/Drawer instead of toggling `open` first.

Both changes are additive and backward compatible; no existing consumer usage changes behavior unless it relies on the Close button receiving initial focus.
