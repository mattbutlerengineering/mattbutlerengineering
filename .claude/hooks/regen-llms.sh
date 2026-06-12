#!/usr/bin/env bash
# PostToolUse hook: regenerate llms.txt when source files change.
# Warns (does not block) when llms.txt drifts so the user can stage before committing.

FILE_PATH="${CLAUDE_FILE_PATH:-}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

[ -z "$FILE_PATH" ] && exit 0

# Only care about source/schema/doc files that affect llms.txt content
case "$FILE_PATH" in
  *.ts|*.tsx|*.prisma|*/CLAUDE.md) ;;
  *) exit 0 ;;
esac

# Skip generated files, node_modules, dist
case "$FILE_PATH" in
  */node_modules/*|*/dist/*|*/generated/*|*llms*.txt) exit 0 ;;
esac

# Extract package directory (packages/X, services/X, or apps/X)
pkg_dir=$(echo "$FILE_PATH" | sed -n 's|\(^\(packages\|services\|apps\)/[^/]*\)/.*|\1|p')
[ -z "$pkg_dir" ] && exit 0

# Only regenerate if this package already has llms.txt
[ -f "$PROJECT_DIR/$pkg_dir/llms.txt" ] || exit 0

# Regenerate
node "$PROJECT_DIR/tools/cli/dist/index.js" pack "$pkg_dir" >/dev/null 2>&1 || exit 0

# Check if anything drifted
drift=$(git -C "$PROJECT_DIR" diff --name-only -- "$pkg_dir/llms.txt" "$pkg_dir/llms-full.txt" 2>/dev/null)
if [ -n "$drift" ]; then
  echo "⚠️  llms.txt drifted in $pkg_dir — will be staged at commit time by pre-commit hook"
fi

exit 0
