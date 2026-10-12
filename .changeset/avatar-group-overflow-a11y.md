---
"@mattbutlerengineering/rialto": patch
---

Fix `AvatarGroup`'s "+N" overflow badge: it had no accessible name (a bare `<div aria-label>` with no role is prohibited from naming per ARIA, and its only text was `aria-hidden`) and its badge text failed WCAG AA contrast against the matte background. The badge now renders `role="img"` and uses `--rialto-text-primary` for its text color.
