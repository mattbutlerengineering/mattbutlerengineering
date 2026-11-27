---
"@mattbutlerengineering/rialto": patch
---

A Button marked `aria-disabled="true"` keeps its disabled look but receives pointer presses again, so its `onClick` runs on a mouse or touch tap (only native `disabled` sets `pointer-events: none`).
