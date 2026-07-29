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
| `mbe-morning`            | Daily 9:03am        | —            | issues / PRs          | Light site audit + ACMM audit + `/ideate` (cycle-check + ideation) |
| `mbe-learning-loop`      | Daily 11:00am       | —            | issues                | Sensor report → verify past fixes → triage regressions     |
| `mbe-midday`             | Daily 1:07pm        | —            | PRs                   | `/implement-queue` (batch ≤3) + CI monitor                 |
| `mbe-evening`            | Daily 5:11pm        | —            | PRs / metrics         | `/implement-queue` (batch ≤3) + progress-tracker + optimize-implement-queue |
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

## Ideation loop (`/ideate`, folded into `mbe-morning`)

The autonomous feature-ideation cycle: batches of 4-5 `feature-proposal` issues
grounded in `PRODUCT.md` + repo-committed signals, a ~72h human veto window,
then automatic decomposition into the implement-queue. Batches are strictly
sequential — no new ideation until the previous batch is fully implemented.
Full mechanics: `.claude/skills/ideate/SKILL.md`. Operator guide
(what Matt does vs. what runs itself): [`ideation-loop.md`](./ideation-loop.md).

**Append this to the end of the `mbe-morning` prompt** (replacing its
issue-worker step):

```text
Then run /ideate. It first advances the ideation cycle (vetoes honored,
proposals past the ~72h window decomposed via /decompose, finished tracking
issues closed, stale children deferred). Only if the previous batch is fully
complete does it generate a new batch of 4-5 feature-proposal issues grounded
in PRODUCT.md and repo-committed signals. Never fetch live site URLs. Never
label a proposal 'ready'. If /ideate created a new batch this run, report the
batch URL and stop; otherwise finish as usual.
```

### Ideation label glossary

| Label              | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `feature-proposal` | Proposal in veto window — close it (or add `vetoed`) to reject |
| `ideation-batch`   | Tracking issue for one batch; its task-list is the cycle state |
| `vetoed`           | Human-rejected — permanent dedup memory, never re-proposed     |
| `deferred`         | Excluded from batch completion (stuck child / failed decompose)|

### Lifecycle

`/ideate` files 4-5 proposals + one batch issue → Matt vetoes freely for ~3
days (zero action = consent) → un-vetoed proposals decompose into
`feature`+`ready` children → cloud + local implement-queue drains them → when
every proposal is vetoed, deferred, or shipped, the batch closes with a
scorecard and the next batch is generated automatically.

## Cloud drain (`/implement-queue` in `mbe-midday` / `mbe-evening`)

The midday and evening routines run the full implement-queue (parallel TDD
worktree agents + auto-merge train) instead of the serial `/issue-worker`, so
the backlog drains ~6-9 issues/day without Matt's laptop.

**Replace the issue-worker step in both `mbe-midday` and `mbe-evening`
prompts with:**

```text
Instead of /issue-worker, run /implement-queue for one iteration with a batch
of at most 3 independent ready issues (Phase 0 pre-flight through Phase 4).
First step in every worktree: pnpm install --frozen-lockfile. Respect the
circuit breaker; stop after one iteration. Before finishing, if
metrics/queue-telemetry.jsonl has uncommitted appended rows, commit only that
path on a branch and open a PR titled "chore(metrics): queue telemetry <date>"
labeled has-pr.
```

If cloud worktree agents prove unreliable (validation run pending), fall back
to a single worker without worktree isolation in cloud and keep the local
`/loop 30m /implement-queue` as the heavy drain.

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
  Finally, run /optimize-implement-queue. Start with its Step 0
  (node scripts/reconcile-queue-telemetry.mjs). Append the queue-efficiency
  trend point and a dated log entry. If it flags a regression, file
  de-duplicated `ready` issues and trigger `mbe agent eval` asynchronously
  (never block this run on eval). Do not auto-merge or auto-edit any skill
  prompts. Finish with its Step 6: if metrics/process-metrics.jsonl,
  metrics/queue-telemetry.jsonl, or .claude/improvement-loop/log.md changed,
  commit only those paths on a branch and open a PR titled
  "chore(metrics): optimize-implement-queue <date>" labeled has-pr.
  ```

> **[HITL] — Matt must wire this in the claude.ai UI.** RemoteTriggers are
> cloud-managed; this doc version-controls the prompt, but the actual routine
> change is manual:
>
> - [ ] Open the `mbe-evening` routine at https://claude.ai/code/routines
> - [ ] Append the `/optimize-implement-queue` instruction block above to its prompt
>       (2026-07 revision: includes Step 0 reconcile + Step 6 metrics-persist PR)
> - [ ] Add the weekly `mbe agent eval` checkpoint to the `mbe-weekly-improve` prompt
> - [ ] Confirm the evening run still completes within its budget after the addition
> - [ ] **Ideation loop (2026-07-28):** append the `/ideate` block above to
>       `mbe-morning` (replacing its issue-worker step)
> - [ ] **Cloud drain (2026-07-28):** replace the issue-worker step in
>       `mbe-midday` AND `mbe-evening` with the `/implement-queue` block above
> - [ ] Manually `run` `mbe-morning` once to validate `/ideate` files batch 1,
>       and `mbe-midday` once to validate cloud `/implement-queue` (worktrees +
>       pnpm install) — check that the daily `chore(acmm)` PR reappears too
>       (they stopped after 2026-07-10; the run log will show why)

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
