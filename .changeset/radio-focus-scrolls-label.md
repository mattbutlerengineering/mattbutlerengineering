---
"@mattbutlerengineering/rialto": patch
---

Focusing a Radio or Checkbox now scrolls its whole label into view. The hidden native input covers its label (transparent and click-through) instead of sitting as a 1px clipped box, so a tall option inside a scrolling container is no longer left cut off at the edge when it takes keyboard focus.
