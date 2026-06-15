#!/bin/bash
# cleanup-chaos-branches.sh — delete all stale chaos/synthetic-bug-* branches
# Usage: ./tools/scripts/cleanup-chaos-branches.sh

set -euo pipefail

echo "Cleaning up stale chaos/synthetic-bug-* branches..."

# Count before
LOCAL_BEFORE=$(git branch -l | grep -c "chaos/synthetic-bug" || echo "0")
REMOTE_BEFORE=$(git branch -r | grep -c "chaos/synthetic-bug" || echo "0")

echo "Before: $LOCAL_BEFORE local, $REMOTE_BEFORE remote"

# Delete local branches
if [ "$LOCAL_BEFORE" -gt 0 ]; then
  git branch -D $(git branch -l | grep "chaos/synthetic-bug" | tr '\n' ' ') || true
  echo "Deleted local branches"
fi

# Delete remote branches
if [ "$REMOTE_BEFORE" -gt 0 ]; then
  for branch in $(git branch -r | grep "chaos/synthetic-bug" | sed 's|origin/||'); do
    git push origin --delete "$branch" || true
  done
  echo "Deleted remote branches"
fi

# Count after
LOCAL_AFTER=$(git branch -l | grep -c "chaos/synthetic-bug" || echo "0")
REMOTE_AFTER=$(git branch -r | grep -c "chaos/synthetic-bug" || echo "0")

echo "After: $LOCAL_AFTER local, $REMOTE_AFTER remote"

if [ "$LOCAL_AFTER" -eq 0 ] && [ "$REMOTE_AFTER" -eq 0 ]; then
  echo "✅ Cleanup complete"
  exit 0
else
  echo "⚠️  Some branches remain (may require manual cleanup)"
  exit 1
fi
