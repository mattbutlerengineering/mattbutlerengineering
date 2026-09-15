---
"@mattbutlerengineering/rialto": patch
---

**`Drawer` gains `size="compact"`** — a fourth size for a panel that sits beside a working surface rather than replacing it. `side="bottom"` renders at `min(40vh, 240px)` (a tablet bottom sheet that leaves the rows above it readable — `default`'s `min(50vh, 480px)` covered all but three); `side="right"` / `side="left"` render at `min(320px, calc(100vw - 48px))`. The three existing sizes are unchanged.
