---
"@mattbutlerengineering/rialto": patch
---

An overlay that mounts already open (Drawer, Dialog, Popover and the other `useReturnFocus` users) no longer loses focus to its trigger under React StrictMode. StrictMode replays the mount effects, and the first pass's pending focus restore then pulled focus out of the overlay and back to the element that opened it. A re-run before the restore frame now cancels it and keeps the original trigger, so closing still returns focus there.
