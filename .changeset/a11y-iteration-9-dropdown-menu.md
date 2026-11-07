---
"@mattbutlerengineering/rialto": patch
---

A11y audit iteration 9: fix two axe `color-contrast` failures in the open DropdownMenu. The destructive item text is now an error/primary-text mix (the dark-theme error hue was 4.26:1 on the elevated menu), and the shortcut hint on the hovered, focused or active row uses `--rialto-text-secondary` (tertiary was 4.07:1 on the recessed row).
