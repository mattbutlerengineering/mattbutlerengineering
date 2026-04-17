#!/usr/bin/env bash
# Warn when editing source in a published package if no staged changeset exists.
# Run only for paths under packages/*/src/.

set -euo pipefail

file_path="${1:-}"
[[ -z "$file_path" ]] && exit 0

case "$file_path" in
  */packages/*/src/*|packages/*/src/*) ;;
  *) exit 0 ;;
esac

count=0
if [[ -d .changeset ]]; then
  shopt -s nullglob
  for f in .changeset/*.md; do
    base=$(basename "$f")
    [[ "$base" == "README.md" ]] && continue
    count=$((count + 1))
  done
fi

if [[ "$count" -eq 0 ]]; then
  echo "💡 Editing a published package but no changeset found in .changeset/. Run \`pnpm changeset\` before committing if this change should ship in a release." >&2
fi

exit 0
