---
"@mattbutlerengineering/rialto": patch
---

Remove the `translateY(-1px)` hover lift from Button's primary and secondary variants. It was previously masked by the framer hover boop; once that went, a pointer resting on a button's bottom edge made it flicker between hovered and unhovered forever (never "stable" to Playwright). Hover is colour and shadow only.
