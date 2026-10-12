---
"@mattbutlerengineering/rialto": patch
---

fix: one Escape now closes only the topmost open overlay. `useEscapeKey` keeps a module-level overlay stack, so a Dialog over a Drawer, or a Popover inside a Dialog, no longer both close on a single keypress; the next Escape reaches the layer beneath. Hook signature unchanged.
