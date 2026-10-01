---
"@mattbutlerengineering/rialto": patch
---

**useFocusTrap: skip disabled elements when choosing a trap candidate** — `FOCUSABLE_SELECTOR` (shared by `Dialog`, `Drawer`, and every other overlay built on `useFocusTrap`) previously matched `button`/`input`/`select`/`textarea` elements regardless of `disabled` state. A panel whose first (or only) focus candidate was disabled silently failed to receive initial focus, since `.focus()` on a disabled element is a no-op. Disabled elements are now excluded from both initial focus and Tab-wrap; `[href]` links (which have no native `disabled` attribute) are unaffected.
