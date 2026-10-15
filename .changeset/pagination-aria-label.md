---
"@mattbutlerengineering/rialto": patch
---

Add an optional `ariaLabel` prop to `Pagination` so a page rendering more than one instance can give each `<nav>` landmark a distinct accessible name, satisfying axe's `landmark-unique` rule. Defaults to `"Pagination"` — existing consumers see no change.
