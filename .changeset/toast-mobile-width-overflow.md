---
"@mattbutlerengineering/rialto": patch
---

Fix Toast container overflowing the viewport on screens ≤480px: the mobile media query anchors the fixed container with both inline insets but inherited `width: 100%`, which over-constrains the box and pushes it past the right viewport edge by the start inset. The container now sizes from its insets (`width: auto`).
