---
date: 2026-05-14
session: acmm-audit
action: Consistently applied immutable data patterns across the entire codebase
context: Spread and structuredClone used instead of mutation everywhere. Pre-commit hooks enforce this in Rialto components.
pattern: Always create new objects via spread operator. Never mutate existing ones. This prevents hidden side effects and enables safe concurrency.
---

## Verification 2026-08-16 (monthly reflection review, #3597)

**"Pre-commit hooks enforce this in Rialto" does not hold as written.** No
hook in `.husky/` or `.claude/hooks/` checks for mutation or `structuredClone`
usage. The Rialto pre-commit hook that does exist bans `setState` inside a
`useEffect` body — a different rule, aimed at render loops rather than
immutability.

The convention itself is real and worth keeping (it is stated in
`.claude/rules/common/coding-style.md` as a CRITICAL rule). It is enforced by
review and by ESLint's general rules, not by a dedicated mutation check.
