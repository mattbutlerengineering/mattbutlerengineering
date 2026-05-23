---
date: 2026-04-23
session: release-workflow
trigger: Running pnpm version-packages before pushing commits to origin causes changesets to fail
correction: Always git push origin main before running pnpm version-packages
root_cause: The changesets GitHub lookup queries origin for commit metadata. If commits only exist locally, the API returns 404 and the version bump aborts.
prevention: Release workflow must push first, then version. Added to .claude/rules/gotchas.md.
feeds_back_into: .claude/rules/gotchas.md#releases-changesets--rialto
---

## Summary

The `@changesets/get-github-info` package fetches commit metadata from the GitHub API during `pnpm version-packages`. This means all commits referenced in changesets must already exist on `origin` before the version command runs. Running `pnpm version-packages` with unpushed local commits causes the GitHub lookup to return 404, aborting the version bump mid-flight. The correct release sequence is always: push to origin first, then run version-packages. This constraint is documented in `.claude/rules/gotchas.md` under the Releases section.
