---
"@mattbutlerengineering/rialto": patch
---

Route every component CSS transition through the `--rialto-duration-*` tokens so a vibe can retime them. Literal `0.1s`/`0.12s`/`120ms` now read `fast`, `0.15s`/`150ms` read `standard`, and `0.2s`/`0.3s` read `slow`. A new test guards against literal transition times.
