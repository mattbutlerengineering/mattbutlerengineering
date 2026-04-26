# Autonomous Work Log

A human-facing snapshot of what the autonomous systems in this repo are
doing on their own. Pairs with [docs/ai-ops-runbook.md](./ai-ops-runbook.md)
(how to debug them) and [docs/acmm.md](./acmm.md) (how we measure them).

This is a **living doc** — refreshed manually today, scheduled to become
auto-generated (see "Make this auto-update" at bottom).

## What's running on its own

| System | Cadence (PT) | What it does | Live status |
|---|---|---|---|
| `mbe-acmm-audit` | Daily 10:00 | `audit.js --apply --badge` — files L+1 gap issues, updates badge | https://claude.ai/code/routines |
| `mbe-light-audit` | Tue–Sun 9:41 | `/site-audit` lite | https://claude.ai/code/routines |
| `mbe-deep-audit` | Mon 8:23 | `/site-audit` deep + Lighthouse + Playwright | https://claude.ai/code/routines |
| `mbe-issue-worker` | Every 2h | Picks `ready`-labeled issues, opens PRs | https://claude.ai/code/routines |
| `mbe-progress-tracker` | Daily 17:11 | Logs metrics, tunes circuit breaker | https://claude.ai/code/routines |

## Recent autonomous activity

Last refreshed manually on **2026-04-25 16:00 PT**. All times UTC unless noted.

### PRs merged (last 8)

| Merged | # | Title | Origin |
|---|---|---|---|
| 2026-04-25 23:10 | [#642](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/642) | fix(ci): silence false-positive SC2016 in migrate Dockerfile | Manual + CI feedback |
| 2026-04-25 23:07 | [#641](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/641) | fix(ci): lazy DATABASE_URL in prisma.config so generate works without DB | Manual + CI feedback |
| 2026-04-25 23:01 | [#640](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/640) | fix(ci): unblock 3 more workflows with same multi-line bash bug | Manual + actionlint |
| 2026-04-25 22:56 | [#639](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/639) | fix(ci): unblock 3 workflows rejected at parse-time | Manual + actionlint |
| 2026-04-25 22:44 | [#638](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/638) | fix(infra): add node types to Pulumi tsconfig | CI failure follow-up |
| 2026-04-25 22:42 | [#637](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/637) | fix(infra): add node types to Pulumi tsconfig | CI failure follow-up |
| 2026-04-25 21:49 | [#632](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/632) | fix(rialto-catalog): add node types | Pre-existing typecheck gap |
| 2026-04-25 17:42 | [#628](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/628) | feat(acmm): land L4 + L5 artifacts → Level 4 (45/85) | Manual L4→L5 climb |

### Most-recent workflow runs

| Time (UTC) | Workflow | Outcome |
|---|---|---|
| 2026-04-25 23:15 | Post-Deploy Smoke Tests | skipped |
| 2026-04-25 23:15 | Circuit Breaker | failure |
| 2026-04-25 23:10 | Secret Scan | success |
| 2026-04-25 23:10 | CI | failure |
| 2026-04-25 23:10 | ADR check | success |

(See `gh run list` for the full feed.)

### ACMM-filed issues

| Open | Total filed | Notes |
|---|---|---|
| 0 | 0 | None filed yet — `--apply` hasn't surfaced an unmet gap that wasn't already closed manually inside this session. The daily 10:00 PT trigger may file new ones at the next L6 catch-up. |

### ACMM trend

| Date | Level | Detected | Headline |
|---|---|---|---|
| 2026-04-23 | L4 | (early seed) | Initial scoring, soft pass |
| 2026-04-25 | L5 | 49/85 | Reflection log + observability runbook landed; L6 = 1/6 |

(See `node scripts/acmm/audit.js --trend` for the live history.)

## Open audit-derived work

| # | Title | Age |
|---|---|---|
| [#504](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/504) | Audit: mcp-server build failing | ~18 days |
| [#39](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/39) | [Audit] hospitality service worker hijacks /rialto routes | ~27 days |
| [#38](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/38) | [Audit] CI: rialto-catalog drift-check test times out | ~27 days |
| [#36](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/36) | [Audit] Bug: Rialto test suite failing | ~27 days |

(These are old — the audit cadence is finding them but the issue-worker
hasn't picked them up. Investigate why the `ready` label isn't sticking,
or whether the issue-worker's prompt is filtering them out.)

## How to read this doc

- **PRs merged** = recent autonomous + manual deltas. Filter for the agent's
  patterns (`fix(ci):`, `feat(acmm):`, agent-authored title prefixes) to
  isolate autonomous work.
- **Workflow runs** = last few CI executions. Repeated failures on the same
  workflow are a signal to either fix the workflow or stop running it.
- **ACMM-filed issues** = work the audit has explicitly proposed for the
  agent loop. If this number grows without `Open` going down, the
  `mbe-issue-worker` isn't draining it — investigate.
- **Trend** = ACMM history. Level should monotonically climb; a drop is
  the alarm.

## Make this auto-update

Today this doc is hand-refreshed. The honest path forward (separate
issue): a workflow that runs every 6h and rewrites this file from
`gh` queries + `node scripts/acmm/audit.js --trend`. Block markers
between `<!-- autonomous-log:begin -->` and `<!-- autonomous-log:end -->`
would let it preserve manual annotations outside the auto-rewritten
section.

The human-facing requirement (visibility into autonomous behavior) is
satisfied today; the auto-update is a quality-of-life upgrade, not a
correctness one.
