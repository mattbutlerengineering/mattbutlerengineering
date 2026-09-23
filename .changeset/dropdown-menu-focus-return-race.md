---
"@mattbutlerengineering/rialto": patch
---

**`DropdownMenu`: fix focus not returning to the trigger on close** — `useReturnFocus` captured `document.activeElement` in a plain `useEffect`, but `DropdownMenu`'s own "focus the first menu item on open" effect runs in a `useLayoutEffect`, which always flushes before passive effects regardless of hook-declaration order. That meant `useReturnFocus` captured the just-focused menu item as "the trigger" instead of the element that actually opened the menu, so closing the menu (Escape, selecting an item, or clicking the trigger again) left focus stranded on the menu instead of returning it. `useReturnFocus`'s capture now runs in a `useLayoutEffect` too, so it always wins the race against any consumer that moves focus into its panel from a layout effect. Dialog, Drawer, CommandPalette, Popover, and ContextMenu already captured correctly (their focus-stealing effects are passive) and are unaffected.
