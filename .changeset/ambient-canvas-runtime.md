---
"@mattbutlerengineering/rialto": patch
---

Extract the generic canvas loop plumbing (DPR-capped resize, rAF playback sync, theme palette re-read, pointer tracking, single teardown) from SilkFlow into an internal shared `_ambient/ambient-canvas` module. SilkFlow behavior is unchanged.
