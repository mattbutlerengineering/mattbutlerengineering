# Autorun brief — waitlist-estimate-null

stop-after: decompose

## What and why

Maintenance run (defect) for issue #6580, a residual of #6493 (closed by #6556).
Three defects in the waitlist wait-estimate path shipped by #6556:

1. "No estimate" collapses to **0 minutes**: `services/waitlist.ts:106` does
   `loadEstimator(...)(position, partySize) ?? 0`, so no-fitting-table /
   no-tables / all-blocked stores `estimatedWaitMinutes = 0`, and the join
   response, "added" SMS, and status GET all tell guests "0 min wait" —
   exactly on the busiest nights.
2. The estimator's blocking window is measured from _now_ instead of from
   when the table frees: `waitlist-estimate.ts:35-37` checks
   `startTime > now && startTime < now + duration`, so a table occupied
   until 21:00 with a 21:15 booking is counted free in 120 min although only
   a 15-min gap exists. Correct window: `[freeAt, freeAt + duration)`.
3. `notifyPositionUpdate` (`waitlist-notifier.ts:118`) is defined and
   returned but has zero callers — the position-update SMS from #6493 is
   still dead.

## Run scale and slug

Maintenance run, slug `waitlist-estimate-null`, directory
`docs/fixes/waitlist-estimate-null/`. Re-entry: architect — the estimate
type changes end to end (store, schema, API response, SMS, widget render),
and the conductor wants a blueprint gate.

## Target state

- Estimator result is `number | null` end to end; null renders "estimate
  unavailable", never 0 (store null, type/schema nullable).
- `freeInMs` checks the next booking against `[freeAt, freeAt + duration)`.
- Either wire `notifyPositionUpdate` after position recalculation or
  delete it.

## Scope boundaries

In scope: the three targets above, plus their four call-site moves (create,
withLiveEstimates, status GET, widget/SMS render of null) and tests at the
intended interface first, against today's code (RED first: occupied-until-
21:00 + booking-21:15 table ⇒ not counted free at 120; no fitting table ⇒
join returns null estimate, not 0).

Out of scope (noted in the issue, not targets): `services/waitlist.ts:87`
legacy rescale SQL now meaningless on fallback paths; `slot-rules.ts:82`
throw on `durationRules: []` without `defaultReservationDuration` — both may
be seeded/flagged but not fixed in this run.

## Tracker

Intake issue: #6580 (this run's seed). No other tracker interaction from
this run; the conductor owns issue/PR state. No new issues are filed.

## IDs

Reserved block for this item: ADR 88, WO 1-5. No other new PRD/ADR/WO ids.

## User-facing surface

Yes (widget/SMS render of "estimate unavailable"), but maintenance runs
have no PRD/UX stage; the render change is a work item.

## Release authorization

None. Prepare-and-stop is moot — this run stops after decompose (blueprint
gate); implement onward is dispatched separately by the conductor.

## Constraints

- Work only in this worktree; no push, no gh, no tracker writes.
- TDD ordering per the issue: new tests at the intended interface first.
- Budget ceiling $6.44 for the whole run.
