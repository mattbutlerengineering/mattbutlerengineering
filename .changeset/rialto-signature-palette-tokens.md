---
"@mattbutlerengineering/rialto": patch
---

Add the signature palette tokens: `--rialto-surface-tinted` and `--rialto-surface-velvet`, the `--rialto-plum*` and `--rialto-verdigris*` families, and `--rialto-focus-ring` / `--rialto-focus-gap` (defaulting to today's accent and surface). Add `data-surface="tinted" | "velvet"` scopes that re-declare the surface, text, border and focus tokens for content on a mid-tone band (ADR-035). No existing token value changes.
