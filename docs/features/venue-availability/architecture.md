---
stage: architect
run: feature:venue-availability
date: 2026-10-25
assumptions:
  - Facts about main are as of `00257e1e4` (2026-10-25). The prior-art branch `feature/venue-hours-services` (`288ca75ad`, local only, 965 commits behind) was read with `git show`, not merged.
  - VenueRole maps to the PRD's actors as owner/manager → Manager and staff → Host. No new enum value is needed.
  - The preview-speed budget (p95 ≤1s, 30 days, 250 seats) is met by the "load once, compute many" engine below. Decompose makes the two-day spike the first Phase 1 item, and a miss there reopens the preview decision, not the model.
---

# Architecture: Venue availability configuration

## Approach

Availability becomes a **stack of layers stored as rows**: schedules (templates) and their services, weekday assignments with optional date ranges, date rules (special hours, closures, skips, Tonight changes), and later holidays, areas, policies and events. Each layer is its own row with a stable id, an author and a lifespan.

One pure engine, `@mbe/availability`, resolves the stack for a service day into a `ResolvedDay`: the services that run, their seating times, which booking types are open, and the explanation of every layer that contributed. Every path computes slots and judges bookability through it, given an in-memory snapshot: widget listing, hold create, staff create, guest modify, agent tools, the live preview, and closure rebooking offers.

The reservations service owns storage, the snapshot loader, enforcement and the closure command. The hospitality app renders the explanation it gets back and never re-derives rules.

Two shapes lost. One versioned JSON document per venue, the prior art, can't give shifts stable ids, express ranges, recurrence or booking-type closures, or let other tables reference a service. A fully normalised column per rule would need a migration for every new rule type.

## Components

### Availability engine: `packages/availability` (new, pure policy)

- Responsibility: given an `AvailabilitySnapshot` and a request, decide what is bookable and why. It owns:
  - layer precedence;
  - service-day maths for services that run past midnight;
  - the DST-safe local↔instant conversion;
  - slot generation (interval or fixed seating times);
  - table fit, conflict and pacing (moved here from `slot-rules.ts`);
  - soft vs hard limits;
  - the "Why this day" explanation;
  - rebooking-offer selection (up to 3 times, same party size, within 14 days, nearest the original time of day).
- Collaborators: none at runtime. It imports only `@mbe/types` and has no Prisma, Fastify, clock or network dependencies. The current time comes in as an argument.
- Salvaged from prior art:
  - `civil-date.ts` and `instant.ts` as they are;
  - `resolve.ts`, `seatingRanges` and `conflictDateFilter`, reworked from "one override per date" to the layer stack;
  - `validate.ts`, reworked to validate services;
  - `normalize.ts`, which becomes the migration reader for both legacy shapes and gains a guard for unknown versions;
  - `checkServiceHours`, absorbed into `judge`.
- Phases 2–5 add layer kinds here, each with its own resolver: holidays, area/table inventory, policies, events.

### Availability store (reservations service, `services/availability-config.ts`)

- Responsibility: read and write the configuration rows inside a venue's RLS scope. On every committed change it:
  - bumps `Venue.availabilityVersion`;
  - writes the `AvailabilityChange` audit row with its inverse;
  - refuses a write whose `expectedVersion` is stale.
    It also owns undo, which applies the stored inverse only when no guest was told.
- Collaborators: Prisma inside `runWithVenueContext`, and the engine (validates every write with `validateConfig` before commit).

### Snapshot loader (reservations service, `services/availability-snapshot.ts`)

- Responsibility: build an `AvailabilitySnapshot` for a venue and a service-date range in a fixed number of queries, one batch each:
  - configuration rows;
  - active tables and sections;
  - non-cancelled reservations and live holds for the range with a ±1 day margin;
  - the venue's timezone and settings.
    The loader replaces the per-date queries in today's `availability.ts`. Overlaying an unsaved draft onto a snapshot is a pure function in the engine.
- Collaborators: Prisma (read-only), the engine's snapshot type.

### Booking gate (reservations service: `assert-bookable.ts`, extended)

- Responsibility: the single server-side check every booking write passes, inside the existing transaction and advisory lock:
  - public hold create;
  - hold confirm (re-check, so a closure saved after the hold was created wins);
  - staff create and update;
  - walk-ins (counted, never refused for hours);
  - guest modify;
  - the agent's booking tools, through the same routes.
    It loads a one-day snapshot, calls `judge`, and maps the verdict:
  - hard → 422 ProblemDetails `outside-availability` with the reason;
  - soft → 422 `soft-limit` unless the request carries an `override.reason` from a staff caller;
  - ok → proceed.
- Collaborators: the snapshot loader, the engine, `bookSlot`, and the transitions.

### Closure command (reservations service, `services/closure-command.ts`)

- Responsibility: save a closure, a shortened service, or a Tonight close-early together with the Manager's choice for each affected group, atomically. One database transaction:
  - writes the date rule;
  - writes one `ClosureOutcome` per affected reservation;
  - applies the reservation transitions: cancel (staff-initiated, so the existing `cancelReservationWithDeposit` refunds in full) or move;
  - writes the audit row (`notifiedGuests = true` unless every group chose keep-silently).
    After commit it enqueues one `CLOSURE_NOTICE` job per outcome and one `CLOSURE_REFUND` job per held deposit. The **affected-set preview** (counts, covers, deposits, the "runs into closure" flags, groups by date and kind) is the same query, run read-only.
- Collaborators: the store, the snapshot loader, the engine (rebooking offers), the transitions and plan, BullMQ jobs, Stripe through `DepositService`.

### Closure notifications (reservations service: `jobs/` plus `notifications/`)

- Responsibility: render and deliver the closure email and SMS, in variants cancelled, moved, kept-and-notified and reopened. It routes a notice by urgency:
  - the closure starts within 6 hours → SMS and email wherever the guest has them, subject to `contact-policy.ts`;
  - otherwise → the guest's preferred channel.
    Each job records delivery status on its `ClosureOutcome`. That status feeds the Sent / Rebooked / Unreachable counts and the call list. Rebooking offers are computed when the job runs, so the offered times are still open when the message goes out.
- Collaborators: the `NotificationDispatcher` (Resend, Twilio), the engine plus the snapshot loader, and `manageUrl()`.

### Manage-link builder (reservations service, `notifications/manage-url.ts`)

- Responsibility: the only place a guest manage URL is built: `${MANAGE_BASE_URL}/hospitality/reservations/manage?token=…`, plus `&rebook=<slot>` for one-tap rebooking. It replaces the three hand-built call sites (`email-content.ts:64`, `twilio-sms-adapter.ts:76`, and the rebook links). This fixes the live defect.
- Collaborators: `generateManageToken`.

### Venue roles (`@mbe/auth` plus reservations routes)

- Responsibility: `requireVenueRole("manager")`, beside `requireVenueAccess`. The membership lookup now returns the role instead of a count; admins bypass as today. Configuration writes need Manager. Hosts get:
  - Tonight writes;
  - an emergency whole-venue close for tonight only, when `Venue.hostEmergencyClose` is on;
  - reads.
    Settings → Team writes `VenueMembership.role` and the grant.
- Collaborators: `venueScoped`, `services/venue-membership.ts`.

### Availability API (reservations routes plus `@mbe/api-client`)

- Responsibility: humble adapters only. They translate HTTP to the store, snapshot loader, engine, closure command and gate, and hold no rules of their own. Endpoints are listed under Interfaces.
- Collaborators: everything above; `contract.test.ts` pins client ↔ route.

### Hospitality surfaces (`apps/hospitality`)

- **Availability page:** Calendar month/week, Special dates, Schedules, Compare, History.
- **Day drawer:** renders the engine's `explanation`.
- **Guest preview panel:** calls the preview endpoint with the draft.
- **Close dialog**, the **Tonight panel**, and the **Team roles** card.
- **Staff form live check:** calls the check endpoint.
- **Widget:** the date step moves to rialto `Calendar`; the time step shows closure and pause messages.
- **Manage page:** adds the cancelled-by-venue state and one-tap rebooking.
- The month/week grid with per-day content and multi-select is an **app-local** `AvailabilityCalendar`. rialto `Calendar` gains only an optional `getDateLabel(iso)` for the widget's accessible "closed, private event" names, with a changeset.
- Ported from prior art: the after-midnight timeline layout (`reservationLayout.ts`, V5) and the Late Night grouping in the widget.

### Agent tools (`services/agent`)

- Responsibility: stop reading `operatingHours` directly (`gen-agent-tools.ts:97-104`). The agent asks the public availability endpoint, which already carries closures and messages. The call uses the existing api-client timeout. On a timeout or 5xx, the tool tells the model availability is unknown ("couldn't check"), never "closed". Retrying is safe because the call is a read.

## Data model

Access patterns decide the shape. The hot reads are:

- (a) one service day for one venue, on every booking write and every widget listing;
- (b) a 30–60-day range for one venue, for the preview, the calendar, the date picker and rebooking offers;
- (c) every future reservation in an edit's scope, for the stranded list.

Writes are rare and human-paced. Every table below is venue-scoped with `venue_id`, `ENABLE` and `FORCE` RLS, and the standard policy and grants (ADR-026), all in the `services/reservations` schema. Times are minutes from the service day's midnight in venue-local time. `closesAt` may exceed 1440 for a service that runs past midnight.

```
Schedule            id, venueId, name, kind(regular|alternate|holiday), isRegular bool,
                    archivedAt?, createdAt, updatedAt
                    -- exactly one isRegular per venue (partial unique index)

VenueService        id, venueId, name, position int, archivedAt?
                    -- the venue-wide identity of "Dinner": closures, Compare,
                    -- policies (P4) and events (P5) reference this, never a name

ScheduleService     id, scheduleId, venueServiceId, opensAt int, lastSeatingAt int, closesAt int,
                    seating jsonb   -- {interval:15} | {fixed:[1080,1245]}
                    bookingTypes text[]  -- ⊆ {online, phone}; [] = walk-in only
                    rules jsonb     -- versioned, zod-typed value bundle, default {}
                                    -- (P3 turn times, pacing, party limits, windows)
                                    -- P3 areas → ServiceArea rows; P4 policyId → FK column

ScheduleAssignment  id, scheduleId, weekdays int[] (0=Sun), startsOn date?, endsOn date?,
                    precedence int   -- larger wins on overlap ("Summer wins")

DateRule            id, venueId, kind(special_hours|closure|use_schedule|skip|tonight),
                    targetKind(venue|service|booking|tables|area(P3)),
                    venueServiceId? (FK), sectionId? (FK, P3),
                    bookingTypes text[]?  -- ⊆ {online, phone, waitlist}
                    DateRuleTable(dateRuleId, tableId)  -- FK join rows for tables
                    startsOn date, endsOn date?,  -- null endsOn = "until I reopen"
                    repeat jsonb?    -- {weekdays:[..]} within [startsOn, endsOn]
                    window jsonb?    -- {from:int, to:int} minutes; null = whole service day
                    payload jsonb    -- special_hours: services[]; tonight: {pacing|closeAt|stop:{from,to}}
                    useScheduleId? (FK, kind=use_schedule)
                    seriesId?        -- skip/edit-one-date rows point at their series
                    source(manual|holiday|tonight), holidayKey?, bookingOpensAt? (P2)
                    guestMessage varchar(200)?, staffNote?, expiresAt timestamptz? (tonight)
                    createdBy, createdAt, deletedAt?

AvailabilityChange  id, venueId, actorId, at, kind, summary text, affectedDates daterange,
                    inverse jsonb (rows to restore/delete), notifiedGuests bool,
                    revertedBy?          -- audit + undo; append-only grant

ClosureOutcome      id, venueId, dateRuleId, reservationId, action(cancel|move|keep_notify|
                    keep_silent), movedTo timestamptz?, deliveries jsonb
                    ({email:sent|failed|skipped, sms:…}), refund(none|pending|done|failed),
                    rebookedReservationId?, acknowledgedBy? (keep_silent)

Venue               + availabilityVersion int, + hostEmergencyClose bool,
                      + availabilityPaused? (derived from an open-ended online DateRule; no column)
Reservation         + overrideReason text?, + overrideLimits text[]?
                    date ≡ service day (ADR-029)
VenueMembership     role now read (owner|manager → Manager, staff → Host)
```

**What goes in a column and what goes in jsonb.** A field that references another row is a column with a foreign key: services, sections, tables, schedules, policies, events. A field that is a pure bundle of values is versioned jsonb: seating, turn times, pacing, window, the Tonight payload. So deleting a table or renaming a service can never leave a dangling reference inside a blob. Every jsonb field is **parsed with its zod schema on read**, in the snapshot loader, not cast. (`floor-plan.ts:52` casts `layoutJson` today, and the PRD calls that pattern out as the cautionary one.) An unknown version resolves as closed, with a warning.

**Invariants and their owners:**

- **The engine** owns everything the layers must satisfy together, because it is the only place they meet:
  - services in one schedule don't overlap;
  - last seating ≤ close;
  - one regular schedule;
  - precedence is total on overlapping assignments.
    The store calls `validateConfig` before commit.
- **`ClosureOutcome`** owns "no active reservation overlaps a saved closure unless the Manager chose keep". The closure command writes an outcome for every overlapping reservation in the same transaction as the rule, and a database check in the integration test asserts the success criterion.
- **Tonight rows** set `expiresAt` to the venue's service-day boundary at write time. The engine ignores a Tonight rule whose service date isn't the requested one, so expiry is exact without a cron. A nightly cleanup only soft-deletes old rows.

**Consistency per interaction:**

| Interaction        | Requirement                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config save        | Linearizable per venue: `availabilityVersion` compare-and-set in the write transaction. On a mismatch → 409 carrying the change that won.                                              |
| Booking gate       | Reads the committed config inside the booking transaction (READ COMMITTED). A closure saved concurrently with a hold is caught by the re-check at confirm.                             |
| Closure            | The rule, the outcomes and the cancellations are atomic. Notices and refunds settle within 2 minutes through retried jobs with idempotency keys of `closure:<ruleId>:<reservationId>`. |
| Preview / calendar | Snapshot reads with no lock; may be one save stale.                                                                                                                                    |

**Migration (Phase 1):**

- A data migration reads each venue's `operatingHours` with the salvaged normaliser, which handles both legacy shapes. It writes one `Schedule(isRegular)` plus one assignment for all weekdays.
- It copies `slotIntervalMinutes` and `lastSeatingBuffer` into each service: `lastSeatingAt = closesAt − buffer`.
- The legacy column stays, written as a **derived projection** of the regular week (first open, last close per weekday) for one phase so old bundles keep working, then dropped in Phase 2.
- The seed is rewritten to the new model, and fixes the `defaultDurationMinutes` key.

## Interfaces & contracts

### Engine (`@mbe/availability`)

- **`resolveDay(snapshot, serviceDate, now)`**
  - Input: a snapshot, a service date (YYYY-MM-DD) and the current instant.
  - Output: `ResolvedDay { serviceDate, services: ResolvedService[], closures, bookingOpen: {online, phone, waitlist}, guestMessage?, explanation: Layer[] }`.
  - Each `Layer` has `{kind, id, label, effect, removalResult}`. `removalResult` is computed by re-resolving without that layer.
  - Failure modes: none at runtime, because configuration is validated on write. An unknown `rules` version resolves the service as closed and flags `explanation[].warning`. It never throws.
- **`listSlots(snapshot, serviceDate, partySize, channel, now) → Slot[]`**
  - Each `Slot` has `{start: instant, serviceId, tables, available, reason?}`.
  - DST: a nonexistent local time is skipped, and an ambiguous time maps to its first occurrence.
- **`judge(snapshot, request, now) → Verdict`**
  - Input: `{start, partySize, channel, tableId?, override?}`.
  - Output: `ok | soft{limits: (after_last_seating|pacing|party_size|…)[]} | hard{reason: closed|booking_closed|outside_service|table_blocked|conflict, message?}`.
  - Closures are always hard. A `soft` verdict with `override.reason` (non-empty, staff channel) becomes `ok-with-override`.
- **`applyDraft(snapshot, draft) → snapshot`** and **`diffDays(before, after, dates) → {added, removed}`**: pure functions that serve the preview.
- **`rebookOffers(snapshot, reservation, now) → Slot[≤3]`**
- **`validateConfig(config) → Issue[]`**: path-addressed issues the UI maps to fields.

### Reservations HTTP

These follow ADR-008 ProblemDetails, `venueScoped`, and zod in `@mbe/types`.

- **`GET /api/v1/venues/:venueId/availability/config`**
  - Output: schedules, services, assignments, date rules and `version`.
  - Access: any member.
- **`PUT /api/v1/venues/:venueId/availability/config`** (body `{expectedVersion, changes, scopeConflicts: keep|replace}`)
  - Output: `{version, changeId}`.
  - Errors:
    - 409 `version-conflict` with the winning `AvailabilityChange`;
    - 422 `invalid-config` with issues;
    - 409 `stranded-bookings` when the change would affect reservations and no decision was supplied (the client must route through the closure path);
    - 403 for a non-Manager.
  - Retry: safe with the same `expectedVersion`, because a retry after success gets 409 naming its own change.
- **`POST …/availability/preview`** (body `{draft, scope: dates[] | range, focusDate}`)
  - Output: per-date `{added, removed}` times for the focus window, `ResolvedDay` for the focus date, and the **stranded list** over every future date in scope (paged after 50).
  - Read-only, safe to retry. Budget: p95 ≤1s for 30 days; the server times out at 5s with 503 `preview-timeout`. The UI keeps the last good preview and shows "Preview is taking longer than usual".
- **`GET …/availability/days?from&to`**
  - Output: `ResolvedDay` summaries (label, closure bands, service count) for the calendar.
  - Read-only.
- **`POST …/closures/impact`** and **`POST …/closures`**
  - Body: `{rule, decisions: [{groupKey, action, acknowledged?}]}`.
  - Output: `{ruleId, outcomes: counts}`.
  - Errors: 422 `decision-required` when a group lacks a choice; 409 `version-conflict`.
  - Retry: the client sends an `Idempotency-Key`; a replay returns the first result.
  - Host callers are limited to target `{venue}` with tonight's date, and only when the grant is on; otherwise 403.
- **`DELETE …/closures/:ruleId`** (body `{tellCancelledGuests: bool}`): reopens.
- **`POST …/tonight`** and **`DELETE …/tonight/:ruleId`**: Host or Manager. They are the same date-rule writes, with kind `tonight` and an expiry the server computes.
- **`POST …/availability/check`** (body `{start, partySize, channel:"phone", tableId?}`)
  - Output: the `judge` verdict with human messages.
  - Used by the staff form; a failure falls back to the server gate on submit.
- **`GET …/availability/changes`** and **`POST …/availability/changes/:id/revert`**
  - History and undo.
  - Revert answers 409 `guests-notified` when `notifiedGuests` is set.
- **Existing write routes** (holds, confirm, staff reservations, modify) gain the booking-gate verdicts:
  - 422 `outside-availability {reason, message}`;
  - 422 `soft-limit {limits}`.
    Staff create and update accept `override: {reason}`.
- **The public availability routes** keep their shape. They add `closure: {message}` per date and `bookingPaused: {message, phone?}`, and they are computed by the engine. `getAvailableDates` stays capped at 60 days.

### Jobs

- **`CLOSURE_NOTICE {outcomeId}`**
  - Renders by action and urgency, sends, and records each delivery.
  - Retries: 3 attempts with exponential backoff, the same as existing jobs. The idempotency key per channel prevents a double send.
  - After the final failure the outcome reads `failed` and joins the call list.
- **`CLOSURE_REFUND {outcomeId}`**
  - Calls `DepositService` refund with the Stripe idempotency key `closure:<ruleId>:<reservationId>`.
  - On failure → `refund=failed`, surfaced as "Refund failed · Retry", which re-enqueues the job.

## Stack & dependencies

- **No new runtime dependencies.** Date maths stays on `Intl` (prior-art `instant.ts`), matching the rest of the repo. A large date library would spread its types through every signature.
- **The new pure package `packages/availability`** has its own vitest suite and a fast-check property test (fast-check, new, dev-only) for the Correctness criterion.
- **Postgres via Prisma**, with migrations in `services/reservations/prisma`. `jsonb` holds only per-kind payloads, each validated by a zod schema in `@mbe/types` and carrying a version field.
- **BullMQ** for closure jobs (ADR-019); there is no new queue.
- **Stripe, Resend and Twilio** behind the existing adapters.

## Decisions & alternatives

- **Layers as rows; references are foreign keys, value bundles are versioned jsonb parsed on read**, over one versioned JSON document (the prior art) and over a fully normalised column per rule.
  - A single document can't hold stable service ids, ranges, recurrence, authorship or expiry, and it serialises every edit through one lock.
  - Full normalisation forces a migration for every Phase 3–5 rule.
  - (ADR-030)
- **The engine is a pure package with snapshot input**, over keeping rules in `availability.ts` and loading data per date.
  - One `judge` serves seven paths. The property test needs no database.
  - The preview needs "load once, compute many".
- **A reservation's `date` is its service day**, over the calendar date of `startTime` and over a new `serviceDate` column.
  - This is the prior art's ADR-027 decision, renumbered (ADR-029).
- **The preview runs on the server**, over running the engine in the browser.
  - The stranded list needs every future booking in scope, which the browser must not download.
  - One code path also means the preview can never disagree with enforcement. Browser execution stays possible later because the engine is pure.
- **Tonight expiry is computed at read time** from the service date, over a cron that deletes expired rows. A cron can be late. Reading by service date is exact by construction, which is what the clock-advance test asserts.
- **Undo is an inverse stored on an audit row**, over event-sourcing the configuration. Undo only ever reverts the last change that told no guest, and events would be a second source of truth for a rarely used feature.
- **Concurrency is a per-venue version counter**, over per-row versions. Saves are rare and human-paced, and one counter lets the 409 name exactly the change that won.
- **Closure notices go through BullMQ jobs**, over sending inline in the request.
  - The 2-minute SLA and retries matter more than latency.
  - Inline sending would fail the save on a provider outage.
- **The legacy `operatingHours` column becomes a derived projection for one phase**, over a hard cutover. Old app bundles and the agent's direct read keep working while consumers move.
- **`manageUrl()` builds every manage link with the path**, over changing `MANAGE_BASE_URL` in Pulumi. Fixing the link in code keeps the variable meaning "site origin", which other links already assume.
- **The month/week grid is app-local**, over a new rialto component. It has one consumer and is still settling. rialto gets only the small `getDateLabel` prop, with a changeset.
- **Roles reuse `VenueRole`**, over a new Host enum value. owner/manager/staff already map onto Manager/Host, and the migration is zero rows.

## ADRs

- [ADR-029: A Reservation's Date Is Its Service Day](../../adr/ADR-029-reservation-date-is-service-day.md)
- [ADR-030: Venue Availability as Layered Rows with Typed Payloads, Resolved by One Pure Engine](../../adr/ADR-030-availability-layered-rows-pure-engine.md)

## Requirement traceability

| PRD stories    | Components                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–5, 31–32     | Engine (`resolveDay`, `listSlots`), `ScheduleService`                                                                                                                                                                                                           |
| 6–13           | Store, `Schedule`, `ScheduleAssignment`, `DateRule(use_schedule)`                                                                                                                                                                                               |
| 14, 29         | `GET days`, preview endpoint, `AvailabilityCalendar`, guest preview panel                                                                                                                                                                                       |
| 15–19, 25      | `DateRule(closure/special_hours, repeat, booking target, open-ended)`, closure command                                                                                                                                                                          |
| 20             | `DateRule.guestMessage` and `staffNote`                                                                                                                                                                                                                         |
| 21–24          | Closure impact/command, `ClosureOutcome`, closure notifications, `manageUrl`, rebooking offers                                                                                                                                                                  |
| 26–28          | `DateRule(tonight)`, `requireVenueRole`, `hostEmergencyClose`                                                                                                                                                                                                   |
| 30             | `judge` soft/hard, `override` on staff create, `Reservation.overrideReason`, check endpoint                                                                                                                                                                     |
| 33             | Booking gate on every write path, agent tools via the routes                                                                                                                                                                                                    |
| 34             | Migration, normaliser, legacy projection                                                                                                                                                                                                                        |
| 35             | `AvailabilityChange`                                                                                                                                                                                                                                            |
| 36–44 (P2)     | Engine holiday layer (region rules as data), `DateRule.source=holiday`, `bookingOpensAt`                                                                                                                                                                        |
| 45–58, 78 (P3) | `ScheduleService.rules` v2 (turn times, pacing, party limits, windows), `ServiceArea` rows (sectionId, booking type, holdback, seasonal range), `DateRule` target `{area}` and `{tables}`                                                                       |
| 59–65 (P4)     | `Policy` rows; `policyId` on services, rules and party-size thresholds; `Reservation.policySnapshot` at booking; `@mbe/cancellation-policy` reads policies instead of Venue columns                                                                             |
| 66–77 (P5)     | `Event`, `EventShowing`, `TicketType` rows; an engine event layer (alongside or replacing service); private spaces on `FloorPlanSection`; buyouts as `DateRule(closure, target area/venue)` through the closure command; tentative holds as expiring `DateRule` |
