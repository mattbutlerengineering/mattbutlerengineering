#!/usr/bin/env bash
# PostToolUse hook: regenerate llms.txt when a package source file changes.
# Warns (does not block) when llms.txt drifts so the user can stage before committing.
#
# All family knowledge (source patterns, package ownership, regen command)
# lives in scripts/regen-manifest.mjs — this script has none of its own. It
# asks the manifest "what's stale now?" via `--families-for <path>` instead of
# re-deriving package ownership with sed.
set -uo pipefail

file_path="${1:-}"
[[ -z "$file_path" ]] && exit 0

# Cheap, generic hygiene skip (not family-specific knowledge).
case "$file_path" in
  */node_modules/*) exit 0 ;;
esac

# The tree to act on is the one the edited file lives in, NOT
# $CLAUDE_PROJECT_DIR: hooks run with that set to the MAIN checkout even for a
# worktree-isolated subagent (measured 2026-10-15, see gotchas.md). Resolving
# it from the project dir regenerated the main checkout's artifacts and left
# the worktree's own stale — the worker's PR then shipped them that way — and
# the repo-root-relative strip below no-opped, because the main checkout's
# prefix does not match a worktree path. The project dir stays as the fallback
# for a payload whose path names no git tree.
root=$(git -C "$(dirname "$file_path")" rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$root" || ! -d "$root" ]]; then
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
fi
[[ -z "$root" || ! -d "$root" ]] && exit 0
cd "$root" || exit 0

# Manifest paths/families are repo-root-relative.
rel_path="${file_path#"$root"/}"

families_json=$(node scripts/regen-manifest.mjs --families-for "$rel_path" --hook-mode warn 2>/dev/null)
[[ -z "$families_json" || "$families_json" == "[]" ]] && exit 0

echo "$families_json" | jq -c '.[]' | while IFS= read -r family; do
  cmd=$(echo "$family" | jq -r '.command')
  read -ra cmd_arr <<<"$cmd"
  if ! "${cmd_arr[@]}" >/dev/null 2>&1; then
    continue
  fi

  outputs=()
  while IFS= read -r artifact; do
    outputs+=("$artifact")
  done < <(echo "$family" | jq -r '.outputs[]')

  drift=$(git diff --name-only -- "${outputs[@]}" 2>/dev/null)
  if [[ -n "$drift" ]]; then
    echo "⚠️  llms.txt drifted ($drift) — will be staged at commit time by pre-commit hook"
  fi
done

exit 0
