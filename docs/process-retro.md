# Process retro

Weekly retrospective on **the factory, not the product** — what blocked flow, and
what should change. Written by the `mbe-weekly-retro` routine (Sun 4:00pm PT).
Newest entry first.

Every other routine improves the code, the docs, or the artifacts. This one asks
why work got stuck. Findings here are grounded in issue/PR numbers and dates
queried during the run that wrote them; a retro that reports vibes is worse than
no retro.

---

## 2026-08-23

Window: **2026-08-17 → 2026-08-23**. Sources: GitHub REST API (PR/issue search,
workflow runs, job logs), `metrics/queue-telemetry.jsonl`,
`metrics/process-metrics.jsonl`, `.claude/improvement-loop/log.md`,
`.claude/rules/gotchas.md`, `docs/scheduled-tasks.md`, and the working tree at
`eb296df`.

**150 PRs opened, 144 merged, 73 issues filed, 85 closed, 23 open (5 `ready`).**
Median PR lived **15.0 minutes**; 89% closed inside an hour. `main` took exactly
one CI failure all week, and it was a GitHub-side 503, not a defect. By the
throughput numbers this was another clean week.

The numbers are not the story. The story is that **the watchdog built last week
to catch silently-failing scheduled workflows is itself silently failing** — it
suppresses every detection it makes, for a reason that only reproduces in CI. It
has been reporting a healthy fleet for seven days while `chaos-agent.yml` sat at
15 consecutive failures.

### Routine liveness

Cross-checked `docs/scheduled-tasks.md`'s catalog against observed artifacts.

| Routine                     | Expected artifact                | Observed 08-17 → 08-23                                       | Verdict                         |
| --------------------------- | -------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| `mbe-morning` (ACMM)        | `chore(acmm): daily audit` PR    | #4322, #4357, #4370, #4397, #4416, #4462, #4490 — all ~16:1x | alive, 7/7                      |
| `mbe-morning` (`/ideate`)   | proposal / decompose batch       | #4385–#4396 (08-20), #4417–#4436 (08-21)                     | alive                           |
| `mbe-evening` (queue)       | implement-queue + telemetry PRs  | telemetry PR every day 08-17 → 08-23                         | alive                           |
| `mbe-evening` (tracker)     | `process-metrics` + log entry    | **nothing since 08-16** — see below                          | **half dark, 7 days**           |
| `mbe-midday` / `mbe-night`  | implement-queue PRs              | 28 telemetry claims across both UTC bands                    | alive                           |
| `mbe-auditor`               | ≤3 `audit` issues/day            | 3, 1, 3, 3, 2, 3, 1 (08-17…08-23)                            | alive, 7/7                      |
| `mbe-learning-loop`         | issues / sensor triage           | 4 issues on 08-17 (#4330–#4333); **nothing 08-18 → 08-23**   | **ran, artifact dark 6 days**   |
| `mbe-weekly-improve` (Fri)  | 1 PR + `ready` issues            | **no PR, no issues on Fri 08-21**                            | **dark**                        |
| `mbe-doc-rot` (Fri)         | 1 PR                             | #4415 "docs: weekly rot sweep 2026-08-21"                    | alive                           |
| `mbe-monthly-meta-audit`    | 1 PR + issues                    | 1st of month — outside window                                | n/a                             |
| `drift-fix.yml`             | PR when drifted                  | 7 runs, 7 success, no drift → no PR                          | alive, correct silence          |
| `audit-sweep.yml` (Mon)     | issues                           | ran 08-17, success                                           | alive                           |
| `pr-metrics.yml` (Mon)      | metrics PR                       | #4317 (08-17)                                                | alive                           |
| `automation-pr-rescue.yml`  | update-branch + re-dispatch      | ran on schedule, no failures                                 | alive                           |
| `stale-human-blocked.yml`   | label + record stale issues      | 08-16 and 08-23 runs, both success; #4489 metrics PR         | alive                           |
| `scheduled-workflow-health` | `ci-fix` issue per dead workflow | 8 runs, 8 success, **0 issues filed**                        | **alive and blind — see below** |
| `chaos-agent.yml` (Mon)     | seeded bug → audit catches it    | 08-17 run **failed** — 15th consecutive lifetime failure     | **broken, unreported**          |
| `release.yml`               | npm publish of rialto            | green because publish still self-skips (unchanged, #3322)    | green ≠ working                 |

#### The watchdog is blind: a shallow checkout makes every failing workflow look freshly fixed

`scheduled-workflow-health.yml` shipped 08-17 (#4281/#4276) to watch the
scheduled fleet, precisely because `release.yml` (370 consecutive failures) and
`chaos-agent.yml` had each died unnoticed for weeks. On its first run it worked:
at 01:19 on 08-17 it filed five `ci-fix` issues — #4286 (AI Audit Trail), #4287
(Chaos Agent), #4288 (Dependency Freshness), #4289 (Mutation Testing), #4290
(Resource Audit).

Two of those were false positives — the failures predated a fix that simply had
not rerun yet — so #4291 added an `awaiting-rerun` classification:
`allFailuresPrecede(window, workflowModifiedAt)` suppresses a streak when the
workflow file changed after every failing run in it. Sound idea. But
`resolveWorkflowModifiedAt()` implements `workflowModifiedAt` as
`git log -1 --format=%cI -- <workflowPath>`, and
`scheduled-workflow-health.yml` checks out with the default **`fetch-depth: 1`**.

In a depth-1 clone git holds exactly one commit, so `git log -1 -- <any path>`
reports **that commit** regardless of whether it touched the path. The proof is
in the detector's own run log for 08-19 (run `32232753716`, job `96005953176`),
where four different workflows report one identical timestamp:

```
Chaos Agent: 3 failing run(s), all predating the workflow's last change (2026-08-19T07:04:26Z) — awaiting a post-change run, not filing.
AI Audit Trail: 3 failing run(s), all predating the workflow's last change (2026-08-19T07:04:26Z) — ...
Dependency Freshness: 3 failing run(s), all predating the workflow's last change (2026-08-19T07:04:26Z) — ...
Resource Audit: 3 failing run(s), all predating the workflow's last change (2026-08-19T07:04:26Z) — ...
```

`2026-08-19T07:04:26Z` is that morning's HEAD on `main`, not the date any of
those four files changed. Because HEAD always postdates every prior run,
`allFailuresPrecede` is **always true**, so every genuine failing streak
classifies as `awaiting-rerun` and is never filed. The detector cannot report a
dead workflow, and it fails in the silent direction — it can only suppress
findings, never invent them. Eight green runs, zero issues, four workflows dead
behind them.

The module's own docstring states the intended bias — "a noisy detection is
recoverable, a silently suppressed one is not" — and `allFailuresPrecede`
deliberately returns `false` on any input it cannot compare. A shallow clone
defeats that guard by supplying a well-formed, parseable, wrong answer instead
of an absent one. `scripts/branch-cleanup.mjs` uses the same `git log`-in-CI
shape and is worth checking for the same trap.

#### chaos-agent has never once succeeded

`chaos-agent.yml` has failed **15 of 15** lifetime scheduled runs (2026-05-11
through 2026-08-17). Last week's retro recorded a fix landing 08-15 and marked
it unverified; the 08-17 run (`32020266197`) settles it — the fix did not work.
Root cause, from that run's log:

```
Targeting file: apps/rialto-web/src/ThemeContext.tsx with bug type: lighthouse-perf
No injection point found for lighthouse-perf in .../ThemeContext.tsx, skipping...
Failed to inject bug.
##[error]Process completed with exit code 1.
```

`scripts/chaos-agent.mjs` in `--random` mode picks a bug type uniformly from
`BUG_CATALOG`, then `findTargetFile(type)` picks a random app and a random
`.tsx` inside it — with no check that the type has an injection point in that
file. One attempt, no retry, `process.exit(1)` on miss. Most random pairings
miss, which is why the job has never once produced a seeded bug. The whole
point of chaos-agent is to verify the audit loop actually catches planted
defects; that verification has never run.

#### The tracker half of `mbe-evening` has been dark for a week

`metrics/process-metrics.jsonl`'s last row is dated **2026-08-16**, and it is
`{"available": false, "reason": "query_error"}`. There are no rows at all for
08-17 → 08-23. `.claude/improvement-loop/log.md`'s last dated section is
likewise `## 2026-08-16`. The queue kept running the whole time — 28 telemetry
claims, a telemetry PR every day — so this is instrumentation going quiet, not
work stopping.

This was already noticed: **#4378** ("[Meta] progress-tracker log.md went 4 days
stale") was filed 08-20 and has had **zero activity since** — `created_at` and
`updated_at` are both `2026-08-20T01:05:10Z`. It carries only
`meta-improvement`, with neither `ready` nor any human-blocked label, so no
worker will ever claim it and no staleness detector counts it. The gap it
reported has grown from 4 days to 7 while the issue sat in that dead zone.

### Blockers

Open issues carrying `ready-for-human`, `needs-review`, `blocked`,
`agent-failed`, or `stealable`, oldest-touched first. Ages are days since last
update as of 2026-08-23.

| Issue | Labels                               | Stale   | The one thing a human must do                                                                    |
| ----- | ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| #3277 | `ready-for-human`                    | **44d** | Decide which Pulumi resource paths may drift, and paste that path list into the issue            |
| #4111 | `audit` `blocked` `ready-for-human`  | **12d** | Add `VITE_STRIPE_PUBLISHABLE_KEY` (test-mode `pk_test_…`) to the Hospitality E2E job's env       |
| #4199 | `meta-improvement` `blocked`         | 6.9d    | Confirm which adapter `mbe agent eval` should default to, so the baseline can be produced        |
| #3585 | `meta-improvement` `ready-for-human` | 6.7d    | Decide: route AI features through the Claude CLI, or delete them — no `ANTHROPIC_API_KEY` exists |
| #3388 | `blocked` `ready-for-human`          | 6.7d    | Add `TURBO_TOKEN` to repo secrets (see Top 3 — most of this issue is **not** human-blocked)      |
| #3253 | `ci-fix` `blocked` `ready-for-human` | 6.7d    | Approve the TypeScript 7 migration as a work item, or close it as won't-do                       |
| #3978 | `ux` `feature` `ready-for-human`     | 6.2d    | Say yes or no to exploring video-game UI patterns in rialto                                      |
| #4119 | `ci-fix` `ready-for-human`           | 5.9d    | Dispatch `pulumi-r2-checksum-validation.yml` and read its verdict before unpinning Pulumi        |
| #3322 | `ready-for-human`                    | 5.9d    | Choose the npm publish credential: npmjs token, or switch rialto to GitHub Packages              |

Only two are past the 7-day line, and the tight 5.9–6.9d cluster is real triage
work, not a bot touch: an agent re-verified each of these on 08-17/08-18 and
left substantive comments. #3388's comment is the standout and is actioned in
Top 3 below.

### Friction

- **Median PR life 15.0 minutes**, mean 279.5, p90 62.4. Buckets: 73 PRs under
  15m, 57 at 15–60m, 7 at 1–6h, 3 at 6–24h, 6 over 24h. The distribution is
  healthy; the whole tail is dependabot.
- **Slowest PR: #4335** (`bump lewagon/wait-on-check-action`), open **130.1
  hours**. #4336 (130.1h), #4339 (129.5h) and #4337 (129.4h) are the same
  story — all four opened 08-17 between 18:47 and 19:19, and three of them were
  merged in one batch at 04:51–04:52 on 08-23. They were not slow for any
  technical reason; nothing swept them for five days.
- **The grouped production-deps PR never lands.** #4058 (32 updates, closed
  unmerged 08-11), #4091 (33, closed unmerged 08-11), #4337 (32, closed unmerged
  08-23), now **#4482 (46 updates, still open)**. Each cycle the superseded PR is
  discarded and dependabot reopens a larger group. The batch is compounding —
  32 → 33 → 32 → 46 — and every one is `tier:critical`, which the automation
  auto-merge gate deliberately declines to enable. No production dependency
  update has merged through this path in two weeks.
- **No reverts, and no follow-up fix within 48h of any merge.** Nothing in the
  window needed `gh pr update-branch`; `main` is not `strict`, so the N-squared
  stacking tax ADR-016/ADR-023 describes did not materialise this week.

### Recurring causes

Failed CI runs on `main`, 08-17 → 08-23: **76 runs, 64 success, 11 cancelled, 1
failure.** All 11 cancellations are concurrency-group supersessions from rapid
successive merges — not defects, and correctly excluded from streak logic.

| Cause                                           | Count | Genuine defect?       | In `gotchas.md`?   |
| ----------------------------------------------- | ----- | --------------------- | ------------------ |
| GitHub 503 on the `CI Gate` commit-status POST  | 1     | no — GitHub-side      | **no** — see below |
| Concurrency-group cancellation                  | 11    | no — by design        | n/a                |
| `chaos-agent` random pairing misses             | 1     | **yes**               | **no**             |
| `scheduled-workflow-health` shallow-clone blind | 8     | **yes** (suppression) | **no**             |

**The one main failure was not a defect.** Run `32049666426` (08-17 17:17, the
#4322 merge) shows all fourteen gate inputs `success` — lint, typecheck, build,
test, Integrity, Architecture Audit, the lot — and then:

```
gh: No server is currently available to service your request. ... (HTTP 503)
##[error]Process completed with exit code 1.
```

The gate passed and the _publish_ of its result failed. The loop then worked
exactly as designed: `mbe-learning-loop` filed #4333 at 18:00 the same evening,
and #4343 merged the retry by 21:14. It even self-corrected once more — the
first fix used an inline regex that missed `unexpected end of JSON input` and
turned a fully green run (`32081722175`) red, so the classification was moved
into the pure, unit-tested `isTransientPublishError()` in
`scripts/ci-gate-commit-status.mjs`. Detect → fix → refine, inside one day.

That is a good arc, and it is undocumented. `gotchas.md` § CI covers
`gate-missing` (#3969) and `gate-unattributed` (#4023) but says nothing about
the publish step's own transient 5xx, which has now bitten twice in one week.
Two proposed entries for `/gotcha-harvest`, neither of which exists today:

1. **A transient GitHub 5xx on the `CI Gate` status POST reds a fully green
   run** — retry transient classes only, via `isTransientPublishError()`; never
   an inline regex in YAML, where the miss goes unnoticed.
2. **`git log -1 --format=%cI -- <path>` returns HEAD's date for every path in
   a `fetch-depth: 1` checkout** — it does not return empty, so a caller
   treating "unparseable ⇒ fail open" still gets a confident wrong answer. Any
   script deriving a per-file timestamp in CI needs `fetch-depth: 0` or an
   explicit `git rev-parse --is-shallow-repository` guard.

### Throughput

**73 issues filed, 85 closed — backlog shrinking by 12.** 23 open, of which 5
carry `ready`. PRs: 150 opened, 144 merged, 4 still open, 2 closed unmerged.

Queue telemetry, 28 rows claimed in the window: 14 merged, 1 not merged, **13
never reconciled**. Reviewer verdicts 16 `pass`, 2 `flag`, 8 `skipped`. Model
tier 27 sonnet / 1 haiku. Median worker duration 24.6 min (max 73.0).
`ci_first_pass` true on 11 of the 15 reconciled rows; `rework_cycles` 0 on 11,
1 on 4.

Two caveats on that data, both worth more than the numbers:

- **11 of the 13 unreconciled rows are not in flight** — they were claimed
  08-17 through 08-22 00:33 and still carry `merged: null`. #4412 is the clearest
  case: verdict `pass`, and its PR #4438 merged on 08-21, but the row was never
  written back. Only #4426 and #4450 (claimed 08-23 20:14) are plausibly still
  running.
- **`cost_usd` is null on all 28 rows.** Cost per issue is not being captured at
  all, which is why the sensor's `cost_per_issue_usd` reads `0` in every
  historical row rather than a real figure.

Trend analysis is not supportable this week. `process-metrics.jsonl` has no data
points after 08-16, so there is nothing to plot — and the file's usable history
is six points (08-11 → 08-15) against eight `available: false` rows. GitHub is
the only trustworthy source here, and one week of it is not a trend. Stated
plainly rather than dressed up: **we cannot say whether queue efficiency moved
this week, because the sensor that measures it has not produced a reading in
seven days.**

### Top 3 changes

1. **Give `scheduled-workflow-health` a real `workflowModifiedAt`.** One line
   (`fetch-depth: 0` on its checkout) plus a shallow-repository guard in
   `resolveWorkflowModifiedAt()` so it returns `undefined` rather than a wrong
   answer when history is absent. This is the highest-leverage change available:
   it restores a watchdog that already exists, already runs daily, already has
   permissions, and is currently reporting a healthy fleet over four dead
   workflows. Effort is minutes; it unblocks the detection of every future
   silent scheduled-workflow death — the exact class that cost 19 unnoticed days
   in July.
2. **Make `chaos-agent --random` retry instead of exiting 1.** Pick from
   compatible (type, file) pairs, or retry N times before failing. 15 lifetime
   failures means the audit loop's only end-to-end verification has never
   executed once — we have no evidence the audit machinery catches planted bugs,
   only that it produces issues.
3. **Cache `.turbo/cache` in CI.** `grep -rn "\.turbo" .github/workflows/*.yml`
   returns nothing: there is no `actions/cache` step for the local turbo cache
   anywhere, and remote caching is inert without `TURBO_TOKEN`. So CI has **zero
   turbo cache reuse of any kind** — not remote, not local, not across runs on
   the same branch — while Test runs 517s and Build 465s cold. #3786 already
   gave every checkout an explicit `cacheDir: ".turbo/cache"`, so the directory
   is well-defined and simply discarded each run. This needs no credential and
   no account. It was identified in #3388's own comment on 08-17, which
   explicitly declined to re-scope someone else's issue; six days later nobody
   picked it up. Key it on the lockfile hash — `pnpm-lock.yaml` is a turbo
   `globalDependencies` entry, so a lockfile-touching PR must cache-miss by
   design (`gotchas.md` § CI).

Filed as `ready`: one issue per item above.

### Escalations

Only a human can move these. None are filed as `ready` — an agent cannot mint a
credential or make a product call.

- **#3388 — add `TURBO_TOKEN` to repo secrets.** Requires the Vercel/Turbo
  account. Note the local-cache half is now filed separately and needs nothing
  from you.
- **#3322 — choose the npm publish credential.** `release.yml` has been green
  since 08-10 only because the publish step self-skips on an empty `NPM_TOKEN`.
  rialto last genuinely published 2026-07-10. Either add an npmjs token or
  switch `publishConfig` to GitHub Packages.
- **#4111 — add `VITE_STRIPE_PUBLISHABLE_KEY` (test-mode) to the Hospitality
  E2E job.** Deposit E2E cannot reach the payment step without it.
- **#3585 — decide whether AI features route through the Claude CLI or get
  removed.** No `ANTHROPIC_API_KEY` exists; the code path is dead either way.
- **#3253 — approve or close the TypeScript 7 migration.** Blocked 44 days on
  nobody saying which.
- **#3277 — name the drift-tolerant Pulumi paths.** Stalest issue in the repo at
  44 days; it needs a path list, not a review.
- **#4119 — dispatch `pulumi-r2-checksum-validation.yml` and read its verdict.**
  The Pulumi CLI pin is a holding action; the harness exists specifically so the
  fix is never first exercised against production state.
- **#4378 needs the `ready` label.** It is the only open `meta-improvement`
  issue with neither `ready` nor a human-blocked label, so nothing will ever
  claim it — and it is the issue tracking the tracker going dark. Labelling it
  is the entire ask.
- **#4482 — decide how `tier:critical` grouped dependabot PRs get merged.** The
  automation auto-merge gate correctly declines to enable itself on them, and
  nothing else picks them up, so the group has grown 32 → 46 across three
  discarded PRs. Either merge it by hand on a cadence, or grant grouped
  dependency PRs a path through the gate.

---

## 2026-08-16

Window: **2026-08-10 → 2026-08-16**. Sources: GitHub REST API (PR/issue search,
workflow runs, job logs), `metrics/queue-telemetry.jsonl`,
`metrics/process-metrics.jsonl`, `.claude/improvement-loop/log.md`,
`.claude/rules/gotchas.md`, `docs/scheduled-tasks.md`.

**154 PRs opened, 153 merged, 75 issues filed, 73 closed, 30 open (8 `ready`).**
Zero reverts. `main` took exactly one CI failure all week. Median PR lived
**16.4 minutes**. By every throughput number this was a clean week.

The two findings worth the read are both about _signals_, not throughput. Last
week's headline — `release.yml` failing on every push for 30 days — is now
green, but green because the publish step **skips itself**, not because it
publishes. And the stale-issue detector that shipped to help this retro ran for
the first time today and, by doing its job, made three of the issues it found
look freshly touched to the very query it was built to feed.

### Routine liveness

Cross-checked `docs/scheduled-tasks.md`'s catalog against observed artifacts.

| Routine                    | Expected artifact               | Observed 08-10 → 08-16                                           | Verdict                     |
| -------------------------- | ------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| `mbe-morning`              | `chore(acmm): daily audit` PR   | #4054, #4097, #4136, #4161, #4184, #4233, #4269 — all ~16:20 UTC | alive, 7/7                  |
| `mbe-morning` (`/ideate`)  | proposal batch                  | #4098–#4101 + batch tracking #4102 (08-11)                       | alive                       |
| `mbe-evening`              | optimize + telemetry PRs        | #4048, #4078, #4121, #4147, #4223, #4258                         | **6/7 — no 08-14 run**      |
| `mbe-learning-loop`        | `chore(metrics): learning-loop` | PRs only 08-10 (#4045, #4060) and 08-11 (#4103)                  | **runs, PR artifact dark**  |
| `mbe-midday` / `mbe-night` | implement-queue PRs             | 72 telemetry claims across the window, both UTC bands            | alive                       |
| `mbe-auditor`              | ≤3 `audit` issues/day           | 3, 4, 3, 5, 8, **0**, 3 (08-10…08-16)                            | alive; 08-15 silent         |
| `mbe-weekly-improve` (Fri) | 1 PR + `ready` issues           | #4196–#4200 batch filed 08-14 17:27–17:29 UTC                    | alive                       |
| `mbe-doc-rot` (Fri)        | 1 PR                            | #4182 "docs: weekly rot sweep 2026-08-14"                        | alive                       |
| `mbe-monthly-meta-audit`   | 1 PR + issues                   | 1st of month — outside window                                    | n/a                         |
| `drift-fix.yml`            | PR when drifted                 | 7 runs, 7 success, 7/7 days, no drift → no PR                    | alive, correct silence      |
| `audit-sweep.yml` (Mon)    | issues                          | 1 run 08-10, success                                             | alive                       |
| `pr-metrics.yml` (Mon)     | metrics PR                      | #4050 (08-10)                                                    | alive                       |
| `automation-pr-rescue.yml` | update-branch + re-dispatch     | 30 runs in window, 30 success                                    | alive                       |
| `stale-human-blocked.yml`  | label stale issues              | **first-ever run** 08-16 15:40Z, success — see Blockers          | alive, **but see below**    |
| `release.yml`              | npm publish of rialto           | 30/30 success — **because publish is skipped**                   | **green ≠ working**         |
| `chaos-agent.yml` (Mon)    | seeded bugs → audit catches     | 08-10 failure — **6th consecutive Monday failure**               | **fixed 08-15, unverified** |

**`release.yml` is green and still not publishing.** It last genuinely published
on 2026-07-10. #4049 (merged 08-10) added a "Check for publish credential" step
that detects an empty `secrets.NPM_TOKEN`, emits
`::warning::Skipping npm publish — no publish credential configured`, and exits
green. The workflow's own comment says so plainly: this converts a misleading red
X into an honest skip. That was the right call — 370 consecutive red runs teach
everyone to ignore the release signal. But the consequence is that
`@mattbutlerengineering/rialto` has now gone **37 days** without a registry
release, and no check anywhere is red about it. #3322 (the credential decision)
is the actual blocker and it is human-only. Escalated below.

**`chaos-agent.yml` failed six Mondays running** (07-06, 07-13, 07-20, 07-27,
08-03, 08-10). Root cause, from run 31381875779's `seed-bug` job: the "Seed Bug"
step failed in **0 seconds** — `node scripts/chaos-agent.mjs` invoked with no
dependency install and no `@mbe/gh-client` / `@mbe/agent-core` build. #4228
(merged 08-15) fixed exactly this across four scheduled workflows, chaos-agent
included, and added `scripts/check-workflow-deps.mjs` plus 273 lines of tests so
the class fails at PR time instead of silently on a schedule. First verification
is Monday 08-17 — nothing asserts it yet.

Worth naming: this is the _same shape_ as the `release.yml` finding — a scheduled
workflow failing for weeks with no routine watching. Two instances in two weeks.

**`mbe-learning-loop` is alive but its PR artifact stopped.** No
`chore(metrics): learning-loop` PR since #4103 on 08-11, and no `(learning-loop)`
heading in `.claude/improvement-loop/log.md` since 08-11 either. It is however
demonstrably running: it filed #4244 (`closure_rate regressed (-19)`) at
2026-08-15T18:11:54Z and its `verify-fixes.mjs` step commented on the same issue
at 2026-08-16T18:10:28Z — both inside its 18:00 UTC slot. So the routine executes
and files issues; only the metrics-PR half went dark. Not urgent, but a routine
whose artifact is inconsistent is a routine whose liveness cannot be checked by
artifact, which is the whole method of this pass.

### Blockers

Eleven open issues carry a human-blocking label. Sorted by **last genuine
touch** — which is deliberately _not_ `updatedAt`, for the reason immediately
below.

| Issue | Truly untouched | The one thing a human must do                                                                                  |
| ----- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| #3277 | 37 days         | Decide which Pulumi resource paths are drift-tolerant, then narrow `ignoreChanges` to that list                |
| #3253 | 37 days         | Nothing yet — genuinely ecosystem-blocked; `typescript-eslint` still ships no TS7-compatible peer range        |
| #3388 | 36 days         | Add `TURBO_TOKEN` (and `TURBO_TEAM`) to repo secrets                                                           |
| #3389 | 36 days         | Likely close as `wontfix` — see note below                                                                     |
| #3585 | 15 days         | Decide: route AI features through the Claude CLI, or delete them                                               |
| #3597 | 15 days         | Do the monthly reflection review, or reassign it to a routine                                                  |
| #3657 | 14 days         | Write two sentences of rationale on #3656's body-validation choice, or close it                                |
| #3695 | 13 days         | Decide whether agent cost telemetry is worth repairing (see Throughput — `cost_usd` is still 0 across 72 rows) |
| #3322 | 7 days          | Provide an npm publish credential, or accept that rialto is repo-only and archive `release.yml`                |
| #4111 | 5 days          | Add `VITE_STRIPE_PUBLISHABLE_KEY` to the Hospitality E2E job's secrets                                         |
| #3763 | 2 days          | Confirm production Redis is >= 6 before ioredis@6's RESP3 default reaches a live worker                        |

**The stale detector hides what it finds from the retro that consumes it.**
`stale-human-blocked.yml` shipped from #4043 specifically to catch under-labeled
human-blocked work that this retro's Pass 2 label query misses, and it is
scheduled Sunday 15:23 UTC precisely so its labels land _before_ the retro runs
at 23:00 UTC. Its first-ever run fired today at 15:40:15Z and succeeded. From its
log:

```
[stale-human-blocked] #3277 already labeled ready-for-human — skipping
[stale-human-blocked] labeled #3253 ready-for-human
[stale-human-blocked] #3388 already labeled ready-for-human — skipping
...
[stale-human-blocked] found 7 stale issue(s), labeled 3: #3277, #3253, #3388, #3389, #3585, #3597, #3657
```

Applying a label is a write, and a write bumps `updated_at`. So #3253, #3597 and
#3657 — the three it newly labeled — now report
`updated_at = 2026-08-16T15:40:5xZ`. #3253's most recent _human_ activity is a
comment from **2026-07-10T17:39:09Z**, 37 days ago. An aging pass that sorts by
`updatedAt` ascending, which is what this retro's own prompt specifies, reads all
three as touched today and ranks them last. The four it skipped kept their true
timestamps and still look correctly stale.

The detector is not wrong and the labels are correct. The defect is that nothing
persists the staleness it measured, so the measurement dies with the log line.
Filed as #4274.

**#3389 may be moot.** It asks for an admin decision between GitHub's native
merge queue and the custom train. `.claude/rules/gotchas.md` § CI already records
that the `merge_queue` ruleset rule is **org-repos-only** and returns
`422 Invalid rule 'merge_queue'` on this personal-account repo. The decision has
no reachable option B unless the repo moves to an org. A human should close it or
reframe it as "move the repo to an org", rather than it aging a fourth month as
an open question with a known answer.

### Friction

153 PRs merged in the window. **Median open→merge 16.4 min; mean 121.5 min; 12
(8%) over six hours.**

Slowest overall was **#4008 `chore(acmm): auto-tune QA thresholds` at 50.2h** —
but that is by design, not friction: `auto-qa-tune` touches `.github/`, so it
deliberately declines the `auto-merge` label and waits for a human. The gotchas
file documents this exact opt-out. Correctly slow.

The slowest PR that _should_ have been fast is **#4082 at 18.8h** — "make
deploy-secret guard detect production throws by AST, not phrase match" (issue
#4067). Queue telemetry records **3 rework cycles** and a reviewer verdict of
`flag`, the only PR in the window to draw both. It was also not the end of it:
the same guard needed #4110 (compound `if (isProduction && !secret)` missed) and
#4113 (docstrings wrong about which tokens are load-bearing) within the next
24 hours, after #4107 found its structural name resolution never fired for the
DI-pattern config files it actually scans. **One guard, three issues, three PRs,
each finding the previous fix incomplete.** Every round shipped green; the gap
was always a case the tests didn't model. This is the week's clearest instance of
rework that review caught late rather than early.

Merge mechanics were otherwise quiet: `automation-pr-rescue.yml` ran 30 times,
all success, and no PR needed manual `update-branch` intervention that left a
trace. One duplicate-work blip — #4154 opened 05:28Z and abandoned at 05:45Z,
#4155 opened 05:46Z with the identical title and merged — cost ~18 minutes.

### Recurring causes

Failed runs in the window, grouped by cause rather than count.

| Cause                                                            | Count | Genuine defect?       | In gotchas?               |
| ---------------------------------------------------------------- | ----- | --------------------- | ------------------------- |
| Superseded pushes (`cancelled` on `main`)                        | 8     | no — newer push wins  | n/a                       |
| `pnpm audit` live-advisory churn (GHSA-jmr9-qjv8-65gv, #4136)    | 1     | no — diff-independent | **yes**, § Dependencies   |
| Scheduled workflow runs node script with no deps (`chaos-agent`) | 6     | **yes**               | no — but now code-guarded |
| Pulumi CLI 3.256.0 vs R2 `InvalidDigest` (#4117/#4118)           | 1     | **yes**               | **yes**, § Pulumi/R2      |
| `verify-fixes.mjs` spurious reopen (#4244)                       | 1     | **yes**               | no — see below            |

`main` itself: **90 push-to-main `ci.yml` runs from 08-10T21:13Z onward — 81
success, 8 cancelled, 1 failure.** The single failure (#4136, 08-12) was the
`pnpm audit` advisory-database class, already documented, already handled by
#4142's `ignoreGhsas` entry and tracked in open issue #4141. Green-main policy
held all week.

**`verify-fixes.mjs` was fixed twice in two days and misfired between the two.**
#4246 filed 08-15 ("reopens already-fixed `ci-fix` issues on unrelated main-wide
CI noise") → #4248 merged 08-16T05:03:29Z. The bug then fired again at
**08-16T18:10:28Z**, reopening #4244 with "Not verified — Latest CI run:
unknown" — the zero-completed-runs case #4248 didn't cover. #4272 merged
08-16T20:49:56Z to make that case abstain. So the second fix landed _after_ the
last observed misfire and has not yet been exercised; the next learning-loop run
(08-17 18:00Z) is its first real test. Not yet a gotchas entry — correctly so,
since the guard is now in code, but worth watching for a third occurrence.

**One undocumented recurring cause, and it is the oldest one here.** The `gh` CLI
does not exist in Claude Code Remote sessions. `.claude/improvement-loop/log.md`
records this **10 separate times**, spanning at least three skills
(`progress-tracker`, `learning-loop`, `implement-queue`), with the log's own
2026-08-16 entry noting it has "been noted in the log 4+ times without a ticket"
and dating the root cause to 2026-06-20. It is **not** in `.claude/rules/gotchas.md`.
This retro run hit it too: `which gh` → not found, and every query above had to
route through the GitHub MCP tools instead. Each affected session rediscovers it
from scratch and improvises a workaround. This is precisely the arc
`/gotcha-harvest` exists to close. Filed as #4275.

### Throughput

**75 issues filed, 73 closed. Net +2.** The backlog is flat, not growing — 30
open, of which 8 carry `ready` and 11 are human-blocked. Last week closed net
−38 off a much larger base; two points in different regimes do not make a trend,
and I am not going to draw one from them.

Queue telemetry, 72 claims in the window:

- **CI first-pass: 30 clean / 16 not**, across the 46 claims where the field was
  recorded. The other **26 rows have `ci_first_pass: null`** — 36% of claims are
  not reporting the metric at all, which is enough missing data that the 65%
  first-pass figure should be read as indicative, not measured.
- **17 claims needed rework, 21 rework cycles total.** Three claims accounted for
  7 of those cycles (#4082 ×3, #4089 ×2, #4118 ×2).
- **`cost_usd` sums to exactly 0 across all 72 rows.** Agent cost telemetry is
  still dark — the third-occurrence issue #3695 has been open and untouched for
  13 days. Every efficiency conclusion that depends on spend is currently
  unavailable, which is worth knowing before anyone asks this retro to reason
  about cost.

`metrics/process-metrics.jsonl` has entries for 08-11, 08-12, 08-13, 08-15 and
08-16, with 08-14 missing and 08-16 recording `queueEfficiency: unavailable
(query_error)`. Thin and gappy; usable as corroboration, not as a trend line.

### Top 3 changes

1. **Persist staleness at detection time, before labeling** (#4274). One-line
   class of fix, unblocks the entire backlog-aging pass. `stale-human-blocked.mjs`
   already computes days-stale for every issue it examines and then throws the
   number away, keeping only a label whose application destroys the evidence.
   Writing `{issue, last_human_touch_at, days_stale}` to a metrics file before
   the label write makes the measurement survive, and lets this retro age issues
   by last _human_ touch instead of `updated_at`. Highest leverage on the list:
   without it, every future retro under-ranks exactly the issues that have been
   ignored longest.

2. **Watch scheduled workflows for consecutive failures** (#4276). `release.yml`
   failed 370 times over 30 days; `chaos-agent.yml` failed 6 Mondays over 6
   weeks. Both were found by a human-facing weekly retro reading logs, not by any
   routine — `ci-monitor` watches `main` and PRs, and nothing watches the
   scheduled fleet. Two multi-week silent failures surfaced in two consecutive
   retros is a pattern, not a coincidence. A detector that files a `ci-fix` issue
   when any scheduled workflow's last N runs are all failures would have caught
   both within a week.

3. **Write the `gh`-CLI-absent gotcha** (#4275). Ten log mentions, three skills,
   two months, no ticket, no doc. Cheapest fix here by a wide margin — it is one
   gotchas entry — and it stops every cloud session from paying the same
   rediscovery tax. This one is embarrassing precisely because it is so easy.

### Escalations

Human-only. None of these are agent-workable; filing them as `ready` would burn
a worker.

- **#3322 — npm publish credential.** `@mattbutlerengineering/rialto` has not
  published in 37 days, and since #4049 the workflow reports **green** while
  skipping. Decide: provide `NPM_TOKEN` (or a GitHub Packages token matching
  rialto's `publishConfig`), or accept rialto as repo-only and archive
  `release.yml` so the skip isn't mistaken for a release. **Do not leave it
  green-and-silent** — that is strictly worse than the 370 red runs, because
  nothing now signals the gap.
- **#3388 — add `TURBO_TOKEN` + `TURBO_TEAM` to repo secrets.** 36 days stale.
  Every CI run builds cold; this is the single cheapest CI-latency win available
  and it is blocked on one secret.
- **#3389 — close or reframe the merge-queue decision.** Native merge queue is
  org-repos-only and returns `422` on this personal-account repo, per gotchas
  § CI. Either close as `wontfix` or restate it as "move the repo to an org".
- **#3277 — name the drift-tolerant Pulumi paths** so `ignoreChanges` can be
  narrowed. 37 days stale.
- **#3585 — decide the fate of the AI features** with no `ANTHROPIC_API_KEY`:
  route through the Claude CLI, or remove them. 15 days stale.
- **#4111 — add `VITE_STRIPE_PUBLISHABLE_KEY`** to the Hospitality E2E job so
  the deposit E2E can reach the Stripe payment step.
- **#3763 — confirm production Redis is >= 6** before ioredis@6's RESP3 default
  reaches a live worker.
- **#3695 — decide whether agent cost telemetry gets repaired.** `cost_usd` is 0
  across all 72 claims this week; until this is answered, no retro can say
  anything about spend efficiency.
- **#3597 / #3657** — two small process items that only need a human to do them or
  close them: the 2026-08 reflection review, and two sentences of rationale on
  #3656.

---

## 2026-08-09

Window: **2026-08-03 → 2026-08-09**. Sources: GitHub REST API (PRs, issues,
workflow runs, job logs), `metrics/*.jsonl`, `.claude/improvement-loop/log.md`,
`.claude/rules/gotchas.md`, `docs/scheduled-tasks.md`.

The busiest week on record and, by the numbers, the healthiest: **232 PRs opened,
224 merged, 116 issues filed, 154 closed (net −38), 24 issues open in total, 2
carrying `ready`.** The backlog inverted from last week's +49 to −38 — the queue is
essentially drained.

All three fixes this retro filed last week (#3689, #3690, #3691) were closed
`completed` on 2026-08-03, inside 24 hours. The retro→fix loop works.

And underneath all of that, one workflow has been failing on **every single push to
`main` for 30 days** and no routine noticed.

### Routine liveness

Cross-checked `docs/scheduled-tasks.md`'s catalog against observed artifacts.

| Routine                     | Expected artifact               | Observed 08-03 → 08-09                                      | Verdict                |
| --------------------------- | ------------------------------- | ----------------------------------------------------------- | ---------------------- |
| `mbe-morning`               | `chore(acmm): daily audit` PR   | #3717, #3800, #3820, #3882, #3925, #3981, #4039             | alive, 7/7             |
| `mbe-learning-loop`         | `chore(metrics): learning-loop` | #3746, #3812, #3823, #3885, #3941, #3984                    | **6/7 — see below**    |
| `mbe-evening`               | queue telemetry + optimize PRs  | 39 telemetry PRs across 7/7 days; optimize PR #4012 (08-09) | alive                  |
| `mbe-midday` / `mbe-night`  | implement-queue PRs             | merge batches in both the 00–06 and 16–21 UTC bands, 7/7    | alive                  |
| `mbe-auditor`               | issues, rotating lens           | 33 `audit`-labelled issues filed in window                  | alive                  |
| `mbe-weekly-improve` (Fri)  | 1 PR + `ready` issues           | #3911 (edge worker's 245 tests now run in CI), #3923        | alive                  |
| `mbe-doc-rot` (Fri)         | 1 PR                            | #3919 "docs: weekly rot sweep 2026-08-07"                   | alive                  |
| `mbe-monthly-meta-audit`    | 1 PR + issues                   | 1st of month — outside this window                          | n/a                    |
| `drift-fix.yml` (Actions)   | PR when drifted                 | 7 runs, 7 success, 7/7 days, no drift → no PR               | alive, correct silence |
| `audit-sweep.yml` (Mon)     | issues                          | 1 run 08-03, success                                        | alive                  |
| `pr-metrics.yml` (Mon)      | metrics PR                      | 1 run 08-03, success                                        | alive                  |
| `automation-pr-rescue.yml`  | update-branch + re-dispatch     | 56 runs since 08-08 (workflow created 08-08 by #3966)       | alive, new             |
| `revert-rca-loop.yml`       | RCA issue on merged revert      | 204 runs, all `skipped` — correctly gated, 0 reverts merged | alive, correct silence |
| **`release.yml`**           | **npm publish of rialto**       | **201 runs, 197 failure + 4 cancelled, 0 success**          | **BROKEN 30 DAYS**     |
| **`chaos-agent.yml`** (Mon) | seeded bugs → audit catches     | 1 run 08-03, **failure**                                    | **broken**             |

**The 30-day silent failure — `release.yml`.** It last succeeded at
**2026-07-10T05:55Z**. Every run since — **370 consecutive failures**, 197 of them
this week alone — died at the same step:

```
🦋 error 401 Unauthorized - GET https://npm.pkg.github.com/@mattbutlerengineering%2frialto
                             - authentication token not provided
   env: NODE_AUTH_TOKEN:        ← empty
```

`packages/rialto/package.json` sets `publishConfig.registry` to
`https://npm.pkg.github.com` (GitHub Packages), while `release.yml`'s `setup-node`
step configures `registry-url: https://registry.npmjs.org` and passes
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` — a secret that does not exist. The two
halves disagree about which registry this package publishes to, and neither has a
credential.

Consequences, all of which were true all month and none of which surfaced:

- `@mattbutlerengineering/rialto` has not published a release since 2026-07-10.
- **5 changesets are pending** in `.changeset/` and have been consumed-then-lost on
  every run: the job bumps the version and commits locally, fails at publish, and
  never reaches `git push --follow-tags`.
- `packages/rialto/package.json` reads `0.2.0` while `CHANGELOG.md`'s newest entry
  is `0.1.12`.

2026-07-10 is the same date the account migration killed every `mbe-*` routine —
the outage this retro's Pass 1 exists to catch. Pass 1 caught the routines and
missed this, because `release.yml` is not a routine and its failure is invisible:
it runs on `push: main`, so it never blocks a PR, never appears in a `CI Gate`
rollup, and produces no artifact whose absence anyone would notice.

**It was reported correctly on day one and then went unread for 30 days.** #3322,
"Release 'Publish to npm' 401 — rialto publishConfig (GitHub Packages) vs setup-node
npmjs token mismatch **[needs maintainer credential decision]**", was filed
2026-07-10T20:31 — hours after the first failure — and has **zero comments and zero
label changes since**. It carries only `ci-fix`. Not `ready-for-human`, not
`blocked`. Every backlog-aging sweep this retro has run, including last week's,
queries by those labels — so the one issue that names a 30-day outage and asks for a
human decision has been structurally invisible to the pass designed to surface
exactly that. **The escalation machinery worked; the detection query was wrong.**

**`chaos-agent.yml` failed its one weekly run** (08-03). Its entire purpose is to
seed detectable bugs and confirm the audit loops catch them. A failed chaos run
means this week's "the audit loops are working" signal is unverified — the one
routine whose job is checking the checkers did not check.

**`mbe-learning-loop` produced no artifact on 08-09.** It hit 6/7 days (#3746 →
#3984); its 18:00 UTC slot on 08-09 passed with no PR by 23:13 UTC, 5 h late. One
missed day is a watch-item, not a death — but it is exactly the shape that preceded
the 19-day outage, so it is named here rather than rounded off.

### Blockers

Open issues labelled `ready-for-human` / `needs-review` / `blocked` /
`agent-failed` / `stealable`, oldest-touched first. `agent-failed` and `stealable`
are both empty.

| Issue                                                     | Untouched | The one thing a human must do                                                         |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------- |
| #3253 TypeScript 7 migration (`blocked`)                  | **30 d**  | Pin TS 6.x until the JS Compiler API replacement lands, or fund the migration.        |
| #3277 Narrow Pulumi `ignoreChanges` (`ready-for-human`)   | **30 d**  | Run `pulumi preview --stack prod` and paste the drift diff into the issue.            |
| #3388 Turborepo remote caching (`ready-for-human`)        | **29 d**  | Add `TURBO_TOKEN` (and `TURBO_TEAM`) to repo secrets.                                 |
| #3389 Native merge queue vs custom train                  | **29 d**  | Make the admin call: accept auto-merge permanently, or move the repo to an org.       |
| #3560 RCA for reverted #3545 (`needs-review`, `critical`) | 8 d       | Decide whether the WebGL factory section ships at all.                                |
| #3585 No `ANTHROPIC_API_KEY` (`ready-for-human`)          | 8 d       | Choose: route AI features through the Claude CLI, or delete them.                     |
| #3763 Production Redis ≥6 for ioredis@6 (`needs-review`)  | 5 d       | Confirm the production Redis major version before RESP3 defaults reach a live worker. |
| #3546 Venue onboarding Step 5 (`needs-review`)            | 0 d       | Active — 10 comments, touched 08-09. Not stale.                                       |

**Plus the one no label query finds:** #3322 (30 d) — see above. Add
`ready-for-human` to it.

The top four are unchanged from last week and from the week before, now at 29–30
days. #3388 remains a single secret standing between this repo and warm caches on
all ~230 PRs/week.

### Friction

Flow is fast and getting faster. Median open→merge is **18 minutes** (0.30 h), down
from 19 min last week on 2.4× the volume; mean 1.65 h, p90 4.35 h.

- **224 of 232 PRs opened this window merged inside it.** 2 still open, 9 closed
  unmerged.
- **The tail is one PR class.** Of the 8 slowest merges, 4 are
  `chore: record production health metrics` from `github-actions[bot]` — #3876
  (**31.3 h**, the week's slowest), #3646 (24.9 h), #3976 (13.0 h), #3816 (10.7 h).
  A fifth, **#4011, is still open** and is one of only two open PRs in the repo.
  None of that time is CI or review; it is the automation PR being unable to merge
  itself (see Recurring causes #1).
- The remaining slow PRs are all human-authored CI repairs — #3687 (21.4 h), #3786
  (17.0 h, the turbo cross-worktree cache fix), #3875 (13.5 h), #3974 (11.2 h).
- **9 PRs closed unmerged:** 3 revert PRs (#3737, #3759, #3869 — all abandoned when
  main was fixed forward), 1 Dependabot 28-package group (#3735), and 5 superseded
  or reconciled fixes (#3718, #3870, #3896, #3897, #3977).
- **`gh pr update-branch` pressure remains unmeasurable from the API**, unchanged
  from last week: `merged`, `ci_first_pass` and `rework_cycles` are still `null` on
  every row of `metrics/queue-telemetry.jsonl` including the newest. The merge train
  has to emit this; it cannot be reconstructed afterwards. Same for
  red-before-merge — inferrable in aggregate (below) but not per-PR.

### Recurring causes

`ci.yml`: 500 runs, 391 success, **48 failure**, 48 cancelled, 13 `action_required`.
Within the 48 failed runs: Build failed in 40, Test in 8, Prepare in 6, Dockerfile
Lint in 2, AI Antipattern Ratchet in 1.

**1. Automation PRs cannot merge themselves — 6 issues in 2 days, still open.**
#3966, #3982, #4009, #4023, #4025 (open), #4028. Last week this retro filed #3690 to
document the `GITHUB_TOKEN` anti-recursion trap in `gotchas.md`; that landed, and
`gotchas.md` now carries a long, accurate entry. **It kept biting anyway**, because
each fix exposed the next layer: dispatch CI → the dispatched `CI Gate` is invisible
to `statusCheckRollup` (`gate-unattributed`, #4023) → reordering the rollup check
does not fix it (#4028) → the `workflow_dispatch` escape hatch satisfies neither the
rollup nor branch protection (#4025, **open**). This is no longer a documentation
gap. Documentation is not the fix for a structural platform constraint, and five
weeks of patching around it has produced the repo's single most persistent PR stall
(see Friction). It belongs in Escalations, not in `gotchas.md`.

**2. `pnpm audit` advisory-DB churn — 40 of 48 CI failures (83%), documented.**
Two bursts: **08-03 (19 failures)** and **08-06 (14)**, hitting **31 distinct
branches**, 5 on `main`. A newly published transitive CVE reds every open PR at once
until an override lands. `gotchas.md` documents this correctly under
§ Dependencies. What is _not_ handled is the blast radius: #3855 (**open**, 08-06)
records the revert bot blaming innocent PRs for these diff-independent failures.
This is the largest single CI-failure cause in the repo and it is pure noise —
83% of red CI this week told no one anything about the code that triggered it.

**3. One real breakage, cleanly handled — 08-06.** All 8 Test failures cluster
between 04:55 and 21:16 on 08-06 across `main`, 5 worktree branches and
`automation/production-feedback` — one bad merge fanning out. Broken-main alerts
fired 3× this week (#3734, #3758, #3868); revert PRs were opened each time and
**none merged** — fixed forward every time, and #3691's auto-retire now closes them.
Working as intended.

**4. `reservations-api` will not deploy — live, unresolved.** `deploy-services.yml`
failed **8 of 25 runs (32%)** while `deploy-static.yml` went 45/45. Every failure is
the same, from the job log: build succeeds for all 6 components, then
`deploy.components.reservations-api.wait → ERROR, DeployContainerExitNonZero` —
the container starts and exits non-zero, 3 retries, every time. Latest failures
08-09 12:04 and 12:56. This tripped the circuit breaker twice (#3785 closed 08-04,
**#4037 open**) and raised "Deploys: unhealthy" twice (#3791 closed, **#4040 open,
`ready`**). Two open issues already cover it; not re-filed. It is the only
production-affecting item in this retro.

**5. `gh` CLI absent in scheduled/remote sessions — deferred for the third time.**
#3689 (last week's #1 change) shipped a REST fallback and closed 08-03, and it did
help. It did not finish the job: `metrics/process-metrics.jsonl` still reports
`{"sensor":"queueEfficiency","available":false}` on **08-05, 08-06, 08-08 and
08-09** — every day since the fix. `.claude/improvement-loop/log.md` for 08-09
records `spawn gh ENOENT` from `mbe issue transition` and `mbe check-model --issue`,
worked around by hand-replicating the label machine through `mcp__github__*` tools,
and then explicitly declines to file it ("single occurrence"). It is not a single
occurrence; it is the third consecutive week. **This run hit it too:** the `/search`
API is blocked outright by the environment's proxy ("sessions are bound to their
configured repositories"), so every query in this retro had to be rewritten against
repo-scoped endpoints. #3695 tracks the adjacent agent-spend telemetry gap.

Genuine flake was otherwise negligible: 2 hadolint failures, 1 antipattern-baseline
failure, 6 workspace-setup failures.

### Throughput

**The backlog is shrinking, decisively.** 116 issues filed vs **154 closed** — net
**−38**, against last week's +49. Only **24 issues are open repo-wide**, and just
**2 carry `ready`** (#4025, #4040), both filed on 08-09. `agent-failed` and
`agent-skip` are both zero. The queue is drained; the constraint has moved off
"can agents keep up" and onto the human decisions in Escalations.

Two points is not a trend, and this is exactly two points (+49, then −38). What can
be said without inventing one: last week's intake spike was attributed here to the
factory inventorying its own broken guards after the migration, and predicted to
stop being expected "if it repeats next week with the same ratio." It did not
repeat. That prediction resolved correctly.

**Trend data remains too thin to plot.** `metrics/process-metrics.jsonl` has 9 rows
and every August row reports the sensor unavailable. `metrics/queue-telemetry.jsonl`
grew to ~140 rows but `merged`, `ci_first_pass`, `rework_cycles` and `cost_usd` are
`null` on all recent rows. GitHub was the source of truth for every number above.

### Top 3 changes

1. **Stop `release.yml` failing silently 370 times, and unblock the publish.**
   Highest leverage available: a workflow has been red on every push to `main` for
   30 days, rialto has shipped no release in that time, 5 changesets are stranded,
   and the version and changelog have diverged. The credential choice is a human
   call (Escalations, #3322) — but the _silence_ is a bug an agent can fix today:
   guard the publish step so a missing token fails loudly and once, instead of
   producing 197 red runs a week that everyone has learned to ignore. Filed as
   **#4042**.
2. **Make backlog aging label-independent.** #3322 named a 30-day outage, asked for
   a maintainer decision in its own title, and was invisible to three consecutive
   weekly retros because it carries `ci-fix` rather than `ready-for-human`. Any
   detector that depends on the right label being applied by the filer will keep
   missing the issues that matter most. Detect on _behaviour_ — open, untouched,
   past a threshold — not on labels. Filed as **#4043**.
3. **Finish the sensor un-darkening that #3689 started.** `queueEfficiency` has
   reported `available: false` every single day since its fix landed, so the daily
   `/optimize-implement-queue` step measures nothing and this retro still cannot
   compute first-pass CI rate or rework cycles. Third week running. Filed as
   **#4044**.

Deliberately **not** in the top 3: the automation-PR merge trap (cause #1). Five
weeks of increasingly clever workarounds have not merged an automation PR reliably,
and the remaining fix is an admin decision, not code — escalated below. Also not
filed: `reservations-api` deploy failures (#4037/#4040 already open) and the
advisory-churn blast radius (#3855 already open).

### Escalations

Human-only. None filed as `ready` — an agent cannot mint a credential or make a
product call.

- **#3322 — decide where `@mattbutlerengineering/rialto` publishes, and provide the
  credential.** Either add an `NPM_TOKEN` secret and change `publishConfig.registry`
  to `registry.npmjs.org`, or keep GitHub Packages and set `NODE_AUTH_TOKEN` to
  `secrets.GITHUB_TOKEN` with `packages: write`. 30 days red, 370 failures, 5
  stranded changesets. **Also: add `ready-for-human` to this issue** so it stops
  being invisible.
- **#4025 / #3684 — the automation-PR merge trap needs an admin decision, not
  another patch.** Six issues in two days; PRs like #4011 still cannot merge
  themselves. The real options are a repo-scoped PAT (`AUTOMATION_PAT`) that is not
  `GITHUB_TOKEN`, or turning off required-approval parking for automation runs.
  Both are settings changes only the owner can make.
- **#3388 — add `TURBO_TOKEN` (and `TURBO_TEAM`) to repo secrets.** 29 days. At 232
  PRs/week every build and test still runs cold.
- **#3389 — make the merge-queue admin call.** Native merge queue is org-only and
  422s on this personal account: accept auto-merge permanently, or move the repo to
  an org.
- **#3253 — rule on TypeScript 7.** Pin TS 6.x, or fund the migration.
- **#3277 — paste `pulumi preview --stack prod` drift output into the issue.**
- **#3585 — decide: route AI features through the Claude CLI, or remove them.**
- **#3560 — decide whether the WebGL factory section ships.**
- **#3763 — confirm the production Redis major is ≥6** before ioredis@6's RESP3
  default reaches a live worker.
- **#4037 / #4040 — `reservations-api` has been failing to deploy since 08-03**
  (`DeployContainerExitNonZero`, 8 of 25 runs). Needs someone with DO runtime-log
  access: `doctl apps logs $DO_APP_ID reservations-api --type=run`. This
  environment has no egress to production (#2920).

---

## 2026-08-02

Window: **2026-07-27 → 2026-08-02**. Sources: GitHub API (PRs, issues, workflow
runs), `metrics/*.jsonl`, `.claude/improvement-loop/log.md`, `.claude/rules/gotchas.md`.

Not a quiet week. 98 PRs opened, 89 merged, 117 issues filed, 68 closed, three
"broken main" alerts, and four revert PRs of which **none** merged.

### Routine liveness

All `mbe-*` routines recreated on 2026-07-30 are alive and producing their
expected artifact daily. Verified by observed output, not by trigger config:

| Routine                      | Expected artifact                         | Observed 07-30 → 08-02                                             | Verdict                |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `mbe-morning`                | `chore(acmm): daily audit <date>` PR      | #3514, #3577, #3598, #3658                                         | alive, 4/4 days        |
| `mbe-learning-loop`          | `chore(metrics): learning-loop <date>` PR | #3522, #3578, #3611, #3683                                         | alive, 4/4 days        |
| `mbe-auditor`                | issues, rotating lens                     | #3519–3521 (perf), #3563–3564 (docs), #3596, #3650–3652 (security) | alive, 4/4 days        |
| `mbe-night`                  | PRs / issues, overnight drain             | #3556–3557, #3583–3585, #3647–3648                                 | alive                  |
| `mbe-midday`                 | PRs, merge train                          | merge batches 07-31 20:12, 08-01 20:02–20:24, 08-02 20:01–20:15    | alive                  |
| `mbe-evening`                | queue telemetry PRs                       | #3526, #3548, #3592, #3648, #3685                                  | alive                  |
| `mbe-weekly-improve` (Fri)   | 1 PR + `ready` issues                     | PR #3566 + issues #3567–#3571 (07-31 14:36–14:45)                  | alive                  |
| `mbe-doc-rot` (Fri)          | 1 PR                                      | #3576 "docs: weekly rot sweep 2026-07-31"                          | alive                  |
| `drift-fix.yml` (GH Actions) | PR when drifted                           | 3 runs, all `success`, no drift → no PR                            | alive, correct silence |
| `audit-sweep.yml` (Mon)      | issues                                    | run #19, 07-27, `success`                                          | alive                  |

Pre-07-30 gaps in the window (no ACMM PR on 07-27/28/29, no learning-loop PR
before 07-30) are the tail of the account-migration outage documented in
`docs/scheduled-tasks.md`, not a new failure.

**One genuine liveness gap.** The `/optimize-implement-queue` step folded into
`mbe-evening` is supposed to append a trend point every day. `metrics/process-metrics.jsonl`
contains **three rows total** — `2026-05-23`, `2026-06-25`, `2026-08-02` — so it
wrote a point on 1 of the 4 eligible days since recreation, and that single point
reads `{"sensor":"queueEfficiency","available":false}`. The step is running
(PR #3643 exists) but the sensor it exists to read is dark. A routine that runs and
measures nothing is the failure mode this pass was written to catch.

Corroborated by `.claude/improvement-loop/log.md` for 08-02: **5 of 15 sensors
available** (acmm, prMetrics, ccusageCost, sessionLogs, codeChurn); ciHealth,
lighthouse, issues, issueFeedback, prCategoryMetrics, agentCost, mutationScore,
flakyTests, e2eStability and queueEfficiency all unavailable.

### Blockers

Open issues labelled `ready-for-human` / `needs-review` / `blocked`, oldest first.
The four flagged as stale on 2026-07-31 are all still untouched — now **22–23 days**:

| Issue                                                        | Untouched since | The one thing a human must do                                                                                                                                  |
| ------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #3253 TypeScript 7 migration (`blocked`)                     | 07-10 (23d)     | Decide whether to pin TS 6.x until the JS Compiler API replacement lands, or fund the migration — the issue cannot start either way without that call.         |
| #3277 Narrow Pulumi `ignoreChanges` (`ready-for-human`)      | 07-10 (23d)     | Run `pulumi preview --stack prod` and paste the drift diff into the issue so the tolerant paths can be enumerated from real output.                            |
| #3388 Turborepo remote caching (`ready-for-human`)           | 07-11 (22d)     | Add `TURBO_TOKEN` (and `TURBO_TEAM`) to repo secrets.                                                                                                          |
| #3389 Native merge queue vs custom train (`ready-for-human`) | 07-11 (22d)     | Make the admin call — `merge_queue` is org-repos-only and 422s on this personal account, so the decision is "stay on auto-merge" or "move the repo to an org". |
| #3560 RCA for reverted #3545 (`needs-review`, `critical`)    | 08-01 (2d)      | Decide whether the WebGL factory section ships at all — #3584 explicitly rules this a product call, not an agent one.                                          |
| #3585 No `ANTHROPIC_API_KEY` (`ready-for-human`)             | 08-01 (2d)      | Choose: route AI features through the Claude CLI, or delete them.                                                                                              |
| #3546 Venue onboarding fails at Step 5 (`needs-review`)      | 08-02           | Confirm whether "launch the venue" is genuinely broken in prod or the synthetic journey's expectation is wrong.                                                |

The top four are the throughput ceiling. #3388 in particular is a single secret
standing between the repo and warm CI caches on every one of the ~100 PRs/week.

### Friction

Flow is fast at the median and ugly in the tail.

- **89 of 98 PRs opened this window merged inside it.** Median open→merge **19 minutes**, mean 2.28 h, p90 5.6 h.
- **Slowest merged PR: #3562** (`feat(rialto-web): Invoice / Receipt example page`) — 19.4 h. It carries exactly **one commit**, so none of that time was rework or rebasing. It was opened at 07-31 05:26 by the `mbe-night` drain and merged at 08-01 00:47 by the next routine that runs a merge train. Overnight PRs wait for a daytime routine; that queueing delay, not CI and not review, is the tail.
- The same shape explains #3588 (15.4 h), #3590 (15.2 h) and #3591 (15.0 h) — all opened 04:39–05:26 on 08-01, all merged in the same 20:02–20:24 batch.
- **7 PRs were opened and closed without merging** — pure wasted work: 4 reverts (#3559, #3614, #3620, #3681), 2 duplicate implementations (#3527 duplicating #3523; #3561 duplicating #3562), and 1 superseded Dependabot group (#3479).
- **`gh pr update-branch` pressure is not measurable from the API** without walking every PR's commit list, and the two slow PRs sampled (#3562, one commit) show no rebase churn. No claim made either way this week; if this needs to be a tracked number, it has to be emitted by the merge train itself rather than reconstructed afterwards.

### Recurring causes

Grouped by cause. Cross-checked against `.claude/rules/gotchas.md`.

**1. `GITHUB_TOKEN` anti-recursion — 6 hits, NOT in gotchas.md.** Events triggered
by `GITHUB_TOKEN` do not fire other workflows, so any automation-authored PR never
gets the `CI Gate` context that is the sole required check on `main`, and sits
`BLOCKED` forever. It bit: #3538/#3543 (pr-metrics), #3572 (drift-fix, pre-empted),
#3566 (all automation PRs), #3584 (revert PRs — filed, then closed `not_planned`),
#3625/#3647 (auto-qa-tune, which had failed _every run for a month_), and #3623/#3636
(three scheduled workflows silently no-oping against protected main). It is still
biting: **#3684** (open, 08-02) reports automation-pushed commits now require manual
workflow approval every run. `gotchas.md` mentions `GITHUB_TOKEN` exactly once, in an
unrelated changesets note. This is the single most repeated cause in the window and
it has no entry.

**2. `gh` CLI absent in scheduled/remote sessions — 5 consecutive runs, NOT in gotchas.md.**
`@mbe/gh-client` shells out to the `gh` binary via `execFileSync`; that binary does not
exist in the Claude Code Remote environment these routines run in. The learning-loop log
records it on 06-20, 07-30, 07-31, 08-01 and 08-02, spanning at least three skills
(`progress-tracker`, `learning-loop`, `implement-queue`). It is why 10 of 15 sensors are
dark and why `queueEfficiency` reports `available: false`. The log itself has been asking
for a ticket for five runs and never got one. `gotchas.md` documents the adjacent
`pnpm exec mbe` bin-linking trap but not this.

**3. Revert automation is net noise — 4 PRs, 0 merged.** Three "🚨 CRITICAL: Broken Main"
issues fired (#3558, #3612, #3619). Only **#3558** was a genuine breakage (PR #3545, the
WebGL factory section; RCA #3560 still open). #3612 and #3619 closed in 11 and 12 minutes
respectively and match the false-positive class described by #3622 — the watchdog blamed
innocent PRs when the parent commit's CI was _cancelled_ rather than failed. That bug is
fixed (#3639, merged 08-02 01:02). What is **not** fixed is the lifecycle: the revert PRs
those false alarms opened were never cleaned up. #3614 and #3620 lingered ~1 h; **#3559 sat
open for 2.5 days** (07-31 05:15 → 08-02 17:43) proposing a revert of code that main had
already moved past, and was ultimately closed unmerged. When main is fixed forward — which
is what happened all three times — the outstanding revert PR becomes a standing lie about
the repo's health.

**4. Phantom rialto CSS tokens — 2 hits, NOT in gotchas.md.** #3489/#3496 (07-29,
`--rialto-space-3xs` in venue-onboarding) then #3567/#3586 (07-31→08-01, FactorySection and
OnboardingExamplePage). Agents author `var(--rialto-*)` names that were never defined; nothing
in lint or typecheck catches a CSS custom property that does not resolve.

**5. Storybook 10.5.0 stopped auto-running `play()` — 2 hits, NOT in gotchas.md.** #3518 and
#3531 (both 07-30) fixed visual-harness stories that silently stopped exercising their
interactions. `gotchas.md` covers visual baselines being Linux-CI-specific and the line-height
cascade, but not this.

**6. Cold-start vitest timeouts — partially documented.** #3616 raised `tools/cli`'s
`testTimeout` to 15 s. `gotchas.md` documents this for _service_ route tests via `buildApp()`;
the entry's scope is narrower than the actual failure, which is any cold package on CI.

Genuine flake (runner death, transient network, live-advisory-DB churn) was **not** a
meaningful category this week — the `pnpm audit` advisory churn that produced #3475/#3481 on
07-27 is the only instance, and it was resolved the same day.

### Throughput

**The backlog is growing.** 117 issues filed vs 68 closed in the window — net **+49**.
38 issues currently carry `ready`.

That is not straightforwardly bad: a large share of the intake is the factory
auditing itself for the first time since the migration (#3606–#3609, #3621–#3635,
#3671–#3677 are all process/automation defects found by `mbe-auditor` and
`mbe-weekly-improve`), plus two decomposed feature chains (#3599–#3604, #3659–#3670)
that are intentional 5-issue fan-outs. Intake outpacing closure while the factory
inventories its own broken guards is expected. It stops being expected if it
repeats next week with the same ratio.

**Trend data is too thin to plot.** `metrics/process-metrics.jsonl` has 3 rows
spanning May, June and August, with the August row reporting the sensor as
unavailable. `metrics/queue-telemetry.jsonl` has 100 rows but `merged`,
`ci_first_pass` and `rework_cycles` are `null` on all but the last two, so
first-pass CI rate and rework cycles are not computable this week. No trend is
claimed from two points. GitHub was used as source of truth throughout.

One duplicate-intake defect worth naming: **#3594, #3595 and #3649 are three
identical open `ready` ACMM issues** ("Multi-repo orchestration", L6 autonomy) —
two filed one second apart on 08-01, a third on 08-02. The ACMM filer both
double-files within a run and re-files daily, and all three will be picked up by
implement-queue workers. Not filed as a new issue: **#3672** ("one issue-filing
module — skip/create/reopen decided in one place, proven on the ACMM path") and its
chain #3675/#3677 already cover exactly this. The three live duplicates still need
closing by hand or by the first worker that reaches them.

### Top 3 changes

1. **Give `@mbe/gh-client` a non-`gh` code path.** Highest leverage in the repo right
   now: one seam unblocks 10 dark sensors, `queueEfficiency`, three skills, and the
   metrics this retro cannot compute. Five runs have asked for it. Filed as **#3689**.
2. **Write the `GITHUB_TOKEN` anti-recursion rule into `gotchas.md`.** Six hits in seven
   days, each rediscovered from scratch, each costing a full diagnose-and-fix cycle. The
   cheapest possible fix — one documented entry — against the most repeated cause.
   Filed as **#3690**.
3. **Close the revert-PR lifecycle.** Reverts are opened on breakage but never retired
   when main is fixed forward, leaving PRs like #3559 open for days asserting main is
   broken when it is not. Auto-close a revert PR when its breakage issue closes. Filed
   as **#3691**.

Deliberately _not_ in the top 3: the merge-train queueing delay that produced the
15–19 h tail. It is real, but it is a consequence of routines running on a schedule
rather than a defect, and shrinking it means paying for more runs — a budget call
(see `docs/scheduled-tasks.md` § Plan budget), not a process fix.

### Escalations

Human-only. None of these are filed as `ready` — an agent cannot grant a credential
or make a product call.

- **#3388 — add `TURBO_TOKEN` (and `TURBO_TEAM`) to repo secrets.** 22 days stale. Every PR runs build and test cold.
- **#3585 — decide: route AI features through the Claude CLI, or remove them.** No `ANTHROPIC_API_KEY` exists in this environment; `mbe agent eval` scored a non-run as a regression until #3587/#3591 patched around the absence. The underlying choice is unmade.
- **#3389 — make the merge-queue admin call.** Native merge queue is org-repos-only and returns `422` on this personal account. Either accept auto-merge permanently and close the issue, or move the repo to an org.
- **#3253 — rule on TypeScript 7.** Pin TS 6.x, or fund the JS Compiler API migration. Blocked either way until someone chooses.
- **#3277 — paste `pulumi preview --stack prod` drift output into the issue.** The tolerant paths cannot be enumerated without real drift output.
- **#3560 — decide whether the WebGL factory section ships.** The only genuine main breakage this week came from it; #3584 explicitly rules this a maintainer call.
- **#3546 — confirm whether venue "launch" is actually broken in prod.** This environment has no egress to production (#2920), so the synthetic journey's failure cannot be verified from here.
- **#3684 — automation-pushed commits now require manual workflow approval every run.** May need a repo Actions setting changed rather than code.
- **#3594 / #3595 / #3649 — three identical ACMM issues are live in the `ready` queue.** Close two before workers burn on them; #3672 fixes the cause.
