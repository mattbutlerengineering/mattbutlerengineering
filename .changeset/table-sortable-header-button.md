---
"@mattbutlerengineering/rialto": patch
---

**Fix `Table` sortable column headers' accessibility semantics** — sortable headers put `onClick`/`onKeyDown`/`tabIndex` directly on the `<th role="columnheader">`, which has no operable semantic role, so many screen readers never announced them as actionable. The click/keyboard interaction now lives on a nested `<button type="button">` wrapping the header label and sort icon (matching the pattern already used by `DataTable`), while `aria-sort` and `role="columnheader"` stay on the `<th>`. Non-sortable columns are unchanged.
