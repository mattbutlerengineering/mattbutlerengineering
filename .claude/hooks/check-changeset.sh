#!/usr/bin/env bash
# PostToolUse hook: warn when an edit changes rialto's published source and
# the change in progress carries no changeset.
#
# Thin wrapper only. The rule lives in scripts/changeset-hook.mjs, which
# reuses the same pure functions as the CI gate (scripts/check-rialto-
# changeset.mjs) so the two cannot drift apart again. The previous version of
# this hook counted every file in .changeset/, which made it permanently
# silent once the release queue stopped being drained — see the module header.
#
# Advisory, never blocking: always exits 0, prints at most a stderr note.
# node's own stderr is discarded so a broken import cannot spray a stack
# trace into the model-facing stderr surface on every edit.
set -uo pipefail

file_path="${1:-}"
[[ -z "$file_path" ]] && exit 0

# The tree to ask about is the one the edited file lives in, NOT
# $CLAUDE_PROJECT_DIR: hooks run with that set to the MAIN checkout even for a
# worktree-isolated subagent (measured 2026-10-15, see gotchas.md). That made
# this hook silent for every worktree edit — changeset-hook.mjs resolves the
# repo root itself, in its own CWD, so from the main checkout a worktree path
# fell outside the root and `toRepoRelativePath` handed the rule an absolute
# path it never matches. The `cd` is what puts that resolution in the right
# tree; the project dir stays as the fallback.
root=$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$root" || ! -d "$root" ]]; then
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
fi
[[ -z "$root" || ! -f "$root/scripts/changeset-hook.mjs" ]] && exit 0
cd "$root" || exit 0

advisory=$(node "$root/scripts/changeset-hook.mjs" "$file_path" 2>/dev/null) || true
[[ -n "$advisory" ]] && printf '%s\n' "$advisory" >&2

exit 0
