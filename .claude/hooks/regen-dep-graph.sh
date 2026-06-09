#!/usr/bin/env bash
# PostToolUse hook: keeps the committed dependency-graph artifacts in sync.
# When a dependency manifest is edited (package.json / pnpm-workspace.yaml /
# pnpm-lock.yaml), regenerate docs/architecture/dependency-graph.md and
# infrastructure/worker/dep-graph.json and re-stage them, so the CI Build
# "dependency graph drift" gate never fails on a stale, manually-forgotten file.
# Silent and non-blocking: never fails the edit.
set -uo pipefail

file_path="${1:-${CLAUDE_FILE_PATH:-}}"
[[ -z "$file_path" ]] && exit 0

# Never react to dependency manifests inside node_modules or build output.
case "$file_path" in
  */node_modules/*|*/dist/*|*/.next/*) exit 0 ;;
esac

# Only react to dependency manifests. Anything else is a no-op.
case "$file_path" in
  *package.json|*pnpm-workspace.yaml|*pnpm-lock.yaml) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[[ -z "$root" || ! -d "$root" ]] && exit 0
cd "$root" || exit 0

# Regenerate both graph artifacts. Tolerate failures (e.g. deps not installed
# in this checkout) — CI remains the hard gate; this is a convenience sync.
pnpm graph >/dev/null 2>&1 || true
pnpm generate:dep-graph >/dev/null 2>&1 || true

# Re-stage only the known artifacts, and only if they actually changed.
for artifact in docs/architecture/dependency-graph.md infrastructure/worker/dep-graph.json; do
  if [[ -f "$artifact" ]] && ! git diff --quiet -- "$artifact" 2>/dev/null; then
    git add "$artifact" 2>/dev/null || true
  fi
done

exit 0
