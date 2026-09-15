---
"@mattbutlerengineering/rialto": patch
---

**Revert: useFocusTrap Tab-wrap boundary re-query at keydown time.** The change shipped in the previous patch (re-querying focusable elements on every Tab keydown instead of once at effect setup) failed post-deploy smoke tests in production and has been reverted via the auto-rollback workflow. `useFocusTrap` is back to querying focusable elements once at effect setup; the dynamic-boundary behavior will be re-investigated in a follow-up issue.
