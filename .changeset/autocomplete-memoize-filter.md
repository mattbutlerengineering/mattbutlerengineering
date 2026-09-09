---
"@mattbutlerengineering/rialto": patch
---

**`Autocomplete`: memoize the filtered options list** — `filtered` (and the `comboboxItems` alias fed into `useCombobox`) is now computed via `useMemo`, keyed on `options` and the current input value, instead of running a full `.filter()` over the entire options list on every render. Matches the pattern already used in `CommandPalette`. No behavior change — this is purely a stability/perf fix for unrelated re-renders.
