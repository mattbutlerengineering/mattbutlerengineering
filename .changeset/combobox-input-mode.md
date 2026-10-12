---
"@mattbutlerengineering/rialto": patch
---

Combobox now closes its listbox on Tab. `useCombobox` gains an additive `inputMode: "input"` (plus `wrap`) so text-input comboboxes share one keyboard handler: opens with nothing focused, leaves Space and printable keys to the input, skips disabled items, and closes on Tab/Escape. Combobox and Autocomplete use it; ArrowDown/ArrowUp on a closed Autocomplete now open on the first/last item. The default button mode is unchanged.
