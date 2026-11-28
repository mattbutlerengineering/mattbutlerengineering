# Scheduled Tasks (Cloud Routines)

This repo is maintained partly by **scheduled cloud agents** — isolated Claude Code
sessions that run on a cron schedule in Anthropic's cloud (CCR), each with its own
git checkout. They are distinct from local `/loop` sessions: cloud routines keep
running after you close your terminal, and they push to **PRs for review** rather
than auto-merging.

- **Manage / disable / inspect:** https://claude.ai/code/routines
- **Create or edit from the CLI:** call the discrete Claude Code Remote MCP
  trigger tools (`list_triggers`, `create_trigger`, `update_trigger`,
  `fire_trigger`, `delete_trigger`) directly from a Claude Code session — see
  [Editing a routine](#editing-a-routine) below.
- Routines can be deleted via the API (`delete_trigger`) — see
  [Editing a routine](#editing-a-routine) below — or disabled in the web UI.

All times below are **America/Los_Angeles (PT)**. The `Cron (stored)` column is
the live trigger's `cron_expression` verbatim; see
[Cron expression format](#cron-expression-format) for how to read it.

## Recreated 2026-07-30 (account migration)

The entire `mbe-*` routine chain went dark around 2026-07-10 without anyone
noticing until 2026-07-29: all routines lived on the old claude.ai account
(`mattwbutler@gmail.com`) and did not survive the switch to
`mattbutlerengineering@gmail.com`. That's also why the daily `chore(acmm)` PR —
previously a reliable signal that `mbe-morning` was alive — stopped appearing
after 2026-07-10; there was simply no routine left to open it.

Verified 2026-07-29 that https://claude.ai/code/routines on the new account had
none of the `mbe-*` triggers. Recreated + expanded 2026-07-30 via the
`RemoteTrigger` API on the new account. The plan is now Max 20x (not 5x), so the
schedule was scaled up accordingly (see Plan budget below), and two new routines
were added: `mbe-night` (overnight drain + CI health) and `mbe-auditor`
(read-only rotating 7-lens audit). All ten `mbe-*` prompts are now
version-controlled under [`docs/routines/`](./routines/) (#3582) — see
[Prompt files](#prompt-files) below.

## Routine catalog

**Prompt file** is the version-controlled, byte-for-byte copy of the trigger's
live prompt (`job_config.ccr.events[0]`) — see [Prompt files](#prompt-files)
below. It is the authoritative definition of the routine; the prose sections
further down describe _why_, not _what_. A new routine is a
`scripts/routines/<name>.json` fragment plus `docs/routines/<name>.md`. It is
not a new row in the catalog below and not an edit of the builtin array in
`scripts/routine-manifest.mjs`.

| Routine                      | Trigger ID                              | Prompt file                                                                  | Cadence (PT)        | Cron (stored)                             | Model    | Output                                              | Purpose                                                                                                                                                               |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- | ------------------- | ----------------------------------------- | -------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mbe-deep-audit`             | — (disabled; runs in GH Actions)        | —                                                                            | Mon 9:23am          | `23 16 * * 1`                             | —        | issues                                              | Weekly live-site availability sweep — **runs in GitHub Actions** (`audit-sweep.yml`), not claude.ai (see note)                                                        |
| `drift-fix` _(new)_          | — (runs in GH Actions)                  | —                                                                            | Daily 6:17am        | `17 13 * * *`                             | — (none) | PR when drifted                                     | Generated-artifact drift — **runs in GitHub Actions** (`drift-fix.yml`), no agent (see note)                                                                          |
| `metrics-collectors` _(new)_ | — (runs in GH Actions)                  | —                                                                            | Daily 4:29am        | `29 11 * * *`                             | — (none) | PR with metrics; `ci-fix` issue when stale          | Runs the review-burden collector where `gh` exists — **GitHub Actions** (`metrics-collectors.yml`), no agent (see note)                                               |
| `mbe-evening`                | `trig_01PHwfbFQcFveYajVPaTrbZk`         | [`routines/mbe-evening.md`](./routines/mbe-evening.md)                       | Daily 5:11pm        | `CRON_TZ=America/Los_Angeles 11 17 * * *` | sonnet   | PRs / metrics                                       | `/idea-to-prod:implement-queue` (batch ≤3) + progress-tracker + optimize-implement-queue                                                                              |
| `mbe-auditor` _(new)_        | `trig_019cUkf16QbqTL7RrVXXqXsw`         | [`routines/mbe-auditor.md`](./routines/mbe-auditor.md)                       | Daily 2:37am        | `CRON_TZ=America/Los_Angeles 37 2 * * *`  | sonnet   | PRs + issues                                        | Rotating 7-lens audit that fixes what it finds (see lens table below)                                                                                                 |
| `mbe-daily-issue` _(new)_    | `trig_01Df3XFeJnGYeH33NeqE1Mp3`         | [`routines/mbe-daily-issue.md`](./routines/mbe-daily-issue.md)               | Daily 7:21am        | `CRON_TZ=America/Los_Angeles 21 7 * * *`  | sonnet   | 1 merged PR                                         | One `ready` issue taken all the way to CLOSED — review gate, `CI Gate`, squash merge (see note)                                                                       |
| `mbe-morning`                | `trig_01QYoHCMjUgJybAoXUvjjrWX`         | [`routines/mbe-morning.md`](./routines/mbe-morning.md)                       | Daily 9:03am        | `CRON_TZ=America/Los_Angeles 3 9 * * *`   | sonnet   | issues                                              | `/ideate` (cycle-check + ideation) — ACMM audit step retired (#5955), see prompt file                                                                                 |
| `mbe-learning-loop`          | `trig_018hcYeu5uCXgiddRwqaeYwd`         | [`routines/mbe-learning-loop.md`](./routines/mbe-learning-loop.md)           | Daily 11:00am       | `CRON_TZ=America/Los_Angeles 0 11 * * *`  | sonnet   | issues                                              | Sensor report → verify past fixes → triage regressions                                                                                                                |
| `mbe-ui-quality` _(new)_     | `trig_01DYzgRBp66dxwQ828y9x1jV`         | [`routines/mbe-ui-quality.md`](./routines/mbe-ui-quality.md)                 | Daily 12:23am       | `CRON_TZ=America/Los_Angeles 23 0 * * *`  | **opus** | 1 PR (`ledger <date>`) + ≤3 fix PR + issues         | Captures due routes of the three apps, judges them against the rubric, files findings (see note)                                                                      |
| `mbe-feature-drain` _(new)_  | `trig_01RT7JnCPWyxw4fcKKVmCTb8` (`:03`) | [`routines/mbe-feature-drain.md`](./routines/mbe-feature-drain.md)           | Hourly              | `3 * * * *`                               | sonnet   | merged PRs (`… (mbe-feature-drain #N)`) + heartbeat | Finish in-flight user-facing work (red main → open PRs → orphaned issues → `ready`), then decompose one post-veto proposal; parks PRs after a merge denial (see note) |
| `mbe-weekly-improve`         | `trig_01G12wULcCweXSb2jmVkChPW`         | [`routines/mbe-weekly-improve.md`](./routines/mbe-weekly-improve.md)         | Fri 7:00am          | `CRON_TZ=America/Los_Angeles 0 7 * * 5`   | **opus** | 1 PR (`weekly improve <date>`) + `ready` issues     | Codebase improvement survey → implement the best change (see note)                                                                                                    |
| `mbe-doc-rot` _(new)_        | `trig_0176gF6ty4Jg8oyyXYApKWyi`         | [`routines/mbe-doc-rot.md`](./routines/mbe-doc-rot.md)                       | Fri 8:00am          | `CRON_TZ=America/Los_Angeles 0 8 * * 5`   | sonnet   | 1 PR                                                | Documentation drift — dead links, stale refs, and false claims in docs (see note)                                                                                     |
| `mbe-weekly-retro` _(new)_   | `trig_01VczFFpZUHi1vTdrfTauMkh`         | [`routines/mbe-weekly-retro.md`](./routines/mbe-weekly-retro.md)             | Sun 4:00pm          | `CRON_TZ=America/Los_Angeles 0 16 * * 0`  | **opus** | 1 PR + ≤3 issues                                    | Process retro — what blocked flow last week and what to change (see note)                                                                                             |
| `mbe-monthly-meta-audit`     | `trig_01SoWm7jxBGnJHxiyTMEKX1i`         | [`routines/mbe-monthly-meta-audit.md`](./routines/mbe-monthly-meta-audit.md) | 1st of month 7:00am | `CRON_TZ=America/Los_Angeles 0 7 1 * *`   | **opus** | 1 PR + `ready` issues + optional promo-video issue  | Claude Code config + docs/automation health                                                                                                                           |

> **`mbe-deep-audit` runs in GitHub Actions, not claude.ai.** The claude.ai
> remote environment has **no egress to the live site** — its agent proxy denies
> the outbound CONNECT tunnel (`curl (56) CONNECT tunnel failed`, HTTP `000`), so
> a cloud routine can never reach production (verified 2026-07-01, issue #2920).
> The deep audit therefore executes in `.github/workflows/audit-sweep.yml`, where
> GitHub runners have both egress and the `AUDIT_TOKEN` secret. The claude.ai
> `mbe-deep-audit` RemoteTrigger is disabled to avoid re-filing the same
> infrastructure issue every week.

> **Retired 2026-11-15:** `mbe-midday` (`trig_0118ZgGfEndrMqQSuTQNXQwT`) and
> `mbe-night` (`trig_01E6UxiwdsWcjBNwRGZSjmSV`). Both were paused on 2026-09-25
> after their auto-merge raced the local merge train (#5722), and
> `mbe-feature-drain` now does their implement-queue work. Their prompts are in
> git history (`git show 1804c4ffe:docs/routines/mbe-midday.md`).

> **Retired 2026-11-18 (#9070):** `mbe-prune` (`mbe-prune-a` `trig_01TBQ4jQS9UGwJTxrWfWBCyQ`,
> `-b` `trig_01SoduJryRjjQN5D75h3ZJjv`, `-c` `trig_01CzgACLRQpi8ApXfSUM7T5q`,
> `-d` `trig_016WxmLRG8kYUymu3QmwEk3P`). It made 4 commits in 30 days and 15 of
> its 18 heartbeats since 11-03 were `noop`, while `mbe-doc-rot`, `docs-audit`,
> `md-audit` and `claude-md-improver` cover the same ground. Its prompt stays in
> [`routines/mbe-prune.md`](./routines/mbe-prune.md) marked retired; the live
> triggers are disabled or deleted by hand at claude.ai after the docs PR merges.

> **`mbe-daily-issue`** is the only routine whose unit of success is an issue
> **CLOSED**, not a PR opened. `mbe-evening` drains a
> batch of up to 3 `ready` issues and leave the merge to someone else; this one
> takes a single oldest-`ready` issue through TDD, the `reviewer` subagent gate,
> a green `CI Gate`, a squash merge whose **commit** body carries `Closes #N`,
> and a post-merge check that the issue actually closed. Throughput is
> deliberately 1/day. It stops rather than looping on three states: a `reviewer`
> FLAG, a twice-red `CI Gate`, and an absent `CI Gate` (a cloud session has no
> `actions:write`, so it cannot dispatch `ci.yml` — it comments and labels
> `needs-review` instead). Prompt:
> [`routines/mbe-daily-issue.md`](./routines/mbe-daily-issue.md).
>
> On **Fridays it starts 21 minutes after `mbe-weekly-improve`** (7:00am PT), so
> two cloud sessions can be live on the same repo at once. The `in-progress`
> label claim is the race guard. Added 2026-09-20 alongside the three batch
> routines rather than replacing one — prune after a week of runs if the queue
> turns out to be drained before it fires.

> **`mbe-feature-drain`** is the hourly drain (one RemoteTrigger,
> `mbe-feature-drain-a` at `:03`; it ran two triggers 30 minutes apart until
> 2026-11-18, when `-b` at `:33` was dropped for #9071). Each fire works a
> strict ladder — red `main`, open PRs, orphaned `in-progress`/`has-pr`/
> `agent-failed` issues, `ready` issues — and starts new work only when every
> rung is empty, by decomposing one `feature-proposal` past its 66h veto window
> with `/ideate`'s own flip protocol. It merges through the review gate
> (`reviewer` + `reviewersForDiff` specialists) and REST `PUT /pulls/{n}/merge`,
> issued as one plain command. The cloud auto-mode classifier can still deny it
> as `[Merge Without Review]`, since a `.claude/settings.json` allow rule does
> not bypass it there, so a denial PARKS the PR: the drain does not re-attempt
> it, posts the `reviewed-merge:` verdict with the exact merge command once, adds
> the `reviewed` label, and reports `N PRs parked on merge denial` in its
> heartbeat. A fire is skipped when the `ready` queue is empty and every open PR
> is parked. Upstream skill fix: mattbutlerengineering/skills#2056. PR claims use the
> `drain-claimed` label; issue claims use `in-progress`. Liveness is a heartbeat
> on #6211 under the shared name `mbe-feature-drain` (one `noop` per day at
> most). Prompt: [`routines/mbe-feature-drain.md`](./routines/mbe-feature-drain.md).

> **`mbe-ui-quality`** works the UI coverage ledger: it captures the due
> routes of marketing, rialto-web and hospitality against a local build,
> judges them against `docs/ui-quality/rubric.md`, and files what the scripts
> under `scripts/ui-quality/` plan — issues, backlog seeds and at most three fix
> PRs, each reviewed and handed to `reviewed-merge.yml` per the fix protocol. Its state lives on the rolling `ui-quality/ledger` branch,
> which every fire checks out first (`state.mjs checkout`); every fire, no-op
> ones included, commits `chore(ui-quality): ledger <date>` there — its
> liveness signature, dated by that commit — and opens the PR only when none
> is open. Nothing waits for that PR to merge. Prompt:
> [`routines/mbe-ui-quality.md`](./routines/mbe-ui-quality.md); design:
> `docs/features/ui-quality-loop/architecture.md`.

> **`mbe-auditor`** runs a rotating 7-lens audit that fixes what it finds — one lens per day,
> cycling through the week. Prompt:
> [`routines/mbe-auditor.md`](./routines/mbe-auditor.md).
>
> | Day | Lens          |
> | --- | ------------- |
> | Mon | Dependencies  |
> | Tue | Test coverage |
> | Wed | Accessibility |
> | Thu | Performance   |
> | Fri | Docs          |
> | Sat | Architecture  |
> | Sun | Security      |
>
> It acts on at most 3 deduped findings a day under the shared
> [fix protocol](./routines/fix-protocol.md): a finding it can root-cause
> becomes a reviewed `(mbe-auditor)` PR handed to `reviewed-merge.yml`, and only
> the rest become `ready`+`audit` issues. Security fixes are the exception:
> they get `security`+`needs-review` and wait for a human merge.

> **Fix, don't ticket (#9947).** `mbe-auditor`, `mbe-learning-loop`,
> `mbe-evening`'s optimize step, `mbe-weekly-improve`, `mbe-weekly-retro`,
> `mbe-monthly-meta-audit`, `mbe-doc-rot` and `mbe-ui-quality` (up to 3 fix
> PRs a fire, #10001) all read
> [`routines/fix-protocol.md`](./routines/fix-protocol.md) from their checkout.
> A finding they can root-cause is fixed in a PR, reviewed by the `reviewer`
> subagent and handed to `reviewed-merge.yml`; an issue is filed only when the
> cause is out of reach or a human must decide. Editing the protocol file
> changes every one of them on the next fire, with no live-trigger update.

> **Drift is split across two routines, by whether a machine can fix it.**
> `drift-fix` (GitHub Actions, daily, no agent) owns everything a generator can
> repair — registry.json, dep-graph.json, generated-schemas.ts,
> dependency-graph.md, the rialto exports map. The fix there is always "run the
> generator", so an LLM would add token cost and nondeterminism with no judgment
> to contribute. `mbe-doc-rot` (claude.ai, weekly) owns the half where the fix is
> a prose edit and someone has to decide what the doc _should_ say.
>
> Note `mbe-auditor`'s **Friday lens is also docs**, and it now fixes what it
> finds. `mbe-doc-rot` (5 hours later) therefore runs a mandatory dedup against
> open `(mbe-auditor)` PRs and open `audit` issues, leaves the files an open PR
> already touches alone, and fixes and closes any `audit` issue it can rather
> than filing a duplicate.

> Every `mbe-*` trigger is still managed live in the claude.ai UI / via
> `RemoteTrigger` — that's where the schedule actually executes. But its prompt
> is no longer _only_ there: [`docs/routines/<name>.md`](./routines/) holds a
> byte-for-byte copy of each trigger's current prompt, so changes go through a
> reviewable PR before anyone pastes them into the live trigger. See
> [Prompt files](#prompt-files) below for the full rationale and the
> `update`-clobbers-`job_config` trap this exists to defang.

## Prompt files (`docs/routines/`)

Every `mbe-*` trigger's prompt (`job_config.ccr.events[0]` content) now has a
byte-for-byte, version-controlled copy at `docs/routines/<name>.md`. Each file
opens with a frontmatter block (`trigger_id`, `cron`, `model`,
`environment_id`, `cadence`) so it is self-identifying, followed by the
verbatim prompt in a fenced code block. Fetched and diffed against the live
trigger via `RemoteTrigger get` on 2026-08-03 (#3582).

**Why this exists — three incidents:**

1. **`update` clobbers `job_config` wholesale, not a deep merge.** Sending
   `job_config.ccr.session_context` alone silently **deleted**
   `job_config.ccr.events` — where the entire prompt lives — with an HTTP 200
   and no warning. Hit 2026-07-31 editing `mbe-weekly-retro`'s model.
2. Prompts were unreviewable: edited live in a web UI with no diff, no
   review, no history — unlike every other behavior-defining artifact in this
   repo.
3. The entire `mbe-*` chain died silently on 2026-07-10 (account migration)
   and went unnoticed 19 days; recreating it meant rewriting every prompt from
   memory, because nothing was version-controlled.

**The rule when editing a live trigger — get, edit, verify:**

The raw job_config-clobbering API that caused incident 1 above has since been
replaced by the `update_trigger` MCP tool, which changes only the field(s) you
pass it (per the tool's own description: "Only provided fields are changed;
omit a field to leave it as-is") — there is no full-`job_config` payload to
reconstruct by hand anymore. A successful call is still not confirmation on
its own:

```text
1. list_triggers (or get_trigger) — read the trigger's current state.
2. update_trigger with only the field(s) you actually want to change.
3. get_trigger (or list_triggers) again and diff the result against what you
   intended.
```

`docs/routines/<name>.md` is the file that wins if it and the live trigger
ever disagree — restoring a clobbered prompt is now "paste the code block back
into `events[0]`," not "reconstruct it from memory."

**Cutting a trigger over to a pointer prompt is a separate, follow-up
change** (see #3582) — not done here. This repo lands the files first;
switching the live `events[0]` content to a short pointer that reads
`docs/routines/<name>.md` happens one routine at a time, each verified with a
`get` after the `update`, once a pointer-prompt run has been proven end to end.

## Ideation loop (`/ideate`, folded into `mbe-morning`)

The autonomous feature-ideation cycle: batches of 4-5 `feature-proposal` issues
grounded in `PRODUCT.md` + repo-committed signals, a ~72h human veto window,
then automatic decomposition into the implement-queue. Batches are strictly
sequential — no new ideation until the previous batch is fully implemented.
Full mechanics: `.claude/skills/ideate/SKILL.md`. Operator guide
(what Matt does vs. what runs itself): [`ideation-loop.md`](./ideation-loop.md).

The `/ideate` step is folded into the end of `mbe-morning`'s live prompt
(replacing its old issue-worker step) — see
[`routines/mbe-morning.md`](./routines/mbe-morning.md) for the exact text.
As of #5955, `/ideate` is `mbe-morning`'s only step — its ACMM-audit step was
retired in favor of `.github/workflows/acmm-regression.yml`, the single
canonical daily ACMM run (#5857).

### Ideation label glossary

| Label              | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| `feature-proposal` | Proposal in veto window — close it (or add `vetoed`) to reject  |
| `ideation-batch`   | Tracking issue for one batch; its task-list is the cycle state  |
| `vetoed`           | Human-rejected — permanent dedup memory, never re-proposed      |
| `deferred`         | Excluded from batch completion (stuck child / failed decompose) |

### Lifecycle

`/ideate` files 4-5 proposals + one batch issue → Matt vetoes freely for ~3
days (zero action = consent) → un-vetoed proposals decompose into
`feature`+`ready` children → cloud + local implement-queue drains them → when
every proposal is vetoed, deferred, or shipped, the batch closes with a
scorecard and the next batch is generated automatically.

## Cloud drain (`/idea-to-prod:implement-queue` in `mbe-evening`)

The evening routine (and, until 2026-11-15, the midday routine) runs the full implement-queue (parallel TDD
worktree agents + auto-merge train) instead of the serial `/issue-worker`, so
the backlog drains ~6-9 issues/day without Matt's laptop.

The `/idea-to-prod:implement-queue` step (replacing the old issue-worker step) is in the
live prompt — see [`routines/mbe-evening.md`](./routines/mbe-evening.md) for the exact text.

If cloud worktree agents prove unreliable (validation run pending), fall back
to a single worker without worktree isolation in cloud and keep the local
`/loop 30m /idea-to-prod:implement-queue` as the heavy drain.

## `metrics-collectors` (GitHub Actions)

- **When:** daily 4:29am PT (`29 11 * * *` UTC), plus `workflow_dispatch`.
  Off-hour and off-minute, away from the on-the-hour scheduled fleet.
- **Why it is not a routine:** the collector it runs needs exactly what a
  cloud routine does not have. `scripts/acmm/review-burden-metrics.js` shells
  out to `gh pr list --json ...,reviews,...`, a GraphQL-backed `gh` subcommand
  that a CCR session's `gh` cannot run — `gh` itself is present there, but
  GraphQL-backed subcommands answer HTTP 403 and only `gh api` REST calls work
  (`.claude/rules/gotchas.md` § Claude Code Remote). Nothing ran it at all
  after one manual run on 2026-06-14. (A booking-funnel `domain-metrics`
  collector used to run here too; it was retired in #5561 — it needed a
  production venue id and auth token nobody would provision, so it could
  never produce a row.)
- **What it does:** runs the collector (degrades to a skip and never fails
  the job), runs the `scripts/metrics-freshness.mjs` self-check against what
  this run produced, opens a PR with the changed metrics file, then
  dispatches `ci.yml` and `tier-classifier.yml` on its own branch and enables
  auto-merge through `scripts/merge-queue-eligibility.mjs check-merge`.
- **Failure is reported, not thrown:** a stale or empty verdict files a deduped
  `ci-fix` issue rather than reddening the job. A red scheduled workflow would
  be read as "the workflow is broken" when the workflow is the part that
  works, and three consecutive failures would trip
  `scripts/scheduled-workflow-health.mjs` into filing a second, misleading
  issue.
- **Guarded by:** `scripts/__tests__/metrics-collectors-workflow.test.mjs`
  (asserts the collector still runs, the self-check runs after it, every
  piping `run:` block sets `pipefail`, and no step swallows an exit code).

## `drift-fix` (GitHub Actions)

- **When:** daily 6:17am PT (`17 13 * * *` UTC), plus `workflow_dispatch`. Timed
  ahead of `mbe-morning` (9:03am) so the worker routines start their day against
  a clean `main`.
- **Why daily:** drift on `main` is contagious. CI's "Verify generated artifacts
  are in sync" step runs in the `build` job on _every_ PR, so one drifted
  artifact on `main` turns every open PR red until it is cleared — including PRs
  whose own diff is unrelated.
- **What it does:**
  1. Builds `@mbe/cli` (with transitive deps, which is what pulls in
     `@mbe/agent-core`), matching the order CI uses (`pnpm build && pnpm regen`).
  2. Regenerates the rialto exports map — before regen, since the dep-graph
     generators read `package.json`.
  3. Runs a **full** `pnpm regen`, never `check-regen-needed.mjs`'s fast path.
     That heuristic answers "given these changed files, is a full regen
     needed?"; a daily sweep of `main` has no changed-file list, and the drift
     it exists to catch is precisely the drift nobody predicted.
  4. Runs `pnpm regen --check` to confirm regeneration converged. A
     non-idempotent generator fails here rather than shipping a PR that would
     fail CI's own check.
  5. Opens a PR **only when something actually drifted**. A clean day is a
     silent no-op.
- **Scoped staging:** `add-paths` lists generated artifacts only. `pnpm install`
  reflows ~150 tracked files through prettier in this repo, and a catch-all
  would commit that reformatting as if it were drift.
- **Keep in sync with `scripts/regen-manifest.mjs`**, the source of truth for
  what `pnpm regen` writes. `scripts/__tests__/drift-fix-workflow.test.mjs`
  fails if a manifest output stops being covered by `add-paths` — otherwise the
  job would regenerate an artifact and then silently drop it from the commit.
- **CI dispatch:** the workflow explicitly runs `gh workflow run ci.yml` on the
  automation branch. GitHub's anti-recursion rule means a `GITHUB_TOKEN`-authored
  PR never fires `pull_request` workflows, so the required `CI Gate` check would
  never appear and the PR would sit `BLOCKED` forever — the same trap #3543 fixed
  for `pr-metrics.yml`. `workflow_dispatch` is the documented exception.

## `api-failures` (GitHub Actions)

- **When:** Mondays 15:00 UTC (`0 15 * * 1`) plus `workflow_dispatch` (input
  `dry_run`). Workflow: `.github/workflows/api-failures.yml`; no agent.
- **What:** `scripts/api-failures.mjs` reads the trailing 7 days of `/api/*`
  requests from the `edge_requests` Analytics Engine dataset, groups by method
  and normalized path, and files one `ready` + `bug` + `production-health`
  issue (plus an `area:*` label) per breaching endpoint: 5xx rate >= 1% with
  > = 20 requests, 4xx rate >= 10% with >= 50 requests (401/404 on reads
  > excluded), or p95 >= 2000 ms with >= 20 requests. An open issue carrying the hidden
  > `<!-- api-failures:METHOD path -->` marker gets a comment instead; at most 5
  > new issues per run. `sentry-triage.yml` covers thrown exceptions; this covers
  > failures that never throw.
- **Fails closed:** a missing `CLOUDFLARE_API_TOKEN`, a query error or zero rows
  for the whole window exits non-zero, so `scheduled-workflow-health` files a
  `ci-fix` issue. A silent skip never reads as "no failures".
- **Secret:** `CLOUDFLARE_API_TOKEN` (Account · Account Analytics · Read) and
  `CLOUDFLARE_ACCOUNT_ID`. Runbook: [edge-usage](./runbooks/edge-usage.md#weekly-api-failures-report).

## `mbe-weekly-improve`

> **Prompt:** [`routines/mbe-weekly-improve.md`](./routines/mbe-weekly-improve.md).
> This section describes intent — the file is the prompt.

- **When:** every Friday 7:00am PT (`0 14 * * 5` UTC). Friday is the documented
  highest-token-headroom day.
- **What it does:** runs the `improve` and `improve-codebase-architecture` skills (or
  the equivalent analysis if the skills aren't present in the cloud checkout),
  synthesizes a prioritized findings list, then:
  1. Implements the **single most useful, reasonably-sized** change (Small/Medium,
     low-risk, high-value) via TDD + full gates, and opens **one PR** targeting `main`.
  2. Files the remaining strong findings as GitHub issues labeled `ready` (with
     self-contained acceptance criteria) so `/idea-to-prod:implement-queue` can drain them.
  3. **Weekly eval checkpoint:** runs `mbe agent eval --adapter claude-cli` once
     against the agent evaluation suite to catch slow-drift quality regressions
     that the daily free telemetry scorecard (see `optimize-implement-queue`
     below) can't see. `--adapter claude-cli` (#5670) runs the suite through
     the `claude` CLI on the sandbox's subscription login; the default adapter
     is the Claude SDK and needs `ANTHROPIC_API_KEY`, so an invocation without
     that flag can never score here. A task that ran and then failed (a
     `sessionErrors` list on its row, or `testsPass`/`typecheckPass` false) is a
     scored failure row under exit **0**, not a non-run, and is committed like
     any other row. Files a `ready` issue only when the command exits
     **1** (a genuine run whose pass rate regressed past `--threshold`). This
     is the only _scheduled_ eval — the daily optimizer fires eval only on a
     flagged regression, never on every run; on the subscription it consumes
     plan quota, not API dollars.
  - **Decision (#3571): no eval credentials are provisioned in the claude.ai
    RemoteTrigger sandbox**, the same call already made for `AUDIT_TOKEN`
    (see "Required secrets" below) — cloud routines don't carry live paid
    credentials, and no `ANTHROPIC_API_KEY` exists there, still. That is why
    the checkpoint runs on the `claude` CLI's subscription login via
    `--adapter claude-cli` (#5670) instead of the SDK. Under that adapter an
    exit **2** (`suiteDidNotRun` — no task produced any usage: 0 turns / $0
    cost) is a surfaced **failure**, never an expected no-op. Its stderr
    diagnostic claims only what it can distinguish: it either quotes each
    session's own error line or, when no session reported one, names the
    `claude` binary being absent from PATH or lacking a subscription login as
    the most likely cause. The prompt files it under the
    deterministic title
    `ci-fix: weekly eval checkpoint did not run under claude-cli` with labels
    `ci-fix` + `ready-for-human` (not `ready` — the fix is environmental and
    no agent PR can make it), adds one dated comment on recurrence instead of
    a second issue, and records it as FAILURE in the step-5 log entry. Exit 2
    stays distinct from the threshold-regression exit **1**, and a non-run
    result is still never appended to `metrics/eval-reports.jsonl`, so it
    can't poison the baseline either way.
- **Hands passing PRs to `reviewed-merge.yml`** per [`routines/fix-protocol.md`](./routines/fix-protocol.md); never merges in-session. The headline PR is titled `<type>(<scope>): weekly improve <date> — <short description>`
  (e.g. `fix(routines): weekly improve 2026-09-19 — dedupe stale worktree reaper`) —
  this signature is what makes the routine's liveness verifiable (#5344; see
  `mbe-weekly-retro` Pass 1). It also appends a dated entry to
  `.claude/improvement-loop/log.md` naming the PR number, or explicitly
  recording that none opened and why, so a no-op week is a positive signal
  rather than an absence.

## `mbe-doc-rot`

> **Prompt:** [`routines/mbe-doc-rot.md`](./routines/mbe-doc-rot.md).
> This section describes intent — the file is the prompt.

- **When:** every Friday 8:00am PT (`0 15 * * 5` UTC), after `mbe-weekly-improve`.
- **Why it exists:** it is the judgment half of drift. `drift-fix.yml` handles
  everything a generator can repair; this handles the drift where the fix is a
  prose edit and someone has to decide what the doc _should_ say.
- **What it does:**
  1. Runs `detect-instruction-rot.mjs` and `check-doc-freshness.mjs` and **fixes**
     what they find — deciding per hit whether the target moved (fix the link) or
     was deleted (rewrite the claim, rather than leaving a sentence describing
     something that no longer exists). Both scripts also run in CI's Integrity
     job, so their hits are already failing or about to.
  2. Hunts **semantic staleness** — docs whose links all resolve but whose claims
     are false. This is the part no script can do, and the reason the routine
     earns its tokens. Past example of the class: `tools/cli/CLAUDE.md` once
     documented `.localeCompare()` as the pack generator's sort after `pack.ts`
     had already switched to a byte-order comparator (localeCompare was banned
     for sorting differently on macOS vs Linux CI, which drifts generated
     artifacts) — fixed by an earlier run of this routine.
- **Dedup is mandatory** — see the note under the routine catalog. `mbe-auditor`'s
  Friday lens covers the same surface earlier the same day and fixes what it
  can, so doc-rot leaves files an open `(mbe-auditor)` PR touches alone.
- **Hands passing PRs to `reviewed-merge.yml`** per [`routines/fix-protocol.md`](./routines/fix-protocol.md); never merges in-session. One PR titled `docs: weekly rot sweep <date>`;
  `ready` issues only for rot it could not safely fix itself.
- **Zero changes is a successful run.** The prompt explicitly forbids padding the
  PR with cosmetic rewording — rot means _wrong_, not unpolished.

## `mbe-weekly-retro`

> **Prompt:** [`routines/mbe-weekly-retro.md`](./routines/mbe-weekly-retro.md).
> This section describes intent — the file is the prompt.

- **When:** every Sunday 4:00pm PT (`0 23 * * 0` UTC) — late enough to see the
  full week including Friday's `mbe-weekly-improve` and `mbe-doc-rot` output, early
  enough that Monday's routines start with the blockers already surfaced. It sits in
  the clean gap before `mbe-evening` (5:11pm).
- **Why it exists:** every other routine improves the **product** — the code, the
  docs, the artifacts. This one improves the **factory**. Its question is _what
  blocked flow, and what should change?_
- **Six evidence passes:**
  1. **Routine liveness.** Did each scheduled job actually run _and_ produce its
     expected artifact this week? This pass exists because the whole `mbe-*` chain
     died on 2026-07-10 and went unnoticed for 19 days — the tell (a daily
     `chore(acmm)` PR that simply stopped appearing) was visible the entire time and
     unread. A routine that ran but produced nothing for 7 days is flagged too.
  2. **Human-blocked backlog aging.** Human decisions are the factory's real
     throughput ceiling. Issues in `ready-for-human` / `needs-review` / `blocked` /
     `agent-failed` / `stealable`, oldest first; anything untouched >7 days is a
     blocker. Each gets a one-sentence _specific_ ask — "add `TURBO_TOKEN` to repo
     secrets", not "needs review".
  3. **PR flow friction.** Open-to-merge duration, how many PRs needed
     `update-branch` (the N² tax of same-zone stacking against strict `main`,
     ADR-016/ADR-023), how many went red before merging, how many needed a
     follow-up fix within 48h.
  4. **Recurring failure causes.** Last week's failed CI runs grouped **by cause**,
     with genuine flake separated from real defects — then cross-checked against
     `.claude/rules/gotchas.md`. A cause that has bitten twice and _isn't_ documented
     there is itself the finding.
  5. **Throughput direction.** Issues closed vs. filed — is the backlog shrinking?
     Metrics files are the secondary source and were only recreated 2026-07-30, so
     early runs are told to say "data too thin" rather than manufacture a trend.
  6. **Synthesis.** The three highest-leverage changes, where leverage is flow
     unblocked per unit of effort.
- **Output:** one PR appending a dated entry to `docs/process-retro.md`, plus at
  most 3 deduped `ready` issues for process fixes an agent can actually implement.
  Anything only a human can decide goes in the entry's **Escalations** section with
  the specific ask — filing those as `ready` just burns a worker on something no
  agent can do.
- **A quiet week is a real result.** The prompt explicitly forbids padding: a padded
  retro trains everyone to stop reading it, which costs more than the week it covers.

> **Who owns which kind of improvement.** There are now four improvement routines,
> and the boundaries are deliberate — each one's prompt names the others so findings
> get handed off instead of re-filed:
>
> | Routine                              | Improves                                    | Cadence |
> | ------------------------------------ | ------------------------------------------- | ------- |
> | `optimize-implement-queue` (evening) | queue **metrics** — "did a number move?"    | daily   |
> | `mbe-weekly-improve`                 | the **codebase**                            | Fri     |
> | `mbe-weekly-retro`                   | the **process** — "why did work get stuck?" | Sun     |
> | `mbe-monthly-meta-audit`             | **Claude Code config**                      | monthly |
>
> The daily optimizer fires on numeric threshold regressions; the retro finds causes
> and blockers that no threshold detects. That distinction is what keeps the two from
> collapsing into each other.

## `mbe-monthly-meta-audit`

> **Prompt:** [`routines/mbe-monthly-meta-audit.md`](./routines/mbe-monthly-meta-audit.md).
> This section describes intent — the file is the prompt.

- **When:** the 1st of each month 7:00am PT (`0 14 1 * *` UTC).
  > "First Friday" was requested, but standard cron can't reliably express it
  > (day-of-month + day-of-week is OR-semantics), so this uses the 1st of the month.
  > Adjust in the web UI if a Friday cadence is preferred.
- **What it does:** runs the `claude-md-improver` and `claude-automation-recommender`
  skills (both in `.claude/skills/`), then opens **one PR** for the best doc/automation
  improvement, fixes up to 2 more findings in their own PRs, and files `ready`
  issues only for what it cannot fix. Targets Claude Code config quality:
  stale CLAUDE.md references, missing guidance, and worthwhile new hooks/agents/skills.
- **Promo-video prompt:** a second step looks at the previous month for big releases
  and, when it finds any, opens one `ready-for-human` issue asking the Owner whether to
  record a launch video. It never records anything: the browser recorder needs a local
  dev server. The Owner approves by running `/idea-to-prod:launch-demo` locally, or
  closes the issue to skip. Steps to publish: [`launch-demo.md`](./launch-demo.md).
- **Hands passing PRs to `reviewed-merge.yml`** per [`routines/fix-protocol.md`](./routines/fix-protocol.md); never merges in-session. Most of its PRs touch `CLAUDE.md` or
  `.claude/**`, so they are held with `needs-review` for the Owner.

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
     learning-loop sensor→issue pipeline, **and** fires an
     `mbe agent eval --adapter claude-cli` run **asynchronously** to confirm
     agent/prompt vs. harder issues — never
     synchronously inside the daily slot.
  3. Does **not** auto-merge, auto-edit skill prompts, or run eval synchronously
     (phase-1 posture). The phase-2 model-routing auto-tuning seam is documented
     in the skill as NOT-yet-built.
- **Folded into the end of the `mbe-evening` prompt** (the cloud agent starts
  with zero context, so the instruction lives in the prompt itself) — see
  [`routines/mbe-evening.md`](./routines/mbe-evening.md) for the exact text
  (step 3 of that prompt).

  > Do **not** re-enumerate metrics paths in this prompt. The list is derived
  > from `durableManifest()` in `scripts/metrics-store.mjs` (#3645) — adding
  > `durable: true` to a metric is the only change needed for a new file to be
  > persisted, and an enumerated prompt would silently drift out of date. The
  > same applies to the `mbe-learning-loop` prompt, which runs
  > `node scripts/persist-metrics.mjs --routine learning-loop`.

> **[DONE 2026-07-30]** All of the below shipped as part of the post-migration
> recreation. Since every `mbe-*` routine had to be created from scratch anyway
> (see "Recreated 2026-07-30" above), the prompt updates below were wired
> directly via the `RemoteTrigger` API rather than hand-edited in the claude.ai
> UI:
>
> - [x] `mbe-evening`'s prompt includes the `/optimize-implement-queue`
>       instructions (Step 0 reconcile + Step 6 metrics-persist PR — see
>       [`routines/mbe-evening.md`](./routines/mbe-evening.md))
> - [x] The weekly `mbe agent eval` checkpoint is in the `mbe-weekly-improve` prompt
> - [x] Evening run confirmed to complete within budget with the addition
> - [x] **Ideation loop:** the `/ideate` step is in `mbe-morning`
>       (replacing its old issue-worker step)
> - [x] **Cloud drain:** `mbe-midday` and `mbe-evening` both run the
>       `/idea-to-prod:implement-queue` step instead of the old issue-worker step
> - [x] Validation runs: `mbe-morning` and `mbe-midday` were each triggered
>       manually to confirm `/ideate` batch filing and cloud `/idea-to-prod:implement-queue`
>       (worktrees + `pnpm install`) both work end-to-end post-recreation

## `mbe-dev-speed`

> **Prompt:** [`routines/mbe-dev-speed.md`](./routines/mbe-dev-speed.md).
> This section describes intent; the file is the prompt. Manifest:
> `scripts/routines/mbe-dev-speed.json` (heartbeat signature, `periodDays: 1`).

- **When:** hourly at :57 (`57 * * * *`; Owner, 2026-11-27, #10162). Model: opus.
- **What it does:** runs `scripts/dev-speed-report.mjs` over 7 days (push to
  `CI Gate` p50/p90, per-job queue wait and run time, merge to deployed), then
  rewrites its ledger, the body of #10180: the current bottlenecks, and every
  change it tried with a `helped`, `flat` or `slower` verdict once 20 post-merge
  runs exist. It fixes the single biggest root-caused bottleneck in one PR of
  about 150 lines titled `… (mbe-dev-speed)`, per
  [`routines/fix-protocol.md`](./routines/fix-protocol.md). It opens PRs, not
  issues: a draft PR for a larger fix, a revert PR for a `slower` change. Feeds
  #10009 (ADR-036: p90 under 15 minutes).
- **Merges:** a fix outside the guardrail paths goes through `reviewed-merge.yml`.
  A fix under `.github/**` or another guardrail path opens with `needs-review`
  for the Owner (Owner, 2026-11-27, #10044). It holds the hand-off while `main`
  is red or a services deploy is undeployed (#9948).
- **Guardrails:** never weakens a gate for speed (no skipped tests, raised
  timeouts, lowered thresholds or advisory-made required checks); at most two
  of its PRs open at once; no new PR while the runner backlog is over 15 minutes.

## `mbe-hourly-fix`

> **Prompt:** [`routines/mbe-hourly-fix.md`](./routines/mbe-hourly-fix.md).
> This section describes intent; the file is the prompt. Manifest:
> `scripts/routines/mbe-hourly-fix.json` (heartbeat signature, `periodDays: 1`).

- **When:** hourly at `:27` (`27 * * * *`). Model: sonnet.
- **What it does:** picks a lens from the UTC hour (end user, development
  speed, development quality), finds one root-caused problem, and fixes it in
  one PR of about 150 lines titled `… (mbe-hourly-fix)`, per
  [`routines/fix-protocol.md`](./routines/fix-protocol.md) (#10151).
- **Merges:** every PR goes through `reviewed-merge.yml`. Findings whose fix
  needs a guardrail path, a security fix or a product decision become issues.
- **Guardrails:** at most two of its PRs open at once; never weakens a gate.

## Plan budget (Max 20x)

The Max 20x plan has far more scheduled-run headroom than Max 5x, shared with
interactive use. The **daily** baseline is 5 runs (`mbe-evening`,
`mbe-auditor`, `mbe-morning`, `mbe-learning-loop`,
`mbe-ui-quality`). Weekly/monthly triggers add runs on their day (`mbe-deep-audit` runs in GitHub Actions, so
it does **not** count against the claude.ai plan quota):

- Fri: + `mbe-weekly-improve` (opus) + `mbe-doc-rot` (sonnet) → 7
- Sun: + `mbe-weekly-retro` (opus) → 6
- 1st of month: + `mbe-monthly-meta-audit` (opus) → 6 (or briefly 8 if the 1st is a Fri)
- Hourly: + `mbe-dev-speed` (opus) → up to 24 more runs a day; most refresh the ledger and open nothing

`mbe-hourly-fix` (added 2026-11-28, #10151) adds up to 24 sonnet fires a day; a fire at its WIP cap exits after one heartbeat.

`mbe-feature-drain` (added 2026-10-16) sits on top of that baseline: one hourly
sonnet trigger (up to 24 fires/day since 2026-11-18, down from 48). A fire with
nothing in flight exits in a few minutes after one heartbeat check, so the real
cost tracks how much work is actually queued, not the fire count. A `throttled`
heartbeat on #6211 is the signal that this cadence has hit the plan's limits.
Note `mbe-doc-rot`'s 2026-10-09 fire already failed with `USAGE_LIMIT_REACHED`
before any sub-hourly routine existed, so the Friday-morning stack is the hour
to watch.

5-8 runs/day is well within the Max 20x plan's headroom, even alongside Matt's
interactive local sessions. The two weekly opus routines are deliberately split
across different days — `mbe-weekly-improve` on Friday, `mbe-weekly-retro` on
Sunday — so the heaviest runs never stack. `mbe-monthly-meta-audit` is the one
exception: it lands on whatever weekday the 1st falls on, occasionally Friday.

> **`optimize-implement-queue` consumes no new slot.** It is folded into the
> existing `mbe-evening` run (an extra skill invocation at the tail of one run),
> so the daily baseline is unchanged by it. The only added paid work is the weekly
> `mbe agent eval` checkpoint inside `mbe-weekly-improve` (still one Friday run);
> the daily optimizer's eval fires only on a flagged regression, asynchronously.

## Required secrets

Site-audit runners hit the live site via curl. Without the WAF bypass token,
Cloudflare Bot Management returns HTTP 403 and the audit silently produces no
findings. `mbe-deep-audit` reads `AUDIT_TOKEN` from GitHub Actions secrets. No
claude.ai RemoteTrigger needs it — none of the cloud routines have live-site
egress (issue #2920), so `mbe-morning`'s old light-audit step was dropped and
live-site audits now run in GitHub Actions only.

| Secret        | Where to set                    | Purpose                                                   |
| ------------- | ------------------------------- | --------------------------------------------------------- |
| `AUDIT_TOKEN` | GitHub Actions repo secret only | Cloudflare Bot Management bypass header (`X-Audit-Token`) |

**GitHub Actions:** set under Repository → Settings → Secrets and variables →
Actions. The `audit-sweep` and `audit-scout` workflows validate this at startup
and fail immediately with a clear error if it is missing.

See `infrastructure/AUDIT_BYPASS.md` for token generation and WAF rule setup.

## Cron expression format

Live triggers store `cron_expression` in one of two forms:

- **`CRON_TZ=America/Los_Angeles <expr>`** — single-fire (daily/weekly/monthly)
  routines. The expression is local PT clock time and self-adjusts across the
  DST boundary, so the fire time never drifts by an hour. Verified against live
  `get_trigger` on 2026-11-06 (#8411): `mbe-doc-rot`
  (`0 8 * * 5`), `mbe-weekly-improve` (`0 7 * * 5`) and `mbe-morning`
  (`3 9 * * *`) were all converted in one bulk update on 2026-11-04.
- **Plain UTC** — the hourly `mbe-feature-drain` trigger. It fires on a fixed
  minute, so DST is irrelevant.

**All single-fire rows verified.** The remaining single-fire claude.ai rows
(`mbe-evening`, `mbe-auditor`, `mbe-daily-issue`, `mbe-learning-loop`,
`mbe-ui-quality`, `mbe-weekly-retro`, `mbe-monthly-meta-audit`) were read with
`get_trigger` on 2026-11-15 (#8411): all store `CRON_TZ=America/Los_Angeles`
expressions matching their Cadence (PT) column, as do the matching `cron:` values
in `docs/routines/<name>.md`.
The three GitHub Actions rows (`mbe-deep-audit`, `drift-fix`,
`metrics-collectors`) are not triggers: their plain-UTC cron is the `schedule:`
value in the named workflow file.

## GitHub Actions cron reliability (#9074)

GitHub drops and delays `schedule:` runs under load. The 2026-11-17 workflow
audit measured `*/30` workflows firing 4 to 5 times a day instead of 48, and
daily jobs starting 5 to 10 hours late. Treat every Actions cron as best-effort.

- **`merge-queue.yml` and `reviewed-merge.yml` already have event triggers**
  (`pull_request_target` on label changes; `reviewed-merge` also `workflow_run`
  completion). Their cron (`*/30`, `15,45`) is only a sweep for missed events, so
  dropped ticks are expected and harmless. No change.
- **`automation-pr-rescue.yml` is cron-only (`*/30`).** Its job is to catch PRs
  whose events never fired (the `GITHUB_TOKEN` anti-recursion gap), so an event
  trigger would defeat it. Left as is: merge-queue, reviewed-merge and the rescue
  are policy-sensitive and need an Owner decision before any redesign.
- **Late daily and weekly jobs** (`chaos-agent`, `nightly-compliance`, `drift-fix`,
  `sentry-heartbeat`, `auto-rollback`) have no event equivalent; a late start does
  not change their result, so they stay on cron. Liveness checks use a 2x-period
  window (`late` before `dark`) and `scheduled-workflow-health.mjs` tolerates
  12 h of lateness for the same reason.

## Editing a routine

Call the discrete Claude Code Remote MCP trigger tools directly, e.g.
`list_triggers` to find a routine's `trigger_id`, then `update_trigger` with
that id and the field(s) to change:

```text
list_triggers                                    # find trigger_id for mbe-weekly-improve
update_trigger trigger_id=trig_... prompt="..."   # apply the change
```

Each routine's prompt is self-contained — the cloud agent starts with **zero
context**, so any behavior change must be made in the prompt itself.

1. Edit `docs/routines/<name>.md` first, in a reviewable PR — it is the
   authoritative copy.
   Write `cron:` exactly as stored live, including any `CRON_TZ=` prefix.
2. Only after that PR merges, apply the same change to the live trigger.
   **`update_trigger` now changes only the fields you pass it** ("Only
   provided fields are changed; omit a field to leave it as-is," per the
   tool's own description) — this replaced the old raw `job_config`-clobbering
   API that caused the incident above. Still `list_triggers` (or re-check
   after updating) to confirm the change landed as intended — a successful
   call is not itself confirmation. See [Prompt files](#prompt-files) above
   for the incident that made this doc paranoid about verifying updates.
