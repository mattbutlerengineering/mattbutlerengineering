---
"@mattbutlerengineering/rialto": patch
---

**`CommandPalette` ranks its matches** — results are ordered by how well each label matches the query instead of by `items` order: a label that starts with the query ranks above one where a later word starts with it, above a plain substring, above an initials match; groups reorder by the best match they contain (ties keep `groups` order), so Enter and ArrowDown act on the strongest match rather than the first group's first item. The initials match is now strict — each query character has to open the next word and the query cannot be longer than the label has words — so "walk" no longer surfaces "Waitlist". The rule is exported as the pure `rankCommandMatch(label, query)` (`0 | 1 | 2 | 3 | null`) for consumers that want to apply it themselves. An empty query still lists every item in `groups` order.
