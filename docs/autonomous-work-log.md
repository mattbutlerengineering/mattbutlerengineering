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

Last refreshed on **2026-05-02 09:46 PT**. All times UTC unless noted.

### PRs merged (last 8)

| Merged | # | Title |
|---|---|---|
| 2026-05-02 16:27 | [#979](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/979) | fix(security): suppress false-positive CodeQL alerts in embed code highlighter |
| 2026-05-02 16:17 | [#978](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/978) | fix(security): anchor regex in dep-bump-merger to prevent ReDoS |
| 2026-05-02 05:51 | [#976](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/976) | fix(security): ReDoS and bad HTML filter |
| 2026-05-02 05:49 | [#975](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/975) | fix(security): command injection in worktree-manager |
| 2026-05-02 05:48 | [#974](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/974) | fix(security): suppress false-positive rate-limiting alerts |
| 2026-05-02 05:47 | [#973](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/973) | fix(security): SSRF in webhook collaborator permission check |
| 2026-05-02 05:50 | [#972](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/972) | fix(security): prevent command injection in worktree-manager |
| 2026-05-02 05:44 | [#966](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/966) | fix(security): validate webhook inputs to prevent SSRF |

### Most-recent workflow runs

| Time (UTC) | Workflow | Outcome |
|---|---|---|
| 2026-05-02 16:30 | Deploy Storybook to GitHub Pages | success |
| 2026-05-02 16:29 | Post-Deploy Smoke Tests | success |
| 2026-05-02 16:29 | Post-Deploy Check | success |
| 2026-05-02 16:29 | Auto-Rollback on Agent Regression | skipped |
| 2026-05-02 16:27 | Auto-Rollback on Agent Regression | skipped |

(See `gh run list` for the full feed.)

### ACMM-filed issues

| Open | Total filed | Notes |
|---|---|---|
| 0 | 20+ | All filed ACMM gap issues (#920–#949) have been closed. Zero open ACMM gaps remain. |

### ACMM trend

| Date | Level | Detected | Headline |
|---|---|---|---|
| 2026-04-23 | L4 | (early seed) | Initial scoring, soft pass |
| 2026-04-25 | L5 | 49/85 | Reflection log + observability runbook landed; L6 = 1/6 |
| 2026-04-30 | L6 | 54/85 | First full L6 pass — all 6 L6 criteria detected |
| 2026-05-01 | L6 | 85/85 | Perfect score — all criteria across 4 frameworks detected |

(See `node plugins/acmm/scripts/audit.js --trend` for the live history.)

## Open audit-derived work

No open audit-derived issues remain. All previously tracked items (#36, #38, #39, #504) have been resolved.

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
