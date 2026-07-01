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

| Routine                  | Cadence (PT)        | Cron (UTC)   | Output                | Purpose                                                    |
| ------------------------ | ------------------- | ------------ | --------------------- | ---------------------------------------------------------- |
| `mbe-deep-audit`         | Mon 9:23am          | `23 16 * * 1`| issues                | Weekly live-site availability sweep — **runs in GitHub Actions** (`audit-sweep.yml`), not claude.ai (see note) |
| `mbe-morning`            | Daily 9:03am        | —            | issues / PRs          | Light site audit + ACMM audit + issue-worker               |
| `mbe-learning-loop`      | Daily 11:00am       | —            | issues                | Sensor report → verify past fixes → triage regressions     |
| `mbe-midday`             | Daily 1:07pm        | —            | PRs                   | issue-worker + CI monitor                                  |
| `mbe-evening`            | Daily 5:11pm        | —            | PRs / metrics         | issue-worker + progress-tracker + optimize-implement-queue |
| `mbe-weekly-improve`     | Fri 7:00am          | `0 14 * * 5` | 1 PR + `ready` issues | Codebase improvement survey → implement the best change    |
| `mbe-monthly-meta-audit` | 1st of month 7:00am | `0 14 1 * *` | 1 PR + `ready` issues | Claude Code config + docs/automation health                |

> **`mbe-deep-audit` runs in GitHub Actions, not claude.ai.** The claude.ai
> remote environment has **no egress to the live site** — its agent proxy denies
> the outbound CONNECT tunnel (`curl (56) CONNECT tunnel failed`, HTTP `000`), so
> a cloud routine can never reach production (verified 2026-07-01, issue #2920).
> The deep audit therefore executes in `.github/workflows/audit-sweep.yml`, where
> GitHub runners have both egress and the `AUDIT_TOKEN` secret. The claude.ai
> `mbe-deep-audit` RemoteTrigger is disabled to avoid re-filing the same
> infrastructure issue every week.

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
  3. **Weekly eval checkpoint:** runs `mbe agent eval` once against the agent
     evaluation suite to catch slow-drift quality regressions that the daily
     free telemetry scorecard (see `optimize-implement-queue` below) can't see.
     Files a `ready` issue if the eval score regresses versus the prior baseline.
     This is the only _scheduled_ paid eval — the daily optimizer fires eval
     only on a flagged regression, never on every run.
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

## `optimize-implement-queue` (folded into `mbe-evening`)

The daily agent-workflow optimizer (tracking issue #2744). It is **not a new
routine** — it is appended to the existing `mbe-evening` run so it consumes **no
new weekday schedule slot** (see Plan budget below).

- **When:** daily, as the final step of `mbe-evening` (5:11pm PT).
- **What it does:** invokes the `/optimize-implement-queue` skill, which:
  1. Runs the `queueEfficiency` sensor (`scripts/collect-queue-efficiency.mjs`,
     surfaced via `scripts/sensor-report.mjs`) → appends a trend point to
     `metrics/process-metrics.jsonl` + a dated entry to
     `.claude/improvement-loop/log.md` (every run, even with no regression).
  2. On a **flagged regression** (difficulty-normalized so it can't be gamed by
     cherry-picking trivial issues): files de-duplicated `ready` issues via the
     learning-loop sensor→issue pipeline, **and** fires an `mbe agent eval` run
     **asynchronously** to confirm agent/prompt vs. harder issues — never
     synchronously inside the daily slot.
  3. Does **not** auto-merge, auto-edit skill prompts, or run eval synchronously
     (phase-1 posture). The phase-2 model-routing auto-tuning seam is documented
     in the skill as NOT-yet-built.
- **Append this to the end of the `mbe-evening` prompt** (the cloud agent starts
  with zero context, so the instruction must live in the prompt itself):

  ```text
  Finally, run /optimize-implement-queue. Append the queue-efficiency trend point
  and a dated log entry. If it flags a regression, file de-duplicated `ready`
  issues and trigger `mbe agent eval` asynchronously (never block this run on
  eval). Do not auto-merge or auto-edit any skill prompts.
  ```

> **[HITL] — Matt must wire this in the claude.ai UI.** RemoteTriggers are
> cloud-managed; this doc version-controls the prompt, but the actual routine
> change is manual:
>
> - [ ] Open the `mbe-evening` routine at https://claude.ai/code/routines
> - [ ] Append the `/optimize-implement-queue` instruction block above to its prompt
> - [ ] Add the weekly `mbe agent eval` checkpoint to the `mbe-weekly-improve` prompt
> - [ ] Confirm the evening run still completes within its budget after the addition

## Plan budget (Max 5x)

The Max 5x plan allows ~5 scheduled runs/day. The **daily** baseline is 4 runs
(`mbe-morning`, `mbe-midday`, `mbe-evening`, `mbe-learning-loop`). Weekly/occasional
triggers add a 5th run on their day (`mbe-deep-audit` runs in GitHub Actions, so
it does **not** count against the claude.ai plan quota):

- Fri: + `mbe-weekly-improve` → 5
- 1st of month: + `mbe-monthly-meta-audit` → 5 (or briefly 6 if the 1st is a Mon/Fri)

The rare 6-run overlap is acceptable; if it causes throttling, shift
`mbe-monthly-meta-audit` to a mid-month date in the web UI.

> **`optimize-implement-queue` consumes no new slot.** It is folded into the
> existing `mbe-evening` run (an extra skill invocation at the tail of one run),
> so the daily baseline stays at 4. The only added paid work is the weekly
> `mbe agent eval` checkpoint inside `mbe-weekly-improve` (still one Friday run);
> the daily optimizer's eval fires only on a flagged regression, asynchronously.

## Required secrets

Site-audit runners hit the live site via curl. Without the WAF bypass token,
Cloudflare Bot Management returns HTTP 403 and the audit silently produces no
findings. `mbe-deep-audit` reads `AUDIT_TOKEN` from GitHub Actions secrets; the
claude.ai `mbe-morning` light audit reads it from the RemoteTrigger environment.

| Secret        | Where to set                                                 | Purpose                                                   |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `AUDIT_TOKEN` | GitHub Actions repo secret **and** RemoteTrigger environment | Cloudflare Bot Management bypass header (`X-Audit-Token`) |

**GitHub Actions:** set under Repository → Settings → Secrets and variables →
Actions. The `audit-sweep` and `audit-scout` workflows validate this at startup
and fail immediately with a clear error if it is missing.

**RemoteTrigger environment:** set `AUDIT_TOKEN=<value>` in each cloud routine
that calls `/site-audit` (managed at https://claude.ai/code/routines). Without
it the cloud agent sends unauthenticated requests that are blocked by Cloudflare.

See `infrastructure/AUDIT_BYPASS.md` for token generation and WAF rule setup.

## Editing a routine

```text
/schedule          # then: "list routines", "update mbe-weekly-improve to ...", etc.
```

Or call the `RemoteTrigger` tool directly (`action: list|get|create|update|run`).
Each routine's prompt is self-contained — the cloud agent starts with **zero context**,
so any behavior change must be made in the prompt itself.
