---
date: 2026-04-25
session: manual-review
trigger: Bash scripts using `status` as a variable name fail silently in zsh
correction: Use `run_state`, `http_code`, `phase`, or `deploy_phase` instead of `status`
root_cause: Claude Code runs under zsh where `$status` is read-only (zsh equivalent of `$?`). Scripts using `status=$(curl ...)` abort with `read-only variable` error.
prevention: Never use `status` as a shell variable name in Bash tool scripts. Documented in CLAUDE.md and .claude/rules/gotchas.md.
---
