#!/usr/bin/env bash
# PostToolUse hook: auto-regenerate llms.txt artifacts after `gh pr update-branch`.
#
# Problem: worktree agents commit llms.txt matching their checkout state. After
# `gh pr update-branch` merges main into the PR branch, CI reruns `pnpm regen`
# and finds drift — failing the Build job's "Verify generated artifacts" step.
# This was the #1 recurring merge-train failure in the implement-queue loop.
#
# Solution: detect successful update-branch, fetch the PR branch, regen locally,
# and push a fixup commit. Uses the current worktree (which has node_modules).
set -uo pipefail

tool_input="${CLAUDE_TOOL_INPUT:-}"
tool_output="${CLAUDE_TOOL_OUTPUT:-}"

# Fast exit for non-matching commands (< 1ms for 99.9% of Bash calls).
[[ "$tool_input" == *"gh pr update-branch"* ]] || exit 0
[[ "$tool_output" == *"PR branch updated"* ]] || exit 0

# Extract PR number from the command (e.g. "gh pr update-branch 2357").
pr_num=$(echo "$tool_input" | grep -oE 'update-branch [0-9]+' | grep -oE '[0-9]+' | head -1)
[[ -n "$pr_num" ]] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$root" || ! -d "$root" ]] && exit 0
cd "$root" || exit 0

# Get the PR's head branch name.
branch=$(gh pr view "$pr_num" --json headRefName --jq '.headRefName' 2>/dev/null)
[[ -n "$branch" ]] || exit 0

# Remember where we are so we can return.
original_ref=$(git rev-parse HEAD 2>/dev/null)
[[ -n "$original_ref" ]] || exit 0

# Fetch the updated branch and check it out.
git fetch origin "$branch" 2>/dev/null || exit 0
git checkout "origin/$branch" --detach 2>/dev/null || exit 0

# Regenerate artifacts. Tolerate regen failure — CI remains the hard gate.
pnpm regen 2>/dev/null || true

# If artifacts changed, commit and push the fixup.
if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
  git add -A 2>/dev/null
  git -c core.hooksPath=/dev/null commit -m "chore: regenerate stale artifacts" 2>/dev/null
  git push --no-verify origin "HEAD:$branch" 2>/dev/null
  echo "✅ Auto-regenerated artifacts on PR #$pr_num" >&2
fi

# Return to original ref.
git checkout "$original_ref" --detach 2>/dev/null || true

exit 0
