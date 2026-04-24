---
"@mattbutlerengineering/rialto": patch
---

TapeChart: fix layout bugs where room rows rendered 2-per-row (instead of vertically stacked) and the last day header cell wrapped onto a second row. Both caused by CSS grid auto-placement against template-column counts that didn't match the actual child count. Affected any consumer with enough rooms or dates to expose auto-placement — most visible at 24 rooms × 14 days.
