---
"@mattbutlerengineering/rialto": patch
---

`PinInput` renders every cell when the value is empty or partial. `chars` was derived via `value.padEnd(length, "").slice(0, length).split("")`, but `String.prototype.padEnd` with an empty fill string is a documented no-op — so an empty `value` rendered zero cells, and a partial value rendered only `value.length` cells instead of `length`. Cells are now derived from `length` directly (`Array.from({ length }, (_, i) => value[i] ?? "")`), so the field always renders exactly `length` cells regardless of how much has been typed. No API change.
