---
"@mattbutlerengineering/rialto": patch
---

`Combobox`, `Autocomplete` and `DropdownMenu` no longer clip inside a `Dialog`: they lift their list into the dialog's layer and place it by the trigger's viewport rect, flipping and capping to the room available. A Dialog-hosted `Popover` now clamps every placement into the viewport and re-caps its height when its content grows after opening.
