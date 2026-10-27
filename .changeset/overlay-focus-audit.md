---
"@mattbutlerengineering/rialto": patch
---

Overlay focus audit (#7803). `useFocusTrap` now skips hidden, `inert`, `display: none`, `input[type=hidden]` and `tabindex="-1"` controls when choosing the initial target and the wrap ends. `Popover` no longer lands initial focus on its Close button. `DropdownMenu` and `ContextMenu` close on Tab and let focus move on instead of staying open (and the return-focus restore no longer pulls it back; `useReturnFocus` now returns a `skipRestore` function for that). `NavigationMenu` returns focus to its trigger on Escape.
