---
"@mattbutlerengineering/rialto": patch
---

`useCombobox` in `inputMode: "input"` no longer calls `preventDefault` on Enter when the list is open but no option is focused, so Enter submits the surrounding form per the ARIA APG editable combobox. This affects Autocomplete and direct `useCombobox` input-mode consumers; Combobox handles open + Enter itself and is unchanged. Enter on a focused option still commits and prevents default.
