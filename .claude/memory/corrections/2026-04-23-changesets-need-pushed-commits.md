---
date: 2026-04-23
session: release-workflow
trigger: Running pnpm version-packages before pushing commits to origin causes changesets to fail
correction: Always git push origin main before running pnpm version-packages
root_cause: The changesets GitHub lookup queries origin for commit metadata. If commits only exist locally, the API returns 404 and the version bump aborts.
prevention: Release workflow must push first, then version. Added to .claude/rules/gotchas.md.
---
