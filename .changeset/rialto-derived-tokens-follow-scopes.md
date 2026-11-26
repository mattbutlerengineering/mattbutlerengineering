---
"@mattbutlerengineering/rialto": patch
---

Component tokens and `--rialto-shadow-focus` now re-resolve on `data-surface` and `data-palette` scope elements, and the focus shadow is composed from `--rialto-focus-gap` and `--rialto-focus-ring` (ADR-035). Computed values outside those scopes are unchanged.
