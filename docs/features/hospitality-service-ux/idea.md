---
stage: idea
run: feature:hospitality-service-ux
date: 2026-09-03
assumptions:
  - "Slug: the user never chose one; `hospitality-service-ux` is the orchestrator's default from the autorun brief, adopted as the run ref. A different slug would only matter if the user renames the run before PRD."
  - "Run scale: the user did not state product vs feature; the brief's default of a feature run (artifacts under `docs/features/hospitality-service-ux/`) is adopted because the work is one journey inside an existing app. A second journey would not widen this run — it would be a second run."
  - "Origin: this run starts from the autorun brief plus the four-report UX audit, not from a `docs/backlog.md` seed, so no seed line is claimed. If a matching seed is later found it should be claimed by the PRD, not silently absorbed."
  - "Ranking kept: the brief's default — cluster A (A1–A10) + B1 + B2 + B3 (hospitality half), framed as one journey, 'the service night on the Timeline' — is carried as the problem and solution hunch. The Idea stage's evidence check (operator.md, xcut.md § RECOVER-01/TONE-01/INERT-01/INCLUSIVE-01/TIME-01, manager.md § TONE-04/RECOVER-05) found every finding reproduced with quoted numbers and none of the competing clusters buildable as UX code alone (C is infra + a human venue step; E is setup-time; D has zero live reach until C lands), so nothing overturned it. What would change it: a live venue appearing in production (C2 resolved) would make cluster C/D the higher-leverage journey."
  - "B2 inclusion: the Reservations list is not on the Timeline, but the brief and the audit both fold it in as the Timeline's sibling list whose fix reuses the same `describeApiError` helper as A3/B1. Kept; the PRD may drop it as a strict-subset decision with a logged reason."
  - "Lens: the eight-principle 'a great host…' table (ANTICIPATE, RECOGNIZE, NO-DEAD-END, RECOVER, CALM, TONE, TIME, INCLUSIVE) is the orchestrator's translation of the user's words ('the same service that world class hospitality would'). Adopted as the run's acceptance vocabulary; the PRD may refine wording but must not drop a principle."
  - "Problem statement: the host's-voice narrative is composed from reproduced findings A1–A8, not a user quote — n = 0 user reports. Adopted and sharpened against the audit's measurements; a single real host report would replace it."
  - "Who has it / coping: the operator-and-evaluator answer (project owner as sole operator today; prospects via the self-serve path from #4492; evaluators in five minutes; coping by wall clock, 'All' tab, hard reload, table tag, three clicks) was orchestrator-drafted; adopted."
  - "Why now: the 'every other zone was swept by the standing /goal audit loop 2026-08-31 → 09-02, hospitality-authed never was, and the rialto instrument vocabulary now exists' rationale was orchestrator-drafted; adopted and extended with the fact that the audit harness has already paid the reproduction cost at a pinned commit."
  - "Solution hunches: the brief's eight hunches are adopted as hunches only — no design here. A4 is carried as its UI-only half (no seated state without a Prisma change), per the brief's scope boundaries; the Architect may pull the full state in only with a schema-free mechanism."
  - "Success sentence: the brief's sentence is adopted in substance and sharpened to the host running the chosen journey, since the run commits to one journey; the manager (B2) and guest are mentioned only where a finding touches them."
  - "Unknowns: the brief's list was orchestrator-drafted; adopted and extended with what the audit read added (the E2E mock's own UTC-day bug, the two in-flight Timeline PRs #4967/#4944, the StrictMode-only focus suspicion, the 'Live' pill suspicion)."
surfaced:
  - "The authenticated dashboard has zero production evidence in this audit — no Auth0 E2E credentials exist in this environment (on Matt since 2026-08-31). Every dashboard finding is reproduced against fixture data at `5f642aa42`; Ship must record the gap explicitly rather than claim prod evidence."
  - "Frequency in production is unmeasured: n = 0 user reports, and no Sentry or analytics query was run at this stage. The evidence label 'reproduced in harness' is the ceiling until a real host or a live-authenticated probe exists."
  - "Venue timezone vs browser timezone: the brief presents both (local hour for a host in the room; `venue.timezone` for anyone remote and for the guest widget) and defers the choice to Architect. No default is taken here."
  - "Seated state: a real SEATED status or `seatedAt` column is a Prisma migration and out of scope. Whether the UI-only half of A4 is honest enough ('Seated' only when the table is OCCUPIED) is a PRD/Architect call; this stage only records that the full fix is not available to the run."
---

# Idea: The service night on the Timeline

Origin: a feature run started from the autorun brief
(`autorun-brief.md`) and the consolidated UX audit (`ux-audit.md`, four
reports under `audit/`) — not from a backlog seed, so nothing is claimed in
`docs/backlog.md`. The user's request, verbatim: "audit our web app and
determine where we can improve the ux. make all of our ux an intuitive,
award winning experience. Our UX should provide the same service that world
class hospitality would." The audit ranked one service moment first by a
wide margin; this brief is about that moment. Everything else the audit
found is routed (`ux-audit.md` § Routing), not built here.

## Problem

In the sufferer's words — a host on a tablet at the door, **composed from
reproduced findings A1–A8, not a user quote; n = 0 user reports**:

> It's 7:40 on a Thursday. I open the Timeline and there's no line showing
> me where _now_ is — I count columns. The pre-shift Briefing said we had no
> dinner bookings, but the grid is full. A walk-in hits a hiccup, the button
> says "Seating…" for a minute, I hit Escape, and my whole table view is
> gone — just a red box that says `POST /api/v1/reservations/walk-in failed:
500`. I reload the tablet with a party standing at the desk. I seat them
> and nothing changes on the grid, so my co-host seats them again. The "New
> Walk-In" button on the home screen just takes me to the Timeline. Nobody
> built this for someone standing up.

Sharpened against the audit: on the product's core screen, the software
**lies to the host three times an evening and strands them once**.

- **Three lies.** The "now" line vanishes from 17:00 local until midnight in
  every US timezone because `isToday` compares a local date to a UTC one
  (A1). The Briefing's Dinner and Late tabs are empty and a 21:00 party is
  filed under Early because bucketing uses `getUTCHours()` while display uses
  local time (A2). "Seat Guest" writes `CONFIRMED`, so seating is invisible
  on the block, the sidebar and the list, the button is offered again after
  seating, and the phone's "Seated" chip lists parties who have not arrived
  (A4).
- **One stranding.** A failed timeline mutation leaves the dialog on
  "Seating…" forever, replaces the entire grid with the raw request line,
  and never clears — Escape, Next day and Today all keep the grid gone; only
  a hard reload recovers (A3). The copy it shows is the app-wide default:
  `METHOD /path failed: STATUS detail`, surfaced verbatim at 27 + 8 sites
  across operator, manager and guest surfaces (B1). The sibling Reservations
  list fails the same way with no Retry while its KPI cards read
  "Total 0 / Confirmed 0" as if the night were empty (B2).
- **Around those, the friction of a screen not built for standing up.** The
  grid always opens at 11 AM and never scrolls to now; a new walk-in lands
  off-screen, unselected, with no confirmation of which table it took (A5).
  Every promoted "Walk-in" shortcut — ⌘K, the dashboard's primary CTA —
  navigates to a page instead of opening the dialog because `?walkin=true`
  has no reader, and "walk" ⏎ lands on Waitlist (A6). An empty night is a
  bare grid indistinguishable from a wrong date or a failed fetch (A7). The
  26 px table-status tag fires a one-way state change on a brush, with no
  label, confirm or undo (A8). The Timeline loads a lone spinner under an
  already-populated stats row while Briefing and Waitlist use skeletons (A9).
  The Briefing drops the VIP tag the sidebar shows and paints "vegetarian"
  red (A10). Every mutation succeeds silently and drops focus to `<body>`
  (B3).

The bar the user set is the maître d's: anticipate, recognise, never make
the guest do the work, recover gracefully, stay calm, speak like a person,
respect their time, serve everyone the same. Tonight's Service currently
fails six of the eight on its hot path.

## Who has it

- **The host / hostess on a tablet at the door** (`apps/hospitality/docs/USER-FLOWS.md`
  persona; `apps/hospitality/CLAUDE.md` constraint "fast walk-in creation
  (<5 clicks)"), working Flows 2–4 — morning setup, walk-in, managing a
  reservation — from 17:00 to close. This is the primary sufferer: every
  A-cluster finding is on their hot path, and the tablet is where the
  defects are largest (a 384 px two-hour keyhole when the sidebar is open;
  21 sub-44 px targets on the Timeline at 1024×768).
- **The owner-operator on a laptop** (Restaurant Manager persona), who opens
  the Reservations list and reads the KPI zeros as truth when the fetch has
  failed (B2), and who reads a raw request line on five manager surfaces
  (B1).
- **In practice today:** the project owner as sole operator; prospects
  hitting the self-serve path opened by #4492 (2026-08-23); hiring managers
  and clients evaluating the demo in five minutes — exactly the audience
  `PRODUCT.md` charter (a)/(c) names.

**How they cope today:** reading the wall clock and hunting the column by
hand; treating the Briefing's "All" tab as the only trustworthy one; a hard
reload after any failed action (losing the selected date and the sidebar);
using the table-status tag as the only evidence a party arrived; three
clicks for every walk-in (Timeline nav → Walk-in button → dialog) because
the two labelled shortcuts add a step instead of removing one; the
owner-operator doing service from a laptop where the tablet defects are
smaller.

## Why now

- **It is the one zone never audited.** The standing `/goal` audit loop
  (2026-08-31 → 09-02) took rialto, marketing, gen and the API to ≥0.9
  Lighthouse in every category and shipped 8 vibe/UX issues via 12 PRs.
  Hospitality-authed was the zone that loop never reached — blocked on Auth0
  credentials — and it is the product `PRODUCT.md` charter (a) ("make the
  hospitality demo feel like a product a small venue would pay for") and
  theme (2) ("operator daily workflow … 'how is tonight going?'") are about.
- **The reproduction cost has been paid.** The audit harness
  (`apps/hospitality/e2e/.ux-audit/`, git-excluded) reproduces every finding
  at a pinned commit (`5f642aa42`) with fixed clocks and 500 mocks. Verify
  can re-run the same specs as regression evidence; the marginal cost of
  proving the fix is near zero.
- **The vocabulary exists.** `EmptyState`, `Skeleton`, `Toast.action`
  (shipped in #4808, zero hospitality usages), `CommandPalette`,
  `ErrorRetryBanner` (on 9 pages, not the Timeline), `useReturnFocus`, and
  the `describe-auth-error.ts` pattern are all in the tree. Most of the
  hunches below are adoption, not invention.
- **First customers are the stated funnel** (factory-as-a-service playbook).
  Three correctness bugs that fire every evening in every US timezone are
  the kind of thing a prospect notices in the first five minutes of a demo
  run after 17:00.

## Evidence

**n = 0 user reports — never upgrade this label.** Every line below is
either **reproduced in harness** (real browser, `mockApi(page)` fixtures,
`origin/main` @ `5f642aa42`, machine TZ America/Los_Angeles, 2026-09-03) or
**measured on live production** (unauthenticated surfaces only). The
authenticated dashboard has zero production evidence. Detail and probe
paths are in `audit/operator.md`, `audit/xcut.md`, `audit/manager.md`,
`audit/guest.md`.

| ID  | What was measured at `5f642aa42`                                                                                                                                                                                                                                                                                                       | Label                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| A1  | Fixed clock 14:00 local → `nowLineCount: 1`, `nowLineLeftPx: 480`; same date at 20:00 local → `nowLineCount: 0`, `nowLineLeftPx: null`, date label unchanged. Grid is 11 AM–11 PM.                                                                                                                                                     | reproduced in harness |
| A2  | Three local bookings 17:30 / 18:30 / 21:00 → "All" and "Early" list all three; "Dinner" → `[]`; "Late" → `[]`.                                                                                                                                                                                                                         | reproduced in harness |
| A3  | 500 on `POST /api/v1/reservations/walk-in` → `submitText: "Seating…"`, `submitDisabled: true`, `dialogError: null`, `gridCount: 1 → 0`, alert text is the raw request line; unchanged after 10 s, after Escape, after Next day → Today.                                                                                                | reproduced in harness |
| A4  | Seat Guest → `PATCH /reservations/res_e2e_001 {"status":"CONFIRMED"}`; reopened sidebar still offers "Seat Guest"; PENDING party has no Seat button; `COMPLETED` read in 5 files, written in none; phone "Seated" chip lists two un-arrived parties.                                                                                   | reproduced in harness |
| A5  | On load `scrollLeft: 0`, visible headers `Tables, 11 AM … 2 PM`; walk-in success → `newBlockInViewport: false`, `newBlockSelected: "false"`, `sidebarOpen: 0`; tablet with sidebar open → grid 384 px wide.                                                                                                                            | reproduced in harness |
| A6  | `/timeline?walkin=true` → `dialogs: 0`; ⌘K "Walk-in Guest" → `/timeline?walkin=true`, `walkInDialogCount: 0`, focus `<body>`; ⌘K "walk" ⏎ → `/waitlist`; dashboard "New Walk-In" → `/timeline`, `dialogCount: 0`. `grep -rn walkin src` → 0 readers.                                                                                   | reproduced in harness |
| A7  | Empty reservations → tablet grid shows 13 hour headers + 5 table rows and nothing else; phone view renders "No reservations", tablet/desktop do not.                                                                                                                                                                                   | reproduced in harness |
| A8  | T1 tag: `ariaLabel: null`, `title: null`, `ariaPressed: null`; one click → immediate `PATCH /api/v1/tables/tbl_e2e_001/status {"status":"OCCUPIED"}`, `confirmDialogs: 0`, `statusRegions: []`.                                                                                                                                        | reproduced in harness |
| A9  | 5 s delayed `/tables` → at 1742 ms the page shows "Reservations: 4 · Covers: 12 · 2 confirmed · 1 pending" above `spinner: 1, skeletons: 0`; Briefing under the same delay shows three skeleton cards.                                                                                                                                 | reproduced in harness |
| A10 | Guest with `tags: ["VIP"]`, `dietaryRestrictions: ["nut allergy", "vegetarian"]` → `vipTagRendered: false`; both tags in the red error variant; times "05:30 PM" vs the timeline's "1:00 PM"; breadcrumb "Home › Details".                                                                                                             | reproduced in harness |
| B1  | `ApiClientError.message` built at `packages/api-client/src/client.ts:320` as `METHOD /path failed: STATUS detail`; 27 `err.message` sites + 8 `ErrorRetryBanner error={error.message}` sites; only 6 unwrap `problemDetails.detail`. Seen verbatim on 5 manager surfaces and in the guest widget (`POST /api/v1/holds failed: 409 …`). | reproduced in harness |
| B2  | `/reservations` with `GET /api/v1/reservations*` → 500: plain alert, `retryButtons: 0`, four KPI cards read 0.                                                                                                                                                                                                                         | reproduced in harness |
| B3  | Walk-in success → `focusBefore: BUTTON "Walk-in"`, `focusAfterSuccess: BODY`, `toasts: 0`, `liveTexts: []`; cancel confirm → focus `<body>`, `alerts: []`; waitlist add and seat → `focusAfterAdd: BODY`, `statusRegions: []`. 2 `toast()` calls app-wide, `Toast.action` 0 usages.                                                    | reproduced in harness |

Also measured, routed out of this run (for the record, not for scope): on
production every `/public/v1/*` call from the site host returns the SPA's
`index.html` (C1, **live production**, 2026-09-03 — PR #4565 in flight); no
live venue slug resolves, so the public booking loop has zero reach today
(C2, **live production**); Settings → Theme "Dark" cannot be chosen with a
mouse because the rialto `Select` listbox paints under the next `Card` (E2,
reproduced in harness).

**Harness limits that bound this evidence.** `e2e/api-mocks.ts`
`todayReservations()` re-dates fixtures with the UTC day, so after 17:00 PDT
the shared mock itself renders an empty grid (the same defect class as
A1/A2, in the test mock rather than the product); probes overrode it. The
tables mock is not stateful, so A8 uses request shape as evidence, not
post-tap state. `/api/v1/briefing` is unmocked by default; A2/A10 registered
their own mock. Nothing here was observed against production data.

## Solution hunch

The rough shape — hunches, not designs (the brief's § "Solution hunches" is
already at this altitude; Architect decides mechanisms):

1. **Local-day truth.** Compare `isToday` and bucket the Briefing with the
   same local-date/hour formatter the page already uses to build `date`
   (venue timezone via `Intl` if the venue carries one — Architect decides
   which); fix the E2E mock's `todayReservations()` the same way so evening
   runs stop rendering an empty grid.
2. **Non-destructive failure.** Page handlers rethrow so the dialog's own
   catch shows the error and re-enables submit; the page-level error renders
   as a dismissible banner **above** the grid, not instead of it, and clears
   on the next attempt; one `describeApiError(err) → { title, detail,
retryable }` keyed on `ApiClientError` replaces every raw `err.message`
   (pattern exists: `src/lib/describe-auth-error.ts`); `STATUS_LABEL` into
   `ReservationList`; the Reservations list gets the banner with Retry and
   its KPIs read "—" while errored.
3. **Orientation.** On mount and on Today, scroll the grid so now sits a
   third of the way in; after a walk-in resolves, select the returned
   reservation and bring its block into view; an `EmptyState` overlay on the
   grid when there are tables but no reservations, with a Walk-in CTA and a
   Today link; skeleton rows instead of a spinner, with the stats row gated
   on the same loading flag.
4. **One motion to a walk-in.** Read `walkin=true` in `TimelinePage`'s URL
   schema (open the dialog, then strip the param); point the dashboard CTA
   and the palette action at it; rank palette matches prefix > word-start >
   substring.
5. **Seating that shows — UI half only.** Hide "Seat Guest" once the table is
   OCCUPIED, offer it for PENDING, rename the phone chip so "Seated" is only
   said when the table says so. The full `seatedAt` / SEATED state is a
   Prisma change and is routed out unless the Architect finds a schema-free
   way.
6. **Calm controls.** Label the table tag with its action ("Mark occupied");
   fire with an Undo toast (`Toast.action` exists and is unused) or open a
   small menu of valid next states.
7. **Spoken results.** One `role=status` line per mutation ("Seated Priya
   Shah at Table 1"); focus returned to the opener on success paths
   (`useReturnFocus` in the parent-controlled dialogs); the rialto
   `useFocusTrap` restore / `initialFocus` half stays a routed issue unless
   Architect pulls it in with a changeset.
8. **Briefing recognises.** Reuse `GuestCard`'s segment logic on the briefing
   card, compute `isAllergy` per tag, share the timeline's `formatTime`, and
   name the breadcrumb "Tonight's Service".

Held constant throughout: rialto tokens and components only; gold only for
focus/active/in-flight; copy in the house voice (TONE); 44 px targets on
tablet and full keyboard / screen-reader parity (INCLUSIVE) as acceptance
criteria, not afterthoughts.

## Success in one sentence

A host running Thursday dinner on a tablet — from the pre-shift Briefing
through the Timeline, seating walk-ins and surviving a failed request — is
anticipated, recognised, never dead-ended, recovered gracefully, and spoken
to like a person, verified by the audit harness's reproductions no longer
reproducing, unit + E2E tests, the a11y checks, and a live check of every
public surface after deploy (with the authenticated dashboard's lack of
production evidence recorded, not hidden).

## Unknowns & risks

- **No production evidence for the dashboard.** There are no Auth0 E2E
  credentials in this environment (on Matt since 2026-08-31), so the
  authenticated surface cannot be live-verified after deploy. Ship must say
  so explicitly; a green harness is the ceiling.
- **`Hospitality E2E` is advisory and frequently red** for environmental
  reasons — a green CI E2E run may not be provable on a given day. The
  harness reproductions quoted in `verification.md` are the run's regression
  evidence.
- **The E2E mock has the same bug.** `e2e/api-mocks.ts` `todayReservations()`
  uses the UTC day; any evening-clock E2E this run adds needs the mock fixed
  too (allowed: `e2e/**` may be modified, never deleted).
- **Venue vs browser timezone.** The local-hour fix is right for a host
  standing in the venue; `venue.timezone` (IANA, set at onboarding) is right
  for anyone remote and for the guest widget (D1, routed). If Architect picks
  browser-local, remote managers see a different "now" than the room does.
- **Seated state is not available to this run.** A SEATED status or
  `seatedAt` column is a Prisma migration — out of scope. The UI-only half of
  A4 must not pretend: "Seated" is said only when the table is OCCUPIED,
  which is a freely editable, separate fact. The risk is shipping a half that
  still misleads.
- **Concurrent Timeline work.** PR #4967 (memoize reservation layout style in
  `TimelineGrid`) is open and #4944 (`ReservationBlock` style memo) is in
  progress — both touch `components/timeline/`. Decompose must sequence this
  run's `TimelineGrid` items behind their merge or rebase; never silently
  overwrite.
- **Other in-flight runs' files.** `venue-onboarding-floor-plan`
  (`components/floor-plan/**`, `hooks/useFloorPlans*`, FloorPlanEditorPage,
  `packages/types/src/schemas/reservation-requests.ts`,
  `services/reservations/src/routes/tables*`) and `otlp-localhost-default`
  (PR #4969) are live in the main checkout. This run must stay off those
  files.
- **StrictMode focus capture.** The Escape-path focus loss on the hand-rolled
  dialogs may be dev-only (double-invoked effect); verify in a production
  build before claiming or fixing it. Success paths and the rialto `Drawer`
  do not depend on it.
- **Scope creep is the failure mode.** "Award-winning everywhere" is how this
  dies. The PRD commits to ONE journey — cluster A + B1 + B2 + B3-hospitality
  or a strict subset with each drop logged — and routes the rest.
- **Backend gaps the UX cannot paper over.** Production has no Redis
  (waitlist expiry / reminders never scheduled) and `/public/v1` ingress is
  broken (#4565). None of the committed findings depend on either, but any
  drift toward a guest-facing moment must be scoped honestly against them.
- **Suspicions the audit did not reproduce** (do not file as findings): the
  "Live" pill reads Live while the SSE stream is dead; a walk-in's default
  table ignores current table status; late-evening walk-ins may be stamped
  with tomorrow's `date` by the service serializer. Each is a candidate for
  a Verify probe, not a scope item.

Next stage: PRD. `ux: required` is already decided by the brief (user-facing
surface).
