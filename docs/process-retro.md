# Process retro

Weekly retrospective on **the factory, not the product** — what blocked flow, and
what should change. Written by the `mbe-weekly-retro` routine (Sun 4:00pm PT).
Newest entry first.

Every other routine improves the code, the docs, or the artifacts. This one asks
why work got stuck. Findings here are grounded in issue/PR numbers and dates
queried during the run that wrote them; a retro that reports vibes is worse than
no retro.

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
