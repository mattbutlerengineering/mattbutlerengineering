---
"@mattbutlerengineering/rialto": patch
---

NeonSign: the unlit (closed) tube now uses `--rialto-text-secondary` instead of `--rialto-border`, so its text meets WCAG AA 4.5:1 on the recessed housing in both themes. PageHeader: add an optional `breadcrumbLabel` prop to name the breadcrumb `<nav>` so a page with several headers keeps unique landmarks. Defaults to the localized "Breadcrumb" — existing consumers see no change.
