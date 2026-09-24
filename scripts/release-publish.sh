#!/usr/bin/env bash
set -euo pipefail

# release-publish.sh — the `publish-script` changesets/action runs.
#
# See scripts/release-version.sh for why this logic lives in a real file
# invoked via `bash scripts/release-publish.sh` rather than inline: v2's
# publish-script input runs through @actions/exec's exec() with no `args`
# array (argv-tokenized, no shell to interpret it), so an `if`/`fi` guard
# can't run as an inline `with:` value.
#
# @mattbutlerengineering/rialto was hand-published in April with no
# `repository` field, so npm.pkg.github.com never linked it to this repo --
# GITHUB_TOKEN can only read/write packages GitHub Packages considers linked
# to the repo that's running it, so a plain `changeset publish` 403s with
# `E403 permission_denied: read_package` (runs 35961368353, attempts 1-3).
# release.yml sets NODE_AUTH_TOKEN from the RIALTO_PACKAGES_TOKEN secret (a
# classic PAT, write:packages scope) instead, authenticating as a real
# identity with explicit access to the orphaned package. Fail loud here if
# that secret is missing, rather than let npm surface a cryptic E401 mid-run.

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "::error::RIALTO_PACKAGES_TOKEN secret is not set -- publish to GitHub Packages would fail. Set it in repo Settings > Secrets and variables > Actions before this step can run." >&2
  exit 1
fi

pnpm exec changeset publish
