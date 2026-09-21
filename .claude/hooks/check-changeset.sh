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

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$root" || ! -f "$root/scripts/changeset-hook.mjs" ]] && exit 0

advisory=$(node "$root/scripts/changeset-hook.mjs" "$file_path" 2>/dev/null) || true
[[ -n "$advisory" ]] && printf '%s\n' "$advisory" >&2

exit 0
