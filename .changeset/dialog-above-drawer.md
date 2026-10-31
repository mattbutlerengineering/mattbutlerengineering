---
"@mattbutlerengineering/rialto": patch
---

Dialog now stacks above Drawer. A confirm opened beside a Drawer (such as "Discard your changes?") sat underneath the Drawer's overlay, so its buttons could not be clicked. The overlay order is now Drawer, Dialog, CommandPalette, Select menu, Toast, so a command palette opened while a Dialog is up, a Select menu inside a Dialog and a Toast all stay on top.
