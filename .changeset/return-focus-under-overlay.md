---
"@mattbutlerengineering/rialto": patch
---

An overlay that closes while another one is open on top (Drawer, Dialog, Popover and the other `useReturnFocus` users) no longer pulls focus back to its trigger behind that overlay, where a key press would act on what the overlay covers. Focus stays in the overlay on top. A trigger inside the topmost overlay, such as a dialog closing over its drawer, is restored as before.
