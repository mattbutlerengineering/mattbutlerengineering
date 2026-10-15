---
"@mattbutlerengineering/rialto": patch
---

Alert, Banner, Toast, Dialog, Drawer, Popover, HoverCard and ConfirmDialog now read their built-in text (dismiss/close labels, fallback accessible names, ConfirmDialog default button labels) from `useRialtoLocale()`. With no `RialtoLocaleProvider` the English output is unchanged.
