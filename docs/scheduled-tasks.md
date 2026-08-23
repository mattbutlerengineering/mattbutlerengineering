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
further down describe _why_, not _what_.

| Routine                    | Trigger ID                       | Prompt file                                                                  | Cadence (PT)        | Cron (UTC)    | Model    | Output                | Purpose                                                                                                        |
| -------------------------- | -------------------------------- | ---------------------------------------------------------------------------- | ------------------- | ------------- | -------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mbe-deep-audit`           | — (disabled; runs in GH Actions) | —                                                                            | Mon 9:23am          | `23 16 * * 1` | —        | issues                | Weekly live-site availability sweep — **runs in GitHub Actions** (`audit-sweep.yml`), not claude.ai (see note) |
| `drift-fix` _(new)_        | — (runs in GH Actions)           | —                                                                            | Daily 6:17am        | `17 13 * * *` | — (none) | PR when drifted       | Generated-artifact drift — **runs in GitHub Actions** (`drift-fix.yml`), no agent (see note)                   |
| `mbe-evening`              | `trig_01PHwfbFQcFveYajVPaTrbZk`  | [`routines/mbe-evening.md`](./routines/mbe-evening.md)                       | Daily 5:11pm        | `11 0 * * *`  | sonnet   | PRs / metrics         | `/implement-queue` (batch ≤3) + progress-tracker + optimize-implement-queue                                    |
| `mbe-night` _(new)_        | `trig_01E6UxiwdsWcjBNwRGZSjmSV`  | [`routines/mbe-night.md`](./routines/mbe-night.md)                           | Daily 9:47pm        | `47 4 * * *`  | sonnet   | PRs / issues          | Overnight drain (`/implement-queue`) + CI health check                                                         |
| `mbe-auditor` _(new)_      | `trig_019cUkf16QbqTL7RrVXXqXsw`  | [`routines/mbe-auditor.md`](./routines/mbe-auditor.md)                       | Daily 2:37am        | `37 9 * * *`  | sonnet   | issues                | Read-only rotating 7-lens audit (see lens table below)                                                         |
| `mbe-morning`              | `trig_01QYoHCMjUgJybAoXUvjjrWX`  | [`routines/mbe-morning.md`](./routines/mbe-morning.md)                       | Daily 9:03am        | `3 16 * * *`  | sonnet   | issues / PRs          | ACMM audit + `/ideate` (cycle-check + ideation)                                                                |
| `mbe-learning-loop`        | `trig_018hcYeu5uCXgiddRwqaeYwd`  | [`routines/mbe-learning-loop.md`](./routines/mbe-learning-loop.md)           | Daily 11:00am       | `0 18 * * *`  | sonnet   | issues                | Sensor report → verify past fixes → triage regressions                                                         |
| `mbe-midday`               | `trig_0118ZgGfEndrMqQSuTQNXQwT`  | [`routines/mbe-midday.md`](./routines/mbe-midday.md)                         | Daily 1:07pm        | `7 20 * * *`  | sonnet   | PRs                   | `/implement-queue` (batch ≤3) + CI monitor                                                                     |
| `mbe-weekly-improve`       | `trig_01G12wULcCweXSb2jmVkChPW`  | [`routines/mbe-weekly-improve.md`](./routines/mbe-weekly-improve.md)         | Fri 7:00am          | `0 14 * * 5`  | **opus** | 1 PR + `ready` issues | Codebase improvement survey → implement the best change                                                        |
| `mbe-doc-rot` _(new)_      | `trig_0176gF6ty4Jg8oyyXYApKWyi`  | [`routines/mbe-doc-rot.md`](./routines/mbe-doc-rot.md)                       | Fri 8:00am          | `0 15 * * 5`  | sonnet   | 1 PR                  | Documentation drift — dead links, stale refs, and false claims in docs (see note)                              |
| `mbe-weekly-retro` _(new)_ | `trig_01VczFFpZUHi1vTdrfTauMkh`  | [`routines/mbe-weekly-retro.md`](./routines/mbe-weekly-retro.md)             | Sun 4:00pm          | `0 23 * * 0`  | **opus** | 1 PR + ≤3 issues      | Process retro — what blocked flow last week and what to change (see note)                                      |
| `mbe-monthly-meta-audit`   | `trig_01SoWm7jxBGnJHxiyTMEKX1i`  | [`routines/mbe-monthly-meta-audit.md`](./routines/mbe-monthly-meta-audit.md) | 1st of month 7:00am | `0 14 1 * *`  | **opus** | 1 PR + `ready` issues | Claude Code config + docs/automation health                                                                    |

> **`mbe-deep-audit` runs in GitHub Actions, not claude.ai.** The claude.ai
> remote environment has **no egress to the live site** — its agent proxy denies
> the outbound CONNECT tunnel (`curl (56) CONNECT tunnel failed`, HTTP `000`), so
> a cloud routine can never reach production (verified 2026-07-01, issue #2920).
> The deep audit therefore executes in `.github/workflows/audit-sweep.yml`, where
> GitHub runners have both egress and the `AUDIT_TOKEN` secret. The claude.ai
> `mbe-deep-audit` RemoteTrigger is disabled to avoid re-filing the same
> infrastructure issue every week.

> **`mbe-night`** runs the overnight drain: `/implement-queue` keeps clearing
> the `ready` backlog while Matt is offline, then a CI health check confirms
> `main` is still green before the next morning's routines run. Prompt:
> [`routines/mbe-night.md`](./routines/mbe-night.md).

> **`mbe-auditor`** runs a read-only rotating 7-lens audit — one lens per day,
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
> It never edits code — findings are filed as at most 3 deduped
> `ready`+`audit` issues/day. Critical security findings are the one
> exception: they get `security`+`needs-review` labels instead of `ready`, so
> they route to human review rather than autonomous pickup.

> **Drift is split across two routines, by whether a machine can fix it.**
> `drift-fix` (GitHub Actions, daily, no agent) owns everything a generator can
> repair — llms.txt, registry.json, dep-graph.json, generated-schemas.ts,
> dependency-graph.md, the rialto exports map. The fix there is always "run the
> generator", so an LLM would add token cost and nondeterminism with no judgment
> to contribute. `mbe-doc-rot` (claude.ai, weekly) owns the half where the fix is
> a prose edit and someone has to decide what the doc _should_ say.
>
> Note `mbe-auditor`'s **Friday lens is also docs** — but it is read-only and
> files at most 3 issues. `mbe-doc-rot` therefore runs a mandatory dedup against
> open `audit` issues, and where the auditor filed something it can simply fix,
> it fixes it and closes the issue rather than filing a duplicate.

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

**The rule when editing a live trigger — always resend the complete
`job_config`, then verify with a `get`:**

```text
1. get the trigger — copy its full current job_config as your starting point.
2. Edit only the field you actually want to change, in that copied object.
3. update with the FULL job_config (never a partial/single-field payload) —
   partial updates replace job_config wholesale, they do not deep-merge.
4. get the trigger again and diff the result against what you intended.
   A 200 response is not confirmation; only a get is.
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

## Cloud drain (`/implement-queue` in `mbe-midday` / `mbe-evening`)

The midday and evening routines run the full implement-queue (parallel TDD
worktree agents + auto-merge train) instead of the serial `/issue-worker`, so
the backlog drains ~6-9 issues/day without Matt's laptop.

The `/implement-queue` step (replacing the old issue-worker step) is in both
routines' live prompts — see [`routines/mbe-midday.md`](./routines/mbe-midday.md)
and [`routines/mbe-evening.md`](./routines/mbe-evening.md) for the exact text.

If cloud worktree agents prove unreliable (validation run pending), fall back
to a single worker without worktree isolation in cloud and keep the local
`/loop 30m /implement-queue` as the heavy drain.

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
     `@mbe/agent-core`). **Not optional** — `pnpm regen`'s llms families shell
     out to `mbe pack`, which imports agent-core; without a build that import
     throws `ERR_MODULE_NOT_FOUND`, `regen-llms.sh` swallows it (`|| continue`),
     and regen silently no-ops. A green run that fixed nothing is the worst
     possible outcome for this job.
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
  would commit that reformatting as if it were drift. Root-level `llms.txt` /
  `llms-full.txt` are listed as bare paths because `**/`-style globs do not
  match repo-root files.
- **Keep in sync with `scripts/regen-manifest.mjs`**, the source of truth for
  what `pnpm regen` writes. `scripts/__tests__/drift-fix-workflow.test.mjs`
  fails if a manifest output stops being covered by `add-paths` — otherwise the
  job would regenerate an artifact and then silently drop it from the commit.
- **CI dispatch:** the workflow explicitly runs `gh workflow run ci.yml` on the
  automation branch. GitHub's anti-recursion rule means a `GITHUB_TOKEN`-authored
  PR never fires `pull_request` workflows, so the required `CI Gate` check would
  never appear and the PR would sit `BLOCKED` forever — the same trap #3543 fixed
  for `pr-metrics.yml`. `workflow_dispatch` is the documented exception.

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
     self-contained acceptance criteria) so `/implement-queue` can drain them.
  3. **Weekly eval checkpoint:** runs `mbe agent eval` once against the agent
     evaluation suite to catch slow-drift quality regressions that the daily
     free telemetry scorecard (see `optimize-implement-queue` below) can't see.
     Files a `ready` issue only when `mbe agent eval` exits **1** (a genuine
     run whose pass rate regressed past `--threshold`). This is the only
     _scheduled_ paid eval — the daily optimizer fires eval only on a flagged
     regression, never on every run.
  - **Decision (#3571): no eval credentials are provisioned in the claude.ai
    RemoteTrigger sandbox**, the same call already made for `AUDIT_TOKEN`
    (see "Required secrets" below) — cloud routines don't carry live paid
    credentials. In that environment `mbe agent eval` exits **2**
    ("no task executed" — 0 turns / $0 cost, missing `ANTHROPIC_API_KEY`),
    distinct from the threshold-regression exit **1**. The prompt must treat
    exit 2 as an expected, silent no-op — never file a `ready` issue for it —
    since #3571 that non-run result is also no longer appended to
    `metrics/eval-reports.jsonl`, so it can't poison the baseline either way.
- **Does not merge.** Every change lands as a reviewable PR.

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
  Friday lens covers the same detection surface read-only.
- **Does not merge.** One PR titled `docs: weekly rot sweep <date>`; `ready`
  issues only for rot it could not safely fix itself.
- **Zero changes is a successful run.** The prompt explicitly forbids padding the
  PR with cosmetic rewording — rot means _wrong_, not unpolished.

## `mbe-weekly-retro`

> **Prompt:** [`routines/mbe-weekly-retro.md`](./routines/mbe-weekly-retro.md).
> This section describes intent — the file is the prompt.

- **When:** every Sunday 4:00pm PT (`0 23 * * 0` UTC) — late enough to see the
  full week including Friday's `mbe-weekly-improve` and `mbe-doc-rot` output, early
  enough that Monday's routines start with the blockers already surfaced. It sits in
  the clean gap between `mbe-midday` (1:07pm) and `mbe-evening` (5:11pm).
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
>       `/implement-queue` step instead of the old issue-worker step
> - [x] Validation runs: `mbe-morning` and `mbe-midday` were each triggered
>       manually to confirm `/ideate` batch filing and cloud `/implement-queue`
>       (worktrees + `pnpm install`) both work end-to-end post-recreation

## Plan budget (Max 20x)

The Max 20x plan has far more scheduled-run headroom than Max 5x, shared with
interactive use. The **daily** baseline is 6 runs (`mbe-evening`, `mbe-night`,
`mbe-auditor`, `mbe-morning`, `mbe-learning-loop`, `mbe-midday`). Weekly/monthly
triggers add a 7th run on their day (`mbe-deep-audit` runs in GitHub Actions, so
it does **not** count against the claude.ai plan quota):

- Fri: + `mbe-weekly-improve` (opus) + `mbe-doc-rot` (sonnet) → 8
- Sun: + `mbe-weekly-retro` (opus) → 7
- 1st of month: + `mbe-monthly-meta-audit` (opus) → 7 (or briefly 9 if the 1st is a Fri)

6-9 runs/day is well within the Max 20x plan's headroom, even alongside Matt's
interactive local sessions. The two weekly opus routines are deliberately split
across different days — `mbe-weekly-improve` on Friday, `mbe-weekly-retro` on
Sunday — so the heaviest runs never stack. `mbe-monthly-meta-audit` is the one
exception: it lands on whatever weekday the 1st falls on, occasionally Friday.

> **`optimize-implement-queue` consumes no new slot.** It is folded into the
> existing `mbe-evening` run (an extra skill invocation at the tail of one run),
> so the daily baseline stays at 6. The only added paid work is the weekly
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

## Editing a routine

```text
/schedule          # then: "list routines", "update mbe-weekly-improve to ...", etc.
```

Or call the discrete Claude Code Remote MCP trigger tools directly —
`list_triggers`, `create_trigger`, `update_trigger`, `fire_trigger`,
`delete_trigger` — rather than a single `RemoteTrigger` tool with an `action`
parameter. Each routine's prompt is self-contained — the cloud agent starts
with **zero context**, so any behavior change must be made in the prompt
itself.

1. Edit `docs/routines/<name>.md` first, in a reviewable PR — it is the
   authoritative copy.
2. Only after that PR merges, apply the same change to the live trigger.
   **`update_trigger` now changes only the fields you pass it** ("Only
   provided fields are changed; omit a field to leave it as-is," per the
   tool's own description) — this replaced the old raw `job_config`-clobbering
   API that caused the incident below. Still `list_triggers` (or re-check
   after updating) to confirm the change landed as intended — a successful
   call is not itself confirmation. See [Prompt files](#prompt-files) above
   for the incident that made this doc paranoid about verifying updates.
