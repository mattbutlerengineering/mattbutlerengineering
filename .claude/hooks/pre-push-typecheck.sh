#!/usr/bin/env bash
# Pre-push CI guard: when Claude Code is about to run `git push`, run pnpm
# typecheck across the workspace first. Catches the class of failure that
# bit us in the auth + rialto + ci-cache PR stack — pre-existing TS errors
# on main that no local check surfaced before we shipped.
#
# Wired in via .claude/settings.json PreToolUse Bash matcher.
# Receives the about-to-execute command on stdin via $CLAUDE_BASH_COMMAND.
#
# Behavior:
#   - Only fires when the command contains "git push"
#   - Runs `pnpm -r --parallel typecheck` from repo root
#   - Exit 0 → allow the push
#   - Exit 2 → block (Claude Code halts the tool call and surfaces the message)
#
# Skip mechanisms:
#   - $SKIP_PUSH_TYPECHECK=1 → bypass entirely (use sparingly; defeats the guard)
#   - --no-verify in the git command → bypass (matches git's own convention)
set -uo pipefail

cmd="${CLAUDE_BASH_COMMAND:-}"

# Only intercept git push; everything else passes through.
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

# Skip on explicit bypass (env or --no-verify in the command).
if [[ "${SKIP_PUSH_TYPECHECK:-}" == "1" ]] || [[ "$cmd" == *"--no-verify"* ]]; then
  exit 0
fi

# Skip if not actually a workspace push (e.g., docs-only changes detected by git).
# Cheap heuristic: only proceed when there are unpushed commits to typecheck.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel)
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
