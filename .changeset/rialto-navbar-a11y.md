---
"@mattbutlerengineering/rialto": patch
---

Navbar: name the root nav landmark (new optional `label` prop, default "Main navigation"; consumer `aria-label`/`aria-labelledby` still wins) and link each submenu toggle to its submenu via `aria-controls` while expanded.
