---
stage: prd
run: feature:booking-guest-reuse
date: 2026-09-15
ux: required
assumptions:
  - "Run choice: booking-guest-reuse was the only un-driven run on origin/main da54bd57b; the orchestrator drove it, no user selected it (brief § Why this run)."
  - "Run scale and slug: feature run, slug fixed by idea.md frontmatter — inherited, not user-chosen."
  - "ux: required — orchestrator default from brief § User-facing surface (three staff dialogs change); no user answer."
  - "Scope In/Out adopted from brief § Scope boundaries (orchestrator defaults), including 'no Prisma schema or migration change' — which is why the waitlist half is recognise-and-prefill only."
  - "Success criteria seeded from brief § Success criteria (orchestrator defaults), then re-measured on worktree HEAD 7c3f1e3b6 (origin/main da54bd57b + one docs-only seed commit) and sharpened with file:line citations; idea.md's 2026-08-31 line numbers are superseded by the ones here."
  - "Match semantics (exact email takes precedence, then exact phone, both scoped to Guest.venueId; name is a search key, never a match key) taken from brief § Already decided, which restates idea.md's hunch — orchestrator default."
  - "'find-or-create semantics' for a no-pick staff reservation read literally: an exact match links, no match creates a new Guest and links it. Today the staff path creates no Guest row at all — reservation.ts:151/:242 write whatever guestId arrives and NewReservationDialog sends none."
  - "Public-widget path read literally from brief § Scope In: link on exact match only; no match leaves today's behaviour (guestId null, no Guest created). The asymmetry with the staff path is surfaced under Open questions, not decided here."
  - "Actor vocabulary derived by this stage from idea.md ('hosts and managers') and apps/hospitality/docs/USER-FLOWS.md personas (Host / Hostess, Restaurant Manager) plus the widget booker; no user confirmed it."
  - "Tracker: #4990 (labels audit, ready, ux — read-only verified OPEN on 2026-09-15) is treated as the walk-in + waitlist half of this run per brief § Tracker; this stage only read it. Decompose owns the label move."
---

# PRD: Reuse existing guests at booking time (reservation, walk-in, waitlist, widget)

## Problem statement

When a Host books a regular, the system treats them as a stranger. No booking
flow in the hospitality app links a reservation to the venue's guest profile:

- The staff reservation dialog collects free-text name / email / phone
  (`apps/hospitality/src/components/reservations/NewReservationDialog.tsx:18-20`),
  requires one of email or phone (`:116`), submits those three fields (`:136-138`)
  and never a `guestId`; it calls no lookup and mounts no guest history.
- The walk-in dialog has a single optional name field
  (`apps/hospitality/src/components/timeline/WalkInDialog.tsx:19`, submitted at `:98`),
  and the server hardcodes `guestEmail: null, guestPhone: null, guestId: null` for
  every walk-in (`services/reservations/src/services/reservation.ts:552-554`).
- The waitlist add form collects a required name and a validated phone
  (`apps/hospitality/src/pages/WaitlistPage.tsx:86-87`, `:153`, `:160-163`) and
  recognises nobody.
- The public widget's confirm path writes `guestId: guestDetails.guestId ?? null`
  (`services/reservations/src/services/confirm-hold.ts:117-120`) but the public
  body schema carries no `guestId` (`packages/types/src/schemas/reservation-requests.ts:392-398`),
  so every widget booking lands unlinked too.

Meanwhile the CRM half is built and idle: `Guest` holds `visitCount`, `noShowCount`,
`lifetimeSpend`, `tags`, `dietaryRestrictions`, `staffNotes`
(`services/reservations/prisma/schema.prisma:169-184`) with per-venue uniqueness on
email and phone (`:192-193`); the service resolves exact email then exact phone
(`services/reservations/src/services/guest.ts:122-160`); `GET /api/v1/guests/search`
and `POST /api/v1/guests/find-or-create` exist (`services/reservations/src/routes/guests.ts:86`, `:265`)
with client hooks (`apps/hospitality/src/hooks/useGuests.ts:36-54`, `:101`); and
`GuestCard` renders segment, visits, no-shows and an allergy banner
(`apps/hospitality/src/components/crm/GuestCard.tsx:142-165`) — but only where a
`guestId` already exists (`GuestDrawer`, `ReservationSheet`, `ReservationDetails`,
`EditReservationDrawer`), never at booking time.

The cost lands in two places. The Host retypes a regular's details every visit and
never sees the no-show record or shellfish allergy that would change how they seat
them. The Manager's CRM decays with use: a guest's history only accrues through
linked reservations (no-shows are recorded only `if (... existing.guestId)`,
`reservation.ts:313-319`), so every unlinked booking is a disconnected copy of the
person living in `Reservation.guestName/guestEmail/guestPhone`, and the profile the
Guests page shows drifts further from what actually happened on the floor.
(Correction to idea.md's framing: staff bookings do not mint orphan `Guest` rows
today — they mint nothing, which is the same loss by a different route.)

Evidence is design-gap only; no duplicate or unlinked-booking count has been
measured (idea.md, unchanged).

## Solution

When this ships:

- **Reservation dialog.** As a Host types a name, email or phone, guests of this
  venue who match are suggested. Picking one attaches the booking to that guest and
  shows a compact history strip — visits, no-shows, dietary restrictions with
  allergies highlighted — before the Host confirms. A Host who ignores the
  suggestions and submits an email or phone that exactly matches an existing guest
  still gets a booking attached to that guest; nothing is duplicated.
- **Walk-in dialog.** An optional lookup lets a Host seat a known regular as
  themselves. Skipping it costs nothing: the dialog with no lookup interaction is
  exactly today's dialog. A linked walk-in shows the returning-visit label on its
  timeline block, as linked reservations already do
  (`apps/hospitality/src/components/timeline/ReservationBlock.tsx:38-40`).
- **Waitlist add form.** When the phone the Host already types matches a known
  guest, the form shows who that is (card with visits / no-shows / allergies) and
  prefills the name. The entry is stored exactly as today — there is no persisted
  waitlist-to-guest link in this run.
- **Public widget.** The Online guest sees nothing new. Server-side, a widget
  booking whose email or phone exactly matches one of the venue's guests is
  attached to that guest, and the booking response is indistinguishable from the
  unknown-guest case.
- **Identity rules, everywhere.** Exact email wins, then exact phone, both within
  the venue; name is only ever a search key. Lookup failure never blocks a booking.

## Actors

- **Host** — floor staff who takes reservations, seats walk-ins and works the
  waitlist in the hospitality app (`apps/hospitality/docs/USER-FLOWS.md:14`, Flows 3-5).
- **Manager** — owns the venue and its guest CRM on the Guests page; needs visit
  and no-show history to be trustworthy per guest (`USER-FLOWS.md:13`).
- **Online guest** — a person booking through the public widget, first-time or
  returning; must never learn anything about the venue's guest records from the
  booking response beyond today's opt-in recognition greeting.

## User stories

1. As a Host, I want matching guests suggested as I type a name, email or phone in
   the reservation dialog, so that I can book a regular without retyping them.
2. As a Host, I want to see a picked guest's visits, no-show count and dietary
   restrictions (allergies called out) before I confirm the reservation, so that I
   seat and prepare for them correctly.
3. As a Host, I want a reservation I submit with a guest's exact email or phone —
   without picking a suggestion — to still attach to that guest, so that a rushed
   booking never creates a second copy of them.
4. As a Host, I want a guest lookup in the walk-in dialog that I can ignore
   entirely, so that a regular can be seated as themselves without walk-ins getting
   slower.
5. As a Host, I want a walk-in I linked to show the returning-visit label on the
   timeline, so that the floor knows a regular is seated.
6. As a Host, I want the waitlist add form to recognise a phone I've just typed and
   prefill the name, so that I don't retype a regular's details while they wait.
7. As a Manager, I want staff bookings to attach to existing guest profiles instead
   of adding disconnected copies, so that visit and no-show history stays accurate
   per guest.
8. As a Manager, I want a widget booking from a guest we already know to land on
   that guest's profile, so that online regulars accrue history too.
9. As an Online guest, I want the widget to behave identically whether or not the
   venue already knows my email, so that the booking reveals nothing about anyone's
   profile.

## Success criteria

Staff reservation (`NewReservationDialog`):

- [ ] SC1 — Picking a suggested guest submits that guest's id as `guestId`, and the
      created reservation's `guestId` equals it. Component test asserts the
      `api.reservations.create` payload; service test asserts the stored row. No
      new `Guest` row is created by a pick.
- [ ] SC2 — After a pick and before submit, the dialog shows the picked guest's
      visit count, no-show count and dietary restrictions, with allergy entries
      visually distinguished the way `GuestCard.tsx:164-165` already does.
      Component test with a fixture guest (e.g. 4 visits, 1 no-show,
      `["shellfish"]`).
- [ ] SC3 — Submitting with no pick and an email or phone that exactly matches an
      existing guest of the same venue produces a reservation linked to that guest,
      and the `Guest` row count is unchanged. Service test counts rows before and
      after. Email precedence: when the typed email matches guest A, A is linked
      regardless of the phone.
- [ ] SC4 — Submitting with no pick and no exact match creates one new `Guest` and
      links it (find-or-create). Service test: row count +1, reservation `guestId`
      equals the new guest.
- [ ] SC5 — An exact email or phone match in a different venue is never linked.
      Service test: same email in venue A, booking in venue B → no link to A's
      guest.
- [ ] SC6 — Lookup failure never blocks submit. With `api.guests.search` rejecting,
      each of `NewReservationDialog`, `WalkInDialog` and the waitlist add form still
      submits its free-text form successfully and shows no blocking error.
      Component test per dialog with the search mock rejecting.

Walk-in (`WalkInDialog`, `POST /api/v1/reservations/walk-in`):

- [ ] SC7 — With no lookup interaction, the walk-in payload and outcome are
      exactly today's (party size, table, venue, optional name; `CONFIRMED`,
      table `OCCUPIED`). Existing walk-in component tests and
      `apps/hospitality/e2e/walkin.spec.ts` pass unchanged in intent.
- [ ] SC8 — A walk-in seated with a picked guest stores that guest's `guestId`
      (service test on the walk-in create path, which today writes `null` at
      `reservation.ts:554`), and its timeline block renders the visit label that
      `ReservationBlock.tsx:38-40` shows when the linked guest's `visitCount > 1`.
      Component test with a fixture guest at `visitCount ≥ 2`.

Waitlist add (`WaitlistPage`):

- [ ] SC9 — Typing a phone (or a name) into the waitlist card's guest lookup
      that matches an existing guest offers that guest; picking shows their
      visits, no-shows and allergies in the form and prefills the Phone field
      (the Host can still edit every field). The created entry carries only
      today's fields (`guestName`, `guestPhone`, `partySize`);
      `packages/types/src/schemas/waitlist.ts` is unchanged. Component test.
      _(Reworded 2026-09-15 by the autorun orchestrator to match `ux.md`
      assumption 6 — the lookup lives in the Guest name field on every
      surface; the original wording said typing a phone "prefills the name
      field".)_

Public widget (`POST /public/:slug/reservations`, `public-reservations.ts:84`):

- [ ] SC10 — A confirm whose `guestEmail` (or, failing that, `guestPhone`) exactly
      matches one of the venue's guests stores that guest's `guestId` on the
      reservation. Route test. An unknown email stores `guestId: null` as today.
- [ ] SC11 — The HTTP response for the matched case and the unknown case are
      identical in status, headers and body once ids, timestamps and the manage
      token are normalised. Route test that diffs the two responses and asserts an
      empty diff.

  > Amended 2026-09-15 (Review): "headers" excludes `x-ratelimit-*` (the second request necessarily reads one lower) and `date` (a same-second guard); the route test names that allowlist, asserts `content-length` equal, and asserts no header outside the allowlist differs.

- [ ] SC12 — The public body still does not accept a caller-supplied `guestId`
      (`PublicReservationBodySchema` unchanged in that respect). Route test sends
      one and asserts the stored reservation does not carry it.

  > Amended 2026-09-15 (Review): "does not accept" = the public schema never declares `guestId` and the handler never reads it; a body carrying one is answered 201 with the key ignored and the reservation linked only by the typed contact. A 400 would itself tell the caller the key means something, so the test asserts never read / never stored, not a rejection.

Gates and constraints:

- [ ] SC13 — `pnpm lint`, `pnpm typecheck` and unit tests green in
      `apps/hospitality`, `services/reservations`, `packages/api-client`,
      `packages/types`; `pnpm regen --check` clean; `check-adr` / `check-deps`
      clean; touched E2E specs (`reservations.spec.ts`, `create-reservation.spec.ts`,
      `walkin.spec.ts`, `waitlist.spec.ts`, plus `timeline*.spec.ts` /
      `dashboard.spec.ts` / `realtime-collaboration.spec.ts` only if their
      selectors break) pass when the environment allows; `e2e/api-mocks.ts`
      guest mocks (`:525`, `:549`) extended as needed; size-limit not exceeded.
- [ ] SC14 — Rialto components only, every colour via `--rialto-*`, reduced motion
      respected on any new animation; no `setState` in `useEffect` bodies.
- [ ] SC15 — `apps/hospitality/CLAUDE.md` Key Components (`:35-42`) and
      `apps/hospitality/docs/USER-FLOWS.md` Flow 3 (`:76`) / Flow 5 (`:134`) reflect
      the new behaviour where it changes them. (The brief's `docs/USER-FLOWS.md`
      path does not exist; the file lives under `apps/hospitality/docs/`.)

## Out of scope

- Merging historical duplicate guests, and any backfill that links existing
  reservations to guests.
- Cross-venue identity; fuzzy or name-based matching.
- Any Prisma schema or migration change — therefore no persisted
  `WaitlistEntry.guestId` (`schema.prisma:263` has none) and no waitlist link that
  survives beyond the add form.
- The public widget's UI and its recognition endpoint
  (`GET /public/:slug/guests/recognize`, `public-guest-recognition.ts:19-22`).
- Making `visitCount` accrue on completed bookings — `guestService.recordVisit`
  (`guest.ts:249`) has no callers today, a pre-existing defect noted under Open
  questions, not fixed here.
- `auth.spec.ts` / `auth.setup.ts`; rialto npm publish; new rialto components
  unless `Autocomplete` / `Combobox` cannot serve; anything in
  `apps/hospitality/src/pages/GuestsPage*` beyond what linking requires.
- Public waitlist join (`public-waitlist.ts`) recognition or linking.

## Open questions

Unresolved — need a human (no brief answer, no skill default):

- **Does a booking-time match update the matched profile, or link only?** Today's
  `findOrCreate` overwrites the existing guest's `name`, `email` and `phone`
  whenever the booking's values differ (`guest-identity.ts:50-66`, applied at
  `guest.ts:139-146`). Reused as-is: a staff typo on a matched email renames the
  profile; an email match whose typed phone belongs to another guest attempts a
  phone update into the `venueId_phone` unique (`schema.prisma:193`) and errors;
  and on the public path anyone who knows a guest's email could rename them or
  replace their phone through the widget. SC3/SC4/SC10 are written as "links"
  only. Recommended (not decided): link-only on both paths; additive dietary
  merge acceptable. — Matt.
- **Public no-match: create or leave null?** The brief says link-on-match for the
  widget and find-or-create for staff (SC4 vs SC10). Kept literal; the asymmetry
  means online first-timers never become guests. — Matt.
- **Seat-time link from the waitlist.** The seat dialog creates the walk-in
  client-side (`WaitlistPage.tsx:278-295`, `api.reservations.walkIn` at `:288`).
  Once walk-in accepts `guestId`, a recognised entry could pass its guest through
  at seat time with no schema change. The brief's waitlist scope stops at
  recognise-and-prefill. In or out? — Matt.
- **`visitCount` never accrues.** `recordVisit` (`guest.ts:249`) has zero callers,
  so the history strip and the timeline label show whatever the row was seeded
  with. This run's criteria use fixture guests; real value depends on a separate
  defect run via `capture`. — Matt (route it or not).
- **Duplicate / unlinked-booking count** remains unmeasured (needs prod DB access;
  idea.md). — Matt, optional.
- **Adoption** (is the typeahead faster than retyping?) can only be observed after
  ship. — Operate.

Parked for Architect:

- `POST /api/v1/reservations` accepts `guestId` by TS type
  (`packages/types/src/reservation.ts:72-86`) and the service writes it
  (`reservation.ts:151`, `:242`), but `CreateReservationBodySchema`
  (`reservation-requests.ts:59-73`) does not declare it; `toRequestJsonSchema`
  strips `additionalProperties` (`json-schema.ts:88-99`) so it passes through
  unvalidated. Declare it, and decide whether the server verifies the guest
  belongs to the venue. The authenticated hold-confirm already accepts it
  (`holds.ts:299`, schema `:253`).
- Threading `guestId` through the walk-in: `WalkInBodySchema`
  (`reservation-requests.ts:43-58`), `api.reservations.walkIn`
  (`packages/api-client/src/reservations.ts:159-165`), the dialog payload
  (`WalkInDialog.tsx:19`) and `createWalkIn` (`reservation.ts:552-554`); same
  venue-ownership check question.
- Phone normalization: none exists (no normalizer anywhere in
  `services/reservations`, `packages/*`, `apps/hospitality`; only validators at
  `waitlist-notifier.ts:80` and `WaitlistPage.tsx:78`). If a canonical form is
  introduced it must apply to lookup and write consistently within this run and
  must not require rewriting existing rows (brief).
- Where exact-match resolution lives for the staff and public paths, and how the
  public path keeps SC11 true including timing (the lookup should run in both the
  matched and unknown cases).
- The recognition endpoint is already an email-existence oracle by design
  (`guest-recognition.ts:31-43`, 10/min). The requirement is no _new_ oracle on
  the booking response, not removal of the existing one.
- Whether the three dialogs share one lookup component; search key is
  `useGuestSearch({ venueId, query })` → `GET /api/v1/guests/search`
  (`requireAuth` + `requireVenueAccess`, text search over name / email / phone,
  `guest.ts:304`); debounce and minimum query length are UX / Architect calls.
- Follow-up seed once this run closes: persisted `WaitlistEntry.guestId`
  (schema change, separate run).
