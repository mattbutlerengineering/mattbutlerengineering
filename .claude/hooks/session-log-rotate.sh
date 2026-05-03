#!/usr/bin/env bash
# SessionStart hook — rotates old session logs.
# Deletes logs older than 90 days; caps at 500 files. Always exits 0.

set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
LOG_DIR="$GIT_ROOT/.claude/session-logs"
[[ -d "$LOG_DIR" ]] || exit 0

find "$LOG_DIR" -name "*.json" -mtime +90 -delete 2>/dev/null

FILE_COUNT=$(find "$LOG_DIR" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$FILE_COUNT" -gt 500 ]]; then
  EXCESS=$((FILE_COUNT - 500))
  find "$LOG_DIR" -name "*.json" -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null \
    | tail -"$EXCESS" \
    | xargs rm -f 2>/dev/null
fi

exit 0
