---
stage: decompose
run: feature:hospitality-phase-0
date: 2026-10-10
source: "Hospitality Roadmap 2027 (Matt, 2026-10-10), Phase 0 rows only"
decisions:
  - "Business or showcase: SHOWCASE (Matt, 2026-10-10). Stripe stays test-mode in prod; 'revenue' = demo venue's recovered covers + factory leads."
  - "Spend: Postgres jobs (pg-boss) replace Redis/BullMQ, plus a monthly SMS and LLM spend cap enforced in code (Matt, 2026-10-10). Charter rule 'no new paid infrastructure' stands."
  - "Staff roles: keep the two current roles until Phase 2; the role change is Matt's own PR (Matt, 2026-10-10)."
  - "Charter edits: accepted as written. Payroll/staffing and POS stay non-goals, service channel = communication not scheduling, offline host tablet becomes a commitment (Matt, 2026-10-10)."
  - "Reserve with Google: out of the roadmap, recorded as a non-goal (Matt, 2026-10-10)."
  - "Release semantics: flag + offer, never cancel. At T-60m an unconfirmed reservation is flagged at-risk and the first fitting waitlist party gets a table-ready offer; the booking is never auto-cancelled (Matt, 2026-10-10)."
assumptions:
  - "No architecture.md: proceeded past the soft gate with assumptions (Matt chose 'Phase 0 only' over backfilling Architect). Design choices below are taken from origin/main code facts, not from a reviewed design."
  - "Guest attendance confirmation is a new nullable Reservation.attendanceConfirmedAt column. ReservationStatus CONFIRMED stays as-is, because public bookings already land CONFIRMED at booking time (confirm-hold.ts:142, reservation.ts:654), so the status cannot also mean 'the guest said yes'."
  - "'Two-tap' means: tap the link in the SMS, then tap Confirm on the manage page. No inbound SMS webhook is built in Phase 0 (none exists today)."
  - "'Regulars are never charged' applies in smart-deposit mode only. A venue that turns deposits on for everyone (depositEnabled) charges everyone, as it does today."
  - "Phase 0 gate (the roadmap gives none): one end-to-end service on the live demo venue shows reminder → confirm, unconfirmed → at-risk → waitlist offer, and a risky guest paying a test-mode deposit, all from production."
  - "The live demo venue keeps its own run (feature:live-demo-venue, paused after Architect on 2026-10-04). This breakdown sequences it; it does not re-decompose it."
---

# Breakdown: Hospitality Phase 0 — make the existing promises fire

Progress lives in the checkboxes below. Implement checks items off as their
acceptance criteria are met.

Phase 0 is three roadmap rows: **Confirm-or-release**, **Smart deposits** and
**Live demo venue**. All three depend on scheduled jobs actually running in
production. Today they never do, because `REDIS_URL` is unset in prod and
`notifier-runtime.ts` refuses to schedule without it (#3763).

## Milestone 1: Jobs fire in production without Redis

Demonstrable: a booking made in production enqueues a `booking-reminder` row in
Postgres, and the reminder SMS goes out at T-24h, with no `REDIS_URL` set.

- [ ] **WO-0001 Charter edit** — update `PRODUCT.md` with the accepted decisions.
  - Accept: `PRODUCT.md` non-goals list payroll/staffing, POS and Reserve with Google; it says the service channel is communication, not scheduling; it commits to an offline host tablet for Phase 1; and it records the monthly SMS/LLM spend cap. The "no new paid infrastructure" rule (`PRODUCT.md:76-78`) is unchanged.
  - Blocked by: —
- [ ] **WO-0002 ADR: Postgres job queue** — new ADR choosing pg-boss over BullMQ/Redis; it amends ADR-019 (the worker stays in-process) and closes #3763.
  - Accept: the ADR is `status: active` and names (a) which connection string the worker uses (pooled or direct) and why, (b) the schema pg-boss owns, and (c) how its tables are created in prod (`db-migrate` or pg-boss self-install). #3763 is linked to the ADR.
  - Blocked by: —
- [ ] **WO-0003 Postgres-backed `JobScheduler`** — implement `schedule`/`cancel` in `packages/jobs` on pg-boss, keeping the current `NotifierScheduler` interface and the `${jobType}:${reservationId}` job-id semantics.
  - Accept: tests against a real Postgres prove that a job runs at `runAt`, not before; that `cancel` stops a pending job; that scheduling the same id twice replaces the job rather than duplicating it; and that failures retry 3 times with exponential backoff from 1000ms (as in `job-types.ts` today).
  - Blocked by: WO-0002
- [ ] **WO-0004 Postgres-backed `JobWorker`** — run the existing `JobHandlerMap` handlers on pg-boss, in-process, started on `onReady` and stopped on `onClose` (`app.ts:359-382`).
  - Accept: tests show that each registered type (`booking-reminder`, `day-of-reminder`, `waitlist-expiry`) reaches its handler inside `runWithVenueContext`; that a handler throw is retried and then left failed, not lost; and that `onClose` stops polling with no open handles.
  - Blocked by: WO-0003
- [ ] **WO-0005 Swap the reservations runtime to Postgres jobs** — point `createNotifierRuntime()` at the new scheduler and worker, and drop the prod `REDIS_URL` refusal.
  - Accept: with `NODE_ENV=production` and no `REDIS_URL`, the service boots, starts the worker, and logs no `[ERROR] REDIS_URL` line. `app-redis-production.test.ts` is replaced by a test asserting that. Creating a reservation 25h out writes a `booking-reminder` job row.
  - Blocked by: WO-0004
- [ ] **WO-0006 Remove BullMQ** — delete the BullMQ code and the `bullmq`/`ioredis` dependencies where nothing else uses them, and update docs that tell people to set `REDIS_URL` for jobs.
  - Accept: `git grep -n bullmq` finds nothing outside the lockfile history and the ADR. `services/reservations/CLAUDE.md` and `docs/backlog.md:11` no longer say jobs need Redis. `pnpm typecheck` and `pnpm test` are green.
  - Blocked by: WO-0005
- [ ] **WO-0007 Monthly SMS cap** — count SMS sends per calendar month in Postgres and refuse to send once a configured cap is reached.
  - Accept: tests show that at the cap the adapter does not call Twilio, logs a structured `sms_cap_reached` warning, and reports to Sentry once per month. The count resets at the month boundary (UTC). The cap is configuration, not a hardcoded number. With no cap configured, prod boot fails loudly (fail closed) rather than sending without limit.
  - Blocked by: —
- [ ] **WO-0008 Monthly LLM cap** — the same guard around the agent service's model calls, counted in tokens or cents.
  - Accept: tests show that once the cap is reached, model calls return a user-readable "assistant paused for this month" error instead of calling the provider, and that the counter resets monthly. Prod boot fails closed with no cap set.
  - Blocked by: —
- [ ] **WO-0009 Prod proof: a reminder fires** — deploy through CI and observe a real job in prod.
  - Accept: `release.md` (or this item's PR) quotes the prod job row for a test reservation and the Twilio message SID of its 24h reminder. Matt's step: confirm the Twilio credentials are set in the DO app spec.
  - Blocked by: WO-0006, WO-0007

## Milestone 2: Confirm-or-release

Demonstrable: the guest gets "reply by tapping" reminders at 24h and 2h. Two taps
confirm. If a guest is still unconfirmed at T-60m, the host sees the table flagged
at-risk and the first waitlist party that fits is offered it. The booking is never
cancelled.

- [ ] **WO-0010 Migration: attendance and offer fields** — add `Reservation.attendanceConfirmedAt`, `Reservation.atRiskAt` and `WaitlistEntry.offeredForReservationId`, all nullable.
  - Accept: the migration is additive only (no drops or renames), `migration-reviewer` passes it, and `prisma generate` plus the service tests are green.
  - Blocked by: —
- [ ] **WO-0011 Confirm sets attendance** — `confirmAttendance` stamps `attendanceConfirmedAt`. It is idempotent and keeps `PENDING → CONFIRMED`, but now also succeeds on an already-CONFIRMED booking.
  - Accept: transition tests show that PENDING becomes CONFIRMED with the stamp; that CONFIRMED gets the stamp with its status unchanged; that a second confirm is a no-op 200; that CANCELLED, COMPLETED or NO_SHOW is rejected; and that a confirm clears `atRiskAt` and emits `reservation:updated` over SSE. The `services/reservations/CLAUDE.md:389` GET/PATCH mismatch is corrected.
  - Blocked by: WO-0010
- [ ] **WO-0012 Two-tap confirm on the manage page** — the reminder link opens `reservations/manage?token=…&intent=confirm` with a single Confirm button that sends the PATCH.
  - Accept: a component test shows link → page → one tap → "You're confirmed" state; an already-confirmed booking shows the confirmed state with no button; an expired token shows the existing expired-link copy.
  - Blocked by: WO-0011
- [ ] **WO-0013 Reminders carry the confirm link** — the 24h and 2h SMS and email bodies include the confirm link.
  - Accept: adapter tests show both reminders contain the confirm URL with a freshly signed manage token, and that a reminder for an already-confirmed booking omits the ask. SMS bodies stay within 2 segments (320 GSM-7 characters) for a 30-character venue name.
  - Blocked by: WO-0011, WO-0005
- [ ] **WO-0014 `attendance-check` job at T-60m** — a new job type, scheduled and cancelled alongside the reminders in `plan.ts`. If the booking is still unconfirmed, it sets `atRiskAt` and emits SSE.
  - Accept: `plan.ts` tests show the job is scheduled at start minus 60 minutes, rescheduled on a time change, and cancelled on cancel. Handler tests show that unconfirmed and not cancelled sets `atRiskAt` and emits `reservation:updated`, that confirmed does nothing, and that cancelled does nothing.
  - Blocked by: WO-0010, WO-0005
- [ ] **WO-0015 At-risk shown to the host** — the timeline and reservation list show an "unconfirmed" badge when `atRiskAt` is set, updated live over SSE.
  - Accept: component tests show the badge appears on an SSE update and clears when the guest confirms, with no page reload. The badge has an accessible name.
  - Blocked by: WO-0014
- [ ] **WO-0016 Automatic waitlist offer** — when `attendance-check` flags a booking, offer it to the oldest `waiting` entry with `partySize <=` the reservation's party size, through the existing `notifyTableReady` 5-minute flow, and record `offeredForReservationId`.
  - Accept: handler tests show that a fitting entry gets the table-ready SMS and expiry job; that no fitting entry means no SMS; that an entry already `notified` is skipped; that the reservation stays CONFIRMED (never cancelled); and that expiry hands the offer to the next fitting entry, as `handleExpiry` does today.
  - Blocked by: WO-0014
- [ ] **WO-0017 Phase 0 metrics** — add no-show rate and "released tables refilled from waitlist" to `booking-metrics`.
  - Accept: service tests compute no-show rate as NO_SHOW over completed plus no-show for a date range, and refill rate as seated waitlist entries with `offeredForReservationId` over at-risk reservations. Both appear on the existing metrics route response.
  - Blocked by: WO-0016

## Milestone 3: Smart deposits (Stripe test mode)

Demonstrable: on a venue in smart mode, a risky guest, a big party or a peak-slot
booking is asked for a test-mode deposit; a regular booking the same slot is not.

- [ ] **WO-0018 `decideDeposit` rule** — one pure server-side function: `depositEnabled` charges everyone; otherwise smart mode charges when the guest is `risky`, or the party is at least `depositMinPartySize`, or the start falls in `depositPeakWindows`. `trusted` guests are never charged in smart mode.
  - Accept: table tests cover every branch, including a trusted guest with a big party at peak (not charged), an unknown guest at peak (charged), deposits disabled with no smart settings (not charged), and venue-timezone handling of peak windows.
  - Blocked by: —
- [ ] **WO-0019 Smart-deposit venue settings** — add `depositMinPartySize` and `depositPeakWindows` to the venue settings schema (`packages/types/src/venue.ts`) and the venue settings form.
  - Accept: the schema rejects a negative party size and malformed windows; the settings form saves and reloads both fields; and existing venues without them parse unchanged.
  - Blocked by: WO-0018
- [ ] **WO-0020 One decision on the server** — `GET /public/v1/venues/:slug/guest-risk` takes `partySize` and `startTime` and returns `decideDeposit`'s answer; `POST …/deposits/payment-intent` uses the same function instead of `!policy.depositEnabled`.
  - Accept: route tests show that a risky guest at a venue with `depositEnabled=false` in smart mode gets `requiresDeposit: true` **and** a successful payment intent (today the second call 422s); that a trusted guest gets `false` and a 422 from payment-intent; and that the response still exposes no risk score.
  - Blocked by: WO-0018, WO-0019
- [ ] **WO-0021 Widget trusts the server** — `effectiveDepositPolicy.ts` uses the guest-risk response and drops its own `guestIsRisky` branching.
  - Accept: `useBookingFlow` tests show that the deposit step appears exactly when the server says `requiresDeposit`; and that a missing publishable key shows a visible "deposits unavailable" state to staff in preview rather than silently skipping (#4111 path).
  - Blocked by: WO-0020
- [ ] **WO-0022 Test-mode keys in prod** — Matt sets `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` and `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) for prod and E2E (#4111).
  - Accept: boot logs show no Stripe-missing warning. A prod booking by a seeded risky guest creates a test PaymentIntent, and the webhook moves the deposit `pending → held`. No `sk_live_` key exists anywhere.
  - Blocked by: WO-0020

## Milestone 4: Live demo venue

Demonstrable: a prospect taps "try it" and runs a fake Friday that shows Milestone 2
and Milestone 3 working, without signing up.

- [ ] **WO-0023 Outbound sends obey venue policy** — bring `TwilioSmsAdapter`, `WaitlistNotifier`, win-back, the `JobWorker` reminders and the new `attendance-check` offer under `VenueEffectPolicySource` (`docs/backlog.md:254`), and plan a policy failure as `suppressed` (`docs/backlog.md:253`).
  - Accept: tests show that, for a venue whose policy suppresses outbound messages, every send path above makes zero Twilio or Resend calls and records a `suppressed` effect; and that a policy lookup failure suppresses rather than sends.
  - Blocked by: WO-0016
- [ ] **WO-0024 Resume feature:live-demo-venue** — restart that run at Architect, per its paused brief, and drive it to `release.md`.
  - Accept: `docs/features/live-demo-venue/release.md` exists on main. The demo seed includes an unconfirmed booking reaching T-60m, a waiting party that fits it, and a risky guest who triggers a test deposit. Matt's human-only steps (the Auth0 demo role, the new Auth0 Regular Web App, turning on the feature flag) are recorded as done in that run.
  - Blocked by: WO-0023, WO-0022, WO-0017; external: `maintenance:venue-scoped-routes` merged (7 of 33 items done as of 2026-10-10)

## Milestone 5: Phase 0 gate and hand-off

- [ ] **WO-0025 Phase 0 gate run** — one end-to-end service on the prod demo venue.
  - Accept: `verification.md` quotes prod evidence for all of these: a 24h reminder SID; a confirm stamp from a two-tap confirm; an at-risk flag plus a waitlist offer SID; a test PaymentIntent `held` for a risky guest; and the no-show and refill numbers from `booking-metrics`. These are the first baselines for the roadmap's "How we know it worked" table.
  - Blocked by: WO-0024
- [ ] **WO-0026 Seed Phases 1–3** — append one `docs/backlog.md` seed per Phase 1–3 roadmap feature (15 lines, `(from: feature:hospitality-phase-0)`), in roadmap order with Pulse, Book in a sentence and 5-minute venue first in their phases.
  - Accept: 15 well-formed seed lines exist, and existing lines are untouched. The Service channel and Staff copilot seeds say "blocked on Matt's staff-roles PR". The Living floor seed says "offline host tablet is a charter commitment".
  - Blocked by: WO-0001

## Design gaps found

- **pg-boss on Neon.** Whether the worker can share the pooled `DATABASE_URL` (PgBouncer transaction mode) or needs a direct connection is unverified. It is assigned to WO-0002's ADR, and must be answered there before WO-0003 starts.
- **Live demo venue design is stale.** Its `architecture.md` side-effects and confinement sections must be re-derived after `maintenance:reservation-transition-effects` (shipped) and `maintenance:venue-scoped-routes` (in progress). That is owned by that run's Architect stage, not here.
- **No Architect stage for this run.** Every design default above is logged under `assumptions:`. If any of them is wrong, route back to Architect before the item that depends on it.

## Notes

None yet. Implement logs dated deviations here.
