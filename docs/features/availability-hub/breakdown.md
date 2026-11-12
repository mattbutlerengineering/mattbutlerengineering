---
stage: decompose
run: feature:availability-hub
date: 2026-11-12
assumptions:
  - "docs/factory/decompose-lessons.jsonl does not exist in this repo, so no past lessons were read."
  - "Delivery shape: one branch and one PR per item, off main, opened with needs-review. At most three PRs open. Items that share a hot file merge one at a time. This is the Owner's standing rule and the approved plan's rollout decision."
  - "Milestone 0 holds three audit issues that other branches already carry. This run does not implement them; it waits for them. They are listed as items so that every 'Blocked by' names something real."
  - "Owner decision, live, 2026-11-12: no stop between milestones."
  - "Until the item that builds a view lands, the address module points that view's target at the old page's tab, so the hub never links to a missing view (PRD 17)."
---

# Breakdown: Availability hub

Progress lives in the checkboxes below. Implement checks items off as their acceptance criteria are met.

PRD criteria are numbered as in `prd.md`. Walkthroughs are numbered as in `ux.md`. Component and interface names are those of `architecture.md`. Paths are under `apps/hospitality/src/` unless prefixed.

**Hot files, one PR at a time:** `main.tsx`, `pages/AvailabilityPage.tsx`, `components/availability/availability-address.ts`, `components/venue-setup/setup-tree.ts`, the four catalogs under `i18n/catalogs/`, `layouts/DashboardLayout.tsx`, `apps/hospitality/package.json` (size budgets), `e2e/helpers/first-paint.ts`.

**Every item:** one failing test first. `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm check:i18n-catalogs` from `apps/hospitality`. The availability e2e specs it touches pass, and `e2e/venue-setup-hub.spec.ts` passes. New strings go under `availabilityHub` in en-US, es-MX and fr-CA.

## Milestone 0: The audit work already in flight has landed

- [ ] **A0.1 Leftover regular week** — a regular-hours save no longer leaves the old week listed. (tracker: #8688)
  - Accept: PR #8755 is merged and #8688 is closed.
  - Blocked by: —
- [ ] **A0.2 Separate Pause dialog** — slice A: a Pause dialog with Tonight as the default; slice B: the status says when the pause ends. (tracker: #8687)
  - Accept: `PauseOnlineDialog` exists on `main` and #8687 is closed.
  - Blocked by: —
- [ ] **A0.3 One date editor, one copy action** — the day drawer is the only editor for a date's hours; one "Copy hours" action. (tracker: #8691)
  - Accept: #8691 is closed.
  - Blocked by: —

## Milestone 1: The hub is the landing page, and every row leads somewhere that works

- [x] **H1.1 Address module** — `components/availability/availability-address.ts` replaces `availability-entry.ts`: `availabilityPath(target)`, `readAvailabilityAddress(location)`, `legacyRedirect(search)`. Targets not built yet resolve to the old page's tab. `setup-tree.ts`, `nav-sections.ts`, `WaitlistClosedNotice.tsx` and `BookingWidgetDemoPage.tsx` build addresses only through it.
  - Accept: unit tests cover every target, every row of the architecture's old-address table with `from=setup` carried, an unparseable close target, and a close target of 21 dates read as "no dialog". No file outside the module contains the string `"/availability`. PRD 15.
  - Blocked by: —
- [x] **H1.2 Layout and route table** — `pages/AvailabilityLayout.tsx` with an outlet and `useAvailabilityScope()` (`venueId`, `timezone`, `today`, `state`, `isManager`, `refresh`). `main.tsx`: `availability` gains children; today's page mounts unchanged at `calendar`; old search params redirect with a replace. `RequireManager` gains `redirectTo`. `ROUTE_LABEL_KEYS` gains the new segments. Ledger, size budgets and chunk coverage updated.
  - Accept: loading `/availability/calendar?tab=special` shows today's Special dates tab; loading `/availability?tab=special` redirects there; the breadcrumb never reads "Details" on an Availability address; `ledger.mjs check` and `check-chunk-coverage.mjs` pass; every existing availability e2e spec passes with only its navigation helper changed.
  - Blocked by: H1.1
- [x] **H1.3 Shared rule summaries** — `components/availability/rule-summaries.ts`: a pure `scheduleUsage` (from `SchedulesTab.tsx:62-93`) and `upcomingRules` (from `setup-tree.ts:321`). Both callers use it.
  - Accept: unit tests reproduce "Not used yet", days only, a range, "from" and "until", and rules only; `SchedulesTab` and `setup-tree` tests pass unchanged.
  - Blocked by: —
- [x] **H1.4 `hubRows`** — `components/availability/hub/hub-rows.ts`, pure, with no text.
  - Accept: unit tests for each of the five rows in its filled and empty state, an upcoming regular-hours change, four sets of seasonal hours yielding three and "1 more", seasonal hours with weekdays and no dates, an online pause in force and one waiting, and a config whose source is `empty`. The module imports no React, router or i18n. PRD 1.
  - Blocked by: H1.3
- [x] **H1.5 `dateAnswer`** — `components/availability/hub/date-answer.ts`, pure.
  - Accept: unit tests for regular hours alone; seasonal hours over regular hours; a special date over seasonal hours; a closure from a time over a special date (walkthrough 7); a skipped series date; a tonight change; a date no rule covers; an invalid date returning null. Each asserts the deciding rule, the rule beneath it, and the hub row. PRD 5.
  - Blocked by: —
- [ ] **H1.6 Hub page** — `pages/AvailabilityHubPage.tsx`, `hub/HubRow.tsx`, `hub/DateCheck.tsx`; index route. Today line, date check, five rows with one action each, "Open calendar", "History". Row actions use the address module. Host view. Empty venue: a Manager is redirected to regular hours; a Host reads the empty sentence. Loading and error states as in `ux.md`.
  - Accept: `e2e/availability-hub.spec.ts` asserts the five row names in order, the "later rows win" line, the demo sentence and marked row for Dec 24 on the demo venue, first-paint controls at most 10 plus one per service at 1280x800 within 1.0 screens and at 375x812 within 1.5, a Host seeing no edit control, and zero axe violations at 1280, 820 and 375. Every row action lands on a view that renders. First setup still counts exactly 5 (`e2e/availability-interaction-baselines.spec.ts`). PRD 1, 3, 5, 17, 23, 24.
  - Blocked by: H1.2, H1.4, H1.5
- [x] **H1.7 Glossary ratchet** — `i18n/availability-glossary.ts` and `availability-glossary.test.ts`, with a `LEGACY_KEYS` allowlist holding every key that still uses a retired word.
  - Accept: the test fails when a retired word is added to an en-US value outside the allowlist, fails when es-MX or fr-CA lacks a key, and passes on the branch. PRD 12.
  - Blocked by: —

## Milestone 2: Close, Pause, Booking rules, History and Undo work from the hub

- [ ] **C2.1 rialto DatePicker** — typed dates, a prop for the opening month, and focus on the selected or current day when it opens. Patch changeset and axe entry.
  - Accept: component tests type a date and read it back, reject an out-of-range date with a problem, open an end picker on the start's month, and find focus on a day. PRD 21, 18.
  - Blocked by: —
- [ ] **C2.2 rialto TimePicker** — ArrowDown opens the closed list. Patch changeset.
  - Accept: a component test presses ArrowDown on the closed field and finds the list open with the current time active. PRD 21.
  - Blocked by: —
- [ ] **C2.3 Layout owns Undo** — `offerUndo` joins `useAvailabilityScope()`; the layout mounts `StrandedRevertDialog`.
  - Accept: a test saves from a child, unmounts that child, presses Undo, and sees the revert call with the saved change and version. A refused undo opens the blocked-undo dialog. PRD 9.
  - Blocked by: H1.2
- [ ] **C2.4 Close and Pause from the address** — the layout hosts `CloseDialog` and the Pause dialog from `?close=` and `?pause=1`. The hub gains the "Close or pause" menu. The old page's header buttons, the selection bar and the day drawer call `openClose`. `?closeSection=` redirects to `?close=section:<id>`.
  - Accept: e2e: each close target opens Close prefilled; Back closes it and a calendar selection beneath is intact; focus is inside the dialog on open and on the trigger after save; a Host with `?close=tonight` gets no dialog. Counted: pause tonight is 3 steps, close one date at most 5, close for a week at most 6 (walkthroughs 11 to 13). PRD 4, 7, 15, 18.
  - Blocked by: H1.6, C2.1, C2.3, A0.2
- [ ] **C2.5 Booking rules route and Undo** — `booking-rules` child route over the hub; client-side Undo as in the architecture's contract; a discard prompt; the line "Changes here are not listed in History". The ⋯ entry and the Schedules line are removed. Venue Setup opens the same address.
  - Accept: unit test: Undo re-saves the previous three values onto the settings current at that moment and keeps every other key. e2e: changing days ahead is 3 steps; leaving with an unsaved change asks first. PRD 7, 9, 11.
  - Blocked by: H1.6
- [ ] **C2.6 History route** — `history` child route over the hub; "Revert" reads "Undo". The ⋯ menu is removed from the old page.
  - Accept: loading `/availability/history` opens the drawer over the hub with focus inside; Back closes it; View day lands on `/availability/calendar?date=<date>`. PRD 2, 18.
  - Blocked by: H1.6, C2.3

## Milestone 3: Closures and special dates each have their own page

- [ ] **L3.1 `closures-list`** — `components/availability/closures-list.ts`, pure: config date rules, outcome counts, today and now in; rows grouped as Now, Upcoming, and Earlier with refunds still open.
  - Accept: unit tests for a venue closure, a section closure, a booking pause in force and one waiting, a repeating closure with a skipped date, and an ended closure with a failed refund.
  - Blocked by: —
- [ ] **L3.2 Closures page** — `pages/AvailabilityClosuresPage.tsx` at `closures`: Edit, Edit dates, Restore, Reopen, Resume, Call list, Retry refunds. The hub's row 4 points here and shows Resume while a pause is in force.
  - Accept: e2e: walkthrough 3's exception (skip one Monday, then restore it) and walkthrough 13's resume both finish; a Host sees the list and Call list with no Edit, Reopen or Resume; zero axe violations. PRD 14 (items 33 to 36, 38), 24.
  - Blocked by: L3.1, C2.4
- [ ] **L3.3 Special dates page** — `pages/AvailabilitySpecialDatesPage.tsx` at `special-dates`, with `special-dates/new` for the add sheet. Closure rows leave it; a count links to Closures. Holidays stay. `NextHolidayNudge` is deleted. The address module's `specialDates` target points here.
  - Accept: e2e: add two special dates in one save; edit and remove special hours with scope; decide one holiday and undo it; the list shows "N closures on upcoming dates" linking to Closures. `e2e/availability-holidays-copy.spec.ts` and `-dead-ends.spec.ts` pass. PRD 14 (items 37, 39, 40).
  - Blocked by: L3.2, A0.3

## Milestone 4: One set of service fields, and the hours editors use it

- [ ] **E4.1 Service fields** — `components/availability/service-fields/`: times, hints, "Seat every" and "Booked by", taking clock strings and plain values. `TimesRow` and the two selects move in. The weekly row gains "More options".
  - Accept: unit tests: a week loaded and saved without touching "More options" writes the same seating and booking values as before; changing each writes the new value; fixed seating times render as text and are saved untouched. The component imports neither draft model. PRD 6.
  - Blocked by: —
- [ ] **E4.2 Editor save bar** — `components/availability/EditorSaveBar.tsx`: Discard, Save with its reach, the blocked reason, and Keep theirs or Replace them.
  - Accept: component tests: Save is disabled until dirty; a press with a problem moves focus to the first problem; the label states the number of dates. PRD 8.
  - Blocked by: —
- [ ] **E4.3 One conflict dialog** — the weekly form uses `ConflictDialog`, fed by `use-conflict-review.ts`. `ConflictReviewPanel` is deleted.
  - Accept: component test: the weekly form and the date editor render the same component with the same button labels for the same refused save, naming who changed what and when; Review their change offers Reapply my changes and Start over. PRD 10.
  - Blocked by: —
- [ ] **E4.4 Regular hours page** — `pages/AvailabilityHoursPage.tsx` at `hours`, with `?service=` and the "starting" field. First setup lives here. The hub's service links and Edit point here. `RegularWeekPanel` and `ChangeRegularWeekDrawer` are deleted.
  - Accept: e2e: walkthroughs 1, 5 and 10 finish within 7, 7 and 4 steps; first setup counts exactly 5; the form after one edit shows at most 30 controls within 1.5 screens; Save is at most 6 Tab presses from an edited time; after Save, focus is on the hub's row 1 and Undo works; leaving with a draft asks first. PRD 7, 8, 11, 18, 19.
  - Blocked by: E4.1, E4.2, E4.3, C2.3, A0.1
- [ ] **E4.5 Seasonal hours list** — `pages/AvailabilitySeasonalListPage.tsx` at `seasonal`: usage text, Edit, Duplicate, Delete, with the reason a row cannot be deleted as visible text. The compare link shows only when two sets of hours run the same service.
  - Accept: e2e: the delete reason is in the accessibility tree without hover; a venue with only regular hours shows the empty sentence and no compare link. PRD 22.
  - Blocked by: H1.3, E4.4
- [ ] **E4.6 Seasonal hours editor** — `pages/AvailabilitySeasonalEditorPage.tsx` at `seasonal/new` (with `?from=`) and `seasonal/:scheduleId`: name, typed dates, the name suggestion, the overlap choice, "Also apply to". `ScheduleEditorDrawer` and `SchedulesTab` are deleted. A `route-fixtures.json` entry is added.
  - Accept: e2e: walkthrough 2 finishes in at most 10 steps with Keep theirs preselected; a duplicate starts as a copy; an edit offers "Also apply to" under a changed service. PRD 7, 21.
  - Blocked by: E4.5, C2.1
- [ ] **E4.7 One service across all hours** — `pages/AvailabilitySeasonalComparePage.tsx` at `seasonal/compare`, built on `CompareServices` with the shared fields.
  - Accept: e2e: its heading is in the viewport and holds focus on arrival at 1280x800 and 375x812; a bulk "set selected" saves two sets of hours at once. PRD 14 (item 18).
  - Blocked by: E4.5, E4.1

## Milestone 5: The calendar is a child route, and a date uses the same fields

- [ ] **D5.1 Date editor on the shared fields** — the date editor's rows and `AddDateRow` render `ServiceFields`. `ServicesEditor.tsx` keeps only the list around them.
  - Accept: `AvailabilityDayEditor.test.tsx` and `draft-changes.test.ts` pass with assertions unchanged except labels; no second implementation of the time, seating or booked-by fields remains (`rg` finds one). PRD 6.
  - Blocked by: E4.1, A0.3
- [ ] **D5.2 Day drawer scopes** — "Applies to" offers this date, the selection, or every {weekday} from and until. The two wider choices become links to regular hours and to that set of seasonal hours, with a discard prompt. `scope-switch.ts` is deleted. "Every week" in Copy hours and the repeated-change suggestion become the same link.
  - Accept: e2e: from a Tuesday with a draft, the regular-hours link asks to discard and then lands on `hours`; the day editor shows at most 18 controls. PRD 7, 14 (items 25, 27, 28).
  - Blocked by: D5.1, E4.4, E4.6
- [ ] **D5.3 Calendar page** — `pages/AvailabilityCalendarPage.tsx` at `calendar` with `?view=` and `?date=`. The tabs, `AvailabilityScheduleControls`, the regular-hours line and `pages/AvailabilityPage.tsx` are deleted. The selection bar is pinned to the bottom in one row on phone and tablet.
  - Accept: e2e: walkthrough 6 finishes; `?date=` opens that day and Back closes it; on phone, with one date selected ten rows down, the bar's actions are inside the viewport; a Host sees no edit control. `e2e/availability-phone.spec.ts`, `-demo-week`, `-migrated-venue` and `-locale` pass. PRD 2, 20, 24.
  - Blocked by: D5.2, L3.3, C2.6

## Milestone 6: The old page is gone, and the run is proved

- [ ] **P6.1 Rename to the glossary** — every en-US, es-MX and fr-CA value uses the glossary's term; `LEGACY_KEYS` is empty; `venue-setup-glossary.test.ts` and the glossary table in `docs/features/availability-setup-hierarchy/ux.md` are updated.
  - Accept: the glossary test passes with an empty allowlist; no value uses "Close" alone as an action label except a dismiss control; `e2e/locale-sweep.spec.ts` passes. PRD 12, 13.
  - Blocked by: D5.3
- [ ] **P6.2 Delete what is dead** — components, hooks and catalog keys only the old page used.
  - Accept: `pnpm check:knip` and `pnpm check:i18n-catalogs` pass; `rg "AvailabilityPage|SchedulesTab|SpecialDatesTab|availability-entry"` finds nothing under `apps/hospitality/src`. PRD 25.
  - Blocked by: P6.1
- [ ] **P6.3 Roles and old addresses, end to end** — one e2e per editor address as a Host; one per old address.
  - Accept: each editor address lands a Host on the hub; each row of the old-address table lands on its new view. PRD 15, 24.
  - Blocked by: D5.3
- [ ] **P6.4 Budgets and the 45 capabilities** — one e2e per row of PRD criterion 7's table, and a recorded walkthrough of the `ux.md` capability map.
  - Accept: every budget row has a passing test that asserts its target; each of the 45 capabilities is ticked in a table under Notes with the test or walkthrough that exercised it. Guest-facing check: `git diff --stat origin/main...HEAD -- services packages/availability packages/types` is empty for every merged PR of this run. PRD 7, 14, 16.
  - Blocked by: P6.2, P6.3
- [ ] **P6.5 Visual baselines and accessibility sweep** — baselines for the hub and each new view from the Linux runner; axe on every route and overlay at 1280, 820 and 375.
  - Accept: `gh workflow run visual-baseline-regen.yml -f app=hospitality` produced the baseline PR and it is merged; the axe sweep reports zero violations. PRD 23, 25.
  - Blocked by: P6.2

## Design gaps found

- `?from=` collision on `seasonal/new` (see Notes, 2026-11-12). Open.

## Notes

- 2026-11-12: the Owner chose to run all six milestones with no stop after Milestone 1. The cheapest kill test in `idea.md` is therefore not a gate. The hub is still usable from the end of Milestone 1, and the Owner can stop the run at any merge.
- 2026-11-12: #8693, #8694 and #8695 are folded into this run. Their acceptance criteria map to: #8693 → E4.5, E4.6, E4.7, C2.1; #8694 → C2.1, C2.2, C2.4, D5.3, E4.4, P6.5; #8695 → H1.7, E4.3, P6.1.
- 2026-11-12: `idea.md` names a two-day spike for the day drawer. The Architect stage removed the need for it (one set of fields, two forms), so no item carries it.
- 2026-11-12: H1.5 review decision: a rule decides a date only when it changes the services or a venue-wide closed band. Section closures, booking-channel closures, pacing changes and online pauses are never named by the date check. The alternative, a field saying what such a rule changed, was not built.
- 2026-11-12: H1.1: the "no "/availability" literal outside the address module" rule is enforced for production source only; test files keep literal addresses so they pin the module independently.
- 2026-11-12: H1.1 found that architecture.md uses `?from=` twice: `seasonal/new?from=<scheduleId>` and `?from=setup` on every address. Recommendation: the duplicate source becomes `?copy=<scheduleId>`. Needs the Owner's answer before E4.6.
- 2026-11-12: H1.2: the index route is `AvailabilityIndexRedirect` until H1.6. It replaces the address with `indexRedirect(search)`: an old address goes to the view it names, anything else to the landing view, with `from=setup` carried. H1.6 swaps the index element for the hub page and keeps the redirect only for a search `legacyRedirect` answers.
- 2026-11-12: H1.2: every target of `availabilityPath`, the hub included, resolves to today's page at `/availability/calendar` with the old page's own params (`?tab=`, `?action=addSchedule`, `?closeSection=`). In-app links therefore take no redirect hop. `legacyRedirect` builds its answer with `availabilityPath`, so the old-address table is staged in one place: `?tab=schedules` → `/availability/calendar?tab=schedules` (final `/availability/hours`), `?tab=calendar` → `…/calendar?tab=calendar` (final `/availability/calendar`), `?tab=special` → `…/calendar?tab=special` (final `/availability/special-dates`), `?action=addSchedule` → `…/calendar?tab=schedules&action=addSchedule` (final `/availability/seasonal/new`), `?closeSection=<id>` → `…/calendar?closeSection=<id>` (final `/availability?close=section:<id>`). The item that gives a view its own path in `availabilityPath` moves that row to its final address in the same change. When the hub's path becomes `/availability` (H1.6), `?closeSection=` must be translated to `?close=` in the same change (C2.4), or the index would redirect to itself.
- 2026-11-12: H1.2: on the bare route, `?action=addSchedule` wins over `?tab=`, as in the architecture's table. Today's page ignored the action on `?tab=calendar`; no link in the app builds that pair.
- 2026-11-12: H1.2 deviations from `architecture.md`. (1) The layout renders only the outlet. Today's page at `calendar` still renders the page header and the load-failure banner, so the layout rendering them too would show each twice; the layout takes them over with the first child that needs them (H1.6). Until then `useAvailabilityScope().state` is `null` both while the config loads and after a failed load, and `venueId` is `null` with no venue selected. (2) Today's page does not read the scope; it keeps its own hooks until D5.3 deletes it. The config read is shared through the query cache. (3) `useAvailabilityScope()` lives in `hooks/useAvailabilityScope.ts`, not in the layout file, so a child does not import the layout to read it. (4) `RequireManager` has `redirectTo`, and no route passes it yet, because no editor route exists. (5) Breadcrumb labels are looked up under the parent segment first (`seasonal/new`, `special-dates/new`, and `seasonal/*` for an id), because `new` alone cannot name two pages and an id has no label.
- 2026-11-12: H1.2: the e2e specs keep their `goto("availability…")` lines; the index redirect serves them. Changed: `firstPaint()` in `e2e/helpers/scenario-fixtures.ts` opens `availability/calendar`, and ten `toHaveURL` assertions in four specs name the new address. The visual route set now holds `availability/calendar` in place of `availability`, so its baseline must be regenerated on the Linux runner (`gh workflow run visual-baseline-regen.yml -f app=hospitality -f grep=availability`).
- 2026-11-12: H1.2 review, for H1.6: `useAvailabilityScope()` returns `state: null` both while loading and after a failed load, and `isManager: false` while the role is pending. H1.6 must add the layout's loading and error states (suppressed for the old page until D5.3) and a way to tell the three apart. Also for a later item: delete the unused `layout.routes.hours` catalog key and the orphaned `e2e/screenshots/availability-*.png` baselines once the new baselines exist.
- 2026-11-12: H1.4: `hubRows` returns facts only, with no addresses and no actions. H1.6 picks each row's action from the role and builds it through the address module; row 2 reads Add when `sets` is empty, and each service line links by its `venueServiceId`.
- 2026-11-12: H1.4: row 3 lists what the Add special dates sheet makes: special hours, "Same as another day", and the whole venue closed for a whole day. Such a closure is also a closure in row 4, as in the ux.md hub sketch ("Nov 26 Closed"). Every other closure is row 4's only.
- 2026-11-12: H1.4: row 4's `pause` is the open-ended online pause that Resume ends (`shownOnlinePause`), kept apart from `now` and `next`. A pause made for tonight only is a tonight change and is not in row 4; the Today line carries it. If A0.2's Pause dialog writes "until tonight ends" in another shape, C2.4 or L3.2 must widen `pause`.
- 2026-11-12: H1.4: a closure is "in force now" when it covers today (a skipped series date does not) and the venue's minute is inside its window, if it has one. A service closure reads as the venue and a section with no known name reads as the venue, because row 4 reuses `closureKindOf`.
