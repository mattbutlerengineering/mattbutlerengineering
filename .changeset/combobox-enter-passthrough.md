---
"@mattbutlerengineering/rialto": patch
---

`useCombobox` in `inputMode: "input"` (Combobox, Autocomplete) no longer calls `preventDefault` on Enter when the list is open but no option is focused, so Enter submits the surrounding form per the ARIA APG editable combobox. Enter on a focused option still commits and prevents default.
