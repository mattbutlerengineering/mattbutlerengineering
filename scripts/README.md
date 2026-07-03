# Scripts

Standalone tooling scripts used by CI workflows, agent automation, and manual development tasks. Most are Node.js (`.js`/`.mjs`), with one shell script.

## Architecture Fitness Tests

Guard invariants across the monorepo. Run by CI on every PR.

| Script                            | Purpose                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| `check-circular-deps.js`          | Detect circular dependencies between `@mbe/*` workspace packages           |
| `check-dep-versions.js`           | Verify shared dependencies use consistent version ranges                   |
| `check-dep-sync.mjs`              | Audit dependency sync across workspaces (robust version)                   |
| `check-destructive-migrations.js` | Flag destructive Prisma migration SQL (DROP, TRUNCATE, DELETE)             |
| `check-dockerfile-deps.js`        | Verify service Dockerfiles include all `@mbe/*` deps                       |
| `check-env-sync.js`               | Validate environment variable consistency across services                  |
| `check-schema-compat.js`          | Verify schema baseline files exist for all services                        |
| `check-service-bindings.js`       | Ensure service binding names are consistent across Pulumi, Worker, and DNS |

## Code Generation

| Script                         | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `generate-dep-graph.js`        | Generate Mermaid dependency graph (`docs/architecture/dependency-graph.md`)                      |
| `generate-dep-graph.mjs`       | Generate JSON dependency graph (`infrastructure/worker/dep-graph.json`)                          |
| `generate-acmm-report.mjs`     | Build ACMM report JSON for the marketing dashboard                                               |
| `generate-audit-inventory.mjs` | Generate audit inventory from the surface registry                                               |
| `generate-metrics-json.mjs`    | Build ACMM state → `apps/marketing/public/metrics.json` for the quality dashboard                |
| `update-schema-baselines.js`   | Update schema baseline JSON for backward compat checking                                         |
| `process-a11y-results.mjs`     | Parse Vitest JSON output, segment a11y violations by author, fail CI on agent-branch regressions |

> `generate-dep-graph.js` and `generate-dep-graph.mjs` are **not duplicates** — they emit
> different committed artifacts (Mermaid markdown vs. JSON) for different consumers
> (`docs/architecture/dependency-graph.md` docs vs. `infrastructure/worker/dep-graph.json`
> tooling). Both consume the single canonical `dep-graph-discovery.mjs` module, so there is
> no duplicated workspace-discovery logic between them — only the shared discovery walk that
> module exists to prevent duplicating in the first place. `pnpm graph` runs the `.js`
> generator; `pnpm generate:dep-graph` runs the `.mjs` generator; `pnpm regen` runs both.

## Agent / Automation

| Script                  | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `orchestrate.mjs`       | Multi-agent orchestration -- decompose task into parallel subtasks |
| `orchestrate-multi.mjs` | Multi-session orchestration variant                                |
| `auto-qa-tune.mjs`      | Auto-tune QA thresholds for the agent loop                         |
| `chaos-agent.mjs`       | Seed detectable non-breaking bugs to test audit pipelines          |
| `sensor-report.mjs`     | Unified sensor aggregation for the learning loop                   |
| `verify-fixes.mjs`      | Post-fix verification for the learning loop                        |
| `revert-rca.mjs`        | Trigger reflection on AI PR reversions                             |
| `log-agent-cost.js`     | Log agent session cost for spend tracking                          |

## Metrics / Auditing

| Script                       | Purpose                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cors-audit.mjs`             | Scan Fastify services for CORS configuration issues                                                               |
| `detect-instruction-rot.mjs` | Detect stale content in AI instruction files                                                                      |
| `health-metrics.mjs`         | Poll prod `/health` endpoints, append to `metrics/service-health.jsonl` (ACMM L3 signal)                          |
| `pr-metrics.mjs`             | `gh`-backed CLI: compute + persist overall AI PR acceptance rate to `metrics/pr-acceptance.json` (ACMM L3 signal) |
| `collect-pr-metrics.mjs`     | Pure per-category PR acceptance breakdown, consumed by `sensor-report.mjs` — no I/O of its own                    |
| `process-metrics.mjs`        | Learning-loop process metrics: time-to-fix, cost, success/FP rate, improvements shipped                           |
| `record-bundle-sizes.js`     | Snapshot bundle sizes for all frontend apps                                                                       |
| `resource-audit.mjs`         | Find orphaned cloud resources                                                                                     |

> `pr-metrics.mjs`, `collect-pr-metrics.mjs`, `health-metrics.mjs`, `generate-metrics-json.mjs`
> (Code Generation, above), and `process-metrics.mjs` all touch "metrics" but are **not
> duplicates**: each reads a different source (`gh pr list`, prod `/health` endpoints, ACMM
> `state.json`, issue/comment history) and writes a different output for a different
> consumer. `pr-metrics.mjs` is a standalone `gh`-backed CLI; `collect-pr-metrics.mjs` is the
> pure, unit-tested per-category variant `sensor-report.mjs` imports — same PR data source,
> different aggregation, deliberately separate so the pure function stays testable without a
> live `gh` call.

## Maintenance

| Script                      | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `cleanup-chaos-branches.sh` | Delete stale `chaos/synthetic-bug-*` branches (local + remote) |

Stale agent-worktree removal (`.claude/worktrees/`) lives on the `mbe cleanup-worktrees` CLI
command (`tools/cli/src/commands/cleanup-worktrees.ts`), not a `scripts/` shell script — see
[`tools/cli/CLAUDE.md`](../tools/cli/CLAUDE.md).

## Testing

Script tests live in `__tests__/` and use the Vitest config at `vitest.config.mjs`.

```bash
pnpm --dir scripts test
```
