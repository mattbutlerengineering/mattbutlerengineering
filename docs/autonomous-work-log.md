# Autonomous Work Log

A human-facing snapshot of what the autonomous systems in this repo are
doing on their own. Pairs with [docs/ai-ops-runbook.md](./ai-ops-runbook.md)
(how to debug them) and [docs/acmm.md](./acmm.md) (how we measure them).

This is a **living doc** — refreshed manually today, scheduled to become
auto-generated (see "Make this auto-update" at bottom).

## What's running on its own

| System                 | Cadence (PT) | What it does                                                     | Live status                     |
| ---------------------- | ------------ | ---------------------------------------------------------------- | ------------------------------- |
| `mbe-acmm-audit`       | Daily 10:00  | `audit.js --apply --badge` — files L+1 gap issues, updates badge | https://claude.ai/code/routines |
| `mbe-light-audit`      | Tue–Sun 9:41 | `/site-audit` lite                                               | https://claude.ai/code/routines |
| `mbe-deep-audit`       | Mon 8:23     | `/site-audit` deep + Lighthouse + Playwright                     | https://claude.ai/code/routines |
| `mbe-issue-worker`     | Every 2h     | Picks `ready`-labeled issues, opens PRs                          | https://claude.ai/code/routines |
| `mbe-progress-tracker` | Daily 17:11  | Logs metrics, tunes circuit breaker                              | https://claude.ai/code/routines |

## Recent autonomous activity

Last refreshed on **2026-05-23 08:56 PT**. All times UTC unless noted.

### Autonomous actions log

| Date       | Action type         | Artifact                                                                            | Description                                                      | Outcome |
| ---------- | ------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| 2026-05-23 | PR merged (agent)   | [#1661](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1661)   | parseListQuery + createListResponseSchema utilities              | success |
| 2026-05-23 | PR merged (agent)   | [#1659](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1659)   | Extract CliAdapterBase from CLI adapters                         | success |
| 2026-05-23 | PR merged (agent)   | [#1658](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1658)   | Extract startServiceServer helper                                | success |
| 2026-05-23 | PR merged (agent)   | [#1656](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1656)   | Inline api-versioning into createServiceApp                      | success |
| 2026-05-23 | PR merged (agent)   | [#1653](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1653)   | Split task-intelligence into source-resolver + budget-calculator | success |
| 2026-05-23 | PR merged (agent)   | [#1652](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1652)   | Product improvement discoverer                                   | success |
| 2026-05-23 | PR merged           | [#1650](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1650)   | Threshold auto-tuner with guard rails                            | success |
| 2026-05-23 | PR merged           | [#1640](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1640)   | Sensor correlator for cross-sensor root cause grouping           | success |
| 2026-05-23 | PR merged           | [#1639](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1639)   | Substance checkers for Tier 2 artifact validation                | success |
| 2026-05-23 | PR merged           | [#1638](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1638)   | Process metrics collector                                        | success |
| 2026-05-22 | Issue created       | [#1646](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1646) | Extract CliAdapterBase from gemini/opencode adapters             | closed  |
| 2026-05-22 | Issue created       | [#1645](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1645) | Migrate feature-flag consumers to createFeatureContext()         | closed  |
| 2026-05-22 | Issue created       | [#1644](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1644) | Add parseListQuery and createListResponseSchema utilities        | closed  |
| 2026-05-22 | Issue created       | [#1643](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1643) | Extract startServiceServer helper                                | closed  |
| 2026-05-22 | Issue filed (audit) | [#1618](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1618) | Site unreachable from audit environment                          | closed  |

### Summary metrics

| Metric                      | Value                            | Period       |
| --------------------------- | -------------------------------- | ------------ |
| PRs merged (agent-authored) | 10                               | Last 7 days  |
| Issues created by sensors   | 6                                | Last 7 days  |
| Human intervention rate     | 12.5% (2/16 PRs closed unmerged) | Last 30 days |
| Agent PR acceptance rate    | 87.5%                            | Last 30 days |
| Median time-to-merge        | 1.4 hours                        | Last 30 days |
| Agent PR revert rate        | 0%                               | Last 30 days |

### ACMM-filed issues

| Open | Total filed | Notes                                                                                                 |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------- |
| 9    | 30+         | 9 new ACMM gap issues (#1662–#1670) filed for L3→L6 uncap. Earlier gap issues (#920–#949) all closed. |

### ACMM trend

| Date       | Level | Detected | Headline                                           |
| ---------- | ----- | -------- | -------------------------------------------------- |
| 2026-04-23 | L4    | (seed)   | Initial scoring                                    |
| 2026-04-30 | L6    | 54/85    | First full L6 pass                                 |
| 2026-05-01 | L6    | 85/85    | Perfect score — all criteria detected              |
| 2026-05-10 | L3    | 106/108  | Re-capped to L3 after honest audit                 |
| 2026-05-22 | L3    | 107/113  | 5 meta-criteria added, substance fixes in progress |

(See `node plugins/acmm/scripts/audit.js --trend` for the live history.)

## Open audit-derived work

9 ACMM gap-closure issues open (#1662–#1670) for L3→L6 uncap. PRs in progress for #1662 (metrics collectors), #1663 (product-improvements check), #1664–#1667 (substance fixes), #1668 (auto-rollback drill). #1670 (remove levelCap) blocked by all others.

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
`gh` queries + `node plugins/acmm/scripts/audit.js --trend`. Block markers
between `<!-- autonomous-log:begin -->` and `<!-- autonomous-log:end -->`
would let it preserve manual annotations outside the auto-rewritten
section.

The human-facing requirement (visibility into autonomous behavior) is
satisfied today; the auto-update is a quality-of-life upgrade, not a
correctness one.
