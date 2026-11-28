---
"@mattbutlerengineering/rialto": patch
---

fix(tokens): light-mode `--rialto-error` (#b84a3c to #a94134) and `--rialto-text-tertiary` (#747070 to #6c6868) clear 4.5:1 on the recessed surface (and error on the tinted band too); dark mode unchanged. New `--rialto-text-on-error` (light #fdfcfa, dark #1a1918) is the text on an error fill, used by the destructive ConfirmDialog button, so the darker error red keeps 4.5:1 under its label (#9979).
