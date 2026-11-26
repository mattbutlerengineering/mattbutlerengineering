---
"@mattbutlerengineering/rialto": patch
---

`Table` can leave row order to the parent. Set `manualSort` when `data` is one page of a larger list: the table keeps that order, shows `sort` on the header, and reports the next asc/desc choice through `onSortChange`. Omitting `manualSort` still sorts the rows the table was given.
