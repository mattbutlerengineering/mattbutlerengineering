---
"@mattbutlerengineering/rialto": patch
---

**`NavigationMenu`: bridge keyboard focus into dropdown panels** — a `NavTrigger` with children had no `onKeyDown` handler, so ArrowDown/ArrowUp/Home/End/Escape presses while focused on the trigger never reached the panel's existing roving-focus handler, and every child link was `tabIndex={-1}`. Keyboard-only users could open a dropdown but had no way to move focus into it or activate any child link (a WCAG 2.1.1 Keyboard failure). The trigger button now shares the same `onKeyDown` handler as the panel, so ArrowDown from the trigger correctly moves focus to the first child menuitem, and the existing roving behavior continues once focus is inside.
