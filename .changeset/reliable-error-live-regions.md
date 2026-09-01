---
"@mattbutlerengineering/rialto": patch
---

**Reliable, non-duplicated error announcements in `Input`, `NumberInput`, `PinInput`, `Select`, `TextArea`** — error messages now announce via a freshly-mounted `role="alert"` element instead of a conditionally-mounted `role="status"`/`aria-live="polite"` region (Input) or an always-mounted hidden echo region (NumberInput/PinInput/Select/TextArea). `role="alert"` is spec-reliable on insertion-with-content; `status`/`polite` regions are not guaranteed to announce when they are born already populated. This also removes the duplicate DOM text the four siblings carried (visible hint + hidden echo saying the same thing). Non-error announcements (PinInput's "Code complete", TextArea's character counter) are unchanged — they still use the always-mounted polite status region.
