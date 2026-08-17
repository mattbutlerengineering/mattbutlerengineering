---
"@mattbutlerengineering/rialto": patch
---

**Two accessible-name/value defects fixed — both invisible to axe.**

`SegmentedControl` spread `{...props}` onto its outer wrapper while `role="radiogroup"` sat on an inner element, so an `aria-label` passed by a caller named the wrapper and left the radiogroup itself unnamed — for every consumer. `aria-label` and `aria-labelledby` now reach the radiogroup; all other props still land on the wrapper. No API change.

`Meter` reported `aria-valuenow="0"` when it had no value, announcing a definite zero where the truth was unknown. `value` now accepts `null` for "no data". Because `role="meter"` requires `aria-valuenow` and has no ARIA spelling of "unknown", the indeterminate case renders as `role="progressbar"` with `aria-valuenow` omitted — the one role whose contract defines an omitted value as indeterminate — over an unfilled, dimmed track, with `showValue` showing a placeholder instead of `0%`.

Determinate `Meter` behaviour is unchanged. `MeterProps["value"]` widens from `number` to `number | null`, which is source-compatible for callers passing a number.
