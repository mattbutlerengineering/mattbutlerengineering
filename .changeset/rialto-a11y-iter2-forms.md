---
"@mattbutlerengineering/rialto": patch
---

A11y iteration 2 (form components): Select exposes `aria-required` and names its listbox from `aria-label`/`aria-labelledby`; NumberInput ignores arrow keys and disables its steppers when `readOnly`; PinInput cells carry `aria-invalid`/`aria-required`; Autocomplete names its listbox, clears `aria-activedescendant` when closed or empty, closes on Tab, and merges a consumer `aria-describedby` with its hint.
