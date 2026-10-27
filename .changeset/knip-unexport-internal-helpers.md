---
"@mattbutlerengineering/rialto": patch
---

Stop exporting internal helpers that nothing imports (Calendar's `toIsoDate` re-export, TapeChart date math and default-string helpers, SilkFlow and WatchLoader internals). No public API change.
