---
"@mattbutlerengineering/rialto": patch
---

`useCombobox` in `inputMode: "input"`: ArrowUp on an open list with no option highlighted now moves to the last enabled option (ArrowDown still moves to the first), instead of doing nothing. Matches the closed-list behaviour and the ARIA APG.
