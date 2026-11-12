---
"@mattbutlerengineering/rialto": patch
---

DatePicker can take a typed date, open on a chosen month, and puts focus on a day when it opens.

- `editable` (off by default) lets a date be typed into the field: ISO `yyyy-mm-dd`, the locale's numeric order (`6/20/2024`), or a month name with a day (`Jun 20, 2024`). A date typed without a year is its next occurrence from today; a typed year needs four digits and must be 1000 or later. Text that is not a date, or a date that `min`, `max` or `isDateDisabled` refuses, stays in the field with a problem beneath it (`aria-invalid` and `aria-describedby`) and calls `onChange(null)`. An editable field opens its calendar on ArrowDown or from the calendar button rather than on a click in the field.
- `defaultMonth` (on DatePicker and Calendar) names a date whose month the calendar opens on while the value is empty, such as the start date for an end-date field.
- When the calendar opens, focus now lands on the selected day, or on today when nothing is selected, instead of on the previous-month button. This applies to every DatePicker, and to a Calendar placed first inside any rialto dialog, drawer or popover.
- New message keys `enterDate`, `dateTooEarly`, `dateTooLate` and `dateUnavailable`, translated for es-MX and fr-CA.
