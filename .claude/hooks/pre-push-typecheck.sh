#!/usr/bin/env bash
# Pre-push CI guard: when Claude Code is about to run `git push`, run pnpm
# typecheck across the workspace first. Catches the class of failure that
# bit us in the auth + rialto + ci-cache PR stack — pre-existing TS errors
# on main that no local check surfaced before we shipped.
#
# Wired in via .claude/settings.json PreToolUse Bash matcher.
# Receives the hook payload as JSON on stdin; the about-to-execute command
# is read via hook-input.mjs (measured contract: scripts/hook-input.mjs).
#
# Behavior:
#   - Only fires for a `git push` in command position (not a mention in text)
#   - Runs `pnpm -r --parallel typecheck` from the root of the tree being
#     pushed — the payload's `cwd`, which for a worktree-isolated subagent is
#     the linked worktree, not this hook's own CWD (the main checkout)
#   - Exit 0 → allow the push
#   - Exit 2 → block (Claude Code halts the tool call and surfaces the message)
#
# Skip mechanisms:
#   - $SKIP_PUSH_TYPECHECK=1 → bypass entirely (use sparingly; defeats the guard)
#   - --no-verify in the git command → bypass (matches git's own convention)
set -uo pipefail

# Read the payload once — stdin can only be consumed once, and the adapter is
# asked for two fields: the command now, the tree it ran in further down.
payload=$(cat)
cmd=$(printf '%s' "$payload" | node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs" command)
[ -n "$cmd" ] || exit 0

# Only intercept a push in COMMAND position — at the start of the command or
# right after a shell separator. The old test was a bare substring
# (`*"git push"*`), so any command whose TEXT mentioned a push (a heredoc, a
# comment, an echo) ran a 30-60s typecheck for nothing. Same heuristic as
# verify-push-sha.sh, erring toward firing: `(` is in the class so
# `x=$(git push ...)` still matches.
push_re=$'(^|[;&|(){}\n])[[:space:]]*git[[:space:]]+push([[:space:]]|$)'
[[ "$cmd" =~ $push_re ]] || exit 0

# Skip on explicit bypass (env or --no-verify in the command).
if [[ "${SKIP_PUSH_TYPECHECK:-}" == "1" ]] || [[ "$cmd" == *"--no-verify"* ]]; then
  exit 0
fi

# The tree being pushed is the payload's `cwd`, not this hook's own CWD. Hooks
# run with CWD = $CLAUDE_PROJECT_DIR = the main checkout even for a
# worktree-isolated subagent, so `rev-parse --show-toplevel` here used to
# answer for the main checkout: its upstream, its unpushed commits, its
# typecheck. That tree usually sits on an unrelated branch with nothing to
# push, so the guard silently skipped exactly the worker pushes it exists for
# (measured 2026-10-15; the same defect verify-push-sha.sh records for branch
# resolution). The hook's CWD is only the fallback for a payload naming none.
tree=$(printf '%s' "$payload" | node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs" cwd)
[[ -n "$tree" && -d "$tree" ]] || tree=$(pwd)
repo_root=$(git -C "$tree" rev-parse --show-toplevel 2>/dev/null) || exit 0
[[ -n "$repo_root" ]] || exit 0
cd "$repo_root" || exit 0

# Find the upstream branch; if none configured, skip (typecheck wouldn't
# have a fair baseline anyway — first push of a new branch).
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
if [[ -z "$upstream" ]]; then
  exit 0
fi

# Cheap diff check: skip when no .ts/.tsx changes in the unpushed commits.
# Avoids a 30-60s typecheck on docs-only or config-only branches.
if ! git diff --name-only "${upstream}..HEAD" 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

# A tree that never ran `pnpm install` cannot typecheck at all — a case that
# only became reachable once this hook looked at the right tree. Say so,
# rather than letting `pnpm -r typecheck` die with "tsc: not found" under a
# message that blames the types.
if [[ ! -d "$repo_root/node_modules" ]]; then
  cat >&2 <<EOF
BLOCK: node_modules missing at $repo_root — cannot typecheck this tree before push.
Run 'pnpm install --frozen-lockfile' and 'pnpm typecheck' first (gotchas.md #1
recurring CI failure), or set SKIP_PUSH_TYPECHECK=1 to bypass.
EOF
  exit 2
fi

echo "[pre-push-typecheck] running pnpm -r --parallel typecheck before push…" >&2
if ! pnpm -r --parallel typecheck >&2; then
  cat >&2 <<'EOF'

BLOCK: typecheck failed locally. CI would fail too.
Fix the type errors above before pushing, or set SKIP_PUSH_TYPECHECK=1
to bypass (only for genuinely-blocked situations — defeats the guard).
EOF
  exit 2
fi

exit 0
