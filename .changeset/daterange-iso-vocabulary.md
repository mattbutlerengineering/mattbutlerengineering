---
"@mattbutlerengineering/rialto": major
---

**BREAKING: `DateRange` migrated from `Date` objects to `yyyy-mm-dd` ISO strings** (ADR-024), matching the vocabulary `Calendar`/`DatePicker` already use.

- `DateRangeValue`'s `start`/`end` fields are now `string | null` (was `Date | null`)
- `DateRangeProps.min`/`max` are now `string` (was `Date`)
- `isDateDisabled`'s parameter is now an ISO `yyyy-mm-dd` string (was `Date`)

Migrate consumers by replacing `Date` construction/formatting at the `DateRange` boundary with plain ISO strings, e.g. `new Date(2026, 6, 15)` → `"2026-07-15"`.
