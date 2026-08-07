---
"@mattbutlerengineering/rialto": minor
---

Add `DateRangePicker` — a popover-hosted date-range field composing `Popover` + `DateRange`. Controlled via a `DateRangeValue` of ISO `yyyy-mm-dd` strings, matching the vocabulary `Calendar`/`DatePicker`/`DateRange` already share (ADR-024). Picking the first endpoint keeps the popover open; completing the range (or pressing Escape) closes it and returns focus to the trigger.
