---
stage: verify
run: feature:hospitality-service-ux
date: 2026-09-11
assumptions:
  - "A9.1's 1 s bound is read as the PRD's own fallback of 2 s. The PRD's timing assumption says: 'What would change it: Verify measuring the harness cannot hold a 1 s bound reliably, in which case the bound loosens to 2 s, never to eventually.' Measured: the first skeleton frame lands at 1355 ms against the Vite dev server, and that number includes dev-server module loading, not app work. The committed E2E (`e2e/timeline.spec.ts:47`) still asserts the 1 s bound against its own mocked page and passes; the harness figure is the one that could not hold it."
  - "`pnpm --dir apps/hospitality test:e2e` cannot run in this environment (no Auth0 ROPC credentials — re-confirmed this session, output quoted below). The sanctioned substitute `e2e/.ux-audit/playwright.suite.config.ts` was used instead: same `testDir` (`../../e2e`), same `testIgnore`, the synthetic unsigned-OIDC `storageState.json` in place of a real login, `workers: 1`. It runs the same committed `e2e/*.spec.ts` files; only the authentication step differs."
  - "Six of the audit's operator probes (P05, P06, P07, P09, P12, P13) can no longer run: each waits on a locator this run deliberately removed or renamed (`reservation-detail-sidebar` is now desktop-only, the dashboard CTA is 'Walk-in' not 'New Walk-In', the phone chip is 'Confirmed' not 'Seated', the waitlist row's 'Cancel' was renamed). A probe that cannot find its locator is indicative, not conclusive, so eleven supplementary blocks (V1–V11) were written into the same git-excluded harness to re-measure the same subject matter through the shipped surfaces — observational `record()` only, never an `expect()` on the outcome, so a green test never stands in for a number."
  - "The five `xcut` probes that assert the buggy baseline (A, B, C, E, C2) are read inverted: they were written to pass while the defect was present, so a failure is the evidence the defect is gone. Their failure text is quoted rather than their pass/fail flag."
---

# Verification: The service night on the Timeline

## Summary

**37 of 42 committed criteria PASS, 5 PARTIAL, 0 FAIL.** Every partial is a
documented narrowing the PRD itself anticipated or a stage boundary, not a
regression: A6.2's "New Floor Plan" half is routed to another run, A7.1 ships
one contextual action where the PRD asked for two, A9.1's 1 s bound is read at
the PRD's own 2 s fallback, B1.1's Add-Table and Onboarding-launch surfaces sit
inside this run's Out of scope, and NF5's PR / CI Gate / Review clauses belong
to stages after this one.

All repo gates are green: `apps/hospitality` and `packages/rialto` lint,
typecheck and test; `pnpm regen --check`; `pnpm exec prettier --check
docs/features/hospitality-service-ux/`. The committed E2E suite runs 102 tests
in 23 files, 101 passed / 1 failed — the single failure is a pre-existing,
non-deterministic `realtime-collaboration.spec.ts` flake, re-characterised this
session and re-confirmed as not caused by this run.

Two things this stage could **not** verify, recorded in full under
[Not verified](#not-verified): the authenticated dashboard has **no production
evidence** (no Auth0 E2E credentials exist), and TDD order ("failing test
first") cannot be re-observed after the fact.

One PRD open question routed to Verify was answered, and the answer is a
refutation — see [Findings](#findings).

### Evidence strategy

The PRD requires each criterion's reproduction to **fail at `5f642aa42` and
pass after**. Three legs carry that, because the baseline tree cannot be
re-run against a harness that post-dates it:

1. **Observational probe records** — the audit's own probes, re-run today,
   compared against the baseline numbers the PRD quotes inline (e.g. A8.1's
   "today `ariaLabel: null`").
2. **Assertive `xcut` probes** — written to pass _while the defect was
   present_. They now fail, and the failure text names the defect's absence.
3. **Baseline-absence proof** — every new module and its test is literally
   absent at `5f642aa42`, so the test could not have compiled there, let
   alone passed:

```
$ git cat-file -e 5f642aa42:<path>   # for each new module
ABSENT   apps/hospitality/src/utils/local-clock.ts
ABSENT   apps/hospitality/src/utils/seated.ts
ABSENT   apps/hospitality/src/utils/timeline-intent.ts
ABSENT   apps/hospitality/src/lib/describe-api-error.ts
ABSENT   apps/hospitality/src/lib/describe-api-error.guard.test.ts
ABSENT   apps/hospitality/src/components/timeline/TableStatusMenu.tsx
ABSENT   apps/hospitality/src/components/timeline/TimelineEmptyNight.tsx
ABSENT   apps/hospitality/src/components/timeline/TimelineSkeleton.tsx
ABSENT   apps/hospitality/src/components/KpiStat.tsx
ABSENT   apps/hospitality/src/hooks/useStatusMessage.ts
ABSENT   apps/hospitality/src/hooks/useFocusAfter.ts
ABSENT   apps/hospitality/src/components/timeline/useScrollToNow.ts

$ git cat-file -p 5f642aa42:packages/rialto/src/components/CommandPalette/CommandPalette.tsx | grep -c rankCommandMatch
0
$ git cat-file -p 5f642aa42:packages/rialto/src/components/Drawer/Drawer.tsx | grep -c compact
0
```

### The `hospitality-smoke-test` skill — checked, not used

The brief asked whether the project skill scoped to `apps/hospitality/` is the
right tool for a local smoke pass. It is not: its entire body is one command,
and that command is the one this environment cannot run.

```
## Usage
pnpm --dir apps/hospitality test:e2e
```

Re-confirmed this session:

```
$ pnpm --dir apps/hospitality test:e2e
Error: Missing required E2E auth env vars: E2E_AUTH0_DOMAIN, E2E_AUTH0_CLIENT_ID, E2E_AUTH0_AUDIENCE, E2E_AUTH_EMAIL, E2E_AUTH_PASSWORD
...
    at validateAuth0Config (apps/hospitality/e2e/auth-helpers.ts:39:11)
    at apps/hospitality/e2e/auth.setup.ts:16:1
 ELIFECYCLE  Command failed with exit code 1.
```

Its verification step (`node plugins/acmm/scripts/audit.js --project
apps/hospitality`) scores repo maturity, not this run's behaviour. The
sanctioned substitute config was used instead (assumption 2).

## Criteria & evidence

### A1.1 — now-line renders at 20:00 and 14:00 local, same date label

- Check: operator probe P01, fixed local clock at 14:00 and 20:00.
- Evidence:
  ```json
  "local_1400": { "nowLineCount": 1, "nowLineLeftPx": 480, "scrollLeft": 305,
                  "visibleHourHeaders": ["Tables","1 PM","2 PM","3 PM","4 PM","5 PM"],
                  "browserNowISO": "2026-09-11T21:00:00.000Z", "dateLabel": "Friday, September 11, 2026" },
  "local_2000": { "nowLineCount": 1, "nowLineLeftPx": 1200, "scrollLeft": 978, "scrollWidth": 1680,
                  "visibleHourHeaders": ["Tables","7 PM","8 PM","9 PM","10 PM","11 PM"],
                  "browserNowISO": "2026-09-12T03:00:00.000Z", "dateLabel": "Friday, September 11, 2026" }
  ```
  At 20:00 local the browser's UTC day has already rolled to the 12th; the line
  still renders (`nowLineCount: 1`) at 1200 px inside a 1680 px grid, and the
  date label is byte-identical between the two clocks. Unit half:
  ```
  ✓ TimelineGrid > now-line > renders the now-line at 20:00 local on today's date
  ✓ TimelineGrid > now-line > renders the now-line at 14:00 local on today's date
  ```
- Result: PASS

### A1.2 — the line renders at every in-range local hour, and only on the local day

- Check: `pnpm exec vitest run --reporter=verbose src/components/timeline/TimelineGrid.test.tsx src/utils/local-clock.test.ts`.
- Evidence:
  ```
  ✓ TimelineGrid > now-line > renders the now-line for local hour 11 and keeps it inside the grid width
  ✓ TimelineGrid > now-line > renders the now-line for local hour 12 and keeps it inside the grid width
  … (13 … 22 identical) …
  ✓ TimelineGrid > now-line > renders the now-line for local hour 23 and keeps it inside the grid width
  ✓ TimelineGrid > now-line > does not render the now-line for another date, even at 20:00 local
  ✓ TimelineGrid > now-line > does not render the now-line outside service hours
  ✓ localDateString > stays on today at 23:30 local even though the UTC day has rolled
  ✓ localDateString > rolls over at local midnight, not at UTC midnight
  ✓ localHour > reads the local hour, not the UTC hour
  ✓ isLocalToday > matches the local calendar day at both edges of midnight
  ```
  Harness corroboration — V11, three clocks:
  ```json
  "today_2000":                    { "nowLine": 1, "dateLabel": "Friday, September 11, 2026 …" },
  "today_0300":                    { "nowLine": 0, "dateLabel": "Friday, September 11, 2026 …" },
  "tomorrow_selected_at_2000":     { "nowLine": 0, "dateLabel": "Saturday, September 12, 2026 …" }
  ```
- Result: PASS

### A2.1 — three local bookings file under the segment their printed time belongs to

- Check: operator probe P08 against the briefing mock (17:30 / 18:30 / 21:00 local).
- Evidence:
  ```json
  "localTimes": { "Early Bird": "17:30", "Dinner Regular": "18:30", "Late Night": "21:00" },
  "all":    ["Early Bird", "Dinner Regular", "Late Night"],
  "early":  ["Early Bird"],
  "dinner": ["Dinner Regular"],
  "late":   ["Late Night"],
  "timeFormatSample": ["5:30 PM", "6:30 PM", "9:00 PM"]
  ```
  Each segment lists exactly its own card; "All" lists all three.
- Result: PASS

### A2.2 — one clock source for the segment and the printed time

- Check: `BriefingPage.test.tsx` segment suite.
- Evidence:
  ```
  ✓ BriefingPage > segments bucket on the local hour (A2) > the fixture really is past the UTC rollover (17:30 Pacific is tomorrow in UTC)
  ✓ BriefingPage > segments bucket on the local hour (A2) > All shows every party with its printed local time
  ✓ BriefingPage > segments bucket on the local hour (A2) > early segment files exactly the Early Guest (5:30 PM)
  ✓ BriefingPage > segments bucket on the local hour (A2) > dinner segment files exactly the Dinner Guest (6:30 PM)
  ✓ BriefingPage > segments bucket on the local hour (A2) > late segment files exactly the Late Guest (9:00 PM)
  ```
  The first test is the load-bearing one: the fixture is deliberately past the
  UTC rollover, so a UTC-derived segment and a local-derived printed time would
  disagree and the other four would fail.
- Result: PASS

### A3.1 — a 500 on walk-in keeps the grid, shows a sentence in the dialog, re-enables submit

- Check: V8 (walk-in POST → 500, timestamped) plus operator probe P03.
- Evidence:
  ```json
  {
    "errorFirstSeenMs": 72,
    "dialogAlerts": [
      "Walk-in not seated. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details"
    ],
    "submitAtErrorTime": { "text": "Seat now", "disabled": false },
    "matchesRequestLine": false,
    "gridCount": 1
  }
  ```
  `gridCount: 1` (the grid never unmounts), `matchesRequestLine: false` (the
  copy does not match `/^(GET|POST|PATCH|PUT|DELETE) \/api\//`), and the submit
  button is already back to its resting label "Seat now", enabled, **72 ms**
  after the error appears — well inside 1 s. The baseline this replaces, from
  `xcut` C2, asserted the opposite and now fails:
  ```
  ✘ C2. failed walk-in: dialog stuck Seating…, grid replaced by error behind modal, never recovers
      Error: expect(received).toBe(expected)   Expected: 0   Received: 1
      > 48 |   expect(gridAfterEsc).toBe(0);
  ```
  and `xcut` C, which asserted the raw request line reached the dialog:
  ```
  ✘ C. raw ApiClientError message reaches the walk-in dialog
      Expected pattern: /POST .*failed: 500/
      Received string:  ""
  ```
  Unit half:
  ```
  ✓ WalkInDialog > owns its failure > renders 'Walk-in not seated.' with the house sentence, the raw line behind Show details, and stays open
  ✓ WalkInDialog > owns its failure > returns the button to 'Seat now' in the same commit as the banner and keeps the field values
  ✓ WalkInDialog > owns its failure > leaves focus on Seat now after a 500, so tapping again is the retry
  ✓ TimelinePage > walk-in flow > leaves timeline-grid mounted and shows no page-level alert when the walk-in is rejected (item 15 rewrite: no page error state)
  ```
- Result: PASS

### A3.2 — the same for seat, cancel, edit and table-status

- Check: `TimelinePage.test.tsx` per-handler failure tests.
- Evidence:
  ```
  ✓ TimelinePage > seat guest flow > lets the panel own a failed seat — 'Guest not seated.' inside it, the grid still mounted (item 15 rewrite: no page error state)
  ✓ TimelinePage > cancel reservation flow > rethrows a failed cancel so the dialog owns the failure (item 12 bridge)
  ✓ TimelinePage > cancel reservation flow > leaves the grid mounted and shows no page-level alert when cancel fails (item 15 rewrite: no page error state)
  ✓ TimelinePage > edit reservation flow > rethrows a failed edit so the drawer owns the failure (item 12 bridge)
  ✓ TimelinePage > edit reservation flow > leaves the grid mounted and shows no page-level alert when edit fails (item 15 rewrite: no page error state)
  ✓ TimelinePage > table status changes > shows error message when updateTableStatus fails (e.g. 409 conflict)
  ✓ TimelinePage > table status changes > on failure: clears pending, focuses the trigger, and Retry re-sends the same transition (item 16)
  ✓ TimelinePage > table status changes > marks the table pending while the change is in flight, then clears it (item 16)
  ```
  "nothing stays in its in-flight label" is the `clears pending` / `returns the
button to 'Seat now'` pair.
- Result: PASS

### A3.3 — page-level errors render beside the grid, dismissible, cleared by the next attempt

- Check: V4 (reservations fetch → 500) and operator probe P03's after-Escape sample.
- Evidence — V4:
  ```json
  {
    "alerts": [
      "Couldn't load tonight's reservations. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details Retry"
    ],
    "retryButtons": 1,
    "emptyNight": 0,
    "gridCount": 1,
    "matchesRequestLine": false
  }
  ```
  P03, after Escape and after navigating away and back:
  ```json
  "afterEscape":  { "dialogVisible": false, "gridCount": 1, "alertText": [], "blocks": 4 },
  "gridCountAfterNextDay": 1, "alertAfterNextDay": [],
  "gridCountAfterToday":   1, "alertAfterToday":   []
  ```
  No stale error survives the dismiss or the round trip. Dismissibility:
  ```
  ✓ ErrorRetryBanner > should show dismiss button when onDismiss is provided
  ✓ TimelinePage > table status changes > the failure banner is dismissible (item 16)
  ✓ TimelinePage > error and empty states > shows the load banner beside a grid that stays mounted when the fetch fails with tables present (item 15 rewrite: load axis)
  ```
- Result: PASS

### A4.1 — no "Seat Guest" for a CONFIRMED party on an OCCUPIED table; yes for PENDING

- Check: V1, the two details surfaces side by side.
- Evidence:
  ```json
  "occupiedTable": {
    "buttons": ["", "Edit reservation", "Cancel reservation", "More ▾"],
    "text": "Alice Johnson party of 4 · 11:00 AM · Table 1 · Seated VIP Edit reservation Cancel reservation More ▾"
  },
  "availableTable": {
    "buttons": ["", "Seat Guest", "Edit reservation", "Cancel reservation", "More ▾"],
    "text": "Bob Smith party of 2 · 12:00 PM · Table 3 · Pending Repeat Seat Guest Edit reservation Cancel reservation More ▾"
  }
  ```
  Unit half:
  ```
  ✓ TimelinePage > reservation selection and details sidebar > shows Seat Guest for a PENDING reservation on a free table (item 13 rule)
  ✓ TimelinePage > seated is a fact about the floor (item 15) > hides Seat Guest and reads 'Seated' for a CONFIRMED party on an OCCUPIED table inside its slot
  ✓ isSeated > needs the authoritative table to be OCCUPIED
  ✓ isSeated > needs a CONFIRMED reservation
  ✓ seatedReservationIds > collects the ids seated right now, looking tables up by tableId
  ```
- Result: PASS

### A4.2 — "Seated" appears only for an OCCUPIED table; the phone chip no longer says it

- Check: V1's phone pass (390×844).
- Evidence:
  ```json
  "phoneChips": ["Walk-in", "All", "Confirmed", "Upcoming", "Cancelled", …],
  "phoneMentionsSeated": false,
  "phoneFilterChipNames": ["All", "Confirmed", "Upcoming", "Cancelled"]
  ```
  The chip the audit found mislabelled ("Seated", listing un-arrived CONFIRMED
  parties) is now "Confirmed", and the word "Seated" appears nowhere on the
  phone view. Unit half:
  ```
  ✓ TimelineMobileView > status chips (A4.2 phone half, P12) > labels the CONFIRMED chip 'Confirmed' — never 'Seated', which is a fact about the floor
  ✓ TimelineMobileView > status chips (A4.2 phone half, P12) > still filters CONFIRMED ∪ COMPLETED under the Confirmed chip
  ```
  This is also why probe P12 can no longer run — it waits on
  `getByRole("button", { name: /^Seated$/ })`, a control this run deliberately
  renamed (assumption 3).
- Result: PASS

### A4.3 — no status written that the API does not already accept; no Prisma or service change

- Check: diff review against `origin/main`.
- Evidence:
  ```
  $ git diff --name-only origin/main...HEAD -- services packages/types '*.prisma' | grep -v llms
  (no output)
  ```
  The run's whole surface:
  ```
  $ git diff --name-only origin/main...HEAD | sed 's|/[^/]*$||' | sort -u
  .changeset
  apps/hospitality        apps/hospitality/docs        apps/hospitality/e2e
  apps/hospitality/e2e/fixtures
  apps/hospitality/src/components{,/booking-widget,/crm,/dashboard,/reservations,/timeline}
  apps/hospitality/src/hooks   apps/hospitality/src/lib   apps/hospitality/src/pages   apps/hospitality/src/utils
  docs  docs/features/hospitality-service-ux{,/audit}  llms.txt  llms-full.txt  metrics
  packages/rialto  packages/rialto/src/components/CommandPalette  packages/rialto/src/components/Drawer
  ```
  The written statuses are the API's own transition set, asserted as a
  projection rather than a hard-coded list:
  ```
  ✓ tableStatusMenuItems (A8.2 — a projection of the API's own state machine) > AVAILABLE offers one 'Mark <state>' item per valid transition
  ✓ tableStatusMenuItems … > OCCUPIED / DIRTY / READY offers one 'Mark <state>' item per valid transition
  ✓ tableStatusMenuItems … > an unknown status offers nothing
  ```
- Result: PASS

### A5.1 — the now-line's box is inside the scroll viewport on load and on "Today"

- Check: probe P01 geometry (baseline in the PRD: `scrollLeft: 0`, headers `11 AM … 2 PM`).
- Evidence:
  ```json
  "local_2000": { "nowLineLeftPx": 1200, "scrollLeft": 978, "clientWidth": 702, "scrollWidth": 1680,
                  "visibleHourHeaders": ["Tables","7 PM","8 PM","9 PM","10 PM","11 PM"] }
  ```
  Viewport at 20:00 is `978 … 1680`; the line at 1200 px is inside it, and the
  headers are the evening's, not the baseline's `11 AM … 2 PM`. Unit half:
  ```
  ✓ useScrollToNow (A5.1 unit) > puts the now-line a quarter of the way across the viewport, smoothly
  ✓ useScrollToNow (A5.1 unit) > uses the grid's own table-column width (80 px on the phone grid)
  ✓ useScrollToNow (A5.1 unit) > never scrolls below 0
  ✓ useScrollToNow (A5.1 unit) > is instant under reduced motion
  ✓ useScrollToNow (A5.1 unit) > scrolls once when the now-line appears, and leaves the Host's scroll alone on every tick
  ✓ TimelineGrid > now-line > scrolls the grid so the now-line sits a quarter of the way across on mount (A5.1)
  ```
- Result: PASS

### A5.2 — after a walk-in resolves: selected, in viewport, table named

- Check: operator probe P04.
- Evidence:
  ```json
  "blocksBefore": 4, "blocksAfter": 5,
  "newBlockVisible": true, "newBlockSelected": "true", "newBlockInViewport": true,
  "dialogClosedMs": 98,
  "liveRegions": ["Seated Probe Guest, party of 4, at Table 1.", "", ""],
  "statusTexts": ["Seated Probe Guest, party of 4, at Table 1."]
  ```
  The table is named in the announcement ("at Table 1"). Unit half:
  ```
  ✓ TimelinePage > mutation outcomes … > walk-in success: selects the new block, names the table in one sentence and focuses the block
  ```
- Result: PASS

### A5.3 — at 1024×768 with a reservation selected, the visible span is ≥ 4 hours

- Check: V2, both viewports, before and after selecting a reservation.
- Evidence — tablet (1024×768):
  ```json
  "before": { "gridWidth": 704, "scrollerClientWidth": 702, "hourColumnPx": 120, "visibleHours": 5.9 },
  "after":  { "gridWidth": 704, "scrollerClientWidth": 702, "hourColumnPx": 120, "visibleHours": 5.9 },
  "sidebarsAtTablet": 0, "dialogsAtTablet": 1
  ```
  Desktop (1440×900) for contrast: `"visibleHours": 6.7, "sidebars": 1`.
  **5.9 h ≥ 4 h**, and selecting a reservation costs the grid nothing at tablet
  — the span is identical before and after, because the detail surface is now a
  bottom sheet (`dialogsAtTablet: 1`), not the squeezed sidebar the audit found
  (≈ 2 h / 384 px). Unit half:
  ```
  ✓ TimelinePage > viewport composition (item 15) > tablet: grid plus the bottom sheet, no sidebar
  ✓ TimelinePage > viewport composition (item 15) > desktop: grid plus the Card sidebar, no sheet
  ✓ TimelinePage > module CSS (item 15) > hides the sidebar below 1025 px — the tablet band gets the sheet, not a squeezed column
  ✓ ReservationSheet > More ▾ (A5.3 sheet half, P13) > has the compact class until More is pressed, default after, compact again on the second press
  ```
  This change is why probes P05, P06 and P13 can no longer run: all three wait
  on `reservation-detail-sidebar` at 1024×768 (assumption 3).
- Result: PASS

### A6.1 — `/timeline?walkin=true` opens the dialog; the param does not persist

- Check: `xcut` A (inverted — it asserted no reader existed) plus a production-build probe.
- Evidence:
  ```
  ✘ A. cmdK walkin param has no reader
      Error: expect(received).toBe(expected)   Expected: 0   Received: 1
      > 39 |   expect(dialogs).toBe(0);
  ```
  One dialog now opens where the baseline asserted zero. Param stripping,
  measured against `vite build` + `vite preview`:
  ```json
  {
    "before": {
      "url": "http://localhost:4173/hospitality/timeline?walkin=true",
      "dialogs": 1,
      "dialogNames": ["Seat walk-in\n\nPARTY SIZE\n1\n2\n3\n4\n5\n6\n7\n8\nTable\nTable 3 (seat"]
    },
    "urlAfter": "http://localhost:4173/hospitality/timeline"
  }
  ```
  Unit half:
  ```
  ✓ TimelinePage > URL intent (item 15) > opens the walk-in dialog from /timeline?walkin=true and strips the param on close
  ✓ TimelinePage > URL intent (item 15) > keeps date while stripping the intent after a walk-in created from the URL
  ✓ TimelinePage > URL intent (item 15) > holds the URL-opened dialog back while the grid is still loading
  ✓ parseTimelineIntent > reads walkin=true exactly
  ✓ stripTimelineIntent > returns a new instance with both intent keys removed and the date kept
  ```
- Result: PASS

### A6.2 — ⌘K and the dashboard CTA land on the right dialog

- Check: probes P14 and V9.
- Evidence — P14 (⌘K):
  ```json
  "focusOnOpen": { "tag": "INPUT", "ariaLabel": "Search commands" },
  "options": ["Walk-in guest"],
  "after":       { "url": "http://localhost:3002/hospitality/timeline?walkin=true",
                   "walkInDialogCount": 1, "focus": { "tag": "BUTTON", "text": "2", "isBody": false } },
  "afterNewRes": { "url": "http://localhost:3002/hospitality/reservations?new=true",
                   "dialogs": ["New Reservation\n\nGuest Name\nGuest Email\nGuest Phone\nDate\nStart Time\nPARTY SIZE…"] }
  ```
  V9 (dashboard CTA):
  ```json
  "ctaName": "Walk-in", "activations": 1,
  "url": "http://localhost:3002/hospitality/timeline?walkin=true",
  "walkInDialogs": 1, "focus": { "tag": "BUTTON", "text": "2", "inDialog": true }
  ```
  Three of the four clauses verified: ⌘K "Walk-in Guest" → walk-in dialog with
  focus inside it; the dashboard CTA → the same; ⌘K "New Reservation" → the
  new-reservation dialog. **The fourth clause, ⌘K "New Floor Plan", was not
  built by this run and was not verified.** `breakdown.md` records it as routed,
  not dropped: _"The 'New Floor Plan' half of PRD A6.2 is routed, not built: the
  PRD's open question hands it to Decompose … and #4751 is still open."_ The
  PRD's own open questions say the same: _"B1 sites in the in-flight files and
  the 'New Floor Plan' palette action adjacent to that run — Decompose sequences
  behind the floor-plan run's merge or routes them."_
- Result: PARTIAL — 3 of 4 clauses pass; ⌘K "New Floor Plan" is routed to the
  `venue-onboarding-floor-plan` run (#4751, open) by the PRD's own clause and
  was never in this run's scope.

### A6.3 — ⌘K "walk" ⏎ resolves to the walk-in action, not Waitlist

- Check: rialto ranking tests plus P14's observed option list.
- Evidence:
  ```
  ✓ CommandPalette > ranking > "walk" lists "Walk-in guest" first and does not match "Waitlist"
  ✓ CommandPalette > ranking > ArrowDown + Enter select the top-ranked item
  ✓ CommandPalette > ranking > orders groups by the best rank they contain when a query is present
  ✓ CommandPalette > ranking > sorts items within a group by rank and Enter picks the top one
  ✓ rankCommandMatch > returns 0 when the label starts with the query
  ✓ rankCommandMatch > returns 1 when a later word starts with the query
  ✓ rankCommandMatch > returns 2 for a substring that opens no word
  ✓ rankCommandMatch > returns 3 for strict initials — every query character opens the next word
  ✓ rankCommandMatch > returns null when nothing matches
  ```
  The rank ladder is exactly the PRD's ("prefix above word-start above
  substring"). Observed, typing "walk": `"options": ["Walk-in guest"]` —
  "Waitlist" no longer appears at all. `rankCommandMatch` is absent at
  `5f642aa42` (grep count 0, quoted above).
- Result: PASS

### A6.4 — the dashboard walk-in path is ≤ 2 activations (today 3)

- Check: V9 counts activations to an open dialog.
- Evidence:
  ```json
  "dashboardButtons": ["Home", "Walk-in", "View Floor Plan", "Guest Lookup", "Booking Widget"],
  "ctaName": "Walk-in", "activations": 1, "walkInDialogs": 1
  ```
  **One** activation. The baseline's CTA was named "New Walk-In" and took 3 —
  which is why probe P07 can no longer run (`waiting for getByRole('button',
{ name: 'New Walk-In' })`, timeout 15000 ms).
- Result: PASS

### A7.1 — the empty night: message + actions, table rows still visible

- Check: V3 at 1024×768 with tables present and zero reservations, plus P02.
- Evidence — V3:
  ```json
  "today": {
    "present": 1,
    "text": "Quiet so far. Nothing on the book for tonight. Walk-ins go straight to a table. Walk-in",
    "actions": ["Walk-in"], "links": [], "tableRows": 5, "role": null, "alerts": 0
  },
  "otherDay": {
    "text": "Nothing on the book for Saturday, Sep 12. Bookings for that night will show here. Back to today",
    "actions": ["Back to today"]
  }
  ```
  P02 corroborates at tablet — the table rows (`B1 … 1`) render above the quiet
  card, and the card sits over them rather than replacing them:
  ```
  "tabletTimelineAreaText": "Tables\n11 AM\n…\nB1\n1-2 guests\nDIRTY▾\n4\n4-8 guests\nAVAILABLE▾\n3\n…\n12:05 PM\nQuiet so far.\n\nNothing on the book for tonight. Walk-ins go straight to a table.\n\nWalk-in"
  ```
  The message is there, the rows stay (`tableRows: 5`), and the state is not an
  error (`alerts: 0`). **But the PRD asked for two actions — "start a walk-in,
  and go to Today (or the date)" — and tonight ships one.** UX made this call
  deliberately: `ux.md` line 255 gives the tonight variant a single primary
  action and the other-date variant a single "Back to today", on the reasoning
  that "go to Today" is a no-op when you are already on today. The unit tests
  encode that shape, so the narrowing is designed, not accidental:
  ```
  ✓ TimelineEmptyNight (A7.1 / A7.2 leaf half) > tonight: 'Quiet so far.' and a primary Walk-in
  ✓ TimelineEmptyNight (A7.1 / A7.2 leaf half) > another date: 'Nothing on the book for <dateLabel>.' and a secondary Back to today
  ✓ TimelineEmptyNight (A7.1 / A7.2 leaf half) > gives the action a 44 px minimum under the coarse-pointer / tablet query
  ✓ TimelinePage > grid props (item 16) > tonight with tables and zero reservations: the quiet night, and its Walk-in opens the dialog
  ✓ TimelinePage > grid props (item 16) > another date with zero reservations: the other-date variant, and Back to today returns to today
  ```
- Result: PARTIAL — message present, rows stay visible, one contextual action
  per variant instead of the two the PRD named. Recorded as a UX-owned
  narrowing, not a defect; it is the one place the shipped behaviour is
  narrower than the criterion's literal text.

### A7.2 — empty night, failed fetch and wrong date are distinguishable by text and role

- Check: V3 (empty / other date) against V4 (failed fetch), same page, same viewport.
- Evidence:

  | state         | text                                                                         | role    | Retry |
  | ------------- | ---------------------------------------------------------------------------- | ------- | ----- |
  | empty tonight | "Quiet so far. Nothing on the book for tonight…"                             | `null`  | —     |
  | wrong date    | "Nothing on the book for Saturday, Sep 12…"                                  | `null`  | —     |
  | failed fetch  | "Couldn't load tonight's reservations. The reservations service hit a snag…" | `alert` | 1     |

  V4 also proves the two states cannot be confused in the other direction:

  ```json
  {
    "alerts": ["Couldn't load tonight's reservations. …"],
    "retryButtons": 1,
    "emptyNight": 0,
    "gridCount": 1
  }
  ```

  A failed fetch renders **no** empty-night card (`emptyNight: 0`). Unit half:

  ```
  ✓ TimelineEmptyNight (A7.1 / A7.2 leaf half) > today is never an alert (A7.2)
  ✓ TimelineEmptyNight (A7.1 / A7.2 leaf half) > otherDate is never an alert (A7.2)
  ✓ TimelinePage > grid props (item 16) > no quiet night when the reservations fetch failed — an empty grid is not an empty book
  ✓ TimelinePage > grid props (item 16) > no quiet night while reservations exist
  ```

- Result: PASS

### A8.1 — the table-status control names its state and its action

- Check: V5 (baseline: `ariaLabel: null`, `title: null`).
- Evidence:
  ```json
  "ariaLabel": "Bar 1: Dirty. Change status"
  ```
  P10 shows the same across every row at tablet:
  ```json
  "aria": "Table 4: Available. Change status"
  "aria": "Table 2: Occupied. Change status"
  "aria": "Table 1: Available. Change status"
  ```
  Unit half:
  ```
  ✓ TableStatusMenu > names the current state and the action (A8.1) > exposes 'Table 3: Occupied. Change status' on a real, closed menu button
  ✓ TableStatusMenu > names the current state and the action (A8.1) > AVAILABLE / DIRTY / READY reads as Table 3: <state>. Change status
  ✓ TableStatusMenu > names the current state and the action (A8.1) > keeps the LED decorative so the name is spoken once
  ```
- Result: PASS

### A8.2 — one activation never commits an irreversible change

- Check: V5 counts requests after the first activation, then after choosing an item.
- Evidence:
  ```json
  "expandedBefore": "false",
  "afterOneActivation": { "requests": [], "menus": 1, "menuItems": ["Mark ready"], "expanded": "true" },
  "chosenItem": "Mark ready",
  "requestsAfterSelect": ["PATCH /api/v1/tables/tbl_e2e_005/status {\"status\":\"READY\"}"],
  "statusRegions": ["Bar 1 is now ready."]
  ```
  The first activation fires **zero** requests and opens a menu of the valid
  transitions; the write happens only on an explicit item choice. The baseline
  (probe P15, re-run today against the old expectation) is the contrast:
  ```json
  "before": { "text": "AVAILABLE▾", "ariaLabel": "Table 1: Available. Change status" },
  "requests": [], "after": { "confirmDialogs": 0 }
  ```
  — the audit recorded one click → immediate `PATCH … OCCUPIED`; today the same
  gesture records `requests: []`. Unit half:
  ```
  ✓ TableStatusMenu > one activation never commits (A8.2) > Enter opens the menu and calls nothing
  ✓ TableStatusMenu > one activation never commits (A8.2) > ArrowDown opens the menu and calls nothing
  ✓ TableStatusMenu > one activation never commits (A8.2) > a tap opens the menu and calls nothing
  ✓ TableStatusMenu > one activation never commits (A8.2) > choosing an item calls onChange exactly once with that state and closes
  ✓ TableStatusMenu > one activation never commits (A8.2) > Escape closes with no callback
  ```
- Result: PASS

### A8.3 — the control's hit area is ≥ 44×44 px at 1024×768 (today 52–78×26)

- Check: V5 bounding box at 1024×768, plus P10's tablet sweep.
- Evidence:
  ```json
  "triggerBox": { "w": 66, "h": 44 }
  ```
  P10, every table-status trigger at tablet:
  ```json
  { "label": "table-status-tag", "text": "DIRTY▾",      "w": 66, "h": 44, "under44": false }
  { "label": "table-status-tag", "text": "AVAILABLE▾",  "w": 94, "h": 44, "under44": false }
  { "label": "table-status-tag", "text": "OCCUPIED▾",   "w": 92, "h": 44, "under44": false }
  ```
  Height is 44 px, up from the audit's 26 px. Unit half:
  ```
  ✓ TableStatusMenu > 44 px inside the 60 px row (A8.3) > gives the trigger a 44 × 44 minimum under the coarse-pointer / tablet query
  ```
- Result: PASS

### A9.1 — skeleton rows and no counts before the bound, with `/tables` delayed

- Check: V6 (timestamped first sight of a skeleton) and probe P11 (5 s delay).
- Evidence — V6:
  ```json
  {
    "skeletonFirstSeenMs": 1355,
    "sample": {
      "elapsedMs": 1355,
      "skeletons": 1,
      "spinner": 0,
      "statsText": "Live RESERVATIONS — COVERS — CONFIRMED — PENDING —"
    }
  }
  ```
  P11:
  ```json
  "during": { "elapsedMs": 1518, "statusRoles": 2, "spinner": 0, "skeletons": 6,
              "statsText": "Live\n\nRESERVATIONS\n—\nCOVERS\n—\nCONFIRMED\n—\nPENDING\n—",
              "mainText": "… Live\nRESERVATIONS\n—\nCOVERS\n—\nCONFIRMED\n—\nPENDING\n—\nLoading tonight's grid…" }
  ```
  Both shape clauses pass outright and invert the baseline exactly: `skeletons
≥ 1` (1 and 6), `spinner: 0` (the audit found `spinner: 1`), and the stats row
  shows four em-dashes where the audit found "Reservations: 4 · Covers: 12"
  above the spinner. **The 1 s half could not be held by this harness**: the
  earliest measurable skeleton frame is 1355 ms, and that figure is dominated by
  the Vite dev server's module loading, not by app work — the probe navigates
  with `waitUntil: "commit"` and the clock starts there. Per assumption 1 and
  the PRD's own fallback clause, the bound is read at 2 s, which 1355 ms and
  1518 ms both satisfy. The 1 s bound is still asserted, and still green, where
  it is measurable — inside the committed E2E, whose page is already mounted
  when its budget starts:
  ```
  ✓  86 [chromium] › e2e/timeline.spec.ts:47:3 › Timeline load axis … › shows the skeleton within 1 s while /tables is slow, and the stats row does not move when the numbers arrive (6.2s)
  ```
  Unit half:
  ```
  ✓ TimelineSkeleton (A9.1 skeleton half) > is one busy status region carrying the hidden loading text and no count
  ✓ TimelineSkeleton (A9.1 skeleton half) > draws a 40 px header row and five 60 px rows as aria-hidden bars
  ✓ TimelinePage > error and empty states > shows the skeleton and four '—' stats while loading, never a grid or a zero
  ```
- Result: PARTIAL — shape verified outright; the timing bound verified at the
  PRD's documented 2 s fallback in the harness and at the original 1 s inside
  the committed E2E. Not verified at 1 s in the harness, and the reason is the
  harness, not the app.

### A9.2 — the grid's arrival does not shift the stats row

- Check: the committed E2E's bounding-box assertion, run through the substitute config.
- Evidence:
  ```
  ✓  86 [chromium] › e2e/timeline.spec.ts:47:3 › Timeline load axis: skeleton, fetch failure, and no tables are three different screens › shows the skeleton within 1 s while /tables is slow, and the stats row does not move when the numbers arrive (6.2s)
  ```
  The spec's own comment states the contract: _"the stats row is honest about
  not knowing ('—', '<label>, unavailable') without moving."_ Unit
  corroboration — the row keeps four cards in every state, so it has no
  reflow to do:
  ```
  ✓ TimelinePage > shows the four KpiStats with their values once data is loaded (item 15 rewrite of the stats row)
  ✓ TimelinePage > stats display > keeps the Pending KpiStat at 0 when nothing is pending — the row's layout never changes (item 15 rewrite)
  ```
- Result: PASS

### A10.1 — a `tags: ["VIP"]` guest renders the VIP tag (today `vipTagRendered: false`)

- Check: probe P08, plus the unit test.
- Evidence:
  ```json
  "vipTagRendered": true, "regularTagRendered": false, "visitOrdinalRendered": true
  ```
  ```
  ✓ BriefingPage > cards > renders the VIP segment badge from guest.tags (A10.1)
  ```
- Result: PASS

### A10.2 — only the allergy carries the error variant

- Check: unit test over `dietaryRestrictions: ["nut allergy", "vegetarian"]`.
- Evidence:
  ```
  ✓ BriefingPage > cards > tags dietary restrictions per tag: allergy → error prefixed 'Allergy:', else default (A10.2)
  ```
- Result: PASS

### A10.3 — Briefing times match the Timeline's format ("5:30 PM", not "05:30 PM")

- Check: probe P08's rendered sample plus the shared-formatter test.
- Evidence:
  ```json
  "timeFormatSample": ["5:30 PM", "6:30 PM", "9:00 PM"]
  ```
  ```
  ✓ BriefingPage > cards > prints the time with the shared formatter — no leading zero (A10.3)
  ```
- Result: PASS

### A10.4 — the breadcrumb reads "Tonight's Service" (today "Home › Details")

- Check: V10 — the audit's own P08 `breadcrumb` field was measuring the wrong
  landmark (`getByRole("navigation").filter({ hasText: "Home" }).first()` grabs
  the GlobalNav, which is why P08 reported `"MBE\nHome\nHospitality\nDesign
System"`). V10 targets the breadcrumb by name.
- Evidence:
  ```json
  "breadcrumbNav": "Home Tonight's Service",
  "navLandmarks": [
    { "label": "Global navigation",   "text": "MBE Home Hospitality Design System" },
    { "label": "Dashboard navigation","text": "E2E Test Bistro Tonight's Service Timeline Reservations Waitlist Guests …" },
    { "label": "Breadcrumb",          "text": "Home Tonight's Service" }
  ],
  "title": "Tonight's Service · E2E Test Bistro"
  ```
  Unit half: `DashboardLayout.test.tsx` — _"shows Home > Tonight's Service on the
  briefing route (A10.4)"_, green in the package run.
- Result: PASS

### B1.1 — no rendered error text matches the request-line shape; the named surfaces show a sentence

- Check: the source-scanning guard test (whole-tree clause) plus one live probe per named surface.
- Evidence — whole-tree clause, `describe-api-error.guard.test.ts`:

  ```
  ✓ B1 guard: no rendered text may be a raw request line > no file outside the allowlist reads `.message` raw
  ✓ B1 guard: no rendered text may be a raw request line > every allowlist entry states a reason
  ```

  Per-surface, live:

  | surface               | probe                              | rendered text                                                                                                                                      |
  | --------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Reservations          | `T3-500`                           | "Couldn't load reservations. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details Retry"                 |
  | Admin                 | `T11-admin500`                     | "Couldn't load users. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details Retry"                        |
  | Profile               | `T11-profile500` / `R4-profile500` | "Changes not saved. Can't reach the reservations service. Check the venue's connection, then try again."                                           |
  | walk-in dialog        | `V8`                               | "Walk-in not seated. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details" (`matchesRequestLine: false`) |
  | **Add Table**         | `R2-add500`                        | **"Add Table POST /api/v1/tables failed: 500 Table create failed (probe) …"**                                                                      |
  | **Onboarding launch** | `R3-launch500`                     | **"… Retry picks up at Venue. POST /api/v1/venues failed: 500 Venue create failed (probe) Retry"**                                                 |

  Four of the six show a sentence. The two that still print the raw request line
  are `components/floor-plan/**` and `components/venue-onboarding/**` — named
  verbatim in this PRD's own **Out of scope**: _"The in-flight runs' files —
  `VenueOnboardingPage`, `components/venue-onboarding/**`,
  `components/floor-plan/**`, `hooks/useFloorPlans*`, `FloorPlanEditorPage` …
  B1's sites inside them are adopted after that run merges."_ They are
  correspondingly allowlisted in the guard, each with a written reason, e.g.
  `{ label: "pages/FloorPlanEditorPage.tsx", reason: "in flight in the
venue-onboarding-floor-plan run; not this run's file" }`.

  So the criterion's two clauses disagree with each other: the first clause
  ("outside the in-flight runs' files listed in Out of scope") passes, and the
  second clause names five surfaces of which two **are** those files. Recorded
  as written rather than resolved in this artifact's favour.

- Result: PARTIAL — the tree-wide guard passes and four of the five named
  manager surfaces plus the walk-in dialog show a sentence. Add Table and
  Onboarding launch still render the request line; both are Out-of-scope files
  belonging to the in-flight `venue-onboarding-floor-plan` run, and adopting
  them was explicitly deferred until that run merges.

### B1.2 — `problemDetails.detail` when the server sends one, house voice when it does not

- Check: `describe-api-error.test.ts`.
- Evidence:
  ```
  ✓ describeApiError > problemDetails.detail precedence > 409 shows problemDetails.detail verbatim when it is non-empty
  ✓ describeApiError > problemDetails.detail precedence > 422 / 400 show problemDetails.detail verbatim when it is non-empty
  ✓ describeApiError > problemDetails.detail precedence > does not let other categories borrow problemDetails.detail
  ✓ describeApiError > problemDetails.detail precedence > falls back to the house sentence when problemDetails.detail is ""
  ✓ describeApiError > problemDetails.detail precedence > falls back to the house sentence when problemDetails.detail is "   "
  ✓ describeApiError > problemDetails.detail precedence > falls back to the house sentence when problemDetails.detail is "409"
  ✓ describeApiError > problemDetails.detail precedence > falls back to the house sentence when problemDetails.detail is "undefined"
  ✓ describeApiError > never puts undefined or a bare status code in detail (B1.1, B1.2)
  ✓ describeApiError > everything else is unknown, and nothing throws > undefined / null / boom / 42 / { code: 'E_WEIRD' } / Error: plain / RangeError: r → unknown
  ✓ describeApiError > raw keeps api-client's `<METHOD> <path> failed: <status>` line and detail never does — the E2E `/failed: 500/` negative oracles depend on this shape
  ```
  The 409-reaches-the-Host case is verified end to end by the dialog:
  ```
  ✓ WalkInDialog > owns its failure > shows the server's own detail for a 409 and moves focus to the Table control
  ```
  The literal strings `"409"` and `"undefined"` are covered explicitly — the two
  shapes that would otherwise leak a status code or the word undefined.
- Result: PASS

### B1.3 — the dashboard's `ReservationList` shows labels, never raw enums

- Check: `ReservationList.test.tsx`; the component reads `STATUS_LABEL[r.status]`
  (`ReservationList.tsx:66`), sourced from `utils/reservation-display.ts`.
- Evidence:
  ```
  ✓ ReservationList > should display status badge
  ✓ ReservationList > should filter out NO_SHOW reservations
  ✓ ReservationList > should filter out CANCELLED reservations
  ✓ ReservationList > should include PENDING and COMPLETED reservations
  ```
  The `NO_SHOW` test asserts the negative directly —
  `expect(screen.queryByText("NO_SHOW")).toBeNull()` — and the file carries the
  rule in a comment at line 109: _"Human labels from STATUS_LABEL, never the raw
  enum (ux.md Screen 8)."_
- Result: PASS

### B1.4 — a guard prevents regression

- Check: the guard test exists, scans `apps/hospitality/src/**`, and is green.
- Evidence:
  ```
  ✓ src/lib/describe-api-error.guard.test.ts (2 tests) 2ms
  ✓ B1 guard: no rendered text may be a raw request line > no file outside the allowlist reads `.message` raw
  ✓ B1 guard: no rendered text may be a raw request line > every allowlist entry states a reason
  ```
  It matches `/\b(?:err|error|fetchError|queryError|loadError|saveError|e)\s*\??\.message\b/`
  and fails on any hit outside an allowlist whose every entry must carry a
  written reason — so silently widening the allowlist is itself a failure. The
  file is **absent at `5f642aa42`** (quoted in the baseline-absence block), so
  it could not have passed there.
- Result: PASS

### B2.1 — `/reservations` on 500: banner with Retry, KPIs read "—" not 0

- Check: manager probe T3 and V7, both with `GET /api/v1/reservations*` → 500.
- Evidence — V7:
  ```json
  "kpiGroups": [
    { "name": "Total, unavailable",     "text": "TOTAL —" },
    { "name": "Confirmed, unavailable", "text": "CONFIRMED —" },
    { "name": "Pending, unavailable",   "text": "PENDING —" },
    { "name": "Cancelled, unavailable", "text": "CANCELLED —" }
  ],
  "alerts": ["Couldn't load reservations. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details Retry"],
  "retryButtons": 1
  ```
  T3, independently:
  ```json
  {
    "name": "T3-500",
    "alertText": [
      "Couldn't load reservations. The reservations service hit a snag — nothing was changed. Try again in a moment. Show details Retry"
    ],
    "retryButtons": 1,
    "url": "http://localhost:3002/hospitality/reservations"
  }
  ```
  `retryButtons: 1` against the audit's 0, all four KPIs read "—", and each is
  _spoken_ as unavailable (`"Total, unavailable"`) rather than silently dashed.
  Unit half:
  ```
  ✓ KpiStat > renders a dash and speaks 'unavailable' when value is null
  ✓ KpiStat > renders a dash and speaks 'unavailable' when value is undefined
  ✓ KpiStat > treats 0 as a real value, not as unavailable
  ✓ ReservationsPage > error handling (500 → banner + Retry, S13/S14) > shows one titled banner with the house sentence and the raw line demoted to details
  ✓ ReservationsPage > error handling (500 → banner + Retry, S13/S14) > keeps the KPIs as dashes spoken as unavailable, renders no rows and no empty state
  ✓ ReservationsPage > error handling (500 → banner + Retry, S13/S14) > leaves New reservation enabled beside the banner
  ```
- Result: PASS

### B2.2 — Retry then 200 restores rows and KPIs without a reload

- Check: V7's second half — stateful mock, 500 then 200, Retry pressed.
- Evidence:
  ```json
  "kpiGroups": [
    { "name": "Total",     "text": "TOTAL 4" },
    { "name": "Confirmed", "text": "CONFIRMED 2" },
    { "name": "Pending",   "text": "PENDING 1" },
    { "name": "Cancelled", "text": "CANCELLED 1" }
  ],
  "alerts": [], "reloaded": false, "rowButtons": 4
  ```
  `reloaded: false` is the load-bearing field: the page object was never
  re-navigated. The banner is gone, the four KPIs carry real numbers, and four
  rows are back. Unit half:
  ```
  ✓ ReservationsPage > error handling (500 → banner + Retry, S13/S14) > Retry refetches; on success the rows and KPIs fill, the page speaks, and focus moves to the heading
  ✓ ReservationsPage > error handling (500 → banner + Retry, S13/S14) > a Retry that fails again stays silent and leaves focus alone
  ```
- Result: PASS

### B3.1 — one spoken line per successful mutation, within 1 s

- Check: probes P04 (walk-in), V5 (table status), and the Waitlist unit suite;
  `xcut` D read inverted.
- Evidence — P04 (baseline: `statusTexts: []`, `toasts: 0`):
  ```json
  "liveRegions": ["Seated Probe Guest, party of 4, at Table 1.", "", ""],
  "statusTexts": ["Seated Probe Guest, party of 4, at Table 1."],
  "dialogClosedMs": 98
  ```
  V5 (table status):
  ```json
  "statusRegions": ["Bar 1 is now ready."]
  ```
  Waitlist add, live — this is the strict-mode violation that P09b hit, and the
  violation _is_ the evidence: the new announcement exists.
  ```
  ✘ P09b waitlist add → seat → cancel → notify (robust)
      Error: strict mode violation: getByText('Second Party') resolved to 2 elements:
          1) <span …>Added Second Party, party of 2, to the waitlist.</span>
          2) <p …>Second Party</p>
  ```
  Per-mutation unit coverage:
  ```
  ✓ TimelinePage > mutation outcomes … > mounts the page's single live region empty from the first render
  ✓ TimelinePage > mutation outcomes … > walk-in success: selects the new block, names the table in one sentence and focuses the block
  ✓ TimelinePage > mutation outcomes … > walk-in success without a guest name speaks 'Seated a walk-in, …'
  ✓ TimelinePage > mutation outcomes … > seat success: one sentence naming guest and table, focus on the block, selection kept
  ✓ TimelinePage > mutation outcomes … > cancel success: clears the selection, speaks once and focuses the block
  ✓ TimelinePage > mutation outcomes … > edit success: speaks once and returns focus to the Edit button that opened the drawer
  ✓ TimelinePage > table status changes > announces 'Table 1 is now occupied.' and focuses the trigger on success (item 16)
  ✓ WaitlistPage > add to waitlist form > announces the add once and returns focus to the Guest Name field (B3.1, B3.2 — the deliberate exception)
  ✓ WaitlistPage > seat action > seat success speaks the sentence once, toasts a "View on Timeline" handoff to today's Timeline with the party selected, and focuses the next card
  ✓ useStatusMessage + LiveStatus > mounts one empty, polite, visually hidden status region from first render
  ✓ useStatusMessage + LiveStatus > announcing the same sentence twice yields two seq values and remounts the span
  ✓ useStatusMessage + LiveStatus > two announce calls in one tick keep the last (B3.1 seam)
  ```
  "one line" is enforced structurally (a single region, remounted per
  announcement) rather than by counting. The timing bound is met with room:
  the dialog closes at 98 ms with the sentence already present.
- Result: PASS

### B3.2 — `document.activeElement` is a control inside `main` after every success path

- Check: P04 (baseline: `focusAfterSuccess: BODY`), plus per-path unit tests.
- Evidence:
  ```json
  "focusBefore":        { "tag": "BUTTON", "text": "Walk-in",    "isBody": false },
  "focusOnOpen":        { "tag": "BUTTON", "text": "2",          "isBody": false },
  "focusAfterSuccess":  { "tag": "BUTTON", "text": "Seat Guest", "isBody": false }
  ```
  `BODY` → a named control. The Waitlist rules are covered exhaustively,
  including every fallback:
  ```
  ✓ WaitlistPage > row actions > notify success speaks "Notified <name>." once; the entry leaves the waiting list …, so focus goes to the next entry's card
  ✓ WaitlistPage > row actions > notifying the only entry focuses the "No one waiting" block once the refetch empties the list
  ✓ WaitlistPage > row actions > cancel success speaks "Removed <name> from the waitlist." and focuses the next entry's card
  ✓ WaitlistPage > row actions > cancelling the last entry focuses the "No one waiting" block once it renders
  ✓ WaitlistPage > row actions > cancelling the final entry of several (no next card) focuses the page heading — rule (d)'s last fallback
  ✓ WaitlistPage > seat action > seating the only entry focuses the "No one waiting" block once it renders
  ✓ useFocusAfter > focuses a testId target once it renders, and only once
  ✓ useFocusAfter > focuses the PageHeader h1 for a pageHeading target — the h1 carries tabIndex=-1
  ✓ useFocusAfter > keeps an unresolved target until it is replaced, then drops it (B3.2 seam)
  ✓ useFocusAfter > does not throw for a testId containing quotes
  ✓ PageHeader > renders the title as the page's only h1, focusable programmatically via tabIndex=-1
  ```
  See [Findings](#findings) for the dismissal path, which this criterion does
  not cover and which does **not** meet the same bar.
- Result: PASS

### B3.3 (optional) — the walk-in dialog's initial focus; rialto `Drawer` restores on close

- Check: `xcut` E read inverted, plus P04/P14/V9's observed initial focus and the rialto suite.
- Evidence — the baseline probe asserted focus landed on Close, and now fails:
  ```
  ✘ E. rialto Dialog initial focus lands on Close
      Error: expect(received).toBe(expected)
      Expected: "Close dialog"   Received: null
      > 114 |   expect(focus?.aria).toBe("Close dialog");
  ```
  Three independent probes agree on where it lands instead — the control that
  reflects the default party size:
  ```json
  P04:  "focusOnOpen": { "tag": "BUTTON", "text": "2", "isBody": false }
  P14:  "focus":       { "tag": "BUTTON", "text": "2", "isBody": false }
  V9:   "focus":       { "tag": "BUTTON", "text": "2", "inDialog": true }
  ```
  ```
  ✓ WalkInDialog > accessibility (focus trap; focus return belongs to the page) > opens with focus on the pressed party-size control, surviving StrictMode's double-run effects
  ✓ Drawer > size=compact > applies the compact class to a bottom sheet / a right drawer
  ✓ Drawer > size=compact > passes axe for a compact bottom sheet
  ✓ Drawer > focuses close button on open (focus trap initializes)
  ```
  Scope note, stated because the criterion is conditional on it: **this run's**
  rialto diff is `CommandPalette` + `Drawer` only, with two changesets
  (`command-palette-ranking.md`, `drawer-compact-size.md`). The `useFocusTrap`
  initial-target and `useReturnFocus` restore work shipped via
  `.changeset/focus-trap-restore-and-initial-target.md`, which is on `main` and
  **not** in `origin/main...HEAD` — it was absent at `5f642aa42` and is present
  now, but this run did not author it.
- Result: PASS (optional criterion; met in the current tree, with the
  restore half landing from `main` rather than from this run's diff)

### NF1 — package gates green; E2E updated and passing; no coverage deleted

- Check: `pnpm lint`, `pnpm typecheck`, `pnpm test` from inside `apps/hospitality`
  and `packages/rialto`; the committed E2E through the substitute config; a diff
  check for deleted specs.
- Evidence:

  ```
  ### hospitality lint
  ✖ 127 problems (0 errors, 127 warnings)
  EXIT=0

  ### hospitality typecheck
  > @mbe/hospitality@0.0.7 typecheck
  > tsc --noEmit
  EXIT=0

  ### hospitality test
   Test Files  169 passed (169)
        Tests  2287 passed (2287)
     Duration  30.02s
  EXIT=0

  ### rialto lint
  ✖ 160 problems (0 errors, 160 warnings)
  LINT_EXIT=0

  ### rialto typecheck
  > @mattbutlerengineering/rialto@0.2.0 typecheck
  > tsc --noEmit
  TYPECHECK_EXIT=0

  ### rialto test
   Test Files  148 passed (148)
        Tests  2300 passed (2300)
     Duration  30.46s
  EXIT=0
  ```

  Zero errors in both lint runs; the warnings are the repo's standing
  React-19 / `prefer-rialto-components` advisories, and **none of the
  `prefer-rialto-components` warnings sit in a file this run touched** — the
  seven warned files (`DatePartySelector.tsx`, `DashboardSidebar.tsx`,
  `VenueSwitcher.tsx`, `SetupPage.tsx`, three `venue-onboarding/*`) do not
  appear in `git diff --name-only origin/main...HEAD`.

  E2E, through the substitute config (assumption 2):

  ```
  $ pnpm exec playwright test -c e2e/.ux-audit/playwright.suite.config.ts
    1 failed
      [chromium] › e2e/realtime-collaboration.spec.ts:204:3 › CF-10: Real-time collaboration across two sessions › Context A and Context B both load the timeline grid independently
    101 passed (3.2m)
  ```

  No spec deleted, seven modified, four added:

  ```
  $ git diff --name-status origin/main...HEAD -- apps/hospitality/e2e | grep '^D'
  (none deleted)

  M apps/hospitality/e2e/api-mocks.ts          A apps/hospitality/e2e/briefing.spec.ts
  M apps/hospitality/e2e/dashboard.spec.ts     A apps/hospitality/e2e/fixtures/api-mocks-table-status.test.ts
  M apps/hospitality/e2e/reservations.spec.ts  A apps/hospitality/e2e/profile.spec.ts
  M apps/hospitality/e2e/timeline.spec.ts      A apps/hospitality/e2e/timeline-intent.spec.ts
  M apps/hospitality/e2e/timeline-interaction.spec.ts
  M apps/hospitality/e2e/waitlist.spec.ts
  M apps/hospitality/e2e/walkin.spec.ts
  ```

  The single failure is the carried-forward flake, re-characterised this
  session with three isolated re-runs of that spec alone:

  ```
  run 1 exit=1 ::   1 failed   2 passed (5.0s)
  run 2 exit=1 ::   2 failed   1 passed (3.8s)
  run 3 exit=1 ::   1 failed   2 passed (4.9s)
  ```

  Non-deterministic, and always the same error —
  `page.evaluate: Execution context was destroyed, most likely because of a
navigation` at `e2e/api-mocks.ts:716`. This run's edits to that file cannot
  reach line 716:

  ```
  $ git diff -U0 origin/main...HEAD -- apps/hospitality/e2e/api-mocks.ts | grep -E '^@@' | tail -1
  @@ -366,0 +414,2 @@ export async function mockApi(page: Page): Promise<void> {
  ```

  The last of thirteen hunks ends at line 415; the failing `page.evaluate` is
  301 lines below it.

  TDD order ("failing test first") is recorded per item in `breakdown.md` but
  cannot be re-observed at Verify — see [Not verified](#not-verified).

- Result: PASS

### NF2 — INCLUSIVE parity

- Check: keyboard paths, axe, reduced motion, 44 px, tokens, rialto-only elements.
- Evidence — keyboard-only, per new interaction:

  ```
  ✓ TableStatusMenu > one activation never commits (A8.2) > Enter opens the menu and calls nothing
  ✓ TableStatusMenu > one activation never commits (A8.2) > ArrowDown opens the menu and calls nothing
  ✓ TableStatusMenu > one activation never commits (A8.2) > Escape closes with no callback
  ✓ CommandPalette > ranking > ArrowDown + Enter select the top-ranked item
  ✓ WalkInDialog > accessibility … > traps Tab focus within the dialog
  ✓ ReservationsPage > row semantics and navigation > navigates to the timeline on Enter from the row's activation control
  ✓ TimelineGrid > keyboard navigation > (13 arrow/Enter/Space/Escape cases)
  ```

  Screen-reader surface:

  ```
  ✓ ErrorRetryBanner (real rialto render) > is one alert announcing title then detail, with Retry, Show details and Dismiss as named buttons
  ✓ ErrorRetryBanner (real rialto render) > reveals the raw request line in a labelled region on demand
  ✓ CommandPalette > accessibility > passes axe when open
  ✓ Drawer > size=compact > passes axe for a compact bottom sheet
  ✓ useStatusMessage + LiveStatus > hides the region visually with the srOnly clip pattern, not display:none
  ✓ TimelineSkeleton (A9.1 skeleton half) > hides the text with the srOnly clip pattern, not display:none
  ```

  Reduced motion: `✓ useScrollToNow (A5.1 unit) > is instant under reduced motion`.

  44 × 44 at 1024×768, measured live across every control this run touches
  (P10's tablet sweep) — the only `under44: true` entries are the sidebar nav
  links, which this run does not touch and which the PRD routes to cluster F
  ("rialto `size="sm"` / `GlobalNav` target sizes app-wide — this run sizes only
  the controls it touches"):

  ```json
  "under44Count": 3,
  "under44": [ { "label": "sidebar-nav", "text": "Tonight's Service", "w": 239, "h": 32 },
               { "label": "sidebar-nav", "text": "Timeline",          "w": 239, "h": 32 },
               { "label": "sidebar-nav", "text": "Waitlist",          "w": 239, "h": 32 } ]
  ```

  Every walk-in, day-nav, table-status and reservation-block control measures
  `h: 44` or more. Tokens — `xcut` G passes, i.e. the canvas/now-line colours
  come from the token set, and the unit half asserts the specific one:

  ```
  ✓ TimelineGrid > now-line > paints the now-line and its dot with the accent token, never the error token (xcut G)
  ```

  Rialto-only elements: `mbe-local/prefer-rialto-components` reports zero hits
  in this run's files (shown under NF1).

- Result: PASS

### NF3 — TONE: all new copy in the house voice, never a verb-path-status line

- Check: the copy snapshot test against `ux.md § Copy`.
- Evidence:
  ```
  ✓ describeApiError > every sentence, verbatim from ux.md § Copy (NF TONE)
  ✓ describeApiError > one house sentence per ApiClientError category > 500 → serverError
  ✓ describeApiError > one house sentence per ApiClientError category > 503 / 429 / 409 / 422 / 400 / 401 / 403 / 404 / 418 → …
  ✓ describeApiError > the two non-HTTP cases > network: a TypeError (fetch failed after the client's retries) is retryable
  ✓ describeApiError > the two non-HTTP cases > timeout: a DOMException named TimeoutError / AbortError
  ```
  The rendered result, sampled live across five surfaces, is quoted in B1.1 —
  short, warm sentences, never a verb-path-status line, on every surface this
  run owns.
- Result: PASS

### NF4 — rialto: changeset, a11y matrix, story, build before consumers typecheck

- Check: this run's rialto diff and its changesets.
- Evidence:
  ```
  $ git diff --name-status origin/main...HEAD -- packages/rialto .changeset
  A  .changeset/command-palette-ranking.md
  A  .changeset/drawer-compact-size.md
  M  packages/rialto/registry.json
  M  packages/rialto/src/components/CommandPalette/CommandPalette.stories.tsx
  M  packages/rialto/src/components/CommandPalette/CommandPalette.test.tsx
  M  packages/rialto/src/components/CommandPalette/CommandPalette.tsx
  M  packages/rialto/src/components/Drawer/Drawer.module.css
  M  packages/rialto/src/components/Drawer/Drawer.stories.tsx
  M  packages/rialto/src/components/Drawer/Drawer.test.tsx
  M  packages/rialto/src/components/Drawer/Drawer.tsx
  ```
  Two components changed, two changesets, both `patch`, both with a written
  body; both stories updated; `registry.json` regenerated. The a11y matrix is
  green as part of the 2300-test rialto run (including `passes axe when open`
  and `passes axe for a compact bottom sheet`). `pnpm --dir packages/rialto
build` was run before the consumer typecheck, and the consumer typecheck is
  green (NF1); the build left the worktree clean.
- Result: PASS

### NF5 — repo: regen clean, prettier clean, flow docs updated, then the Ship clauses

- Check: `pnpm regen --check` (after `pnpm build --filter @mbe/cli...`, and after
  confirming `agent-core` build freshness so the turbo cache could be trusted),
  `pnpm exec prettier --check`, and the docs diff.
- Evidence:
  ```
  $ node scripts/agent-core-build-freshness.mjs check
  {"trusted":true,"state":"fresh"}

  $ pnpm regen --check
  > node scripts/regen.mjs "--check"
  All generated artifacts are up to date.
  REGEN_EXIT=0

  $ pnpm exec prettier --check docs/features/hospitality-service-ux/
  Checking formatting...
  All matched files use Prettier code style!

  $ git diff --stat origin/main...HEAD -- apps/hospitality/docs/USER-FLOWS.md apps/hospitality/CLAUDE.md
   apps/hospitality/docs/USER-FLOWS.md | 4 ++--
   1 file changed, 2 insertions(+), 2 deletions(-)
  ```
  Exactly the one line each for Flow 3 and Flow 4 the criterion asks for, and
  `apps/hospitality/CLAUDE.md` correctly untouched (no flow step changed).
  The remaining clauses — "PR to `main`; `CI Gate` green; Review stage with no
  unfixed critical finding; Ship records the authenticated dashboard as **not
  live-verifiable**" — are the work of the stages after this one. This artifact
  discharges the last of them in advance by recording the dashboard gap
  explicitly (see [Not verified](#not-verified)); the other three cannot exist
  yet.
- Result: PARTIAL — every clause Verify owns is green (regen, prettier, flow
  docs, CLAUDE.md). PR / CI Gate / Review are Ship's and Review's, unverifiable
  at this stage by construction, not by omission.

## Failures

**None.** No criterion failed, so nothing routes back to Implement.

Five criteria are PARTIAL, and none of them is a defect in shipped behaviour:

| Criterion | What is short                                                | Why it is not a failure                                                                                                                             |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A6.2      | ⌘K "New Floor Plan" not built                                | Routed to the `venue-onboarding-floor-plan` run (#4751, open) by the PRD's own open question and recorded as routed in `breakdown.md`               |
| A7.1      | one contextual action, not two                               | UX's deliberate call (`ux.md` line 255): "go to Today" is a no-op on today, so each variant ships the one action that means something               |
| A9.1      | 1 s bound not measurable in the harness                      | The PRD's own fallback clause names 2 s as the answer to exactly this measurement; the 1 s bound is still asserted and green in the committed E2E   |
| B1.1      | Add Table and Onboarding launch still print the request line | Both are `components/floor-plan/**` / `components/venue-onboarding/**`, named in this PRD's Out of scope and allowlisted with a reason in the guard |
| NF5       | PR / CI Gate / Review clauses                                | Belong to Ship and Review; Verify cannot produce them                                                                                               |

The one probe failure that is a genuine behavioural signal — not a criterion —
is in [Findings](#findings) below.

## Findings

### The StrictMode Escape-path focus loss is NOT StrictMode-only — it reproduces in a production build

The PRD routed this to Verify: _"**StrictMode Escape-path focus** — verify in a
production build before claiming or fixing; success paths do not depend on it.
Verify."_

Done, and the hypothesis is refuted. Against the dev server, probe P16 recorded
focus landing on `<body>` after Escape:

```json
"afterEscape": { "t0":   { "active": "BODY:…", "isBody": true, "triggerInDom": true, "triggerIsActive": false },
                 "t50":  { "active": "BODY:…", "isBody": true },
                 "t350": { "active": "BODY:…", "isBody": true } }
```

Re-measured against `vite build` + `vite preview` (React's production build does
not double-invoke StrictMode effects), on a click-opened walk-in dialog:

```json
PROD-1  "inDialog":    { "tag": "BUTTON", "text": "2", "isBody": false, "inMain": true },
        "afterEscape": { "t0":   { "tag": "BODY", "isBody": true, "inMain": false },
                         "t400": { "tag": "BODY", "isBody": true, "inMain": false } },
        "dialogsAfter": 0

PROD-3  (Cancel button instead of Escape)
        "after": { "tag": "BODY", "isBody": true, "inMain": false }
```

Both dismissal gestures lose focus to `<body>` in a production build. The
URL-intent path does **not**, because `TimelinePage` restores focus explicitly
for it:

```json
PROD-2  "urlAfter": "http://localhost:4173/hospitality/timeline",
        "afterEscape": { "tag": "BUTTON", "text": "Walk-in", "isBody": false, "inMain": true }
```

This is consistent and intended at the component level — `WalkInDialog`'s own
suite asserts it, under a heading that says whose job the return is:

```
✓ WalkInDialog > accessibility (focus trap; focus return belongs to the page) > closing via Cancel calls onClose without moving focus back to the opener
✓ WalkInDialog > accessibility (focus trap; focus return belongs to the page) > closing via Escape calls onClose without moving focus back to the opener
✓ TimelinePage > URL intent (item 15) > returns focus to the Walk-in button when a URL-opened dialog closes (Escape has no opener to restore)
```

The page holds up its end for the URL-opened dialog and not for the
click-opened one. **No committed criterion covers this** — B3.2 is scoped to
success paths, and the PRD says in the same sentence that "success paths do not
depend on it" — so it is recorded here rather than as a failure. Two things it
changes for the next stage:

1. The "StrictMode-only" framing in the PRD's open questions is now known to be
   wrong, and should not be carried forward as a reason to defer.
2. The fix is one line of page-level focus restoration in `TimelinePage`
   (the same `focusAfter({ kind: "element", … })` it already uses for the URL
   path), not a rialto change. For **Review** to weigh; not fixed here, because
   Verify does not carry implementation.

## Not verified

1. **Production evidence for the authenticated dashboard — none exists, and
   none was manufactured.** Every surface this run changed sits behind Auth0,
   and no E2E credentials exist for this environment
   (`E2E_AUTH0_DOMAIN`, `E2E_AUTH0_CLIENT_ID`, `E2E_AUTH0_AUDIENCE`,
   `E2E_AUTH_EMAIL`, `E2E_AUTH_PASSWORD` are all unset — output quoted at the
   top of this artifact). This is a standing environment gap, open since
   2026-08-31 and on Matt, not a defect of this run. Consequence, stated
   plainly: **every behavioural claim in this document is local — the mocked
   harness, the fixture API, a synthetic unsigned session, and a local
   production build. Nothing here is evidence that the deployed dashboard
   behaves this way.** `NF5` already requires Ship to record the same thing;
   it is repeated here so this artifact cannot be read as production evidence
   on its own.

2. **TDD order ("failing test first").** NF1 requires every behaviour to have
   been unit-tested by TDD with the failing test written first. Verify sees the
   end state: tests exist, they are green, and the modules they cover are
   absent at `5f642aa42`. That proves the tests are new and that they could not
   have passed at the baseline; it does **not** prove they were written before
   the implementation. `breakdown.md` records the RED-first step per item; that
   record is the only evidence, and it is a claim made by Implement, not an
   observation made by Verify.

3. **⌘K "New Floor Plan"** (A6.2's fourth clause) — not built, routed to
   #4751. Not verified because there is nothing to verify.

4. **Three manager probes did not complete, and two of them are out of scope.**
   `T5` (floor plans) and `T10` (onboarding) both time out on surfaces this run
   does not touch — `git diff --name-only origin/main...HEAD | grep -iE
"floor|onboard"` returns only `FloorPlansPage.tsx` / `.test.tsx`. `T3`
   (reservations) failed at line 152 on a row locator, but **after** recording
   its B2 evidence, so the B2.1 record quoted above is complete and trustworthy;
   the un-run remainder of T3 covered row-jump and touch targets on
   `/reservations`, which V7 and P10 cover independently.

5. **Six operator probes could not run** (P05, P06, P07, P09, P12, P13) — each
   waits on a locator this run deliberately changed. Their subject matter is
   re-measured by V1–V11 (assumption 3), but the original probe numbers are not
   directly comparable, and that is stated rather than papered over.

6. **`e2e/realtime-collaboration.spec.ts`'s two-context test** is
   non-deterministic in this environment and cannot be used as evidence in
   either direction. Characterised, not fixed; proven not to be this run's doing
   (NF1).

7. **Tracker hygiene, for Ship, not for this stage:** issue **#5035** is still
   **OPEN** although its work item is complete — left that way by an earlier
   item. Not this run's to close, and noted so it is not mistaken for
   outstanding work.
