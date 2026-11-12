---
stage: prd
run: feature:availability-holidays-copy
date: 2026-11-08
ux: required
assumptions:
  - "The Owner delegated (idea.md); criteria are drafted from idea.md, audit.md §3 items 4–5 and code facts. The Owner can veto, in particular the two default decisions: Open as usual is a venue fact, and Copy is either one-off (this week) or every week (the regular week)."
  - "Budgets are interaction counts from /availability first paint (helpers/interaction-counter.ts) on the e2e fixtures, today pinned Sun, Nov 8, 2026, US holidays. 'Before' numbers are measured at Implement on this run's base."
  - "No SQL migration: date_rules.kind is a string column. The Zod union, the engine and the server learn one new kind."
---

# PRD: Holiday decisions that stick, and Copy that says what it does

## Problem statement

**Holidays.** "Open as usual" is kept per browser, so other Managers and devices re-see decided holidays, and the calendar nudge returns. Planning several holidays is one long sheet (3,711 px, 83 controls).

**Copy.** Copy to other days saves a never-ending special-hours rule ("Copied to 105 dates"). Every copied weekday then reads "Special hours" even when its hours are the regular ones, and nothing says the change applies every week from now on.

Evidence: audit.md, idea.md (agent stand-in; one Owner anecdote).

## Solution

- **Holidays.** Each upcoming holiday is one decision (Closed, Open as usual or Special hours), saved to the venue, so everyone sees the same answer. The usual closed holidays close in one tap.
- **Copy.** Copy asks whether the change is for this week only or every week. Every week changes the regular week. It says what will change before saving, and saves nothing when the days already match.

How it looks is UX's; how it is built is Architect's.

## Actors

- **Manager:** decides holidays and copies hours. The person with the problem.
- **Second Manager or another device:** must see the same holiday decisions.
- **Host:** view-only. Sees decided holidays as decided; no new editors.
- **Guest:** unaffected. An Open-as-usual holiday books exactly like a normal day.

## User stories

1. As a Manager, I want to decide each upcoming holiday with one choice (Closed, Open as usual, Special hours), so that I don't fill a long form for the common answers.
2. As a Manager, I want to close the holidays restaurants usually close in one tap, so that the common year is set in seconds.
3. As a Manager, I want "Open as usual" saved for the venue, so that my colleagues and my other devices don't ask me again.
4. As a Manager, I want to change a holiday decision later, so that a mistake costs one tap.
5. As a Manager copying a day's hours to other days, I want to choose "just this week" or "every week" and see what will change, so that I don't create 105 special dates by accident.
6. As a Manager, I want Copy to tell me when the days already have those hours, so that I don't save a change that changes nothing.

## Success criteria

Checks by component test (C), engine or server test (S), e2e (E), or a combination.

- [ ] 1. **One decision per holiday.** Upcoming holidays, on Special dates, lists each holiday in the horizon as one line with its name, date and three choices: Closed, Open as usual, Special hours.
  - Closed saves a whole-venue closure for that date.
  - Open as usual saves the venue decision.
  - Special hours opens the existing special-dates sheet for that date.
  - Lines are grouped by month.

  C + E.

- [ ] 2. **The usual closures in one tap.** When the usually-closed holidays (Thanksgiving, Christmas Day, New Year's Day for the venue's country) are undecided in the horizon, one action closes all of them and names them first. C + E.
- [ ] 3. **Saved to the venue.** "Open as usual" is stored with the venue. A second Manager, or the same Manager on another device, sees the holiday as decided, and the calendar's holiday nudge does not ask about it. S + E (two browser contexts).
- [ ] 4. **Guests unaffected.** An Open-as-usual holiday resolves exactly like the same day without the decision: same hours, booking and preview. S (engine).
- [ ] 5. **Decided holidays stay findable.** Decided holidays show their decision (Closed / Open as usual / Special hours) in a "Decided" group. Each has one action to change it; changing it removes the old decision in the same save. C + E.
- [ ] 6. **Copy says which.** After choosing days, Copy offers "Just this week" and "Every week".
  - Just this week saves one-off special hours on the chosen days of the copied date's week, with no repeat.
  - Every week opens Change regular week prefilled, with the chosen weekdays taking the copied day's hours from the copied date's week, and its usual preview and Save.

  Copy never creates a never-ending repeat. C + E.

- [ ] 7. **Copy says what changes.** Before saving, Copy states the consequence in one sentence naming the days and the start, e.g. "Wed and Thu will use Tuesday's hours from Nov 17, every week. This changes your regular week." The toast names the dates or the weekdays, never a count of future dates. C.
- [ ] 8. **Already the same.** Target days whose resolved hours already equal the copied day's are left out and named ("Thu already has these hours"). When every target already matches, Copy saves nothing and says "These days already have Tuesday's hours." C.
- [ ] 9. **Scenario budgets** (E, from first paint; "before" measured at Implement):

  | #   | Catalogue | Job                                                   | Budget                                                                                                                                                                                  |
  | --- | --------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | H1  | D27       | Close Thanksgiving, Christmas Day, New Year's Day     | ≤ 3                                                                                                                                                                                     |
  | H2  | D33       | Christmas Eve open as usual, seen by a second Manager | ≤ 3, 0 for the second Manager                                                                                                                                                           |
  | H3  | D22       | Special hours on New Year's Eve                       | ≤ before                                                                                                                                                                                |
  | K1  | C15       | Tuesday's hours on Wed and Thu every week             | ≤ 7, with no special-hours rule created (amended at Implement: before = 6, but that path wrote a never-ending rule without saying so; the +1 is Change regular week's preview and Save) |
  | K2  | C15       | Just this week                                        | ≤ before                                                                                                                                                                                |

  [Recorded at Implement, #8692] Special dates now lists the venue's own dates first and folds the holidays into one line that opens with Plan holidays (one press), and Close these N asks first, naming the dates. Measured from first paint with the same counter: H1 = 4 (Special dates, Plan holidays, Close these 3, the confirmation), so H1's budget is ≤ 4; H3 = before + 1 (Plan holidays), so H3's budget is ≤ before + 1; H2 stays ≤ 3 (Special dates, Plan holidays, Open as usual), and the second Manager still makes 0 presses to see the line count one fewer holiday not planned. Decided → Change → Closed now confirms first (5 presses from the Special dates tab), because its toast cannot offer Undo.

- [ ] 10. **Honest failure.** If the server rejects the venue decision (an older server during a deploy window, or any error), the line says the save failed with Retry and does not show the holiday as decided. C.
- [ ] 11. **Locales.** New strings in en-US, es-MX and fr-CA; key parity. C.
- [ ] 12. **No regressions.** The availability, onboarding, Venue Setup, a11y, fold-budget and locale e2e suites, plus the engine and reservations service suites, pass. Changed expectations are listed. E + S.

## Out of scope

- Migrating "Open as usual" marks already in browsers (they reappear once, undecided).
- Folding repeating special-hours rules from the old Copy into the regular week (seeded).
- Venue-type holiday templates learned across venues (Moonshot).
- Countries beyond the existing holiday lists.

## Open questions

- Line layout at 375 px for three choices: UX.
- Whether the horizon shows 12 months at once or the next few months with "Show more": UX.
- The new kind's name and payload, and whether the closure overlap and step-two logic must know it: Architect.
