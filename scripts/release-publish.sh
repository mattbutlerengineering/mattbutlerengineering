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
# classic PAT, write:packages scope) instead.
#
# Publishing is opt-in for now (Matt, refs #3322 follow-up): nothing outside
# this monorepo installs @mattbutlerengineering/rialto -- every consumer
# (apps/*, other packages/*) pulls it in via `workspace:*`. Every push to
# main was hitting this step with the secret unset and failing the whole
# Release workflow (runs 36054320926, 36053448723, 36051601574,
# 36035638679), even though nothing needed the publish to succeed. So a
# missing secret is treated as "publishing intentionally disabled" (see
# docs/SECRETS.md), not a misconfiguration: skip the publish and exit 0.
# Setting RIALTO_PACKAGES_TOKEN resumes publishing automatically, with no
# other change needed.

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  echo "::notice::RIALTO_PACKAGES_TOKEN is not set -- skipping publish (publishing intentionally disabled; see docs/SECRETS.md)"
  exit 0
fi

pnpm exec changeset publish
