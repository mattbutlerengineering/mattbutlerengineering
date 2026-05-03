# Multi-Repo Orchestration

> ACMM Level 6 criterion: coordinating AI-driven changes across dependent repositories.

## Problem

L6 autonomy within a single repository does not help when a change requires updates to multiple dependent repositories. A breaking change in a shared library can silently break downstream consumers if there is no coordination strategy. As AI agents gain the ability to detect issues, generate fixes, and merge PRs autonomously, that autonomy must extend beyond a single repo boundary to be truly effective.

## Current Monorepo Advantage

This project (`mattbutlerengineering`) is a monorepo managed by pnpm workspaces and Turborepo. Most cross-package coordination is already handled:

- **Internal consumers** reference shared packages via `workspace:*` and pick up source changes directly.
- **Turborepo** builds dependents in the correct order, so a change to `packages/rialto` automatically rebuilds `apps/hospitality` and `apps/rialto-web`.
- **CI runs against the full workspace**, catching integration failures before merge.
- **ACMM audits** scan all packages and services in a single pass.

Because of this structure, the vast majority of cross-package changes are already coordinated within a single commit, PR, and CI run.

## External Consumers

Published packages have downstream consumers outside this monorepo:

| Package                         | Registry        | Known Consumers                           |
| ------------------------------- | --------------- | ----------------------------------------- |
| `@mattbutlerengineering/rialto` | GitHub Packages | External projects using the design system |

When a published package ships a breaking change, external consumers must update their dependency and adapt to the new API. Without coordination, they discover the breakage only when they next run `npm install` or their CI fails on a seemingly unrelated update.

## Coordination Strategy

When a change affects both this monorepo and external consumers:

1. **Update the shared library in this repo first.** Make the change, add tests, and merge to `main` through the normal PR flow.
2. **Publish a new version.** Run `pnpm release` from the package directory. Follow semver: breaking changes get a major bump with a changelog entry describing the migration path.
3. **Open PRs in downstream repos.** For each known consumer, open a PR that bumps the dependency version and applies any required migration changes. Include a link back to the upstream changelog.
4. **Verify downstream CI passes.** Wait for the downstream PR's CI to complete. If it fails, fix the migration in the downstream PR before merging.

### Semver Discipline

The coordination strategy depends on accurate semver:

- **Patch** (1.0.x): Bug fixes, no API changes. Downstream consumers pick these up automatically if using `^` ranges.
- **Minor** (1.x.0): New features, no breaking changes. Safe for automatic pickup.
- **Major** (x.0.0): Breaking changes. Requires manual migration in downstream repos. Always include a migration guide in the changelog.

## Future Automation

When external consumer count justifies the investment, an agent workflow could automate the coordination:

1. **Breaking change detection.** A CI step diffs the public API surface (exported types, function signatures) against the previous release. If the diff contains removals or signature changes, it flags the PR as potentially breaking.
2. **Downstream PR generation.** On publish of a new major version, an agent opens PRs in each registered downstream repo that:
   - Bumps the dependency to the new version
   - Applies known migration patterns (renamed exports, changed signatures)
   - Runs the downstream test suite
3. **Cross-repo CI monitoring.** A dashboard or notification tracks whether all downstream PRs pass CI, flagging repos that need manual intervention.
4. **Rollback coordination.** If a published version causes widespread downstream failures, the agent can yank the release and notify affected repos.

### Implementation Prerequisites

Before building this automation:

- Maintain a registry of downstream consumers (a `downstream-consumers.json` or equivalent).
- Establish a machine-readable migration format (codemods or AST transforms) for breaking changes.
- Set up cross-repo GitHub App permissions so the agent can open PRs in downstream repos.

## Current Status

- **Manual coordination.** Cross-repo changes are coordinated by the developer who publishes the new version.
- **Monorepo structure minimizes the need.** The vast majority of dependent code lives within this repo.
- **Automation deferred.** There are currently few external consumers, so the cost of building automated cross-repo orchestration exceeds the benefit. This document will be revisited when the number of external consumers grows.
