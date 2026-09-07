---
"@mattbutlerengineering/rialto": patch
---

`ChatPanel` now surfaces send failures inline as an assistant-side error message with a "Try again" action, instead of silently leaving the composer stuck. `useChatStream` gained a `retry()` that replays the last request without requiring the user to retype it.
