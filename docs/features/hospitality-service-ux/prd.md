---
stage: prd
run: feature:hospitality-service-ux
date: 2026-09-03
ux: required
assumptions:
  - "Scope: the full committed set A1–A10 + B1 + B2 + B3 (hospitality half) is adopted with no drops — the brief's default, confirmed by idea.md's evidence check. B2 is kept although it sits on the Reservations list rather than the Timeline: it is the Timeline's sibling list on the same service night, its failure is the same shape as A3 (raw request line, no way back) plus a KPI lie, and its fix reuses B1's helper. What would change it: Decompose finding that B2 cannot land without touching the in-flight runs' files, in which case it drops with a logged reason there."
  - "A4 is committed as its UI-only half, per the brief: no SEATED status, no `seatedAt` column, no service or Prisma change. The honesty rule the PRD imposes on that half — the word 'Seated' (button, chip, block, sidebar) is shown only when the reservation's table is OCCUPIED, the one arrival signal the data model carries today — is the PRD's own ruling on the question idea.md surfaced. What would change it: Architect finding a schema-free mechanism for real seatedness (then the full finding comes in), or UX judging the OCCUPIED proxy misleading (then the chip is renamed to a state the data actually holds and no 'Seated' word ships)."
  - "A5's third measurable — a ≥ 4-hour visible span on the grid at 1024×768 with the sidebar open (today ≈ 2 hours / 384 px) — is a PRD-chosen threshold: a service block is about two hours, so the minimum useful window is the current block plus the next. The mechanism (overlay drawer, collapsible or narrower sidebar) is UX/Architect's. What would change it: UX measuring that a smaller span still lets a host see the now-line and the selected block at once."
  - "B3's hospitality half is read as the audit's evidence list — the five Timeline mutations (walk-in, seat, cancel, edit, table status) AND the Waitlist's add and seat, which operator INCLUSIVE-01 measured with the same `focus: BODY` / `statusRegions: []` result — rather than the brief's narrower phrase 'every timeline mutation'. The rialto half (`useFocusTrap` restore / `initialFocus`, `Dialog` first-focus, `Drawer` restore) stays routed; Architect MAY pull it in with a changeset but the PRD does not require it. What would change it: Decompose splitting the Waitlist pair off as a final item if the run's size threatens the merge."
  - "B1 is an app-wide property ('no person reads a request line'), so its sweep includes the guest widget's `useBookingFlow` site as a copy-only adoption — no guest flow behaviour changes (cluster D is routed) and no guest actor or user story. The B1 sites inside the in-flight runs' files (`FloorPlanEditorPage.tsx:125,142,205,218`, `components/floor-plan/AddTableDialog.tsx:86`) are excluded from this run's criterion and must be adopted after that run merges — Decompose either sequences an item behind it or routes it as an issue. What would change it: the venue-onboarding-floor-plan run merging before Decompose, which removes the exclusion."
  - "A6 is committed in full as consolidated: every ⌘K 'Action' that names a create verb ('Walk-in Guest', 'New Reservation', 'New Floor Plan') opens the thing it names, not just the walk-in path the brief's hunch 4 describes, plus the dashboard CTA and palette ranking. 'New Floor Plan' lands on `FloorPlansPage.tsx`, which is adjacent to but not in the in-flight run's excluded file list. What would change it: Decompose finding the floor-plan dialog trigger cannot be wired without touching `components/floor-plan/**`, in which case that one action drops with a logged reason."
  - "Actors: Host and Manager only, drafted from `apps/hospitality/docs/USER-FLOWS.md` and `apps/hospitality/CLAUDE.md` personas; a Host working by keyboard or screen reader is a mode of the Host, not a separate actor. Guests are routed out of this run (clusters C, D); Admin has no committed finding; evaluators are named in the problem, not as an actor. None were user-named."
  - "Lens: the brief's eight-principle table is adopted verbatim as the acceptance vocabulary; every criterion below is tagged with the principle it serves. Wording of the 'in software' column is unchanged."
  - "Timing bars in the criteria — the dialog re-enables within 1 s of a failed request; the announcement is present within 1 s of a mutation resolving; skeletons appear before 1 s of a slow load — are the PRD's own, chosen so the harness can assert them with a fixed clock rather than a race. What would change it: Verify measuring the harness cannot hold a 1 s bound reliably, in which case the bound loosens to 2 s, never to 'eventually'."
  - "The evidence label stays 'reproduced in harness' for every finding (n = 0 user reports); no Sentry or analytics query was run at this stage either. Slug, run scale, origin (no backlog seed claimed) and the problem framing are inherited from idea.md unchanged."
surfaced:
  - "The authenticated dashboard has zero production evidence (no Auth0 E2E credentials in this environment — on Matt since 2026-08-31). Every criterion below is provable only against fixture data at `5f642aa42`; Ship must record the gap explicitly rather than claim prod evidence. Inherited from idea.md."
  - "Venue timezone vs browser timezone (A1, A2): no default is taken here. Both candidate answers agree whenever the venue's zone equals the browser's, which is the harness case (fixture venue and machine both America/Los_Angeles), so the criteria are written to be neutral to the choice; Architect picks one source and notes it."
  - "Real seatedness is not available to this run (Prisma change, out of scope). The UI-only half of A4 is bounded by the honesty rule in `assumptions`; whether that half is enough for a host to trust the grid remains a UX judgement, not something this PRD can prove."
  - "Two open PRs touch `components/timeline/` (#4967 memoize `TimelineGrid` layout style; #4944 `ReservationBlock` style memo) as recorded in idea.md on 2026-09-03; their state was not re-measured for this PRD. Decompose must re-check and sequence the `TimelineGrid` items behind their merge or a rebase."
  - "`apps/hospitality/e2e/api-mocks.ts:280` re-dates fixtures with the UTC day (`new Date().toISOString().slice(0, 10)`), so after 17:00 PDT the shared mock renders an empty grid — the same defect class as A1/A2. Any evening-clock E2E this run adds must fix the mock too (`e2e/**` may be modified, never deleted); this is a harness gap, not a product finding."
  - "`apps/hospitality/docs/USER-FLOWS.md` Flow 4 step 4 documents 'Mark as Seated → status changes to CONFIRMED' — the very behaviour A4 identifies as the lie. The doc mirrors the defect rather than the intent; the one-line update the brief permits is listed as a criterion, and the wording waits on the A4 ruling."
---

# PRD: The service night on the Timeline

## Problem statement

A Host on a tablet at the door works Tonight's Service from 17:00 to close —
pre-shift Briefing, then the Timeline, seating walk-ins, surviving the odd
failed request. On the product's core screen the software today **lies to
that Host three times an evening and strands them once**, reproduced in the
audit harness at `origin/main` @ `5f642aa42` (machine zone
America/Los_Angeles; n = 0 user reports — the label never rises above
"reproduced in harness"):

- **Three lies.** The "now" line is absent from 17:00 local to midnight in
  every US timezone because `isToday` compares a local date to a UTC one
  (A1: fixed clock 14:00 → `nowLineCount: 1` at 480 px; 20:00 →
  `nowLineCount: 0`). The Briefing's Dinner and Late tabs are empty and a
  21:00 party is filed under Early because bucketing uses `getUTCHours()`
  while the card prints local time (A2). "Seat Guest" writes `CONFIRMED`, so
  seating is invisible on the block, sidebar and list, the button is offered
  again after seating and never for PENDING, and the phone's "Seated" chip
  lists parties who have not arrived (A4).
- **One stranding.** A failed walk-in leaves the dialog on "Seating…" forever
  (`submitDisabled: true`, `dialogError: null`), replaces the whole grid with
  `POST /api/v1/reservations/walk-in failed: 500 …`, and never clears —
  Escape, Next day and Today all keep the grid gone; only a hard reload
  recovers (A3). That copy is the app-wide default at 27 + 8 sites (B1). The
  sibling Reservations list fails the same way with no Retry while its KPI
  cards read "Total 0 / Confirmed 0" as if the night were empty (B2).
- **The friction of a screen not built for standing up.** The grid always
  opens at 11 AM; a new walk-in lands off-screen, unselected, with no word of
  which table it took; with the sidebar open a 1024-px tablet shows a 384-px,
  two-hour keyhole (A5). Every promoted "Walk-in" shortcut — ⌘K, the
  dashboard's primary CTA — navigates to a page because `?walkin=true` has no
  reader, and "walk" ⏎ lands on Waitlist (A6). An empty night is a bare grid
  indistinguishable from a wrong date or a failed fetch (A7). The 26-px
  table-status tag fires a one-way state change on a brush with no label,
  confirm or undo (A8). The Timeline loads a lone spinner under an already
  populated stats row (A9). The Briefing drops the VIP tag the sidebar shows
  and paints "vegetarian" red (A10). Every mutation succeeds in silence and
  drops focus to `<body>` (B3).

The bar the user set is the maître d's — "the same service that world class
hospitality would" — and this screen fails six of the eight principles below
on its hot path. In practice the sufferer today is the project owner as sole
operator, prospects arriving via the self-serve path (#4492), and evaluators
giving the demo five minutes — after 17:00, the first three bugs are the first
thing they see.

## Solution

When this ships, a Host running Thursday dinner on a tablet is **never lied
to and never stranded** on the Briefing → Timeline journey:

- **Truth.** The now-line is on the grid for the whole service; the Briefing
  files each party under the segment its printed time belongs to; "Seated" is
  said only when the table says so.
- **Recovery.** A failed request leaves the grid standing, says what happened
  in a sentence a person would say, offers a way to try again, and clears on
  the next attempt. No one in the app — Host or Manager — reads an HTTP verb,
  a path or a status code again. The Reservations list fails honestly, with
  Retry, and its KPIs read "—" rather than zero.
- **Orientation.** The grid opens on now; a new walk-in is selected and in
  view with its table named; an empty night says so and offers the next
  action; loading looks like the Briefing's loading.
- **One motion to a walk-in.** Every control that says "Walk-in" opens the
  walk-in dialog. ⌘K ranks what you typed.
- **Calm controls and spoken results.** The table-status tag says what a tap
  will do and can be undone; every mutation is announced in one line and
  leaves focus somewhere useful.

Exact copy, layout and mechanisms belong to the UX and Architect stages; the
criteria below fix what must be true.

### The lens (acceptance vocabulary)

| Principle   | A great host…                         | In software                                                               |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------- |
| ANTICIPATE  | knows the next need before it's asked | smart defaults, next-step affordance, context carried across pages        |
| RECOGNIZE   | greets by name, remembers preferences | guest tags/notes/VIP at the moment of seating, not three clicks away      |
| NO-DEAD-END | never makes the guest do the work     | no re-entry of known data, every empty state offers the next action       |
| RECOVER     | fixes a mistake before you notice     | human error copy + retry/undo, no stuck spinner, honest optimistic revert |
| CALM        | reads the room at a glance            | legible status hierarchy, no alarm without cause, no clutter              |
| TONE        | speaks like a person, not a policy    | short, warm, confident, a little cheeky; never corporate                  |
| TIME        | respects yours                        | perceived speed, ⌘K, 44 px targets, one-handed at the door                |
| INCLUSIVE   | serves everyone the same              | labels, live regions, focus, reduced motion, contrast                     |

## Actors

- **Host** — the host / hostess on a tablet (1024×768 is the primary
  viewport) at the door during service, working Flows 2–4 of
  `apps/hospitality/docs/USER-FLOWS.md` (morning setup, walk-in, managing a
  reservation) from 17:00 to close; constraint "fast walk-in creation
  (<5 clicks)" (`apps/hospitality/CLAUDE.md`). Includes a Host working by
  keyboard or screen reader — the same person, a different input. Primary
  sufferer of A1–A10, B1, B3.
- **Manager** — the owner-operator on a laptop (1440×900) who opens the
  Reservations list and reads its KPI cards as the truth about tonight (B2),
  and who reads error banners on the manager surfaces (B1).

## User stories

1. As a Host, I want the now-line on the Timeline at any hour of service, so
   that I can see where tonight stands without reading the wall clock. (A1)
2. As a Host, I want the Briefing's Dinner and Late tabs to hold the parties
   whose printed times fall in those segments, so that the pre-shift read is
   true. (A2)
3. As a Host, I want a failed walk-in to leave my table view standing, tell me
   what happened in plain words, and let me try again, so that one bad
   request never costs me a reload with a party at the desk. (A3, B1)
4. As a Host, I want "Seat Guest" to disappear once a party's table is
   occupied and to be offered for a pending party standing in front of me, so
   that two of us never seat the same party twice and I can seat a walk-up
   without hunting for Edit. (A4)
5. As a Host, I want the grid to open on now and to bring a new walk-in into
   view, selected, with its table named, so that I never scroll to confirm
   what I just did. (A5)
6. As a Host on a tablet, I want to see more than two hours of the grid while
   a reservation is selected, so that the sidebar does not hide the night.
   (A5)
7. As a Host, I want every control that says "Walk-in" — ⌘K, the dashboard
   CTA — to open the walk-in dialog, and ⌘K to rank what I typed, so that the
   shortcut is shorter than the long way. (A6)
8. As a Host, I want an empty night to say so and offer the next action, so
   that I can tell a slow night from a wrong date or a failed fetch. (A7)
9. As a Host, I want the table-status tag to say what a tap will do and to
   let me undo one, so that a brush on a crowded row is not a state change I
   have to cycle back through. (A8)
10. As a Host, I want the Timeline to load the way the Briefing loads, with no
    counts shown before the grid, so that the two pages I open back-to-back
    feel like one product. (A9)
11. As a Host, I want the Briefing to show the VIP tag the sidebar shows, to
    paint only allergies red, and to use the Timeline's clock and a name for
    itself, so that the kitchen and I recognise the right guests. (A10)
12. As a Host working by keyboard or screen reader, I want each mutation
    announced in one line and my focus returned somewhere useful, so that I
    know it worked without watching the dialog vanish. (B3)
13. As a Manager, I want a failed Reservations fetch to show a banner with
    Retry and KPIs that read "—", so that zero is never mistaken for an empty
    night. (B2)
14. As a Manager, I want every error the app shows me to be a sentence, not a
    request line with internal ids in it, so that I can act on it and
    screenshot it without leaking how the app is built. (B1)

## Success criteria

Every criterion is checkable: the audit harness reproduction (or a unit / E2E
assertion) **fails at `5f642aa42` and passes after**, quoted in
`verification.md`. Harness: `apps/hospitality/e2e/.ux-audit/` (git-excluded;
probe IDs below are its spec names), run from `apps/hospitality` with
`pnpm exec playwright test -c e2e/.ux-audit/playwright.config.ts <spec>`,
fixture venue America/Los_Angeles, machine zone the same. "Local" below means
the zone Architect picks (venue or browser); both agree in the harness.

**A1 — now-line all evening (CORRECTNESS, CALM)**

- [ ] With a fixed clock at 20:00 local on the selected date, the now-line
      renders inside the grid (`nowLineCount: 1`, `nowLineLeftPx` non-null and
      within the grid's width); at 14:00 it still renders at 480 px; the date
      label is unchanged between the two. — _probe P01; unit test on
      `TimelineGrid` with a 20:00 clock._
- [ ] At any local hour inside the grid's range (11:00–23:00) on the local
      calendar day the line renders; on a different selected date it does not.
      — _unit test, parameterised over hours._

**A2 — Briefing segments by the clock it prints (CORRECTNESS)**

- [ ] Three local bookings at 17:30 / 18:30 / 21:00 → the card printed
      "6:30 PM" appears under Dinner, the card printed "9:00 PM" under Late,
      and no card appears under a segment whose local-hour range excludes its
      printed time; "All" lists all three. — _probe P08; unit test on the
      segment function._
- [ ] The segment a booking is filed under and the time printed on its card
      derive from the same clock source. — _unit test asserting one formatter
      / zone for both._

**A3 — failure never removes the grid (RECOVER, TONE)**

- [ ] A 500 on `POST /api/v1/reservations/walk-in` leaves the grid rendered
      (`[data-testid="timeline-grid"]` count stays 1), shows a human error
      inside the dialog (`dialogError` non-null, not matching
      `/^(GET|POST|PATCH|PUT|DELETE) \/api\//`), and re-enables the submit
      button with its resting label within 1 s. — _probe P03 / xcut C2;
      `TimelinePage.test.tsx` rejecting the walk-in._
- [ ] The same holds for a failing seat, cancel, edit and table-status change:
      grid stays, the acting dialog or control shows the error, nothing stays
      in its in-flight label. — _unit tests per handler._
- [ ] Any page-level error renders alongside the grid, is dismissible, and is
      cleared by the next attempt; after Escape → Walk-in again, no stale
      error is visible. — _probe P03 after-escape; unit test._

**A4 — seating that shows, UI half (CORRECTNESS, CALM)**

- [ ] For a CONFIRMED party whose table is OCCUPIED, the sidebar does not
      offer "Seat Guest"; for a PENDING party it does. — _probe P05 reopened
      sidebar; unit test on the sidebar's action set._
- [ ] The word "Seated" appears — on the phone chip, a block, the sidebar or
      the list — only for a party whose table is OCCUPIED; the phone chip no
      longer lists un-arrived CONFIRMED parties under "Seated". — _probe P12;
      unit test on the mobile filter label / value pairing._
- [ ] No request writes a status other than those the API accepts today; no
      Prisma or service change. — _diff review._

**A5 — orientation (TIME, ANTICIPATE)**

- [ ] On load and on "Today" with a fixed evening clock, the now-line's
      bounding box is inside the grid's scroll viewport (today
      `scrollLeft: 0`, headers `11 AM … 2 PM`). — _probe P01/P13; E2E._
- [ ] After a walk-in resolves, the new reservation is selected
      (`newBlockSelected: "true"`), its block is inside the viewport
      (`newBlockInViewport: true`), and the table it took is named on screen.
      — _probe P04; E2E._
- [ ] At 1024×768 with a reservation selected, the grid's visible time span is
      at least 4 hours (today ≈ 2 hours / 384 px). — _probe P13 bounding
      boxes; E2E._

**A6 — one motion to a walk-in (ANTICIPATE, TIME)**

- [ ] `/timeline?walkin=true` opens the walk-in dialog
      (`getByRole("dialog", { name: /walk-in/i })` visible) and the param does
      not persist after close. — _xcut A; `TimelinePage.test.tsx`._
- [ ] ⌘K "Walk-in Guest" and the dashboard's "New Walk-In" both end with the
      walk-in dialog open and focus inside it; ⌘K "New Reservation" ends with
      the new-reservation dialog open; ⌘K "New Floor Plan" ends with the
      new-floor-plan dialog open. — _probes P07/P14; E2E._
- [ ] ⌘K "walk" ⏎ resolves to the walk-in action, not Waitlist: a prefix match
      ranks above a word-start match, which ranks above a substring match. —
      _probe P14; unit test on the palette's ranking._
- [ ] The walk-in path from the dashboard is ≤ 2 activations to an open
      dialog (today 3). — _E2E click count._

**A7 — the empty night speaks (NO-DEAD-END, TONE)**

- [ ] With tables present and zero reservations, tablet and desktop show a
      message plus two actions — start a walk-in, and go to Today (or the
      date) — while the table rows stay visible beneath. — _probe P02; E2E._
- [ ] An empty night, a failed fetch and a wrong date are distinguishable by
      text and role (the fetch failure is an error with Retry; the empty night
      is not an error). — _E2E with the two mocks._

**A8 — calm table-status control (CALM, INCLUSIVE, TIME)**

- [ ] The table-status control has an accessible name stating the current
      state and the action a tap performs (today `ariaLabel: null`,
      `title: null`). — _probe P15; unit test._
- [ ] One activation never leaves an irreversible state change behind: either
      the next state is chosen from the valid transitions, or the change
      fires with an Undo that restores the prior state in one action
      (today one click → immediate `PATCH … OCCUPIED`, `confirmDialogs: 0`).
      — _probe P15; E2E asserting the request sequence._
- [ ] The control's hit area is ≥ 44×44 px at 1024×768 (today 52–78×26). —
      _bounding-box assertion._

**A9 — loading like the Briefing (CALM, TIME)**

- [ ] With `/tables` delayed 5 s, before 1 s the grid area shows skeleton rows
      (`skeletons ≥ 1, spinner: 0`) and the stats row shows no counts (today
      "Reservations: 4 · Covers: 12" above `spinner: 1`). — _probe P11; E2E._
- [ ] The grid's arrival does not shift the stats row (no layout jump) — the
      stats row's bounding box is identical before and after. — _E2E._

**A10 — the Briefing recognises (RECOGNIZE, TONE)**

- [ ] A guest with `tags: ["VIP"]` renders the VIP tag on the briefing card
      (today `vipTagRendered: false`). — _probe P08; unit test._
- [ ] With `dietaryRestrictions: ["nut allergy", "vegetarian"]`, only the
      allergy carries the error variant. — _unit test._
- [ ] Times on the Briefing are formatted identically to the Timeline
      ("5:30 PM", not "05:30 PM"). — _unit test sharing one formatter._
- [ ] The breadcrumb reads "Tonight's Service" (today "Home › Details"). —
      _unit test on `ROUTE_LABELS` / E2E._

**B1 — one voice for bad news (TONE, RECOVER)**

- [ ] No rendered error text anywhere in `apps/hospitality/src/**` — outside
      the in-flight runs' files listed in Out of scope — matches
      `/^(GET|POST|PATCH|PUT|DELETE) \/api\//`; the five manager surfaces
      (Reservations, Admin, Add Table, Profile, Onboarding launch) and the
      walk-in dialog show a sentence instead. — _manager probes T3/T11/R4/r3;
      xcut C2/F; snapshot test of the helper's copy._
- [ ] When the server sends `problemDetails.detail`, the person reads it (a
      409 "table already booked" reaches the Host); when it does not, they
      read a house-voice default, never `undefined` or a status code. — _unit
      test on the helper._
- [ ] The dashboard's `ReservationList` shows status labels, never raw enums
      (`NO_SHOW`). — _unit test._
- [ ] A guard prevents regression: a test (or lint rule) fails if a raw
      `ApiClientError.message` is rendered to a person outside the helper. —
      _test present and green._

**B2 — the Reservations list fails honestly (RECOVER, CORRECTNESS)**

- [ ] `/reservations` with `GET /api/v1/reservations*` → 500 shows a banner
      with a Retry control (`retryButtons: 1`, today 0) and human copy; the
      four KPI cards read "—", not 0. — _manager probe T3; E2E._
- [ ] Retry followed by a 200 restores the rows and the KPIs without a reload.
      — _E2E with a stateful mock._

**B3 — spoken results and returned focus, hospitality half (INCLUSIVE, TIME)**

- [ ] After each successful Timeline mutation — walk-in, seat, cancel, edit,
      table status — and after Waitlist add and seat, a `role="status"` region
      contains one line naming the outcome (guest and table where known)
      within 1 s (today `statusTexts: []`, `toasts: 0`). — _probes P04/P06/P09b;
      xcut D; unit test per mutation._
- [ ] After each of those success paths `document.activeElement` is a control
      inside `main` — the opener, or the newly created block/row — never
      `<body>` (today `focusAfterSuccess: BODY`). — _probes P04/P06/P09b;
      E2E._
- [ ] Optional — only if Architect pulls the rialto half in with a changeset:
      opening the walk-in dialog focuses the control that reflects the default
      party size (or the first data field), not "1" or a dismiss control; the
      rialto `Drawer` restores focus on close. — _rialto a11y test; otherwise
      remains the routed issue._

**Non-functional bar (every finding)**

- [ ] `apps/hospitality`: `pnpm lint`, `pnpm typecheck`, `pnpm test` green
      from inside the package; every behaviour above unit-tested by TDD
      (failing test first); affected `e2e/*.spec.ts` updated and passing
      locally against the mocked harness; no E2E coverage deleted.
- [ ] INCLUSIVE parity: every new interaction works keyboard-only and by
      screen reader; `prefers-reduced-motion` honoured for any motion added;
      44×44 px targets on every control this run touches at 1024×768; all
      colours via `--rialto-*` tokens; rialto components only (no raw
      `<button>/<input>/<select>` in pages); gold only for
      focus/active/in-flight.
- [ ] TONE: all new copy in the house voice (short, warm, confident; never a
      verb-path-status line) — wording owned by the UX stage.
- [ ] If `packages/rialto` changes: `.changeset` entry present, a11y matrix
      green, story added, `pnpm --dir packages/rialto build` before consumers
      typecheck.
- [ ] Repo: `pnpm regen --check` clean;
      `pnpm exec prettier --check docs/features/hospitality-service-ux/`
      clean; `apps/hospitality/docs/USER-FLOWS.md` Flow 3/4 lines updated to
      the shipped behaviour (one line each) and `apps/hospitality/CLAUDE.md`
      touched only if a flow step changes; PR to `main`; `CI Gate` green;
      Review stage with no unfixed critical finding; Ship records the
      authenticated dashboard as **not live-verifiable** rather than claiming
      production evidence.

## Out of scope

- **Every other audit cluster** — routed, not built (`ux-audit.md`
  § Routing): B4–B6 (chat shell, flat empty states, `document.title`), C
  (front door: `/public/v1` ingress #4565, no live venue, Stripe key), D
  (guest widget polish incl. venue-timezone slot display D1), E (manager
  setup/settings, rialto `Select` stacking), F (rialto `size="sm"` /
  `GlobalNav` target sizes app-wide — this run sizes only the controls it
  touches), G (guest recognition at walk-in/waitlist), M (canvas colours,
  orphan widget, backlog truth).
- **B3's rialto half** — `useFocusTrap` restore / `initialFocus`, `Dialog`
  first-focus, `Drawer` restore — a routed issue; Architect MAY pull it in
  with a changeset, this PRD does not require it.
- **Real seatedness** — a SEATED status or `seatedAt` column, a "Complete"
  action writing `COMPLETED`, and any change to `ReservationStatus` or
  `services/reservations`. Prisma schema / migrations and backend routes are
  out for the whole run.
- **New infrastructure** (Redis, SMS), Auth0 tenant/branding (#4848,
  PR #4924), `/api/v1/holds` auth (#4487), rialto npm publish,
  `.changeset/config.json`, visual-test harness sections (never commit macOS
  baselines), marketing / rialto-web / gen.
- **The in-flight runs' files** — `VenueOnboardingPage`,
  `components/venue-onboarding/**`, `components/floor-plan/**`,
  `hooks/useFloorPlans*`, `FloorPlanEditorPage`,
  `packages/types/src/schemas/reservation-requests.ts`,
  `services/reservations/src/routes/tables*` (venue-onboarding-floor-plan
  run) and the otlp-localhost-default run's service files. B1's sites inside
  them are adopted after that run merges (see `assumptions`).
- **Suspicions the audit did not reproduce** — the "Live" pill during a dead
  SSE stream, the walk-in default table ignoring table status, late-evening
  walk-ins stamped with tomorrow's date, the StrictMode-only Escape-path focus
  loss. Candidates for Verify probes, not scope.
- **A second journey.** "Award-winning everywhere" is the failure mode; this
  run commits to the service night and routes the rest.

## Open questions

- **Venue vs browser timezone for A1/A2** — the local-hour fix is right for a
  Host in the room; `venue.timezone` (IANA, set at onboarding) is right for
  anyone remote and for the guest widget (D1, routed). Architect picks one
  source and notes it in `architecture.md`; the criteria above hold either
  way in the harness.
- **Where the error helper lives** — `apps/hospitality/src/lib` (pattern:
  `describe-auth-error.ts`) or `@mbe/api-client` (which would make the fix
  available to every consumer, at the cost of a package change). Architect.
- **How "seated" is represented UI-only** — the table's OCCUPIED state is the
  only arrival signal; whether the phone chip is renamed ("Confirmed") or
  filtered by table state, and whether a block/sidebar shows a seated mark at
  all, is UX + Architect under the honesty rule in `assumptions`.
- **A8 mechanism** — a small menu of valid next states, or fire immediately
  with an Undo toast (`Toast.action` exists, unused). UX.
- **A5 keyhole mechanism** — overlay drawer, collapsible sidebar, or a
  narrower one at ≤ 1024 px. UX, then Architect.
- **B3 focus target after success** — return to the opener, or move to the
  newly created block/row. UX; the criterion accepts either.
- **Sequencing against #4967 / #4944 on `components/timeline/`** — Decompose
  re-measures their state and orders the `TimelineGrid` items behind their
  merge or a rebase; never silently overwrite.
- **The E2E mock's UTC-day bug** (`e2e/api-mocks.ts:280`) — fix alongside the
  first evening-clock E2E this run adds; Architect decides whether it is its
  own work item.
- **B1 sites in the in-flight files and the "New Floor Plan" palette action
  adjacent to that run** — Decompose sequences behind the floor-plan run's
  merge or routes them.
- **StrictMode Escape-path focus** — verify in a production build before
  claiming or fixing; success paths do not depend on it. Verify.
- **`Hospitality E2E` job health** — advisory and often red for environmental
  reasons; the harness reproductions quoted in `verification.md` are the
  run's regression evidence. Verify / Ship.
- **All new copy** — every message, label and announcement above in the house
  voice. UX Design.

Next stage: UX Design (`ux: required`).
