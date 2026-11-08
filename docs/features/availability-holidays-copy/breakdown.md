---
stage: decompose
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "Four slices. A (the kind) is small and lands first, because B and C compile against its Zod member and the regenerated Prisma client. After A's first item, B and C run in parallel with each other and with A's remaining tests: their files are disjoint (architecture.md § Files). Shared files are the three i18n catalogs only, each slice adding keys under its own namespace (B: availabilitySpecial.holidays.*, C: availabilitySchedules.copy.*)."
  - "The shared contract (type names, exports, prop names) is in architecture.md § Shared contract. A slice may not rename anything in it without messaging the others."
  - "Checks (build, tests, lint) run once by the main agent after the slices land, not by each slice."
---

# Breakdown: Holiday decisions that stick, and Copy that says what it does

PRD criteria are numbered as in prd.md.

## Slice A: the `open_as_usual` kind (types, engine, server)

- [ ] **A1. The kind and the migration.** *Land first, alone.*
  - `packages/types/src/schemas/availability-config.ts`: add the `open_as_usual` member (`targetKind: z.literal("venue")`), export `OpenAsUsualRule`.
  - `services/reservations/prisma/schema.prisma`: add `open_as_usual` to `enum DateRuleKind` and to the `DateRule` doc comment.
  - New migration `…_add_open_as_usual_date_rule_kind/migration.sql`: `ALTER TYPE "DateRuleKind" ADD VALUE IF NOT EXISTS 'open_as_usual';`, with the precedent's non-destructive header and the rollback note (soft-delete the rows first).
  - Regenerate the Prisma client.

  Acceptance: `tsc` passes in `packages/types`, `packages/availability`, `services/reservations`; `dateRuleData` writes the new value with no code change. PRD 3, 4.
- [ ] **A2. Engine tests: guests resolve identically.** In `packages/availability`: deep-equal `resolveDay` with and without the rule (plain, special-hours and closed days, `explanation` included); the booking judge verdict identical; `validateConfig` accepts the rule; every `ofKind` excludes it. In `packages/types`: parse and reject cases. PRD 4.
- [ ] **A3. Service tests.** In `services/reservations`: PUT config upsert then GET; remove + upsert in one PUT replaces a `special_hours` row; a Host is refused; a stale version is 409; `POST …/closures` refuses the kind with 422; the calendar summary label is unchanged; the migration applies over existing rows. PRD 3, 4, 10.
- [ ] **A4. Docs.** One line each in `services/reservations/docs/reference.md` (the kind, no payload, PUT-only, Manager) and `packages/availability/CLAUDE.md` (the layer order is unchanged: this kind selects no layer).

Files owned: `packages/types/src/schemas/availability-config.ts` (+tests), `packages/availability/src/**` tests only, `services/reservations/prisma/**`, `services/reservations/src/**` tests only, the two docs.

## Slice B: holiday decisions UI (depends on A1)

- [ ] **B1. Pure model.** `holiday-decisions.ts` with `holidayDecisions`, `openAsUsualRule`, `decisionChanges`, and the 365-day horizon; delete `isPlanned`, `upcomingHolidays` and `HOLIDAY_HORIZON_DAYS` from `holidays.ts` and fix `holidays.test.ts`. Tests: every precedence row in architecture.md § B1. PRD 1, 5.
- [ ] **B2. Closure-path props.** `AddSpecialDatesSheet`: `autoNext` and `savedTitle`. `ReopenClosureDialog`: `onReopened`. Tests for each prop (with nothing affected the sheet saves with no drawer shown; with bookings affected it shows step two; the toast text). PRD 1, 2.
- [ ] **B3. Decision hook and line.** `use-holiday-decision.ts` (saving, failed and retry per date, the PUT for Open as usual, the chains for Closed and Special hours per architecture.md § B2, Undo) and `HolidayLine.tsx` with its CSS module (three choices, `aria-pressed`, 44 px targets at 375 px, Change). Tests: the PUT body, one request when replacing special hours or an earlier mark, the 400 and 409 failure states with Retry, the line never showing as decided on failure. PRD 1, 5, 10.
- [ ] **B4. The Upcoming holidays panel.** Rewrite `UpcomingHolidays.tsx`: usually-closed header and `Close these N` (two or more undecided), month `h3` groups, first 5 and "Show N more", the folded Decided group, Host read-only, the `other` → day-drawer route through `onOpenDay`. Wire `SpecialDatesTab` (state and callbacks for the sheet and the reopen chain) and pass `onOpenDay` from `AvailabilityPage` (≤ 3 lines). PRD 1, 2, 3, 5.
- [ ] **B5. Nudge and cutover.** `NextHolidayNudge` reads `holidayDecisions`; delete `open-as-usual.ts` and its imports; replace the localStorage seed in `AvailabilityPage.regularWeek.test.tsx:188` with an `open_as_usual` rule. Remove the dead catalog keys. PRD 3.
- [ ] **B6. Strings.** `availabilitySpecial.holidays.*` per ux.md in en-US, es-MX and fr-CA; key parity; lists through `Intl.ListFormat`. PRD 11.

Order: B1 and B2 in parallel; B3 after B1 and B2; B4 after B3; B5 and B6 after B4.

Files owned: `holiday-decisions.ts`, `holidays.ts` (+tests), `UpcomingHolidays.tsx`, `HolidayLine.tsx` (+css), `use-holiday-decision.ts`, `NextHolidayNudge.tsx`, `open-as-usual.ts` (deleted), `SpecialDatesTab.tsx` (+css, tests), `AddSpecialDatesSheet.tsx`, `ReopenClosureDialog.tsx`, `AvailabilityPage.tsx` (the `onOpenDay` line only), `AvailabilityPage.regularWeek.test.tsx`, `availabilitySpecial.holidays.*` in the catalogs.

## Slice C: Copy UI (independent of A and B)

- [ ] **C1. Pure comparisons and drafts.** `copy-week-draft.ts`: `sameHoursAs`, `thisWeekTargets`, `copyWeekDraft` (per architecture.md § C), with tests for week boundaries, the past, the source weekday, equal and unequal services, times and last seating, and the round trip through `draftToConfig`. PRD 6, 8.
- [ ] **C2. Drawer prefill.** `initialStartsOn` on `ChangeRegularWeekDrawer` and `useRegularWeekEdit` (counts as dirty). Test: opens with the draft and the start set, Cancel asks before discarding. PRD 6.
- [ ] **C3. The dialog.** Rewrite `CopyDayAction.tsx`: DayPicker chips with the source weekday locked (a `lockedDays` prop on the shared picker), "How often", the live consequence line, the already-same line and its all-same disabled reason, "Copy to Wed and Thu" / "Review regular week…", toasts that name the dates. Delete From and Until, `OwnChangesChoice` and the date-count text. Delete the repeating rule builder and `copyDayDates` in `copy-day.ts`; keep the nudge's two exports. Add the `timezone` prop at `AvailabilityDayDrawer.tsx:366`. Tests: this-week rules (one per date, no `repeat`), every-week opens the drawer, nothing saved when all match, no count in any string. PRD 6, 7, 8.
- [ ] **C4. Strings and fallout.** `availabilitySchedules.copy.*` per ux.md in the three catalogs, dropping the replaced keys; update the tests that click "Copy to N dates" (`AvailabilityDayDrawer.draft.test.tsx`, `ScheduleSaveUndo.test.tsx`, `use-reload-hold.test.tsx`). PRD 7, 11.

Order: C1 and C2 in parallel; C3 after both; C4 after C3.

Files owned: `copy-week-draft.ts`, `copy-day.ts`, `CopyDayAction.tsx` (+tests), `ChangeRegularWeekDrawer.tsx`, `use-regular-week-edit.ts`, `AvailabilityDayDrawer.tsx` (the Copy props only), the shared day picker (`lockedDays`), `availabilitySchedules.copy.*` in the catalogs.

## Slice D: scenarios (after A, B and C)

- [ ] **D1. Shared-config mock and the e2e spec.** `e2e/helpers/shared-config-mock.ts` (one in-memory config for two pages' config GET and PUT) and `e2e/availability-holidays-copy.spec.ts`:
  - H1 (≤ 3);
  - H2 (≤ 3, and the second Manager's context shows the decision with 0 decisions and no nudge);
  - H3 (≤ before);
  - K1 (≤ before; the PUT carries week rows and no `dateRules` upsert; matching days send no PUT);
  - K2 (≤ before; one rule per date, no repeat);
  - the failure line (a 400 answer, Retry, not shown as decided);
  - a Host sees decisions read-only.

  Counts are recorded as agent stand-in annotations through `countInteractions`; "before" is measured on this run's base at Implement. PRD 1–3, 5, 6, 8, 9, 10.
- [ ] **D2. Regressions.** Update, deliberately and in the notes below, the specs whose counts or selectors change (`availability-setup-hierarchy.spec.ts`, the fold-budget spec, `availability-dead-ends.spec.ts`, `availability-draft.spec.ts`); run the availability, onboarding, Venue Setup, a11y, fold-budget and locale e2e suites, the engine and reservations suites. PRD 12.

Files owned: `e2e/**` only.

## Order

```
A1 ──┬─► B1,B2 ─► B3 ─► B4 ─► B5,B6 ──┐
     │                                 ├─► D1 ─► D2
     ├─► C1,C2 ─► C3 ─► C4 ───────────┤
     └─► A2,A3,A4 ─────────────────────┘
```

- A1 is the only gate; C does not even need it to compile (it touches no rule kind), so C may start at once.
- A2 to A4, B and C are parallel after A1.
- D follows all three.

## Notes

- 2026-11-08 (Decompose): architecture.md corrects prd.md's "no SQL migration": `DateRule.kind` is a Postgres enum, so A1 carries one additive migration.
