#!/usr/bin/env bash
# PostToolUse hook: runs the related test file when a source file is edited.
# Maps src/foo.ts -> src/foo.test.ts (or .spec.ts) and runs it via vitest.
# Silent on pass (exit 0), prints failure summary on fail.
set -uo pipefail

file_path="${1:-$CLAUDE_FILE_PATH}"
[[ -z "$file_path" ]] && exit 0

# Only run for TypeScript/JavaScript source files
case "$file_path" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) exit 0 ;;  # skip test files themselves
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Skip generated files, node_modules, dist
case "$file_path" in
  */node_modules/*|*/dist/*|*/.next/*|*/coverage/*) exit 0 ;;
esac

# Find the package root (nearest package.json)
dir=$(dirname "$file_path")
pkg_root=""
while [[ "$dir" != "/" && "$dir" != "." ]]; do
  if [[ -f "$dir/package.json" ]]; then
    pkg_root="$dir"
    break
  fi
  dir=$(dirname "$dir")
done
[[ -z "$pkg_root" ]] && exit 0

# Check for vitest config in the package
has_vitest=false
for cfg in vitest.config.ts vitest.config.js vite.config.ts; do
  if [[ -f "$pkg_root/$cfg" ]]; then
    has_vitest=true
    break
  fi
done
[[ "$has_vitest" == "false" ]] && exit 0

# Derive test file path
base="${file_path%.*}"
ext="${file_path##*.}"

test_file=""
for suffix in ".test.$ext" ".spec.$ext"; do
  candidate="${base}${suffix}"
  if [[ -f "$candidate" ]]; then
    test_file="$candidate"
    break
  fi
done

[[ -z "$test_file" ]] && exit 0

# Run the related test (suppress output on success)
rel_test="${test_file#"$pkg_root"/}"
output=$(pnpm --dir "$pkg_root" vitest run "$rel_test" --reporter=dot 2>&1)
run_result=$?

if [[ $run_result -ne 0 ]]; then
  echo "Test failure in related file: $rel_test" >&2
  echo "$output" | tail -20 >&2
fi

exit 0
