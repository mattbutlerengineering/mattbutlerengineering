---
"@mattbutlerengineering/rialto": patch
---

A Popover opened inside a Dialog (DatePicker, DateRangePicker, TimePicker) now paints the opaque `--rialto-surface-elevated` in light and dark, with no backdrop blur. The translucent glass fill let the dialog body and scrim blend into the text's background, so a DatePicker's weekday row failed axe `color-contrast` (#747070 on #efeeec, 4.21:1). A Popover on a plain page keeps its glass surface.
