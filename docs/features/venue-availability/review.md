---
stage: review
run: feature:venue-availability
date: 2026-10-26
assumptions:
  - The review covers what the run changed, `f352aa4e4~1..daaf17f82` on main, which spans every PR merged for #7493 (#7541 through #7669, cross-checked against verification.md's item→PR table and the later fixes #7643, #7648, #7654, #7656, #7657, #7659–#7661, #7663–#7666, #7669). The base is the commit before #7536, the first run commit.
  - Three read-only reviewer subagents covered slices of the integrated change: `stripe-flow-reviewer` for the closure money paths, `reviewer` for the engine and every booking path, and `reviewer` for the closure, Tonight, config, history and notice write side plus the hospitality UI that drives it. Each finding below was re-read in the code before it was recorded. The security, authz, RLS, migration, dependency, ADR and complexity passes were run directly.
  - The domain passes were selected from the changed paths (domain-reviewers.md). Payments matched (`closure-refund*`, `deposit.ts`, `stripe.ts`), and so did Migrations (`prisma/migrations/20261025000000_add_venue_availability`, `schema.prisma`) and Dependencies (`package.json` files).
  - "docs/standards.json" (the plugin's) has no statement in a domain this diff touches (factory, pipeline, docs, eval), so no finding cites a standard.
  - The skill offers no default for deferring a major finding, and the brief gives none. Every major finding is therefore filed and left open for the Owner to fix or defer at Ship, not deferred here. Minor findings are deferred to their filed issues, as the skill allows.
  - Items already in flight or filed were excluded as duplicates. They are the locale-sweep E2E fix, #7644 (notice urgency), #7636, #7624, #7631, #7635, #7626, #7625, #7634, #7630, #7627, #7619 and #7591.
---

# Review: Venue availability configuration, Phase 1

## Scope

The integrated diff of the run, `git diff f352aa4e4~1 origin/main` at `daaf17f82`: 304 non-test files and about +31k/−2.8k lines across `packages/availability` (new engine), `packages/types`, `packages/api-client`, `packages/auth` (`requireVenueRole`), `services/reservations` (migration, snapshot loader, booking gate, config store, preview, closure impact/command, notices, refunds, Tonight, history/undo, manage rebook, team roles, backfill), `services/agent` (tools via the public endpoint), and `apps/hospitality` (Availability page, Close dialog, Tonight panel, Special dates, staff form live check, widget, manage page). Each per-item PR had its own `reviewer` pass, and payment PRs also had a `stripe-flow-reviewer` pass, at merge. This review looked for what only shows when the pieces compose.

**No critical findings.** Six major findings are open (R1–R6). R2 allows a public double-booking, but the bug class predates this run. R4 can break the Closure-integrity invariant under a race. R3 can tell a guest their booking was moved to a time that has already passed.

## Findings

### Major: R1 — the gate accepts start times listing never offers (#7676)

- Scenario: `packages/availability/src/slots.ts:272-297`. `judge` checks only that the minute falls inside a service, at or before last seating. It never checks that the minute is a seating. Take Dinner 18:00–23:00 with `seating {fixed:[1080,1245]}`, pacing 4 covers per 15 minutes, and a 4-cover booking at 18:00. Listing offers 18:00 (pacing full) and 20:45. `judge` says `ok` at 19:30, and at 18:01 too, because the pacing window `[start,start+15)` skips 18:00. A hand-built `POST /public/v1/venues/:slug/holds` at 19:30 succeeds and confirms. The property test asserts only listed ⇒ judgeable, not the reverse. The subagent reproduced this against the built engine.
- Standard: none
- Decision: open, filed #7676 (Owner to fix or defer at Ship).

### Major: R2 — the client-sent `date` is never checked against the service day, which allows a public double-booking (#7677)

- Scenario: `services/reservations/src/services/hold.ts:52,92,139,152` takes `date` and `time` from the body independently, and `confirm-hold.ts:133,153` and `reservation.ts:365,373` store that `date`. Every conflict read (`availability-snapshot.ts:395,399`, `book-slot.ts:153-177`, `fetchConflictData`) filters on stored `date` ±1. Guest A holds `{date:"2026-11-20", time:"2026-11-13T03:00Z"}` (19:00 PT on Nov 12). The gate judges Nov 12 as ok, and the hold is stored with Nov 20. Guest B then lists Nov 12, sees T1 free and books it: two CONFIRMED reservations on T1 at the same instant. `date:"x"` gives a 500. The bug class predates the run, but the gate this run added does not close it, and it contradicts ADR-029's "the engine assigns the service day".
- Standard: none
- Decision: open, filed #7677.

### Major: R3 — a closure Move can target a past time or the closed window (#7678)

- Scenario: `services/reservations/src/services/closure-command-plan.ts:83-102` (`moveTarget`) clamps to opens, last seating and close only, with no `now` and no closure bands, and `closure-apply.ts:133-156` checks only table clashes. Suppose at 19:45 a Tonight close-early sets 21:00 and a 20:00–22:00 booking is moved. It gets 19:00–21:00, in the past, and the guest is told "moved to 7:00". Or take a 22:00–23:00 windowed closure with a 90-minute duration: a 22:15 booking moves to 21:30–23:00, straight through the closure. Move is offered for every `shortened` group (`close-draft.ts:132`).
- Standard: none
- Decision: open, filed #7678.

### Major: R4 — a booking racing a closure lands under it with no outcome (#7679)

- Scenario: `services/reservations/src/services/assert-bookable.ts:202-216` reads config at READ COMMITTED under only the per-table advisory lock. `closure-command.ts:347-361` takes the venue-row CAS and then scans reservations. The interleaving: T2's gate sees no closure; T1's impact scan cannot see T2's uncommitted insert; T2 commits; T1 commits. The result is an active booking under a saved closure with no `ClosureOutcome`, no notice and no call-list entry. That breaks architecture.md's Closure invariant, and "re-check at confirm" doesn't help, because the confirm is T2. `commitSave`'s stranded check shares the race.
- Standard: none
- Decision: open, filed #7679. Fix: `FOR SHARE` on the venue row in `judgeBooking`.

### Major: R5 — a phone-only guest's rebook errors after committing and breaks their manage page (#7680)

- Scenario: the notice signs phone-only tokens with `""` (`closure-notice-runtime.ts:23-27`). `routes/manage-rebook.ts:60` answers `manageToken: undefined` when `guestEmail` is null, while `packages/api-client/src/reservations.ts:284` requires a string. So `rebookManaged` throws `ApiValidationError` after the rebook committed, and a retry gets 409. `routes/manage-reservation.ts:26-38` then returns `rebooked` without a token, `reservations.ts:125` rejects the payload, and the manage page fails to load.
- Standard: none
- Decision: open, filed #7680. The fix is small: sign with `guestEmail ?? ""` in both routes.

### Major: R6 — no sweeper for closure refunds or notices lost after commit (#7681)

- Scenario: `services/reservations/src/routes/closure-post-commit.ts:20-35` only logs an enqueue failure. Nothing re-enqueues an outcome left `refund = pending` or never notified. Any of these strands it: a crash between commit and enqueue, Redis down at commit, a stalled job, or an old replica rejecting the unknown job type during a rolling deploy. A held authorization then stays on the guest's card for about 7 days, or a captured deposit stays charged until a Manager presses Retry. A cancelled guest is never told unless someone works the call list. This decays architecture.md's "settle within 2 minutes through retried jobs".
- Standard: none
- Decision: open, filed #7681.

### Minor: R7 — payments: closure refund job edge cases (#7682)

- Scenario: `services/reservations/src/services/closure-refund.ts:189` trusts a `refunded` deposit, so a crash between the DB write and `cancelPaymentIntent` leaves the authorization live. `:191-194` loops a dashboard-captured `held` deposit to `failed` on every Retry. `jobs/job-types.ts:3-6` allows 3 attempts at 1 s/2 s, which is too short for a Stripe blip. There are also two suspicions, with what would settle each: `applied`/`forfeited` deposits get `refund:"none"` at commit (`closure-command.ts:228`), and `${id}:closureRefund` might be blocked for 24 h by one over-amount 400. No double refund was found: the keys are stable across retries, the manual Retry, close-early, and reopen-then-close.
- Standard: none
- Decision: deferred to #7682 (minor; each is recoverable by hand from the Special dates tab).

### Minor: R8 — booking-gate gaps on staff and guest paths (#7683)

- Scenario: `reservation.ts:649-658`: a staff PATCH `{partySize:12}` with `maxPartySize 8` passes with no override reason and no recorded limits. `reservation.ts:719-727`: a booking kept on a closed date cannot be moved to another table (422 `closed`, with no override). `manage-rebook.ts:42-67`: rebook offers ignore `minAdvanceHours`/`maxAdvanceDays`, so a tapped offer fails as `slot-taken`.
- Standard: none
- Decision: deferred to #7683.

### Minor: R9 — the agent tools check and book on different channels and hide gate refusals (#7684)

- Scenario: `services/agent/src/routes/gen-agent-tools.ts:226,377-390`. `check_availability` lists the online channel and `create_reservation` is judged as phone, so a phone-only service shows no times yet would book. A 422 `outside-availability` is reported as "please try again", and a 400 is reported as "couldn't check".
- Standard: none
- Decision: deferred to #7684.

### Minor: R10 — closure decisions drift from the preview, and bookings already started are skipped (#7685)

- Scenario: `closure-command.ts:217-231` applies a group's decision to whatever is in the group at commit. If Step 2 said "Cancel 14" and a guest booked meanwhile, 15 are cancelled and notified. `closure-impact-store.ts:75` (`startTime >= now`) leaves a 19:00 late arrival untouched by a 19:05 emergency close. There is also a suspicion: reopening a series leaves its one-date edits and skips in force (`closure-command.ts:575-578`).
- Standard: none
- Decision: deferred to #7685.

### Minor: R11 — the Close and Tonight UIs hide the winning change and loop on a lost response (#7686)

- Scenario: `CloseDialog.tsx:107-114` and `TonightControl.tsx:213` never render the 409's `winningChange`, which architecture.md's contract promises. `TonightControl.tsx:206` keeps the attempt id until success. A close-early whose response was lost, re-applied with a new `closeAt`, then gets `rule_exists` 409 until a reload.
- Standard: none
- Decision: deferred to #7686.

### Minor: R12 — security/authz: a Host without the grant can close the night (#7687)

- Scenario: `closure-command.ts:137-146` with `closure-command-plan.ts:129-143`. `closesAllOfTonight` blocks only a `closeAt` at or before every service's opening, and returns false for any other payload. On a venue with `hostEmergencyClose=false` and Dinner opening at 17:00, a Host's close-early `closeAt: 17:15` with cancel decisions cancels every later booking. A `stop` window of 17:00–23:00 stops all booking. Either one is the full closure the PRD gates behind the Manager's grant. It is ranked minor because a Host is authenticated venue staff and the action is audited.
- Standard: none
- Decision: deferred to #7687.

### Minor: R13 — complexity (reuse): duplicate conflict and pacing rules (#7688)

- Scenario: `services/reservations/src/services/slot-rules.ts:225-331` keeps `checkTableConflict`, `checkPacingForSlot`, `selectBestTable`, `overlapWindow` and `activeHoldWindow` beside the engine's `packages/availability/src/slot-rules.ts:88-175`. Its callers are `assert-bookable.ts:100,111`, `book-slot.ts:211`, `availability.ts:130,215,228` and `waitlist-estimate.ts`. The service copy reads the clock itself and has no Tonight `coverCap`, and hold create and confirm judge pacing twice through two implementations. This decays architecture.md's "moved here from `slot-rules.ts`". Replacement: re-export the engine's functions, which cuts about 110 lines.
- Standard: none
- Decision: deferred to #7688.

### Suspicions (not counted; settle as noted)

- `previewAvailabilityConfig`'s 5 s `Promise.race` cannot interrupt the synchronous `planPreview`, so a very large future-booking set blocks the event loop before the 503 fires. Settle by timing `planPreview` against a venue with 50k future bookings.
- A Tonight `closeAt` caps last seating at the close itself (`resolve-day.ts:201`), so a 2-hour booking can start at 20:59 when the venue closes at 21:00. Settle against ux.md's close-early copy.
- The staff form may send the calendar date for after-midnight seatings, which is the same root cause as R2. Settle by tracing `NewReservationDialog` → `createReservation`.

## Passes with no findings

- **Security: authz on every new route.** `requireVenueRole` (`packages/auth/src/fastify/authz.ts`) and `venueScoped` `access: "manager"` guard config PUT, preview, revert and team writes. The closure, Tonight and impact routes decide Manager vs Host through `closureCaller` + `mayCloseFor`, and `createMany` and refund-retry are Manager-only. The team service blocks a non-owner from changing an owner and keeps the last Manager. Idempotency replays are keyed per venue and authorised against the original actor. R12 is the one authz gap.
- **Security: venue scoping and RLS.** All 8 new tables are `ENABLE` + `FORCE` RLS with isolation policies and least-privilege grants: `availability_changes` is append-only plus `reverted_by`, and `closure_outcomes` has no DELETE. Both jobs run inside `runWithVenueContext(payload.venueId)`. Config writes check `tableIds` against the venue's own tables (`referenceIssues`, also on the Tonight and impact paths).
- **Security: input validation, rate limits and PII.** The zod/JSON schemas sit at every new boundary. Ranges are capped: `days` 62, public `dates` 60, preview scope 366. `manage-rebook` has its own 10/min limit, and the other new authenticated routes keep the global limiter. Job payloads carry ids and flags only. R2 is the one validation gap: hold `date` is `min(1)` only.
- **Correctness, clean areas.** Every gated write runs in `bookSlot`'s transaction after the advisory lock, and confirm re-judges. Walk-ins are never gated for hours. Overrides apply only to soft limits, on the phone channel, with a non-blank reason. Past-midnight ownership and DST behave as ADR-029 says. Tonight expiry is read-time. Every jsonb payload is `safeParse`d with a version literal, and a bad one degrades to closed with a warning.
- **Payments.** No double refund, the amounts are bounded, and the closure itself makes no Stripe call (the `stripe-flow-reviewer` integrated pass). The remaining edge cases are R6 and R7.
- **Migrations pass.** `20261025000000_add_venue_availability` is additive only. The new NOT NULL columns on `venues` have defaults, the `reservations` columns are nullable, and the partial unique index gives one regular schedule per venue. The cascades are child-of-config only (schedule → services/assignments, date rule → rule tables). The FKs to venues and reservations are `RESTRICT`. The schema and the code agree. The index creates are not `CONCURRENTLY`, but they are on new, empty tables.
- **Dependencies pass.** The only new dependency is `fast-check ^4`, dev-only, in `@mbe/availability`. `@mbe/availability` is a workspace dependency, and the reservations Dockerfile builds and copies its `dist`, which the `production` export condition needs.
- **ADR compliance.** I checked against ADR-002/008 (ProblemDetails on every new refusal), ADR-007 (`/api/v1`, `/public/v1`), ADR-019 (BullMQ in-process jobs), ADR-020 (`venueScoped` access), ADR-026 (RLS and job context), ADR-029 (service-day ownership in the engine, apart from R2's stored date) and ADR-030 (rows plus one pure engine, apart from R13's duplicate). ADR-001/028 are met: the UI uses rialto, and the app-local calendar grid's day-cell `<button>`s are the architecture-sanctioned exception. `adr_status.py` reports every ADR as `unrecognized`, because the repo's status word is `active`, which reads as live. The rest (ADR-004/006 superseded, ADR-005/009–018/021–025/027) are about subjects the diff never reaches.
- **Design.** No undocumented decision passes the three-leg ADR test. The run's two ADRs (029, 030) were written at Architect. R13 is the one decayed contract under complexity. Module shape is not handed to `deepen`.
- **Complexity: lean markers.** The diff adds no `lean:` marker.

## Verdict

**Not ready to ship as is.** There are no critical findings, so nothing is blocked by rule. But six major findings (R1–R6, #7676–#7681) are open, and the skill requires each to be fixed or explicitly deferred by the Owner before Ship. R2 (public double-booking) and R4 (closure-integrity race) are the ones I would not defer. R5 is a two-line fix. Seven minor findings (R7–R13) are deferred to their issues. Three suspicions are recorded without failing inputs.

Not examined or not run, so this is not an unqualified pass:

- No tests were re-run here; Verify ran the suites at `c4399b5f6`.
- R1 was reproduced against the built engine. Every other finding comes from reading the code, with no failing test written.
- The hospitality `SeriesEditDialog` and `AvailabilityHistoryDrawer` rendering, the internals of `availability-config-rows.ts` and `availability-preview.ts`, and the backfill script were only skimmed.
- Verify's open gaps still stand: the locale-sweep E2E regression (fix in flight), Setup time NOT RUN, and production-only Preview speed and Migration checks.
