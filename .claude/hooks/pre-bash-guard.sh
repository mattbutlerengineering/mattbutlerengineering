#!/usr/bin/env bash
# Pre-bash safety guard: cheap checks before a Bash command runs, each
# targeting a recurring failure class in this monorepo (documented in
# .claude/rules/gotchas.md).
#
# Wired in via .claude/settings.json PreToolUse Bash matcher.
# Receives the hook payload as JSON on stdin; the about-to-execute command
# is read via hook-input.mjs (measured contract: scripts/hook-input.mjs).
#
#   Check 1 — Node-version drift (WARN, exit 0):
#     Repo pins Node 22 via .nvmrc. Worktree/agent shells that run on Node 20
#     regenerate llms.txt embedding a stale generated-schemas enum → CI
#     Integrity job fails after push (#2 recurring failure). We warn — not
#     block — before regen/pack so the agent runs `nvm use 22` first.
#
#   Check 2 — worktree missing node_modules (BLOCK, exit 2):
#     `isolation: worktree` creates a bare checkout without node_modules, so
#     `pnpm test` / `vitest` dies with "command not found" (#1 recurring
#     failure). We block with the fix instead of letting it fail opaquely.
#     The tree checked is the payload's `cwd`: hooks run with CWD =
#     $CLAUDE_PROJECT_DIR = the main checkout even for a worktree-isolated
#     subagent, so checking the project dir (as this did until 2026-10-15)
#     let every bare worktree through.
#
#   Check 3 — inert git hooks (WARN, exit 0, #5766):
#     `core.hooksPath` (`.husky/_`) is created only by `pnpm install`'s
#     `prepare` script. A checkout that skipped it has every local gate
#     (pre-commit lint/check-adr, pre-push migration/antipattern/regen
#     checks) silently disabled — a git hook itself cannot report this,
#     since it would be exactly as inert. This runs through the Claude Code
#     harness instead, independent of core.hooksPath, so it fires whether or
#     not `pnpm install` has ever run. Warn only — see
#     scripts/check-hooks-active.mjs's header for why a hard block is wrong
#     here (it would break legitimate no-install flows).
#
#     `--hook-json`, not a plain stdout/stderr warning: Claude Code
#     (2.1.282) shows NEITHER stream to the user for a PreToolUse hook that
#     exits 0, so a plain warning would be invisible — the exact silent
#     failure #5766 exists to fix, one layer up. The script itself decides
#     whether to print (nothing when healthy, one line of JSON when inert),
#     so this line must never redirect its stdout.
#
# Skip mechanisms:
#   - $SKIP_BASH_GUARD=1 → bypass all checks entirely.
set -uo pipefail

# Read the payload once — stdin can only be consumed once, and the adapter is
# asked for two fields: the command now, the tree it ran in further down.
payload=$(cat)
cmd=$(printf '%s' "$payload" | node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs" command)
[ -n "$cmd" ] || exit 0
[[ "${SKIP_BASH_GUARD:-}" == "1" ]] && exit 0

# ---------------------------------------------------------------------------
# Check 1: Node-version drift warning (before regen / pack — where drift enters)
# ---------------------------------------------------------------------------
case "$cmd" in
  *regen*|*" pack "*|*"pack ."*|*"generate:dep-graph"*|*"pnpm graph"*)
    nvmrc="${CLAUDE_PROJECT_DIR:-.}/.nvmrc"
    if [[ -f "$nvmrc" ]] && command -v node >/dev/null 2>&1; then
      want=$(tr -dc '0-9.' < "$nvmrc")
      have=$(node -v 2>/dev/null | sed 's/^v//')
      if [[ -n "$want" && -n "$have" && "${want%%.*}" != "${have%%.*}" ]]; then
        echo "⚠️  Node ${have%%.*} != .nvmrc ${want%%.*}. Run 'nvm use' before regen/pack —" >&2
        echo "    a mismatched Node regenerates llms.txt with a stale schema enum and CI Integrity fails (gotchas.md #2)." >&2
      fi
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# Check 2: block test/build when node_modules is absent (bare worktree)
# ---------------------------------------------------------------------------
case "$cmd" in
  *"pnpm test"*|*"pnpm build"*|*"pnpm typecheck"*|*vitest*|*"turbo run test"*|*"turbo run build"*)
    # The tree the command runs in is the payload's `cwd`, NOT
    # $CLAUDE_PROJECT_DIR (the main checkout, whose node_modules exist — which
    # is why a bare worktree's `pnpm test` used to pass this check). The
    # project dir is only the fallback for a payload that names no usable cwd.
    tree=$(printf '%s' "$payload" | node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs" cwd)
    root=""
    [[ -n "$tree" && -d "$tree" ]] && root=$(git -C "$tree" rev-parse --show-toplevel 2>/dev/null)
    [[ -n "$root" ]] || root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    if [[ ! -d "$root/node_modules" ]]; then
      cat >&2 <<EOF
BLOCK: node_modules missing at $root — this looks like a bare worktree checkout.
Run 'pnpm install --frozen-lockfile' first (gotchas.md #1 recurring CI failure).
Set SKIP_BASH_GUARD=1 to bypass if node_modules lives elsewhere.
EOF
      exit 2
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# Check 3: warn when git hooks are inert (pnpm install never ran) before a
# commit or push — the moment a silently-skipped gate actually matters.
# ---------------------------------------------------------------------------
case "$cmd" in
  *"git commit"*|*"git push"*)
    node "$CLAUDE_PROJECT_DIR/scripts/check-hooks-active.mjs" --hook-json
    ;;
esac

exit 0
