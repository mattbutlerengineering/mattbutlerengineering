---
"@mattbutlerengineering/rialto": patch
---

ChatPanel now surfaces `permission_denied` events (a blocked-tool alert) and `tool_status` events (a status line naming the running tool) from the chat stream instead of ignoring them. `useChatStream` returns the new `activeTool` and `permissionDenials` fields.
