---
"@mattbutlerengineering/rialto": patch
---

Popover panel is now opaque in light and dark (it used the translucent glass fill, so what sat behind it blended into the text's background). A DatePicker opened inside a Dialog failed axe `color-contrast` on its weekday row (#747070 on #efeeec, 4.21:1); the panel now paints `--rialto-surface-elevated` and keeps the glass border, shine and shadow.
