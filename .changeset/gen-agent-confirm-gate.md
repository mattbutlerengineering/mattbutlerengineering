---
"@mattbutlerengineering/rialto": patch
---

ChatPanel's confirm now sends the confirmed action's toolName and toolInput, matching the gen-agent server's new confirmation gate, which executes exactly the input the user approved (at most once) instead of running write tools before confirmation.
