---
"@mattbutlerengineering/rialto": patch
---

**Fix `ImageUpload` keyboard bypass of the "Replace" button** — the outer tile's keydown handler stayed active even when a preview was showing, so Enter/Space reopened the file picker directly instead of routing through the nested "Replace" button, diverging from mouse behavior (where the tile's click handler was already gated by `hasPreview`) and nesting a real `<button>` inside an ancestor with `role="button"`. Enter/Space on the tile now no-ops when a preview is present; the "Replace" button remains the way to swap the image. No-preview behavior is unchanged.
