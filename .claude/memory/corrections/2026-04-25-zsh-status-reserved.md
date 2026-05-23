---
date: 2026-04-25
session: manual-review
trigger: Bash scripts using `status` as a variable name fail silently in zsh
correction: Use `run_state`, `http_code`, `phase`, or `deploy_phase` instead of `status`
root_cause: Claude Code runs under zsh where `$status` is read-only (zsh equivalent of `$?`). Scripts using `status=$(curl ...)` abort with `read-only variable` error.
prevention: Never use `status` as a shell variable name in Bash tool scripts. Documented in CLAUDE.md and .claude/rules/gotchas.md.
feeds_back_into: CLAUDE.md#bash-tool-quirks, .claude/rules/gotchas.md#pre-commit--lint
---

## Summary

Claude Code executes Bash tool calls under zsh, not bash. In zsh, `$status` is a read-only special variable (equivalent to `$?` in bash). Any script that assigns `status=$(some command)` will abort immediately with `read-only variable: status`. The failure is silent and easy to miss because the same code works fine in bash. Safe drop-in replacements are `run_state`, `http_code`, `phase`, or `deploy_phase`. This is a recurring trap for cross-shell habits — bash developers don't encounter it because bash allows redefining `$status`. The constraint is documented in `CLAUDE.md` under Bash tool quirks.
