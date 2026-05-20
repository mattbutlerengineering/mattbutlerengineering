# CI/CD Workflows

GitHub Actions workflows for the mattbutlerengineering monorepo. Organized by function below.

## Core CI/CD

These run on every push or pull request and gate merges.

| Workflow              | Trigger      | Purpose                                                    |
| --------------------- | ------------ | ---------------------------------------------------------- |
| `ci.yml`              | push, PR     | Lint, typecheck, test, build, coverage, architecture audit |
| `deploy-static.yml`   | push to main | Deploy static sites to Cloudflare Workers                  |
| `deploy-services.yml` | push to main | Deploy API services to DigitalOcean App Platform           |
| `pulumi-up.yml`       | push to main | Apply infrastructure changes via Pulumi                    |
| `release.yml`         | push to main | Publish packages (changesets)                              |
| `merge-queue.yml`     | PR, schedule | Manage merge queue and conflict detection                  |
| `post-merge.yml`      | push to main | Post-merge reconciliation (dep-graph, schema baselines)    |

## PR Quality Gates

Run on pull requests to enforce standards before merge.

| Workflow                     | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `adr-check.yml`              | Validate ADR format and index              |
| `ai-attribution.yml`         | Check accessibility + AI attribution       |
| `auto-review.yml`            | Automated code review                      |
| `coverage-gate.yml`          | Enforce test coverage thresholds           |
| `e2e.yml`                    | End-to-end tests via Playwright            |
| `instruction-regression.yml` | Detect regressions in AI instruction files |
| `preview-deploy.yml`         | Deploy PR preview environments             |
| `revert-rca-loop.yml`        | Detect reverted AI PRs, trigger RCA        |
| `secret-scan.yml`            | Scan for leaked secrets                    |
| `storybook.yml`              | Build and deploy Storybook                 |
| `tier-classifier.yml`        | Classify PR risk tier for review routing   |

## Scheduled Maintenance

Run on cron schedules for ongoing health and compliance.

| Workflow                       | Schedule  | Purpose                                  |
| ------------------------------ | --------- | ---------------------------------------- |
| `acmm-cold-start.yml`          | scheduled | Initialize ACMM state for new workspaces |
| `acmm-state-backup.yml`        | scheduled | Back up ACMM state files                 |
| `ai-audit.yml`                 | scheduled | AI audit trail generation                |
| `audit-scout.yml`              | monthly   | Improvement opportunity scan             |
| `audit-sweep.yml`              | weekly    | Rotating zone site audit                 |
| `auto-issue.yml`               | scheduled | Auto-generate issues from audit findings |
| `auto-qa-tune.yml`             | scheduled | Tune QA thresholds                       |
| `backup-verify.yml`            | scheduled | Verify database backups                  |
| `branch-cleanup.yml`           | scheduled | Delete merged/stale branches             |
| `changelog.yml`                | scheduled | Generate changelog                       |
| `chaos-agent.yml`              | scheduled | Seed detectable bugs to test audit loops |
| `claude-md-sync.yml`           | scheduled | Sync CLAUDE.md across workspaces         |
| `cors-audit.yml`               | scheduled | Audit CORS configuration                 |
| `dependency-freshness.yml`     | scheduled | Check for outdated dependencies          |
| `lighthouse.yml`               | scheduled | Track Lighthouse scores                  |
| `load-test.yml`                | scheduled | Run load tests against production        |
| `mutation-testing.yml`         | scheduled | Mutation testing for test quality        |
| `nightly-compliance.yml`       | scheduled | Nightly compliance checks                |
| `pr-metrics.yml`               | scheduled | Track PR acceptance metrics              |
| `production-feedback.yml`      | scheduled | Collect production feedback signals      |
| `reflection-review.yml`        | scheduled | Review and process reflections           |
| `resource-audit.yml`           | scheduled | Find orphaned cloud resources            |
| `revert-rca-detection.yml`     | scheduled | Detect reverted commits                  |
| `secret-rotation-reminder.yml` | scheduled | Remind about secret rotation             |
| `sentry-triage.yml`            | scheduled | Triage Sentry production errors          |
| `stale-in-progress.yml`        | scheduled | Detect stale in-progress issues          |
| `synthetic-monitoring.yml`     | scheduled | Synthetic uptime monitoring              |
| `uptime-snapshot.yml`          | scheduled | Capture uptime snapshots                 |
| `worktree-cleanup.yml`         | scheduled | Clean up stale agent worktrees           |

## Automation

| Workflow                    | Trigger          | Purpose                                    |
| --------------------------- | ---------------- | ------------------------------------------ |
| `agent-task.yml`            | manual           | Run an agent task via workflow dispatch    |
| `auto-label.yml`            | issue events     | Auto-label new issues                      |
| `auto-merge.yml`            | PR               | Auto-merge policy enforcement              |
| `auto-rollback.yml`         | manual           | Rollback agent regressions                 |
| `circuit-breaker.yml`       | manual           | Circuit breaker for runaway automation     |
| `claude.yml`                | PR review        | Trigger Claude Code on review comments     |
| `copilot-review-apply.yml`  | PR               | Apply Copilot review suggestions           |
| `dependabot-auto-merge.yml` | PR               | Auto-merge Dependabot dev dependency bumps |
| `e2e-screenshots.yml`       | push, PR, manual | Capture E2E screenshots                    |
| `post-deploy-check.yml`     | manual           | Verify deployment health                   |
| `revert-watchdog.yml`       | push to main     | Watch for reverted commits                 |
| `smoke-tests.yml`           | manual           | Post-deploy smoke tests (deprecated)       |

## Adding a New Workflow

1. Create `<name>.yml` in this directory
2. Set appropriate triggers (`on:` block)
3. Use `actions/checkout@v4` and `pnpm/action-setup@v4` for Node.js jobs
4. Reference shared secrets via `${{ secrets.NAME }}`
5. See `ci.yml` for the standard job structure
