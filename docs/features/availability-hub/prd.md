---
stage: prd
run: feature:availability-hub
date: 2026-11-12
ux: required
supersedes: "availability-setup-hierarchy prd.md criterion 7 as worded (see Out of scope) and criterion 17's first-layer placement; its glossary term Regular week"
folds-in: ["#8693", "#8694", "#8695"]
assumptions:
  - "The PRD interview was not run question by question. Actors, stories and criteria are drafted from idea.md and the Owner-approved plan (~/.claude/plans/i-m-very-confused-with-pure-lamport.md, 2026-11-12). The Owner asked to be asked only what the plan leaves open, and the plan left no requirement open."
  - "Owner decisions carried from the plan, each answered live on 2026-11-12: hub first and calendar second; land the in-flight audit items and fold #8693 to #8695 into this run; replace in place slice by slice with no feature flag; the terms Regular hours and Seasonal hours; the Showstopper rung."
  - "Targets in criteria 3, 4 and 7 are the plan's targets against the #8696 baseline. The Owner approved them as part of the plan and did not set each number one by one."
  - "#8693 'Decisions needed' (hide multi-schedule tools on a one-schedule venue): taken as allowed, the issue's own recommendation. The hub shows Seasonal hours as an empty row with Add; Compare appears once two sets of hours run the same service."
  - "#8694 'Decisions needed' (past days on the phone list): no change, the issue's own recommendation."
  - "#8695 'Decisions needed' (layer name): moot. The layers are replaced by the hub rows named in criterion 1."
  - "Hosts land on the hub instead of the Calendar. This follows from the structure decision and was stated in the approved plan."
  - "Evidence stays at one anecdote (the Owner) and zero independent operators. This PRD claims no validation."
---

# PRD: Availability hub

## Problem statement

"I'm very confused with the availability configuration setup." (Owner, 2026-11-12.)

A venue's availability is five kinds of rule, and a later kind wins over an earlier kind on the dates it covers. The Availability page does not show the rules or that order. It shows their results on a calendar and spreads the controls over 3 tabs, 5 drawers and about 20 dialogs. A Manager cannot read from the page what is set up or which rule decides a date.

The same hours are edited through six editors with different fields. One job has up to seven entry points. One concept has several names, and one name covers several concepts. Three earlier runs each reduced part of the page, and the complaint returned each time.

## Solution

Availability opens on a hub. The hub states today's status, then the venue's rules as plain sentences in the order they win:

1. Regular hours
2. Seasonal hours
3. Special dates and holidays
4. Closures and pauses
5. Booking rules

Each row opens one focused editor that has its own address, so Back and refresh keep the Manager's place. One "Close or pause" action sits beside today's status. A Manager can type a date on the hub and read, in one sentence, what happens that day and which rule decided it. The calendar remains, one step from the hub, with date selection and per-date editing. History stays one step from the hub.

Every hours editor shows the same service fields and saves the same way. Each concept has one name. Everything a Manager or Host can do today is still possible.

## Actors

- **Manager** — a venue team member who may change availability. Today this is the Owner acting on demo venues.
- **Host** — a venue team member who reads availability and cannot change hours.
- **Guest** — a person booking online. Guests never see this page; their booking times must not change because of this run.

## User stories

1. As a Manager, I want Availability to open on a short statement of my rules in the order they win, so that I know what is set up without opening anything.
2. As a Manager, I want each rule to open the one place that edits it, so that I do not search tabs and menus for the control.
3. As a Manager, I want to type a date and read what happens that day and why, so that I can check a rule without learning the layers.
4. As a Manager, I want every hours editor to show the same fields for a service, so that I do not have to find the one screen that holds seating interval or how a service is booked.
5. As a Manager, I want Save, validation, Undo and conflict handling to behave the same in every editor, so that I learn them once.
6. As a Manager, I want one name for each thing, so that a label always means the same thing.
7. As a Manager, I want every job I can do today to remain possible, so that a simpler page costs me nothing.
8. As a Manager with a bookmark, an onboarding link or a Venue Setup link into Availability, I want it to land on the right place, so that the redesign does not break my routine.
9. As a Manager on a phone or using only a keyboard, I want to finish every job without losing my place, so that I can make a change away from a desk.
10. As a Manager adding summer hours, I want to type the dates and save in a few steps, so that a season does not cost 23 clicks.
11. As a Host, I want to read the same hub without editors I cannot use, so that I am not offered actions that fail.
12. As a Guest, I want the times I am offered to be exactly what they were before, so that the venue's redesign is invisible to me.

## Success criteria

Counts use the #8696 method: enabled, visible buttons, links, inputs, selects, radios and menu items inside the main region or the topmost dialog; one interaction is one click or one fill. Viewports are desktop 1280x800 and phone 375x812 unless stated.

**Structure**

- [ ] 1. `/availability` renders a hub with a today status and five rows named Regular hours, Seasonal hours, Special dates and holidays, Closures and pauses, Booking rules, in that order. Each row states the saved setup in one or two sentences, including an empty state. A line on the hub states that later rows win on the dates they cover.
- [ ] 2. Each of the five rows, the Calendar, and History has its own address. Loading that address directly opens that view, and browser Back returns to the hub.
- [ ] 3. Hub first paint, with nothing paused: at most 10 controls plus one per service, within 1.0 screens on desktop and 1.5 screens on phone. Baseline: 38 / 1.76 and 17 / 1.62. (Amended 2026-11-12 at the UX stage: the Owner chose a link per service on the hub, so the earlier flat limits of 12 and 10 no longer apply.)
- [ ] 4. Each job has exactly one primary entry point on the hub. Baseline: up to 7. Secondary shortcuts from a calendar selection or a day may open the same editor prefilled; they must not open a different editor.
- [ ] 5. The demo runs as written: a Manager types Dec 24 on the hub of the demo venue and reads one sentence stating that day's hours and the rule that decided them, and the row for that rule is marked. Before this run the same answer needed the Calendar tab, the date and its drawer.

**One editor, one save model**

- [ ] 6. Every hours editor (regular hours, seasonal hours, a date, special dates) renders the same service fields: name, opens, last seating, closes, seating interval, and how the service is booked. One implementation of the service row exists in the code. Baseline: 6.
- [ ] 7. Interaction budgets, each measured by an e2e test:

  | Job                                                   | Baseline                   | Target           |
  | ----------------------------------------------------- | -------------------------- | ---------------- |
  | Hours form after one edit                             | 50 controls / 2.27 screens | at most 30 / 1.5 |
  | Day editor                                            | 32 controls                | at most 18       |
  | Seasonal hours Jun 1 to Sep 15                        | 23 steps                   | at most 10       |
  | Weekend Brunch at brunch hours beside every-day Lunch | not completable            | at most 8 steps  |
  | Change how far ahead guests book                      | 4 steps                    | 3                |
  | Pause online booking tonight                          | 3 steps                    | 3                |
  | Close one date / close for a week (needs typed dates) | 5 / 7 steps                | at most 5 / 6    |
  | First setup, Lunch and Dinner Mon to Fri              | 5 steps                    | 5                |
  | Change Dinner close, every day                        | 3 steps                    | at most 4        |

- [ ] 8. In every editor, Save is disabled until something changes, validates the whole form when pressed, and moves focus to the first problem. A save that writes dates states how many in its label.
- [ ] 9. Every save that does not notify guests offers Undo for 10 seconds, including Booking rules. A save that notifies guests asks for confirmation first and offers no Undo.
- [ ] 10. A save refused because someone else changed availability shows the same conflict component, with the same button labels, in the regular-hours editor and the day editor. It names who changed what and when.
- [ ] 11. Leaving any editor with unsaved changes asks first, on every route change, on closing the window, and on switching venue.

**Words**

- [ ] 12. A glossary file lists each concept, its one label and its retired synonyms. A unit test fails when a retired synonym appears in an en-US value under the availability namespaces, and checks that es-MX and fr-CA carry the same keys. At the end of the run its allowlist is empty.
- [ ] 13. No string in those namespaces uses "Close" alone as an action label, except a dialog's dismiss control. "reservation" and "booking" do not both appear in one rendered sentence.

**Nothing lost**

- [ ] 14. Each of the 45 capabilities in the appendix is reachable, and a test or a recorded walkthrough exercises it. The UX stage maps each one to its new home before any slice ships.
- [ ] 15. Old addresses still work: `/availability?tab=calendar|special|schedules`, `?action=addSchedule`, `?closeSection=<id>`, `?from=setup`, and `/setup/hours` each land on the matching new view. Every Venue Setup link into Availability lands on the matching new view.
- [ ] 16. Guest-facing availability is unchanged: no file under `services/`, `packages/availability/` or `packages/types/` changes in this run, and the existing booking-widget e2e suite passes unmodified.
- [ ] 17. After every merged slice the page is coherent: no row or link on the hub leads to a missing view, and the existing availability e2e suites pass or are updated in the same slice.

**Keyboard, phone, Hosts**

- [ ] 18. After opening each overlay (Close, Pause, Booking rules, History, Go to date, the day drawer), focus is inside it. After any save, focus is not on the page body.
- [ ] 19. From an edited time field, Save is reachable in at most 6 Tab presses while the form is dirty. Baseline: 25.
- [ ] 20. On phone, with one date selected ten rows down the list, the selection actions are inside the viewport.
- [ ] 21. A date can be typed into every start and end date field. An end date's picker opens on the start date's month. A time field opens on ArrowDown.
- [ ] 22. The reason a set of seasonal hours cannot be deleted is readable without hover.
- [ ] 23. Zero axe violations at any impact on the hub, every editor and every overlay, at 1280, 820 and 375.
- [ ] 24. As a Host, the hub shows no edit control and no Close or pause action, and loading any editor address lands on the hub. Hosts still reach the Calendar, the special dates and closures lists with call lists, and History.

**Cleanup**

- [ ] 25. When the run ends, the three tabs no longer exist, no component or i18n key that only they used remains, and visual baselines for the new views are generated on the Linux runner.

## Out of scope

- Any change to the backend, the API, the data model or the engine. Booking rules stay in venue settings.
- Settings that have no UI today: pacing, table-hold durations, slot interval, last-seating buffer, hold duration.
- The Tonight controls on the Timeline. The hub links to them and does not move them.
- New capabilities. The date sentence on the hub re-presents data the day drawer already shows.
- The guided-setup Moonshot, saved as a backlog seed.
- Server-side undo or History for Booking rules. Their Undo is done by the client.
- `availability-setup-hierarchy` criterion 7 as worded ("no control lost"): this run keeps every capability and removes duplicate controls on purpose.

## Open questions

- Does the single hours editor fit the day drawer? — Architect, by the two-day spike in idea.md. If it fails, criterion 6 is restated as "at most two implementations" and the Owner is told.
- Where does a closed holiday list: under Special dates and holidays, under Closures and pauses, or both? — UX stage. The plan proposes the closure under Closures and the decision under holidays.
- How does the Seasonal hours row describe hours that have weekdays and no dates? — UX stage.
- Does the hub count against the booking-rules and close budgets as one extra click, and is that acceptable for jobs other than "Change Dinner close"? — UX stage measures; the Owner decides if any target in criterion 7 is missed.

## Appendix: the 45 capabilities (from the code on `origin/main`, 2026-11-12)

**View and navigate**

1. Switch between the views.
2. Open a specific view, a section's Close dialog, or a new schedule from an address; return to Venue Setup.
3. Calendar month or week; previous, next, today; go to date.
4. Filter the calendar by one service.
5. Read the week summary, the venue-time note, the regular-hours line with weekday details, and an upcoming change.
6. Read day cells: closed bands, booking-off bands, section and service closures, holidays, difference chips, month legend.
7. Open a day: summary, guest message, the layers that apply with "If removed" and staff notes.
8. Read today's status and jump to the Timeline's Tonight controls.
9. Browse History with type, person and date filters; show more; view day.

**Regular hours**

10. First-run setup: services with presets, times, own days, different-hours blocks, shared days, guest preview by party size, one-click overlap fixes.
11. Edit regular hours from today with a live draft preview, Discard and Save; Save from the leave prompt.
12. Change regular hours from a future date, optionally as a named period with an end.
13. Duplicate regular hours.

**Seasonal hours**

14. Create from regular hours with start and end dates, a name suggestion and an overlap winner.
15. Edit everywhere used, optionally applying changed service times to other sets of hours.
16. Duplicate.
17. Delete when unused; blocked with a reason when used.
18. Compare one service across sets of hours; edit a row or bulk-set selected rows; save several at once.
19. Choose Keep theirs or Replace them wherever a save reaches dates with special hours.

**Days and selections**

20. Select days by click, drag, Shift, Ctrl or Cmd, long-press, select mode, column header, keyboard, "every {weekday} in {month}", "all dates using {hours}".
21. Edit the hours of a selection.
22. Close the selected dates.
23. Apply seasonal hours or another day's hours to the selected dates.
24. Clear special hours on selected dates.
25. Edit a date's hours for this date, every {weekday} from a date until a date, every regular {weekday}, or everywhere those hours are used.
26. Per service: opens, last seating, closes, seating interval, how it is booked; add an existing or new service; remove a service.
27. Copy a day's hours to other weekdays this week, or every week.
28. Turn a weekday's repeated one-date changes into its regular hours.
29. From a day's layers: edit or remove special hours, dated hours, a use-these-hours rule, a closure, or a series' dates.

**Closures, pauses, special dates**

30. Close the whole venue, one service, one section, or booking only (online, phone, waitlist); for tonight, one date, up to 20 dates, a range, repeating weekdays, or until reopened; all day or from a time; with a staff note and a guest message.
31. See the live impact count and what guests will see.
32. Decide per booking group: cancel and refund, move, keep and notify, or keep silently with acknowledgement; preview the email and text message.
33. Pause online booking; resume or remove the pause.
34. Edit a closure; tell guests when dates open again.
35. Series: skip a date, restore it, edit one date, change weekdays or end date, put a date back.
36. Reopen or resume all dates or one date, optionally telling cancelled guests.
37. Add special dates in bulk: closed, special hours, or same as another weekday; with per-date or shared messages and booking decisions.
38. Filter special dates; read notification counts; open and print the call list; retry refunds; see earlier closures with open refunds.
39. Edit or remove special hours from the list, with scope.
40. Plan holidays: closed, open as usual, or special hours; close the usual holidays in bulk; change a decision; show more; review decided ones.

**Rules, history, safety**

41. Edit booking rules: days ahead, minimum notice, largest party online.
42. Undo the last save; revert from History; see the bookings that blocked an Undo.
43. Resolve save conflicts: review, reapply, start over, overwrite, discard, reload hours.
44. Be asked before discarding unsaved edits on day, view, venue, route or window change.
45. Hosts: read-only views, History, go to date, call lists.
