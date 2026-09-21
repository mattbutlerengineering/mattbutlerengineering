#!/usr/bin/env bash
# Stop hook — archives .claude/session-summary.md into .claude/sessions/ when
# the scratchpad holds real session content.
#
# The guard is a byte comparison against the checked-in pristine template
# (.claude/session-summary.template.md), NOT a grep for the `_YYYY-MM-DD_`
# placeholder. That grep was the whole defect (#5598): session-summary.md was
# both the template and the live scratchpad, so the placeholder it looked for
# sat permanently in the metadata table, the skip branch was taken on every
# run, and the archive stayed empty from #910 to #5598. A genuinely filled-in
# summary usually still carries that placeholder in rows its author had nothing
# to say about, so it was never a signal about content in the first place.
#
# Re-archiving is suppressed by the same comparison against what is already in
# .claude/sessions/. Nothing resets the scratchpad, so without that check an
# unchanged summary would be copied again at every session end — the noise
# #5598 objected to. Comparing content rather than tracking state also means a
# hand-renamed archive (the README's YYYY-MM-DD-<slug> convention) keeps working.
#
# Always exits 0 — a Stop hook must never block the end of a session.

set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-}"
[[ -n "$ROOT" ]] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -n "$ROOT" ]] || exit 0

SUMMARY="$ROOT/.claude/session-summary.md"
TEMPLATE="$ROOT/.claude/session-summary.template.md"
ARCHIVE_DIR="$ROOT/.claude/sessions"

[[ -f "$SUMMARY" ]] || exit 0

# No reference to compare against: skip rather than archive blind.
[[ -f "$TEMPLATE" ]] || exit 0

# Nothing but whitespace is not a summary.
grep -q '[^[:space:]]' "$SUMMARY" 2>/dev/null || exit 0

# Still the untouched template.
cmp -s "$SUMMARY" "$TEMPLATE" && exit 0

# Already archived verbatim by an earlier session end.
if [[ -d "$ARCHIVE_DIR" ]]; then
  for existing in "$ARCHIVE_DIR"/*.md; do
    [[ -f "$existing" ]] || continue
    cmp -s "$SUMMARY" "$existing" && exit 0
  done
fi

mkdir -p "$ARCHIVE_DIR" || exit 0

STAMP=$(date -u +%Y-%m-%d-%H%M%S)
DEST="$ARCHIVE_DIR/${STAMP}.md"
# Two session ends in the same second must not clobber each other's summary.
SUFFIX=2
while [[ -e "$DEST" ]]; do
  DEST="$ARCHIVE_DIR/${STAMP}-${SUFFIX}.md"
  SUFFIX=$((SUFFIX + 1))
done

cp "$SUMMARY" "$DEST" || exit 0
echo "Archived session summary to $DEST"

exit 0
