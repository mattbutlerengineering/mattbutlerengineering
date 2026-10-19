---
"@mattbutlerengineering/rialto": minor
---

`ChatPanel` now takes a required `stream` prop (`ChatStreamFn`) instead of importing `@mbe/api-client/streaming`, so it resolves for registry consumers. Rialto exports `ChatStreamFn` and `ChatStreamRequest`; pass `streamNDJSON` (or any `(request) => AsyncIterable<unknown>`) as `stream`.
