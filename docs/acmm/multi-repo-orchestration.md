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

| Package | Registry | Known Consumers |
|---------|----------|-----------------|
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

## Multi-Repo Orchestrator Script

A proof-of-concept orchestrator is available at `scripts/orchestrate-multi.mjs`. It uses the `gh` CLI to clone a target repository, create a feature branch, apply changes, commit, push, and open a pull request.

### CLI Usage

```bash
node scripts/orchestrate-multi.mjs --repo <url> --task "<description>" [options]
```

Required:
- `--repo <url>` — GitHub repository URL (e.g. `https://github.com/org/repo`)
- `--task "<desc>"` — PR title and commit message describing the change

Options:
- `--branch <name>` — Feature branch name (default: `orchestrate-<timestamp>`)
- `--script <path>` — Path to a script to run inside the cloned repo to apply changes
- `--dry-run` — Print what would be done without making changes

### Examples

```bash
# Bump a dependency in a downstream repo
node scripts/orchestrate-multi.mjs \
  --repo https://github.com/example/downstream \
  --task "Bump @mbe/rialto to v2.0.0" \
  --branch chore/rialto-v2

# Apply changes via a custom script
node scripts/orchestrate-multi.mjs \
  --repo https://github.com/example/downstream \
  --task "Update config for new API" \
  --script ./scripts/migrate-downstream.sh

# Preview what would happen
node scripts/orchestrate-multi.mjs \
  --dry-run \
  --repo https://github.com/example/downstream \
  --task "Bump dependency"
```

### Prerequisites

1. **GitHub CLI (`gh`)** must be installed and authenticated (`gh auth login`).
2. The script uses `gh` to clone, push, and create PRs — no separate GitHub token needed.
3. Your `gh` session must have permission to push branches and open PRs in the target repository.

## Current Status

- **Manual coordination.** Cross-repo changes are coordinated by the developer who publishes the new version. The `scripts/orchestrate-multi.mjs` script automates the PR creation step.
- **Monorepo structure minimizes the need.** The vast majority of dependent code lives within this repo.
- **Automation deferred.** There are currently few external consumers, so the cost of building fully automated cross-repo orchestration exceeds the benefit. The PoC script provides a foundation for when the need grows.

## Execution Log

Executed: 2026-05-12 — Dry run of multi-repo orchestration script against mattbutlerengineering monorepo.
