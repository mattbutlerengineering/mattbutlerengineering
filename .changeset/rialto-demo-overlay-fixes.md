---
"@mattbutlerengineering/rialto": patch
---

PageHeader accepts `--rialto-page-header-padding-block-start` so a shell can clear fixed chrome without shrinking the design padding. In dark mode the Combobox listbox paints the opaque elevated surface, including the empty "No results" row, instead of the translucent glass fill. Dialog's overlay carries `data-rialto-dialog-overlay` so a sticky header can sit beneath the modal.
