---
"@mattbutlerengineering/rialto": patch
---

ChatPanel now invokes registry components with json-render's ComponentRenderProps contract ({ element, children, emit, on }) instead of spreading raw props, and nests streamed elements by their children ids (with a cycle guard). Previously every catalog registry component crashed or rendered empty in the chat drawer.
