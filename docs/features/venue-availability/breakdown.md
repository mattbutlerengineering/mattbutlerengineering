---
stage: decompose
run: feature:venue-availability
date: 2026-10-25
assumptions:
  - Scope is Phase 1 only (Owner, 2026-10-25). Phases 2–5 each become their own feature run, re-entering at Decompose against this run's architecture.md.
  - Items are mirrored to GitHub issues without the `ready` label (Owner, 2026-10-25). At Implement the Owner chooses, per milestone, whether to queue them or build in-session.
---

# Breakdown: Venue availability configuration, Phase 1

Progress lives in the checkboxes below. Implement checks items off as their acceptance criteria are met.

Names follow `architecture.md` exactly. "Engine" means `packages/availability` (`@mbe/availability`).

## Milestone 0: Preview-speed spike (de-risk before building)

- [x] **Preview spike** — a throwaway proof of "load once, compute many": an in-memory config plus a snapshot of tables, reservations and holds for a seeded 250-seat venue, with slots computed over 30 days plus a stranded list. (tracker: #7494)
  - Accept: a benchmark script reports p95 ≤1s over 50 runs, including the stranded list, with the numbers recorded in the Notes. On a miss, record it and route back to Architect (preview decision) before M4.
  - Blocked by: —

## Milestone 1: Engine, storage, migration (guests see identical slots)

- [x] **Engine package scaffold** — create `packages/availability` and port prior-art `civil-date.ts` and `instant.ts` with their tests. Add vitest, a typecheck config that covers the tests, and an entry in `regen-manifest.mjs` if llms files are generated. (tracker: #7495)
  - Accept: `pnpm --dir packages/availability test` and `typecheck` are green, and the DST table tests pass.
  - Blocked by: Preview spike
- [x] **Config schemas** — zod schemas and types in `@mbe/types` for Schedule, VenueService, ScheduleService, ScheduleAssignment and DateRule, plus the versioned payloads (seating, window, special-hours services, Tonight payload); `validateConfig` in the engine. (tracker: #7496)
  - Accept: unit tests reject overlapping services, last seating after close, two regular schedules, and an unknown payload version. Each issue carries a field path.
  - Blocked by: Engine package scaffold
- [x] **resolveDay: schedules and assignments** — the regular schedule, weekday assignments with date ranges and precedence, services that run past midnight, and service-day semantics (ADR-029), salvaging prior-art `resolve.ts` and `seatingRanges`. (tracker: #7497)
  - Accept: tests cover a past-midnight service on its start day, overlapping assignments with precedence, a range starting and ending, and a DST weekend.
  - Blocked by: Config schemas
- [x] **resolveDay: date rules and explanation** — DateRule kinds (special_hours, closure targeting venue, service or booking type, use_schedule, skip, tonight), `repeat`, open-ended rules, windows, and `explanation[]` with `removalResult`. (tracker: #7498)
  - Accept:
    - tests for each kind;
    - a skipped series date resolves as bookable;
    - a Tonight rule is ignored on any other service date;
    - each layer's `removalResult` equals `resolveDay` with that layer removed.
  - Blocked by: resolveDay: schedules and assignments
- [x] **listSlots and judge** — slot generation (interval or fixed), with table fit, conflict and pacing moved from `services/reservations/src/services/slot-rules.ts` into the engine, and the ok, soft or hard verdict. (tracker: #7499)
  - Accept: the existing `slot-rules` tests pass against the engine. A fast-check property test (new dev dependency) shows that over generated configurations no listed slot falls outside `resolveDay`, and that `judge` returns hard for every instant inside a closure. This covers SC Correctness, engine half.
  - Blocked by: resolveDay: date rules and explanation
- [x] **Availability schema migration** — Prisma models and migration for Schedule, VenueService, ScheduleService, ScheduleAssignment, DateRule, DateRuleTable, AvailabilityChange and ClosureOutcome, plus `Venue.availabilityVersion` and `hostEmergencyClose` and `Reservation.overrideReason` and `overrideLimits`. Each table gets ENABLE and FORCE RLS, a policy and grants, following the `20261022000000_add_floor_plan_sections` template. (tracker: #7500)
  - Accept: `rls-force-coverage` passes. The RLS route-sweep fixtures cover the new tables. The `migration-reviewer` subagent finds no destructive operations.
  - Blocked by: Config schemas
- [ ] **Snapshot loader** — `services/availability-snapshot.ts` loads config, tables, sections, and reservations and holds (±1 day) for a range in a fixed number of queries, parsing jsonb with zod on read. (tracker: #7501)
  - Accept: an integration test asserts the query count is independent of the range length. A row with an unknown payload version loads as closed, with a warning.
  - Blocked by: Availability schema migration, listSlots and judge
- [ ] **Legacy data migration and projection** — the prior-art normaliser (with an unknown-version guard) turns both legacy `operatingHours` shapes plus `slotIntervalMinutes` and `lastSeatingBuffer` into rows. The store writes the legacy column as a derived projection. The seed is rewritten to the new model, with `defaultReservationDuration` fixed. (tracker: #7502)
  - Accept: a golden test captures every seeded and fixture venue's slots for a fixed 60-day window before and after migration, identical across both legacy shapes. The seed venue offers bookable slots. This covers SC Migration.
  - Blocked by: Snapshot loader
- [ ] **Listing on the engine** — `generateTimeSlots` and `getAvailableDates` in `services/availability.ts`, and the public availability routes, compute through the snapshot loader and engine. The public response adds `closure` and `bookingPaused`. (tracker: #7503)
  - Accept: the golden test still passes, the existing availability route tests pass, and the response schema change is pinned in `@mbe/types`.
  - Blocked by: Legacy data migration and projection

## Milestone 2: Enforcement on every booking path

- [ ] **Booking gate** — `assert-bookable.ts` loads a one-day snapshot and calls `judge` on public hold create, hold confirm (re-check), staff create and update, and guest modify. Walk-ins are counted, never refused. Failures return 422 `outside-availability` and `soft-limit` ProblemDetails. (tracker: #7504)
  - Accept: API tests reject a booking outside the resolved availability on each path with the error envelope (SC Correctness, API half). A closure saved between hold and confirm makes confirm fail.
  - Blocked by: Listing on the engine
- [ ] **Staff override and check endpoint** — `override: {reason}` on staff create and update, persisted to `Reservation.overrideReason` and `overrideLimits`. Adds `POST …/availability/check`, the api-client method and a contract-test entry. (tracker: #7505)
  - Accept: a soft limit with no reason or a blank reason returns 422; with a reason it books, and the reason is stored and logged as a ReservationEvent. Inside a closure it is always 422, even with a reason. This covers SC Staff override, server half.
  - Blocked by: Booking gate
- [ ] **Service-day conflicts and timeline** — conflict and pacing queries read service days D−1 through D+1. Ports the prior art's after-midnight timeline layout (`reservationLayout.ts`, V5). (tracker: #7506)
  - Accept: tests show a 00:30 seating from Friday's late service conflicts correctly with Saturday's early seating, and renders on Friday's timeline.
  - Blocked by: Booking gate
- [ ] **Agent tools via availability endpoint** — `services/agent/src/routes/gen-agent-tools.ts` stops reading `operatingHours` and calls the public availability endpoint. A timeout or 5xx reports "couldn't check". (tracker: #7507)
  - Accept: tests cover a closed date (reports closed with the message) and a failing endpoint (reports unknown, never closed).
  - Blocked by: Listing on the engine

## Milestone 3: Roles and manage links (prerequisites for the UI and notices)

- [ ] **manageUrl builder** — `notifications/manage-url.ts` builds `${MANAGE_BASE_URL}/hospitality/reservations/manage?token=…` (with an optional `&rebook=`) and replaces the call sites in `email-content.ts:64` and `twilio-sms-adapter.ts:76`. (tracker: #7508)
  - Accept: tests assert that every outbound email and SMS manage link has the manage path. No other `MANAGE_BASE_URL` concatenation remains.
  - Blocked by: —
- [ ] **Venue roles** — `requireVenueRole("manager")` in `packages/auth/src/fastify/authz.ts`, with the membership lookup returning the role and admins bypassing. The venue PATCH and every availability config write require Manager. (tracker: #7509)
  - Accept: route tests show a staff member gets 403 on config writes and 200 on reads, an owner or manager gets 200, and an admin bypasses.
  - Blocked by: —
- [ ] **Team roles UI** — Settings → Team shows Manager or Host per member, plus the "Hosts can close in an emergency" toggle, with their endpoints and api-client methods. (tracker: #7510)
  - Accept: component and API tests cover a Manager changing a role and the grant, while a Host sees nothing to edit.
  - Blocked by: Venue roles

## Milestone 4: Manager configures time structure (Availability page)

- [ ] **Config API** — `GET` and `PUT …/availability/config` with an `expectedVersion` compare-and-set, an AvailabilityChange audit row with its inverse, and `scopeConflicts`. Adds `GET …/availability/days`, api-client methods and contract tests. (tracker: #7511)
  - Accept: tests cover a stale version (409 naming the winning change), invalid config (422 with issue paths), and a change that strands bookings without a decision (409 `stranded-bookings`).
  - Blocked by: Snapshot loader, Venue roles
- [ ] **Preview endpoint** — `POST …/availability/preview` built on `applyDraft` and `diffDays`, with a stranded list across every future date in scope, paged after 50, and a 5s timeout that returns 503 `preview-timeout`. (tracker: #7512)
  - Accept: a 30-day draft on the seeded 250-seat venue has p95 ≤1s including the stranded list (SC Preview speed). The stranded list includes bookings beyond the focus window.
  - Blocked by: Config API
- [ ] **Quick setup and onboarding** — the S1 card, onboarding hours step reuse (F-ONB), and the five entry points repointed from `/setup/hours`. (tracker: #7513)
  - Accept: component tests cover valid, invalid and server-error states. An E2E test sets up the bistro week from an empty venue, and the setup checklist marks availability as done.
  - Blocked by: Config API
- [ ] **AvailabilityCalendar and day drawer (read)** — an app-local month and week grid with per-day labels and closure bands, and a drawer showing the plain summary plus "Why this day" from `explanation`. Hosts get a view-only drawer (F-HOST). (tracker: #7514)
  - Accept: component tests render the layer stack and removal results, and the Host view shows no edit controls. The `e2e-selector-drift-reviewer` passes any E2E spec.
  - Blocked by: Config API
- [ ] **Drawer editing** — a scope select chosen before editing, the services editor, keep or replace for dates that already have their own changes, a save naming the result, a concurrency 409 dialog, a discard guard, and the draft dot. (tracker: #7515)
  - Accept: tests cover this date only, every Friday from a date, and everywhere a schedule is used. Each saves the right rows, and a conflicting save shows Review, Overwrite and Discard.
  - Blocked by: AvailabilityCalendar and day drawer (read)
- [ ] **Guest preview panel** — calls the preview endpoint with the debounced draft, showing added and removed marks, the summary line, the stranded list, and the slow-preview fallback. (tracker: #7516)
  - Accept: a component test covers updates on edit, keeping the last good result on 503, and a stranded list that spans the whole scope.
  - Blocked by: Preview endpoint, Drawer editing
- [ ] **Schedules, Compare and copy** — the Schedules tab (new, duplicate, edit, delete-when-unused), Change regular week (F-UW, including overlap precedence), Compare services (F-X), copy a day (F4), and the discovery nudge. (tracker: #7517)
  - Accept: tests cover a dated schedule reverting after its end date, overlap choices setting precedence, and a Compare edit saving every schedule with one impact line.
  - Blocked by: Drawer editing
- [ ] **Multi-select** — F-MS: drag, shift, cmd, weekday column, the Select… menu, touch long-press, and the selection bar opening the drawer with a fixed scope. (tracker: #7518)
  - Accept: component tests for each gesture, and the selection count is announced politely.
  - Blocked by: AvailabilityCalendar and day drawer (read)
- [ ] **History and undo** — `GET …/availability/changes` and revert, the History drawer (F12), the undo toast, and the F11 migration banner. (tracker: #7519)
  - Accept: reverting a change that told no guests restores the prior rows. A change with `notifiedGuests` returns 409 `guests-notified`.
  - Blocked by: Config API

## Milestone 5: Closures with affected guests (the demo)

- [ ] **Closure impact** — `POST …/closures/impact`: affected reservations grouped by date and kind, with covers, deposits held, and runs-into-closure flags. (tracker: #7520)
  - Accept: tests cover a whole-day, a shortened-service, a booking-only (no groups) and a multi-date closure, plus a booking that starts before the closure and runs into it.
  - Blocked by: Config API
- [ ] **Closure command** — `POST /closures` and `DELETE /closures/:id`. Writes the rule, the outcomes and the transitions (cancel through `cancelReservationWithDeposit` as staff, move, keep) in one transaction, with an `Idempotency-Key` and Host emergency limits. (tracker: #7521)
  - Accept: an invariant test confirms that after any saved closure no active reservation overlaps it unless the outcome is keep, with who and when recorded (SC Closure integrity, data half). A replayed key returns the first result. A Host without the grant gets 403.
  - Blocked by: Closure impact, Venue roles
- [ ] **Rebook offers** — `rebookOffers` in the engine: up to 3 open slots, same party size, within 14 days, nearest the original time of day. (tracker: #7522)
  - Accept: unit tests cover the 3-offer, fewer-offer and none cases (none falls back to a picker link). This covers SC Rebooking offer.
  - Blocked by: listSlots and judge
- [ ] **Closure notices** — a `CLOSURE_NOTICE` job, email and SMS templates (cancelled, moved, kept, reopened; SMS at most 3 segments), urgent dual-channel delivery within 6 hours, the contact policy, and delivery status on the outcome. (tracker: #7523)
  - Accept: tests show every guest the Manager chose to notify gets a job, delivered within 2 minutes in a time-advanced test, with SMS and email when urgent (SC Closure integrity, notice half). A failed delivery lands on the call list.
  - Blocked by: Closure command, Rebook offers, manageUrl builder
- [ ] **Closure refunds** — a `CLOSURE_REFUND` job through `DepositService` with the idempotency key `closure:<ruleId>:<reservationId>`, plus failure state and retry. (tracker: #7524)
  - Accept: refunds on venue-cancelled bookings are full, a retried job never double-refunds, and a failure shows as `refund=failed`. The `stripe-flow-reviewer` subagent passes.
  - Blocked by: Closure command
- [ ] **Close dialog** — F5 Step 1 (what, when, messages, live impact, conflicts) and Step 2 (a required choice per group, a keep-silently acknowledgement, the urgent header, a message preview, a button naming the outcome). Also handles pausing online booking until reopened, with a banner and header pill. (tracker: #7526)
  - Accept: an E2E test runs the PRD demo: close 24 December with 14 bookings, cancel and notify, and see the calendar band plus the outcome counts.
  - Blocked by: Closure command, AvailabilityCalendar and day drawer (read)
- [ ] **Special dates tab** — F6 list and filters, the add special date sheet (several rows, one Step 2), reopen with tell-cancelled-guests, Sent/Rebooked/Unreachable counts, refund retry, the printable call list, and F-SER series edits. (tracker: #7527)
  - Accept: tests cover reopening a closure (slots return, the opt-in notice is sent), skipping one date of a repeating closure, and a call list with only unconfirmed guests.
  - Blocked by: Close dialog, Closure notices
- [ ] **Manage page rebook** — the cancelled-by-venue state on `/reservations/manage`, with the refund status, up to 3 one-tap rebooks re-checked on tap, and "Other dates". (tracker: #7528)
  - Accept: tests cover a successful rebook, a taken slot refreshing the list, and no offers showing only the picker link.
  - Blocked by: Rebook offers, manageUrl builder

## Milestone 6: Tonight, staff and guest surfaces

- [ ] **Tonight API** — `POST` and `DELETE …/tonight`: Tonight DateRules (pause online, close early, stop window, table blocks through DateRuleTable, pacing) with a server-computed `expiresAt`. Close-early with bookings routes to the closure command. (tracker: #7529)
  - Accept: a clock-advance test shows every Tonight change gone at the service-day boundary, with schedules untouched (SC Night-of expiry). Blocked tables stop being offered on every booking path.
  - Blocked by: Booking gate, Closure command
- [ ] **Tonight panel** — the F7 popover or sheet, header chips, the emergency close (What and When locked for Hosts with the grant), and the footer link. (tracker: #7530)
  - Accept: component tests cover the Host with and without the grant and the Manager. 44 px targets on mobile.
  - Blocked by: Tonight API, Close dialog
- [ ] **Staff form live check** — `NewReservationDialog` calls the check endpoint, with soft-limit warnings, a required reason, "Book with override", hard blocks, an open-times strip, the waitlist-closed state, and blocked tables greyed out. Adds the Override tag on the timeline. (tracker: #7531)
  - Accept: tests show staff can book past a soft limit only with a reason, the reason is shown on the timeline, and staff can't book inside a closure (SC Staff override, UI half). If the check fails, the form falls back to the server.
  - Blocked by: Staff override and check endpoint, Tonight API
- [ ] **Widget and rialto date labels** — an optional `getDateLabel(iso)` on rialto `Calendar` (with a changeset). The widget date step moves to `Calendar` with closed dates disabled and labelled. The time step carries closure and pause messages. Adds the nothing-configured state, a closure landing mid-booking at confirm, and Late Night grouping. (tracker: #7532)
  - Accept: the widget E2E test shows a closed date's message and the paused state. A confirm after a closure shows alternatives. The `rialto-prop-drift-detector` passes. Size-limit stays within budget.
  - Blocked by: Listing on the engine, Booking gate, Rebook offers

## Design gaps found

None. If the spike misses its budget, that is a route back to Architect for the preview decision, recorded under Notes.

## Notes

- 2026-10-25, Preview spike (#7494): **pass, p95 190 ms against 1 s.**
  - Load: p95 84 ms (5 parallel queries through the venue-scoped `prisma`, RLS path).
  - Compute: p95 113 ms (30 days × current and draft slots, the diff, and a stranded scan over 14,319 future reservations).
  - Fixture: 70 tables (296 seats), about 157 bookings a night over 90 days, and 20 holds.
  - Run on a Mac with Postgres 15 in Docker on the same host. With no network hop, the load figure is optimistic.
  - The engine stays server-side as designed. Script and full numbers are on #7494; the durable p95 test is the Preview endpoint item.

- Tracker: tracking issue #7493; one issue per item, none labelled `ready` (2026-10-25).
- Phases 2–5 are separate future runs (Owner decision, 2026-10-25). The legacy `operatingHours` column is dropped in Phase 2's run.
- Verify activities, not items: the timed ≤5-minute bistro walkthrough (SC Setup time, small), and re-running every success criterion end to end.
