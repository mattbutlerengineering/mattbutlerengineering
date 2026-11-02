---
"@mattbutlerengineering/rialto": patch
---

Dialog panel is now opaque in light and dark (it used the translucent glass recipe, so content behind it ghosted through). A long dialog scrolls its body, description included, while the title and footer stay in view, and short viewports (down to the 320x256 reflow size) tighten the chrome so the footer stays reachable. An overflowing body is a keyboard-focusable region; one that fits adds no tab stop. A Popover opened inside a Dialog (DatePicker, DateRangePicker, TimePicker) now renders in the dialog's layer, flipping to the roomier side, so the scrolling body no longer clips it.
