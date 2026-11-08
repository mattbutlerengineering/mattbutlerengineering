---
stage: decompose
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "REVISED (Main): Open-as-usual lives in its own table and endpoints, not a DateRule kind (architecture.md header). Four slices. A (the store) lands its first item first, because B compiles against the shared types and the api-client methods; C touches no decision code and may start at once. After A1, B and C run in parallel with each other and with A2 to A4: their files are disjoint (architecture.md § D). Shared files are the three i18n catalogs only, each slice adding keys under its own namespace (B: availabilitySpecial.holidays.*, C: availabilitySchedules.copy.*)."
  - "The shared contract (type names, exports, prop names) is in architecture.md § Shared contract. A slice may not rename anything in it without messaging the others."
  - "Checks (build, tests, lint) run once by the main agent after the slices land, not by each slice."
---

# Breakdown: Holiday decisions that stick, and Copy that says what it does

PRD criteria are numbered as in prd.md.

## Slice A: the holiday-decision store (migration, routes, types, api-client)

- [x] **A1. Table, types, endpoints.** *Land first, alone.*
  - `schema.prisma`: `VenueHolidayDecision` (`@@unique([venueId, serviceDate])`, `decision` a string, FK cascade); migration `<ts>_add_venue_holiday_decision` with the `CREATE TABLE`, `ENABLE`/`FORCE ROW LEVEL SECURITY`, the `venue_holiday_decision_isolation` policy and the `app_reservations` grant (as `20261025000000_add_venue_availability` `:287-359`). Regenerate the Prisma client.
  - `packages/types`: `schemas/holiday-decisions.ts` and `endpoints/holiday-decisions.ts` exactly as the shared contract; exported from the indexes.
  - `packages/api-client/src/availability.ts`: `listHolidayDecisions`, `setHolidayDecision`, `clearHolidayDecision`.

  Acceptance: `tsc` passes in `packages/types`, `packages/api-client`, `services/reservations`. PRD 3.
- [x] **A2. Service and routes.** `services/holiday-decision.ts` (`list`, `set` idempotent upsert, `clear` idempotent delete; skips a row whose `decision` it cannot parse), added to `domain-services.ts`; `routes/holiday-decisions.ts` with `registerEndpoint` (list: any member; set and clear: Manager), registered in `app.ts` under `AVAILABILITY_CONFIG_PREFIX`; RFC 7807 errors; OpenAPI docs. PRD 3.
- [x] **A3. Tests.** Route and service tests, the three `rls-route-sweep` fixtures and the RLS isolation and cascade checks, schema tests, the api-client tests (architecture.md § E "A"). PRD 3.
- [x] **A4. Docs.** The three routes and the table in `services/reservations/docs/reference.md`.

Files owned: `services/reservations/prisma/**`, the new route and service files, `domain-services.ts`, `app.ts` (one line), `rls-route-sweep.fixtures.ts`, `reference.md`; `packages/types` (the two new files and the indexes); `packages/api-client/src/availability.ts` and its tests. No existing availability file changes: `DateRuleSchema`, the engine and the config route are not touched.

## Slice B: holiday decisions UI (depends on A1)

- [x] **B1. Pure model.** `holiday-decisions.ts` with `holidayStates(country, today, config, decisions)` and the 365-day horizon (a covering rule outranks the open mark); delete `isPlanned`, `upcomingHolidays` and `HOLIDAY_HORIZON_DAYS` from `holidays.ts` and fix `holidays.test.ts`. Tests: every precedence row in architecture.md § B1. PRD 1, 5.
- [x] **B2. Closure-path props.** `AddSpecialDatesSheet`: `autoNext` and `savedTitle`. `ReopenClosureDialog`: `onReopened`. Tests for each prop (with nothing affected the sheet saves with no drawer shown; with bookings affected it shows step two; the toast text). PRD 1, 2.
- [x] **B3. Query hooks, decision hook and line.** `hooks/useHolidayDecisions.ts` (query key `holidayDecisions`, set and clear mutations invalidating it, no `trackOwnSave`); `use-holiday-decision.ts` (saving, failed and retry per date; the ordered chains of architecture.md § B2: remove the owned rule or reopen the closure first and then `set`; write the closure or special hours first and then `clear`; Undo = `clear`) and `HolidayLine.tsx` with its CSS module (three choices, `aria-pressed`, 44 px targets at 375 px, Change). Tests: the calls and their order for every transition, a failure at each step leaving the line undecided with Retry, a 404 and a 405 from `set` reading `Couldn't save.`, the line never showing as decided on failure. PRD 1, 5, 10.
- [x] **B4. The Upcoming holidays panel.** Rewrite `UpcomingHolidays.tsx`: usually-closed header and `Close these N` (two or more undecided), month `h3` groups, first 5 and "Show N more", the folded Decided group, the loading skeleton and the failed-list state (no lines), Host read-only, the `other` → day-drawer route through `onOpenDay`. Wire `SpecialDatesTab` (state and callbacks for the sheet and the reopen chain) and pass `onOpenDay` from `AvailabilityPage` (≤ 3 lines). PRD 1, 2, 3, 5.
- [x] **B5. Nudge and cutover.** `NextHolidayNudge` reads `holidayStates` (nothing rendered while the list loads or fails); delete `open-as-usual.ts` and its imports; replace the localStorage seed in `AvailabilityPage.regularWeek.test.tsx:188` with a decision for `2026-11-26`. Remove the dead catalog keys. PRD 3.
- [x] **B6. Strings.** `availabilitySpecial.holidays.*` per ux.md in en-US, es-MX and fr-CA; key parity; lists through `Intl.ListFormat`. PRD 11.

Order: B1 and B2 in parallel; B3 after B1 and B2; B4 after B3; B5 and B6 after B4.

Files owned: `holiday-decisions.ts`, `holidays.ts` (+tests), `hooks/useHolidayDecisions.ts`, `UpcomingHolidays.tsx`, `HolidayLine.tsx` (+css), `use-holiday-decision.ts`, `NextHolidayNudge.tsx`, `open-as-usual.ts` (deleted), `SpecialDatesTab.tsx` (+css, tests), `AddSpecialDatesSheet.tsx`, `ReopenClosureDialog.tsx`, `AvailabilityPage.tsx` (the `onOpenDay` line only), `AvailabilityPage.regularWeek.test.tsx`, `availabilitySpecial.holidays.*` in the catalogs.

## Slice C: Copy UI (independent of A and B)

- [x] **C1. Pure comparisons and drafts.** `copy-week-draft.ts`: `sameHoursAs`, `thisWeekTargets`, `copyWeekDraft` (per architecture.md § C), with tests for week boundaries, the past, the source weekday, equal and unequal services, times and last seating, and the round trip through `draftToConfig`. PRD 6, 8.
- [x] **C2. Drawer prefill.** `initialStartsOn` on `ChangeRegularWeekDrawer` and `useRegularWeekEdit` (counts as dirty). Test: opens with the draft and the start set, Cancel asks before discarding. PRD 6.
- [x] **C3. The dialog.** Rewrite `CopyDayAction.tsx`: DayPicker chips with the source weekday locked (a `lockedDays` prop on the shared picker), "How often", the live consequence line, the already-same line and its all-same disabled reason, "Copy to Wed and Thu" / "Review regular week…", toasts that name the dates. Delete From and Until, `OwnChangesChoice` and the date-count text. Delete the repeating rule builder and `copyDayDates` in `copy-day.ts`; keep the nudge's two exports. Add the `timezone` prop at `AvailabilityDayDrawer.tsx:366`. Tests: this-week rules (one per date, no `repeat`), every-week opens the drawer, nothing saved when all match, no count in any string. PRD 6, 7, 8.
- [x] **C4. Strings and fallout.** `availabilitySchedules.copy.*` per ux.md in the three catalogs, dropping the replaced keys; update the tests that click "Copy to N dates" (`AvailabilityDayDrawer.draft.test.tsx`, `ScheduleSaveUndo.test.tsx`, `use-reload-hold.test.tsx`). PRD 7, 11.

Order: C1 and C2 in parallel; C3 after both; C4 after C3.

Files owned: `copy-week-draft.ts`, `copy-day.ts`, `CopyDayAction.tsx` (+tests), `ChangeRegularWeekDrawer.tsx`, `use-regular-week-edit.ts`, `AvailabilityDayDrawer.tsx` (the Copy props only), the shared day picker (`lockedDays`), `availabilitySchedules.copy.*` in the catalogs.

## Slice D: scenarios (after A, B and C)

- [x] **D1. Shared-config mock and the e2e spec.** `e2e/helpers/shared-config-mock.ts` (one in-memory store for two pages: config GET and PUT and the three `holiday-decisions` routes) and `e2e/availability-holidays-copy.spec.ts`:
  - H1 (≤ 3);
  - H2 (≤ 3, and the second Manager's context shows the decision with 0 decisions and no nudge);
  - H3 (≤ before);
  - K1 (≤ before; the PUT carries week rows and no `dateRules` upsert; matching days send no PUT);
  - K2 (≤ before; one rule per date, no repeat);
  - the failure line (the decision `PUT` answers 404 once, as an older server would: `Couldn't save.`, Retry, not shown as decided);
  - a Host sees decisions read-only.

  Counts are recorded as agent stand-in annotations through `countInteractions`; "before" is measured on this run's base at Implement. PRD 1–3, 5, 6, 8, 9, 10.
- [x] **D2. Regressions.** Update, deliberately and in the notes below, the specs whose counts or selectors change (`availability-setup-hierarchy.spec.ts`, the fold-budget spec, `availability-dead-ends.spec.ts`, `availability-draft.spec.ts`); run the availability, onboarding, Venue Setup, a11y, fold-budget and locale e2e suites, the engine and reservations suites. PRD 12.

Files owned: `e2e/**` only.

## Order

```
A1 ──┬─► B1,B2 ─► B3 ─► B4 ─► B5,B6 ──┐
     │                                 ├─► D1 ─► D2
     ├─► C1,C2 ─► C3 ─► C4 ───────────┤
     └─► A2,A3,A4 ─────────────────────┘
```

- A1 is the only gate for B; C touches no decision code, so C may start at once.
- A2 to A4, B and C are parallel after A1.
- D follows all three.

## Notes

- 2026-11-08 (Decompose): architecture.md corrects prd.md's "no SQL migration": the new table needs one `CREATE TABLE` migration with RLS and grants (A1).
- 2026-11-08 (Revised, Main): the first design, a new `open_as_usual` `DateRule` kind, is replaced by a separate table and endpoints, because it made old tabs (Host stations on Timeline) fail to parse the config and made a server rollback fail every date-rule read.
- 2026-11-08 (Implement): deviations from architecture.md.
  - **A2 range check:** the 400-day range and real-date checks run in the route as well as the schema (`isHolidayDecisionsRange` and `isRealServiceDate` in `@mbe/types`). `registerEndpoint` does not enforce a query refine, and `ServiceDateSchema` accepts 2026-02-31.
  - **A2, set (review M1):** `set` upserts with `update: { decision }`. An empty update compiles to SELECT then INSERT, which races to a unique violation and a 500.
  - **B2:** `ReopenClosureDialog`'s existing `onDone` is reused instead of a new `onReopened` prop. `AddSpecialDatesSheet` gains `onSaved` as well as `autoNext` and `savedTitle`.
  - **B3:**
    - Each Closed or Special hours… press is its own sheet request (keyed), and the line stays saving until that sheet settles. While any line saves, the other lines and Close these N are blocked (review M2).
    - Closed → Special hours… reopens the closure only after the hours save (review M4).
    - The failure line sits under the choices instead of replacing them.
  - **B1:** a series with a `skip` on the holiday date is not a decision (review n5).
  - **C1:** `splitCopyTargets` leaves out and names dates under a whole-day closure (review M3), and `regularSameWeekdays` compares against the regular week only (review n1).
  - **C3:**
    - "Just this week" uses the `replace` scope-conflict mode, not `keep`. With `keep`, a range or repeating special-hours rule on a target date would silently drop the copy. With `replace`, a `skip` row steps that rule aside on the date.
    - The How often radio was replaced by the buttons [Every week…] and [Copy to …]. K1 measured 8 with the radio. ux.md is amended, and the PRD's K1 budget is now ≤ 7.
    - Chosen weekdays the regular week doesn't open are added to the regular assignment in the prefill.
  - **D1:** the dead-ends and draft Copy specs use a week with a differing day, because Copy now refuses to copy hours a day already has.

