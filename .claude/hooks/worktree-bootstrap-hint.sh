#!/usr/bin/env bash
# SessionStart hook — hints (never acts) when a linked worktree needs
# `pnpm bootstrap:worktree`. A linked worktree's .git is a file, a main
# checkout's is a directory. Always exits 0.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" || exit 0
[[ -n "$ROOT" && -f "$ROOT/.git" ]] || exit 0
[[ -f "$ROOT/scripts/bootstrap-worktree.mjs" ]] || exit 0

OUT=$(cd "$ROOT" && node scripts/bootstrap-worktree.mjs --check 2>/dev/null) || exit 0
if [[ "$OUT" == *"pending"* ]]; then
  echo "worktree needs bootstrap — run: pnpm bootstrap:worktree"
fi

exit 0
