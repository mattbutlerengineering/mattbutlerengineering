---
stage: decompose
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "Two independent slices with disjoint files, built in parallel. Shared files are the three i18n catalogs only, each slice adding keys under its own namespace (availability.today.*, availability.quickSetup.line.*)."
---

# Breakdown: Availability on a phone, and what's on tonight

## Items

- [ ] 1. **Today line model and text.** Write `today-line.ts` (`todayLine`) with tests for every row of ux.md F1's item table: the closed day, said-once, dedupe, the service day after midnight, an expired night-of rule. Export `tonightChipText` and switch `TonightControl` to it. PRD 5, 6.
- [ ] 2. **Today line on the page.**
  - `useStaffTonight` gets additive summary and status fields; `useTodayLine` is new.
  - `TodayLine.tsx` and its CSS cover the loading, failed, nothing-in-force and empty-venue states.
  - Mounted in `AvailabilityPage` (≤ 4 lines).
  - `TonightControl` gets `defaultOpen`, and `TimelineTonight` reads `?tonight=open` and clears it.
  - Catalog keys `availability.today.*` in all three locales.

  PRD 5–9.
- [ ] 3. **Phone service lines.**
  - `quick-setup-line.ts` (`serviceLineText`) and `quick-setup-line.tsx` (the header).
  - `QuickSetupForm` gets `collapsible`, `openId`, forced-open services and the focus rules.
  - `collapsible` is set on phone in `RegularWeekPanel`, `ChangeRegularWeekDrawer` and `ScheduleEditorDrawer`.
  - A shared helper focuses the first invalid field after a blocked Save.
  - Catalog keys `availability.quickSetup.line.*`.

  PRD 1–3, 9.
- [ ] 4. **Scenario e2e.** `e2e/availability-phone-tonight.spec.ts` covers P1, P2, T1 (paused, closing early, a service closed, a closed day, said-once with the banner) and T2 (the Timeline opens with Tonight open), plus a Host. Deliberate updates to the first-paint count (≤ 9) and to any phone selectors. PRD 4, 10.

## Order

Items 1 and 3 run in parallel. Item 2 follows item 1 in the same slice. Item 4 follows both.

## Notes
