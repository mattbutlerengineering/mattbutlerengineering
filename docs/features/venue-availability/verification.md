---
stage: verify
run: feature:venue-availability
date: 2026-10-26
assumptions:
  - Scope is Phase 1, so only the success criteria prd.md tags Phase 1 (or "every phase") are verified. Setup time (large), Holiday correctness, Policy display and Event integrity belong to Phases 2, 4 and 5 and are out of this run (breakdown.md frontmatter, Owner decision 2026-10-25).
  - The local gates ran on main at c4399b5f6. The branch head moved to edc026b29 (#7672) during the run. That commit only ticks breakdown.md checkboxes, so the results are taken to hold for it.
  - "Verify activities, not items" (breakdown.md Notes) is treated as the brief's instruction for which criteria need an end-to-end check here. No Owner was available for the human-timed one.
---

# Verification: Venue availability configuration, Phase 1

## Summary

Of the 9 Phase 1 criteria: **6 PASS**, **2 PASS for the automated half only**, with the rest NOT RUN (Preview speed against production Postgres; Migration golden capture of production venues), and **1 NOT RUN** (Setup time, small: the timed walkthrough needs a person). 0 FAIL against a PRD criterion.

There is **1 regression failure** outside the criteria. The Hospitality E2E `locale-sweep` booking-widget test has failed 4 cases on every availability PR since #7652. It routes back to Implement (see Failures). `Hospitality E2E` is advisory and not part of `CI Gate`, which is why the failure did not block any merge.

In short, Phase 1 meets its automated success criteria. It goes to Review **with gaps**: the locale-sweep regression, two criteria that only production can evidence, and one human-timed criterion NOT RUN.

Breakdown: all 38 items checked on main (`grep -c "\- \[ \]" breakdown.md` gives `0` at edc026b29, after #7672 merged at 2026-10-26T10:17:57Z). Tracking issue #7493 shows every child box ticked.

## Gates run (main, c4399b5f6)

- Check: `pnpm turbo typecheck` and `pnpm turbo lint` from the repo root (run with `pnpm -C <root> exec turbo …`). Package tests were run with `pnpm -C <abs path> test`. Reservations were run through `exec vitest run --reporter=verbose`, which runs the same `vitest run` script, so that test names could be quoted.
- Evidence:
  ```
  typecheck:  Tasks:    45 successful, 45 total   Cached: 13 cached, 45 total   Time: 1m22.979s
  lint:       Tasks:    45 successful, 45 total   Cached: 0 cached, 45 total    Time: 1m11.26s
  packages/availability:  Test Files  14 passed (14)   Tests  244 passed (244)
  packages/types:         Test Files  29 passed (29)   Tests  462 passed (462)
  packages/api-client:    Test Files  24 passed (24)   Tests  379 passed (379)
  services/reservations:  Test Files  196 passed | 6 skipped (202)   Tests  3128 passed | 213 skipped (3341)
  apps/hospitality:       Test Files  302 passed (302)   Tests  3959 passed (3959)
  ```
- Result: PASS. The 6 skipped reservations files are the database-backed integration suites, which skip without `DATABASE_URL`. CI runs them in `RLS Integration` (green below).

CI on main, the last completed `CI` run (0e60383c8, run 40304106956). The run for c4399b5f6 (40305706600) was still in progress at the time of writing.

```
Lint success · Integrity success · Typecheck success · Architecture Audit success
Test (Node 22, reservations) success · Test (Node 22, hospitality) success · Test (Node 22, rest) success
Build success · Validate Migrations success · RLS Integration (owner role, success · Test Coverage Gate success
CI Gate success
```

## Criteria & evidence

### The demo runs as written (Phase 1)

- Check: `apps/hospitality/e2e/availability-close.spec.ts` drives the PRD demo against mocked API routes: close a date with 14 bookings and 52 guests, choose cancel and notify, then see the band and the outcome counts. The server half is covered by unit and route tests: the cancel transaction, the closure-specific notices, full refunds and rebook offers.
- Evidence (the latest completed Hospitality E2E run on an availability branch, run 40300252798, `feat/availability-special-hours-series`). The failed list names only `locale-sweep` cases, so the close spec passed:
  ```
  test("a Manager closes a date, cancels and notifies 14 bookings, and sees the band", ...
    4 failed
      [chromium] › e2e/locale-sweep.spec.ts:684:9 › locale sweep (authenticated) — es-MX › booking-widget @ 375x812
      [chromium] › e2e/locale-sweep.spec.ts:684:9 › locale sweep (authenticated) — es-MX › booking-widget @ 1280x720
      [chromium] › e2e/locale-sweep.spec.ts:684:9 › locale sweep (authenticated) — fr-CA › booking-widget @ 375x812
      [chromium] › e2e/locale-sweep.spec.ts:684:9 › locale sweep (authenticated) — fr-CA › booking-widget @ 1280x720
    269 passed (13.6m)
  ✓ closure-command.test.ts > createClosure > cancels the group in the transaction, with events, leaving the deposit held for the refund job
  ✓ closure-notice.test.ts > CLOSURE_NOTICE handler > urgent sends SMS and email, and the rebook offer is a one-tap link
  ✓ closure-refund.test.ts > settleClosureRefund > refunds a held deposit through DepositService and marks the outcome done
  ✓ closure-impact.test.ts > computeClosureImpact > groups a whole-day closure's bookings as closed, with covers and held deposits
  ```
- Merged: #7520, #7521, #7522, #7523 (#7638), #7524, #7526 (#7637), #7594.
- Result: PASS. The E2E uses mocked API routes. Nobody ran the demo against a live backend; that belongs to Ship and Operate.

### Setup time, small (Phase 1)

- Check: none. The criterion is a timed walkthrough by Matt, starting from an empty venue, without help text. No person was available in this autorun.
- Supporting automated evidence only (it does not stand in for the timing). `availability-quick-setup.spec.ts` › "a Manager sets the bistro week from an empty venue and the checklist marks hours done" is part of the 269 passing E2E cases above. Merged: #7513 (#7606), #7620.
- Result: NOT RUN. The Owner needs to time it.

### Correctness (every phase; Phase 1 rules)

- Check: the engine property test (fast-check over generated configurations), plus API tests that reject a booking outside the resolved availability on each path, with the 422 ProblemDetails envelope.
- Evidence:
  ```
  ✓ src/slots.property.test.ts (3 tests) 1470ms
    ✓ engine correctness (property) (3)
      ✓ never lists a slot outside the resolved day 350ms
      ✓ never lists an available slot that judge rejects 423ms
      ✓ judges every instant inside a closure as hard 683ms
  ✓ src/routes/public-holds.test.ts > POST /public/v1/venues/:slug/holds > returns 422 outside-availability when the booking gate refuses the slot
  ✓ src/routes/public-holds.test.ts > POST /public/v1/venues/:slug/holds/:holdId/confirm > returns 422 outside-availability when a closure saved after the hold wins at confirm
  ✓ src/routes/public-reservations.test.ts > POST /public/v1/venues/:slug/reservations > returns the gate's 422 outside-availability ProblemDetails when the slot closed after the hold
  ✓ src/routes/modify-reservation.test.ts > PATCH /public/v1/reservations/manage — hold-required changes > answers 422 outside-availability when the gate refuses the held slot
  ✓ src/routes/holds.test.ts > Hold Routes > POST /v1/holds > returns 422 outside-availability when the booking gate refuses the slot
  ✓ src/routes/reservations.test.ts > Reservation Routes > PATCH /v1/reservations/:id > a move the booking gate refuses → 422 outside-availability
  ✓ src/services/booking-gate.test.ts > gateProblem > renders outside-availability as a 422 ProblemDetails with the reason
  ```
- Merged: #7499 (#7558), #7504 (#7590), #7529 (#7633, blocked tables on every path).
- Result: PASS.

### Preview speed (Phase 1)

- Check: the M0 spike against real Postgres (#7494), plus the durable engine-level speed test at the real `planPreview` (no database), run locally under its 1 s budget (`process.env.CI` unset).
- Evidence (#7494 spike comment, then the local run):
  ```
  ## Spike result: PASS (p95 190 ms against a 1 s budget)
  | Load (5 parallel queries via venue-scoped `prisma`, RLS path) | 75.8 ms | 83.7 ms | 102.3 ms |
  | Compute (30 days × current+draft slots, diff, stranded scan)   | 107.1 ms | 113.1 ms | 114.5 ms |
  | **Total** | **183.9 ms** | **190.5 ms** | **209.4 ms** |
  Fixture: 70 tables (296 seats) … 14,319 future reservations … 20 live holds
  ✓ src/services/availability-preview.speed.test.ts > planPreview speed > returns a 30-day draft with its stranded list inside its budget 3805ms
  ```
- Merged: #7512 (#7593), #7516 (#7628).
- Result: PASS for the automated half. The end-to-end `POST …/availability/preview` p95 against DO Managed Postgres, with a network hop, is NOT RUN. The spike notes its load figure is optimistic, and the speed test asserts a median over 10 runs, not a p95 including load.

### Migration (Phase 1)

- Check: a golden test. It captures the slots of every seeded and fixture venue over a fixed 60-day window, before and after migration, in three timezones across DST, for both legacy hours shapes. It also checks that the seed venue offers bookable slots.
- Evidence:
  ```
  ✓ availability-migration.golden.test.ts > legacy -> availability rows: slots are identical before and after > seed: The Grand Bistro in America/New_York from 2026-03-02
  ✓ … > seed: Rooftop Lounge in Europe/London from 2026-03-23
  ✓ … > weekday hours, defaults in America/Los_Angeles from 2026-10-26
  ✓ … > 30-minute interval, 60-minute buffer, closed Sunday in America/New_York from 2026-03-02
  ✓ … > odd interval, late opening in Europe/London from 2026-03-23
  ✓ … > the seed venues offer bookable slots after migration
  ✓ availability-migration.golden.test.ts > legacy hours the backfill refuses: listing matches legacy day by day > HH:MM:SS times
  ```
  (15 before/after cases, 1 seed case and 6 refused-shape cases, all passing.)
- Merged: #7502 (#7571), #7503 (#7582).
- Result: PASS for seeded and fixture venues. The criterion's "every existing venue" in production is NOT RUN. It needs the Owner-only `backfill-availability.ts` dry run against the production database (autorun-brief.md § Release).

### Closure integrity (Phase 1)

- Check: an invariant test on the closure command; time-advanced notice delivery with urgent dual-channel sending and the call list; full refunds with retry and idempotency.
- Evidence:
  ```
  ✓ closure-command.test.ts > createClosure > leaves no active reservation under the closure unless its outcome is keep
  ✓ closure-command.test.ts > createClosure > keeps silently only with the acknowledgement, recording who and notifying nobody
  ✓ closure-command.test.ts > createClosure > saves nothing when a group has no decision
  ✓ closure-notice-service.test.ts > closure notices settle within 2 minutes (time-advanced) > delivers every notified guest by SMS and email, surviving one failed send
  ✓ closure-notice-service.test.ts > closure notices settle within 2 minutes (time-advanced) > a guest whose every attempt fails lands on the call list
  ✓ closure-notice.test.ts > CLOSURE_NOTICE handler > emails a cancelled guest on their preferred channel and records it sent
  ✓ closure-refund.test.ts > settleClosureRefund > refunds a forfeited venue_closure deposit in full through Stripe's refund API
  ✓ closure-refund.test.ts > settleClosureRefund > a second run after done makes no Stripe call (duplicate job, one refund)
  ✓ closure-refund.test.ts > runClosureRefundJob > marks the outcome failed on the final attempt, and a later retry can finish it
  ```
- Merged: #7521 (#7600), #7523 (#7638), #7524 (#7632), #7648 (close-early enqueues refunds and notices).
- Result: PASS. Open follow-up #7644: urgency ignores `repeat` and a past `startsOn`, so some repeating closures may miss the dual-channel urgent path. Real delivery latency through SES and Twilio is unobserved until production.

### Rebooking offer (Phase 1)

- Check: engine unit tests for `rebookOffers`; the manage-page rebook flow.
- Evidence (test names from `packages/availability/src/rebook.test.ts`, all 10 passing in the run above; and from reservations):
  ```
  ✓ src/rebook.test.ts (10 tests) 51ms
    it("offers 3 slots on different days at the original time, soonest first")
    it("offers fewer than 3 when fewer slots are open")
    it("never offers a slot in the past or past the 14-day window")
    it("falls back to the picker when nothing is open")
    it("only offers slots with a table for the same party size")
  ✓ src/services/manage-rebook.test.ts > loadVenueCancellation > returns no offers when nothing qualifies, so the page shows only the picker link
  ```
- Merged: #7522 (#7579), #7528 (#7617), #7508 (#7577, manage links).
- Result: PASS.

### Night-of expiry (Phase 1)

- Check: a clock-advance test on the Tonight command.
- Evidence:
  ```
  ✓ src/services/tonight-command.test.ts > Tonight at the service-day boundary (SC Night-of expiry) > is gone the next service day, with schedules untouched
  ✓ src/services/tonight-command.test.ts > setTonight > pauses online booking as a whole-day stop on the online channel, ending at the service-day boundary
  ```
- Merged: #7529 (#7633), #7530 (#7650), #7661 (the Tonight panel follows the service day past midnight).
- Result: PASS.

### Staff override (Phase 1)

- Check: tests for the server gate, persistence and the event log; the staff form's live check; the timeline tag.
- Evidence:
  ```
  ✓ booking-gate.test.ts > judgeBooking staff override > passes a soft limit for a phone booking with a reason, reporting what it overrode
  ✓ booking-gate.test.ts > judgeBooking staff override > keeps a soft limit refused for the blank reason ""
  ✓ booking-gate.test.ts > judgeBooking staff override > keeps a soft limit refused for the blank reason "   "
  ✓ booking-gate.test.ts > judgeBooking staff override > never overrides a closure, even with a reason
  ✓ reservation.test.ts > reservationService > createWithConflictCheck > stores a staff override the gate passed, and logs it on the created event
  ✓ src/components/reservations/NewReservationDialog.liveCheck.test.tsx (9 tests)
    it("books past a soft limit only with a reason, sending it as the override")
    it("blocks booking inside a closure and shows why")
  ReservationBlock.test.tsx: it("tags an override booking and speaks its reason")
  ```
- Merged: #7505 (#7596), #7531 (#7645), #7657.
- Result: PASS.

### Breakdown acceptance criteria not already covered above

- Check: every one of the 38 items is closed by a merged PR. Its acceptance tests ran in that PR's CI and again in the suites above. Reviewer-subagent gates (`migration-reviewer`, `stripe-flow-reviewer`, `e2e-selector-drift-reviewer`, `rialto-prop-drift-detector`) and the size-limit check ran at PR time and were not re-run here.
- Evidence (`gh pr list --state merged`, item → PR):
  ```
  7494 spike (in-session, #7494 comment) · 7495 #7541 · 7496 #7553 · 7497 #7555 · 7498 #7556 · 7499 #7558
  7500 #7554 · 7501 #7567 · 7502 #7571 · 7503 #7582 · 7504 #7590 · 7505 #7596 · 7506 #7618 · 7507 #7587
  7508 #7577 · 7509 #7580 · 7510 #7585 · 7511 #7586 · 7512 #7593 · 7513 #7606 · 7514 #7594 · 7515 #7621
  7516 #7628 · 7517 #7629 · 7518 #7622 · 7519 #7623 · 7520 #7592 · 7521 #7600 · 7522 #7579 · 7523 #7638
  7524 #7632 · 7526 #7637 · 7527 #7652 + #7658 #7660 #7663 #7664 #7665 #7666 · 7528 #7617 · 7529 #7633
  7530 #7650 · 7531 #7645 · 7532 #7598
  ```
- Result: PASS, on the strength of the merged PRs and the re-run unit suites. The PR-time reviewer and size-limit gates were not re-run here (NOT RUN, accepted as recorded at merge).

## Failures

- **Hospitality E2E `locale-sweep` booking-widget, 4 cases, regression from #7652** (merged 2026-10-26T06:38Z). The cases have failed on every availability PR's E2E run since (for example 40283574063 at 07:04Z and 40300252798 at 09:31Z):
  ```
  Error: es-MX booking-widget: untranslated text
  +   "\"<!-- When available, add it to your website like this: -->\" is en-US availabilitySpecial.range",
  ```
  Cause: #7652 added the en-US key `availabilitySpecial.range: "{{from}} to {{to}}"`. The sweep turns templates into `.+?` patterns, so `.+? to .+?` matches the untranslated HTML comment in the embed snippet on `BookingWidgetDemoPage.tsx:122`.
  Routes to Implement. The fix is either a more specific sweep matcher (anchor templates, or exempt the code snippet) or the snippet text. Not fixed in Verify.
- **Hospitality visual regression on main** (`Apps Visual Regression`, run 40301556791: `Visual Regression (hospitality) failure`), and **E2E Screenshots** failing on main. Both are expected until the Owner merges baseline PR #7641 ("regenerate visual baselines (20 snapshots)", open, `needs-review`). They are recorded as open, not as a criterion failure.

## Not verified

- **Setup time, small:** NOT RUN. It needs a human-timed walkthrough by the Owner.
- **Preview speed, end to end on production infrastructure:** NOT RUN. Only the spike (local Docker Postgres) and the engine speed test exist.
- **Migration over every real venue:** NOT RUN. It needs the Owner-only backfill dry run.
- **Real guest behaviour and live metrics:** not observable before Ship and Operate. That covers notice delivery latency through real providers, rebook take-up, and the Hospitality E2E demo against a live backend.
- **The latest `CI` run on main (c4399b5f6)** was in progress when this was written. The last completed one (0e60383c8) is quoted.
- **Phase 2–5 criteria** are out of scope for this run.
- **Open follow-ups**, filed as issues and not blocking the Phase 1 criteria: #7644 (urgency with repeat and a past `startsOn`), #7636 (Tonight close-early refunds; may already be covered by #7648, so it needs triage), #7624 (no SSE on closure cancels and moves), #7631, #7635, #7626, #7634, #7630, #7625, #7619, #7627 and #7591. The optional "new service from the Add sheet" follow-up is untracked: #7665 notes that special-hours rows may use only existing services.
