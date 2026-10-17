#!/usr/bin/env bash
# PostToolUse hook: keeps committed generated artifacts in sync with the file
# that was just edited.
#
# All family knowledge (which artifacts, what command regenerates them) lives
# in scripts/regen-manifest.mjs — this script has none of its own. It asks the
# manifest "what's stale now?" via `--families-for <path>` and just runs
# whatever comes back, so a new manifest family is covered automatically with
# zero edits here.
# Silent and non-blocking: never fails the edit.
set -uo pipefail

file_path="${1:-}"
[[ -z "$file_path" ]] && exit 0

# Cheap, generic hygiene skip (not family-specific knowledge).
case "$file_path" in
  */node_modules/*|*/dist/*|*/.next/*) exit 0 ;;
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

# Manifest paths/families are repo-root-relative. $root is a realpath, so
# realpath the edited file's directory too — a payload path spelled through a
# symlink (macOS /var -> /private/var) would otherwise leave the strip a no-op.
real_dir=$(cd "$(dirname "$file_path")" 2>/dev/null && pwd -P)
real_path="${real_dir:+$real_dir/$(basename "$file_path")}"
rel_path="${real_path:-$file_path}"
rel_path="${rel_path#"$root"/}"

families_json=$(node scripts/regen-manifest.mjs --families-for "$rel_path" --hook-mode stage 2>/dev/null)
[[ -z "$families_json" || "$families_json" == "[]" ]] && exit 0

echo "$families_json" | jq -c '.[]' | while IFS= read -r family; do
  cmd=$(echo "$family" | jq -r '.command')
  read -ra cmd_arr <<<"$cmd"
  "${cmd_arr[@]}" >/dev/null 2>&1 || true

  echo "$family" | jq -r '.outputs[]' | while IFS= read -r artifact; do
    if [[ -f "$artifact" ]] && ! git diff --quiet -- "$artifact" 2>/dev/null; then
      git add "$artifact" 2>/dev/null || true
    fi
  done
done

exit 0
