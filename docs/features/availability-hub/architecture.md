---
stage: architect
run: feature:availability-hub
date: 2026-11-12
assumptions:
  - "Owner decision, live, 2026-11-12: one set of service fields used by two forms (the weekly form and the date editor), not one form on one draft model. This removes the adapter between the two draft models, so the two-day spike in idea.md is not needed. prd.md criterion 6 is reworded in the same commit to say 'one implementation of the service fields'."
  - "Every other decision below is the Architect's, drafted from the code on the run's branch at 0831d46dd and not put to the Owner one by one. Each is a two-way door, undone by a revert."
  - "No applicable standard in docs/standards.json bears on a UI restructure; its factory and pipeline statements concern run artifacts and work orders."
---

# Architecture: Availability hub

Paths are under `apps/hospitality/src/` unless prefixed. "Config" means the availability config returned by `GET /availability/config`.

## Approach

`/availability` becomes a parent route with one child route per job. Today one 867-line page (`pages/AvailabilityPage.tsx`) owns every overlay, both discard guards and all three tabs, so any change to one job means holding the whole page in mind. After this run each job is a child route that owns its own state, and a thin layout owns only what crosses jobs: the config read, the role, the Close and Pause dialogs, Undo, and the blocked-undo dialog. The hub is a new read-only child built from pure functions over the config. No server, API, engine or type package changes; the whole design sits in `apps/hospitality` and two rialto components.

The measure of success is how much a reader must hold to change one job. Today that is the page plus the tab; afterwards it is one child route plus a five-field context.

**The shape that lost.** Keep one page and render the hub as a fourth view inside it, switching on a search param. It needs no router change and far fewer test edits. It loses because the page keeps owning every job's state, the three tabs and their guards stay entangled, and no job gets an address that Back and refresh respect (PRD criterion 2).

## Components

### Availability layout — `pages/AvailabilityLayout.tsx` (new)

- Responsibility: load what every child needs once, and host what must survive a move between children. It renders the page header, the load-failure banner, the migration notice, the Close and Pause dialogs, the blocked-undo dialog, and the child outlet.
- Collaborators: `useAvailabilityConfig`, `useManagerAccess`, `useVenue`, `useNow`, `useAvailabilityUndo`, the address module, `CloseDialog`, the Pause dialog from #8687.
- Deletion test: without it, every child would mount its own Close dialog and its own Undo, and Undo would die when an editor navigates back to the hub, because the revert call belongs to the component that offered it (`hooks/useAvailabilityUndo.ts`).

### Address module — `components/availability/availability-address.ts` (replaces `availability-entry.ts`)

- Responsibility: the only place an Availability address is built or read. It names every target, builds its path, reads the Close and Pause search params, and maps each old address to its new one.
- Collaborators: `main.tsx`, the layout, `components/venue-setup/setup-tree.ts`, `nav-sections.ts`, every hub row and back link.
- Deletion test: without it, path strings and the old-address mapping spread over about ten callers, and a renamed route breaks links silently.

### Hub — `pages/AvailabilityHubPage.tsx`, `components/availability/hub/` (new)

- `hub-rows.ts` — pure. Config, venue settings, holiday decisions and today in; five row models out. It composes existing functions and holds no text.
- `date-answer.ts` — pure. Config, time zone and a date in; what happens that day, the deciding rule, and the one rule beneath it out.
- `HubRow.tsx`, `DateCheck.tsx` — presentation only. They turn models into sentences through `t()` and `useVenueFormat`.
- Collaborators: `regular-week-line.ts`, `booking-rules.ts`, `holiday-decisions.ts`, `close-draft.ts` (`shownOnlinePause`), `@mbe/availability` (`resolveDay`), `TodayLine`.
- Policy and detail: the two pure modules are policy and import no React, router or i18n. The two components are detail and import the policy.

### Shared rule summaries — `components/availability/rule-summaries.ts` (new, extracted)

- Responsibility: the words-free facts about where a rule applies, used by the hub and by the list pages. It takes over `useUsageText` (private to `SchedulesTab.tsx:62-93`) as a pure `scheduleUsage`, and `upcomingRules` (private to `setup-tree.ts:321`).
- Collaborators: hub rows, the Seasonal hours list, `setup-tree.ts`.

### Service fields — `components/availability/service-fields/` (new, extracted)

- Responsibility: the one implementation of a service's fields: opens, last seating, closes, the last-seating hint, the overnight hint, "Seat every", "Booked by", and their problems. It takes clock strings and plain values, and knows nothing about either draft model.
- Collaborators: the weekly form's row (`QuickSetupServiceRow.tsx`), the date editor's row (inside `AvailabilityDayEditor.tsx`), the Add special dates row (`AddDateRow.tsx`), `CompareServices.tsx`, `clock-minutes.ts`.
- What moves in: `TimesRow` from `quick-setup-fields.tsx:205`, cut loose from the weekly draft root; the Seating and Booking selects and their option lists from `ServicesEditor.tsx:14,26-31,116-152`.
- What stays out: each form's draft model and change builder. The weekly form keeps `quick-setup-draft.ts`; the date editor keeps `draft-changes.ts`. `ServicesEditor.tsx` shrinks to the date editor's list (add an existing service, remove, fixed seating times shown as text) around the shared fields.

### Editor save bar — `components/availability/EditorSaveBar.tsx` (new)

- Responsibility: the pinned Discard and Save bar every editor uses, with its reach count, its blocked reason, and the Keep theirs or Replace them choice. It owns "Save is disabled until dirty; a press with a problem moves focus to the first problem".
- Collaborators: `ScheduleFormParts.tsx` (`OwnChangesChoice`, `OverlapChoice`, `BlockedReason` move under it), `use-save-attempts.ts`, `LeaveGuard`.

### Child routes (new pages, each built from existing parts)

| Route                                                                  | Page                                                          | Built from                                                                                                                      | Retires                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| index                                                                  | `AvailabilityHubPage`                                         | hub modules, `TodayLine`                                                                                                        | tab as landing                                                        |
| `hours`                                                                | `AvailabilityHoursPage`                                       | `QuickSetupForm`, `use-regular-week-edit.ts`, `DraftPreview`, `AvailabilityQuickSetup`                                          | `RegularWeekPanel`, `ChangeRegularWeekDrawer`                         |
| `seasonal`, `seasonal/new`, `seasonal/:scheduleId`, `seasonal/compare` | `AvailabilitySeasonalListPage`, `…EditorPage`, `…ComparePage` | `schedule-changes.ts`, `also-apply.ts`, `suggest-name.ts`, `CompareServices`                                                    | `SchedulesTab`, `ScheduleEditorDrawer`                                |
| `special-dates`, `special-dates/new`                                   | `AvailabilitySpecialDatesPage`                                | `special-dates.ts`, `UpcomingHolidays`, `AddSpecialDatesSheet`, `SpecialHoursEditDrawer`                                        | `SpecialDatesTab`, `NextHolidayNudge`                                 |
| `closures`                                                             | `AvailabilityClosuresPage`                                    | `closures-list.ts` (new, pure), `EditClosureDialog`, `SeriesEditDialog`, `ReopenClosureDialog`, `CallListDialog`, `useClosures` | closure rows in `SpecialDatesTab`                                     |
| `calendar`                                                             | `AvailabilityCalendarPage`                                    | the calendar block of today's page: toolbar, selection, grid, list, day drawer                                                  | `AvailabilityPage`, `AvailabilityScheduleControls`, `scope-switch.ts` |
| `booking-rules`                                                        | hub + `BookingRulesDrawer`                                    | `booking-rules.ts`, `useUpdateVenue`                                                                                            | the ⋯ entry, the Schedules line                                       |
| `history`                                                              | hub + `AvailabilityHistoryDrawer`                             | unchanged                                                                                                                       | the ⋯ entry                                                           |

The two drawer routes render the hub beneath them, so Back closes the drawer.

### Conflict dialog — `components/availability/ConflictDialog.tsx` (existing, becomes the only one)

- Responsibility: every refused save caused by a newer version. It names who changed what and when, and offers Review their change, Back to my draft, Discard mine and Overwrite. Review holds Reapply my changes and Start over.
- Collaborators: `use-conflict-review.ts` feeds it for the weekly form; the date editor already uses it. `ConflictReviewPanel` in `ScheduleFormParts.tsx` is removed.

### Glossary — `i18n/availability-glossary.ts`, `i18n/availability-glossary.test.ts` (new)

- Responsibility: one label per concept and the retired words for it, enforced on en-US values under the availability namespaces, with key parity for es-MX and fr-CA and no retired word reintroduced by en-GB.
- Collaborators: modelled on `i18n/venue-setup-glossary.test.ts`, which pins "Regular week" and "Schedule" today and changes in the same step that renames them.

### rialto changes — `packages/rialto/src/components/`

- `DatePicker`: the input accepts a typed date; a prop sets the month the picker opens on; on open, focus lands on the selected or current day. Today the input is `readOnly` (`DatePicker.tsx:113-122`), the opening month is derived once from `value` or `min` (`Calendar.tsx:103-107`), and focus lands on "previous month" (`Popover.tsx:129`).
- `TimePicker`: ArrowDown opens the closed list. Today only Enter and Space do (`Popover.tsx:238-248`).
- Each ships with its own test, an axe entry and a patch changeset.

## Data model

No stored data changes. Three pieces of client state gain a defined home.

**Address state.** Every view and overlay is an address.

| Address                                                         | Meaning                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/availability`                                                 | hub                                                                                                                   |
| `/availability/hours`                                           | regular hours; `?service=<venueServiceId>` names the service to open                                                  |
| `/availability/seasonal` · `/new` · `/:scheduleId` · `/compare` | list · new (`?from=<scheduleId>` copies that set; default copies regular hours) · edit · one service across all hours |
| `/availability/special-dates` · `/new`                          | list and holidays · the add sheet                                                                                     |
| `/availability/closures`                                        | closures and pauses                                                                                                   |
| `/availability/calendar`                                        | `?view=month\|week`, `?date=<YYYY-MM-DD>` opens that day                                                              |
| `/availability/booking-rules` · `/history`                      | drawer over the hub                                                                                                   |
| any of the above + `?close=<target>`                            | Close dialog. Target: `tonight`, one date, `<from>..<to>`, `dates:<d1>,<d2>,…` (at most 20), or `section:<id>`        |
| any of the above + `?pause=1`                                   | Pause dialog                                                                                                          |
| any of the above + `?from=setup`                                | show the "Venue Setup" back link                                                                                      |

Access patterns that justify it: open a job directly (PRD 2); return to the same place on Back and refresh; open Close prefilled from a selection, a day or a Venue Setup section without the caller owning dialog state; keep the selection beneath the dialog when it closes.

**Old addresses.** Each lands on its new one with a replace, so Back does not loop.

| Old                                | New                                |
| ---------------------------------- | ---------------------------------- |
| `/availability?tab=schedules`      | `/availability/hours`              |
| `/availability?tab=calendar`       | `/availability/calendar`           |
| `/availability?tab=special`        | `/availability/special-dates`      |
| `/availability?action=addSchedule` | `/availability/seasonal/new`       |
| `/availability?closeSection=<id>`  | `/availability?close=section:<id>` |
| `/setup/hours`                     | `/availability` (unchanged)        |

`from=setup` is carried across each of these.

**Layout context.** One object, provided through the router's outlet context and read by a typed hook `useAvailabilityScope()`:

- `venueId`, `timezone`, `today`
- `state`: the config, its version, its source
- `isManager`
- `refresh()`: refetch the config after a refused save
- `offerUndo(title, saved)`: show the 10-second Undo for a save

Children that need more (days for the calendar, closure outcomes, holiday decisions) call their own query hooks. Calls with the same venue share one cache entry (`hooks/create-query-hook.ts:76-82`).

**Invariants and their owners.**

- An address is valid or it falls back to the hub. Owner: the address module's parser, which drops any field that does not parse, as `parseAvailabilityEntry` does today.
- At most one unsaved draft exists under `/availability`. Owner: each editor route's own `LeaveGuard`. The router consults only the last blocker registered (`LeaveGuard.tsx:21-24`), and only one editor route is mounted at a time. The layout registers none.
- Only a Manager reaches an editor address. Owner: the route table, through `RequireManager`.
- Consistency: every save still carries `expectedVersion`; the server stays the single judge of a stale write. The hub reads may be up to 30 seconds old (`providers/QueryProvider.tsx:20`) and every save invalidates them.

## Interfaces & contracts

### `availabilityPath(target)` and `readAvailabilityAddress(location)`

- Input: a target (`hub`, `hours` with an optional service, `seasonal` list/new/edit/compare, `specialDates`, `closures`, `calendar` with an optional view and date, `bookingRules`, `history`), plus optional `close`, `pause` and `from`. Or a location to read.
- Output: a path string; or the parsed close target, pause flag and `from`.
- Failure modes: an unparseable close target reads as "no dialog". A close target with more than 20 dates reads as "no dialog". Old search params are never produced, only read by `legacyRedirect(search)`, which returns the new address or null.

### `hubRows(input)`

- Input: config, venue settings, holiday states, section names, time zone, today, and "now" in minutes.
- Output: five row models. Regular hours: services with hours and days, and an upcoming change or none. Seasonal hours: up to three sets with where they apply, and a count of the rest. Special dates: the next two, and the count of holidays not planned. Closures and pauses: what is in force now, including an online pause and whether it can be resumed, and the next closure. Booking rules: the three values or "not set".
- Failure modes: none of its own; it is pure. A venue whose config source is `empty` yields an "empty venue" result, which the page turns into a redirect to `hours` for a Manager and a sentence for a Host. A config that is `unreadable` is the layout's load failure, and the hub renders no rows.

### `dateAnswer(config, timezone, date)`

- Input: config, time zone, one date.
- Output: the services that run with their hours; any closed band; the deciding rule (kind, and the rule or schedule it refers to); the one rule beneath it, or none; and which hub row the deciding rule belongs to.
- Rule: the deciding rule is the top entry of `resolveDay(...).explanation` that changed the outcome: a tonight change, then a closure, then special hours, then a use-these-hours rule, then seasonal hours, then regular hours (`regularWeek: true`). A skip is never named; it only removes the rule it skips.
- Failure modes: a date no rule covers returns "closed, no hours cover this date" with no deciding rule. An invalid date string returns null, and the field shows its own "Enter a date" problem.

### Layout Close and Pause host

- Input: the `close` and `pause` search params; `openClose(target)` and `openPause()` from any child, which set the param with a push.
- Output: the dialog over the current child. On save it removes the param with a replace, returns focus to the trigger, and calls the child's optional `onClosed` registered for the open (the calendar uses it to clear its selection).
- Failure modes: a Host with a `close` or `pause` param gets no dialog and the param is removed. A `section:<id>` that is not a section of this venue opens Close with "Whole venue". A search-param change does not trip `LeaveGuard`, which compares pathnames only (`LeaveGuard.tsx`); the calendar therefore asks its own discard guard before it calls `openClose`, as the page does today (`AvailabilityPage.tsx:637-639,715-716`).

### `offerUndo(title, saved)`

- Input: a toast title and the save result (`changeId`, `version`).
- Output: a 10-second toast with Undo. Undo reverts that change at that version.
- Failure modes: unchanged from today. A refused undo that would leave bookings without service opens the blocked-undo dialog. While any editor is open, Undo answers "Discard your changes first, then undo" and stays on offer (`components/availability/editor-open.ts`). Because the layout owns the call, the toast still works after the editor that saved has unmounted.

### Booking rules Undo

- Input: the three previous values, captured at save.
- Output: on Undo, a second venue update with `withBookingRules(settingsNow, previous)`, where `settingsNow` is read from the venue cache at that moment.
- Failure modes: there is no version check on venue settings. If another person changed booking rules in the 10 seconds, Undo overwrites their three values with the previous ones; every other settings key is preserved. A failed re-save shows "Couldn't undo booking rules" with Retry. This limit is stated in the drawer ("Changes here are not listed in History").

### `ServiceFields` props

- Input: clock-string times, the last-seating link flag, seating (an interval, or fixed times), booked-by, the problems for these fields, an id scope, and an optional date for the overnight hint.
- Output: `onChange` with the next values.
- Failure modes: it validates nothing and saves nothing. Fixed seating times render as read-only text and are passed back untouched. Each form keeps its own validation (`quick-setup-validate.ts` for the week; the server's issue list for a date).

### `RequireManager`

- Input: children and an optional `redirectTo` (default `/setup`, as today).
- Output: the children for a Manager; a loading page while the role loads; a redirect otherwise.
- Use: every editor route passes `redirectTo="/availability"`. The hub, calendar, special dates list, closures list and history are not wrapped; they hide edit controls from `isManager`.

## Stack & dependencies

- React Router nested routes with an outlet — already used for onboarding (`main.tsx:205-221`, `layouts/OnboardingLayout.tsx:66`). `useOutletContext` is new to this app and is wrapped in one typed hook.
- One lazy chunk per child page, as every page is today (`main.tsx:72-74`). Each new chunk of 5 kB or more needs a `size-limit` budget in `apps/hospitality/package.json`, or `check-chunk-coverage.mjs` fails.
- No new package. `@mbe/availability`'s `resolveDay` is already a client dependency.
- New strings go under a new top-level key `availabilityHub` in the four catalogs; no registration is needed. Titles need `ROUTE_LABEL_KEYS` entries (`layouts/DashboardLayout.tsx:51-70`) for `seasonal`, `special-dates`, `closures`, `booking-rules`, `calendar`, `history`, `new` and `compare`, or the breadcrumb and document title read "Details". `hours` is relabelled from "Availability" to "Regular hours".
- Generated and derived files that follow the route table: the ui-quality ledger (`metrics/ui-quality-ledger.jsonl`, from `scripts/ui-quality/routes.mjs`), a `route-fixtures.json` entry for `seasonal/:scheduleId`, and the visual route set that reads the ledger (`e2e/visual.spec.ts`).

## Accepted behaviour changes

From comparing today's page with this design over the cases where they differ:

1. A Manager lands on the hub, not the regular-week form. A Host lands on the hub, not the calendar.
2. The view is in the address. Refresh and Back keep it.
3. A Host who loads an editor address lands on the hub, not on Venue Setup.
4. The regular-hours line, its Details list and the holiday nudge leave the calendar; the hub holds them.
5. In the day drawer, "Every regular {weekday}" and "Everywhere {name} is used" become links. A typed draft is not carried; the link asks to discard first. `scope-switch.ts` is removed.
6. "Change regular week" as a drawer is gone. A later start is a field on Regular hours. A period with an end date is new seasonal hours.
7. Close and Pause sit behind one menu, so each costs one more press. Typed dates remove two or more from any Close that names a date.
8. Closures no longer list on the special dates page; it shows a count and a link.
9. The weekly form shows seating interval and booked-by. Saving without touching them writes the same values as today (`quick-setup-draft.ts:339`).
10. Booking rules gain a client-side Undo with the limit stated above.
11. History's "Revert" reads "Undo". The words in the glossary change everywhere.
12. The pause banner leaves the hub; the Today chip and row 4 carry it. The banner stays on the calendar and list pages through the layout.

## Decisions & alternatives

- **Child routes under a layout** over one page with a view param — the page would keep owning every job's state, and no job would have an address.
- **Outlet context for the five shared values** over each child calling the hooks itself — the query cache would be shared either way, but Undo must outlive the editor that saved, so one owner above the children is required anyway.
- **Search params for Close and Pause** over child routes for them — they open over any child and must leave the child's state (a calendar selection) intact; a path change would also trip the leave guard. The app already derives a dialog from a search param (`pages/ReservationsPage.tsx:122-129`).
- **One set of service fields, two forms** over one form on one draft model — Owner's decision. The two models write different things (a week's days and per-day variations; a date's special hours), and an adapter would have to reproduce six kinds of scope exactly.
- **The date sentence composed in the app** over a new field on `GET /availability/days` — the engine already runs on the client and returns the rules in order; a server field would break "no backend change".
- **`hub-rows.ts` and `date-answer.ts` as pure modules with no text** over building sentences inside components — the rules ("which rule decided", "what counts as now") are testable without rendering, and the words stay in the catalogs.
- **Extending `RequireManager` with `redirectTo`** over a second guard component — one rule, one owner.
- **A new `availabilityHub` catalog key, add-only until cleanup** over renaming keys in place — four catalogs are hot files; add-only edits do not conflict with the in-flight audit branches.
- **Typed dates in rialto before Close moves behind the menu** over shipping the menu first — without typed dates, "close one date" goes from 5 steps to 6 and "close for a week" from 7 to 8 (ux.md walkthroughs 11 and 12).
- **Client-side Undo for booking rules** over leaving them without Undo — PRD criterion 9 asks for it and the server cannot change; the cost is the overwrite window recorded above.
- **No seam for the config read** — one adapter exists (TanStack Query over the API client) and tests already mock at the API; a second interface would be a hypothetical seam.

## ADRs

none — no decision met the ADR bar. Each is a two-way door undone by a revert, and none is surprising without context: nested routes, search-param dialogs and shared field components all have prior art in this app. The supersession of `availability-setup-hierarchy` criterion 7 and its glossary terms is recorded in this run's `prd.md` frontmatter.
