---
date: 2026-04-25
session: manual-review
trigger: Bash scripts using `status` as a variable name fail silently in zsh
correction: Use `run_state`, `http_code`, `phase`, or `deploy_phase` instead of `status`
root_cause: Claude Code runs under zsh where `$status` is read-only (zsh equivalent of `$?`). Scripts using `status=$(curl ...)` abort with `read-only variable` error.
prevention: Never use `status` as a shell variable name in Bash tool scripts. Documented in .claude/rules/gotchas.md under Shell (zsh).
feeds_back_into: .claude/rules/gotchas.md#shell-zsh
---

## Summary

Claude Code executes Bash tool calls under zsh, not bash. In zsh, `$status` is a read-only special variable (equivalent to `$?` in bash). Any script that assigns `status=$(some command)` will abort immediately with `read-only variable: status`. The failure is silent and easy to miss because the same code works fine in bash. Safe drop-in replacements are `run_state`, `http_code`, `phase`, or `deploy_phase`. This is a recurring trap for cross-shell habits — bash developers don't encounter it because bash allows redefining `$status`. The constraint is documented in `.claude/rules/gotchas.md` under Shell (zsh).

## Verification 2026-09-20 (monthly reflection review, #4876)

**Both `feeds_back_into` references were wrong; corrected above.** The lesson
itself re-verified as still true — `.claude/rules/gotchas.md` § Shell (zsh)
carries it, and the zsh behaviour is unchanged.

- `CLAUDE.md#bash-tool-quirks` **did not resolve.** No such heading exists in
  this repo's `CLAUDE.md` (its h2 list runs Communication -> Core reference ->
  Behavioral Guidelines -> ... -> Cross-Session Memory). "Bash tool quirks" is
  a section of the _user's_ global `~/.claude/CLAUDE.md`, which is not in the
  repo — so this reference could never have resolved for any reader of this
  checkout.
- `.claude/rules/gotchas.md#pre-commit--lint` **resolved but pointed at the
  wrong section.** Measured: that section contains zero mentions of `zsh` or
  `$status`; the trap lives under `## Shell (zsh)` (`#shell-zsh`).

The second one is the more interesting failure, and the reason the new
`scripts/check-memory-refs.mjs` gate deliberately does not claim to catch it:
a reference can resolve perfectly and still be wrong about _where the lesson
went_. Only the dangling-path half is mechanically checkable; pointing at a
real-but-irrelevant section stays a human judgement in this review.
