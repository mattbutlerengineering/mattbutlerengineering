---
paths:
  - ".claude/agents/**"
  - ".claude/skills/**"
  - ".claude/implement-queue.md"
  - "docs/routines/**"
  - "scripts/**"
---

# Gotchas — worker shell, `gh`, and zsh

Path-scoped sibling of [gotchas.md](./gotchas.md#shell-zsh). Found by the 14-day transcript harvest in #9312.

- **`gh api` has no `--output` and no `-o` (33 failures in 14 days).** For job logs use `gh run view <run-id> --job <job-id> --log` (add `--log-failed` for failing steps only), or redirect: `gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs > <abs-path>`.
- **zsh expands an unquoted leading `=` word as `=cmd`:** `echo == title ==` fails with `(eval):N: == not found` (29 failures). Quote every separator: `echo "== title =="`.
- **zsh aborts on an unmatched glob:** an unquoted `--filter=...[origin/main]` fails with `no matches found`. Always write `--filter='...[origin/main]'`.
- **`gh pr merge --delete-branch` run while the PR's branch is checked out in a worktree merges fine, then fails to delete the LOCAL branch** (`cannot delete branch ... used by worktree`, 11 failures). Do not retry the merge. Confirm with `gh pr view <N> --repo <owner/repo> --json state,mergedAt`, delete the remote ref if it survived (`gh api -X DELETE repos/<owner>/<repo>/git/refs/heads/<branch>`), and leave the local branch and worktree to `scripts/reap-worktrees.mjs`.
