---
"@mattbutlerengineering/rialto": patch
---

ChatPanel: cancelling a proposed action now marks the proposing reply ("Cancelled. Nothing was changed.") and sends that outcome with the next request, so the model stops re-asking. Adds the `actionCancelled` locale key and an optional `note` on `ChatMessage`.
