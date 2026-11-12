---
"@mattbutlerengineering/rialto": patch
---

TimePicker opens its list when ArrowDown is pressed on the closed field, as it already does on click, Enter and Space. The list opens with the selected time active and focused, or the first enabled time when the field is empty. ArrowDown inside the open list still moves to the next time.
