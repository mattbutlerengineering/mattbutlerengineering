#!/usr/bin/env bash
# SessionStart hook — hints when a worktree needs `pnpm bootstrap:worktree`.
# A linked worktree's .git is a file (gitdir: pointer); a main checkout's
# .git is a directory — this only ever hints inside a linked worktree.
# Shares --check with the CLI (bootstrap-worktree.mjs) so "needs bootstrap"
# has one definition. Hints only, never installs/builds. Always exits 0.

set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -f "$GIT_ROOT/.git" ]] || exit 0

SCRIPT="$GIT_ROOT/scripts/bootstrap-worktree.mjs"
[[ -f "$SCRIPT" ]] || exit 0

OUTPUT=$(node "$SCRIPT" --check 2>/dev/null) || exit 0

if [[ "$OUTPUT" == *"pending"* ]]; then
  echo "worktree needs bootstrap — run: pnpm bootstrap:worktree"
fi

exit 0
