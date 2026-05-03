#!/usr/bin/env bash
# Stop hook — captures session metadata for the learning loop.
# Writes to <git-root>/.claude/session-logs/. Always exits 0.

set -uo pipefail

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
LOG_DIR="$GIT_ROOT/.claude/session-logs"
[[ -d "$LOG_DIR" ]] || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILENAME=$(date +"%Y-%m-%d-%H%M%S").json

BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
PROJECT=$(basename "$GIT_ROOT")

RECENT_COMMITS=$(git log --oneline -20 --since="12 hours ago" 2>/dev/null || echo "")
COMMIT_COUNT=0
if [[ -n "$RECENT_COMMITS" ]]; then
  COMMIT_COUNT=$(echo "$RECENT_COMMITS" | wc -l | tr -d ' ')
fi

DIFF_STAT=""
if [[ "$COMMIT_COUNT" -gt 0 ]]; then
  DIFF_STAT=$(git diff --stat "HEAD~${COMMIT_COUNT}" HEAD 2>/dev/null | tail -1 || echo "")
fi

FILES_MODIFIED=""
if [[ "$COMMIT_COUNT" -gt 0 ]]; then
  FILES_MODIFIED=$(git diff --name-only "HEAD~${COMMIT_COUNT}" HEAD 2>/dev/null | head -50 || echo "")
fi

UNCOMMITTED=$(git diff --name-only 2>/dev/null | head -20 || echo "")
STAGED=$(git diff --cached --name-only 2>/dev/null | head -20 || echo "")

if command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg timestamp "$TIMESTAMP" \
    --arg session_id "${CLAUDE_SESSION_ID:-}" \
    --arg project "$PROJECT" \
    --arg branch "$BRANCH" \
    --arg diff_stat "$DIFF_STAT" \
    --arg commits "$RECENT_COMMITS" \
    --argjson commit_count "$COMMIT_COUNT" \
    --arg files_modified "$FILES_MODIFIED" \
    --arg uncommitted "$UNCOMMITTED" \
    --arg staged "$STAGED" \
    --arg summary "$(echo "$RECENT_COMMITS" | head -1)" \
    '{
      timestamp: $timestamp,
      session_id: $session_id,
      project: $project,
      branch: $branch,
      git_diff_stat: $diff_stat,
      commits_made: ($commits | split("\n") | map(select(length > 0))),
      commit_count: $commit_count,
      files_modified: ($files_modified | split("\n") | map(select(length > 0))),
      uncommitted_files: ($uncommitted | split("\n") | map(select(length > 0))),
      staged_files: ($staged | split("\n") | map(select(length > 0))),
      task_summary: $summary
    }' > "$LOG_DIR/$FILENAME" 2>/dev/null
else
  printf '{"timestamp":"%s","project":"%s","branch":"%s","commit_count":%d,"task_summary":"%s"}\n' \
    "$TIMESTAMP" "$PROJECT" "$BRANCH" "$COMMIT_COUNT" \
    "$(echo "$RECENT_COMMITS" | head -1 | sed 's/"/\\"/g')" \
    > "$LOG_DIR/$FILENAME" 2>/dev/null
fi

exit 0
