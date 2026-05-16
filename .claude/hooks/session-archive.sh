#!/usr/bin/env bash
# Stop hook — archives session-summary.md to .claude/sessions/ if it has real content.
# Always exits 0 to avoid blocking the session end.

set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
SUMMARY="$GIT_ROOT/.claude/session-summary.md"
ARCHIVE_DIR="$GIT_ROOT/.claude/sessions"

[[ -f "$SUMMARY" ]] || exit 0

# Skip if file is still just the template (check for placeholder markers)
if grep -q "_YYYY-MM-DD_" "$SUMMARY" 2>/dev/null; then
  exit 0
fi

# Skip if no real content beyond the template header
LINE_COUNT=$(wc -l < "$SUMMARY" | tr -d ' ')
if [[ "$LINE_COUNT" -lt 10 ]]; then
  exit 0
fi

mkdir -p "$ARCHIVE_DIR"

TIMESTAMP=$(date -u +%Y-%m-%d-%H%M%S)
DEST="$ARCHIVE_DIR/${TIMESTAMP}.md"

cp "$SUMMARY" "$DEST"
echo "Archived session summary to $DEST"

exit 0
