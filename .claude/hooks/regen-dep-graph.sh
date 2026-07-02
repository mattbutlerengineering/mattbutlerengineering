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

file_path="${1:-${CLAUDE_FILE_PATH:-}}"
[[ -z "$file_path" ]] && exit 0

# Cheap, generic hygiene skip (not family-specific knowledge).
case "$file_path" in
  */node_modules/*|*/dist/*|*/.next/*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$root" || ! -d "$root" ]] && exit 0
cd "$root" || exit 0

# Manifest paths/families are repo-root-relative.
rel_path="${file_path#"$root"/}"

families_json=$(node scripts/regen-manifest.mjs --families-for "$rel_path" 2>/dev/null)
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
