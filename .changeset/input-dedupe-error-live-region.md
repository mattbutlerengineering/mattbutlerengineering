---
"@mattbutlerengineering/rialto": patch
---

**`Input`: fixed a duplicate error-message node** — when `error` and `hint` were both set, the hint text was rendered twice: once in the visible hint `<span>`, and again in a separate, always-mounted, visually-hidden `aria-live="polite"` region intended only to announce it to screen readers. Both nodes carried identical text, so any DOM-text query (`textContent`, `getAllByText`) returned the message doubled, even though sighted users only ever saw it once.

The visible hint `<span>` now doubles as the live region — it gains `role="status"`/`aria-live="polite"`/`aria-atomic="true"` when `error` is true, instead of a second hidden `<span>` echoing the same text. `aria-describedby` still points at the same stable id, and the "announces the error hint via a polite status region" contract is unchanged.
