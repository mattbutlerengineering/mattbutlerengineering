---
stage: architect
run: maintenance:reservation-transition-effects
date: 2026-10-04
ux: skipped — maintenance run (condition brief); no user-facing surface intended, the only visible deltas are the SSE events and the D8 reminder fix ruled in defect.md
assumptions:
  - "Predecessor is defect.md (maintenance run, re-entry: architect); there is no prd.md. Every requirement traced below comes from defect.md's target state and its Divergence ruling (Matt, 2026-10-04)."
  - "Staff `POST /reservations` emits `reservation:created` SSE. The ruling says every state change emits SSE and that D2 stays as-is for guest messaging (it sends nothing); a new reservation is a state change and SSE is neither money nor guest messaging. No email, SMS or reminder job is added."
  - "Guest modify gets `reservation:updated` SSE, on the same reasoning (ruling: every state change)."
  - "D8 means replacing reminder jobs that EXIST, never creating new ones. Staff-created bookings have no reminder jobs (D2), so a naive reschedule would create brand-new reminder emails/SMS, which the ruling forbids ('no new emails or SMS anywhere'). This needs `JobScheduler.cancel` to report whether it removed a job (BullMQ `queue.remove` already returns 1/0), an additive change in packages/jobs."
  - "Guest modify with a time change re-sends the booking CONFIRMATION email as well as the 'modified' email today (booking-notifications.ts:119-125 reschedule -> scheduleBookingNotifications). This is preserved exactly, because the ruling is 'guest messaging unchanged'. It is recorded as a third backlog seed for a later decision, alongside the two the ruling asked for (D2, D4)."
  - "The venue effect policy in production is a constant 'live' for every venue. The seam and the pure gate are built and tested with a suppressing source. No venue setting, flag or demo logic is read (brief: do not build demo logic)."
  - "Payments are never gated by the venue policy, because the ruling is 'money unchanged'. 'Suppress all outbound effects' therefore means messaging and jobs. SSE is staff-internal and is not outbound."
  - "The Stripe webhook signature check stays a pure helper over the static `Stripe.webhooks.constructEvent` (stripe@22.5.0 exposes it). It is local HMAC with no API key and no network, so an in-memory 'adapter' would only switch a security check off."
  - "Moving where `STRIPE_SECRET_KEY` is read (module scope at stripe.ts:310 and deposit.ts:1215 -> buildApp) is NOT treated as 'touching credentials or secrets'. The env var name, its fallback, its validation (`getStripeConfig`) and its provisioning are unchanged; only the construction site moves. Flagged for the orchestrator in case it reads the stop trigger more broadly."
  - "Run #2 (refactor/sse-event-catalog) has not merged (checked 2026-10-04: two docs commits on its branch). The events port is typed from `ReservationEvent` in services/events.ts, which run #2 will derive from its catalog, so the port picks up the catalog's per-name payload types without a change here."
  - "Main-green under tests-first: the ruling deltas are written as `it.fails(...)` in PR 1 (vitest's expected-failure form) and flipped to `it(...)` in the PR that implements them. Taken as the way to land failing-by-design tests on a green-main repo; no skill default covers it."
  - "`stripe-flow-reviewer` is required on PR 1 as well, even though PR 1 changes only tests: those tests are what pin deposit behaviour for the money-moving PRs, so a payments-aware review of the pins is part of the money gate."
---

# Architecture: one module owns what each reservation transition sets off

## Approach

Writes stay where they are. The design pulls the **decision** of what a transition sets off (SSE, guest messages, reminder jobs) out of each route and into one pure planner, `planEffects`. The planner is the effects table. It takes a transition fact plus the venue's effect policy and returns an ordered list of effects as data. A small executor runs those effects through three injected ports (messaging, jobs, events). A fourth port, payments, makes Stripe injectable under `DepositService`.

Callers never see the planner. They call one named verb per transition on `fastify.transitions`, for example `transitions.cancel(reservation, { by, manageToken, reason, note })`. The verb calls today's domain write (`cancelReservationWithDeposit`, `recordNoShow`, `confirmHold`, `createWalkIn`, `updateWithConflictCheck`, and so on) without changing it, builds the fact from the result, and applies the planned effects. It returns **the same result type that domain function returns today**, so each route's HTTP mapping stays the same.

This shape came out of comparing three designs (see Decisions):

- **Pure planner over data:** money behaviour is untouchable by construction, and the table is testable without Fastify.
- **Named verbs:** every route makes one obvious call, and no door can forget its effects.
- **Unchanged result types:** route diffs stay small, which matters because run #4 rewrites these same route files next.

## Components

### `transitions/plan.ts`: the effects table (policy)

- Responsibility: the only place that decides which effects a reservation transition fires, and in what order, timing and failure mode. That includes reminder timing (24h before, 2h before, skip when already past), reminder job ids, the D8 replace-only rule, and the venue-policy gate.
- Collaborators: none. It is a pure function. It imports only `@mbe/types` types and its own port types; no Fastify, Prisma, Stripe, BullMQ or EventEmitter.
- Deletion test: without it, reminder timing returns to `booking-notifications.ts`, the policy check would have to be repeated at every door, and each route goes back to if-chaining effects. That is today's condition.

### `transitions/run.ts`: executor

- Responsibility: carry out a `PlannedEffect[]` against the ports. The rules:
  - `await` effects run in sequence before the verb returns.
  - `background` effects run as one detached chain that stops at the first failure, and that failure is logged once.
  - `onFailure: "log" | "propagate"` decides whether a failure reaches the caller.
  - It executes `replace-if-present`: cancel the job, and only if that removed a job, schedule its replacement.
- Collaborators: `EffectPorts`, logger.

### `transitions/index.ts`: `createReservationTransitions` (the caller-facing module)

- Responsibility: one verb per transition. Each verb does three things:
  1. Calls today's domain write, with `DepositService` injected.
  2. Turns the outcome into a `TransitionFact`.
  3. Runs `planEffects` and then the executor.

  Every verb is called inside the caller's existing venue context (ADR-026 `runWithVenueContext`), exactly as the domain functions are today.

- Collaborators: `DomainServices` (`reservationService`, `depositService`), `cancelReservationWithDeposit`, `recordNoShow`, `modifyReservation`, `confirmHold`, plan, run.

### `transitions/ports.ts`, `transitions/adapters/*.ts`, `transitions/in-memory.ts`

- Responsibility: the port interfaces, owned by the policy side, plus two adapters per port. The production adapters are thin: they move today's code and translate it. The in-memory adapters are recorders that tests use.
- Collaborators: `NotificationDispatcher`, `PostVisitNotifier`, `NotifierRuntime.scheduler`, `ReservationEventEmitter`, `StripeService`.

### `transitions/venue-policy.ts`

- Responsibility: the `VenueEffectPolicySource` type, the production `allOutboundLive` source, and nothing else. `planEffects` is the only reader of a policy value.

### Composition root: `app.ts` `buildApp`

- Responsibility: construct every adapter exactly once and decorate `fastify.transitions`, `fastify.payments` and `fastify.reservationEvents`. The construction order:
  1. One `StripeService`, unless `options.payments` is passed.
  2. `new DepositService(payments)`, merged into `services`.
  3. One messaging adapter over the existing `notificationPort` and `PostVisitNotifier`.
  4. Jobs: `options.jobs` if passed, otherwise `notifierRuntime.scheduler`. Passing `options.jobs` makes the runtime's scheduler injectable for the first time.
  5. One events adapter over the single live `ReservationEventEmitter`.
  6. The policy source.
- Removed from here: the `bookingNotifier` and `postVisitNotifier` options and decorations, the module singletons at `services/events.ts:169`, `services/stripe.ts:310` and `services/deposit.ts:1215`, and the singleton emit helpers at `services/events.ts:171-212`.

### Kept as-is (named so nobody re-derives them)

- `cancelReservationWithDeposit` and `recordNoShow` keep their logic **byte-for-byte**: transition check first, deposit resolution and forfeit, CAS, reconciliation results and logs. There are two mechanical edits:
  - `depositService.` becomes `deps.deposits.`, threaded through the inner helpers.
  - The final `await deps.bookingNotifier.cancelBookingNotifications(...)` (`reservation-cancellation.ts:474`) is removed. The cancel verb applies the same effects in the same position (success path only, after the status write, awaited).
- `ReservationEventEmitter` and the SSE route (`routes/events.ts:83` table-status derivation) are unchanged. The events adapter calls `emitChange`, so the derivation keeps working, and it now also derives table-status deltas from the newly delivered events.
- `JobWorker` reminder delivery (`app.ts:295`, `job-worker.ts:67`) is unchanged and keeps using `notificationPort` directly (ADR-019).
- `WaitlistNotifier`, win-back, and the second `TwilioSmsAdapter` (`notifier-runtime.ts:71`) are out of scope. They are noted for the demo-venue run, which will need to put them under the same policy source.

## Data model

There is no schema change and no migration. The only "data" is in-memory:

```ts
// transitions/plan.ts
type Door = "staff-patch" | "staff-delete" | "guest-manage";
type TransitionFact =
  | {
      kind: "cancelled";
      door: Door;
      reservation: Reservation;
      manageToken: string;
      initiator: CancelInitiator;
    }
  | { kind: "no-show"; reservation: Reservation }
  | { kind: "staff-updated"; before: Reservation; after: Reservation } // covers COMPLETED, staff time change, other fields
  | { kind: "guest-modified"; before: Reservation; after: Reservation; manageToken: string }
  | {
      kind: "hold-confirmed";
      door: "public-booking" | "staff-hold" | "public-hold";
      reservation: Reservation;
      manageToken?: string;
    }
  | { kind: "created"; door: "walk-in" | "staff-create"; reservation: Reservation; table?: Table }
  | { kind: "attendance-confirmed"; reservation: Reservation };

type Effect =
  | { port: "events"; event: LiveEvent }
  | { port: "messaging"; message: GuestMessage }
  | { port: "jobs"; op: JobOp };
interface PlannedEffect {
  effect: Effect;
  timing: "await" | "background";
  onFailure: "log" | "propagate";
}

function planEffects(fact: TransitionFact, policy: VenueEffectPolicy, now: Date): PlannedEffect[];
```

Access patterns:

- One fact goes in and a short, ordered list comes out, per request.
- Reminder jobs are keyed `${jobType}:${reservationId}` (unchanged from `booking-notifications.ts:15`), so replace and cancel are lookups by key.

Consistency: SSE and messaging are best-effort and settle after the response. The money write and the status write keep today's ordering and CAS semantics inside the domain functions. Effects run only after a committed status write, the same as every emit site today.

## Interfaces & contracts

### `fastify.transitions` (`ReservationTransitions`)

```ts
interface ReservationTransitions {
  cancel(
    r: Reservation,
    o: {
      door: Door;
      initiator: CancelInitiator;
      manageToken: string;
      reason?: string;
      note?: string;
      log: FastifyBaseLogger;
    }
  ): Promise<CancelReservationResult>;
  noShow(r: Reservation, log: FastifyBaseLogger): Promise<RecordNoShowResult>;
  updateByStaff(
    before: Reservation,
    patch: UpdateReservationRequest
  ): Promise<UpdateReservationResult>; // generic PATCH path incl. COMPLETED
  modifyByGuest(
    r: Reservation,
    changes: ReservationChanges,
    manageToken: string,
    log: FastifyBaseLogger
  ): Promise<ModifyReservationResult>;
  confirmHold(
    input: ConfirmHoldInput,
    o: {
      door: "public-booking" | "staff-hold" | "public-hold";
      manageToken?: (r: Reservation) => string | undefined;
    }
  ): Promise<ConfirmHoldResult>;
  createWalkIn(body: WalkInRequest, userId?: string): Promise<CreateReservationResult>;
  createByStaff(body: CreateReservationRequest, userId?: string): Promise<CreateReservationResult>;
  confirmAttendance(r: Reservation): Promise<void>; // no-op unless r.status === "PENDING" (today's guard moves in)
}
```

- Input: the arguments today's route already has in hand. Guest linking, the party-size deposit guard (`isPartySizeDepositBlocked`, which now takes `deposits`), manage-token minting and the venue-context wrapping stay in the routes.
- Output: exactly the result type the wrapped domain function returns today. Effects never change the result.
- Failure modes:
  - Domain failures come back as today's `{ success: false, ... }` values, and **no effects run**.
  - `ReservationTransitionError` propagates exactly as today, so routes keep their existing try/catch to return 409.
  - An `await`/`propagate` effect that throws reaches the caller after the write has committed. Only one row has such an effect: cancel's venue lookup ahead of the cancelled email, which is today's behaviour at `booking-notifications.ts:153`. Its timing, retry safety and failure handling are covered by the `MessagingPort` contract below.
  - `background` effects never reach the caller and are logged.
- Retry: a verb is as retry-safe as the domain write it wraps. Money idempotency (Stripe keys, CAS) is untouched.

### `planEffects`: the effects table

Every change from today is marked **NEW**; any cell without that mark is today's behaviour. "bg" is background; "await" is sequential before return.

| Fact (entry point)                                                    | Money (inside domain fn, unchanged)                           | Messaging                                                                                                           | Jobs                                                                          | SSE                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| cancelled / staff-patch (`reservations.ts:571`)                       | deposit resolve, initiator = verified isAdmin ? staff : guest | `booking-cancelled` await (venue lookup propagates, send failure logged)                                            | cancel `BOOKING_REMINDER` + `DAY_OF_REMINDER` await, settled                  | `reservation:cancelled`                                    |
| cancelled / staff-delete (`reservations.ts:776`)                      | same                                                          | same                                                                                                                | same                                                                          | `reservation:cancelled` **NEW** (D1)                       |
| cancelled / guest-manage (`cancel-reservation.ts:41`)                 | deposit resolve, guest fee policy                             | same                                                                                                                | same                                                                          | `reservation:cancelled` **NEW** (D1)                       |
| no-show (`reservations.ts:599`)                                       | forfeit / reconcile (`recordNoShow`)                          | none                                                                                                                | none                                                                          | `reservation:updated` **NEW** (D6)                         |
| staff-updated, status → COMPLETED (`reservations.ts:680`)             | none                                                          | `post-visit-thank-you` bg (venue flag + unsubscribe gates stay inside `PostVisitNotifier`)                          | none                                                                          | `reservation:updated` **NEW** (D7)                         |
| staff-updated, date/startTime/endTime changed (`reservations.ts:647`) | party-size guard is a read, in the route                      | none                                                                                                                | `replace-if-present` × 2, bg, logged **NEW** (D8)                             | `reservation:updated` **NEW** (D8)                         |
| staff-updated, any other change                                       | none                                                          | none                                                                                                                | none                                                                          | `reservation:updated` **NEW**                              |
| guest-modified (`modify-reservation.ts:49`)                           | party-size guard (read)                                       | time changed: `booking-confirmation` in the bg chain (today's quirk, kept); always `booking-modified` await, logged | time changed: cancel × 2 then schedule ≤ 2, same bg chain as the confirmation | `reservation:updated` **NEW** (assumption)                 |
| hold-confirmed / public-booking (`public-reservations.ts:146,179`)    | none                                                          | `booking-confirmation` bg chain                                                                                     | schedule ≤ 2, same bg chain                                                   | `hold:confirmed` — now delivered (D5)                      |
| hold-confirmed / staff-hold (`holds.ts:340`)                          | none                                                          | none (D4 kept)                                                                                                      | none (D4 kept)                                                                | `hold:confirmed` — now delivered (D5)                      |
| hold-confirmed / public-hold (`public-holds.ts:260`)                  | none                                                          | none (D4 kept)                                                                                                      | none (D4 kept)                                                                | `hold:confirmed` — now delivered (D5)                      |
| created / walk-in (`reservations.ts:289`)                             | none                                                          | none                                                                                                                | none                                                                          | `reservation:created` + `table:updated` (D3, kept)         |
| created / staff-create (`reservations.ts:462`)                        | none                                                          | none (D2 kept)                                                                                                      | none (D2 kept)                                                                | `reservation:created` **NEW** (assumption)                 |
| attendance-confirmed (`confirm-attendance.ts:52`)                     | none                                                          | none                                                                                                                | none                                                                          | `reservation:updated` **NEW**, only on PENDING → CONFIRMED |

How the rows compose and gate:

- A staff PATCH can change status and time together. The planner unions the matching `staff-updated` rows and emits **one** `reservation:updated`.
- Venue policy: when `policy.outbound === "suppressed"`, the planner drops every messaging and jobs effect. Events always fire, and money is never touched by the policy.

Not reservation transitions: these call the events port directly, are not in the table, and are listed so the reroute is complete:

- `floor-plan:created`. `floorPlanService.clone` stops emitting (`floor-plan.ts:233`). `routes/floor-plans.ts:187` publishes after a successful clone.
- `guest:lapsing`.
  - `guestService.scanLapsedGuests(venueId, publish)` takes the publisher (`guest.ts:419`; route `guests.ts:488`).
  - `createLapsedGuestMonitor({ prisma, events })` takes it at `app.ts:279`, which replaces the import at `lapsed-guest-cron.ts:6`.

### `MessagingPort`

```ts
type GuestMessage =
  | { kind: "booking-confirmation"; reservation: Reservation; manageToken: string }
  | { kind: "booking-modified"; reservation: Reservation; manageToken: string }
  | {
      kind: "booking-cancelled";
      reservation: Reservation;
      manageToken: string;
      initiator: CancelInitiator;
    }
  | { kind: "post-visit-thank-you"; reservation: Reservation };
interface MessagingPort {
  send(message: GuestMessage): Promise<void>;
}
```

- Production (`adapters/dispatcher-messaging.ts`): the send halves move here **verbatim**. They are:
  - `booking-notifications.ts` (confirmation, cancelled)
  - `reservation-modification.ts` `notifyModification` (modified)
  - the inline post-visit block at `reservations.ts:681-701`, which builds `PostVisitEmailInput` from venue settings and calls `PostVisitNotifier`

  Each keeps its own venue lookup, `resolveChannel` preference, and try/catch, so today's skip and failure semantics carry over. The adapter makes no outbound call when guest email or venue is missing, the same as today.

- In-memory (`createInMemoryMessaging`): it records `sent: GuestMessage[]`, and `failNext(kind)` scripts a failure.
- Failure: rejects only where today's code rejected (venue lookup). Timeout: Resend/Twilio client defaults, unchanged. Retry: not retried in-request, same as today.

### `JobsPort`

```ts
type JobsPort = Pick<JobScheduler, "schedule" | "cancel">; // cancel(jobId): Promise<boolean> — true when a job was removed (additive, packages/jobs)
type JobOp =
  | {
      op: "schedule";
      jobType: ReminderJobType;
      jobId: string;
      delayMs: number;
      payload: ReminderPayload;
    }
  | { op: "cancel"; jobId: string }
  | {
      op: "replace-if-present";
      jobType: ReminderJobType;
      jobId: string;
      delayMs: number;
      payload: ReminderPayload;
    };
```

- Production: `notifierRuntime.scheduler`, which stays lazily connected. `JobScheduler.cancel` returns `(await queue.remove(id)) === 1`, and keeps returning `false` instead of throwing when removal fails.
- In-memory: `Map<jobId, { jobType, delayMs, payload }>`. `cancel` deletes the entry and reports whether it existed.
- Failure:
  - With no `REDIS_URL` in production, schedule and cancel reject (`notifier-runtime.ts:88`), exactly as today. In the background chains this is logged, and in cancel the cancels are settled, as today.
  - `replace-if-present` on a job that is currently locked or active returns `false`, so nothing is rescheduled. That is acceptable: the reminder is being delivered right now.

### `EventsPort`

```ts
type LiveEvent = Omit<ReservationEvent, "timestamp">; // run #2's catalog will narrow ReservationEvent per name; no change needed here
interface EventsPort {
  publish(event: LiveEvent): void;
}
```

- Production (`adapters/emitter-events.ts`): stamps `timestamp` and calls `emitChange` on the single live `ReservationEventEmitter`, the instance `routes/events.ts` subscribes to. venueId is `reservation.venueId ?? ""`, unchanged.
- In-memory: records `published: LiveEvent[]`.
- Failure: synchronous and in-process; a listener throwing propagates as EventEmitter does today. No timeout or retry, because it never leaves the process.

### `PaymentsPort`

```ts
type PaymentsPort = Pick<
  StripeService,
  | "createCustomer"
  | "createPaymentIntent"
  | "capturePaymentIntent"
  | "cancelPaymentIntent"
  | "createPartialRefund"
  | "retrievePaymentIntent"
  | "findDepositRefund"
>;
// deposit.ts: `export type StripePort = PaymentsPort` (alias kept so DepositService's signature is unchanged)
```

- Production: one `StripeService`, built in `buildApp` from `STRIPE_SECRET_KEY ?? "sk_test_placeholder"` (the same expression as today). It is passed to `new DepositService(payments)` and decorated as `fastify.payments`.
  - `public-deposits.ts:128` and `:172` use `fastify.payments.createCustomer` and `fastify.payments.createPaymentIntent`.
  - `stripe-webhook.ts:189` uses `fastify.payments.retrievePaymentIntent`.
  - Every importer of the `depositService` singleton (`routes/deposits.ts`, `deposit-transition-handler.ts`, `public-deposits.ts`, `stripe-webhook.ts`, `reservation-modification.ts`, `reservation-cancellation.ts`, `reservation-no-show.ts`, `domain-services.ts`) takes it from `fastify.services.depositService` or from `deps`.
- In-memory (`createInMemoryPayments`): records `calls: { op, args }[]`, returns deterministic ids, and lets a test script any result or error per op, including Stripe error `type`s, so `StripeOperationError` paths stay reachable.
- Failure: unchanged. `StripeOperationError` carries `isRetriable`, Stripe idempotency keys are passed through as today, and the Stripe SDK default timeout is unchanged.

### `verifyStripeWebhookSignature` (pure helper, `services/stripe.ts`)

- Input: raw body `Buffer`, signature header, webhook secret. Output: `Stripe.Event`. Failure: throws on a bad signature, and the route maps that to 400 as today (`stripe-webhook.ts:265-270`).
- It replaces `StripeService.constructWebhookEvent`. Tests sign real payloads with `Stripe.webhooks.generateTestHeaderString`, which is stronger than today's mocked `constructEvent`.

### `VenueEffectPolicySource`

```ts
interface VenueEffectPolicy {
  outbound: "live" | "suppressed";
}
type VenueEffectPolicySource = (venueId: string) => Promise<VenueEffectPolicy>;
export const allOutboundLive: VenueEffectPolicySource; // production
```

- The verb resolves the policy once per transition. `planEffects` is the only code that reads the policy value. The later demo-venue run swaps the source in `buildApp` (one place) and reuses it for the waitlist and win-back paths outside this table.
- Failure: if the source rejects, the effects are not run and the error is logged. A policy failure can therefore suppress effects but can never undo money. In production the source cannot reject, because it is a constant.

## Stack & dependencies

- No new dependency. `stripe@22.5.0`'s static `Stripe.webhooks` is already in the tree.
- `packages/jobs`: `JobScheduler.cancel` returns `Promise<boolean>`. This is additive: every caller awaits it as `void` today. It needs a changeset only if the package is published; it is workspace-only.
- Vitest `it.fails` for the expected-failing ruling tests in PR 1.

## Test plan (ordering is mandatory)

1. **Transition suite first, against today's code** (PR 1):
   - `services/reservations/src/transitions/entry-points.test.ts` drives every entry point in the table through `buildApp` + `inject`, plus floor-plan clone, the lapsing scan and confirm-attendance.
   - Assertions go through `src/test/effects-harness.ts`, which normalizes recorded effects into `{ events, messages, jobs, depositOps }`:
     - Against today's code, the harness records through the existing seams: `bookingNotifier`, `notificationPort`, `postVisitNotifier` and `reservationEvents` buildApp options, plus **one** temporary `vi.mock("../services/deposit.js")` recording `DepositService` op calls.
     - In PR 2 and PR 3 the harness swaps to the in-memory ports and an injected `DepositService` fake. **Test bodies do not change.**
   - The suite encodes the ruling:
     - Money ops per door equal today's, using exact op and args, for example `refund(id)` vs `forfeit(id, "no_show")` vs `refundPartial`.
     - Messages per door equal today's, including the D2/D4 absences and guest modify's double email.
     - Every SSE row and the D8 replace-only rule are written as `it.fails`. That includes: no jobs created for a staff-created booking; replaced jobs for a publicly booked one; and no email on a staff time change.
   - A pure `transitions/plan.test.ts` follows in PR 2, covering the table: one case per row, plus suppression and composition.
2. **Deepen** (PR 2, PR 3). Each `it.fails` flips to `it` in the PR that makes it pass.
3. **Delete the old shallow tests LAST**, in the same PR that orphans them. Each PR's description names where the coverage moved. Kill list:

| PR  | Test that dies                                                                                                                                                                                                                                                                                                                                                                              | Coverage moves to                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2   | `services/events.test.ts` `describe("emit helper functions")` (singleton helpers)                                                                                                                                                                                                                                                                                                           | emitter-events adapter test + entry-point suite                                                  |
| 2   | `services/confirm-hold.test.ts` `vi.mock("./events.js")` and its `emitHoldConfirmed` assertions                                                                                                                                                                                                                                                                                             | entry-point suite (3 hold doors)                                                                 |
| 2   | `services/floor-plan.test.ts` `vi.mock("./events.js")` and its `emitFloorPlanCreated` assertion                                                                                                                                                                                                                                                                                             | entry-point suite (clone route)                                                                  |
| 2   | `services/booking-notifications.test.ts` (whole file — `BookingNotifier` is deleted)                                                                                                                                                                                                                                                                                                        | `plan.test.ts` (timing, job ids, past-start skip) + dispatcher-messaging adapter test (payloads) |
| 2   | notifier cases in `services/reservation-modification.test.ts`, `services/reservation-cancellation.test.ts` (calls to `rescheduleBookingReminders`, `sendBookingModified`, `cancelBookingNotifications`)                                                                                                                                                                                     | entry-point suite                                                                                |
| 2   | `bookingNotifier` / `postVisitNotifier` / `reservationEvents` injection-and-assert cases in `routes/reservations.test.ts`, `routes/cancel-reservation.test.ts`, `routes/modify-reservation.test.ts`, `routes/public-reservations.test.ts` (post-visit + cancel-emit + schedule calls)                                                                                                       | entry-point suite                                                                                |
| 3   | `vi.mock("stripe")` in `routes/stripe-webhook.test.ts`, `routes/deposits.test.ts`, `routes/public-deposits.test.ts`                                                                                                                                                                                                                                                                         | in-memory payments via `buildApp({ payments })`; real signed payloads                            |
| 3   | `vi.mock("../services/deposit.js")` / `vi.mock("./deposit.js")` in `routes/cancel-reservation.test.ts`, `routes/modify-reservation.test.ts`, `routes/reservations.test.ts`, `routes/public-deposits.test.ts`, `routes/deposit-transition-handler.test.ts`, `services/reservation-cancellation.test.ts`, `services/reservation-no-show.test.ts`, `services/reservation-modification.test.ts` | the same tests with a `DepositService` fake passed through `deps` / `services`                   |
| 3   | the harness's own temporary `vi.mock("../services/deposit.js")`                                                                                                                                                                                                                                                                                                                             | injected fake                                                                                    |
| 3   | `services/stripe.test.ts` `constructWebhookEvent` case                                                                                                                                                                                                                                                                                                                                      | `verifyStripeWebhookSignature` test with real signatures                                         |

Deliberately kept:

- `services/stripe.test.ts`'s other `vi.mock("stripe")` cases stay. That file is the production adapter's contract test, and the SDK is the only seam below `StripeService`.
- `services/deposit.test.ts` stays as-is; it already injects a `StripePort` fake.
- `vi.mock` of `reservation.js`, `venue.js`, `database.js`, `hold.js` and `confirm-hold.js` stay. They belong to the domain-services seam (#3357), not to effects, and are out of scope.

## PR plan (main green after each)

| PR             | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Reviewer gates                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. tests-first | Adds `entry-points.test.ts` and `test/effects-harness.ts`. There are no production changes. Ruling deltas (SSE rows, D8) are written as `it.fails`, and everything that asserts today's money and messaging behaviour passes.                                                                                                                                                                                                                                                                                                                                                                           | `reviewer`, **`stripe-flow-reviewer`** (the tests pin deposit ops per door)                                           |
| 2. effects     | Adds `transitions/` (plan, run, verbs, messaging/jobs/events ports with production and in-memory adapters, policy source), wires `buildApp`, and moves the reservation entry points onto `fastify.transitions`. Also: deletes `BookingNotifier` and the dead emitter singleton plus its free helpers; reroutes the floor-plan and lapsing emits; adds the boolean return on `packages/jobs` cancel; and removes the cancel-teardown line from `reservation-cancellation.ts`. The SSE and D8 `it.fails` flip to `it`, and the PR-2 kill list is deleted last. Deposits stay on the singleton in this PR. | `reviewer`, **`stripe-flow-reviewer`** (`reservation-cancellation.ts`, `reservation-no-show.ts` callers and ordering) |
| 3. payments    | Adds `PaymentsPort` with production and in-memory adapters, one `StripeService` plus `DepositService` built in `buildApp`, and deletes the singletons at `stripe.ts:310` and `deposit.ts:1215`. Every `depositService` importer moves to injection (the mechanical `deps.deposits` rename in cancellation, no-show and modification). Also: `public-deposits.ts` and `stripe-webhook.ts` use `fastify.payments`; `verifyStripeWebhookSignature` replaces the old signature check; and the PR-3 kill list is deleted last.                                                                               | `reviewer`, **`stripe-flow-reviewer`** (capture, refund, deposit and webhook)                                         |

Coordination:

- **Run #4 (venue-scoped-routes)** starts Implement after PR 3 merges. Files shared with it:
  - `routes/reservations.ts`, `cancel-reservation.ts`, `modify-reservation.ts`, `holds.ts`, `public-holds.ts`, `public-reservations.ts`, `confirm-attendance.ts`, `floor-plans.ts`, `guests.ts`
  - `public-deposits.ts`, `stripe-webhook.ts`, `deposits.ts`, `deposit-transition-handler.ts`

  This run edits only the effect, `depositService` and `stripeService` lines in those files. It leaves `resolveVenueId`, `runWithVenueContext`, `loadInVenueContext`, `requireVenueAccess`, `isVenueMember` and the problem-details calls alone, because run #4 owns them. The transitions verbs need the caller's venue context and must stay inside it when run #4 moves that wrapping.

- **Run #3 (endpoint-definitions-pilot)** edits `routes/guests.ts`. This run touches one line there (`:488`, passing the publisher). Whichever run lands second rebases.
- **Run #2 (sse-event-catalog)**: if it merges first, `LiveEvent` picks up its per-name payloads through `ReservationEvent`. If this run merges first, run #2 changes only the types in `services/events.ts`. This run deletes only lines 168-212 of that file (the singleton and free helpers) and leaves the type declarations at :11-28 to run #2.

## Decisions & alternatives

The interface was designed three times in parallel and then checked against the real call sites (all 13 entry points, the floor-plan, lapsing-scan and cron emitters, `public-deposits.ts:128,172`, `stripe-webhook.ts:189,266`):

- **(A) Minimal interface: one `transitions.run(command)` that owns the writes, with one flattened result.** It lost. It flattens four different failure vocabularies (confirmHold `errorCode`s, conflict and capacity, deposit 409/500, walk-in) into string `code`s, so the compiler no longer ties each door to its failures. It also pulls every domain write under the module, the widest blast radius on money-adjacent code.
- **(B) Common-caller: named verbs that own writes and effects.** Its caller surface was kept, the eight verbs above. Two of its ideas were rejected:
  - A shared `TransitionResult`, rejected for the same flattening reason; the verbs return today's types.
  - Verbs as the place effects are decided. The effects were moved into C's pure table so they can be tested as data.
- **(C) Strict ports-and-adapters: a pure `planEffects` table, with routes or domain functions calling `effects.run(fact)`.** Its planner and executor were kept. Its "routes must remember to call run" weakness is closed by having B's verbs make the call.

C also routed deferred reminder delivery back through the table (`reminder-due`), so the policy would be re-checked at delivery time. That was not taken. Suppression at planning time already stops a suppressed venue from scheduling any reminder, and re-plumbing `job-worker.ts` is outside the ruling. The cost is recorded: a venue suppressed **after** its reminders were scheduled would still deliver them. The demo venue is unaffected, because it is new.

Other decisions:

- **Venue policy gate inside the planner** over a decorator on the ports. A decorator would put suppression in one place and the D8/post-visit decisions in another, and a payments decorator can't see a venueId. The cost: waitlist and win-back sit outside the table, so the demo run must consult the same `VenueEffectPolicySource` there.
- **Venue policy is `{ outbound }` only** over C's `{ outbound, liveUpdates, postVisitEmail }`. Nothing in the ruling needs SSE suppression. Moving the post-visit flag would put one rule in two places, because `PostVisitNotifier` already gates on it (`post-visit-notifier.ts:121`) before any write, so it stays there.
- **D8 = `replace-if-present`** over rescheduling unconditionally. Rescheduling unconditionally would create first-ever reminders for staff-created bookings, a new guest message that the ruling forbids. It also can't reuse `rescheduleBookingReminders`, which re-sends the confirmation email.
- **Verbs return today's per-function result types** over one shared result. This keeps route HTTP mapping unchanged and keeps the route diffs small for run #4.
- **Money functions edited mechanically only (`deps.deposits`)** over moving the deposit logic into the module. The ruling requires money behaviour preserved exactly, and that code holds hard-won reconciliation behaviour (#5719, #5722, #5744).
- **Stripe signature check as a pure helper** over putting it behind `PaymentsPort`. It is local HMAC and needs no client; an in-memory double could only disable verification.
- **`stripe.test.ts` keeps `vi.mock("stripe")`** over deleting it. It is the production adapter's contract test, and below `StripeService` there is only the SDK.
- **Floor-plan and lapsing events use the events port directly** over forcing them into the transitions table. They are not reservation transitions; a fact kind for each would be a name, not a module.
- **`it.fails` for ruling deltas in PR 1** over holding PR 1 until PR 2. This keeps tests-first ordering visible in history while main stays green (ADR-016).
- **No new ADR-relevant deviation.** The design follows ADR-019 (in-process job worker, untouched), ADR-026 (verbs run inside the caller's venue context), and ADR-002/ADR-008 (route error envelopes unchanged). `docs/standards.json` does not exist in this repo.

## ADRs

None. No decision met all three parts of the ADR bar. The pure planner, the ports, and the replace-only D8 rule are each reversible inside this service, and each one's trade-off is recorded above.
