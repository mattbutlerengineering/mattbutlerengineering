---
"@mattbutlerengineering/rialto": patch
---

Add the internal kill-test signature remap: under `data-palette="signature"` (not public API), Button, Input, Select, Card and Tabs repaint through Tier-3 tokens (plum secondary and hover tints, plum caret and selection, a tinted Tabs track). New Tier-3 tokens default to today's values and every new component rule is scoped to that attribute, so nothing renders differently outside it.
