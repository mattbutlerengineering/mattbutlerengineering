---
"@mattbutlerengineering/rialto": patch
---

**`rankCommandMatch` now matches its own JSDoc** — the exported `CommandPalette` ranking helper trims its `query` argument before matching and returns `null` (not `0`) for an empty or whitespace-only query, as documented. Internal callers already pre-trim, so `CommandPalette`'s own ranking behavior is unchanged.
