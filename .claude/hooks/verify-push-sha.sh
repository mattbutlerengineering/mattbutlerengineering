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
# Receives the hook payload as JSON on stdin; the just-executed command
# is read via hook-input.mjs (measured contract: scripts/hook-input.mjs).
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

cmd=$(node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs" command)
[ -n "$cmd" ] || exit 0

# Only intercept git push; skip non-pushing / destructive / dry forms.
#
# Match in COMMAND position — at the start of the command, or right after a
# shell separator. The old test was a bare substring (`*"git push"*`), so ANY
# command whose TEXT merely contained the words fired the hook: a heredoc
# writing a test fixture, a comment mentioning the command, an `echo`. Two of
# seven false firings in one session were this.
#
# A hook cannot parse shell, so this stays a heuristic, and it deliberately
# errs toward firing: a spurious verification is cheap, a push that silently
# failed is not. `(` is in the class so `x=$(git push ...)` still matches.
push_re=$'(^|[;&|(){}\n])[[:space:]]*git[[:space:]]+push([[:space:]]|$)'
[[ "$cmd" =~ $push_re ]] || exit 0
case "$cmd" in
  *"--dry-run"*|*"--delete"*|*" :"*) exit 0 ;;  # dry run or branch deletion
esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Resolve the remote and the branch being pushed, in one pass over the command.
#
# The branch MUST come from the command when the command names one. This hook
# runs with CWD = $CLAUDE_PROJECT_DIR (the main checkout), but a push issued
# from a linked git worktree has an entirely unrelated HEAD — so
# `rev-parse --abbrev-ref HEAD` here answers for the wrong tree and the hook
# reports "branch '<main-checkout-branch>' not found on origin" after a push
# that landed perfectly. Measured six times in one session against
# `docs/hospitality-animations-retro`, a branch none of those pushes touched.
# A guard that cries wolf on every worktree push trains people to ignore it.
#
# Refs, unlike HEAD, ARE shared across linked worktrees, so once the branch
# NAME is known its SHA resolves correctly from any tree in the repo.
remote="origin"
branch=""
seen_remote=""
for tok in $cmd; do
  # Skip flags (`-u`, `--force-with-lease`, ...) — never a remote or a ref.
  [[ "$tok" == -* ]] && continue
  if [[ -z "$seen_remote" ]]; then
    # -F/-- so flag tokens are matched literally rather than parsed as
    # grep options.
    if git remote 2>/dev/null | grep -qxF -- "$tok"; then
      remote="$tok"; seen_remote=1
    fi
    continue
  fi
  branch="$tok"; break   # first non-flag token after the remote is the refspec
done

# A `src:dst` refspec pushes local ref `src` to remote branch `dst`; verify the
# remote side against the local side rather than assuming they share a name.
local_ref="$branch"
if [[ "$branch" == *:* ]]; then
  local_ref="${branch%%:*}"
  branch="${branch##*:}"
fi
branch="${branch#refs/heads/}"
local_ref="${local_ref#refs/heads/}"

# Bare `git push`, or an explicit `HEAD` refspec: the current tree's HEAD is
# the right answer, and it is also the only case where it ever was.
if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  local_ref="HEAD"
fi

# Detached HEAD or unknown — can't map to a remote branch reliably; skip.
[[ -z "$branch" || "$branch" == "HEAD" ]] && exit 0

local_sha=$(git rev-parse "$local_ref" 2>/dev/null || true)
[[ -z "$local_sha" ]] && exit 0

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
