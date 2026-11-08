---
stage: decompose
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "Two independent slices with disjoint files, built in parallel. Shared files are the three i18n catalogs only, each slice adding keys under its own namespace (availability.today.*, availability.quickSetup.line.*)."
---

# Breakdown: Availability on a phone, and what's on tonight

## Items

- [x] 1. **Today line model and text.** Write `today-line.ts` (`todayLine`) with tests for every row of ux.md F1's item table: the closed day, said-once, dedupe, the service day after midnight, an expired night-of rule. Export `tonightChipText` and switch `TonightControl` to it. PRD 5, 6.
- [x] 2. **Today line on the page.**
  - `useStaffTonight` gets additive summary and status fields; `useTodayLine` is new.
  - `TodayLine.tsx` and its CSS cover the loading, failed, nothing-in-force and empty-venue states.
  - Mounted in `AvailabilityPage` (≤ 4 lines).
  - `TonightControl` gets `defaultOpen`, and `TimelineTonight` reads `?tonight=open` and clears it.
  - Catalog keys `availability.today.*` in all three locales.

  PRD 5–9.
- [x] 3. **Phone service lines.**
  - `quick-setup-line.ts` (`serviceLineText`) and `quick-setup-line.tsx` (the header).
  - `QuickSetupForm` gets `collapsible`, `openId`, forced-open services and the focus rules.
  - `collapsible` is set on phone in `RegularWeekPanel`, `ChangeRegularWeekDrawer` and `ScheduleEditorDrawer`.
  - A shared helper focuses the first invalid field after a blocked Save.
  - Catalog keys `availability.quickSetup.line.*`.

  PRD 1–3, 9.
- [x] 4. **Scenario e2e.** `e2e/availability-phone-tonight.spec.ts` covers P1, P2, T1 (paused, closing early, a service closed, a closed day, said-once with the banner) and T2 (the Timeline opens with Tonight open), plus a Host. Deliberate updates to the first-paint count (≤ 9) and to any phone selectors. PRD 4, 10.

## Order

Items 1 and 3 run in parallel. Item 2 follows item 1 in the same slice. Item 4 follows both.

## Notes
- 2026-11-08 (Implement): deviations from architecture.md.
  - A2: `tonightChipText(change, t, format)` matches how the chips already called `minuteText`. It lives in `tonight-state.ts`, and the Today wording is in `today-line-text.ts`.
  - A4: the link is `/timeline?tonight=open` through react-router's `Link`. Staff routes are not venue-scoped (`nav-sections.ts`, `main.tsx`), and Rialto has no Link.
  - A5: the line takes the page header's description slot (`PageHeader` `description` is now a `ReactNode`), not its own block. The first build failed three calendar first-screen guards (ux.md amended).
  - A1:
    - night-of bands are skipped as closures (their rule is `tonight`);
    - bounded windows show as "Closed 3:00 PM–4:00 PM", "Lunch closed …" and "Online paused …", where the first build dropped them;
    - bands whose rule isn't in the config are skipped (refetch race);
    - an old-API summary gives night-of items only.
  - B2: lines close after a save through the panel's existing re-key on the saved version. Focusing a field adopts its line, and a problem header pins it (review M1).
  - B3:
    - the header lives in `quick-setup-line-header.tsx` (a `.ts`/`.tsx` stem clash);
    - its name is its visible text with hidden separators (axe label-in-name);
    - a blank service starts open.
  - Refused Save: the panel's Save was natively disabled, so it could not focus a problem. For form problems it is now `aria-disabled` and focuses the first problem field; other blocks stay disabled. This shows on desktop too.
  - Added in scope: the Guest preview is one closed row on a phone (`quick-setup-preview-row.tsx`). The strip takes `labelledBy` to drop its repeated heading (prd.md and ux.md amended).

