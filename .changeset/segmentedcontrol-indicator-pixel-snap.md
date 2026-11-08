---
"@mattbutlerengineering/rialto": patch
---

SegmentedControl's sliding indicator now rounds its measured offset and width to whole pixels, so its edge no longer anti-aliases differently run to run with no visual change — the cause of a flaky `rialto-web-e2e` visual snapshot (#8515).
