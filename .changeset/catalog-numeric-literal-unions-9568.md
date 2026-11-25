---
"@mattbutlerengineering/rialto": patch
---

Catalog generator now emits `z.union([z.literal(n), ...])` for numeric-literal union props (e.g. `weekStartsOn`, `headingLevel`) instead of silently dropping them. Heading's `level`/`size` no longer need a hand-written catalog override — the generator now derives their schema from the `HeadingLevel` type directly.
