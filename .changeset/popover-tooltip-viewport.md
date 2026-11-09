---
"@mattbutlerengineering/rialto": patch
---

Popover and Tooltip now stay inside the viewport (#8569). The Popover panel is always placed by the trigger's viewport rect (viewport-fixed, in the Dialog layer inside a Dialog), flips above/below to the roomier side, clamps horizontally, and caps its height so tall content scrolls inside the panel. The Tooltip bubble is nudged back inside the viewport and wraps long text instead of clipping.
