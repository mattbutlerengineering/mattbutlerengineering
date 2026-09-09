---
"@mattbutlerengineering/rialto": patch
---

**`RialtoProvider` now syncs `<meta name="theme-color">` on theme change** — the two static, media-keyed `theme-color` tags every app ships in `index.html` only track the OS `prefers-color-scheme` query, so an explicit in-page theme toggle (independent of OS preference) left the mobile browser chrome color stale after switching themes. `RialtoProvider` now mutates both tags' `content` to the resolved theme's `--rialto-surface` value on every theme change, keeping the frame in sync with the rendered page. The static tags are left in place unchanged as the pre-hydration/no-JS fallback.
