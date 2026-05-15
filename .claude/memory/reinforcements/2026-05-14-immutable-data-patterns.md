---
date: 2026-05-14
session: acmm-audit
action: Consistently applied immutable data patterns across the entire codebase
context: Spread and structuredClone used instead of mutation everywhere. Pre-commit hooks enforce this in Rialto components.
pattern: Always create new objects via spread operator. Never mutate existing ones. This prevents hidden side effects and enables safe concurrency.
---
