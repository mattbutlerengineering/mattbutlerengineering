# UX audit — Operator service-time journeys (Host persona, tablet-first)

Playbook read: `/Users/mbutler/.claude/plugins/cache/skills/idea-to-prod/0.1.0/skills/audit/references/playbook.md` (§Finding format, §Ordering, §1 Correctness, §10 Inert mechanisms). Tree audited: `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/hospitality-service-ux` at `5f642aa42` (= origin/main). Read-only on source; the only files created are my probe specs under `apps/hospitality/e2e/.ux-audit/specs/operator/` (`probes.spec.ts`, `probes2.spec.ts`).

Path shorthand below: `OUT` = `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/7021d85d-b6aa-49c2-ad30-8ddcadb02175/scratchpad/ux-audit/out/operator`; source paths are relative to the worktree root.

## 1. What was walked

Harness: Vite dev server `http://localhost:3002/hospitality/`, `mockApi(page)` from `apps/hospitality/e2e/api-mocks.ts`, pre-injected admin storageState, machine TZ America/Los_Angeles, audit ran 20:30–22:00 PDT 2026-09-03.

| Surface                                                                                             | Routes            | Viewports                                            | Schemes               | Probes                           |
| --------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- | --------------------- | -------------------------------- |
| Dashboard (quick actions, Live Activity, NeonSign)                                                  | `/dashboard`, `/` | 1024×768, 1440×900, 390×844                          | light + dark (walker) | walk, P07, P14                   |
| Briefing ("Tonight's Service")                                                                      | `/briefing`       | 1024×768 (+walker 3 viewports)                       | light + dark          | P08, P11                         |
| Timeline (grid, sidebar, Walk-in, Edit/Seat/Cancel, table-status tags, empty night, 500, slow load) | `/timeline`       | 1024×768 primary; 1440×900 (P13); 390×844 (P02, P12) | light + dark (walker) | P01–P06, P10, P11, P13, P15, P16 |
| Waitlist (add → seat → cancel → notify)                                                             | `/waitlist`       | 1024×768                                             | light                 | P09, P09b                        |
| ⌘K palette                                                                                          | from `/dashboard` | 1024×768                                             | light                 | P07, P14                         |

Probe outputs: `OUT/probes/P*.json` + `.png`; walker output: `OUT/<route>/{tablet,desktop,phone}.png`, `aria.yaml`, `meta.json`.

**Harness artifacts observed and excluded (not findings):**

- `GET /api/health/system` and SSE `GET /api/v1/events/stream` → `ERR_CONNECTION_REFUSED` (dead `localhost:3999`). Every probe's `failed[]` filtered these.
- `/api/v1/briefing` is not mocked by `mockApi`; the walker's briefing screenshots show the fetch-failure state. P08 registered its own briefing mock.
- `api-mocks.ts` `todayReservations()` re-dates fixtures with `toISOString().slice(0,10)` (UTC day). After 17:00 PDT that is tomorrow's date, so the shared mock renders an empty timeline. Probes register a local-date override after `mockApi` (later `page.route` wins). Note this is the same UTC-vs-local bug class as findings CORRECTNESS-01/02 — the harness has it too, but I am not filing harness code.
- `PATCH /api/v1/tables/:id/status` mock always returns `OCCUPIED` and `GET /tables` is not stateful, so post-tap tag text in P15 reverts to fixture state. Only request shape / affordance is used as evidence.
- Waitlist `GET` mock returns only `status === "waiting"`, so a notified row vanishes from the list (P09 confusion; P09b `afterNotify.note`). Notify-then-seat could not be observed end-to-end.

## 2. Findings (ranked)

### [RECOVER-01] Stop replacing the whole timeline with the walk-in error and leaving the dialog stuck in "Seating…"

- **Evidence**: `apps/hospitality/src/pages/TimelinePage.tsx:277-289` — `handleWalkIn` catches the rejection and calls `setError(...)` without rethrowing, so `WalkInDialog` never learns the submit failed; `TimelinePage.tsx:410-422` — render chain `isLoading ? spinner : fetchError ? alert : error ? <div role="alert">{error}</div> : grid` swaps the entire grid for the error box; `setError(null)` is never called anywhere in the file, so the box is permanent. `apps/hospitality/src/components/timeline/WalkInDialog.tsx:81-92` — `setIsLoading(false)` only runs in the dialog's own `catch`, which is never reached. `OUT/probes/P03-walkin-500.json`, `P03-walkin-500-after-submit.png`, `-after-escape.png`, `-after-today.png`.
- **Reproduction**: 500 on `POST /api/v1/reservations/walk-in` (problem+json). After submit: `dialogVisible:true`, `submitText:"Seating…"`, `submitDisabled:true`, `dialogError:null`, `gridCount:0`, `alertText:["POST /api/v1/reservations/walk-in failed: 500 Unexpected error"]`. Escape closes the dialog; the grid stays gone. Next day → Today: still `gridCount:0`, same alert. Only a full reload recovers.
- **Impact**: One failed walk-in on a busy night removes the host's entire table view until someone reloads the tablet; the dialog gives no signal that anything went wrong (button just says "Seating…" forever), and the error text is a raw request string, not a sentence for a person.
- **Effort**: S
- **Risk**: LOW — rethrow from `handleWalkIn` (dialog already has a catch/error UI), render `error` as a dismissible `Alert` above the grid instead of in place of it, clear it on the next successful mutation.
- **Keeps it fixed**: E2E: mock walk-in 500 → expect `getByTestId("timeline-grid")` still visible, dialog shows an error and the submit button re-enables; `Escape` then `Walk-in` again → no stale alert. Nothing today.
- **Fix sketch**: `handleWalkIn` rethrows after `setError`; the dialog's own `catch` shows the message and re-enables submit. Move the `error` branch out of the grid ternary into a dismissible banner (`ErrorRetryBanner` already exists on the dashboard) and reset it in each handler's `try`.

### [CORRECTNESS-01] Compute the timeline "now" line from the local calendar day, not the UTC day

- **Evidence**: `apps/hospitality/src/components/timeline/TimelineGrid.tsx:141-146` — `isToday = date === toDateString(currentTime)`; `packages/types/src/date.ts:3` — `toDateString` is `toISOString().substring(0,10)` (UTC). The page's selected date is the local `en-CA` date, so from 17:00 PDT to midnight `isToday` is false and `currentTimeOffset` returns `null`. `OUT/probes/P01-nowline.json`, `P01-timeline-1400.png`, `P01-timeline-2000.png`.
- **Reproduction**: `page.clock.setFixedTime` 14:00 local → `nowLineCount:1, nowLineLeftPx:480`. Same date at 20:00 local → `nowLineCount:0, nowLineLeftPx:null`, date label still "Thursday, September 3, 2026". Grid range is 11 AM–11 PM (`startHour=11,endHour=23`), so the line vanishes for the entire dinner service in any US timezone.
- **Impact**: The single most-glanced orientation cue on the grid is missing exactly during service. Hosts fall back to reading the clock and hunting the column by hand.
- **Effort**: S
- **Risk**: LOW — one comparison; `toLocaleDateString("en-CA")` is already the convention on the page side.
- **Keeps it fixed**: Unit test on `TimelineGrid` with a fixed clock at 20:00 local asserting the now-line renders; `timeline-interaction.spec.ts` currently has no evening-clock case.
- **Fix sketch**: Compare against a local-date formatter (the same one the page uses to build `date`), or accept an `isToday` prop computed once by the page.

### [CORRECTNESS-02] Bucket briefing segments by local hour so Dinner and Late are not empty

- **Evidence**: `apps/hospitality/src/pages/BriefingPage.tsx:35` — `getSegmentForTime` uses `new Date(isoString).getUTCHours()`; `BriefingPage.tsx:43-45` — `formatTime` renders local time with `hour:"2-digit"`, so the card shows one clock while the segment logic uses another. `OUT/probes/P08-briefing.json`, `P08-briefing-dinner.png`, `P08-briefing-all.png`.
- **Reproduction**: Three local bookings at 17:30, 18:30, 21:00 (UTC 00:30, 01:30, 04:00 next day). "All" and "Early" list all three; "Dinner" → `[]`; "Late" → `[]`. The 9 PM party is filed under Early.
- **Impact**: The pre-shift briefing's whole purpose is segmenting the night; in any US timezone the Dinner and Late tabs are empty and Early holds everything, which reads as "no dinner bookings tonight".
- **Effort**: S
- **Risk**: LOW — `getHours()`; the venue-timezone question is real but the current behaviour is wrong for every zone except UTC.
- **Keeps it fixed**: Unit test: an 18:30 local booking is in the Dinner segment. Nothing today.
- **Fix sketch**: Use local `getHours()` (or the venue timezone via `Intl.DateTimeFormat(..., {timeZone})` when the venue carries one); same formatter for display and bucketing.

### [CORRECTNESS-03] Make "Seat Guest" change state — seating is currently invisible and unrepeatable to detect

- **Evidence**: `packages/types/src/reservation.ts:6` — `ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW"` (no seated state); `apps/hospitality/src/hooks/useTimelineData.ts:122-124` — `seatGuest` PATCHes `{status:"CONFIRMED"}` then flips the table to OCCUPIED; `apps/hospitality/src/pages/TimelinePage.tsx:173-175` — "Seat Guest" shows whenever `status === "CONFIRMED"`, so it is offered again after seating and never offered for PENDING; `grep -rn COMPLETED apps/hospitality/src` — read in 5 files, written in none (no Complete action exists — §10 inert mechanism); `apps/hospitality/src/components/timeline/TimelineMobileView.tsx:11,146` — phone chip labelled "Seated" filters `CONFIRMED || COMPLETED`. `OUT/probes/P05-seat.json`, `P05-sidebar-after-seat-reopen.png`, `P12-phone.json`, `P12-phone-timeline-seated.png`.
- **Reproduction**: Alice (CONFIRMED, T1). Click Seat Guest → requests `PATCH /reservations/res_e2e_001 {"status":"CONFIRMED"}` + `PATCH /tables/tbl_e2e_001/status {"status":"OCCUPIED"}`; sidebar closes; reopen → status "Confirmed", block aria "Alice Johnson, party of 4, 11:00 AM, confirmed", buttons still include "Seat Guest". Bob (PENDING) sidebar: no Seat button at all. Phone "Seated" chip lists Alice and Carol, both un-arrived CONFIRMED parties.
- **Impact**: A host cannot tell from the grid or the list who has arrived; the only trace of seating is the table tag, which is a separate, freely-editable thing. Two hosts can "seat" the same party twice with no signal. There is no way to complete a reservation, so COMPLETED stats/filters can never be non-empty, and a PENDING walk-up who is standing at the desk cannot be seated without first finding Edit.
- **Effort**: M (types + service + UI) — or S for the UI-only half (hide Seat after seating via table state, rename the chip, allow Seat for PENDING).
- **Risk**: MED — touches the shared status enum and `services/reservations`; needs a migration or a `seatedAt` timestamp rather than a new enum value.
- **Keeps it fixed**: E2E: seat → block aria includes "seated"; Seat button absent; Complete present. Unit test on the mobile filter label/value pairing.
- **Fix sketch**: Add `seatedAt` (or a SEATED status) written by `seatGuest`; render it on the block/sidebar and gate the button on it; add "Complete" writing COMPLETED (and freeing the table to DIRTY); allow Seat for PENDING; rename the phone chip to "Confirmed" until seatedness exists.

### [ANTICIPATE-01] Make every "Walk-in" entry point actually open the walk-in dialog

- **Evidence**: `apps/hospitality/src/hooks/use-command-palette.ts:56-58` — "Walk-in Guest" navigates to `/timeline?walkin=true`; `grep -rn "walkin" apps/hospitality/src` — no reader for that param (`TimelinePage` `timelineFilterSchema` only parses `date`) — §10 inert mechanism; `apps/hospitality/src/pages/HomePage.tsx:64-65` — dashboard "New Walk-In" is `navigate("/timeline")`; `packages/rialto/src/components/CommandPalette/CommandPalette.tsx:68-72,110` — `matchesQuery` is substring `includes`, no ranking, so "walk" matches "Waitlist" first. `OUT/probes/P14-palette.json`, `P14-after-walkin-guest.png`, `P07-walkin-entrypoints.json`, `P07-after-palette-walkin.png`.
- **Reproduction**: ⌘K, type "walk-in", click "Walk-in Guest" → `url: /timeline?walkin=true`, `walkInDialogCount: 0`, focus `<body>`. ⌘K, type "walk", Enter → lands on `/waitlist`. Dashboard "New Walk-In" → `/timeline`, `dialogCount: 0`. Persona constraint in `apps/hospitality/CLAUDE.md` is "fast walk-in creation (<5 clicks)"; the fastest path is currently Timeline nav → Walk-in button → dialog (three), and the two labelled shortcuts add a step instead of removing one.
- **Impact**: Both promoted shortcuts promise a walk-in and deliver a page; the ⌘K keyboard path silently sends a host to the wrong feature.
- **Effort**: S
- **Risk**: LOW
- **Keeps it fixed**: E2E: palette "Walk-in Guest" → `getByRole("dialog", {name:/walk-in/i})` visible; dashboard "New Walk-In" likewise. Palette unit test: exact-prefix matches rank above substring matches.
- **Fix sketch**: Read `walkin=true` in `TimelinePage` (open dialog, then strip the param), point the dashboard button at the same URL, and rank palette results (prefix > word-start > substring).

### [INCLUSIVE-01] Return focus and announce the result after every dialog, drawer, and mutation

- **Evidence**: `packages/rialto/src/hooks/useFocusTrap.ts:35,42,47` — focuses first/last focusable, never restores; `packages/rialto/src/components/Drawer/Drawer.tsx` — only `useFocusTrap`, no restore path; `apps/hospitality/src/components/timeline/WalkInDialog.tsx:40-47` and `CancelReservationDialog.tsx:36-43` — restore runs only in `handleClose`, i.e. on Cancel/Escape/backdrop; the success path unmounts via the parent (`TimelinePage.tsx:284 setShowWalkInDialog(false)`) and never restores; `WaitlistPage.tsx:386-392` has `aria-live` regions but nothing is written to them on seat. `OUT/probes/P04-walkin-success.json`, `P06-focus.json`, `P09b-waitlist.json`, `P16-focus-timing.json`.
- **Reproduction**: Walk-in success: `focusBefore: BUTTON "Walk-in"` → `focusAfterSuccess: BODY`, `liveRegions:["",""]`, `statusTexts:[]`. Cancel confirm: `focus: BODY`, `alerts:[]`, `status:[]`. Edit drawer Escape: `editFocusAfterEsc: BODY`. Waitlist add and seat: `focusAfterAdd: BODY`, `afterSeat.focus: BODY`, `statusRegions:[]`. P16: after Escape on walk-in dialog, active element is `<body>` at t0/t50/t350 while the trigger button is still in the DOM.
- **Impact**: Keyboard/switch/screen-reader hosts lose their place after every action and hear nothing — the walk-in "succeeded" only by the dialog disappearing. Nielsen: visibility of system status; WCAG 2.4.3.
- **Effort**: S–M (rialto `Drawer`/`useFocusTrap` restore + one `announce()` call per mutation)
- **Risk**: LOW — rialto change is additive (capture `document.activeElement` on open, restore on unmount).
- **Keeps it fixed**: Rialto a11y test: open/close Drawer restores focus to the trigger. Hospitality E2E: after walk-in success `document.activeElement` is the Walk-in button and a `role="status"` contains the guest/table.
- **Fix sketch**: `useFocusTrap` captures the opener in the effect and restores it in the cleanup (unmount covers success paths); move the two custom dialogs onto that; write a one-line status ("Seated Priya Shah at Table 1") into the existing `aria-live` region after each mutation.

### [TIME-01] Orient the grid to now and to the block the host just created

- **Evidence**: `apps/hospitality/src/components/timeline/TimelineGrid.tsx` — no `scrollLeft`/`scrollIntoView` anywhere (grep), `startHour=11` so the initial viewport is always 11 AM–2 PM; `TimelinePage.tsx:284` — after walk-in the dialog closes and nothing selects or scrolls to the new reservation. `OUT/probes/P01-nowline.json`, `P04-walkin-success.json`, `P04-walkin-success.png`, `P13-layout.json`, `P13-tablet-sidebar-open.png`.
- **Reproduction**: At 14:00 local the now-line is at 480px, `scrollLeft:0`, `clientWidth:702`, visible headers `["Tables","11 AM","12 PM","1 PM","2 PM"]` — in view only because the clock is early; at any dinner hour it would be off-screen even if CORRECTNESS-01 were fixed. Walk-in success: `blocksAfter:5`, `newBlockInViewport:false`, `newBlockSelected:"false"`, `sidebarOpen:0`. Tablet with sidebar open: grid width 384px (≈2 hour columns), sidebar 320px.
- **Impact**: Every visit starts at lunch; every walk-in lands off-screen with no confirmation of which table it took, so the host scrolls to verify. On the tablet the working grid is a two-hour keyhole.
- **Effort**: S (scroll-to-now + select new block); M if the sidebar becomes an overlay at 1024px.
- **Risk**: LOW
- **Keeps it fixed**: E2E at a fixed evening clock: now-line `boundingBox().x` within the grid viewport on load; after walk-in the new block is selected and in viewport.
- **Fix sketch**: On mount and on Today, `scrollLeft = nowOffset - clientWidth/3`; after `createWalkIn` resolves, select the returned reservation (opens sidebar) and `scrollIntoView` its block; on ≤1024px render the sidebar as an overlay drawer over the grid.

### [TIME-02] Give service-time controls 44px touch targets

- **Evidence**: `apps/hospitality/src/pages/TimelinePage.tsx:322,339,356,365` — all header controls `size="sm"`; `apps/hospitality/src/components/TableStatusBadge.tsx:29` — status control is a `Tag` (26px tall); `OUT/probes/P10-touch-targets.json` (21 elements `under44:true`), `P10-walkin-dialog-tablet.png`.
- **Reproduction**: Measured at 1024×768: Walk-in 50×23, Previous/Next day 27×36, table-status tags 52–78×26, walk-in party-size buttons ~32×23, sidebar nav rows 239×32. Reservation blocks (176×51) and waitlist Seat/Notify/Cancel (52–66×54) pass.
- **Impact**: The controls a host taps most under time pressure on a tablet — Walk-in, the day arrows, party size, and the table state — are the smallest on the page; mis-taps on the status tag also fire a state change (see CALM-01). WCAG 2.5.8 target size.
- **Effort**: S
- **Risk**: LOW — sizes only; `Button` already has a default size.
- **Keeps it fixed**: E2E bounding-box assertion (≥44px) on the header controls and party-size buttons at 1024×768; nothing today.
- **Fix sketch**: Drop `size="sm"` on the timeline header at ≥768px, give `TableStatusBadge` a 44px hit area (padding, not glyph size), make party-size buttons 44×44.

### [CALM-01] Make a table-status tap say what it will do, and make it reversible

- **Evidence**: `apps/hospitality/src/components/TableStatusBadge.tsx:24-31` — `Tag` with `onClick`, no `aria-label`/`title`, text is the _current_ state; `TimelineGrid.tsx` (TableStatusBadge onClick) advances `TABLE_VALID_TRANSITIONS[status][0]` (`packages/types/src/reservation.ts:32`, one-way AVAILABLE→OCCUPIED→DIRTY→READY→AVAILABLE) with no confirmation; `OUT/probes/P15-table-status.json`, `P15-table-status-tap.png`.
- **Reproduction**: T1 tag: text "Available", `ariaLabel:null`, `title:null`, `ariaPressed:null`, cursor `pointer`. One click → immediate `PATCH /api/v1/tables/tbl_e2e_001/status {"status":"OCCUPIED"}`, `confirmDialogs:0`, `statusRegions:[]`. (Post-tap text reverting to "Available" is the harness mock, excluded.) Undoing one accidental tap requires three more taps around the cycle.
- **Impact**: A 26px pill that reads "Available" and, when brushed, silently marks the table occupied — with no label of the next state, no confirm, no undo — on the tablet's most crowded row. Nielsen: user control and freedom.
- **Effort**: S
- **Risk**: LOW
- **Keeps it fixed**: Unit test: badge has `aria-label="Table 1: Available. Mark as Occupied"`; E2E: tap opens a menu/undo toast rather than PATCHing directly.
- **Fix sketch**: Label the control with the action ("Mark occupied"), and either open a small menu of valid next states or fire immediately with an undo toast that PATCHes back.

### [NO-DEAD-END-01] Give the empty night a message and a next action

- **Evidence**: `apps/hospitality/src/pages/TimelinePage.tsx:422` — empty state only when `tables.length === 0`; zero reservations with tables present renders the bare grid; `OUT/probes/P02-empty.json`, `P02-timeline-empty-tablet.png`, `P02-timeline-empty-phone.png`.
- **Reproduction**: Empty reservations mock: tablet grid shows 13 hour headers + 5 table rows and nothing else; stats read "Reservations: 0 · Covers: 0 · 0 confirmed"; the only actionable button in `main` is "Walk-in". Phone view does render "No reservations" (TimelineMobileView), tablet/desktop do not.
- **Impact**: A slow night, a wrong date, and a failed fetch look identical on the tablet; a host has no cue whether to seat walk-ins, check the date, or reload.
- **Effort**: S
- **Risk**: LOW
- **Keeps it fixed**: E2E: empty reservations → `EmptyState` text visible on tablet with a Walk-in CTA. Nothing today.
- **Fix sketch**: Overlay rialto `EmptyState` ("No reservations for Thursday — add a walk-in or jump to Today") on the grid when `reservations.length === 0`, keeping the table rows visible beneath.

### [RECOGNIZE-01] Carry guest recognition into the briefing and stop painting every diet tag as an allergy

- **Evidence**: `apps/hospitality/src/pages/BriefingPage.tsx` — `guest.tags` is never rendered (grep: no `tags` read on the entry card) while the timeline sidebar's `GuestCard` renders VIP/visit segments; `BriefingPage.tsx:69` `hasAllergy` is computed once per guest and `:94`/`:120` applies `variant={hasAllergy ? "error" : "accent"}` to _all_ dietary tags; `BriefingPage.tsx:45` `hour:"2-digit"` → "05:30 PM" while the timeline shows "1:00 PM"; `apps/hospitality/src/components/DashboardLayout.tsx:34,233` — `ROUTE_LABELS` lacks `briefing`, so the crumb is "Home › Details". `OUT/probes/P08-briefing.json`, `P08-briefing-all.png`, `OUT/briefing/tablet.png`.
- **Reproduction**: Guest with `tags:["VIP"]` and `dietaryRestrictions:["nut allergy","vegetarian"]`: `vipTagRendered:false`, `regularTagRendered:false`, `visitOrdinalRendered:true`; screenshot shows both "nut allergy" and "vegetarian" in the red error variant; times "05:30 PM / 06:30 PM / 09:00 PM"; breadcrumb "Home › Details".
- **Impact**: The briefing is the page meant to prime recognition ("VIP, 12th visit"), and it drops the VIP tag the sidebar shows; a kitchen skimming red tags sees "vegetarian" as an allergy. The two clock formats and the "Details" crumb are small tells that the page is not the same product as the timeline.
- **Effort**: S
- **Risk**: LOW
- **Keeps it fixed**: Unit tests: VIP tag rendered on the briefing card; only allergy tags get `error` variant; crumb reads "Tonight's Service".
- **Fix sketch**: Reuse `GuestCard`'s segment logic on the briefing card; compute `isAllergy(tag)` per tag; share the timeline's `formatTime`; add `briefing: "Tonight's Service"` to `ROUTE_LABELS`.

### [CALM-02] Use the skeleton, not a spinner, while the timeline loads — and don't show counts before the grid

- **Evidence**: `apps/hospitality/src/pages/TimelinePage.tsx:410-413` — loading branch renders a spinner where the grid goes, while the stats row above it is already populated from the reservations query; `BriefingPage.tsx:57-59` and `WaitlistPage` use `Skeleton` cards for the same state. `OUT/probes/P11-slow-load.json`, `P11-timeline-loading-1300ms.png`, `P11-briefing-loading-1200ms.png`.
- **Reproduction**: 5 s delayed `/tables`: at 1742 ms the page shows "Reservations: 4 · Covers: 12 · 2 confirmed · 1 pending" above a lone spinner (`spinner:1, skeletons:0`); briefing under the same delay shows three skeleton cards.
- **Impact**: The two pages a host opens back-to-back before service load with different idioms, and the timeline tells you the answer (4 reservations) before it can show you where they are — the layout then jumps when the grid arrives.
- **Effort**: S
- **Risk**: LOW
- **Keeps it fixed**: E2E with delayed `/tables`: timeline shows `Skeleton` rows, not a spinner. Nothing today.
- **Fix sketch**: Render 5 skeleton table rows in the grid area while loading (rialto `Skeleton`), and gate the stats row on the same loading flag.

## 3. Suspicions (not reproduced or harness-confounded)

- **Escape-path focus loss on `WalkInDialog` / `CancelReservationDialog` may be dev-only.** `main.tsx:346` wraps the app in `StrictMode`, whose double-invoked effect re-captures `document.activeElement` _after_ `useFocusTrap` has moved focus into the dialog, so `previouslyFocusedRef` points at the dialog's own first control and `handleClose` restores to a node being unmounted → `<body>`. In a production build the Escape path probably restores correctly; the success paths and the rialto `Drawer` (INCLUSIVE-01) do not depend on this. Needs a production-build probe.
- **"Live" pill reads "Live" while the SSE stream is dead.** `OUT/probes/P13-layout.json`: `live:"Live"`, `offlineBanner:[]` with `/api/v1/events/stream` refused. I did not trace the indicator's source; if it is not derived from actual `EventSource` state it is a false-reassurance during outages.
- **Waitlist Notify may drop the guest from the host's list.** P09/P09b show notified rows vanish, but the shared mock's `GET` filter is the proven cause; whether the real `GET /api/v1/waitlist` returns `notified` entries was not verified.
- **Waitlist seat gives no confirmation or handoff.** `P09b afterSeat`: row disappears, `statusRegions:[]`, no toast, no link to the timeline block just created (`POST /reservations/walk-in` did fire). Functionally correct; recorded under INCLUSIVE-01 for the announcement, but the missing "Seated at Table 1 → view" handoff is a separate ANTICIPATE gap I did not measure against a design intent.
- **Party-size default of 2 + smallest-fit table default** (`WalkInDialog.tsx:26-35`, P04 `tableDefaultFor2: "Table 3 (seats 2)"`) is good, but it silently ignores current table status — an OCCUPIED/DIRTY table can be the default. Not probed with a fixture where the smallest table is dirty.
- **Multi-hour drift of the reservation date filter on the page side.** `TimelinePage` filters `r.date === selectedDate`; the server serializer (`services/reservations/src/services/serializers.ts:124`) uses UTC `toDateString` on a `@db.Date` column, which is sound, but a reservation created late evening local via walk-in may be stamped with tomorrow's `date` by the service. Not verified against the service.

## 4. Already good

- Dark scheme honored end-to-end (walker `prefers-color-scheme: dark` screenshots; user preference `theme:"light"` respected when set).
- Walk-in dialog: party size defaults to 2, table default is smallest fit (`tableDefaultFor2: T3 (2)`, `tableDefaultFor4: T1 (4)`), first control focused on open, Escape/backdrop/Cancel all close.
- Cancel dialog: focus lands on the Reason select, default reason pre-filled, buttons are "Keep Reservation" / "Cancel Reservation" (no ambiguous "Cancel" in a cancel dialog).
- Timeline sidebar `GuestCard`: VIP tag, visit count, dietary restrictions, contact — good RECOGNIZE surface; reservation blocks carry full aria names ("Carol Davis, party of 6, 1:00 PM, confirmed").
- Waitlist: inline validation ("Guest name is required." with focus kept in the field), `Skeleton` loading, `EmptyState` "No one waiting", 54px-tall action buttons, honest partial-failure message when walk-in succeeds but `markSeated` fails (`WaitlistPage.tsx:244-251`), `aria-live` regions present.
- Keyboard grid navigation exists and is spec-covered (`apps/hospitality/e2e/timeline-keyboard-nav.spec.ts`; not re-run by me); Enter on the Walk-in button opens the dialog (P16).
- Dashboard `ErrorRetryBanner` and the backlog's "Completed Items" (timeline mobile view, deep links, breadcrumbs on other routes, unsaved-changes warning, venue selector) held up in the browser except as noted in RECOGNIZE-01 (briefing crumb).
- Timeline stats row and "Live" indicator render on all three viewports; phone view swaps to a list with status chips and a bottom drawer for details.

## 5. Coverage

| Scope item                                      | Status                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Flow 2 — dashboard/briefing → timeline          | audited-found (CORRECTNESS-02, RECOGNIZE-01, CALM-02, ANTICIPATE-01)                                       |
| Flow 2 — floor plan                             | not-reached (editor not probed; excluded as venue-onboarding floor-plan step per brief)                    |
| Flow 2 — table status toggles                   | audited-found (CALM-01, TIME-02)                                                                           |
| Flow 3 — walk-in                                | audited-found (RECOVER-01, ANTICIPATE-01, INCLUSIVE-01, TIME-01)                                           |
| Flow 4 — block → sidebar → Edit / Seat / Cancel | audited-found (CORRECTNESS-03, INCLUSIVE-01); Edit drawer contents audited-clean apart from focus return   |
| Flow 4 — Complete                               | audited-found: no Complete action exists (CORRECTNESS-03)                                                  |
| Waitlist add → seat → cancel                    | audited-found (INCLUSIVE-01; see Suspicions for handoff)                                                   |
| Waitlist notify                                 | partially audited — harness mock drops notified rows (Suspicions)                                          |
| "Pager instrument"                              | not applicable — no such component in `packages/rialto` (only `FlipDot`, `NeonSign`, `Handshake`)          |
| ⌘K palette                                      | audited-found (ANTICIPATE-01)                                                                              |
| Dashboard quick actions                         | audited-found (ANTICIPATE-01)                                                                              |
| Dashboard Live Activity + NeonSign              | audited-clean at render level; live updates not-reached (SSE dead in harness); NeonSign excluded per #4746 |
| BriefingPage                                    | audited-found (CORRECTNESS-02, RECOGNIZE-01)                                                               |
| Keyboard-only timeline grid                     | audited-clean (existing spec + P16); focus return audited-found                                            |
| Focus placement/return for dialogs/drawers      | audited-found (INCLUSIVE-01; Escape path demoted to Suspicion for StrictMode)                              |
| Loading state (slow mock)                       | audited-found (CALM-02)                                                                                    |
| Mutation failure (500 on walk-in POST)          | audited-found (RECOVER-01)                                                                                 |
| Empty night                                     | audited-found (NO-DEAD-END-01)                                                                             |
| Viewports 1024×768 / 1440×900 / 390×844         | all reached; tablet primary for probes, desktop P13 + walker, phone P02/P12 + walker                       |
| Light + dark                                    | both reached via walker; probes ran light                                                                  |
