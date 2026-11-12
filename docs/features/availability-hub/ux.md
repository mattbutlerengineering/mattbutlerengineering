---
stage: ux-design
run: feature:availability-hub
date: 2026-11-12
assumptions:
  - "The Owner confirmed two things live on 2026-11-12: the ten scenario walkthroughs, and the hub sketch with the date check under Today. Every other sketch is drafted from the Owner-approved plan and the code facts below, and was not confirmed one by one, because the Owner asked to be asked only what the plan leaves open."
  - "PRD open question (closed holiday): a closure is listed on the Closures page; the holiday list shows the decision 'Closed' with Change. The Add special dates sheet keeps its 'Closed' kind so no capability is lost."
  - "PRD open question (seasonal hours with weekdays and no dates): the row reads '<name>: <days>, no end date'."
  - "PRD open question (does the hub cost a click): yes, one. The Close or pause menu adds a step, and typed dates remove more than one. 'Close one date' and 'close for a week' meet their targets only once date fields accept typed dates (a rialto change); walkthroughs 11 and 12 state this."
  - "Owner decision, live, 2026-11-12, after the independent review: each service line in hub row 1 is a link that opens Regular hours with that service open. PRD criterion 3 is therefore restated as at most 10 controls plus one per service, on desktop and phone. prd.md is amended in the same commit."
  - "The calendar screen is named Calendar and is reached by 'Open calendar'. 'Check a date' names only the hub's date field. Where prd.md says the 'Check a date' view, it means the Calendar screen."
  - "The Owner-approved hub sketch said the Dec 24 special date 'wins over Summer hours'. Summer hours do not cover Dec 24 in that sketch, so the sentence now names regular hours. The layout is unchanged."
  - "docs/ux-patterns.md does not exist in this repo. The stage proceeded without it, as the skill allows. The save model below is the run's own rule set."
---

# UX: Availability hub

Terms used here are the run's glossary: Regular hours, Seasonal hours, Special date, Special hours, Closure, Pause, Reopen, Resume, Undo, Booked by, Applies to, Check a date (the hub's date field), Calendar (the screen).

## Scenario walkthroughs

Steps use the #8696 count, as `e2e/helpers/interaction-counter.ts` counts them: one click or one fill is one step. Picking from a time field or a select is two (open, then choose). Typing a date is one fill.

### 1. Weekend Brunch beside every-day Lunch (not completable today)

- Actor and goal: Manager adds Brunch on Sat and Sun at 10 AM to 2 PM while Lunch runs every day at 11:30 AM to 3 PM.
- Steps: hub row 1 Edit (1). Add another service (2). Brunch chip (3). Different days for this service (4). Weekends (5). Lunch's row shows "Lunch overlaps Brunch on Saturday and Sunday" with the fix "Run Lunch on weekdays only" (6). Save (7).
- Result: completes in 7 steps. Target is at most 8.

### 2. Summer hours Jun 1 to Sep 15, three dates inside already have special hours

- Actor and goal: Manager adds seasonal hours for the summer without losing three special dates.
- Steps: hub row 2 Add (1). Type the start date, Jun 1 (2). Type the end date, Sep 15 (3). The suggestion Use "Summer hours" appears once a start date exists and fills the name (4). Dinner is the open service; Closes: 11:00 PM (5, 6). The save bar shows "3 dates already have special hours" with Keep theirs selected, which is the default today. Save for 107 dates (7).
- Result: completes in 7 steps. Target is at most 10. It depends on date fields accepting typed dates.

### 3. Patio closed every Monday from Dec 1 to Mar 1, then one Monday reopened

- Actor and goal: Manager closes one section on a repeating weekday, then makes one exception.
- Steps, close: Close or pause (1). Close the venue or part of it (2). When: Repeating (3, 4). From: Dec 1 (5). To: Mar 1 (6). Monday (7). What: Change (8). One section (9). Section: Patio (10, 11). Close the Patio every Monday (12).
- Steps, exception: hub row 4 View (1). On "Patio closed every Monday, Dec 1 to Mar 1", Edit dates (2). Date: Mon Dec 7 (3). Skip this date (4).
- Result: completes. A repeating closure needs an end date today (`close-draft.ts:107-108`), and this run keeps that rule. The Closures page shows "Skipped Dec 7" with Restore Dec 7.

### 4. Close Dec 24 from 4 PM with 14 bookings

- Actor and goal: Manager closes early on one date and decides what happens to the bookings.
- Steps: Close or pause (1). Close the venue or part of it (2). Date: Dec 24 (3). Starting at: From 4:00 PM (4, 5). The dialog shows "14 bookings, 52 guests are in this closure". Next (6). For the group "Dec 24, closed, 14 bookings": Cancel, notify and refund (7). Close and cancel 14 (8).
- Result: completes. No Undo is offered, because guests were told. The step says so before the last press.

### 5. Change Dinner's seating interval and how it is booked, on regular hours (hidden today)

- Actor and goal: Manager sets Dinner to seat every 30 minutes and take phone bookings only.
- Steps: hub row 1, the Dinner line (1). More options (2). Seat every: 30 min (3, 4). Booked by: Phone only (5, 6). Save (7).
- Result: completes. Today this needs a day drawer with the scope "Every regular {weekday}", once per weekday.

### 6. Close five scattered dates from a calendar selection

- Actor and goal: Manager closes five dates that are not adjacent.
- Steps: hub Open calendar (1). Select, then Select days (2, 3). Click five dates (4 to 8). Selection bar: Close dates (9). The dialog opens on "Several dates" with the five dates. Close 5 dates (10).
- Result: completes. With Ctrl or Cmd held, steps 2 and 3 are not needed.

### 7. Which rule decides Dec 24, with seasonal hours, a special date and a closure all covering it

- Actor and goal: Manager wants to know what happens on Dec 24 and why.
- Steps: hub Check a date: Dec 24 (1).
- Setup: Winter hours (Dec 1 to Feb 28) give Dinner 5:00 PM to 9:00 PM. A special date on Dec 24 gives Dinner 4:00 PM to 8:00 PM. A closure on Dec 24 starts at 6:00 PM.
- Result: completes. The hub reads "Thu, Dec 24: Dinner from 4:00 PM, closed from 6:00 PM. Decided by a closure, which wins over your special date." Row 4 is marked "decides Dec 24". Open this date leads to the day, where "Why this day" lists all three rules.

### 8. Two Managers save at once

- Actor and goal: Manager B saves regular hours after Manager A changed them.
- Steps: B presses Save. The conflict dialog opens: "Sam changed availability first: Dinner closes at 10:00 PM (saved at 8:36 AM)". B picks Review their change, Back to my draft, Discard mine, or Overwrite. Review their change shows what Sam saved beside B's draft, with Reapply my changes (B's edits on top of Sam's) and Start over (Sam's version, B's edits dropped).
- Result: completes. The same dialog, with the same labels, appears from the day editor.

### 9. A Host on a phone checks tonight and one date

- Actor and goal: Host reads tonight's status and what happens on Saturday.
- Steps: open Availability. Read the Today line. Check a date: Sat (1). Read the sentence.
- Result: completes with no edit control on screen. Rows 3 and 4 offer View; rows 1, 2 and 5 offer nothing.

### 10. Change Dinner's closing time, every day

- Actor and goal: Manager moves Dinner's close from 10 PM to 11 PM.
- Steps: hub row 1, the Dinner line (1). Regular hours opens with Dinner open. Closes: 11:00 PM (2, 3). Save (4).
- Result: completes in 4 steps for any service. Baseline is 3. The Owner accepted the extra step in the plan, and chose the per-service link on 2026-11-12.

### 11. Close one date

- Actor and goal: Manager closes Sat, Dec 26.
- Steps: Close or pause (1). Close the venue or part of it (2). Date: type Dec 26 (3). Close Dec 26 (4).
- Result: completes in 4 steps; target is at most 5. With today's picker instead of a typed date (open, next month, pick) it is 6, so the target depends on typed dates.

### 12. Close for a week

- Actor and goal: Manager closes Jan 4 to Jan 10.
- Steps: Close or pause (1). Close the venue or part of it (2). Date: type Jan 4 (3). End date: type Jan 10 (4). Close Jan 4 to Jan 10 (5).
- Result: completes in 5 steps; target is at most 6. Without typed dates it is 8.

### 13. Pause online booking tonight, then resume

- Actor and goal: Manager stops online booking for the rest of tonight, then changes their mind.
- Steps, pause: Close or pause (1). Pause online booking (2). Tonight is selected. Pause until tonight ends (3).
- Steps, resume: hub row 4, Resume beside "Online booking paused until tonight ends" (1). Resume (2).
- Result: completes. Pause is 3 steps; target is 3.

### 14. Change how far ahead guests book

- Actor and goal: Manager sets 60 days.
- Steps: hub row 5 Edit (1). How far ahead guests can book: 60 (2). Save (3).
- Result: completes in 3 steps; target is 3.

## Code facts

Read on `feat/availability-hub` at `7661b88ce` (current `origin/main` plus this run's two docs commits). Paths are under `apps/hospitality/src/` unless prefixed.

- Regular hours summary — `components/availability/regular-week-line.ts:64`, `:122`: `regularWeekLine(config, today)` returns data for the hours in force today, and `upcomingRegularWeek` returns a later change or null. `RegularWeekLine.tsx:81-110` builds the words and a per-weekday "Details" list. The hub reuses the data; the words change to the new term.
- Today line — `components/availability/TodayLine.tsx`, `today-line.ts:32`, `hooks/useTodayLine.ts:8`: states are loading, error ("Couldn't load today's hours." with Retry) and ready. It shows hours or "Closed", chips for what is in force, and the link "Change tonight" to `/timeline?tonight=open`. It renders for Hosts too (`pages/AvailabilityPage.tsx:774`).
- Booking rules text — `components/availability/booking-rules.ts:80`: `bookingRulesText` returns, for example, "Up to 30 days ahead · 1 hour notice · parties up to 12 online", and `""` when nothing is set. `BookingRulesDrawer.tsx` saves through `useUpdateVenue` and shows the toast "Booking rules saved" with no Undo.
- Special dates rows — `components/availability/special-dates.ts:40`, `rule-subjects.ts:40,93`: rows hold a closure or a special-hours rule, sorted by start date. `closureKindOf` separates venue, section and booking closures. No exported function returns "the next N"; `components/venue-setup/setup-tree.ts:321` has a private `upcomingRules` cut to 5.
- Where seasonal hours are used — `components/availability/SchedulesTab.tsx:62-93`: `useUsageText` is private to that file. It yields "Mon–Thu", "Jun 1 – Sep 15, every day", "Not used yet" or "Used by N Use schedule rules".
- Why a date looks as it does — `packages/availability/src/resolve-day.ts:327`: `resolveDay` runs on the client from config and returns `explanation: Layer[]`, bottom-up, with kinds `schedule`, `use_schedule`, `special_hours`, `skip`, `closure`, `tonight`, and `regularWeek: true` on regular hours. `GET /availability/days` has no layer field. No function composes a one-sentence answer today.
- Roles — `hooks/useIsManager.ts:15`: `useManagerAccess()` returns `{ isManager, isPending }`. `components/RequireManager.tsx` sends a non-manager to `/setup`, not to Availability.
- Routes — `main.tsx:308-314`: `availability` is one route with no children and no `RequireManager`. `main.tsx:384`: `setup/hours` redirects to `/availability`. Nested routes with `Outlet` are already used (`layouts/OnboardingLayout.tsx:66`).
- Entry addresses — `components/availability/availability-entry.ts`: `AvailabilityEntry` has `tab`, `closeSection`, `action: "addSchedule"` and `from: "setup"`. `setup-tree.ts:180-188,472` builds six links through `availabilityPath`. Booking rules opens as a dialog from Venue Setup, not a link (`setup-tree.ts:409`).
- Week form — `components/availability/QuickSetupForm.tsx:31`: props include `fixedDays`, `collapsible`, `inDrawer`, `hidePreview`. `QuickSetupServiceRow.tsx:144-247` renders name chips, name, times, days, different-hours blocks and remove. It has no seating or booked-by control. `quick-setup-draft.ts:28,433,339` carries them as hidden `kept` values and writes them back unchanged.
- Day editor — `components/availability/AvailabilityDayEditor.tsx:427-456`: scope select "You're changing" with `date`, `weekday`, `regularWeekday`, `schedule`. "Until" shows only for `weekday` (`:489-507`). `ServicesEditor.tsx` offers Seating (every 5, 10, 15, 20, 30, 60 min, or fixed times as text) and Booking (Online + phone, Online only, Phone only, Walk-in only).
- Close dialog — `components/availability/CloseDialog.tsx`: props `initialDate`, `initialDates`, `initialSectionId`, `pauseOnline`, `series`, `editing`, `hostLocked`, `startTonight`. "When" offers Tonight, One date, Several dates, Date range, Repeating, Until I reopen. A separate Pause dialog is not on `origin/main`; it is in the unmerged #8687 slice A worktree.
- Online pause — `components/availability/close-draft.ts:577,614`: `shownOnlinePause` and `isPauseInForce` detect an active or pending pause from config alone.
- Closures outcomes — `hooks/useClosures.ts:130`: a closure summary holds counts only (sent, rebooked, unreachable, refunds). Dates and targets come from the config's date rules.
- Holidays — `components/availability/holiday-decisions.ts:9,73`: states are undecided, closed, open as usual, special hours, other. The horizon is 365 days. `UpcomingHolidays.tsx:115,188` counts "N holidays not planned".
- Glossary test — `i18n/venue-setup-glossary.test.ts`: pins "Regular week" and "Schedule" as the one term on four keys each. Renaming them fails this test until it changes.
- Strings — `i18n/catalogs/en-US.json`: "Regular hours", "Seasonal hours", "Check a date" and "Booked by" appear nowhere. Under the availability namespaces, "schedule" appears in 44 values and "Regular week" in 6. No `availabilityHub` namespace exists.
- Interaction counts — `e2e/helpers/interaction-counter.ts`, `e2e/helpers/quick-setup-scenarios.ts:10-11`: first setup is pinned at exactly 5 and the large setup at exactly 13.

## Flows

### Read the setup (primary)

1. A Manager or Host opens Availability and lands on the hub.
2. They read today's status, then the five rule rows.
3. They type a date in Check a date and read the sentence. The row that decided the date is marked.

### Edit one rule

1. The Manager presses the row's action.
2. The editor opens at its own address. Its first line is "Applies to …".
3. The Manager changes fields. The save bar appears, pinned, with Discard and Save.
4. Save. The Manager returns to the hub with focus on that row, and a toast offers Undo for 10 seconds.

### Close or pause

1. The Manager presses Close or pause and picks "Close the venue or part of it" or "Pause online booking".
2. The dialog opens over the current view. If bookings are affected, a second step asks what happens to them.
3. On save the dialog closes, focus returns to the button, and the hub's row 4 shows the new closure.

### Check and edit by date

1. From the hub, Open calendar, or Open this date after a date check.
2. The Manager opens a day, or selects several dates.
3. The day drawer shows the summary, the rules that apply in order, and the hours editor for that date.
4. A change that belongs to a rule (every regular weekday, or every date of seasonal hours) is a link to that rule's editor.

### First setup

1. A Manager opens Availability on a venue with no hours.
2. The hub sends them to Regular hours, which shows the setup card.
3. Save and open bookings. They land on the hub with row 1 filled.

## Screens

### Hub — `/availability`

```
Availability

Today, Thu Nov 12: Lunch 11:30 AM-3 PM, Dinner 5-10 PM
[Online paused]            Change tonight on the Timeline
                                     [Close or pause v]

Check a date [ Dec 24, 2026 ]              Open calendar
  Thu, Dec 24: Dinner 4-8 PM. Decided by your special
  date, which wins over your regular hours.
                                        Open this date

Your rules. Later rules win on the dates they cover.

1 Regular hours                                   Edit
  Lunch 11:30 AM-3 PM Mon-Fri                 (a link)
  Dinner 5-10 PM every day                    (a link)
  From Jan 4: Dinner 5-11 PM every day

2 Seasonal hours                                  Edit
  Summer hours: Jun 1-Sep 15, every day

3 Special dates and holidays     decides Dec 24   Edit
  Next: Nov 26 Closed, Dec 24 Special hours
  3 holidays not planned

4 Closures and pauses                             View
  Online booking paused until tonight ends     Resume
  Patio closed until reopened

5 Booking rules                                   Edit
  Up to 60 days ahead, 2 hours notice,
  parties up to 8 online

History
```

- Purpose: read what is set up, and which rule decides a date.
- Controls at first paint, Manager, nothing paused: Change tonight, Close or pause, the date field, Open calendar, five row actions, History, plus one link per service in row 1. That is 10 plus one per service. "Open this date" appears after a date is typed. "Resume" appears only while online booking is paused.
- Service links: each service line in row 1 opens Regular hours with that service open. Row 1's Edit opens Regular hours with the first service open, for adding a service or changing the shared days. A Host sees the same lines as plain text.
- Pause: the hub has no separate pause banner. The Today chip states the pause, and row 4 holds Resume.
- Row sentences: row 1 lists each service with hours and days, then any upcoming change. Row 2 lists each set of seasonal hours with where it applies, at most 3, then "and N more". Row 3 lists the next 2 special dates and the count of holidays not planned. Row 4 lists what is closed or paused now, then the next closure. Row 5 is the booking rules text.
- Row actions: row 2 reads Add when no seasonal hours exist, and goes straight to the new-hours editor. Row 4 always reads View.
- Date sentence: "<date>: <what happens>. Decided by <rule>[, which wins over <the rule below it>]." The rule is named in the Manager's words: "your regular hours", "<name>" for seasonal hours, "your special date", "a closure", "a change made for tonight". One lower rule is named at most. A date no rule covers reads "<date>: closed. No hours cover this date."
- Host: no Close or pause, and no action on rows 1, 2 and 5. Rows 3 and 4 read View.
- Phone: one column. The date sentence sits directly under the field.
- Empty state: a venue with no hours redirects a Manager to Regular hours. A Host sees "No hours are set yet. A manager sets regular hours here." Each row has its own empty sentence: "None" for rows 2 and 4, "No special dates. 3 holidays not planned" for row 3, "Not set up yet" for row 5.
- Loading state: the Today line shows its own loading text. The five rows show five skeleton lines.
- Error state: "Couldn't load availability" with Retry replaces the rows. The Today line keeps its own error and Retry.

### Regular hours — `/availability/hours`

```
< Availability
Regular hours
Applies to every date these hours cover, starting [Today v]

Lunch    11:30 AM-3:00 PM   Mon-Fri                  [v]
Dinner   5:00 PM-10:00 PM   every day                [^]
  Service name [Dinner        ]
  Opens [5:00 PM] Last seating [9:15 PM] Closes [10:00 PM]
  Runs on: the shared days        Different days
  Different hours on some days
  More options
    Seat every [15 min v]   Booked by [Online + phone v]
  Remove Dinner
Add another service

Days  [Weekdays][Weekends][Fri-Sat][Every day]
      [x]Mon [x]Tue [x]Wed [x]Thu [x]Fri [x]Sat [x]Sun

Guest preview   Party [2 v]
  Mon: Lunch 11:30 AM-2:15 PM, Dinner 5:00-9:15 PM ...

------------------------------------------------------
3 dates already have special hours  (o)Keep theirs ( )Replace them
                                 [Discard] [Save for 212 dates]
```

- Purpose: change the weekly hours.
- Starting: Today by default. Choosing a date changes the Applies to line and the Save label ("Save from Dec 1").
- One service is open at a time, plus any with a problem. The open one is the service whose link was pressed on the hub; from the row's Edit it is the first service.
- The save bar is pinned and appears once something changes. It is the next Tab stop after the open service.
- Empty state: the first-run card "Set your regular hours" with the same form and the button "Save and open bookings". Field order is unchanged, so first setup stays at 5 steps.
- Loading state: skeleton lines for the services.
- Error state: a load failure shows Retry. A save failure shows the reason above the save bar and keeps the draft. A refused save that would leave bookings without service lists those bookings.

### Seasonal hours — `/availability/seasonal`, `/new`, `/:id`, `/compare`

```
< Availability
Seasonal hours                       [Add seasonal hours]

Summer hours    Jun 1-Sep 15, every day   Edit  Duplicate  Delete
Weeknights      Mon-Thu, no end date      Edit  Duplicate  Delete
  Can't delete: used Mon-Thu. Change those days first.

Edit one service across all hours
```

```
< Seasonal hours
New seasonal hours
Name [                    ]   Use "Summer hours"
Applies to [Jun 1, 2026] to [Sep 15, 2026]   107 dates
( the same service rows, Days and Guest preview as Regular hours )
------------------------------------------------------
Summer hours overlaps Patio season: (o)Summer hours wins ( )Patio season wins
                                 [Discard] [Save for 107 dates]
```

- Purpose: add or change hours that replace regular hours for a period.
- New hours start from a copy of regular hours. Duplicate starts from a copy of that row.
- Date fields accept typed dates. The end date's picker opens on the start date's month.
- "Edit one service across all hours" appears only when two or more sets of hours run the same service. It opens the grid at `/compare`.
- When editing, "Also apply to Dinner in: Regular hours, Weeknights" appears under a changed service.
- Empty state: "No seasonal hours. Add hours for a season or a period, such as summer."
- Loading state: skeleton rows.
- Error state: as Regular hours.

### Special dates and holidays — `/availability/special-dates`, `/new`

```
< Availability
Special dates and holidays            [Add special dates]
Show [All v]

Thu, Dec 24     Special hours  Dinner 4:00-8:00 PM   Edit  Remove
Every Sun, from Jan 3   Special hours  Brunch 10 AM-2 PM   Edit  Remove
2 closures on upcoming dates.  View closures

Holidays: 3 not planned                    Plan holidays
```

- Purpose: set different hours for specific dates, and decide each holiday.
- Add special dates opens the two-step sheet at `/new`: each date is Closed, Special hours, or Same as another day.
- Plan holidays expands the list in place. Each holiday offers Closed, Open as usual, or Special hours. A one-press choice applies at once with Undo.
- A holiday decided as Closed shows "Closed" with Change here. The closure itself is listed on the Closures page.
- Empty state: "No special dates. Add different hours for a date."
- Loading state: skeleton rows.
- Error state: Retry for the list. A failed holiday choice shows Retry on that line.

### Closures and pauses — `/availability/closures`

```
< Availability
Closures and pauses                     [Close or pause v]

Now
  Online booking paused until tonight ends         Resume
  Patio closed until reopened               Edit   Reopen
Upcoming
  Thu, Nov 26  Closed (Thanksgiving)        Edit   Reopen
     Sent 12, rebooked 3, unreachable 1         Call list
  Patio closed every Monday, skipped Dec 7
                         Edit dates   Restore Dec 7   Reopen
Earlier, with refunds still open
  Sun, Nov 1   Refund failed (2)              Retry refunds
```

- Purpose: see what is closed or paused, and end or change it.
- Reopen and Resume ask once, and can tell cancelled guests.
- Hosts see the list and Call list, with no Edit, Reopen or Resume.
- Empty state: "Nothing is closed or paused."
- Loading state: skeleton rows; outcome counts fill in after the list.
- Error state: Retry for the list. Outcome counts that fail show "Couldn't load outcomes" on that row.

### Close and Pause dialogs — over any Availability view

- Close or pause is a menu with two items: "Close the venue or part of it" and "Pause online booking".
- Close: the existing two-step dialog. Step 1 asks the date first, then Starting at, What, and an optional note or message. Step 2 appears only when bookings are affected.
- Pause: a short dialog with Tonight (default), Until I resume, Until a date, and a guest message. The button reads "Pause until tonight ends".
- A calendar selection and a day open Close with the dates filled in. A Venue Setup section link opens it on that section.
- Each dialog has an address, so Back closes it and the view beneath stays as it was.
- Empty state: not applicable.
- Loading state: "Checking existing bookings" while the impact loads.
- Error state: "Couldn't check existing bookings" with Check again. A failed save keeps the dialog open with the reason.

### Booking rules — `/availability/booking-rules`

- The existing three-field drawer over the hub: how far ahead guests can book, minimum notice, largest party online.
- One added line: "Changes here are not listed in History."
- Save shows the toast "Booking rules saved" with Undo.
- Empty state: placeholders "No limit", "None" and "8".
- Loading state: the drawer opens once venue settings are loaded.
- Error state: "Couldn't save booking rules" with the reason, above the buttons.

### Calendar — `/availability/calendar`

```
< Availability
Calendar
[<] [>] [Today]   November 2026   [Month|Week]   [Select v]
This week: open 7 days, 1 closure, online booking on

 Su   Mo   Tu   We   Th   Fr   Sa
  1    2    3    4    5    6    7
 ...
 22   23   24   25   26   27   28
                     Closed
                     Thanksgiving

[ 2 dates selected  Edit hours  Close dates  Use other hours  Clear special hours  x ]
```

- Purpose: see results by date, and change specific dates.
- The tabs are gone. The regular-hours line is gone from here; the hub holds it.
- Opening a day shows the drawer: summary, "Why this day" with each rule that applies, the hours editor for that date, and the actions Close this date, Use other hours and Copy hours.
- The drawer's Applies to choice offers this date, the selection, or every {weekday} from a date until a date. Two links replace the wider choices: "Change regular hours for every {weekday}" and "Change <name> everywhere".
- On phone the calendar is a list of days, and the selection bar is pinned to the bottom in one row.
- Empty state: a venue with no hours never reaches this view; the hub redirects first.
- Loading state: a skeleton grid.
- Error state: "Couldn't load availability" with Retry.

### History — `/availability/history`

- The existing drawer over the hub, with its filters, View day, and Undo on entries that allow it. The button that today reads "Revert" reads "Undo".
- Empty state: "No changes yet." or "No changes match these filters."
- Loading state: skeleton entries.
- Error state: Retry.

### Save bar, conflict and leave prompts — every editor

- Save bar: Discard and Save, pinned. Save is disabled until something changes. Pressing Save with a problem moves focus to the first problem and states it.
- Conflict: one dialog. "<Name> changed availability first: <what> (saved at <time>)". Buttons: Review their change, Back to my draft, Discard mine, Overwrite. Review their change shows their saved change beside the draft, with Reapply my changes and Start over. Where a refreshed view is still loading, the editor is locked with "Reload hours".
- Leave: "Discard your changes?" with Keep editing, Discard, and Save.

## Capability map

Each of the 45 PRD capabilities has one home. "Shortcut" means it opens the same editor, prefilled.

| #            | Capability                                                                | Home                                                                 | Entry                                                                        |
| ------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1            | Switch views                                                              | Hub and addresses                                                    | Hub rows                                                                     |
| 2            | Open by address; back to Venue Setup                                      | Every view                                                           | Old addresses redirect; "Venue Setup" back link stays                        |
| 3, 4, 6      | Calendar views, go to date, service filter, day cells                     | Calendar                                                             | Hub Open calendar                                                            |
| 5            | Week summary, venue time, regular-hours line and details, upcoming change | Hub row 1; week summary and venue time on Calendar                   | Hub                                                                          |
| 7            | Open a day with its layers                                                | Day drawer                                                           | A day, or Open this date                                                     |
| 8            | Today status and Timeline link                                            | Hub Today line                                                       | Hub                                                                          |
| 9            | History                                                                   | History                                                              | Hub                                                                          |
| 10, 11       | First setup; edit regular hours                                           | Regular hours                                                        | Row 1                                                                        |
| 12           | Change from a future date; named period with an end                       | Regular hours "starting"; a period with an end is new seasonal hours | Row 1; row 2                                                                 |
| 13           | Duplicate regular hours                                                   | New seasonal hours (starts as a copy)                                | Row 2                                                                        |
| 14 to 17     | Create, edit with Also apply to, duplicate, delete                        | Seasonal hours                                                       | Row 2                                                                        |
| 18           | Compare and bulk-set one service                                          | Seasonal hours, "Edit one service across all hours"                  | Seasonal hours list                                                          |
| 19           | Keep theirs or Replace them                                               | Save bar of any hours editor                                         | Any save                                                                     |
| 20 to 24     | Select dates; edit, close, use other hours, clear                         | Calendar selection bar                                               | Calendar                                                                     |
| 25           | Edit a date for this date or every {weekday} from/until                   | Day drawer                                                           | A day                                                                        |
| 25           | ...every regular {weekday}; everywhere those hours are used               | Regular hours; Seasonal hours                                        | Link from the day drawer                                                     |
| 26           | Service fields, add or remove a service                                   | The one service row                                                  | Any hours editor                                                             |
| 27           | Copy a day's hours to other weekdays, or every week                       | Day drawer Copy hours; "every week" is a link to Regular hours       | A day                                                                        |
| 28           | Make repeated one-date changes regular                                    | Day drawer suggestion, as a link to Regular hours                    | A day                                                                        |
| 29           | Edit or remove a layer                                                    | Day drawer "Why this day"                                            | A day                                                                        |
| 30 to 32     | Close, impact, booking decisions, message preview                         | Close dialog                                                         | Hub Close or pause; shortcuts from a selection, a day, a Venue Setup section |
| 33           | Pause and resume online booking                                           | Pause dialog; Resume on hub row 4 and the Closures page              | Hub Close or pause                                                           |
| 34 to 36, 38 | Edit closure, series, reopen, call list, refunds, earlier closures        | Closures and pauses                                                  | Row 4                                                                        |
| 37, 39       | Add special dates in bulk; edit or remove special hours                   | Special dates and holidays                                           | Row 3                                                                        |
| 40           | Plan holidays                                                             | Special dates and holidays                                           | Row 3                                                                        |
| 41           | Booking rules                                                             | Booking rules                                                        | Row 5; Venue Setup opens the same drawer                                     |
| 42           | Undo, History undo, blocked-undo list                                     | Toast after any save; History                                        | Any save                                                                     |
| 43           | Conflict handling                                                         | The one conflict dialog                                              | Any refused save                                                             |
| 44           | Discard prompts                                                           | Every editor                                                         | Leaving an editor                                                            |
| 45           | Host views                                                                | Hub, Calendar, both lists, History                                   | Hub                                                                          |

Entry points removed: the three tabs; the header Close and Pause buttons; the ⋯ menu; "Starting later"; "Duplicate regular week"; the Booking line on the old Schedules tab; the holiday nudge on the calendar; the closure rows inside Special dates.

## Conventions to match

- Rialto components and tokens only; no raw button, input or select. Dark mode must work (`apps/hospitality/CLAUDE.md`).
- Every string through `t()`, with en-US, es-MX and fr-CA keys. Dates and times through `useVenueFormat`.
- Rows follow the Venue Setup row pattern (`components/venue-setup/SetupNodeRow.tsx`): a sentence and one action, with loading and error held by the group.
- Headings in outline order. Group with spacing, not grey borders or card grids (`.claude/rules/ui-quality.md`).
- No motion on the save bar or row actions.
- Overlays return focus to their trigger.
- The hub's row marker for a date check is text ("decides Dec 24"), not colour alone.

## Dependencies surfaced for Architect

- A function must compose the date sentence from `resolveDay(...).explanation`. None exists.
- `RequireManager` sends a non-manager to `/setup`. Editor addresses must send a Host to the hub instead (PRD criterion 24).
- `availability` must become a parent route with children; the close and pause dialogs need an address that works on every child.
- `useUsageText` (private to `SchedulesTab.tsx`) and `upcomingRules` (private to `setup-tree.ts`) must be shared with the hub.
- The service row needs Seat every and Booked by, fed from the draft's hidden `kept` values. Fixed seating times must stay readable and unchanged when a service uses them.
- The day drawer must use the same service row. This is the idea brief's spike.
- A separate Pause dialog is not on `origin/main`. It comes from #8687 slice A, which must land first.
- Closures and pauses needs dates and targets from config, joined to outcome counts from `useClosureSummaries`.
- Typed dates, the end picker's opening month, and ArrowDown on a time field are rialto changes.
- `venue-setup-glossary.test.ts` pins "Regular week" and "Schedule". It changes in the slice that renames them.
- Booking rules Undo must re-save the previous three values onto the settings current at that moment.
- Close one date (target 5) and close for a week (target 6) are met only when date fields accept typed dates. That rialto change must land before the Close flow moves behind the Close or pause menu, or those two budgets regress to 6 and 8.
- Regular hours needs an address form that names the service to open, for the hub's per-service links.
- A repeating closure requires an end date today (`close-draft.ts:107-108`). This run keeps that rule.
- First setup must stay at exactly 5 counted steps (`quick-setup-scenarios.ts:10`).
- Venue Setup's six links must be retargeted through `availabilityPath`.

## Deliberately not designed

- Visual styling beyond the conventions above.
- A draft carried from the day drawer into Regular hours or Seasonal hours. The link asks to discard first.
- Mixed bulk undo for holiday choices beyond the existing 10-second toast.
- Past days on the phone list (#8694 decision: no change).
- Tonight controls. The hub links to the Timeline.
- Pacing, table-hold and slot-interval settings.
- An onboarding tour or help text for the hub. The one line "Later rules win on the dates they cover" is the only explanation.

## Review

- Review: independent (a fresh reviewer, given idea.md, prd.md, ux.md and the code paths under Code facts). No Critical findings. Eight High findings. The walkthroughs were re-walked after the fixes.
- H1, a repeating closure needs an end date, so scenario 3's close could not finish — fixed: scenario 3 now sets From and To, and is re-counted at 12 steps.
- H2, the name suggestion fills only the name and appears after a start date — fixed: scenario 2 is 7 steps with typed dates, and the sketch shows an empty name beside the suggestion.
- H3, changing Dinner's close reached 4 steps only if Dinner was already open — fixed: the Owner chose per-service links on the hub (2026-11-12). The hub budget is restated as 10 plus one per service, and prd.md criterion 3 is amended.
- H4, select picks were counted as one step — fixed: the counting rule now says a select is two, and scenarios 3, 4 and 5 are re-counted.
- H5, PRD open question 4 was unanswered and the close, pause and booking-rules budgets had no walkthrough — fixed: walkthroughs 11 to 14 added. Close one date and close for a week meet their targets only with typed dates; recorded in the frontmatter and under Dependencies.
- H6, capability 43 lost Reapply — fixed: Review their change holds Reapply my changes and Start over, and Reload hours is stated.
- H7, the demo sentences contradicted their sketches — fixed: the hub sentence names regular hours, scenario 7 has a consistent setup, and row 4 shows the pause.
- H8, terms drifted — fixed: "Check a date" is the hub field and "Calendar" is the screen; the Pause dialog says "Until I resume"; Resume lives on hub row 4 and the Closures page, with no banner on the hub.
