---
stage: operate
run: feature:availability-config-usability
date: 2026-11-22
users-observed: 0
signal-source: "none: no Manager, Owner or venue use of the varied-week surface is recorded anywhere this retro read; the Owner-only walkthrough, the signed-in smoke and the collapse dry run are all recorded as not run (release.md Post-release checks, verification.md PRD 12)"
assumptions:
  - "users-observed is 0. The Owner's brief says 'operate: skip. No venue uses availability yet, so a retro would count 0' (autorun-brief.md, Operate section). This retro was written on a later request, 18 days after release (released-at 2026-11-04). It found nothing that changes the count. Absence of a record is not proof of no use: the Owner may have used the page without writing it down, and this retro could not see that."
  - "With 0 observed, no outcome below reads as landing, adopted or used. Each signal is `unobserved`, or `anecdote` where the evidence is an audit or repro by the Owner account or an agent, which tests the code and not a Manager's need."
  - "Issues created after the merge by the Owner account's agent audits (#8686, #8688) are not run debt and not user feedback. They are listed as post-ship defect signals. They are one author's own audits, so they are anecdote and add 0 to the population."
  - "Whether the 2026-11-09 production backfill ran the new one-regular-week migrator is inferred: it ran on deployment `88826b3f` (venue-availability release.md line 157), after this run's merge on 2026-11-04, but this retro did not confirm that deployment contains commit 76205fc84."
  - "Not read: the Sentry dashboard, analytics (none are named in the run's artifacts), the live site, the production database. Nothing here comes from them."
---

# Retro: availability config usability: one regular week that can differ by day

Closed against `release.md` `outcome: released` (PR #8237 squash-merged 2026-11-04T14:51:01Z as `76205fc84`; `gh pr view 8237` reads `MERGED`, label `tier:critical`). Its `closingIssuesReferences` is #7738, which `gh issue view 7738` reads as `CLOSED` on 2026-11-04.

## Outcomes vs. intent

Population: 0 observed. Every outcome below is the state the work is in, not use.

### Idea success sentence: "A manager sets up lunch Mon-Fri, dinner Tue-Sun closing later Fri-Sat, and brunch Sat-Sun, from an empty venue, in <=5 minutes without help text, and the calendar shows it as one regular week."

- What happened: the sentence has two halves.
  - Shown to work by a script. `verification.md` records PRD 1 (varied week in quick setup), PRD 2 and PRD 13 (the demo as written) as PASS via `availability-demo-week.spec.ts` (local run, synthetic OIDC session, API mocked by the specs). The calendar half is PASS by component tests and a migrated-venue e2e (PRD 3).
  - Never timed by a person. PRD 12, the human-timed five-minute walkthrough, is `NOT RUN (Owner-only, by design)` in `verification.md` and listed under "Not checked" in `release.md` Post-release checks. The "<=5 minutes without help text" half has no measurement, and the pre-existing uniform-week bar was never measured either (idea.md Evidence: "`release.md`: NOT RUN").
- Signal strength: unobserved for the time bar; anecdote at best for the rest (agent-run scripts on mocked API responses, not a person).

### PRD criteria (13), against what is recorded

| Criterion                                                               | State in `verification.md`                                  | What it supports                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Varied week in quick setup                                            | PASS (demo-week e2e)                                        | A scripted path exists and passed locally on mocks                                                                                                     |
| 2 Per-weekday result                                                    | PASS (engine, route, component tests; Postgres integration) | The engine resolves each weekday as entered                                                                                                            |
| 3 One regular week                                                      | PASS (component test on a migrated-venue fixture; e2e)      | Rendering on fixtures. See #8688 below for a counter-signal on real saves                                                                              |
| 4 Change regular week, one day                                          | PASS (e2e + builder tests)                                  | As above                                                                                                                                               |
| 5 Strip is live and honest                                              | PASS (unit + e2e + DOM text read at 1280x720 and 375x812)   | The strip equals the guest preview on the demo week                                                                                                    |
| 6-8 Interaction counts (uniform 5 <= 5, large 13 <= 13, varied 18 < 26) | PASS                                                        | Playwright action counts, "agent stand-in evidence only" (verification.md PRD 7). Review Minor 5 notes the varied-week guard has 7 actions of headroom |
| 9 History/Undo, Tonight, agent tools                                    | PASS                                                        | Tests on a varied week                                                                                                                                 |
| 10 Three locales                                                        | PASS on key parity                                          | Wording never read by a native speaker (review Minor 15)                                                                                               |
| 11 No regression                                                        | PASS                                                        | Suites green at `004c8881a`                                                                                                                            |
| 12 Human-timed walkthrough                                              | NOT RUN, Owner-only                                         | Nothing                                                                                                                                                |
| 13 Demo runs as written                                                 | PASS (scripted e2e)                                         | A script, not a person                                                                                                                                 |

### The "Why now" bet: change the model while no production venue holds day-named schedules

- What happened: idea.md "Why now" said the production backfill had not run, so a model change would cost no migration of live venues. The backfill then ran on 2026-11-09 (venue-availability `release.md` line 157: 6 venues, 4 `migrated`, 2 `already_migrated`, 0 errors), five days after this run merged. If that deployment carries this run's migrator (see assumptions), the 4 migrated venues were written in the new one-regular-week shape and did not need the collapse script. The 2 `already_migrated` venues may hold the old shape. No record of a collapse dry run or `--apply` exists in the files this retro searched (`docs/`, `.claude/memory/`, `.claude/reflections/` hold the script only in this run's artifacts).
- Signal strength: unobserved. It is a state fact about production data this retro could not read.
- Reading: Milestone 3 (collapse function, script, its integration test, `reference.md`) was built for venues that, on the idea's own premise, probably did not exist. See the Run retrospective.

### Post-ship defect signals (anecdote, one author, add 0 to the population)

Both were filed after the merge by the Owner account from rendered audits, not by a Manager.

- #8688 (2026-11-11, closed 2026-11-13): "every regular-week save leaves the old week under Other schedules". It reports three saves leaving three rows under "Other schedules", evidenced from `schedule-changes.ts` and the page. This is a counter-signal to PRD 3 ("no per-day schedule or assignment to manage"), which passed on fixtures. Whether the leftover-row behaviour predates this run was not determined here. `git log` shows #8755 ("hide a replaced regular week from every schedule list, picker and count") as the fix on main.
- #8686 (2026-11-11, closed 2026-11-12): "a service chip can place Brunch at 11 PM and save it" in quick setup: five interactions, wrong data saved. Cause named in the issue: `placePreset` in `quick-setup-placement.ts` treats a new row's shared every-day days as overlapping Lunch before the Manager picks weekends. Weekend Brunch is the PRD's own example. The demo-week e2e passed without hitting this order. Whether this run introduced the behaviour was not determined here. `git log` shows #8745 as the fix.
- Duplicate Regular week then Save wrote an undated all-seven-day assignment that outranks the regular week. Review had ranked this "New 2 (minor)" and deferred it; the PR that fixed it (#8335, merged 2026-11-05T22:33:02Z, the day after release) says it "reproduced this in the browser and captured the PUT" and that "the review had deferred this as 'New 2 (minor)'".

## Open debt

The run's own issues and deferrals. Never counted as feedback.

- #7738: the tracker the run seeded (created 2026-10-26, before the merge). Closed 2026-11-04T07:43Z, about seven hours before the PR merged, so the merge did not close it.
- Review deferrals, each with its stated reason in `review.md` ("Final status of every first-pass finding" and the CI fix loop section):
  - Minor 3 exit-code half (the collapse script exits 0 when venues were `raced`; designed, documented).
  - Minor 6 (the interaction counter does not wrap `dblclick`, `selectOption`, `setChecked`, `tap`, keyboard or mouse actions).
  - Minor 10 (`reapplyWeek` merges by whole service; rare lost-race path).
  - Minor 11 (dead `weekdayRangeLabel` export, duplicated Monday-first order and `SAMPLE_MONDAY`).
  - Minor 12 (ADR-031 is `provisional` and invisible to `adr_status.py`; an Owner call to confirm or supersede).
  - Minor 13 (`workspace:^` against `workspace:*` for `@mbe/availability`).
  - Minor 14 behaviour half, Minor 15 (five process items: RED-first slips, mocked-only e2e, no native-speaker review, the "Escape on Go to date" flake, a `waitForTimeout(700)`).
  - New 1 (a comment says 422, the route answers 400; `architecture.md:203` stale) and New 3 (hand-rolled "in force" pick in `regular-week-line.ts`).
  - Minor 16 (the engine's size budget was removed with no replacement; its chunk falls under the unbudgeted `dist-*` allowlist entry) and Minor 17 (stale suite-count comment in `ci.yml`).
- Owner steps never recorded as done: a signed-in smoke of the availability page, the human-timed walkthrough (PRD 12), the collapse dry run and `--apply`, confirming or superseding ADR-031, the hospitality visual baseline refresh (`visual-noise-floor.yml`, `app: hospitality`; its current state was not checked here).
- The "Escape on Go to date puts focus back on the menu button" e2e flake: pre-existing, cause unknown (verification.md E9: 1 of 60 on this branch, 2 of 60 on origin/main in the fix loop).
- Known unknowns from verification.md "Unknown (not examined)": Migration Dry-Run on postgres:16-alpine in this form, a full-stack browser run against the real service, a screen-reader or keyboard pass, dark mode, browsers other than Chromium.

## Run retrospective

- Keep: the Review stage reading the diff cold. It found three majors before ship (a stale client silently erasing a varied week, set seating flattened by Change regular week, Duplicate making an all-week winner), and each was fixed with a RED test (`review.md` Majors 1-3).
- Keep: stating evidence limits in every artifact ("local run, synthetic OIDC session; auth.setup.ts skipped"). It made this retro's job easy: nothing in the run claims use, and every NOT RUN is named.
- Keep: the interaction-count guards, and Verify's mutation proof that the varied-week guard fails when its constant is changed to 18 (`verification.md` assumptions; `review.md` Minor 5). Review had found that guard could not fail as first written.
- Change: Review ranked a duplicate-saves-all-week finding minor after tracing it by reading, and a read-only reviewer cannot run it. A browser repro the next day showed it was real and fixed it (#8335). Deferred minors that describe a user-visible wrong save should get a one-line repro in Verify before Ship.
- Change: the CI fix loop. The first push failed three `CI Gate` inputs (Build `no-circular`, Lint knip `Unused exports (1)`, Test (rest) `assert-vitest-ran`; `release.md` log 11) and a fourth, `size:check`, was found only by a local Build replica. The pre-flight lanes `release.md` log 2 lists (install, lint, typecheck, arch-audit, drift, i18n catalogs) omit them. That cost a Ship to Implement round trip and the push-wait-fix cycle.
- Change: the Operate decision. The brief set `operate: skip` because the count would be 0. That is a sound reading, but it left the run with no owner for the unrun Owner steps: the walkthrough, the smoke and the collapse dry run have sat open since 2026-11-04.
- Stop: building a data-migration collapse script ahead of knowing a venue needs it. The idea's own "Why now" argued the backfill had not run, and the Owner then ran the backfill five days later. A dry run against the 2 `already_migrated` venues would have settled whether Milestone 3 was needed. Its cost was real (a script, a store-path reuse, a property test, an integration test, `reference.md`, review Minors 2 and 3). The Owner chose Scope A including migrated venues, so this is a question for the PRD's "Open questions" step ("Is collapsing ... in reach?"), not a verdict.

## Environment

| Mistake                                                                                                                                                                              | Evidence                                                                                                  | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First push failed Build `no-circular` (a type import cycle through `resolve-day.ts`)                                                                                                 | `release.md` log 11; `review.md` "CI fix loop review"                                                     | mechanical | `/local-ci-precheck` (`.claude/skills/local-ci-precheck/SKILL.md`): add a `pnpm check:boundaries` lane. Its table has no boundaries row today, and `local-ci-precheck-mirror.test.mjs` covers only CI's `lint`, `typecheck` and `architecture-audit` jobs, so a Build-job step is outside the mirror                                                                  |
| First push failed Lint knip (`toClock` exported, unused) and Build size budgets                                                                                                      | `release.md` log 11; `verification.md` E13                                                                | mechanical | Already carried: SKILL.md now has knip and size lanes (Size lane cites #8522, 2026-11-06 to 11-08, after this run). No new carrier. Recorded so the next reader knows the gap closed after the run                                                                                                                                                                    |
| Two new `DATABASE_URL`-gated integration suites were not on `ci.yml`'s RLS list; `assert-vitest-ran` failed in Test (rest)                                                           | `release.md` log 11; `verification.md` §Re-verification, `Suites ran for real` line; `review.md` Minor 17 | mechanical | The coverage test `review.md` Minor 17 says pins the RLS list (its name was not verified here), run inside `/local-ci-precheck` or the package's unit tests so a new gated suite not on the list fails before push. Whether it already runs in precheck was not checked                                                                                               |
| Review Major 1: `architecture.md` assumption 6 said the version compare-and-set refuses a stale client; it does not cover a client that loaded after the save but runs an old bundle | `review.md` Major 1                                                                                       | judgement  | The Review stage caught it and `ScheduleServiceRequestSchema` (716319fd1) pins it by route tests. Carrier for the class: the `architecture.md` assumptions list, which Review re-read here. Nothing more proposed                                                                                                                                                     |
| Review Majors 2 and 3, and New 2: Change regular week flattened set seating; Duplicate seeded all seven days; a copy with no end date saved as an all-week winner                    | `review.md` Majors 2-3, New 2; #8335 body                                                                 | mechanical | An e2e in `apps/hospitality/e2e/availability-*.spec.ts` that runs Duplicate Regular week then Save and asserts Change regular week still governs. Server-side, a `validateConfig` rule in `packages/availability`, which #8335 explicitly left "for a separate decision" because venues already holding such a schedule would fail every later save                   |
| Quick setup preset chip placed Brunch at 11 PM and saved it; the demo-week e2e did not hit that order                                                                                | #8686 body (post-ship; attribution to this run not determined)                                            | mechanical | `apps/hospitality/e2e/availability-quick-setup.spec.ts` or the guards spec: add the chip-before-days order for each preset and assert saved hours stay inside the preset window                                                                                                                                                                                       |
| Varied-week interaction guard could not fail as first written                                                                                                                        | `review.md` Minor 5                                                                                       | mechanical | Already fixed at 8cdbf9577; Verify's mutation proof is the carrier (a guard is proved by failing it once). No new carrier                                                                                                                                                                                                                                             |
| The e2e evidence is a synthetic OIDC session on mocked API responses, so a real-service defect cannot show                                                                           | `verification.md` assumptions; `review.md` Minor 15                                                       | mechanical | `e2e/helpers/engine-days-mock.ts` already runs the real engine over the saved config; the carrier for the gap is the CI Hospitality E2E shards (real `auth.setup.ts`, still mocked API) plus a post-deploy signed-in smoke. `Post-Deploy Check` ran green (`release.md` log 23), but the retro did not check whether it signs in. Recorded as a finding, not a defect |

## Idea seeds

Seeds are not yet in `docs/backlog.md` (an orchestrator appends them). Signal strength: all anecdote or unobserved, from one author.

- Time the varied-week setup with a person: a human-timed walkthrough of the PRD demo with an operator or the Owner, recorded in a file (PRD 12, the only unmeasured half of the success sentence).
- Run the collapse script's dry run on production and decide whether Milestone 3's script is needed at all or can be retired.
- Add `pnpm check:boundaries` and the RLS-list coverage check to `/local-ci-precheck` so `no-circular` and `assert-vitest-ran` fail before the first push.
- Add e2e for the preset-chip order in quick setup and for Duplicate Regular week then Save, so both wrong-save paths fail in CI.
- Move the "new schedule must not replace the regular week" rule from the client into `validateConfig`, with a plan for venues that already hold such a schedule.
- Give the availability engine its own `manualChunks` group and size budget (review Minor 16).
- Confirm or supersede ADR-031 (provisional) and decide whether `VALID_STATUSES` should accept `provisional` (review Minor 12).
- Get a native-speaker read of the es-MX and fr-CA availability strings, including `closedDays_many` and `days_outside_use`.

## Run complete

2026-11-22. The run is released and its code is in production on tests and mocks, with 0 people observed using it. The success sentence's time bar is unmeasured, three post-ship defects were found by one author's audits and repros and fixed (#8335, #8745 for #8686, #8755 for #8688 per `git log`), and the Owner steps are still open. Seeds above are the input to the next Idea-stage run.
