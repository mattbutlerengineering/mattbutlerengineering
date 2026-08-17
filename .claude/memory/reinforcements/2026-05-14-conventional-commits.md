---
date: 2026-05-14
session: acmm-audit
action: Conventional Commits format adopted with commitlint enforcement and zero drift
context: Every commit follows type(scope) description format. Pre-commit hook validates via commitlint. Both humans and AI agents produce consistent commit messages.
pattern: Enforce commit format mechanically via commitlint hook rather than relying on instructions alone.
---

## Verification 2026-08-16 (monthly reflection review, #3597)

**The enforcement half of this entry was never true, or stopped being true.**
`commitlint` appears nowhere in the repo — no config file, no dependency in
any `package.json`, no `commit-msg` hook in `.husky/`, no CI job. The only
other mention was `CONTRIBUTING.md`, which told contributors a pre-commit
hook enforced the style; that claim has been corrected in the same pass.

What survives is the observation, not the mechanism: commit messages in this
repo do follow `type(scope): description` with very little drift. That is
discipline and review, and it should be described that way — an entry that
credits a hook which does not exist teaches the next agent to trust a gate
that will never fire.
