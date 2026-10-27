---
"@mattbutlerengineering/rialto": patch
---

`useFocusTrap` re-queries focusable elements on every Tab instead of caching them at open, so controls added, removed or disabled while a Dialog/Drawer is open no longer let focus escape. Tab or Shift+Tab with focus already outside the panel now pulls it back inside.
