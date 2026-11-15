---
"@mattbutlerengineering/rialto": patch
---

Fix the AvatarGroup "+N" overflow badge contrast inside dark surfaces (PageHeader): `.darkSurface` now also redefines `--rialto-surface-matte`, so the badge's light text no longer sits on a light matte background (1.4:1 before).
