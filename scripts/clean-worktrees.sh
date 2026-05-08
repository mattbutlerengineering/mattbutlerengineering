#!/usr/bin/env bash
# clean-worktrees.sh — Remove stale agent worktrees under .claude/worktrees/
#
# Usage:
#   scripts/clean-worktrees.sh              # dry run (default)
#   scripts/clean-worktrees.sh --force      # actually remove
#
# Safety:
#   - Only touches worktrees under .claude/worktrees/
#   - Skips worktrees less than 1 hour old (may be active agents)
#   - Removes when: branch merged to main, branch deleted, or detached HEAD

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="$REPO_ROOT/.claude/worktrees"
AGE_THRESHOLD_SECONDS=3600  # 1 hour

DRY_RUN=true
if [[ "${1:-}" == "--force" ]]; then
  DRY_RUN=false
fi

removed=0
skipped=0

if [ ! -d "$WORKTREE_DIR" ]; then
  echo "No worktree directory found at $WORKTREE_DIR — nothing to clean"
  exit 0
fi

echo "=== Scanning worktrees under $WORKTREE_DIR ==="
echo "Mode: $([ "$DRY_RUN" = true ] && echo "DRY RUN" || echo "LIVE")"
echo ""

# Collect worktree entries from porcelain output
# We process groups of lines separated by blank lines
wt_path=""
wt_branch=""
wt_detached=false

process_entry() {
  local path="$1" branch="$2" detached="$3"

  # Only clean worktrees under .claude/worktrees/
  case "$path" in
    "$WORKTREE_DIR"/*)
      ;;
    *)
      return
      ;;
  esac

  local dirname
  dirname="$(basename "$path")"
  echo "--- $dirname ---"

  # Skip if directory doesn't exist (already gone, will be pruned)
  if [ ! -d "$path" ]; then
    echo "  Directory missing, will be pruned"
    return
  fi

  # Skip worktrees younger than threshold
  local dir_mtime now age_seconds
  dir_mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null)
  now=$(date +%s)
  age_seconds=$((now - dir_mtime))
  if [ "$age_seconds" -lt "$AGE_THRESHOLD_SECONDS" ]; then
    echo "  Skipping — only $((age_seconds / 60))m old (min: $((AGE_THRESHOLD_SECONDS / 60))m)"
    skipped=$((skipped + 1))
    return
  fi

  local should_remove=false
  local reason=""

  if [ "$detached" = true ]; then
    should_remove=true
    reason="detached HEAD"
  elif [ -n "$branch" ]; then
    # Check if branch has been merged to main
    if git merge-base --is-ancestor "$branch" main 2>/dev/null; then
      should_remove=true
      reason="branch '$branch' merged to main"
    # Check if branch no longer exists locally (deleted)
    elif ! git rev-parse --verify "$branch" 2>/dev/null >/dev/null; then
      should_remove=true
      reason="branch '$branch' deleted"
    fi
  fi

  if [ "$should_remove" = true ]; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [DRY RUN] Would remove — $reason"
    else
      echo "  Removing — $reason"
      git worktree remove --force "$path" 2>/dev/null || {
        echo "  Warning: git worktree remove failed, removing directory manually"
        rm -rf "$path"
      }
    fi
    removed=$((removed + 1))
  else
    echo "  Keeping — branch '$branch' is active"
    skipped=$((skipped + 1))
  fi
}

# Read porcelain output line by line, group by blank-line separators
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    "worktree "*)
      wt_path="${line#worktree }"
      wt_branch=""
      wt_detached=false
      ;;
    "branch "*)
      wt_branch="${line#branch refs/heads/}"
      ;;
    "detached")
      wt_detached=true
      ;;
    "")
      if [ -n "$wt_path" ]; then
        process_entry "$wt_path" "$wt_branch" "$wt_detached"
      fi
      wt_path=""
      wt_branch=""
      wt_detached=false
      ;;
  esac
done < <(git worktree list --porcelain; echo "")

# Prune stale worktree references (dangling metadata for removed directories)
echo ""
echo "=== Pruning stale worktree references ==="
if [ "$DRY_RUN" = true ]; then
  git worktree prune --dry-run
else
  git worktree prune --verbose
fi

echo ""
echo "=== Summary ==="
echo "Removed: $removed"
echo "Skipped: $skipped"
echo "Dry run: $DRY_RUN"
