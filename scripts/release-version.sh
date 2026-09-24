#!/usr/bin/env bash
set -euo pipefail

# release-version.sh — the `version-script` changesets/action runs.
#
# changesets/action executes this input through @actions/exec's `exec()`
# with no `args` array, which tokenizes the command STRING itself (argv
# splitting, no shell) rather than spawning a shell to interpret it -- see
# src/run.ts's `runVersion()`, `exec(script, undefined, { cwd, env })`. A
# multi-line inline block with `#` comments, `$(...)`, `if`/`fi`, and
# redirects cannot run that way (#5721 review, round 3): `#` is not treated
# as a comment, `$(...)` is not expanded, `if`/`fi` are passed as literal
# argv words. Checking the logic into a real file and running it via
# `version-script: bash scripts/release-version.sh` gives `bash` — not
# @actions/exec's tokenizer -- the job of interpreting it, so all of that
# works exactly as it does when run directly.
#
# Bumps versions in package.json, updates CHANGELOG.md, and consumes
# .changeset/*.md files. GITHUB_TOKEN (already exported by the action) is
# required by @changesets/changelog-github to resolve PR links.

# Detect whether changeset version skips CHANGELOG.md write silently. This
# happens when prettier cannot resolve @mbe/config (see gotchas.md).
PREV_HASH=$(sha256sum packages/rialto/CHANGELOG.md 2>/dev/null | cut -d' ' -f1 || echo "absent")

pnpm version-packages

# If the CHANGELOG hash is unchanged, prettier silently skipped the write.
# Prepend the version block manually so the file stays accurate.
CURR_HASH=$(sha256sum packages/rialto/CHANGELOG.md 2>/dev/null | cut -d' ' -f1 || echo "absent")
if [ "$PREV_HASH" = "$CURR_HASH" ]; then
  echo "::warning::packages/rialto/CHANGELOG.md was not updated — prepending manually"
  NEW_VER=$(node -p "require('./packages/rialto/package.json').version")
  EXISTING=$(cat packages/rialto/CHANGELOG.md 2>/dev/null || echo "# @mattbutlerengineering/rialto")
  BODY=$(printf '%s' "$EXISTING" | sed -e '1{/^#[[:space:]]/d;}')
  printf '# @mattbutlerengineering/rialto\n\n## %s\n\n### Changes\n\nSee changeset details in git history.\n\n%s\n' \
    "$NEW_VER" "$BODY" > packages/rialto/CHANGELOG.md
fi
