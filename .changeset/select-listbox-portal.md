---
"@mattbutlerengineering/rialto": patch
---

**Fix `Select` listbox being occluded by a sibling `Card`** — the open dropdown is now rendered via `createPortal` to `document.body` and positioned imperatively from the trigger's viewport rect, instead of being absolutely positioned inside the trigger's wrapper. Previously, any ancestor with a CSS stacking context (e.g. `Card`'s `position: relative` + transform-based hover lift) trapped the dropdown's `z-index`, so a `Select` followed by another `Card` painted the listbox underneath that sibling — a mouse/touch click intended for an option landed on the sibling instead (keyboard selection still worked). `useCombobox`'s outside-press detection gained an additive `extraContainerRefs` option so a portaled listbox is still treated as "inside" for dismiss purposes.
