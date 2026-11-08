---
stage: ux-design
run: feature:availability-scenario-ux
date: 2026-11-08
assumptions:
  - "The Owner delegated; the walkthrough list and sketches are the stage's own, built from prd.md, audit.md and the code facts below. The Owner can veto at approval."
  - "Third day shortcut is Fri–Sat (PRD open question): the catalogue's later weekend hours (A3), late service (B10) and weekend dinner patterns name Friday and Saturday; Thu–Sat is reachable as Fri–Sat plus one tap. Days stay checkbox inputs styled as chips (as today), so focus-after-change rules and specs that address them as checkboxes keep working (review UXR-5)."
  - "Holiday chips list every holiday from the existing holiday list (holidays.ts, US/CA/MX) in the next 60 days, already-planned ones included (choosing one shows the existing Already closed notice); from Nov 8 a US venue sees five. A venue with none in that window sees only Tonight and Tomorrow (review UXR-2)."
  - "The sticky footer is used only while the form has unsaved changes; with none, the footer stays in the flow so it never covers the form. There is no fixed bottom navigation on phone to collide with (code facts)."
  - "Quiet cells apply to the month grid (desktop and tablet). The phone agenda and the week view keep their rows; noted under Deliberately not designed."
---

# UX: Availability, the everyday edits

Builds on feature:availability-setup-hierarchy `ux.md` (S-Avail2, the week panel, header actions, glossary). Changes five things: the days control, preset start times, the week panel footer, the Close dialog's dates/times/words, and month cells; plus the Booking line.

## Scenario walkthroughs

Fixtures as in feature:availability-setup-hierarchy ux.md (F-one: Lunch 11:30/2:00/3:00 and Dinner 5:00/9:30/11:00 every day; F-bistro; F-close with the closure mock). Today pinned to Sun, Nov 8, 2026, 12:00 PM unless named. Counting as `helpers/interaction-counter.ts`: a time pick = 2; a date pick = 2 + 1 per month moved.

### R1 (B10). Late service Fri–Sat beside Dinner closing 11 PM — budget ≤ 5

Schedules layer, F-one. **Add another service** (1); **Late** (1) — opens 11:00 PM, closes 2:00 AM (next day), right after Dinner; **Different days for this service** (1); **Fri–Sat** in "Late runs on" (1); **Save** (1). **5.** No overlap message appears.

### R2 (C13). "Weeknights" schedule Mon–Thu, undated — budget ≤ 5

**Add a schedule…** (1); **Name** "Weeknights" (1); **Weekdays** (1); untick **Friday** (1) — the chips stay in place; **Save** (1). **5.** (Today: the picker folds to "Days: Mon–Fri · Change days" and Friday needs **Change days** first.)

### R3 (C20). Duplicate Weeknights as Mon–Thu with a later close — budget ≤ 7

**Duplicate** on the Weeknights row (1); name it (1); **Weekdays** (1); untick **Friday** (1) — a copy starts with no days, as today, because a copy with days and no dates would outrank the regular week; Dinner **Closes** → 11:30 PM (2); **Save** (1). **7.**

### R4 (D22). No lunch on Christmas Eve — budget ≤ 5

F-close. Header **Close…** (1); **One service** (1) — the service list shows Lunch first; the **Christmas Eve · Thu, Dec 24** chip (1) — switches When to One date with that date; primary **Close Lunch on Thu, Dec 24** (1). **4.** Toast: "Lunch closed on Thu, Dec 24".

### R5 (E39). Closed every Monday in January — budget ≤ 10

**Close…** (1); **Repeats** (1); **From** (2 + 2 months: Nov → Jan); **To** (2 — Range and Repeats now start with To empty, so its picker opens on From's month); **Monday** (1); primary (1). **10.** (Today Repeats defaults To to today + 90 days, Feb 6, and the picker opens on February: 11.)

### R6 (E41). Close early tonight at 9:30 PM — budget ≤ 4 and ≤ 12 options

Today pinned to 6:00 PM. **Close…** (1); **Starting at** (1) — options: All day, From 6:30 PM … From 10:30 PM (the last close is 11:00 PM): 1 + 9 = 10 options; **From 9:30 PM** (1); primary **Close from 9:30 PM tonight** (1). **4.**

### R7 (H72). Change the largest online party — budget ≤ 3

The **Booking** line under the week panel (1) opens Booking rules; "Largest party online" (1); **Save** (1). **3.**

### R8 (C19). See which days differ this month — budget 0 clicks

Calendar layer is one click away and is not counted (the question is asked on the calendar). Month cells for regular dates show only the date (and a holiday name); in December, Mon–Thu cells read "Weeknights", Christmas Eve reads "Lunch closed +1" (a closure outranks a schedule name), and the legend above the grid reads "This month: Weeknights · Mon–Thu Lunch closed · 1 day". **0.**

### R9. Save in reach on a phone (PRD 3)

375×812, F-one, Schedules layer. Change Lunch **Closes** (2) — the footer pins to the bottom of the screen with "Changes apply from today, Sun, Nov 8." **Discard** **Save**; scroll anywhere in the form: it stays. **Save** (1) → the footer returns to the flow.

### R10. Pause from the header (PRD 6)

**Pause online booking** opens a dialog titled **Pause online booking** (not "Close"); with no affected bookings there is no "Step 1 of 2" line. Toast: "Online booking paused".

### R11. Host (PRD 8)

Host on Calendar sees the same quiet cells and legend; no new editors anywhere.

## Code facts

From `audit.md` and the stage's code read (2026-11-08, branch @ `3ad85121d`):

- Days: `QuickSetupForm.tsx:41-97` `DaysField`; collapses to "Days: {{days}} · Change days" only when `inDrawer && !changing && no problems && days chosen` (`:66`). The week panel never passes `inDrawer`; the Change regular week drawer does (`ChangeRegularWeekDrawer.tsx:226`), and the audit saw the same fold in the schedule editor. Shortcuts in `quick-setup-fields.tsx:51-55`: Weekdays, Weekends, Every day; `DayPicker` is shared by the shared Days and a service's own days (`QuickSetupServiceRow.tsx:171-181`), so a new shortcut lands in both. Focus after "Different days" and after a new different-hours block targets the group's first `input` (`QuickSetupServiceRow.tsx:68-69, 82-85`); block days are `Checkbox` too (`QuickSetupBlock.tsx:55`). Day order is fixed Monday first (`WEEK_DISPLAY_ORDER`). Editing a dated schedule shows days as text (`fixedDays`, `QuickSetupForm.tsx:58-63`).
- Service length: `spanIssues` blames the latest-closing service with `span_too_long` when a day's earliest open → latest close exceeds 16 h (`quick-setup-draft.ts:480-500`, `MAX_PAST_MIDNIGHT_SPAN`, `legacy-migration.ts:27`). Overlap is strict `closesAt > opensAt` (`validate-config.ts:195`).
- Close dialog defaults: Range and Repeats set `to = today + 90` (`CloseStepOne.tsx:62`); From moving past To carries To (`:357-363`); Rialto `Calendar` opens on the value's month when there is one, and on `min`'s month only without a value (`Calendar.tsx:103-107`). Repeats requires a weekday (`close-draft.ts:109-110`). One service defaults to the first service (`CloseStepOne.tsx:85`). `upcomingHolidays` drops already-planned dates (`holidays.ts:143-151`).
- Presets: `SERVICE_PRESETS` lunch 11:30–14:30, brunch 10:00–14:00, dinner 17:00–22:00, late 22:00–01:00 (`quick-setup-draft.ts:~116-120`); `applyPreset` (`:137-147`) ignores other services. Overlap issue `overlap_on` "{{service}} overlaps {{other}} on {{day}}." blocks Save.
- Week panel footer: plain flex row in `RegularWeekPanel.tsx`; nothing sticky; `QuickSetupForm.module.css` keeps the guest-preview column sticky above 720 px. No fixed bottom navigation on phone (`DashboardSidebar.module.css:183-206` fixes only the off-canvas drawer).
- Close dialog: title "Close" always; description "Step {{step}} of 2" on step 1 even when `next` saves directly (`CloseDialog.tsx:298-304, ~465`); toast builder `CloseDialog.tsx:376-395` — `toast.closed` "{{date}} closed" for venue _and_ service closures, `toast.bookingPaused` "Booking paused on {{date}}" without the channel; "Starting at" options start at "All day", "From 12:00 AM" in 30-minute steps (`CloseStepOne.tsx`, audit r2-E41); floor-plan hint "Add a section to your floor plan first · Open Floor Plan" renders between choices (`CloseStepOne.tsx:~150-208`); holiday names via `useHolidayNames` and `holidays.ts` (`HOLIDAY_HORIZON_DAYS = 120`, `:139`).
- Calendar: `AvailabilityCalendar.tsx:58-112` cell = date, holiday chip, `view` text from `day-summary.ts` `presentDay` (schedule label + service lines), accessible name joins them.
- Booking line: `SchedulesTab.tsx:262-264` plain text "Booking: {{rules}}", below Other schedules; Booking rules opens from the header ⋯ (`AvailabilityPage.tsx:392`).
- Select… menu: `AvailabilityToolbar.tsx:91-95` passes only `trigger` and `items`; the audit saw it clipped at the right edge at 1280.

## Flows

### F1. Pick days (PRD 1; R1-R3)

Days are the seven existing day checkboxes, shown as chips in one row (Mon … Sun) with shortcuts **Weekdays · Weekends · Fri–Sat · Every day** above. A tick or shortcut changes them in place; nothing folds. A service's own days and a different-hours block use the same control. Every frame of the form shows this (onboarding, quick setup, week panel, both drawers), except editing a dated schedule, which keeps showing its fixed days as text.

### F2. Add a service from a preset (PRD 2; R1)

A preset on a new service keeps its length and starts at the latest close among services already running on any of its days, when the placed service keeps every day's earliest open → latest close within the form's 16-hour limit; otherwise it uses its own default. If an overlap still exists (the Manager typed times), the message gains one action: **Move {{service}} to {{time}}** (the first start that clears the overlap on every day it runs and stays within the same 16-hour limit), which applies the change; when no such start exists the message has no action.

### F3. Save in reach (PRD 3; R9)

While the form has unsaved changes, the footer pins to the bottom of the page's scroll area with a surface background and a top border; it holds the apply line, **Starting later…**, **Discard**, **Save** and the blocked reason. When there are no changes it sits in the flow under the form, as today.

### F4. Close with what the venue knows (PRD 5-7; R4-R6, R10)

1. Under "When", a chip row: **Tonight**, **Tomorrow**, then every holiday in the next 60 days ("Thanksgiving · Thu, Nov 26"), wrapping as needed. A chip sets When to One date (or Tonight) with that date; a date already closed shows the existing Already closed notice.
2. Pickers: From opens on the month of its value, or today's. Range and Repeats start with To empty, so To opens on From's month (the Rialto `min` rule from #8511) and refuses days before From.
3. "Starting at" for a date that is today lists **All day**, then times from the next half hour to the day's last close, in 30-minute steps; for another date, from that day's first opening to its last close. Times past midnight keep "(next day)".
4. Step line: "Step 1 of 2" shows only when Next will lead to step 2 (affected bookings or given-back seats); otherwise no step line.
5. Title follows the entry: **Close** from Close…, **Pause online booking** from Pause online booking.
6. The One section choice, when the venue has no sections, is disabled with its reason under it: "Add a section to your floor plan first · Open Floor Plan".
7. Toasts name the target:

| What / When                     | Toast                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Whole venue, one date           | "Closed on Thu, Dec 24"                                                                                            |
| One service                     | "Lunch closed on Thu, Dec 24"                                                                                      |
| One section                     | "Bar closed on Thu, Dec 24" (unchanged)                                                                            |
| Booking only                    | "Phone booking paused on Sun, Nov 8" ("Online and phone booking paused…" for two, "All booking paused…" for three) |
| From a time                     | "Closed from 9:30 PM tonight" / "Lunch closed from 1:00 PM on Thu, Dec 24"                                         |
| Several dates / range / repeats | today's counts wording, with the target named first ("Lunch closed on 3 dates")                                    |
| With notified bookings          | the above + " · {{count}} reservations notified"                                                                   |
| Pause online booking            | "Online booking paused" (unchanged)                                                                                |

### F5. Read the month (PRD 8; R8, R11)

A month cell shows its date and, if any, the holiday name. If the date differs from the regular week it shows one chip, chosen in this order: **Closed**, **{{service}} closed**, **{{section}} closed**, **Online paused** (or the booking channels paused), **Special hours**, then another schedule's name; a second difference adds "+1". Above the grid a legend: "This month: " then each chip label in use with its weekdays or a count ("Weeknights · Mon–Thu", "Closed · 2 days"), or "This month: your regular week" when nothing differs. The cell's accessible name keeps the full description (schedule, services, closures) so nothing is lost to a screen reader.

### F6. Booking rules from the line (PRD 9; R7)

The Booking line moves directly under the week panel and becomes a button: "Booking: Up to 30 days ahead · 1 hour notice · parties up to 12 online · **Change**", opening Booking rules.

## Screens

### S-Days. Days control (every week-form frame)

```
Days   [Weekdays] [Weekends] [Fri–Sat] [Every day]
       [✓Mon] [✓Tue] [✓Wed] [✓Thu] [ Fri] [ Sat] [ Sun]     ← the existing checkboxes, as chips
```

- Same checkbox inputs and group legend ("Days" / "{{service}} runs on") as today; 44 px targets; Monday first, as today.
- A shortcut sets exactly those days. Validation text unchanged ("Choose at least one day.").
- "Days: … · Change days" retires.

### S-Footer. Week panel footer with unsaved changes

```
──────────────────────────────────────────────────────────────── (pinned)
Changes apply from today, Sun, Nov 8.      [Starting later…] [Discard] [Save]
```

Phone: the same, wrapping to two rows (apply line, then buttons right-aligned).

### S-Close. Close dialog step one (changed parts), today Sun, Nov 8, US venue

```
Close                                                     (title follows entry)
What   ( ) Whole venue  (•) One service [Lunch ▾]  ( ) One section (disabled)
                                                      Add a section to your floor plan first · Open Floor Plan
When   [Tonight] [Tomorrow] [Thanksgiving · Thu, Nov 26] [Christmas Eve · Thu, Dec 24]
       [Christmas Day · Fri, Dec 25] [New Year's Eve · Thu, Dec 31] [New Year's Day · Fri, Jan 1]
       ( ) Tonight (•) One date [Thu, Dec 24 ▾] ( ) Several dates ( ) Date range ( ) Repeats ( ) Until I reopen
Starting at [All day ▾]
…                                              [Cancel]  [Close Lunch on Thu, Dec 24]
```

No "Step 1 of 2" unless step 2 follows.

### S-Cal. Month cell and legend (December, Weeknights Mon–Thu, Christmas Eve lunch closed)

```
This month: Weeknights · Mon–Thu   Lunch closed · 1 day
┌────────────┬────────────┬────────────┬──────────────────┬─────
│ 21         │ 22         │ 23         │ 24 Christmas Eve │ 25 Christmas Day
│ Weeknights │ Weeknights │ Weeknights │ Lunch closed +1  │
```

### S-Booking. Booking line

`Booking: Up to 30 days ahead · 1 hour notice · parties up to 12 online · Change` — one button, under the week panel's footer, above Other schedules.

## Glossary additions

| Concept                                | UI term                                                                                  | Never               |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| The third day shortcut                 | Fri–Sat                                                                                  | Weekend nights      |
| A date that differs, on the month grid | the chip label (schedule name, Closed, Special hours, {{service}} closed, Online paused) | Override, exception |
| The month summary                      | This month: …                                                                            | Key                 |

## Conventions to match

As feature:availability-setup-hierarchy ux.md: Rialto components and tokens, CSS Modules, no inline styles; sentence case; dates in full on buttons; every string in en-US, es-MX, fr-CA; 44 px targets; status in text, not colour alone.

## Dependencies surfaced for Architect

- **Shared days control** used by onboarding, quick setup, the week panel and both drawers; the `inDrawer` fold retires; a Fri–Sat shortcut joins `DayPicker`; tests that assert "Change days" change. Inputs stay checkboxes, so the focus targets in `QuickSetupServiceRow.tsx:68-69, 82-85` hold.
- **Preset placement** needs the services already in the draft and their days, and the 16-hour span check `spanIssues` uses; the fix action needs the first start that clears every overlap within that limit.
- **Sticky footer** inside the page's scroll container (the dashboard main area scrolls, the breadcrumb bar is sticky on phone).
- **Close dialog**: holidays in the next 60 days from `holidaysIn`, not `upcomingHolidays` (which drops planned dates); Range and Repeats default To to empty instead of today + 90; the day's resolved service windows for "Starting at"; toast inputs per What/When; step line from the same condition `next` uses.
- **Calendar**: "differs from the regular week" from the day summary (schedule id vs the regular schedule, closures, special-hours label, booking flags), ranked by F5's order; the legend from the visible month's cells.
- **Select… menu** alignment to the trigger's end.

## Deliberately not designed

- Phone agenda rows and the week view keep their content (quiet cells are the month grid's).
- Holiday decisions saved per venue, the plan-all sheet, Copy-to-days semantics, a Tonight status line (seeded).
- Collapsing each service to a one-line summary on phone (the audit's #2 second half); the sticky footer answers the reach problem first.
- New close targets or schedule features.

## Review

- Review: independent (fresh `reviewer` subagent given idea.md, prd.md, ux.md, audit.md and the cited code; Critical/High only). No Critical; five High. Its checks confirmed R1 (Late at 11 PM passes validation), R4 (One service defaults to Lunch), R2 (the seeded editor accepts Weekdays without Starting), R3 (Duplicate clears days), R6 (10 options).
- UXR-1: To opened on February (its value was today + 90), so R5 was 11 — fixed: Range and Repeats start with To empty; R5 = 10; code facts added.
- UXR-2: the three-chip cap contradicted PRD 7 and the sketch skipped Thanksgiving — fixed: every holiday in 60 days, planned ones included; sketch redrawn for Nov 8.
- UXR-3: two-difference cells would hide Christmas Eve's closure behind "Weeknights" — fixed: closures, pauses and special hours outrank a schedule name; sketch redrawn ("Lunch closed +1").
- UXR-4: "before 4:00 AM" was not the form's rule — fixed: placement and the fix action keep the 16-hour earliest-open → latest-close span.
- UXR-5: toggle buttons would break input-targeted focus rules and mix two day controls — fixed: the existing checkboxes, styled as chips; block days included; Monday-first order stated; the dated-schedule text summary carved out.
- Re-walk after fixes: R1-R11 re-read against F1-F6 and the code facts; each finishes within budget.
