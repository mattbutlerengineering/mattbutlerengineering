---
"@mattbutlerengineering/rialto": patch
---

Add `RialtoLocaleProvider` and `useRialtoLocale()` (from `@mattbutlerengineering/rialto/providers`), plus optional `locale` and `messages` props on `RialtoProvider`, for localizing Rialto's built-in text (ADR-028). The hook never throws: with no provider it returns en-US messages and an `undefined` locale, so existing consumers see no change.
