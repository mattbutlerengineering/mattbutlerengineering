---
stage: operate
run: maintenance:reservation-transition-effects
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable for the people the run was for (venue staff on the floor view, guests who book). Sources read 2026-11-07: `gh pr view 6051 6055 6061 --json state,mergedAt,mergeCommit`; `git -C $W log origin/main --since=2026-10-05T08:00Z -- services/reservations/src/transitions services/reservations/src/app.ts services/reservations/src/routes/stripe-webhook.ts`; `git grep` on origin/main for `allOutboundLive`, `emitReservationUpdated|emitHoldCreated|emitHoldReleased`, `TwilioSmsAdapter(`; `gh issue view 7639 7769`; `gh search issues|prs` on the slug; Sentry MCP `search_issues` (unresolved, org-wide) and `search_errors` (reservations-api; the tool ran an unfiltered 14-day query and returned only the 10 newest events, so it is not a negative result). No product analytics, no per-venue SSE or email counters, no support inbox. Autorun brief has no Operate section, so there is no named minimum signal to report against."
assumptions:
  - "Population is 0 because no record shows any person using a changed behaviour: no Sentry user event on a transition path, no issue or comment from a venue or guest, no log or metric I can reach that counts SSE deliveries, reminder replacements or Stripe webhooks. Production has no `STRIPE_*` env var (release.md), so deposit/webhook paths carry no traffic."
  - "The Owner counts only if a record shows his use. None does. Agent and CI runs (the suites, the post-deploy probes) are the sample, not the population."
  - "Sentry check is weak: `search_issues` shows 10 unresolved issues, none naming a transition, reminder or Stripe path (RESERVATIONS-API-E is the 429 heartbeat probe, 92 events). `search_errors` could not be filtered to the message text. Absence of a transition error in those 10 is not absence in Sentry."
  - "The BullMQ `:` job-id defect (below) is judged a defect in this run's module, not a defect of the run's change. The `${jobType}:${reservationId}` format is quoted from the pre-run file (`booking-notifications.ts:15` at `569598866`) and was carried over verbatim into `plan.ts`. That it threw in production before 2026-10-26 is the issue author's claim (#7639), not something I verified against logs."
---

# Retro: one module owns what each reservation transition sets off

## Minimum signal

The brief states none. `release.md` records three squash merges, all confirmed merged today by `gh pr view`: #6051 (`569598866`, 2026-10-05T04:10Z), #6055 (`b50540242`, 05:58Z), #6061 (`241855af1`, 07:58Z). `git log origin/main -i --grep=revert` since 2026-10-05T08:00Z returned no commit. The run is 33 days past release.

## Outcomes vs. intent

Population is 0, so every outcome's signal is `unobserved`. Each records the state of the code on `origin/main` as of 2026-11-07, not use. Intent is from `defect.md` § Condition (target state) and § Divergence ruling.

### One module owns the effects per transition, and every route calls it

- What happened: `services/reservations/src/transitions/` is on main (`plan.ts`, `run.ts`, `index.ts`, `ports.ts`, `in-memory.ts`, `venue-policy.ts`, `adapters/`). `git log origin/main --since=2026-10-05T08:00Z -- services/reservations/src/transitions` lists 18 commits. The ones I read by subject are feature or fix work built on it, not repairs of it: closure SSE and reminder re-timing (#7785), host-branded emails (#8013), staff actor in events (#6989/#6997), the BullMQ id fix (#7643). The wiring is still `policy: allOutboundLive` at `app.ts:290`. Whether anyone has noticed a change in behaviour is not known.
- Signal strength: unobserved

### Live updates everywhere: SSE on cancel, no-show, complete, staff modify, walk-in, floor plan, lapsing guests, hold confirm (D1, D3, D5-D9)

- What happened: shipped and deployed (`Deploy API Services` success for each PR, `release.md` § Deploy evidence). `verification.md` C3 shows the 16 ruling-delta rows fail on pre-PR-2 code and pass on HEAD. `release.md` § Open items says nobody has watched a real client receive `floor-plan:created`, `guest:lapsing` or `hold:confirmed`. That is still true: I found no record of a live-client check since.
- Signal strength: unobserved

### D8: a staff time change reschedules reminders

- What happened: in code and tests only. Post-release finding: until #7643 (merged 2026-10-26T03:25Z) every `queue.add` of a reminder carried the id `booking-reminder:<id>`, which BullMQ 6.3.15 `Job.validateOptions` rejects (`Custom Id cannot contain :`, #7639). So the replacement this run added for D8, and the reminder scheduling it reused from the public path, were planned as `background` effects with `onFailure: "propagate"`. The runner caught, logged `Background transition effect failed` and returned. Nothing reached the caller or a test, because unit tests use a fake scheduler. #7639 was found during review of #7638 (closure notices), not by this run's tests, a probe or an alert. How many reminders actually failed in 2026-10-05..2026-10-26 is not measured; see the seed.
- Signal strength: anecdote (one issue's account of the failure; no log count)

### Guest messaging unchanged, money unchanged

- What happened: `verification.md` C2, C5 and C6 show the money and messaging row bodies unchanged since PR 1, and both required `stripe-flow-reviewer` passes confirmed rename-only money diffs. Production has no Stripe configuration, so deposits cannot be exercised there at all, and the webhook signature guard answered 503 (DO shows 504) both before and after the merge. I did not diff the money files since release.
- Signal strength: unobserved

### Payments injected everywhere; both Stripe/Deposit singletons deleted; one `StripeService` and `DepositService` built in `buildApp`

- What happened: per `release.md` § Release log, one `StripeService` and one `DepositService` are built in `buildApp` and both singletons are deleted. I did not re-read `app.ts` or grep for singleton importers on main today. Not exercised against real Stripe by any record I can reach.
- Signal strength: unobserved

### A venue-level effect policy can be expressed in one place

- What happened: the seam exists (`venue-policy.ts`, read at `plan.ts`), with one source, the constant `allOutboundLive`. The run's own caveats stand on main today: the second `TwilioSmsAdapter` is still built at `services/notifier-runtime.ts:86` and `notifications.ts:57`; `WaitlistNotifier`, win-back and `JobWorker` delivery still sit outside the policy; `emitReservationUpdated`, `emitHoldCreated` and `emitHoldReleased` are still defined at `events.ts:65/83/92`. `feature:live-demo-venue`, the consumer, has not landed.
- Signal strength: unobserved

### Did the defect recur?

The condition was "which effects a transition fires depends on which door it came through". Since release I found no issue, PR or commit reporting that again for these transitions. The one adjacent finding, #7639, is a different defect in the module itself (ids), and it is already fixed. Recurrence is judged on a negative search (`gh search issues|prs` on the slug and path names) of limited reach. I am not claiming "did not recur" more strongly than that.

## Open debt

The run filed no issue. Its Review and Verify deferrals are recorded only as prose in `release.md` § Backlog seeds and `review.md` § Findings, and four were appended to `docs/backlog.md` (lines 250-253). Nothing is open as a GitHub issue, so there is no state to give for them; their state on main today is:

- Policy-source failure drops live events too (`transitions/index.ts` `settle()`; `review.md`, deferred from Review): unchanged on main, still unreachable because the only source is constant.
- Second `TwilioSmsAdapter`, `WaitlistNotifier`, win-back, `JobWorker` outside the venue policy (`verification.md` § Not verified; `release.md` seed 2): unchanged on main (grep above).
- Dead emitter methods `emitReservationUpdated`/`emitHoldCreated`/`emitHoldReleased` (`review.md` § Noted, not fixed; `release.md` seed 3): still defined on main.
- In-memory payments defaults are happy-path and `buildApp` still builds a real `StripeService` in ~20 suites (`review.md` L2/L3, `release.md` seed 4): not re-checked on main this session.
- `release.md` § Open items: live SSE delivery, D8 in production and the webhook signature guard are not observed. They are Operate items, not issues, and nothing here changed that.
- Issues #7639 and #7769 name the module but were filed after this run closed, by other runs. They are not this run's debt and count toward nothing. #7639 is both closed (2026-10-26) and the strongest evidence in this retro.

## Run retrospective

- Keep: tests-first in its own PR with `it.fails` rows for the rulings, then flipping them. `verification.md` C3 reproduced RED on pre-PR-2 code in a throwaway worktree, and the 16 rows are on main as regression cover for the effects ruling.
- Keep: three PRs, each merged and deployed before the next, with the rollback plan saying which PR must not be reverted alone (PR 2 without PR 3's ports, and what silently regresses).
- Keep: re-dispatching both reviewers on the true final head after the merge from main, rather than relying on passes from an older SHA.
- Keep: the D8 chain question was left open by Verify, ruled by Review, and pinned by a mutation-checked test (`run.test.ts`, 94 h delay). Mutating `plan.ts` to `propagate` turns it red.
- Change: tests that drive a job scheduler through a fake cannot see the real queue library's input rules. This run moved `reminderJobId` into a new module and tested it against `createInMemoryJobs`. The id format that BullMQ 6 rejects was the old format, copied. Verify graded the effect rows green because the fake accepted every id. A port's in-memory adapter should be checked against the production adapter's validation, at least for ids and delays, in the run that introduces the port.
- Change: failures of `background` effects are logged and swallowed. The run chose this deliberately (verification deviation 5; review confirmed), so a post-commit failure does not 500 a committed write. Nothing in the run made such a failure visible, so a whole class (all reminders) could be failing for 21 days without a user-facing symptom or a Sentry alert I can find. A condition brief that says "silent absences render identically to fine" should have given the replacement a way to say it was absent.
- Change: the release had four deferred minors and three "not verified live" items, none filed as an issue (the pipeline's "backlog seeds" are the only home). They sit in `docs/backlog.md` with no owner and no trigger.
- Stop: nothing. The 3-PR structure was proportionate for a money-adjacent refactor, and the two-reviewer gates found real, small things.

## Environment

One row per mistake the run recorded: `verification.md` § Failures is "None", so the sources are `breakdown.md` § Notes deviations and `review.md` § Findings. The last row is a mistake the run did not record; it is included because it is the main finding.

| Mistake                                                                                                                                                                             | Evidence                                                                                                                                 | Class      | Proposed carrier                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route literals in the new test file tripped the AI-antipattern ratchet (`hardcodedRoutes` counts test files); had to collapse nine into one `API_V1` constant and move the baseline | `breakdown.md` § Notes, PR 1 deviation (2026-10-04)                                                                                      | mechanical | Already caught: `node scripts/check-ai-antipatterns.mjs` runs in `.husky/pre-commit:42`, `.husky/pre-push:32` and the CI job `ai-antipattern-ratchet` (`ci.yml:988`). Nothing missing                                                                       |
| Effects harness injected a `DepositService` fake but not `payments`, so `buildApp` built a real `StripeService` on `sk_test_placeholder`                                            | `review.md` § Findings (stripe-flow-reviewer L1, fixed in `1980bf10b`); L2 and ~20 suites still do this (`release.md` § Backlog seeds 4) | mechanical | A test-side guard: `buildApp` defaulting `payments` to `createInMemoryPayments()` when `NODE_ENV === "test"`, with a case in `app.payments.test.ts`. No hook or CI job covers it today; it was caught only by a reviewer subagent                           |
| D8 chain independence (a failed day-before replacement must not suppress the day-of one) was pinned only by a plan-shape string                                                     | `review.md` § Findings (second minor), fixed in `1980bf10b`                                                                              | judgement  | The test added in `run.test.ts`, run by the `Test (reservations)` job in `ci.yml`. Mutation check done by hand; no mutation job exists                                                                                                                      |
| Breakdown 2.4 said the background chain "stops at first failure and logs once"; the implementation continues past a `log` failure                                                   | `verification.md` § Deviation assessment 5                                                                                               | judgement  | None deterministic: breakdown prose vs. code. The assertion that settled it is the same `run.test.ts` case as the row above                                                                                                                                 |
| A job id the real queue library rejects (`booking-reminder:<id>`) passed every test, because the scheduler under test was a fake. Found 21 days after release by a different run    | `release.md` § Post-release checks (no queue probe); #7639; `5355e3ba9` added `transitions/job-id.test.ts`                               | mechanical | `transitions/job-id.test.ts` (exists now, runs the ids through real `Job.validateOptions` under the `Test (reservations)` job in `ci.yml`). It covers reminder ids only, not other job types' ids or delay bounds, and it was added by the fix, not the run |

Finding: the post-deploy probes in `release.md` (health 200, deposits route 400, webhook 504 unchanged) cannot reach a reminder enqueue, because nothing in them creates a reservation. The deployed reminder path had no check at all, after the run or since.

## Idea seeds

- Count how many `BOOKING_REMINDER` and `DAY_OF_REMINDER` jobs were actually enqueued versus attempted between 2026-10-05 and 2026-10-26, from reservations-api logs for `Background transition effect failed` plus `Custom Id cannot contain`, and decide whether any guests missed reminders and need telling (from: maintenance:reservation-transition-effects)
- Make a failed `background` transition effect visible: report it to Sentry with the transition name and effect kind (not only `logger.error`), then measure the count per week of `Background transition effect failed` over 14 days (from: maintenance:reservation-transition-effects)
- Run each production job adapter's input validation in its test for every job type, id and delay, not reminder ids only, so the in-memory scheduler cannot accept what BullMQ would reject; extend `transitions/job-id.test.ts` and count the job types still uncovered (from: maintenance:reservation-transition-effects)
- Observe the deployed effects once with a real client: open the host floor view on a venue with a staff login, cancel through the guest manage page and change a staff booking's time, and record the SSE event names received and the reminder's new delay in Redis (from: maintenance:reservation-transition-effects)
- Add a post-deploy probe that creates and cancels a reservation on a probe venue and asserts a reminder job exists then is gone, so the deploy health check reaches the enqueue path (from: maintenance:reservation-transition-effects)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. The four seeds already in `docs/backlog.md` lines 250-253 (policy-source failure, remaining senders under the venue policy, dead emitter methods, in-memory payments defaults) and the D2/D4/modify-email decision seeds at lines 241-243 are the carriers for this run's other deferrals and are not repeated here.
