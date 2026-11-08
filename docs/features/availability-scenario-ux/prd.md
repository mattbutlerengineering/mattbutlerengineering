---
stage: prd
run: feature:availability-scenario-ux
date: 2026-11-08
ux: required
assumptions:
  - "The Owner delegated (idea.md); actors, stories and criteria are drafted from idea.md and audit.md, not interviewed. The Owner can veto at approval."
  - "Budgets are interaction counts from /availability first paint (helpers/interaction-counter.ts: Locator actions; a time pick = 2; a date pick = 2 + 1 per month moved), on the suite's fixtures, with today pinned. 'Before' numbers are the audit's (audit.md § 2) on PR #8511's branch @ 033586217."
  - "Out of scope by decision (seeded in docs/backlog.md): holiday decisions persisted per venue, Copy-to-days semantics, a Tonight status line on /availability."
---

# PRD: Availability, the everyday edits

## Problem statement

On the layered page (#8511) the week form is first, but the everyday jobs still cost extra steps and trust: the days picker collapses after one tick, presets create overlaps the Manager must fix, Save can sit 3,000 px down on a phone, the Close dialog asks for dates and times the product knows and then reports the wrong thing ("Thu, Dec 24 closed" for Lunch only), and month cells repeat the regular pattern so differences hide. Evidence: audit.md (agent stand-in; one Owner anecdote).

## Solution

Every control a Manager reaches first does the job in the fewest honest steps: days are seven chips that never fold away, a preset starts where the previous service ends, Save stays in reach while there are unsaved changes, the Close dialog offers the dates and times this venue has (Tonight, Tomorrow, its next holidays, tonight's service times) and its confirmation names exactly what changed, and the calendar stays quiet on the regular pattern and marks only what differs. How it looks is UX's; how it is built is Architect's.

## Actors

- **Manager** — sets and changes availability. The person with the problem.
- **Host** — view-only; sees the calendar and special dates; must see the same quiet calendar and no new editors.
- **Guest** — unaffected; nothing here changes what guests can book.

## User stories

1. As a Manager, I want to see and change the days a service or schedule runs with one tap per day and shortcuts (Weekdays, Weekends, Fri–Sat, Every day), so that a Mon–Thu or Fri–Sat pattern is not a fight with a folding picker.
2. As a Manager adding a service from a preset, I want it to start after the service before it, so that I never get an overlap error the product created.
3. As a Manager editing my week on a phone or a long form, I want Save in reach whenever I have unsaved changes, so that I don't scroll to find it.
4. As a Manager closing a holiday, tonight or tomorrow, I want those dates offered as one tap, and tonight's real times offered for closing early, so that I don't page a calendar or scroll from midnight.
5. As a Manager, I want every Close/Pause confirmation to say what closed or paused and when, so that I can trust what happened.
6. As a Manager or Host, I want the month calendar to show only the days that differ from the regular week, with a legend, so that I can see what is special at a glance.
7. As a Manager, I want to change booking rules from the line that shows them, so that I find them where I read them.

## Success criteria

Checks by component test (C), e2e (E) or both.

- [ ] 1. **Day chips never fold away.** In every frame of the week form (onboarding hours step, quick setup, week panel, Change regular week, schedule editor), shared days and a service's own days are seven chips that stay visible after any tick, with shortcuts Weekdays, Weekends, Fri–Sat, Every day; validation and announcements unchanged. C + E.
- [ ] 2. **Presets never create an overlap.** A preset added after other services opens at or after the latest close of the services already running on those days (keeping its own length), when such a window exists before the day ends; otherwise it keeps its default and the overlap message offers one action naming the fix ("Move Late to 11:00 PM"). C.
- [ ] 3. **Save in reach.** With unsaved changes, the week panel's footer (apply line, Discard, Save) is in the viewport without scrolling, at 375×812 and 1280×720, wherever in the form the Manager is; with no changes it does not cover the form. E at both sizes.
- [ ] 4. **Scenario budgets** (E, interaction counter, from first paint):

  | # | Catalogue | Job | Before | Budget |
  |---|---|---|---|---|
  | R1 | B10 | Late service Fri–Sat beside Dinner closing 11 PM | 9 | ≤ 5 |
  | R2 | C13 | A "Weeknights" schedule Mon–Thu, undated | 8 | ≤ 5 |
  | R3 | C20 | Duplicate it as Mon–Thu with a later close | ~10 | ≤ 7 |
  | R4 | D22 | No lunch on Christmas Eve | 9 | ≤ 5 |
  | R5 | E39 | Closed every Monday in January | 11 | ≤ 10 |
  | R6 | E41 | Close early tonight at 9:30 PM | 4 | ≤ 4, with ≤ 12 options listed |
  | R7 | H72 | Change the largest online party | 4 | ≤ 3 |
  | R8 | C19 | See which days differ this month | 1 click + scan | 0 clicks |

  #8511's S1–S10 budgets and the interaction baselines still hold. #8511's PRD 15 first-paint budget moves from ≤ 7 to ≤ 8 controls outside the week panel: the Booking line becomes a button (criterion 9), replacing a two-step path through ⋯ (R7: 4 → 3); still below the 12–15 of the page before #8511. [Recorded at Implement, 2026-11-08.]
- [ ] 5. **Confirmations name the thing.** Close and Pause toasts name the target and date: whole venue ("Closed on Thu, Dec 24"), one service ("Lunch closed on Thu, Dec 24"), one section ("Bar closed on …"), booking only ("Phone booking paused on Sun, Nov 8"), ranges and repeats in the same pattern. C per kind.
- [ ] 6. **The dialog says only true things.** "Step 1 of 2" shows only when a second step will follow; the floor-plan hint appears with the disabled One section choice, not between choices; the dialog's title matches how it was opened (Close… → "Close", Pause online booking → "Pause online booking"). C.
- [ ] 7. **Dates and times the venue already has.** One-date closes offer chips for Tonight, Tomorrow and each holiday from the venue's holiday list in the next 60 days; "Starting at" for tonight lists times from the next half hour to tonight's last close, not from midnight. C + E (R4, R6).
- [ ] 8. **Quiet calendar.** A month cell for a date that runs the regular week with no rule shows only its date (and holiday name if any); a date that differs shows one chip naming how (the schedule's name, Closed, Special hours, "<Service> closed", Paused); a legend above the grid lists what this month shows. Same for Hosts. C + E (R8).
- [ ] 9. **Booking rules from the Booking line.** The Booking line sits directly under the week panel and opens Booking rules. E (R7).
- [ ] 10. **No clipped menus.** The Calendar's Select… menu fits inside the viewport at 1280×720 and 375×812. E.
- [ ] 11. **The demo runs as written.** _Before: a Manager closes Christmas Eve lunch in 9 steps — a date picker paged to December — and the toast says "Thu, Dec 24 closed" while the calendar repeats "Regular · Lunch · Dinner" in every cell. After: 4 steps with the Christmas Eve chip, the toast says "Lunch closed on Thu, Dec 24", and the calendar is quiet except a "Lunch closed" chip on Dec 24._ Checkable body: F-close with today pinned to Nov 8, 2026; Close… → One service → Lunch → Christmas Eve chip → Close (≤ 5); toast text exact; open Calendar, go to December: Dec 24 has a chip containing "Lunch closed", and cells for regular dates contain no schedule or service names. E.
- [ ] 12. **Locales and regressions.** New and changed strings in en-US, es-MX, fr-CA with key parity; hospitality unit, availability/onboarding/Venue Setup e2e green; changed expectations listed in the PR body.

## Out of scope

- Holiday decisions saved per venue, the plan-all sheet redesign, a horizon past 120 days (seed).
- What Copy to other days saves (seed); "Special hours" labels on dates whose hours equal the regular week (part of that seed).
- A Tonight status line on /availability and renaming Timeline's Tonight controls (seed).
- New availability capabilities (per-service party size, minimum party, annual recurring closures).
- Any API, schema or engine change.

## Open questions

- Fri–Sat or Thu–Sat as the third shortcut? — UX, from the catalogue's late-service and weekend scenarios.
- Does a sticky footer fight the phone's bottom navigation? — UX, checked at 375×812.
- How a month cell shows a date with two differences (a schedule and a closure) — UX.
