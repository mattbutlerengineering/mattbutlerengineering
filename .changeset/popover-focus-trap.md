---
"@mattbutlerengineering/rialto": patch
---

**Popover: trap keyboard focus and add `aria-modal`** — `Popover`'s panel now uses the shared `useFocusTrap` hook (matching `Dialog`/`Drawer`/`CommandPalette`), so Tab/Shift+Tab cycles only within the open panel instead of letting keyboard users tab out into page content behind it. The panel also now carries `aria-modal="true"` alongside its existing `role="dialog"`, so assistive tech's understanding of the panel matches its actual focus behavior.

Initial-focus behavior is unchanged: the first focusable element in the panel (the Close button, when a `title` is provided) still receives focus on open.
