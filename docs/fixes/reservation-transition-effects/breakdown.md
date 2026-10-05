---
stage: decompose
run: maintenance:reservation-transition-effects
date: 2026-10-04
assumptions:
  - "Milestones = the three PRs of architecture.md's binding PR plan (tests-first, effects, payments). Each milestone boundary is a merged, green PR on main; no milestone boundary was re-cut."
  - "`it.fails` is used ONLY for assertions that fail against today's code (the ruling deltas: the new SSE rows, D5/D9 delivery, D8 replace-if-present on a publicly booked reservation). Ruling assertions that already hold today — no jobs created for a staff-created booking on time change, no email on a staff time change, D2/D4 absences, guest-modify double email — are plain `it(...)` guards, because vitest's `it.fails` itself fails when its body passes. architecture.md's test plan lists some of these under `it.fails`; this is read as 'the D8 group', not as a literal instruction to mark passing guards as expected-failing."
  - "The three backlog seeds (D2 staff-create messaging, D4 hold-confirm messaging, guest-modify double confirmation email) are appended to `docs/backlog.md` in PR 1, alongside the tests that pin those absences, in the protocol's `(from: maintenance:reservation-transition-effects)` form."
  - "`@mbe/jobs` is `private: true` (verified packages/jobs/package.json), so the boolean `JobScheduler.cancel` change needs no changeset."
  - "No tracker import or export: the autorun brief says Tracker none, and this stage creates no GitHub issues."
  - 'Implement (2026-10-04): the harness''s `vi.mock("../services/deposit.js")` lives in the test file (`entry-points.test.ts`), not in `effects-harness.ts` — vi.mock is only hoisted in the file that calls it. The harness exports the recording `depositService` the mock hands out. Same seam, same count (exactly one), different file.'
  - "Implement (2026-10-04): the harness records messages at the `NotificationDispatcher` seam and jobs at the scheduler seam (behind the REAL `createBookingNotifier`/`createPostVisitNotifier`), not at the `bookingNotifier`/`postVisitNotifier` objects. Lowest outbound seam = strongest pin of 'guest messaging unchanged'; in PR 2 the harness keeps recording at the dispatcher (production messaging adapter over it) so venue-flag gating stays inside the pin."
  - "Implement (2026-10-04): the D9 floor-plan-clone and lapsing-scan cases run the REAL `floorPlanService.clone` / `guestService.scanLapsedGuests` over a mocked Prisma client, so today's emit into the dead singleton is exercised (not stubbed out)."
  - "Implement (2026-10-04): item 1.6's three backlog seeds already landed on the run branch at Architect (commit 3776e5217); verified present and well-formed, so 1.6 is checked without a new edit."
  - "Each PR runs the repo's pre-PR gates (`pnpm install --frozen-lockfile`, `pnpm build --filter @mbe/cli...`, lint, typecheck, test, `/local-ci-precheck`) — repo policy, not a work item, so it is not checkboxed."
---

# Breakdown: one module owns what each reservation transition sets off

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Traceability keys used in every `Accept:` line:

- **Row** = a row of architecture.md's `planEffects` effects table, named by fact / entry point.
- **D1–D9** = the divergences in defect.md, as ruled in its "Divergence ruling (Matt, 2026-10-04)": live updates everywhere; guest messaging unchanged; money unchanged; one fix, D8.
- **Kill** = a row of architecture.md's "Test that dies" table. Kill items are always the LAST item of their PR, after every flip and every new test is green.

## Coordination (applies to every PR)

- **Sequential and unstacked.** Each PR branches from fresh `origin/main` _after_ the previous PR has squash-merged. PR 2 does not start until PR 1 is on main; PR 3 does not start until PR 2 is on main. Rebase on `origin/main` again immediately before opening each PR.
- **Gates per PR:** `reviewer` PASS **and** `stripe-flow-reviewer` PASS, `CI Gate` green on the final head, no unfixed critical. No merge before both reviewers pass.
- **Run #2 (sse-event-catalog)** owns `services/reservations/src/services/events.ts:11-28` (the `ReservationEvent` type declarations). This run never edits those lines. PR 2 deletes only the singleton and free helpers (`:168-212` as measured at architecture time — re-measure on fresh main). If run #2 merged first, `LiveEvent` picks up its catalog types with no change here; if a new event name is needed, consume run #2's name rather than inventing one.
- **Run #3 (endpoint-definitions-pilot)** touches `routes/guests.ts`. This run changes one line there (the publisher passed to `scanLapsedGuests`, `:488` at architecture time). Whichever run lands second rebases; do not reformat or restructure anything else in that file.
- **Run #4 (venue-scoped-routes)** starts Implement only after PR 3 merges and must not be pre-empted. In every shared route file, edit only effect, `depositService` and `stripeService` lines. Leave `resolveVenueId`, `runWithVenueContext`, `loadInVenueContext`, `requireVenueAccess`, `isVenueMember` and problem-details calls byte-identical. Every `fastify.transitions.*` call sits inside the caller's existing venue context, never outside it.
- **Stop triggers (from the brief):** anything touching credentials or secrets beyond the PR 3 checkpoint below; any Prisma migration (none is planned); any divergence not covered by the ruling. On any of these, stop and surface to Matt.

## Milestone 1 — PR 1: tests-first (transition suite pins today's behaviour; no production change)

Demonstrable at the boundary: `entry-points.test.ts` runs green on main; every money and messaging row passes as `it`, every ruling delta is visible as `it.fails`. `git diff origin/main --stat -- 'services/reservations/src/**' ':!**/*.test.ts' ':!**/test/**'` is empty.

- [x] **1.1 Effects harness over today's seams** — add `services/reservations/src/test/effects-harness.ts`.
  - Accept: one helper builds an app via `buildApp` with recording `bookingNotifier`, `notificationPort`, `postVisitNotifier` and `reservationEvents` options plus **exactly one** temporary `vi.mock("../services/deposit.js")` recording `DepositService` op calls, and exposes normalized `{ events, messages, jobs, depositOps }`. The normalized shape is the one PR 2/PR 3 will re-back with in-memory ports, so test bodies written against it never change. A smoke test proves each of the four channels records.
  - Test-first: the harness is test code; its own smoke test is written first and fails until the harness records.
  - Files: `services/reservations/src/test/effects-harness.ts` (new), possibly `src/test/mocks.ts` (reuse only).
  - Blocked by: —
  - Dies here: none.

- [x] **1.2 Cancel rows, all three doors** — `entry-points.test.ts` cases for staff PATCH → CANCELLED, staff DELETE, guest manage DELETE.
  - Accept (Row cancelled/staff-patch, /staff-delete, /guest-manage; D1; ruling "money unchanged", "messaging unchanged"): per door, `depositOps` equals today's exact op and args (staff: initiator from verified isAdmin; guest: guest fee policy); `messages` contains one `booking-cancelled`; `jobs` shows cancel of `BOOKING_REMINDER:<id>` and `DAY_OF_REMINDER:<id>` — all as `it`. `reservation:cancelled` SSE is `it` for staff-patch and `it.fails` for staff-delete and guest-manage (D1). A domain failure case asserts no effects run.
  - Test-first: these ARE the first tests; no production change.
  - Files: `services/reservations/src/transitions/entry-points.test.ts` (new).
  - Blocked by: 1.1
  - Dies here: none.

- [x] **1.3 No-show and staff-update rows** — no-show, PATCH → COMPLETED, PATCH time change, PATCH other-field change.
  - Accept (Rows no-show, staff-updated ×3; D6, D7, D8): no-show `depositOps` = today's forfeit/reconcile exactly (`it`), no message, no job (`it`), `reservation:updated` `it.fails` (D6). COMPLETED sends `post-visit-thank-you` with venue-flag gating intact (`it`), SSE `it.fails` (D7). Time change on a **publicly booked** reservation: replacement reminder jobs at the new time `it.fails` (D8); on a **staff-created** reservation: zero jobs created (`it`, guard); no email on any staff time change (`it`, guard); SSE `it.fails`. Other-field change: SSE `it.fails`. Status + time changed together expects exactly one `reservation:updated` (`it.fails`).
  - Test-first: tests only.
  - Files: `entry-points.test.ts`.
  - Blocked by: 1.1
  - Dies here: none.

- [x] **1.4 Guest modify, hold-confirm (3 doors), create (walk-in, staff), confirm-attendance rows**
  - Accept (Rows guest-modified, hold-confirmed ×3, created ×2, attendance-confirmed; D2, D3, D4, D5): guest modify with time change sends `booking-confirmation` AND `booking-modified` (today's quirk, `it`), jobs cancel ×2 + schedule ≤ 2 (`it`), SSE `it.fails`. Public-booking hold confirm: confirmation email + ≤ 2 reminder jobs (`it`); staff-hold and public-hold: no message, no job (`it`, D4 guard); `hold:confirmed` delivered to a live `/events` subscriber `it.fails` on all three (D5). Walk-in: `reservation:created` + `table:updated` (`it`, D3). Staff create: no message, no job (`it`, D2 guard), `reservation:created` `it.fails`. Confirm-attendance: `reservation:updated` only on PENDING → CONFIRMED (`it.fails`), and none when already CONFIRMED (`it`). Reminder timing rules (24h, 2h, skip when start is past) asserted on the public-booking door (`it`).
  - Test-first: tests only.
  - Files: `entry-points.test.ts`.
  - Blocked by: 1.1
  - Dies here: none.

- [x] **1.5 Non-transition emit sites** — floor-plan clone and lapsing-guest scan.
  - Accept (D9): cloning a floor plan through its route delivers `floor-plan:created` to a live subscriber — `it.fails`; the lapsing scan (route at `guests.ts`) delivers `guest:lapsing` — `it.fails`. No change to `guests.ts` in this PR.
  - Test-first: tests only.
  - Files: `entry-points.test.ts`.
  - Blocked by: 1.1
  - Dies here: none.

- [x] **1.6 Backlog seeds for the deferred product decisions** — append three lines to `docs/backlog.md`.
  - Accept (ruling: D2 and D4 "each becomes a backlog seed"; architecture assumption on guest-modify double email): three well-formed `- <seed> (from: maintenance:reservation-transition-effects)` lines appended at the end, no existing line rewritten; file prettier-clean.
  - Test-first: n/a (docs).
  - Files: `docs/backlog.md`.
  - Blocked by: —
  - Dies here: none.

- [x] **1.7 PR 1 open → reviewed → merged** — open PR 1 from fresh `origin/main`.
  - Accept: PR description lists every `it.fails` case and the row/D it will flip under; `reviewer` PASS and `stripe-flow-reviewer` PASS (the suite pins deposit ops per door); `CI Gate` green; zero non-test, non-docs files in the diff; squash-merged with an explicit `--subject`.
  - Blocked by: 1.2, 1.3, 1.4, 1.5, 1.6

## Milestone 2 — PR 2: effects (transitions module live; SSE everywhere; D8 fixed; money untouched)

Demonstrable at the boundary: every route in the effects table calls one `fastify.transitions` verb; every PR-1 `it.fails` is now `it` and green; `BookingNotifier` and the dead emitter singleton are gone; deposits still on the singleton. Starts from fresh `origin/main` after PR 1 merged.

- [x] **2.1 Boolean `JobScheduler.cancel`** — `packages/jobs` cancel returns `Promise<boolean>`.
  - Accept (architecture `JobsPort`; prerequisite for D8 replace-if-present): returns `true` when `queue.remove(id)` returns 1, `false` when 0, and `false` (not a throw) when removal fails; every existing caller still compiles; no changeset (package is private).
  - Test-first: add the three cases to `packages/jobs/src/scheduler.test.ts` first; they fail against today's `Promise<void>`.
  - Files: `packages/jobs/src/scheduler.ts`, `scheduler.test.ts`.
  - Blocked by: PR 1 merged
  - Dies here: none.

- [x] **2.2 Ports, venue policy source, in-memory adapters** — `transitions/ports.ts`, `transitions/venue-policy.ts`, `transitions/in-memory.ts`.
  - Accept (architecture `MessagingPort`, `JobsPort`, `EventsPort`, `VenueEffectPolicySource`; target state "venue policy expressible in one place"): types exactly as specified; `allOutboundLive` resolves `{ outbound: "live" }` for any venueId; in-memory messaging records `sent` and supports `failNext(kind)`; in-memory jobs is a `Map` whose `cancel` reports existence; in-memory events records `published`. No Fastify/Prisma/BullMQ import in these files.
  - Test-first: in-memory adapter contract tests first.
  - Files: `services/reservations/src/transitions/{ports,venue-policy,in-memory}.ts` + tests.
  - Blocked by: 2.1
  - Dies here: none.

- [x] **2.3 `planEffects` — the effects table** — `transitions/plan.ts` + `plan.test.ts`.
  - Accept (every Row of the effects table; D1, D3, D5, D6, D7, D8; ruling "messaging unchanged"): one test per table row asserting effects, order, timing (`await`/`background`) and `onFailure`; reminder timing (24h, 2h, past-start skip) and job ids `${jobType}:${reservationId}`; staff time change yields `replace-if-present` ×2 (never `schedule`); status+time union yields one `reservation:updated`; `outbound: "suppressed"` drops every messaging and jobs effect but keeps events; no payments effect ever appears. Pure: imports only `@mbe/types` and port types.
  - Test-first: `plan.test.ts` written row by row before the implementation.
  - Files: `transitions/plan.ts`, `plan.test.ts`.
  - Blocked by: 2.2
  - Dies here: none.

- [x] **2.4 Executor** — `transitions/run.ts`.
  - Accept (architecture executor rules): `await` effects run in sequence before return; `background` effects run as one detached chain that stops at first failure and logs once; `propagate` failures reach the caller, `log` failures do not; `replace-if-present` schedules only when `cancel` returned `true`; a rejecting policy source runs no effects and logs.
  - Test-first: executor tests against in-memory ports first.
  - Files: `transitions/run.ts`, `run.test.ts`.
  - Blocked by: 2.2
  - Dies here: none.

- [x] **2.5 Production adapters** — `adapters/dispatcher-messaging.ts`, `adapters/emitter-events.ts`, jobs = `notifierRuntime.scheduler`.
  - Accept (ruling "messaging unchanged"): the send halves of `booking-notifications.ts` (confirmation, cancelled), `notifyModification` (modified) and the inline post-visit block (`reservations.ts:681-701`) move **verbatim**, each keeping its venue lookup, `resolveChannel` and try/catch; adapter test asserts identical payloads and the same skip when guest email or venue is missing; cancelled-email venue lookup still rejects (the one `propagate` row). Emitter adapter stamps `timestamp` and calls `emitChange` on the single live emitter so `routes/events.ts` table-status derivation sees it.
  - Test-first: adapter tests first (payload equality vs. today's functions captured before the move).
  - Files: `transitions/adapters/*.ts` + tests; reads from `services/booking-notifications.ts`, `reservation-modification.ts`, `routes/reservations.ts`.
  - Blocked by: 2.2
  - Dies here: none.

- [x] **2.6 Verbs + composition root** — `transitions/index.ts` `createReservationTransitions`; `buildApp` constructs adapters once and decorates `fastify.transitions`.
  - Accept (target state "constructed exactly once in buildApp"; architecture `ReservationTransitions`): eight verbs, each calling today's domain write unchanged and returning that function's existing result type; domain `{ success: false }` runs no effects; `ReservationTransitionError` propagates unchanged; `options.jobs` is accepted (the runtime scheduler becomes injectable); `bookingNotifier` / `postVisitNotifier` options and decorations removed; `cancelReservationWithDeposit` loses only its final `cancelBookingNotifications` line (`reservation-cancellation.ts:474` at architecture time) with the cancel verb applying the same effects at the same position (success path, after status write, awaited); `recordNoShow` deposit logic byte-identical. `stripe-flow-reviewer` checkpoint: ordering of deposit resolution → CAS → effects is unchanged in cancel and no-show.
  - Test-first: harness (1.1) swapped to in-memory ports + `options.jobs` first; suite should still be green on `it` rows before routes move.
  - Files: `transitions/index.ts`, `app.ts`, `services/reservation-cancellation.ts`, `src/test/effects-harness.ts`.
  - Blocked by: 2.3, 2.4, 2.5
  - Dies here: none.

- [x] **2.7 Move reservation entry points onto verbs** — routes `reservations.ts` (PATCH cancel/no-show/update/COMPLETED, DELETE, walk-in, POST), `cancel-reservation.ts`, `modify-reservation.ts`, `public-reservations.ts`, `holds.ts`, `public-holds.ts`, `confirm-attendance.ts`; services `confirm-hold.ts` stops emitting.
  - Accept (all Rows; D1, D3, D5, D6, D7, D8; ruling "money/messaging unchanged"): each route makes one verb call inside its existing venue context; route HTTP mapping unchanged; every `it.fails` in the cancel, no-show, staff-update, guest-modify, hold, create and confirm-attendance groups flipped to `it` and green; every money and messaging `it` from PR 1 still green with unchanged bodies. Venue-context/authz lines byte-identical (run #4).
  - Test-first: the flips are the RED → GREEN — flip one `it.fails` to `it`, watch it fail, move the route, watch it pass.
  - Files: listed routes; `services/confirm-hold.ts`.
  - Blocked by: 2.6
  - Dies here: none (kills in 2.10).

- [x] **2.8 Reroute floor-plan and lapsing emits; delete the dead singleton** — events port used directly.
  - Accept (D5, D9; target state "dead singleton gone"): `floorPlanService.clone` no longer emits and `routes/floor-plans.ts` publishes `floor-plan:created` after success; `scanLapsedGuests(venueId, publish)` takes the publisher (one-line change in `routes/guests.ts` — run #3 coordination); `createLapsedGuestMonitor({ prisma, events })` wired in `app.ts`; `services/events.ts` singleton + free helpers deleted, type declarations `:11-28` untouched (run #2); `grep -rn "from \"./events.js\"\|from \"../services/events.js\"" src` shows only type imports. Floor-plan and lapsing `it.fails` flipped to `it`.
  - Test-first: flip the two 1.5 cases first.
  - Files: `services/floor-plan.ts`, `routes/floor-plans.ts`, `services/guest.ts`, `routes/guests.ts` (one line), `services/lapsed-guest-cron.ts`, `services/events.ts`, `app.ts`.
  - Blocked by: 2.6
  - Dies here: none (kills in 2.10).

- [x] **2.9 Delete `BookingNotifier`** — remove `services/booking-notifications.ts` once nothing imports it.
  - Accept (target state; architecture "Removed from here"): zero importers; reminder timing now lives only in `plan.ts`; typecheck green.
  - Test-first: covered by 2.3 and the suite; no new test.
  - Files: `services/booking-notifications.ts` (deleted), any residual import sites.
  - Blocked by: 2.7
  - Dies here: see 2.10.

- [x] **2.10 PR-2 kill list (LAST)** — delete the shallow tests orphaned by 2.1–2.9.
  - Accept (Kill rows, PR 2): deleted, and the PR description states where each moved:
    - `services/events.test.ts` `describe("emit helper functions")` → emitter-events adapter test + entry-point suite
    - `services/confirm-hold.test.ts` `vi.mock("./events.js")` + `emitHoldConfirmed` assertions → entry-point suite (3 hold doors)
    - `services/floor-plan.test.ts` `vi.mock("./events.js")` + `emitFloorPlanCreated` assertion → entry-point suite (clone route)
    - `services/booking-notifications.test.ts` (whole file) → `plan.test.ts` + dispatcher-messaging adapter test
    - notifier cases in `services/reservation-modification.test.ts`, `services/reservation-cancellation.test.ts` (`rescheduleBookingReminders`, `sendBookingModified`, `cancelBookingNotifications`) → entry-point suite
    - `bookingNotifier` / `postVisitNotifier` / `reservationEvents` injection-and-assert cases in `routes/reservations.test.ts`, `routes/cancel-reservation.test.ts`, `routes/modify-reservation.test.ts`, `routes/public-reservations.test.ts` → entry-point suite
  - No `it.fails` remains in `entry-points.test.ts`; full reservations suite, lint, typecheck green.
  - Blocked by: 2.7, 2.8, 2.9

- [ ] **2.11 PR 2 open → reviewed → merged**
  - Accept: `reviewer` PASS, `stripe-flow-reviewer` PASS (cancellation/no-show callers and ordering), `CI Gate` green, deposits still on the singleton (no `stripe.ts`/`deposit.ts` singleton change), squash-merged with explicit `--subject`.
  - Blocked by: 2.10

## Milestone 3 — PR 3: payments (Stripe injectable everywhere; singletons deleted)

Demonstrable at the boundary: one `StripeService` and one `DepositService` constructed in `buildApp`; `public-deposits.ts` and `stripe-webhook.ts` use `fastify.payments`; webhook tests verify real signatures; no `vi.mock("stripe")` outside `services/stripe.test.ts`. Starts from fresh `origin/main` after PR 2 merged.

- [ ] **3.1 `PaymentsPort` + in-memory payments** — type alias over `StripeService`; `createInMemoryPayments`.
  - Accept (architecture `PaymentsPort`; ruling "money unchanged"): `PaymentsPort` = the seven-method `Pick`; `deposit.ts` keeps `export type StripePort = PaymentsPort` so `DepositService`'s signature is unchanged; in-memory adapter records `calls`, returns deterministic ids, scripts any result or Stripe error `type` per op so `StripeOperationError` (incl. `isRetriable`) paths are reachable; idempotency keys passed through and recorded.
  - Test-first: in-memory payments contract tests first.
  - Files: `transitions/ports.ts` (or `services/payments-port.ts`), `transitions/in-memory.ts`, `services/deposit.ts` (alias only).
  - Blocked by: PR 2 merged
  - Dies here: none.

- [ ] **3.2 `verifyStripeWebhookSignature` pure helper**
  - Accept (architecture contract): `(rawBody: Buffer, signature, secret) → Stripe.Event` over static `Stripe.webhooks.constructEvent`; throws on bad signature; tests sign real payloads with `Stripe.webhooks.generateTestHeaderString` (valid, tampered body, wrong secret, missing header); `stripe-webhook.ts` maps throw → 400 exactly as today.
  - Test-first: signature tests first, failing until the helper exists.
  - Files: `services/stripe.ts`, `services/stripe.test.ts`, `routes/stripe-webhook.ts` (signature call site only).
  - Blocked by: PR 2 merged
  - Dies here: `services/stripe.test.ts` `constructWebhookEvent` case — deleted in 3.6.

- [ ] **3.3 Composition root builds payments once** — `buildApp` constructs one `StripeService` (unless `options.payments`), `new DepositService(payments)` merged into `services`, decorates `fastify.payments`.
  - Accept (target state "constructed exactly once"; architecture composition root steps 1–2): `options.payments` accepted; `STRIPE_SECRET_KEY ?? "sk_test_placeholder"` evaluated in `buildApp`.
  - **Reviewer checkpoint (flag on the PR):** the `STRIPE_SECRET_KEY` read moves from module scope (`stripe.ts:310`, `deposit.ts:1215`) into `buildApp`, with no provisioning change. `reviewer` and `stripe-flow-reviewer` must explicitly confirm the env var name, the `"sk_test_placeholder"` fallback, and `getStripeConfig` validation are identical to today, and that no new secret, env name or deploy config is introduced. If any of the three differs, STOP (brief: credentials/secrets).
  - Test-first: `buildApp({ payments })` test asserting the injected fake receives deposit ops, written first.
  - Files: `app.ts`, `services/domain-services.ts`.
  - Blocked by: 3.1
  - Dies here: none.

- [ ] **3.4 Inject `DepositService` everywhere; delete singletons** — mechanical `depositService.` → `deps.deposits.` in cancellation, no-show, modification; routes take `fastify.services.depositService`; `isPartySizeDepositBlocked` takes `deposits`; delete `stripe.ts:310` and `deposit.ts:1215` singletons.
  - Accept (ruling "money unchanged"; target state "Stripe injectable everywhere"): every importer listed in architecture (`routes/deposits.ts`, `deposit-transition-handler.ts`, `public-deposits.ts`, `stripe-webhook.ts`, `reservation-modification.ts`, `reservation-cancellation.ts`, `reservation-no-show.ts`, `domain-services.ts`) uses injection; `public-deposits.ts:128,172` → `fastify.payments.createCustomer` / `createPaymentIntent`; `stripe-webhook.ts:189` → `fastify.payments.retrievePaymentIntent`; deposit logic otherwise byte-identical (diff shows only the rename); `grep -rn "stripeService\b\|export const depositService" src` finds no singleton; all PR-1 money assertions still green with unchanged bodies. Run #4 lines untouched.
  - Test-first: harness swaps its temporary `vi.mock("../services/deposit.js")` for an injected `DepositService` fake first; suite must stay green.
  - Files: the importers above; `services/stripe.ts`, `services/deposit.ts`; `src/test/effects-harness.ts`.
  - Blocked by: 3.3
  - Dies here: see 3.6.

- [ ] **3.5 Move deposit/stripe route tests onto injection** — rewrite `routes/stripe-webhook.test.ts`, `routes/deposits.test.ts`, `routes/public-deposits.test.ts` to `buildApp({ payments })` + real signed webhook payloads; move the `vi.mock("…/deposit.js")` files to a `DepositService` fake via `deps` / `services`.
  - Accept: every behaviour those files asserted before still asserted (same cases, new seam); webhook tests use real signatures.
  - Test-first: new injected cases written alongside the old mocked ones and green before 3.6 deletes the old seams.
  - Files: the listed test files.
  - Blocked by: 3.2, 3.4
  - Dies here: see 3.6.

- [ ] **3.6 PR-3 kill list (LAST)**
  - Accept (Kill rows, PR 3): deleted, and the PR description states where each moved:
    - `vi.mock("stripe")` in `routes/stripe-webhook.test.ts`, `routes/deposits.test.ts`, `routes/public-deposits.test.ts` → in-memory payments via `buildApp({ payments })`; real signed payloads
    - `vi.mock("../services/deposit.js")` / `vi.mock("./deposit.js")` in `routes/cancel-reservation.test.ts`, `routes/modify-reservation.test.ts`, `routes/reservations.test.ts`, `routes/public-deposits.test.ts`, `routes/deposit-transition-handler.test.ts`, `services/reservation-cancellation.test.ts`, `services/reservation-no-show.test.ts`, `services/reservation-modification.test.ts` → same tests with an injected `DepositService` fake
    - the harness's temporary `vi.mock("../services/deposit.js")` → injected fake
    - `services/stripe.test.ts` `constructWebhookEvent` case → `verifyStripeWebhookSignature` test
  - Kept deliberately (verify still present): other `vi.mock("stripe")` cases in `services/stripe.test.ts`; `services/deposit.test.ts` unchanged; `vi.mock` of `reservation.js`, `venue.js`, `database.js`, `hold.js`, `confirm-hold.js`.
  - `grep -rln 'vi.mock("stripe")' services/reservations/src` returns only `services/stripe.test.ts`.
  - Blocked by: 3.5

- [ ] **3.7 PR 3 open → reviewed → merged; hand off to run #4**
  - Accept: `reviewer` PASS and `stripe-flow-reviewer` PASS (capture, refund, deposit, webhook) with the 3.3 `STRIPE_SECRET_KEY` checkpoint explicitly confirmed in both reviews; `CI Gate` green; squash-merged with explicit `--subject`. After merge, run #4 may start Implement.
  - Blocked by: 3.6

## Design gaps found

None that block. One clarification resolved here rather than routed back (see `assumptions:`): architecture.md's test plan groups some passing-today guards (no jobs for staff-created booking, no email on staff time change) under `it.fails`; they are written as plain `it`, since `it.fails` on a passing body fails the suite. Coverage and intent are unchanged.

## Notes

- **2026-10-04 — PR 1 (tests-first) gate output** (branch `refactor/transition-effects-pr1`, off `origin/main` `2653312ff`; run-dir docs carried on this branch):
  - RED → GREEN, 1.1: `effects-harness.test.ts` with the harness moved aside → `Failed to resolve import "./effects-harness.js"`, `Test Files 1 failed`; restored → `Tests 5 passed (5)`.
  - Every `it.fails` verified to fail for the RIGHT reason (temp copy with `it.fails(`→`it(`): all 16 fail on the effect assertion — 15 × `expected [] to deeply equal [ '<event>' ]` (no live event today) and D8 × `expected { …(2) } to deeply equal { …(2) }` (seeded reminders still at their old delay). No `it.fails` fails on setup or status code.
  - `pnpm --dir services/reservations test` → `Test Files 109 passed | 4 skipped (113)`, `Tests 1732 passed | 16 expected fail | 150 skipped (1898)`.
  - `pnpm --dir packages/jobs test` → `Tests 26 passed (26)`; `pnpm --dir packages/notifications test` → `Tests 119 passed (119)`.
  - `pnpm lint` → `Tasks: 52 successful, 52 total`; `pnpm typecheck` → `Tasks: 52 successful, 52 total`.
  - `pnpm regen` then `pnpm regen --check` (after committing the regenerated root and `services/reservations/` `llms.txt`/`llms-full.txt`) → `All generated artifacts are up to date.`
  - **Deviation (2026-10-04):** the pre-push / CI AI-antipattern ratchet counts `/api/...` literals in test files too (`hardcodedRoutes`, `scripts/check-ai-antipatterns.mjs:252`). The suite's nine route literals were collapsed into one `API_V1 = "/api/v1"` constant (repo precedent: `DEPOSITS_URL`, `HOLDS_URL` in sibling tests), and `metrics/ai-antipattern-baselines.json` moves `hardcodedRoutes` 851 → 852 for that one unavoidable literal. So PR 1's diff carries one non-test, non-docs file: a metrics baseline, not production code. Every other pattern count is unchanged.
  - **Review round 1 (PR #6051):** `reviewer` PASS 9/10, no issues. `stripe-flow-reviewer` PASS with three medium gaps (M1 admin cancel rows could not tell staff from guest fee policy; M2 no-show evaluated-at-max(now,start) unpinned; M3 no no-show / partial-refund abort rows). All three added as plain `it` (entry-points suite 25 passed + 16 expected fail → 30 + 16), each mutation-checked: forcing `initiator: "guest"` in `routes/reservations.ts` fails both M1 rows; evaluating no-show at bare `now` fails M2; both mutations reverted.
  - Production diff: `git diff origin/main --stat -- 'services/reservations/src/**' ':!**/*.test.ts' ':!**/test/**'` is empty.
- **2026-10-04 — PR 1 merged:** #6051 squash-merged as `569598866` on `origin/main` after `CI Gate` SUCCESS on head `ad8c417f6`, `reviewer` PASS 9/10 (round 1 and final head) and `stripe-flow-reviewer` PASS (final head, after M1–M3). Item 1.7 checked.
- **2026-10-04 — PR 2 (effects)** on branch `refactor/transition-effects-pr2`, rebased onto `origin/main` `93b318192` (run #3's #6052 had merged — no overlap with this PR's files; run #2's #6050 still OPEN, so `events.ts` type lines are untouched and whichever lands second rebases).
  - RED → GREEN: 2.1 three new `scheduler.test.ts` cases failed `expected undefined to be true/false`, then 29/29; 2.2–2.6 new test files failed on the missing module (`Cannot find module './plan.js'` etc.), then green (in-memory 4, plan/run/adapters 45, verbs 8). The 16 PR-1 `it.fails` were RED on pre-refactor code (PR 1 probe); after the routes moved, all 16 bodies passed (vitest reported each `it.fails` as failing) while all 30 money/messaging `it` rows stayed green with unchanged bodies; flipped to `it` → `entry-points.test.ts` 46/46.
  - Gates after rebase: `pnpm lint` / `pnpm typecheck` → `Tasks: 52 successful, 52 total` each; `pnpm --dir packages/jobs test` → `Tests 29 passed (29)`; `pnpm --dir packages/notifications test` → `Tests 119 passed (119)`; `pnpm --dir services/reservations test` → `Test Files 114 passed | 4 skipped (118)`, `Tests 1764 passed | 150 skipped (1914)`.
  - Money: `recordNoShow` not edited. `cancelReservationWithDeposit` lost only its final `cancelBookingNotifications` call (its unused `manageToken` parameter is kept as `_manageToken` for call-site stability); deposit resolution → CAS → effects ordering unchanged (effects run in the verb only on `success`). Deposits stay on the singleton.
  - Deviations from architecture.md, none money or guest-messaging outcome changes:
    - `cancelled` fact carries both `reservation` (pre-cancel, what the email describes — today's behaviour) and `updated` (the committed row the SSE event carries — today's PATCH behaviour).
    - `staff-updated` fact carries the `patch`: post-visit fires on `patch.status === "COMPLETED"` (today's exact condition); D8 triggers when the patch sets `date`/`startTime`/`endTime` (the same rule as the guest path's `isTimeChange`). For a reminder whose new moment has already passed, `replace-if-present` becomes a plain `cancel` (removes a stale reminder, never creates one).
    - Background chain: a `log` failure is logged and the chain continues; a `propagate` failure is logged once and stops it. This is what reproduces today's guest-modify chain (reminder cancels were `allSettled`; confirmation/schedule failures stopped the chain).
    - Failure-path deltas taken from architecture.md's table (pathological DB/listener failures only): the COMPLETED post-visit venue read now runs in the background (a venue-read failure after the committed COMPLETED write logs instead of 500ing); the guest-modify `booking-modified` venue read is `await`/`log` (was a 500); live-event publish is `await`/`log` (an SSE listener throwing after a committed write no longer 500s). Reminder cancels on cancel run in sequence and a rejection is now logged (was silently settled). Messaging failures log on the app logger (was the request logger for modify).
    - Floor-plan and lapsing emits call the single live emitter's typed helpers (`emitFloorPlanCreated`, `emitLapsingGuests`) rather than an `EventsPort` — same instance the port wraps, no new decoration. `app.ts` keeps a value import of the `ReservationEventEmitter` class (it constructs the one emitter); every other `events.js` import is type-only.
    - `modifyByGuest` takes no logger (the domain write no longer logs). The rejecting-policy-source case is tested on the verbs (`transitions/index.test.ts`), where the policy is resolved, not on the executor.
    - Two tests outside the kill list changed because they referenced removed code: `routes/events.integration.test.ts` (emitted on the deleted singleton — now `app.reservationEvents`) and `services/lapsed-guest-cron.test.ts` (new required `emitLapsingGuests` dep).
