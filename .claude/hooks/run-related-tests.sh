#!/usr/bin/env bash
# PostToolUse hook: runs the related test file when a source file is edited.
# Maps src/foo.ts -> src/foo.test.ts (or .spec.ts) and runs it via vitest.
# Silent on pass. On failure, prints ONE line of JSON to stdout carrying the
# summary as `hookSpecificOutput.additionalContext` — the only channel that
# reaches the model for a hook that exits 0 (stderr + exit 0 is shown to
# no one; #5766, #8518). Always exits 0: advisory, never blocking.
set -uo pipefail

file_path="${1:-}"
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
# `exec` is required: `pnpm --dir <dir> vitest …` makes pnpm 9 spawn <dir>
# itself and fail with EACCES on every run (#8518).
output=$(pnpm --dir "$pkg_root" exec vitest run "$rel_test" --reporter=dot 2>&1)
run_result=$?

if [[ $run_result -ne 0 ]]; then
  summary=$(printf 'Test failure in related file: %s\n%s' "$rel_test" "$(printf '%s\n' "$output" | tail -20)")
  # JSON.stringify, never hand-escaped: test output carries quotes and ANSI.
  SUMMARY="$summary" node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:process.env.SUMMARY}})+"\n")'
fi

exit 0
