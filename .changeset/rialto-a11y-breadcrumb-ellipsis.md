---
"@mattbutlerengineering/rialto": patch
---

Navigation a11y (audit iteration 5): Breadcrumb hides its collapsed "…" placeholder from the list, collapses correctly at `maxItems={1}`, and now forwards rest props to the `nav` (a consumer `aria-label`/`aria-labelledby` overrides the default "Breadcrumb"). Pagination renders its controls as a list and moves focus to the current page when Next/Previous becomes disabled.
