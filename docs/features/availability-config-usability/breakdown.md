---
stage: decompose
run: feature:availability-config-usability
date: 2026-11-03
assumptions:
  - "The milestone cut was not reviewed live: this is an autorun and no Owner was present at the skill's review-the-cut step. The skill's recommended boundaries are kept as drafted."
  - "Tracker import (Owner: 'Seed matching issues'): exactly one item carries (tracker: #7738), Collapse script, because detector C in tools/factory/knowledge_plane.py allows one breakdown row per tracker issue. Collapse script is transitively blocked by 'Legacy migration emits one regular week' (via collapseDayNamedSchedules), so Implement checks off both the migration-shape change and the collapse script before the tagged item closes #7738; that meets architecture.md's two-item condition for Closes #7738 by ordering, not by a second tag. The Prisma column migration, the pure collapseDayNamedSchedules function, 'Legacy migration emits one regular week' and every other item carry no tracker reference."
  - "The interaction counter ships first (Milestone 1) and records the uniform bistro and large-setup baselines against the unchanged quick-setup form, so 'no more than today' compares against a count taken before any UI item lands. The repo has no existing large multi-room fixture (searched apps/hospitality/e2e); that item authors one with several services and records its shape in Notes. Both are sequencing and fixture choices, not design changes; the unit of interaction is architecture.md decision (f), unchanged."
  - "i18n sequencing: each UI item adds its new keys to en-US, es-MX and fr-CA in the same change, so locale parity holds at every commit; the Locale parity sweep item is the final check over all new copy, not the first translation."
  - "The Owner-only human-timed 5-minute walkthrough (PRD success criteria) is deliberately covered by no item. No stage claims it as run or passed."
  - "The strip's tables-read states, the 'not checked against your tables' wording and the departure from ux.md F-STRIP 4 come from architecture.md assumptions 2 and 3 as written; items follow architecture.md, not ux.md, where they differ."
---

# Breakdown: One regular week that can differ by day

Progress lives in the checkboxes below. Implement checks items off as their acceptance criteria are met.

Names follow `architecture.md` exactly. "Engine" means `packages/availability` (`@mbe/availability`). Every `Blocked by:` names an item by its exact bold title.

## Milestone 1: The engine understands a service's own days and hours (uniform weeks unchanged)

- [x] **Interaction counter and baselines** — add `apps/hospitality/e2e/helpers/interaction-counter.ts`, a wrapper around the test's `Page` that counts one interaction per Locator action (click, fill, check, uncheck, press) and none for goto, expect or waitFor. Author the large multi-service fixture. Measure the uniform bistro week and the large setup on the unchanged form and record them as constants beside the fixtures.
  - Accept: a Playwright test for the wrapper shows a click, a fill, a check, an uncheck and a press each count 1, a combobox open then choose counts 2, and goto, expect and waitFor count 0. Both baseline counts are recorded in Notes and as constants. `availability-quick-setup.spec.ts` still passes.
  - Blocked by: —
- [x] **Day-scope schema in @mbe/types** — `DayHoursSetSchema`, `DayHoursSchema` and the two new `ScheduleServiceSchema` fields (`weekdays`, `dayHours`) with the defaults in `architecture.md` Data model. Add `weekdays` to `AvailabilityChangeDetail` and the `regular_week_changed` code. The PUT request schema takes both new fields as optional.
  - Accept: unit tests show a row without the two fields parses with `weekdays: []` and `dayHours: { version: 1, sets: [] }`, an old History inverse still parses, a `dayHours.version` other than 1 is rejected, and a set with no weekdays is rejected.
  - Blocked by: —
- [x] **Prisma migration add_schedule_service_day_scope** — add `weekdays Int[] @default([])` and `dayHours Json @default(...) @map("day_hours")` to `ScheduleService` in `schema.prisma`, and the folder `services/reservations/prisma/migrations/20261103120000_add_schedule_service_day_scope/migration.sql` with exactly the additive `ALTER TABLE` in `architecture.md`. It is applied only to a fresh Docker Postgres, never to a real database.
  - Accept: `node scripts/check-destructive-migrations.js` exits 0 (no `DROP`, `DELETE`, `TRUNCATE`); `prisma migrate deploy` applies every migration to a fresh Docker Postgres, the CI Migration Dry-Run job's recipe, and the `rls-force-coverage` test still passes; `scripts/prisma-enum-drift.mjs` is unaffected; `@@unique([scheduleId, venueServiceId])` is still in `schema.prisma`.
  - Blocked by: Day-scope schema in @mbe/types
- [x] **hoursOn and servicesOn in resolveDay** — create `packages/availability/src/service-days.ts` with `hoursOn(row, weekday)` and `servicesOn(rows, venueServices, weekday)`. `resolve-day.ts` calls `servicesOn` through `servicesOf(scheduleId, weekday)`, and the explanation's `scheduleDetail` and `removalResult` take the same weekday.
  - Accept: unit tests cover a row with no scope (identical to the old rule on every weekday), a row scoped to Mon–Fri under a wider assignment (runs those days only), a set claiming Fri–Sat with the base elsewhere, a row scoped to days no assignment covers (never resolves), and a covered weekday where no row runs (`isDayClosed` says closed). Each layer's `removalResult` still equals `resolveDay` with that layer removed.
  - Blocked by: Day-scope schema in @mbe/types
- [ ] **validateConfig per weekday** — overlap is checked per weekday over `servicesOn`, each hour set goes through the existing `hoursIssues`, a weekday claimed twice in one row is `weekday_clash`, and `ConfigIssue` gains optional `weekday` and `otherPath`.
  - Accept: tests show Dinner and Brunch overlapping on Saturday only gives one `overlap` issue carrying `weekday` and `otherPath`; the same two rows on disjoint days give none; a weekday in two sets, or in a set and an explicit base, gives `weekday_clash`; an issue inside a set has the path `scheduleServices[i].dayHours.sets[j].<field>`; legacy rows with overlap are still rejected exactly as before.
  - Blocked by: hoursOn and servicesOn in resolveDay
- [ ] **encodeWeek and decodeWeek** — `encodeWeek(week, coveredDays)` produces the canonical rows (base is the hours most days share, a tie goes to the group holding the earliest Monday-first day, `weekdays` empty exactly when the base days equal the covered days minus the sets' days, sets ordered by first Monday-first day) and `decodeWeek(rows, coveredDays)` reads them back.
  - Accept: a fast-check property test shows `decodeWeek(encodeWeek(w, days), days)` equals `w` for every generated `w`, and that encoding the decoded rows again returns identical rows. A uniform week encodes to `weekdays: []` and no sets. The demo week (lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, brunch Sat–Sun) encodes to one row per service with the later close as one set.
  - Blocked by: hoursOn and servicesOn in resolveDay
- [ ] **Legacy projection per weekday** — `legacy-projection.ts` takes the hull of `servicesOn` per weekday for the covering undated assignment.
  - Accept: tests show a scoped row projects per weekday (Monday has no dinner window in the demo week), and a config of unscoped rows projects identically to the pre-change function kept in the test as the oracle.
  - Blocked by: hoursOn and servicesOn in resolveDay
- [ ] **Scoped-row property tests** — extend `slots.property.test.ts` with a generator for scoped rows and sets, and add the oracle comparison for legacy configs.
  - Accept: over generated configs no listed slot falls outside `resolveDay`, `judge` returns hard inside a closure, and for configs with every row unscoped `resolveDay` and `validateConfig` agree with the pre-change functions kept in the test. The existing `packages/availability` suite is green.
  - Blocked by: validateConfig per weekday, encodeWeek and decodeWeek, Legacy projection per weekday
- [ ] **weekSpans and regularWeekView** — `weekSpans(config, options)` returns, for seven consecutive service dates from `options.from`, each running service's `{ venueServiceId, firstAt, lastAt, noTableFits }` through `listSlots` (filtered to tables that fit the party only when the venue has active tables), taking no clock but the `now` it is given. `regularWeekView(config)` keeps only live kind-`regular` schedules' assignments and drops date rules.
  - Accept: tests show the demo week gives Friday and Saturday later last times than Thursday and no dinner on Monday; a party with no fitting table gives `noTableFits` and not a missing service; a closure rule or a dated schedule is ignored by `regularWeekView`; and for the same config each day's span equals the first and last time `listSlots` returns for that date.
  - Blocked by: hoursOn and servicesOn in resolveDay

## Milestone 2: The reservations service saves, stores and reads a varied week

- [ ] **Store reads and writes day scope** — `availability-config-rows.ts` `scheduleServiceData` writes `weekdays` and `dayHours` and reads through `ScheduleServiceSchema`; `availability-snapshot.ts` and `availability-migration.ts` `writeAvailabilityConfig` carry the two columns.
  - Accept: a unit test shows a stored row without the two fields reads as "no scope". A row with an unknown `dayHours.version` is dropped by `parseRows` with a warning, and the venue serves the rows left. `writeAvailabilityConfig` writes both columns.
  - Blocked by: Day-scope schema in @mbe/types, Prisma migration add_schedule_service_day_scope
- [ ] **Migration forward-path integration test** — a reservations integration test on the harness `rls-isolation.integration.test.ts` uses, against Docker Postgres only.
  - Accept: the test inserts a row in the old shape (the two columns omitted), reads it through `readStoredConfig` and gets "no scope"; it writes a varied week through the store and reads it back byte-equal.
  - Blocked by: Store reads and writes day scope
- [ ] **Config save path with day scope** — `PUT …/availability/config` accepts rows carrying the two fields, validates through `validateConfig`, and keeps the `expectedVersion` compare-and-set.
  - Accept: route tests show a varied-week save returns `{ version, changeId }`; a `weekday_clash` returns 422 `invalid-config` with the issue paths; a save with a stale `expectedVersion` returns 409 `version-conflict`; a Host gets 403; and a request that omits the two fields parses as "no scope".
  - Blocked by: validateConfig per weekday, Store reads and writes day scope
- [ ] **regular_week_changed audit detail** — `configSavedDetail` in `availability-change-detail.ts` returns `regular_week_changed` with `startsOn` and the changed `weekdays` when a save changes which hours a regular-week weekday resolves to (compared through `decodeWeek` before and after), and `config_saved` otherwise.
  - Accept: tests show changing only Friday's close gives `weekdays` equal to Friday alone, renaming a service or editing a non-regular schedule gives `config_saved`, and a client that does not know the code reads the English `summary`.
  - Blocked by: encodeWeek and decodeWeek, Store reads and writes day scope
- [ ] **Legacy migration emits one regular week** — `buildLegacyConfig` emits one regular schedule, one assignment over every open weekday and one scoped row per service name through `encodeWeek`; the "`<days> hours`" naming and `kind: "alternate"` output go. `writeAvailabilityConfig` therefore makes Backfill and the on-the-fly legacy read produce the new shape.
  - Accept: `availability-migration.golden.test.ts` passes (identical slots to the legacy oracle over 60 days for every seeded and fixture venue, both legacy shapes). A new test shows a legacy venue whose days differ migrates to one regular schedule with no "hours"-named schedule and no `kind: "alternate"`. `backfill-availability.test.ts` passes and asserts the new shape.
  - Blocked by: encodeWeek and decodeWeek, Legacy projection per weekday, Store reads and writes day scope
- [ ] **Fixtures carry day scope** — update the fixtures `api-mocks.ts`, `availability-draft-mock.ts`, `dinner-config.fixture.ts`, `resolved-day-fixtures.ts` and `rls-route-sweep.fixtures.ts` for the two new fields, and add one varied-week fixture (the demo week) beside them.
  - Accept: the RLS route sweep passes with the new fixtures, the existing availability component tests still pass, and the demo-week fixture resolves Monday with no dinner under `resolveDay`.
  - Blocked by: Day-scope schema in @mbe/types, hoursOn and servicesOn in resolveDay
- [ ] **Agent closure tool consumer fix** — in `services/agent`, `gen-agent-closure-tools.ts` seeds the special-hours payload from `servicesOn` for the date's weekday, `gen-agent-availability-tools.ts` `serviceDayMinute` takes the earliest opening from `servicesOn`, and `@mbe/availability` becomes a workspace dependency of `@mbe/agent-service`.
  - Accept: on the demo-week fixture, a Friday special-hours payload holds only the rows running Friday with Friday's hours, and `serviceDayMinute` for Monday ignores dinner; both are identical to today's output for unscoped rows. A test passes for the agent's availability chat tools against a varied week.
  - Blocked by: hoursOn and servicesOn in resolveDay
- [ ] **History Undo and Tonight on a varied week** — service tests only, no new behaviour.
  - Accept: tests show Undo of a varied-week change restores the prior rows including day scope; Undo of a History entry saved before this change (inverse without the two fields) restores and parses; a Tonight change on a varied weekday applies to the right service, with a Host allowed as before; and Tonight clears at the service-day boundary with the schedule untouched.
  - Blocked by: Config save path with day scope, regular_week_changed audit detail

## Milestone 3: Migrated day-named schedules read as one regular week

- [ ] **collapseDayNamedSchedules** — new `packages/availability/src/day-named-schedules.ts` returns the `AvailabilityConfigChanges` that fold collapsible schedules (undated, kind alternate, named exactly `weekdayRangeLabel(days) + " hours"`, no `use_schedule` rule pointing at them) into the regular one, or `null` when none qualifies. `weekdayRangeLabel` moves here from `legacy-migration.ts`.
  - Accept: a property test over generated migrated configs shows `resolveDay` of every weekday is unchanged by the collapse, and the function returns `null` for a config with a dated assignment, a `use_schedule` reference or another name. A Manager-made schedule with another name is left alone. An alternate overlapping the regular week at higher precedence collapses with the regular-only service scoped to the other days.
  - Blocked by: encodeWeek and decodeWeek, Legacy migration emits one regular week
- [ ] **Collapse script** — `services/reservations/src/scripts/collapse-day-named-schedules.ts`, the shape of `backfill-availability.ts`: dry run by default, `--apply` writes. Per venue, in one transaction in its own RLS context: compare-and-set `Venue.availabilityVersion` (+1), replace the regular schedule's rows with the encoded week, delete the folded schedules' assignments, archive the folded schedules; no `AvailabilityChange` row. The Owner runs any apply; the run never applies against a real database. (tracker: #7738)
  - Accept: a unit test with a mocked client (as `backfill-availability.test.ts`) shows the default mode performs no write call, `--apply` performs the writes above, one venue failing does not stop the rest, a missed compare-and-set is reported `raced` and skipped, each venue's JSON line carries the rows it replaced, and the exit code is 1 only when a venue errored. After a collapse `validateConfig` on the venue's config reports no `precedence_tie`, and re-running changes nothing.
  - Blocked by: collapseDayNamedSchedules, Store reads and writes day scope
- [ ] **Collapse script integration test** — one test against Docker Postgres.
  - Accept: a venue backfilled in the old shape (regular Mon–Wed plus "Thu–Fri hours") has the same `resolveDay` for every weekday before and after the script's apply on the test database, the folded schedules are archived, and the carried-over state (`isCarriedOver`: rows and no change) still holds.
  - Blocked by: Collapse script

## Milestone 4: A Manager sets up a varied week in quick setup with a live strip (the demo)

- [ ] **Quick-setup draft with days and blocks** — `quick-setup-draft.ts`: `ServiceDraft` gains `days: number[] | null` and `blocks`; `draftToConfig` builds a weekday → hours map and calls `encodeWeek`; `draftFromConfig` is `decodeWeek` plus presentation; `validateDraft` maps an issue path into a block (`QuickSetupIssue.blockId`) and its `weekday` into the message, with `days_required` per service that has its own days; `draftToLegacyHours` stays `projectLegacyOperatingHours(draftToConfig(...))`.
  - Accept: unit tests show a uniform draft (every `days` null, no blocks) writes the same rows as before (`weekdays: []`, no sets); the demo week draft encodes to the rows in the demo-week fixture; `draftFromConfig(draftToConfig(d))` round-trips; and a Saturday overlap gives the message "Dinner overlaps Brunch on Saturday." with the block's id.
  - Blocked by: encodeWeek and decodeWeek
- [ ] **Per-service days in QuickSetupForm** — the "Different days for this service" control behind a closed disclosure per service row, following the shared Days when unset (`ux.md` F1 and S1).
  - Accept: a component test shows ticking Mon–Fri on Lunch and Sat–Sun on Brunch gives per-service days; the shared Days fieldset and the "Weekdays", "Dinner", "Opens", "Closes", "Last seating" and name controls are not duplicated in the DOM while the disclosures are closed; focus moves in on open and returns on close; `availability-quick-setup.spec.ts` still passes.
  - Blocked by: Quick-setup draft with days and blocks
- [ ] **Different-hours blocks in QuickSetupForm** — the "Different hours on some days" block (`ux.md` S13): a block starts with no day ticked and carries its own opens, last seating (linked or not) and closes.
  - Accept: a component test adds a block to Dinner for Fri–Sat with a later close and the draft holds one set; removing the block removes it; an empty-day block is reported by `validateDraft`; additions and removals are announced politely.
  - Blocked by: Per-service days in QuickSetupForm
- [ ] **RegularWeekStrip** — new component (`ux.md` S12) rendering `weekSpans(regularWeekView(applyChanges(emptyConfig, draftChanges)))` on every draft change with a local party `Select`, tables from `useTables({ activeOnly: true })`, the "Updated" tag diffing this render's spans with the last, and no preview request.
  - Accept: a component test edits Friday's close and the strip's Friday last time moves with no navigation and no request other than the tables read; Monday shows no dinner for the demo week; a pending tables read shows spans without the party check under a skeleton note; a failed read shows the spans, a "Check again" button that refetches and "These are the hours you typed, not checked against your tables", and Save is not blocked; rows are text, not controls.
  - Blocked by: weekSpans and regularWeekView, Quick-setup draft with days and blocks
- [ ] **Strip in quick setup and wizard local mode** — mount `RegularWeekStrip` beside the quick-setup form in `QuickSetupCard`, below it at 720 px; the saved toast lists the union of the days any service runs; the onboarding step (`QuickSetupHoursStep.tsx`) shows the new controls and the strip's local mode with no tables, and sends the legacy projection.
  - Accept: a component test shows the strip beside the form on a Manager's empty venue and absent for a Host; the wizard renders the controls and the strip without a `venueId`; a varied week through `draftToLegacyHours` keeps each weekday's earliest open to latest close; the saved toast lists the union of the services' days.
  - Blocked by: Different-hours blocks in QuickSetupForm, RegularWeekStrip
- [ ] **Guest-facing lines show first and last bookable time** — `AvailabilityGuestPreview.tsx` (`:301-309`) and `day-summary.ts` (`:56-66`) print first and last bookable time instead of opening and closing, using `lastSeatingAt` already in the data.
  - Accept: component tests show a service with opens 5:00 PM, last seating 9:15 PM and closes 10:00 PM is printed as 5:00 PM to 9:15 PM in the focus-date list and in the calendar's day line, and not as 10:00 PM.
  - Blocked by: —
- [ ] **Demo week e2e** — a Playwright spec following the PRD demo step by step on an empty venue, through quick setup only.
  - Accept: the spec enters lunch Mon–Fri, dinner Tue–Sun, a later close Fri–Sat and brunch Sat–Sun with no visit to the Schedules tab; the strip's Friday last slot moves before any save and without leaving the form; Monday shows no dinner; after save each weekday's services and times match in the calendar, the day drawer and the guest preview; the strip's per-weekday times equal the guest preview's for the same week.
  - Blocked by: Strip in quick setup and wizard local mode, Guest-facing lines show first and last bookable time, Config save path with day scope

## Milestone 5: Change regular week, the calendar and the Schedules tab speak one regular week

- [ ] **Regular week builder by weekday** — `buildRegularWeekChanges` in `schedule-changes.ts` takes services with their days and blocks, encodes them, and sets the new assignment's weekdays to the union of the days any service runs (`regularWeekdays` is deleted). With an end date it builds a dated alternate schedule over those days; with no end it builds a new regular version named "Regular week" with no Name field, end-dates the old assignments the day before, and keeps the superseded schedule's `kind: "regular"`.
  - Accept: unit tests show a no-end change of one weekday's hours gives six weekdays' resolved hours unchanged and no schedule the Manager names; a closed weekday can be opened; with no end a weekday no service runs on is closed from the start date; the superseded schedule keeps `kind: "regular"`; the dated case leaves other days on their existing hours.
  - Blocked by: encodeWeek and decodeWeek, Quick-setup draft with days and blocks
- [ ] **Change regular week drawer** — `ChangeRegularWeekDrawer.tsx` seeds from `decodeWeek`, reuses the quick-setup service rows and blocks, drops `nameRequired` when there is no end, words the period case "Name this period to save.", and gives `DraftPreview` a focus date for the weekday being edited.
  - Accept: component tests show the drawer pre-fills each service's base hours as the hours most of its days share (`ux.md` F-UW 5), Save needs only a start date with no end, the period case still requires a name, the "Applies to" line and impact count follow the edited days, and the preview focus is the edited weekday. `availability-dead-ends.spec.ts` (the "Choose a start date to save." case) still passes.
  - Blocked by: Regular week builder by weekday, Different-hours blocks in QuickSetupForm
- [ ] **Day drawer weekday scope and nudge** — in `draft-changes.ts`, `EditScope` kind `schedule` for a day that resolves to the regular week becomes `{ kind: "regularWeekday", weekday }`: decode, replace that weekday's services, encode, diff against the stored rows, in place. `ScheduleNudge.tsx` builds the same changes instead of `buildNewScheduleChanges`.
  - Accept: tests show "Every regular Friday" changes only Friday's hours and counts the weekday's future dates; no schedule or assignment is created; the nudge after three one-off Friday changes writes Friday's hours into the regular week and shows the toast `ux.md` F2 3 gives it.
  - Blocked by: encodeWeek and decodeWeek, regular_week_changed audit detail
- [ ] **Calendar regular-week line** — new `regular-week-line.ts` gives the calendar's one-line summary and Details rows from `decodeWeek` and `weekSpans(regularWeekView(config))`, including "later/earlier/different hours Fri–Sat" from a set's closing against the base's.
  - Accept: component tests on the demo-week fixture show the line for a Manager and for a Host (the config read needs `requireAuth` only), "later hours Fri–Sat" for the later close, and no per-day schedule or assignment listed.
  - Blocked by: weekSpans and regularWeekView, encodeWeek and decodeWeek
- [ ] **Schedules tab visibility** — the tab shows only while a live schedule has `kind !== "regular"`.
  - Accept: a component test shows the tab absent for a venue whose only schedules are kind `regular` (including a superseded version), present when a live schedule of another kind exists, and a schedule saved before this change with kind `alternate` still lists.
  - Blocked by: Regular week builder by weekday
- [ ] **New and Edit schedule rows** — `ScheduleEditorDrawer` (New schedule and Edit schedule) uses the quick-setup service rows and blocks in place of the uniform `ServicesEditor`.
  - Accept: a component test creates a schedule with one service Mon–Fri and Fri–Sat hours different, saves, reopens Edit schedule and gets the same rows back; a varied period saved from Change regular week opens in Edit schedule with its sets intact.
  - Blocked by: Per-service days in QuickSetupForm, Different-hours blocks in QuickSetupForm
- [ ] **Compare services and row readers** — `CompareServices.tsx` shows a row's base hours and "+ different hours" when `weekdays` or `dayHours.sets` is non-empty, with an edit link that opens Edit schedule; `compare-changes.ts`, `conflict-review.ts` and `draft-changes.ts` read rows through `servicesOn`.
  - Accept: component tests show a scoped row shows base hours and the "+ different hours" mark and the link opens Edit schedule; a Compare edit of an unscoped row saves identically to today; conflict review on a varied week names only services that run on the conflicting weekday.
  - Blocked by: hoursOn and servicesOn in resolveDay, New and Edit schedule rows
- [ ] **History line for a regular-week change** — the History drawer words `regular_week_changed` from `startsOn` and `weekdays`, as `ux.md` F12, falling back to the English `summary` for unknown codes.
  - Accept: a component test shows a Friday-only change reads with "Fri" and the start date, and an unknown code falls back to its `summary`.
  - Blocked by: regular_week_changed audit detail
- [ ] **Migrated venue component test** — component test on a migrated-venue fixture (a regular schedule plus a day-named schedule collapsed by `collapseDayNamedSchedules`, and a not-yet-collapsed one).
  - Accept: the calendar reads the collapsed venue as one regular week with no "Thu–Fri hours" anywhere; the Schedules tab is absent; Change regular week pre-fills from it; the carried-over banner still shows for a venue with rows and no change.
  - Blocked by: collapseDayNamedSchedules, Calendar regular-week line, Schedules tab visibility, Change regular week drawer

## Milestone 6: Copy in three locales

- [ ] **Locale parity sweep** — every key added by the UI items above exists in `en-US.json`, `es-MX.json` and `fr-CA.json` through the existing catalogs, with weekday names from the active locale and no hard-coded copy.
  - Accept: `locales.test.ts` (the locale-parity check) passes; a grep over the changed components finds no user-facing literal outside the catalogs; the locale-sweep e2e renders the strip and a different-hours block in es-MX and fr-CA without a missing-key marker.
  - Blocked by: Per-service days in QuickSetupForm, Different-hours blocks in QuickSetupForm, Strip in quick setup and wizard local mode, Guest-facing lines show first and last bookable time, Change regular week drawer, Day drawer weekday scope and nudge, Calendar regular-week line, New and Edit schedule rows, Compare services and row readers, History line for a regular-week change

## Milestone 7: Interaction guards and the final regression gate

- [ ] **Bistro week e2e** — the uniform bistro week through quick setup, counted by the wrapper.
  - Accept: the count is no more than the uniform baseline recorded by the interaction counter item; `availability-quick-setup.spec.ts` passes unchanged.
  - Blocked by: Interaction counter and baselines, Strip in quick setup and wizard local mode
- [ ] **Varied week interaction e2e** — the demo week counted on the same fixture through both paths: quick setup, and quick setup then the Schedules tab's New schedule.
  - Accept: the quick-setup path's count is lower than the Schedules-tab path's, both counted by the same wrapper in one spec. The count is agent stand-in evidence only, and the spec says so.
  - Blocked by: Interaction counter and baselines, Demo week e2e
- [ ] **Large setup guard** — the large multi-service fixture through quick setup, counted by the wrapper.
  - Accept: the count is no more than the large baseline recorded by the interaction counter item. It is a guard, not a re-timed 15-minute bar.
  - Blocked by: Interaction counter and baselines, Strip in quick setup and wizard local mode
- [ ] **One weekday e2e** — a Playwright spec changes one weekday's hours in Change regular week on the demo-week venue.
  - Accept: after save the other six weekdays resolve unchanged in the calendar, no schedule or assignment appears in the Schedules tab (the tab is absent), and the History entry names that weekday.
  - Blocked by: Change regular week drawer
- [ ] **Migrated venue e2e** — a Playwright spec opens a migrated venue.
  - Accept: the calendar shows one regular week with no day-named schedule, and the Schedules tab is absent.
  - Blocked by: Migrated venue component test
- [ ] **Regression gate** — run every existing availability suite once, after all other items.
  - Accept: `packages/availability` tests (including the property tests), the availability config and preview tests in `services/reservations`, `services/agent` tests, the availability component tests in `apps/hospitality`, and every `apps/hospitality/e2e/availability-*.spec.ts` pass; `pnpm lint && pnpm typecheck` are green; locale parity passes.
  - Blocked by: Interaction counter and baselines, Prisma migration add_schedule_service_day_scope, Migration forward-path integration test, History Undo and Tonight on a varied week, Fixtures carry day scope, Agent closure tool consumer fix, Collapse script integration test, Locale parity sweep, Bistro week e2e, Varied week interaction e2e, Large setup guard, One weekday e2e, Migrated venue e2e, Scoped-row property tests

## Coverage: PRD success criterion to item

| PRD success criterion           | Covered by                                                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Varied week in quick setup      | Demo week e2e; Quick-setup draft with days and blocks; Per-service days in QuickSetupForm; Different-hours blocks in QuickSetupForm                                    |
| Per-weekday result              | hoursOn and servicesOn in resolveDay; Config save path with day scope; Demo week e2e; Calendar regular-week line; Guest-facing lines show first and last bookable time |
| One regular week                | Calendar regular-week line; Schedules tab visibility; Migrated venue component test; Migrated venue e2e; collapseDayNamedSchedules                                     |
| Change regular week, one day    | Regular week builder by weekday; Change regular week drawer; Day drawer weekday scope and nudge; One weekday e2e                                                       |
| Strip is live and honest        | weekSpans and regularWeekView; RegularWeekStrip; Strip in quick setup and wizard local mode; Demo week e2e                                                             |
| Uniform week no slower          | Interaction counter and baselines; Bistro week e2e                                                                                                                     |
| Varied week faster than today   | Varied week interaction e2e                                                                                                                                            |
| Large setup no slower           | Interaction counter and baselines; Large setup guard                                                                                                                   |
| Interactions keep working       | History Undo and Tonight on a varied week; Agent closure tool consumer fix; regular_week_changed audit detail                                                          |
| Copy in three locales           | Locale parity sweep (and the keys each UI item adds)                                                                                                                   |
| No regression, engine property  | Scoped-row property tests; Regression gate                                                                                                                             |
| Owner-only 5-minute walkthrough | No item, deliberately: an Owner post-release check that no stage claims                                                                                                |
| The demo runs as written        | Demo week e2e                                                                                                                                                          |

## Coverage: architecture component to item

| Component                                              | Item                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service days and hour sets (`service-days.ts`)         | hoursOn and servicesOn in resolveDay; encodeWeek and decodeWeek; weekSpans and regularWeekView                                                                                                                                         |
| Layer resolution (`resolve-day.ts`)                    | hoursOn and servicesOn in resolveDay                                                                                                                                                                                                   |
| Configuration invariants (`validate-config.ts`)        | validateConfig per weekday                                                                                                                                                                                                             |
| Legacy projection, migration and collapse              | Legacy projection per weekday; Legacy migration emits one regular week; collapseDayNamedSchedules                                                                                                                                      |
| Availability store (reservations service)              | Store reads and writes day scope; Config save path with day scope; regular_week_changed audit detail; Prisma migration add_schedule_service_day_scope; Migration forward-path integration test                                         |
| Collapse script                                        | Collapse script; Collapse script integration test                                                                                                                                                                                      |
| Quick-setup draft and form                             | Quick-setup draft with days and blocks; Per-service days in QuickSetupForm; Different-hours blocks in QuickSetupForm                                                                                                                   |
| Week builder and Change regular week                   | Regular week builder by weekday; Change regular week drawer                                                                                                                                                                            |
| Regular-week weekday edits: day drawer scope and nudge | Day drawer weekday scope and nudge                                                                                                                                                                                                     |
| Strip and calendar presentation                        | RegularWeekStrip; Strip in quick setup and wizard local mode; Calendar regular-week line; Guest-facing lines show first and last bookable time; Schedules tab visibility; New and Edit schedule rows; Compare services and row readers |
| Agent chat tools                                       | Agent closure tool consumer fix                                                                                                                                                                                                        |
| Interaction counter (decision f)                       | Interaction counter and baselines; Bistro week e2e; Varied week interaction e2e; Large setup guard                                                                                                                                     |
| Fixtures and direct row readers (decision e)           | Fixtures carry day scope; Compare services and row readers                                                                                                                                                                             |
| `@mbe/types` schema and `AvailabilityChangeDetail`     | Day-scope schema in @mbe/types                                                                                                                                                                                                         |

## Design gaps found

none.

## Notes

- Counts: 7 milestones, 43 items. Exactly one carries `(tracker: #7738)`: Collapse script. Implement closes #7738 only when the brief's coverage condition holds and both Legacy migration emits one regular week and Collapse script are checked; otherwise the Ship PR says `Refs #7738`.
- 2026-11-03: Detector C allows one breakdown row per tracker issue, so `(tracker: #7738)` sits only on Collapse script. Collapse script is transitively blocked by Legacy migration emits one regular week (Collapse script → collapseDayNamedSchedules → Legacy migration emits one regular week), so Implement checks off both before the tagged item closes #7738. That keeps `architecture.md`'s condition for `Closes #7738` in intent: the two-row wording in `architecture.md` and the brief is met by that ordering, not by two tags.
- The Collapse script is built and tested in dry-run first; an apply on any real database is an Owner step and is never run by the pipeline.
- 2026-11-03: Interaction baselines, measured on the UNCHANGED quick-setup form (local run, synthetic OIDC session: auth.setup.ts skipped, no Auth0 E2E creds locally; agent stand-in evidence, counted by `e2e/helpers/interaction-counter.ts`). Constants live in `apps/hospitality/e2e/helpers/quick-setup-scenarios.ts`.
  - `UNIFORM_BISTRO_BASELINE = 5`: Lunch chip, Add another service, Dinner chip, Weekdays shortcut, Save and open bookings.
  - `LARGE_SETUP_BASELINE = 13`: the large fixture is four services, every day: Brunch chip, Add, Dinner chip, Add, name fill "Tasting Menu" plus Opens and Closes comboboxes (open + choose each = 4), Add, Late chip, Every day shortcut, Save.
  - The repo had no large multi-room fixture; this one is authored in `quick-setup-scenarios.ts` (`setLargeSetup`). `mockEmptyVenue` moved from `availability-quick-setup.spec.ts` to `e2e/helpers/empty-venue-mock.ts` so the baselines spec shares it; the quick-setup spec is otherwise unchanged.
- 2026-11-03: Day-scope schema in @mbe/types: `ScheduleService` is a `z.infer` output type, so `weekdays` and `dayHours` became required on every hand-built row. To keep `pnpm typecheck` green at each commit, the same commit adds `weekdays: []` and `dayHours: { version: 1, sets: [] }` (no scope) mechanically to the rows built by `packages/availability` (`legacy-migration.ts` and its test fixtures) and by `apps/hospitality` (`draft-changes.ts`, `quick-setup-draft.ts` and the test and fixture files that build rows). This does not change behaviour; "Fixtures carry day scope" and the later UI items still own the real use of the fields. `services/reservations`, `services/agent` and `packages/api-client` typecheck unchanged.
