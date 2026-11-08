---
stage: decompose
run: feature:availability-scenario-ux
date: 2026-11-08
assumptions:
  - "The Owner delegated; the cut is the decomposer's. Not mirrored to the tracker (no instruction to)."
  - "Delivery: built on this run branch (feat/availability-scenario-ux, stacked on #8511's branch), one commit per item, one pull request after #8511."
---

# Breakdown: Availability, the everyday edits

Each item: RED tests first at the existing seam, then the change. "PRD" lists the criteria it covers.

## Milestone 1: Everyday edits (four independent slices, then the scenario suite)

- [x] **Days chips and Fri–Sat** — remove the drawer fold; add Fri–Sat to `DayPicker` and block days.
  - Files: `apps/hospitality/src/components/availability/{quick-setup-fields.tsx, QuickSetupForm.tsx, QuickSetupBlock.tsx}` (+ tests), three catalogs.
  - RED tests: in a drawer (`inDrawer`), ticking Monday then Tuesday leaves all seven day checkboxes visible and no "Change days"; Fri–Sat sets exactly Fri and Sat in the shared days, a service's own days and a block; "Choose at least one day." unchanged; `fixedDays` still shows text.
  - Accept: PRD 1 in every frame; focus after "Different days" still lands on the first day input.
  - Blocked by: —
  - PRD: 1, 4 (R2, R3)

- [x] **Preset placement and the overlap fix** — `placePreset`, `firstClearStart`, `fix` on overlap issues, "Move X to HH:MM".
  - Files: `quick-setup-draft.ts` (+ test), `QuickSetupServiceRow.tsx`, `quick-setup-fields.tsx` (`IssueText`), catalogs.
  - RED tests: Late after Dinner 17:00–23:00 → 23:00–26:00, no issues; Late after a service closing 25:30 with Lunch opening 11:30 keeps its default (span > 16 h); overlap from typed times offers the fix with the first clear start, applying it clears the issue; no clear start → no action.
  - Accept: PRD 2; R1 reaches 5.
  - Blocked by: —
  - PRD: 2, 4 (R1)

- [x] **Pinned footer, Booking line, Select… alignment** — sticky footer while dirty; Booking line button under the week panel; `align="right"`.
  - Files: `RegularWeekPanel.tsx` + `.module.css` (+ test), `SchedulesTab.tsx` (+ test), `pages/AvailabilityPage.tsx` (pass `onBookingRules`), `AvailabilityToolbar.tsx` (+ test), catalogs.
  - RED tests: dirty footer has `data-pinned`, clean does not; the Booking line is a button placed right after the week panel and calls `onBookingRules`; the Select… menu renders with right alignment.
  - Accept: PRD 3, 9, 10 at component level (layout proven in e2e).
  - Blocked by: —
  - PRD: 3, 4 (R7), 9, 10

- [x] **Close dialog: dates, times, steps, title, toasts** — holiday chips, `startMinutes(nowMinute)`, empty To, `willHaveStepTwo`, title by entry, `closeToastText`, the floor-plan hint inside One section.
  - Files: `holidays.ts` (+ test), `close-draft.ts` (+ test), `CloseStepOne.tsx`, `CloseDialog.tsx` (+ `CloseDialog*.test.tsx`), `pages/AvailabilityPage.tsx` if the entry mode is not already in `closing.pause`, catalogs.
  - RED tests: chips for Nov 8, 2026 (US) are Tonight, Tomorrow, Thanksgiving, Christmas Eve, Christmas Day, New Year's Eve, New Year's Day; a chip sets One date; today 6:00 PM with Dinner to 23:00 lists All day + 6:30 PM…10:30 PM; Range/Repeats start with To empty and the primary disabled; no step line when there are no affected bookings, "Step 1 of 2" when there are; the Pause entry is titled "Pause online booking"; toasts per kind exactly as ux.md F4.7.
  - Accept: PRD 5, 6, 7; R4 ≤ 5, R5 ≤ 10, R6 ≤ 4 with ≤ 12 options (e2e).
  - Blocked by: —
  - PRD: 4 (R4-R6), 5, 6, 7

- [x] **Quiet month cells and legend** — `dayDifference`, `monthLegend`, cell and legend rendering.
  - Files: `day-summary.ts` (+ test), `AvailabilityCalendar.tsx` (+ test), `AvailabilityPage.tsx` if the regular schedule id must be passed, catalogs.
  - RED tests: a regular day → no chip; a Weeknights day → "Weeknights"; a day with a Lunch closure and Weeknights → "Lunch closed" + more 1; ranking order per ux.md F5; legend "This month: Weeknights · Mon–Thu Lunch closed · 1 day" and "This month: your regular week"; accessible names unchanged; Host sees the same.
  - Accept: PRD 8; R8 0 clicks.
  - Blocked by: —
  - PRD: 4 (R8), 8

- [x] **Everyday scenario suite and the demo** — R1-R11 and PRD 11 in e2e; deliberate updates to specs the slices change.
  - Files: new `e2e/availability-everyday.spec.ts`; updated specs that assert "Change days", old toasts, "Step 1 of 2", month-cell text, the Booking line position or Range/Repeats defaults.
  - RED tests: each R row within budget; footer in viewport at 375×812 and 1280×720 while dirty; Select… menu inside the viewport; the demo script exactly.
  - Accept: new spec passes with the availability, onboarding and Venue Setup e2e set; counts quoted; changed expectations listed.
  - Blocked by: Days chips and Fri–Sat; Preset placement and the overlap fix; Pinned footer, Booking line, Select… alignment; Close dialog: dates, times, steps, title, toasts; Quiet month cells and legend
  - PRD: 3, 4, 10, 11, 12

## Design gaps found

None.

## Notes

- 2026-11-08 (Implement): items 1-5 verified by their tests and the full hospitality unit suite (411 files, 5,775 tests). Deviations, each logged by the slice:
  - Week form: `placePreset` takes the translated preset name (the draft module has no `t`); a placed start at or past midnight falls back to the preset's defaults (an opening is a time of day); `firstClearStart` also counts spill-over from neighbouring days and moves only the service's own hours, so a different-hours block overlap gets no fix; `setBlockDays` added so a block shortcut replaces the block's days. `quick-setup-draft.ts` is now ~950 lines, over the 800-line guideline — flagged for Review.
  - Footer and Booking: the Booking line button reads "Booking: {{rules}} · Change" ("· Set up" when unset); the first-paint budget of #8511's PRD 15 moves 7 → 8 (prd.md criterion 4 note).
  - Close dialog: the primary was not disabled for an empty To before (`primaryDisabled` ignored validation); a narrow rule now disables it for Range/Repeats with no To. Rialto `Radio` descriptions are strings, so "Open Floor Plan" stays a link under the group while the hint sentence is the disabled choice's description. `minuteText` takes `Pick<VenueFormat, "formatLocalTime">` so the pure toast builder can use it. Two `AlreadyClosedNotice` tests now pick To explicitly (Range starts with To empty).
  - Calendar: `dayDifference` takes an optional `serviceNames` map (a closed service may be missing from `day.services`); the component uses `dayDifferences` (all differences) so the legend can see a weekly pattern under a higher-ranked chip; a partial venue closure or a section-less tables closure ranks as Special hours; several paused channels read "Booking paused". `AvailabilityPage.test.tsx` "narrows every cell…" now uses Week view, where cells still list services.
- 2026-11-08 (Review fixes, `49c29a35c`): deviations from architecture.md introduced while fixing review.md's findings.
  - A2: `placePreset` returns the preset's own times whenever they clash with nothing (architecture said "start at the latest close"; that moved Dinner to 2:30 PM after Lunch). "Clear" for `placePreset` and `firstClearStart` is `validateDraft` on the candidate (no overlap, no span issue), not a re-implemented rule. Overlap issues no longer carry `fix`: `quick-setup-validate.ts` cannot import placement without a cycle, so `IssueText` asks `firstClearStart` itself.
  - Module split for the 800-line limit: `quick-setup-validate.ts` (issue types, `validateDraft`, `issueMessage`, span checks, `serviceLabel`), `quick-setup-placement.ts` (`placePreset`, `firstClearStart`, `moveServiceStart`), `close-text.ts` (`closeButtonText`, `closeToastText`, `CloseToastDraft`). Importers updated; no re-exports.
  - D1: `dayDifference` became `toDifference(dayDifferences(...))` (one implementation used by the component and the tests). A weekday the regular week is closed on is not a difference: no chip, no legend entry, a muted "Closed" text. `monthLegend` returns `{ heading, items }` rendered as a list; a chip is weekly only across two or more in-month weeks; count and pattern use the same cells; no legend until the regular schedule is known.
  - C2: toasts and buttons name the dates for Range ("Closed Thu, Dec 24 – Sat, Jan 2"), Repeats ("Closed every Monday, Mon, Jan 4 – Mon, Jan 25") and Until-reopen ("Closed from Sun, Nov 8 until you reopen"), and keep a booking pause's time. The disabled primary with no To says "Choose an end date to close."
  - E1: the demo-week spec no longer sets Dinner's times after the preset — the earlier adaptation had hidden the `placePreset` bug.
