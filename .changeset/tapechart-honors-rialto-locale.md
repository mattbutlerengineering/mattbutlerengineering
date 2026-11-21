---
"@mattbutlerengineering/rialto": patch
---

TapeChart dates and numbers now follow `RialtoLocaleProvider`'s locale when no `locale` prop is passed, matching the ADR-028 resolution order (prop, provider, navigator, en-US).
