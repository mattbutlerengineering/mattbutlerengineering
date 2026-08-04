# Process retro

Weekly retrospective on **the factory, not the product** — what blocked flow, and
what should change. Written by the `mbe-weekly-retro` routine (Sun 4:00pm PT).
Newest entry first.

Every other routine improves the code, the docs, or the artifacts. This one asks
why work got stuck. Findings here are grounded in issue/PR numbers and dates
queried during the run that wrote them; a retro that reports vibes is worse than
no retro.

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
