---
"@mattbutlerengineering/rialto": patch
---

**`useEscapeKey` ignores an Escape whose default was already prevented** — a listbox nested inside a `Dialog`/`Drawer` (rialto `Autocomplete`/`Combobox`, or an app composition over `useCombobox`) calls `preventDefault()` on the Escape that closes it; the overlay's document-level handler now treats that as "already consumed" and no longer closes on the same keypress. An unconsumed Escape closes the overlay exactly as before.
