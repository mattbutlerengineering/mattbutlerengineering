---
"@mattbutlerengineering/rialto": patch
---

CommandPalette moves focus into the search input on open via the documented mount-guard-ref `useEffect` pattern instead of `requestAnimationFrame`, matching Calendar/DateRange/TimeList. No behavior change; the search input still receives focus when the palette opens.
