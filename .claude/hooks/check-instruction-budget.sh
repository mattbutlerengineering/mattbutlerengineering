#!/usr/bin/env bash
# PostToolUse hook: block at edit time when CLAUDE.md or
# .claude/rules/gotchas.md goes over its byte budget.
#
# Thin wrapper only. The rule lives in scripts/instruction-budget-hook.mjs,
# which reuses scripts/check-instruction-budget.mjs's BUDGET_BYTES so the
# two cannot drift apart. Previously this budget was enforced only in CI's
# docs-only lane (#8396): an agent appended a bullet, pushed, and learned
# about the overflow a CI round later, then compressed by hand under time
# pressure (#8392, #8393, #8397, #8399, #8400).
#
# Blocking: exits 2 (printing file/size/limit to stderr) when the edited
# file is over budget. Fails open (exit 0) for every other file and on any
# internal error (missing root, unreadable file, broken import) so this can
# never deadlock an edit unrelated to the two budgeted files.
set -uo pipefail

file_path="${1:-}"
[[ -z "$file_path" ]] && exit 0

# The tree to ask about is the one the edited file lives in, NOT
# $CLAUDE_PROJECT_DIR: hooks run with that set to the MAIN checkout even for a
# worktree-isolated subagent (see gotchas.md). See check-changeset.sh for the
# same resolution and why the `cd` is load-bearing.
root=$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$root" || ! -d "$root" ]]; then
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
fi
[[ -z "$root" || ! -f "$root/scripts/instruction-budget-hook.mjs" ]] && exit 0
cd "$root" || exit 0

message=$(node "$root/scripts/instruction-budget-hook.mjs" "$file_path" 2>/dev/null)
code=$?
[[ -n "$message" ]] && printf '%s\n' "$message" >&2

exit "$code"
