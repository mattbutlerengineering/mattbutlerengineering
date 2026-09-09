---
"@mattbutlerengineering/rialto": patch
---

**Reliable error announcements in `Combobox`** — the error hint now announces via a freshly-mounted `role="alert"` element (mutually exclusive, distinctly-keyed from the plain hint span) instead of toggling `role="alert"` on an always-mounted node. `role="alert"` is spec-reliable on insertion-with-content; toggling `role` on a pre-existing node is not guaranteed to announce. Converges `Combobox` on the shape #4841 already applied to `Input`, `NumberInput`, `PinInput`, `Select`, and `TextArea`. The listbox's polite live region (open/loading/result-count announcements) is unaffected — it was already a separate, always-mounted node.
