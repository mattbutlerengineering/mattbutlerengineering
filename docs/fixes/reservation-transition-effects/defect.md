---
stage: capture
run: maintenance:reservation-transition-effects
date: 2026-10-04
re-entry: architect
origin: "/idea-to-prod:deepen review at fcd4be0a1 (2026-10-04), candidate #1; autorun brief autorun-brief.md"
assumptions:
  - "Variant = condition brief (degraded, not broken), as the autorun brief states; no skill default needed."
  - "re-entry: architect taken from the brief's expectation and confirmed by the evidence (money paths move, 9 seams, 2-3 PRs, open product decisions) — not a skill default."
  - "In-flight check scoped to open GitHub PRs (gh pr list, 18 open) plus local/remote branch names; no tracker issue exists for this run (brief: Tracker none)."
  - "Test-seam counts were re-measured with grep heuristics (see Evidence §6); they differ from the brief's 8/10/5 by counting method only. Treated as approximate, not as a contradiction."
---

# Condition: reservation transition side effects are decided per entry point

## Condition

Which outbound side effects a reservation transition fires (SSE, guest email/SMS,
reminder jobs, deposit capture/refund via Stripe) is decided separately by each
route or service entry point, through ~9 shallow seams in
`services/reservations/src`. `services/reservation-state-machine.ts` (39 lines)
only validates transitions; there is no single "transition → effects" table. The
result is that the same transition fires different effects depending on which
door it came through (table below), a dead event emitter swallows four emit
sites, and Stripe bypasses its own port in two routes. Nothing is
outright broken in a way users have reported; the condition is degraded
coherence, inconsistent test seams, and no single place to express venue-level
effect policy (e.g. "suppress all outbound effects for venue X", which
`feature:live-demo-venue` needs).

**Target state that ends the run:** one reservation-transitions module owns the
effects per transition (cancel, no-show, complete, confirm/hold-confirm, create,
modify), and every route and service entry point calls it. Effects sit behind a
small number of injected ports (payments, messaging, jobs, events) with
production + in-memory adapters, constructed exactly once in the composition
root (`buildApp`). The dead `events.ts` singleton is gone (its emits routed
through the live emitter); Stripe is injectable everywhere, including
`public-deposits.ts` and `stripe-webhook.ts`. Venue-level effect policy is
expressible in one place. Transition-level tests across entry points exist and
were written first; each entry-point divergence below has a recorded ruling.
This is direction, not a design — Architect designs it.

## Reproduction / Evidence

All re-verified 2026-10-04 against the run branch HEAD `e9f9c5f63` (=
`origin/main` `2653312ff` + the brief commit). Paths relative to
`services/reservations/src/` unless stated.

### 1. The seams and their double constructions

| Seam                      | Where (verified)                                                                                                                      | Double construction?                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NotificationPort`        | `packages/notifications/src/port.ts:33`                                                                                               | —                                                                                                                                                                           |
| `SmsPort`                 | `packages/notifications/src/sms-port.ts:49`                                                                                           | `TwilioSmsAdapter` built TWICE: `notifications.ts:55` and `services/notifier-runtime.ts:71`                                                                                 |
| `NotificationDispatcher`  | `packages/notifications/src/notification-dispatcher.ts:35` (concrete class, no interface; only `NotificationDispatcherConfig` at :10) | —                                                                                                                                                                           |
| `NotifierScheduler`       | `services/notifier-runtime.ts:14` (`Pick<JobScheduler, "schedule" \| "cancel">`)                                                      | Not injectable through `buildApp`: `app.ts:158` calls `createNotifierRuntime()` unconditionally; `ReservationsAppOptions` (`app.ts:88-103`) has no runtime/scheduler option |
| `BookingNotifier`         | `services/booking-notifications.ts:34`                                                                                                | —                                                                                                                                                                           |
| `WaitlistNotifier`        | `services/waitlist-notifier.ts:72`                                                                                                    | —                                                                                                                                                                           |
| `PostVisitNotifier`       | `services/post-visit-notifier.ts:70`                                                                                                  | —                                                                                                                                                                           |
| `StripePort`              | `services/deposit.ts:14-22`                                                                                                           | `StripeService` built TWICE: `deposit.ts:1215-1217` (inside `new DepositService(new StripeService(...))`) and the singleton `services/stripe.ts:310`                        |
| `ReservationEventEmitter` | `services/events.ts:36`                                                                                                               | Built TWICE: `app.ts:177` (live, decorated as `fastify.reservationEvents`) and the module singleton `services/events.ts:169`                                                |

### 2. No transition → effects table

`services/reservation-state-machine.ts` exports only `reservationMachine`,
`ReservationTransitionError` and `transitionReservation` (validation). Effects
are if-chained in the staff PATCH handler, `routes/reservations.ts`:

- cancel `:571-596` (SSE emit at `:589`) — brief said `:574-589`, moved slightly;
- no-show `:599-618` — brief said `:599-611`;
- complete `:680-704`, `postVisitEmailEnabled` read inline from venue settings at
  `:686` — brief said `:681-701`.

### 3. Dead emitter

- The singleton `reservationEvents` (`events.ts:169`) has zero subscribers. The
  only subscribers in `src` (non-test) are `routes/events.ts:83` and `:143`, both
  on `fastify.reservationEvents` — the `app.ts:177` instance.
- Emitters into the dead singleton (verified): `services/confirm-hold.ts:177`
  (`emitHoldConfirmed`), `services/floor-plan.ts:233` (`emitFloorPlanCreated`),
  `services/guest.ts:419` and `services/lapsed-guest-cron.ts:146` (both pass
  `emitLapsingGuests` as an injected dependency, imported from `./events.js` at
  `guest.ts:16` / `lapsed-guest-cron.ts:6`).
- Zero callers outside `events.ts` itself: `emitReservationUpdated`,
  `emitHoldCreated`, `emitHoldReleased` (neither the module functions nor the
  class methods on the live emitter are called).
- Consequence: hold confirmations, floor-plan creation and lapsing-guest
  notices never reach an SSE client, from any entry point.

### 4. Stripe bypasses its port

- `routes/public-deposits.ts:5` imports the singleton; uses it at `:128`
  (`createCustomer`) and `:172` (`createPaymentIntent`).
- `routes/stripe-webhook.ts:4` imports the singleton; uses it at `:189`
  (`retrievePaymentIntent`) and also `:266` (`constructWebhookEvent` —
  signature verification; not in the brief, recorded here).
- `vi.mock("stripe")` (npm package) in exactly 5 test files:
  `routes/stripe-webhook.test.ts`, `routes/deposits.test.ts`,
  `routes/public-deposits.test.ts`, `services/stripe.test.ts`,
  `services/deposit.test.ts`.

### 5. Multi-channel handlers (entry points that fan out to 2+ channels)

The brief names "6 multi-channel handlers" without listing them. Measured:

1. Staff PATCH → CANCELLED (`routes/reservations.ts:571`): deposit refund/forfeit,
   guest cancellation email and reminder-job cancel (via
   `cancelReservationWithDeposit`, `services/reservation-cancellation.ts:401`, notifier
   at :479), and SSE.
2. Staff DELETE (`routes/reservations.ts:717`, call at `:776`): deposit + email + jobs.
3. Guest manage DELETE (`routes/cancel-reservation.ts:41-49`): deposit + email + jobs.
4. Public booking from hold (`routes/public-reservations.ts:146` `confirmHold`,
   `:179-181` `scheduleBookingNotifications`): confirmation email, reminder jobs,
   and a (dead) SSE emit.
5. Guest modify (`routes/modify-reservation.ts:49` →
   `services/reservation-modification.ts:122-124` reschedule reminders, `:134`
   `sendBookingModified` email; deposit read at `:92` for the party-size guard).
6. Staff walk-in (`routes/reservations.ts:228`, emits at `:296-298`): two SSE
   events (reservation created + table updated) — one channel, two events;
   counted here only because it is the sole create path with any effect.

Also money-moving but single-channel: Staff PATCH → NO_SHOW (`recordNoShow`,
`services/reservation-no-show.ts:400`) captures/forfeits a deposit and nothing
else. Architect should confirm whether the brief's "6" is this list.

### 6. Test seams are inconsistent (approximate counts)

- Inject notifier/emitter fakes via `buildApp` options (grep for
  `notificationPort:|bookingNotifier:|postVisitNotifier:|reservationEvents:|waitlistNotifier:`
  in `*.test.ts`): 7 files.
- `vi.mock` of sibling modules by path (events / booking-notifications /
  notifications / notifier-runtime / post-visit / waitlist / deposit / stripe):
  12 files.
- `vi.mock("stripe")` npm package: 5 files.

Brief said 8 / 10 / 5. The difference is counting method; the claim
(three inconsistent seam styles) holds.

## Entry-point divergences — product decisions (NOT decided here)

Each row is a behaviour that differs today by entry point. Architect / Matt must
rule on each before the effects table is designed; the new transition-level
tests will pin today's behaviour first. Money and messaging behaviour must not
be silently unified.

| #   | Transition                  | Entry point A (fires)                                                                                      | Entry point B (differs)                                                                                                                                                                                                          | Question to rule on                                                                                                              |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Cancel                      | Staff PATCH `reservations.ts:589`: deposit + email + jobs + **SSE**                                        | Staff DELETE `reservations.ts:776-786` and guest manage DELETE `cancel-reservation.ts:41-49`: deposit + email + jobs, **no SSE**                                                                                                 | Should every cancel emit `reservation cancelled` SSE (host floor view updates live when a guest cancels)?                        |
| D2  | Create (staff)              | Public booking `public-reservations.ts:179`: confirmation email + reminder jobs                            | Staff `POST /reservations` `reservations.ts:364-475`: **nothing** (no email, no jobs, no SSE)                                                                                                                                    | Should staff-created reservations send guest confirmation / reminders, and/or emit SSE? (A new guest email is a visible change.) |
| D3  | Create (walk-in)            | Walk-in `reservations.ts:296-298`: SSE only                                                                | vs. D2 staff create (nothing) and public create (email + jobs, no live SSE)                                                                                                                                                      | Is "walk-in = SSE only, no guest messaging" the intended policy?                                                                 |
| D4  | Hold confirm                | `public-reservations.ts:146-181`: `confirmHold` + confirmation email + reminder jobs                       | Staff `holds.ts:340` and public `public-holds.ts:260`: `confirmHold` only — **no confirmation email, no reminders**                                                                                                              | Should every hold confirm send the confirmation email + schedule reminders?                                                      |
| D5  | Hold confirm (SSE)          | All three call `confirmHold` → `emitHoldConfirmed` (`confirm-hold.ts:177`)                                 | That emit goes into the dead singleton, so **no entry point** delivers a live hold-confirmed SSE                                                                                                                                 | Route to the live emitter (a new visible SSE event to clients), or drop the event?                                               |
| D6  | No-show                     | Staff PATCH `reservations.ts:599-618`: deposit capture/forfeit                                             | **No SSE**, no guest message (unlike cancel on PATCH, which emits)                                                                                                                                                               | Should NO_SHOW emit SSE? Should the guest be told a deposit was captured?                                                        |
| D7  | Complete                    | Staff PATCH `reservations.ts:680-704`: post-visit email gated on inline venue flag                         | No SSE; no other entry point reaches COMPLETED                                                                                                                                                                                   | Should COMPLETED emit SSE? Should the `postVisitEmailEnabled` gate move into the effects policy?                                 |
| D8  | Modify (time / party)       | Guest manage modify `reservation-modification.ts:122-134`: reschedule reminders + "booking modified" email | Staff PATCH generic update `reservations.ts:647-707` (`updateWithConflictCheck` at :648): **no reminder reschedule, no email, no SSE** — a staff time change leaves reminder jobs at the old time (not in the brief; found here) | Should staff modifications reschedule reminders (likely a latent defect) and/or email the guest / emit SSE?                      |
| D9  | Floor plan / lapsing guests | `floor-plan.ts:233`, `guest.ts:419`, `lapsed-guest-cron.ts:146` emit                                       | Into the dead singleton — never delivered                                                                                                                                                                                        | Route to the live emitter (new visible events) or delete the emits? (Out-of-scope SSE catalog run #2 may own the names.)         |

## Root-cause hypothesis

**Hypothesis (not a finding):** effects were added incrementally per route as
features landed (#1717 booking notifications, #1781/#1842 notification port and
dispatcher, #3088 notifier runtime, #3117 booking-notifier cancel, #3357
domain-service seam), each owning its own wiring because there was no
transition-level module to extend. The singleton `events.ts` emitter predates
the `buildApp`-injected one (`app.ts:176` comment still calls the default a
"singleton") and the module-level emit helpers were never migrated when
injection arrived. Branch names cited are local branches observed, not
confirmed history — Architect should not rely on the attribution.

## Blast radius

- **Who:** venue staff (live floor/host views miss cancels, holds, no-shows,
  completes depending on entry point) and guests (confirmation/reminder emails
  depend on which booking door was used; staff time changes may leave stale
  reminders — D8). Money: deposit capture/refund paths (cancel, no-show) move
  under this refactor, so any regression is financial.
- **How badly:** degraded, not outage. No user report on file. The visible
  symptoms are silent absences (no event, no email), which render identically to
  "fine".
- **Since when:** structural; accumulated across the PRs above.
- **Downstream:** blocks `feature:live-demo-venue` (needs one place to suppress
  effects per venue) and sequences before #4 venue-scoped-routes.
- **Scale implication:** Review and Ship scale up — money paths, `stripe-flow-reviewer`
  required on every PR touching capture/refund/deposit/Stripe (brief release
  authorization); plan 2–3 PRs, not one.

## Ruled out

- Not a state-machine bug: `reservation-state-machine.ts:11-12` transitions are
  correct; the gap is effects, not validation.
- No open PR does this work (checked 2026-10-04: 18 open PRs, none touch
  reservation transitions/effects; local branches matching notifier/SSE names are
  historical or the parallel `refactor/sse-event-catalog` run #2, which is a
  dependency to consume, not a duplicate).
- The brief's "staff POST fires nothing" is true for `POST /reservations` only;
  `POST /reservations/walk-in` does emit SSE (the brief already says so — no
  contradiction, recorded for precision).

## Notes

- **Brief claims verified false or moved:** none false. Moved: PATCH handler
  line ranges (cancel `:571-596`, no-show `:599-618`, complete `:680-704`);
  `deposit.ts` StripeService construction is `:1215-1217` (brief `:1216`, inside
  that range); guest cancel call is `cancel-reservation.ts:41-49` (brief
  `:39-47`). Additions not in the brief: `stripe-webhook.ts:266`
  (`constructWebhookEvent` also via singleton), D8 (staff modify skips reminder
  reschedule), and that `emitReservationUpdated`/`emitHoldCreated`/
  `emitHoldReleased` are uncalled on the live emitter too.
- Scope boundaries from the brief carry forward unchanged: out = SSE event-name
  catalog (#2), venue authorization (#4), the demo venue, inert ports/job types
  (note, don't delete unless orphaned).
- Mandatory test ordering: transition-level tests at the intended interface
  FIRST against today's code; deepen; delete old shallow-module tests LAST in the
  same change, stating which coverage moved where.
- STOP-and-surface triggers for later stages: credentials/secrets; any
  non-additive Prisma migration; any divergence ruling above not yet made.
- Next stage: **Architect** (`re-entry: architect`). Consider the deepen skill's
  design-it-twice pattern for the transitions interface.
