---
"@mattbutlerengineering/rialto": patch
---

Remove the hover scale ("boop", 1.03) from Button, Toggle, Checkbox, Pagination, SegmentedControl and Tag, per the motion policy: hover on high-frequency controls is colour/opacity only. Press scale is unchanged. Toggle gains a border-colour hover state; the others already had one.
