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

| Script                         | Purpose                                                                 |
| ------------------------------ | ----------------------------------------------------------------------- |
| `generate-dep-graph.js`        | Generate Mermaid dependency graph of workspace packages                 |
| `generate-dep-graph.mjs`       | Generate JSON dependency graph (`infrastructure/worker/dep-graph.json`) |
| `generate-acmm-report.mjs`     | Build ACMM report JSON for the marketing dashboard                      |
| `generate-audit-inventory.mjs` | Generate audit inventory from the surface registry                      |
| `generate-metrics-json.mjs`    | Build metrics JSON for the quality dashboard                            |
| `update-schema-baselines.js`   | Update schema baseline JSON for backward compat checking                |
| `process-a11y-results.js`      | Parse Vitest JSON output and segment a11y violations by author          |

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

| Script                       | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `cors-audit.mjs`             | Scan Fastify services for CORS configuration issues |
| `detect-instruction-rot.mjs` | Detect stale content in AI instruction files        |
| `health-metrics.mjs`         | Persist service health metrics (ACMM L3 signal)     |
| `pr-metrics.mjs`             | Track PR acceptance rate (ACMM L3 signal)           |
| `record-bundle-sizes.js`     | Snapshot bundle sizes for all frontend apps         |
| `resource-audit.mjs`         | Find orphaned cloud resources                       |

## Maintenance

| Script               | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `clean-worktrees.sh` | Remove stale agent worktrees under `.claude/worktrees/` |

## Testing

Script tests live in `__tests__/` and use the Vitest config at `vitest.config.mjs`.

```bash
pnpm --dir scripts test
```
