---
"@mattbutlerengineering/rialto": patch
---

Table renders a column's `ariaLabel` as visually-hidden text inside the `<th>` when `header` is empty, so axe's `empty-table-header` rule (which needs text content, not `aria-label`) passes. Visible layout is unchanged.
