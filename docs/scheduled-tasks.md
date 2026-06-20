# Scheduled Tasks (Cloud Routines)

This repo is maintained partly by **scheduled cloud agents** — isolated Claude Code
sessions that run on a cron schedule in Anthropic's cloud (CCR), each with its own
git checkout. They are distinct from local `/loop` sessions: cloud routines keep
running after you close your terminal, and they push to **PRs for review** rather
than auto-merging.

- **Manage / disable / inspect:** https://claude.ai/code/routines
- **Create or edit from the CLI:** the `/schedule` skill (uses the `RemoteTrigger` tool).
- Routines **cannot be deleted via the API** — disable them in the web UI.

All times below are **America/Los_Angeles (PT)**; cron expressions are stored in UTC.

## Routine catalog

| Routine                  | Cadence (PT)        | Cron (UTC)   | Output                | Purpose                                                 |
| ------------------------ | ------------------- | ------------ | --------------------- | ------------------------------------------------------- |
| `mbe-deep-audit`         | Mon 8:23am          | —            | issues                | Weekly full site audit (Playwright + Lighthouse)        |
| `mbe-morning`            | Daily 9:03am        | —            | issues / PRs          | Light site audit + ACMM audit + issue-worker            |
| `mbe-learning-loop`      | Daily 11:00am       | —            | issues                | Sensor report → verify past fixes → triage regressions  |
| `mbe-midday`             | Daily 1:07pm        | —            | PRs                   | issue-worker + CI monitor                               |
| `mbe-evening`            | Daily 5:11pm        | —            | PRs / metrics         | issue-worker + progress-tracker                         |
| `mbe-weekly-improve`     | Fri 7:00am          | `0 14 * * 5` | 1 PR + `ready` issues | Codebase improvement survey → implement the best change |
| `mbe-monthly-meta-audit` | 1st of month 7:00am | `0 14 1 * *` | 1 PR + `ready` issues | Claude Code config + docs/automation health             |

> The legacy `mbe-*` audit/worker triggers are managed in the claude.ai UI and
> their exact prompts live there. The two improvement routines below were created
> via `/schedule` and their prompts are reproduced here so they can be reviewed and
> version-controlled.

## `mbe-weekly-improve`

- **When:** every Friday 7:00am PT (`0 14 * * 5` UTC). Friday is the documented
  highest-token-headroom day.
- **What it does:** runs the `improve` and `improve-codebase-architecture` skills (or
  the equivalent analysis if the skills aren't present in the cloud checkout),
  synthesizes a prioritized findings list, then:
  1. Implements the **single most useful, reasonably-sized** change (Small/Medium,
     low-risk, high-value) via TDD + full gates, and opens **one PR** targeting `main`.
  2. Files the remaining strong findings as GitHub issues labeled `ready` (with
     self-contained acceptance criteria) so `/implement-queue` can drain them.
- **Does not merge.** Every change lands as a reviewable PR.

## `mbe-monthly-meta-audit`

- **When:** the 1st of each month 7:00am PT (`0 14 1 * *` UTC).
  > "First Friday" was requested, but standard cron can't reliably express it
  > (day-of-month + day-of-week is OR-semantics), so this uses the 1st of the month.
  > Adjust in the web UI if a Friday cadence is preferred.
- **What it does:** runs the `claude-md-improver` and `claude-automation-recommender`
  skills (or the equivalent analysis), then opens **one PR** for the best doc/automation
  improvement and files `ready` issues for the rest. Targets Claude Code config quality:
  stale CLAUDE.md references, missing guidance, and worthwhile new hooks/agents/skills.
- **Does not merge.**

## Plan budget (Max 5x)

The Max 5x plan allows ~5 scheduled runs/day. The **daily** baseline is 4 runs
(`mbe-morning`, `mbe-midday`, `mbe-evening`, `mbe-learning-loop`). Weekly/occasional
triggers add a 5th run on their day:

- Mon: + `mbe-deep-audit` → 5
- Fri: + `mbe-weekly-improve` → 5
- 1st of month: + `mbe-monthly-meta-audit` → 5 (or briefly 6 if the 1st is a Mon/Fri)

The rare 6-run overlap is acceptable; if it causes throttling, shift
`mbe-monthly-meta-audit` to a mid-month date in the web UI.

## Editing a routine

```text
/schedule          # then: "list routines", "update mbe-weekly-improve to ...", etc.
```

Or call the `RemoteTrigger` tool directly (`action: list|get|create|update|run`).
Each routine's prompt is self-contained — the cloud agent starts with **zero context**,
so any behavior change must be made in the prompt itself.
