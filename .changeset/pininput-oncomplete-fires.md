---
"@mattbutlerengineering/rialto": patch
---

Fix `PinInput` `onComplete` never firing. The completion guard was `next.length === length && !next.includes("")`, but `next` is a string and `String.prototype.includes("")` is always `true` — so `!next.includes("")` was always `false` and `onComplete` never fired, on any input. The `includes` check was written for an array (checking for empty cells) but `next` is a string, where `next.length === length` alone already guarantees no empty cells. Removed the dead clause.
