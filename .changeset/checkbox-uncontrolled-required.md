---
"@mattbutlerengineering/rialto": minor
---

**Checkbox: uncontrolled mode via new `defaultChecked` prop** — a `Checkbox` rendered without `checked`/`onCheckedChange` previously stayed permanently unchecked (React pinned the input at the `checked = false` default). It now holds internal state seeded from `defaultChecked` when `checked` is not provided, updated on the input's `onChange` handler. Fully controlled usage (`checked` + `onCheckedChange`) is unchanged.

The `required` prop, previously declared on `CheckboxProps` but never applied, now reaches the native input as `required` and `aria-required`.
