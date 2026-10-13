---
"@mattbutlerengineering/rialto": minor
---

Combobox now closes its listbox on Tab. `useCombobox` gains an additive `inputMode: "input"` (plus `wrap`) so text-input comboboxes share one keyboard handler: opens with nothing focused, leaves Space and printable keys to the input, skips disabled items, and closes on Tab/Escape. Combobox and Autocomplete use it; ArrowDown/ArrowUp on a closed Combobox now open with the first/last enabled option highlighted (previously nothing was highlighted), and on a closed Autocomplete they open on the first/last item. Home/End stay with the input caret in input mode (Combobox still uses them to jump within the list). The default button mode is unchanged.
