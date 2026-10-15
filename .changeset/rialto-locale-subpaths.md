---
"@mattbutlerengineering/rialto": patch
---

Ship Rialto's built-in text for en-GB, es-MX and fr-CA as subpaths — `@mattbutlerengineering/rialto/locales/en-GB`, `/locales/es-MX`, `/locales/fr-CA` — each typed `RialtoMessages`, for `RialtoProvider`'s `messages` prop (ADR-028). Also fixes missing type declarations for `useRialtoLocale` / `RialtoLocaleProvider` from `./providers`.
