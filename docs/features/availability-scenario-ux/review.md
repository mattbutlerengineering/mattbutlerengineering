---
stage: review
run: feature:availability-scenario-ux
date: 2026-11-08
assumptions:
  - "Review ran independently: a fresh `reviewer` subagent given the diff 033586217..HEAD (this run on top of PR #8511's head), prd.md, ux.md, architecture.md and breakdown.md. Severities are the reviewer's; every major was fixed, none deferred. The Owner delegated, so no live arbitration."
  - "This file is written before verification.md (order inverted): the review found majors, which were fixed and then verified, so verification.md reflects the fixed tree."
---

# Review: Availability, the everyday edits

## Scope

`git diff 033586217..HEAD -- apps/hospitality packages` on `feat/availability-scenario-ux`: the week form (days, presets, the overlap fix), the pinned footer and Booking line, the Close dialog (chips, Starting at, To, step line, title, button, toasts), quiet month cells and the legend, the Select… alignment, and the e2e suite. Reviewed at `a5a934e20`; fixes in `49c29a35c`.

## Findings

### Major: placePreset moved a preset after the latest close even when its own times clashed with nothing

- Scenario: onboarding, Lunch 11:30–14:30, then Add another service → Dinner → Dinner 2:30 PM–7:30 PM instead of 5:00–10:00 PM; Dinner-only venue + Lunch → Lunch at 10:00 PM; re-pressing Dinner on its own row → 3:00 PM. The e2e demo-week spec had been adapted to force Dinner back to 5:00 PM, hiding it.
- Standard: none
- Decision: fixed in `49c29a35c` — defaults kept when clear; "clear" decided by `validateDraft` on the candidate; tests for Lunch→Dinner, Dinner→Lunch, Lunch to 15:00 + Dinner, Lunch to 17:30 + Dinner (placed 17:30), Late after Dinner (23:00), re-preset; the demo-week spec adaptation reverted.

### Major: the month legend called a single week's run a weekly pattern

- Scenario: Dec 24 and Dec 25 closed → "Closed · Thu–Fri"; a Dec 21–27 range → "Closed · Mon–Sun".
- Standard: none
- Decision: fixed in `49c29a35c` — weekly only across two or more in-month weeks; tests for adjacent dates and a range.

### Major: Range, Repeats and Until-reopen toasts named only the first date

- Scenario: "every Monday in January" toasted "Closed on Mon, Jan 4"; a booking pause from 6:30 PM dropped its time.
- Standard: none
- Decision: fixed in `49c29a35c` — `whenPhrase` per When kind for toasts and buttons, every kind × target × start time tested.

### Major: weekdays the regular week is closed on carried a "Closed" chip every week

- Scenario: a Monday-closed venue showed 4–5 "Closed" chips a month and legend "Closed · Mon", the repetition PRD 8 removes.
- Standard: none
- Decision: fixed in `49c29a35c` — a regular closed weekday shows a muted "Closed" text (not a chip) and stays out of the legend; real closures keep the chip; tests both ways. (A muted text rather than nothing, so a closed day never looks open.)

### Minor: client re-implementation of overlap/span rules drifted from the engine (ADR-030 tension)

- Scenario: `firstClearStart` counted spill-over the engine never flags; `withinSpan` applied 16 h to non-wrapped days.
- Standard: none
- Decision: fixed — both decide through `validateDraft`.

### Minor: files over the 800-line limit

- Scenario: `quick-setup-draft.ts` 943 lines; `close-draft.ts` 819 after the review fixes.
- Standard: none
- Decision: fixed — `quick-setup-validate.ts` (248), `quick-setup-placement.ts` (114), `quick-setup-draft.ts` (584); `close-text.ts` (196), `close-draft.ts` (~633). No import cycle; no re-exports.

### Minor: other correctness and accessibility items

- Legend count vs pattern used different cells; legend entries ran together for screen readers; legend flashed "your regular week" while loading; dead `dayDifference` beside a re-implementation; `IssueText` duplicated the service-name rule; block shortcuts did not announce moved days; the Range/Repeats disabled primary had no reason; no `setBlockDays` tests.
- Standard: none
- Decision: fixed in `49c29a35c`.

### Minor: deferred

- Chips sit after the When choices, not above (architecture C1/sketch) — deliberate after the screenshot review (the chips read as shortcuts for the date field); recorded in breakdown Notes.
- Pause dialog title reuses the button key and stays "Pause online booking" if What is switched to Whole venue — deferred: the entry decides the title by design (ux.md F4.5).
- A Tomorrow/holiday chip in Several-dates mode switches to One date instead of adding — deferred: spec-literal, a later "add" affordance.
- The pinned footer's edge mirrors the dashboard padding in a second place — deferred: one CSS custom property per breakpoint, noted.
- `prefer-rialto-components` warnings on calendar cells (+4, non-gating) — deferred: the cells were raw buttons and spans before this run.
- Stray onboarding run screenshots committed in `a67ff07e8` — fixed in `6c99497c5`.

## Passes with no findings

- Security: no new input surface; chip names from the catalog, names rendered as text, static links.
- ADR compliance: ADR-029 service-day dates, ADR-031 hours sources, ADR-032 section closures — compliant; the ADR-030 drift is fixed above.
- Domain passes: none selected (no payments, migrations or dependency manifests in the diff).

## Verdict

Ready for Ship once verification.md is green: no critical; four majors and the listed minors fixed; four minors deferred with reasons; every pass ran.
