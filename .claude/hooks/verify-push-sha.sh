#!/usr/bin/env bash
# PostToolUse(Bash) guard: after Claude Code runs `git push`, verify the push
# actually landed by comparing local HEAD to the remote branch SHA.
#
# Closes the silent-push-failure class that bit the merge train repeatedly:
# a background/hook-wrapped push fails or is rejected, the tool call still
# "succeeds" from Claude's view, and the remote branch silently stays at the
# old SHA — so auto-merge fires on stale code or a fix never lands.
#
# Wired via .claude/settings.json PostToolUse Bash matcher.
# Reads the just-executed command from $CLAUDE_BASH_COMMAND.
#
# Behavior:
#   - Only fires for `git push` (skips --dry-run, --delete, tag-only pushes)
#   - Compares local HEAD to `git ls-remote origin <current-branch>`
#   - Match   → exit 0 (silent)
#   - Mismatch/missing → exit 2 (stderr surfaces to Claude as feedback)
#
# Never blocks (the push already ran); exit 2 only makes the discrepancy
# visible so Claude re-pushes instead of arming auto-merge on stale code.
set -uo pipefail

cmd="${CLAUDE_BASH_COMMAND:-}"

# Only intercept git push; skip non-pushing / destructive / dry forms.
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac
case "$cmd" in
  *"--dry-run"*|*"--delete"*|*" :"*) exit 0 ;;  # dry run or branch deletion
esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
# Detached HEAD or unknown — can't map to a remote branch reliably; skip.
[[ -z "$branch" || "$branch" == "HEAD" ]] && exit 0

local_sha=$(git rev-parse HEAD 2>/dev/null || true)
[[ -z "$local_sha" ]] && exit 0

# Determine the remote (push target if named in the command, else origin).
remote="origin"
for tok in $cmd; do
  if git remote 2>/dev/null | grep -qx "$tok"; then remote="$tok"; break; fi
done

remote_sha=$(git ls-remote "$remote" "refs/heads/$branch" 2>/dev/null | awk '{print $1}')

if [[ -z "$remote_sha" ]]; then
  cat >&2 <<EOF
PUSH VERIFY: branch '$branch' not found on '$remote' after push.
The push may have failed silently. Re-run the push (add --no-verify if a
pre-push hook is rejecting it) and confirm the branch exists before arming
auto-merge.
EOF
  exit 2
fi

if [[ "$remote_sha" != "$local_sha" ]]; then
  # Classify the mismatch so the message matches reality instead of always
  # claiming "push failed" (a stale local with remote ahead is different).
  if git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    # remote is behind local → the push genuinely did not land.
    cat >&2 <<EOF
PUSH VERIFY: remote '$branch' is BEHIND local — the push did NOT land.
  local  : $local_sha
  $remote : $remote_sha
Silent failure, non-fast-forward, or pre-push hook rejection. Do NOT arm
auto-merge. Re-push (add --no-verify if a pre-push hook is the blocker) and
re-verify the remote advanced to the local SHA.
EOF
  elif git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
    # remote is ahead → concurrent push landed, or local was never the tip.
    cat >&2 <<EOF
PUSH VERIFY: remote '$branch' is AHEAD of local.
  local  : $local_sha
  $remote : $remote_sha
A concurrent session likely advanced this branch (see the merge-train
contention pattern), or your push never made local the tip. Do NOT assume
your commit is the branch tip — fetch and reconcile before arming auto-merge.
EOF
  else
    # diverged — neither contains the other.
    cat >&2 <<EOF
PUSH VERIFY: local and remote '$branch' have DIVERGED.
  local  : $local_sha
  $remote : $remote_sha
The push did not fast-forward. A concurrent push rewrote the branch. Fetch,
rebase onto the remote tip, and re-push before arming auto-merge.
EOF
  fi
  exit 2
fi

exit 0
