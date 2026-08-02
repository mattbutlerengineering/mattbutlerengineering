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
