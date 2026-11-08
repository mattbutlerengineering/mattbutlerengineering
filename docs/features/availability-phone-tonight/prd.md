---
stage: prd
run: feature:availability-phone-tonight
date: 2026-11-08
ux: required
assumptions:
  - "The Owner delegated (idea.md); actors, stories and criteria are drafted from idea.md, audit.md §3 items 2 and 6 and code facts, not interviewed. The Owner can veto at approval."
  - "Phone = the app's existing phone viewport (hooks/useViewport.ts, max-width 767 px). Budgets are interaction counts from /availability first paint (helpers/interaction-counter.ts), on the e2e fixtures, with today pinned; 'before' numbers are measured on this run's base (feat/availability-scenario-ux @ 6f15dbcb5)."
  - "Out of scope by decision (seeded in docs/backlog.md): holiday decisions saved per venue, Copy-to-days semantics, the page's calendar-date 'today', the Close early / Starting at naming split."
---

# PRD: Availability on a phone, and what's on tonight

## Problem statement

On a phone the week form shows every service fully expanded (about 17 controls each; the panel is 2,421 px tall). A Manager changing one service scrolls past the others. Separately, nothing on `/availability` says what is in force tonight, other than an online-pause banner. Closures made for today, close-early, blocked tables and pacing are visible only on the Timeline's Tonight panel or in the calendar. Evidence: audit.md, code facts in idea.md (agent stand-in; one Owner anecdote).

## Solution

On a phone, the week form shows each service as one line that opens to its controls, one at a time, and a service with a problem stays open. `/availability` says, in one line under its header, today's hours and everything in force tonight, and links to the Timeline's Tonight controls. Desktop and onboarding keep today's form. How it looks is UX's; how it is built is Architect's.

## Actors

- **Manager**: edits the week on a phone; checks tonight before service. The person with the problem.
- **Host**: view-only on `/availability`. Must see the same Today line and no new editors. The night-of controls stay on the Timeline (catalogue 112).
- **Guest**: unaffected.

## User stories

1. As a Manager on a phone, I want each service in the week form to be one line until I open it, so that I reach the service I'm changing without scrolling past the others.
2. As a Manager on a phone, I want a service with a problem to stay open and show the problem, so that a collapsed line never hides why Save is blocked.
3. As a Manager or Host opening Availability, I want one line saying today's hours and what's in force tonight (closed, a service closed, paused, closing early, tables blocked), so that I know tonight's state without going to the Timeline.
4. As a Manager or Host who needs to change tonight, I want that line to take me to the Tonight controls, so that I don't hunt for them.

## Success criteria

Checks by component test (C), e2e (E) or both.

- [ ] 1. **Phone service lines.** At phone width, in the Schedules week panel, Change regular week and the schedule editor, each service shows one line with its name, hours and days. The line opens that service's controls and closes any other open service. At tablet and desktop widths, and in onboarding at any width, the form is unchanged. C + E.
- [ ] 2. **Problems never hide.** A service with a problem (overlap, span, missing days, missing name) is open, shows its problem and cannot be closed until the problem is gone. A blocked Save opens the first service with a problem and moves focus to that problem's field. C.
- [ ] 3. **Focus stays put.** On a phone:
  - "Add another service" opens the new service and focuses its name.
  - Removing a service moves focus to the neighbouring service's line.
  - Opening or closing a line keeps focus on that line, and its expanded state is announced.

  C.
- [ ] 4. **Phone budgets** (E, 375×812, F-one: Lunch and Dinner):

  | # | Catalogue | Job | Before | Budget |
  |---|---|---|---|---|
  | P1 | A1/B7 | Change Dinner's close to 11:00 PM and save | measured at Implement | ≤ 4 interactions, Dinner's line inside the first viewport |
  | P2 | A1 | The week panel's height with no unsaved changes | 2,421 px (audit) | ≤ half the measured before |
  | T1 | E40/E41/L107 | Learn tonight's state (paused, closing early, a service closed) | 2: Timeline, then Tonight | 0 clicks on `/availability` |
  | T2 | L107–L110 | Reach the Tonight controls from `/availability` | 2 (nav, Tonight) | ≤ 2, from the Today line |

  #8511/#8528's budgets still hold. Exception: the first-paint count of controls outside the week panel moves from ≤ 8 to ≤ 9, because the Today line's link is one control. That link replaces a two-step path (T2) and the trip T1 takes.
- [ ] 5. **The Today line says what's true.** On every layer, for Manager and Host, a line under the page header names:
  - **The service day:** after midnight and before the venue's rollover it is yesterday's service day.
  - **Hours:** each service's hours that day, or Closed.
  - **What's in force:**
    - closures for today: whole venue, a service, a section, or from a time;
    - booking pauses for today: online or phone;
    - night-of changes from the Timeline: close early, stop window, tables blocked, pacing, in the Timeline's own words.

  An item that has ended (`expiresAt` passed) is not shown. With nothing in force, hours alone. C per item + E (T1).
- [ ] 6. **Said once.** A pause that the existing online-pause banner already states is not repeated on the line, and the line's other items remain. C.
- [ ] 7. **To the Tonight controls.** The line offers one link to the Timeline's Tonight controls for Manager and Host. C + E (T2).
- [ ] 8. **Honest while loading or failed.** The line shows nothing until today's state has loaded, without moving the page below it once it appears. If it fails, it says so in one line with Retry, and the rest of the page works. C.
- [ ] 9. **Locales.** Every new string in en-US, es-MX and fr-CA. Key parity. C.
- [ ] 10. **No regressions.** The availability, onboarding, Venue Setup, a11y, fold-budget and locale e2e suites pass. Changed expectations are listed and deliberate. E.

## Out of scope

- Holiday decisions saved per venue; what Copy to other days means; the page's calendar-date "today"; renaming "Close early at" (all in `docs/backlog.md`).
- Changing the Timeline's Tonight panel itself, beyond whatever the link needs to open it.
- Guest preview placement on phone (audit #2 mentions a "What guests see" sheet): not taken this run.

## Open questions

- Line copy and layout at 375 px when several items are in force (wrap vs "+N"): UX.
- Whether "Change tonight" opens the Timeline's Tonight panel directly: UX and Architect.
- Whether a collapsed line shows "Different days" services' patterns or a "varies" word: UX.
