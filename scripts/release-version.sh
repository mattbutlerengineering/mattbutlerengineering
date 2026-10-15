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
rialto_version() { node -p "require('./packages/rialto/package.json').version"; }
PREV_VER=$(rialto_version)

pnpm version-packages

# If rialto was bumped but the CHANGELOG hash is unchanged, prettier
# silently skipped the write. Prepend the version block manually so the
# file stays accurate. A release that bumps only other packages (e.g. a
# lone @mbe/rialto-plugin changeset) leaves both untouched -- that is not
# a skip, and prepending there wrote a duplicate version block (#6671).
CURR_HASH=$(sha256sum packages/rialto/CHANGELOG.md 2>/dev/null | cut -d' ' -f1 || echo "absent")
NEW_VER=$(rialto_version)
if [ "$PREV_VER" != "$NEW_VER" ] && [ "$PREV_HASH" = "$CURR_HASH" ]; then
  echo "::warning::packages/rialto/CHANGELOG.md was not updated — prepending manually"
  EXISTING=$(cat packages/rialto/CHANGELOG.md 2>/dev/null || echo "# @mattbutlerengineering/rialto")
  # Drop the title and the blank lines after it; the printf below supplies
  # its own separator (a leftover blank line fails prettier).
  BODY=$(printf '%s' "$EXISTING" | sed -e '1{/^#[[:space:]]/d;}' | sed -e '/./,$!d')
  printf '# @mattbutlerengineering/rialto\n\n## %s\n\n### Changes\n\nSee changeset details in git history.\n\n%s\n' \
    "$NEW_VER" "$BODY" > packages/rialto/CHANGELOG.md
fi

# packages/rialto/registry.json embeds pkg.version (scripts/generate-all.ts's
# buildRegistry(components, pkg.version)), so `changeset version`'s bump above
# makes it stale. Nothing else regenerates it on the Version PR -- CI's
# `pnpm regen --check` then fails with a one-family diff (#3322 follow-up).
# generate-all.ts parses TS source directly (no built dist required), so this
# is safe to run standalone here without a preceding `pnpm build`.
pnpm --filter @mattbutlerengineering/rialto build:registry
