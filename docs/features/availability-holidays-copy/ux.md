---
stage: ux
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "Drafted from prd.md and the current screens (Special dates layer with Upcoming holidays; the day drawer's Copy dialog), captured on this run's base. Rialto components only; CSS Modules with --rialto-* tokens."
  - "Consistency with rounds 2–3: days are the same seven chips with shortcuts as the week form (DayPicker); confirmations name the thing; problems and 'nothing to do' states are said, not hidden."
---

# UX: Holiday decisions that stick, and Copy that says what it does

## F1. Upcoming holidays (Special dates layer)

### Now

```
Upcoming holidays                                            [Plan all 6…]
Thanksgiving      Thu, Nov 26                      Open as usual   Plan…
Christmas Eve     Thu, Dec 24                      Open as usual   Plan…
…
```

### After, desktop

```
Upcoming holidays
Restaurants usually close Thanksgiving, Christmas Day and New Year's Day.   [Close these 3]

November
  Thanksgiving      Thu, Nov 26     ( Closed | Open as usual | Special hours… )
December
  Christmas Eve     Thu, Dec 24     ( Closed | Open as usual | Special hours… )
  Christmas Day     Fri, Dec 25     ( Closed | Open as usual | Special hours… )
  New Year's Eve    Thu, Dec 31     ( Closed | Open as usual | Special hours… )
January
  New Year's Day    Fri, Jan 1      ( Closed | Open as usual | Special hours… )
                                                    Show 6 more holidays this year

Decided (2)                                                                   ⌄
  Valentine's Day   Sun, Feb 14     Open as usual                  Change
  Easter Sunday     Sun, Apr 5      Closed                         Change
```

### Amended 2026-11-12 (#8692): the venue's own dates come first

The holiday panel no longer sits above the venue's own special dates. This reverses the 2026-11-08 layout in three ways.

- **Order:** the list of the venue's own dates comes first; the holidays sit below it as one line, "5 holidays not planned" with a **Plan holidays** button (a Host sees **View holidays**). The button opens the panel described below in place; **Hide holidays** folds it back. With every holiday decided the line reads "Every upcoming holiday is planned". The filters Closures, Special hours, Repeating and Past hide the holiday line; only All shows it.
- **Closed:** still one press, but the toast now carries **Undo** when the save told no guest anything (a save that told guests is not revertible; its Step 2 is the confirmation).
- **Close these N:** always asks first. The dialog, "Close these 3 dates?", names every date; **Close 3 dates** saves, **Not now** closes it with nothing written.
- **Open as usual:** unchanged, one press with Undo.

### After, 375 px

Each holiday is two rows: name and date, then the three choices as a full-width segmented row, wrapping "Special hours…" if needed. Every choice has a 44 px target.

### Behaviour

- **Horizon:** the next 12 months. The first 5 undecided holidays show; "Show N more holidays this year" reveals the rest. Grouped by month (month name headings).
- **Choices:** pressing one is a decision, and the first two save immediately.
  - **Closed:** saves a whole-venue closure for the date, through the existing closure path, including its step two if bookings are affected (the Close dialog's flow, opened prefilled for that date).
    - Toast: "Closed on Thanksgiving, Thu, Nov 26".
  - **Open as usual:** saves the venue decision.
    - Toast: "Christmas Eve: open as usual" (existing string).
  - **Special hours…:** opens the existing special-dates sheet with that one date (Add special dates, `initialRows`); saving it decides the holiday.
- **Close these 3:** (amended: it confirms first, see above) shows when two or more of the usually-closed holidays (from `USUALLY_CLOSED` for the venue's country) are undecided in the horizon. It names them in the line above it and closes all of them in one save (one closure per date), with one step two if bookings are affected.
  - Toast: "Closed on Thanksgiving, Christmas Day and New Year's Day".
  - With only one left, there is no header action; that line's Closed is the action.
- **Decided group:**
  - Collapsed by default, with a count. Lists holidays in the horizon that have a decision: a closure, an Open as usual, or special hours on the date (the same `isPlanned` notion, plus Open as usual).
  - Each line shows the decision in words and a **Change** button.
  - Change turns the line back into the three choices, with the current one marked `aria-pressed`.
  - Choosing a different one replaces the old decision in one save: Closed → Open as usual removes the closure; Open as usual → Closed removes the decision. Choosing Special hours… opens the sheet and replaces the decision on save.
  - A holiday decided by a rule this flow doesn't own reads "Has special dates" and its Change opens the date in the day drawer. Examples: a repeating rule, a section closure, a Copy rule.
- **While saving:** the line's choices are disabled, and the pressed one shows a spinner.
- **On failure:** the line reads "Couldn't save. Retry" in place, stays undecided, and focus stays on Retry. This includes an older server rejecting the decision.
- **Calendar nudge:** "{{name}} is {{date}} and isn't planned yet" counts Open as usual as decided, for everyone.
- **Host:** sees Upcoming holidays read-only: each line shows its decision or "Not decided", with no choices and no Close these 3.

### Accessibility

- Each holiday's choices are a `role="group"` named "Thanksgiving, Thu, Nov 26". The buttons are plain buttons, `aria-pressed` on the current decision when changing.
- The month headings are `h3`.
- Saving announces through the toast.

## F2. Copy to other days (day drawer)

### Now

Days as checkboxes, From and Until ("No end"), "Applies to 0 future dates", and a "Copy to N dates" button.

### After

```
Copy Tuesday, Nov 10 to other days

Days        [M] [T] [W] [T] [F] [S] [S]   Weekdays · Weekends · Fri–Sat · Every day
            (Tue is the copied day: shown selected-disabled)

How often   (•) Just this week   — Wed, Nov 11 and Thu, Nov 12
            ( ) Every week       — changes your regular week from Nov 10

Wed and Thu will use Tuesday's hours (Lunch 11:30 AM–3:00 PM, Dinner 5:00–11:00 PM)
on Wed, Nov 11 and Thu, Nov 12.
Thu already has these hours.                               [Cancel]  [Copy to Wed]
```

### Behaviour

- **Days:** the same DayPicker chips and shortcuts as the week form. The copied day's own weekday shows selected and disabled: it can't be a target, and seeing it explains which hours are copied.
- **How often:**
  - **Just this week** (default): targets are the chosen weekdays within the copied date's week, Monday to Sunday, on or after today. A chosen weekday that has already passed this week is shown as "(past)" and skipped. The save is one-off special hours per date, with no repeat.
  - **Every week:** the primary button reads **"Review regular week…"**. It opens Change regular week prefilled:
    - the chosen weekdays get the copied day's services and hours;
    - Starting is the copied date's week start or today, whichever is later.
    - Its own preview and Save apply as usual; the Copy dialog closes when the drawer opens.
- **Already the same:** a target whose resolved hours (services, times, last seating) already equal the copied day's is skipped and named: "Thu already has these hours." (several: "Thu and Fri already have these hours."). If every target already matches, the primary is disabled with the reason "These days already have Tuesday's hours."
- **Consequence line:** one sentence that updates live, naming the days, the hours and when they apply:
  - this week: "Wed and Thu will use Tuesday's hours (…) on Wed, Nov 11 and Thu, Nov 12.";
  - every week: "Wed and Thu will use Tuesday's hours (…) every week from Nov 10. This changes your regular week."
- **Primary button:** "Copy to Wed" / "Copy to Wed and Thu" (weekday names, no counts), or "Review regular week…".
- **Toast:** "Copied Tuesday's hours to Wed, Nov 11 and Thu, Nov 12".
- **Removed:** From, Until ("No end") and "Applies to N future dates". A date-bounded every-week change is a schedule ("Add a schedule…"), not a copy.
- The existing blocked reasons stay where they still apply ("Choose at least one day to copy to.").

### Amended at Implement (2026-11-08): the choice is the action

The "How often" radio group is gone.

- **Footer:** [Cancel] [Every week…] [Copy to Wed and Thu].
  - The primary applies just this week.
  - "Every week…" opens Change regular week prefilled, with Starting at the copied date's week or today, whichever is later.
- **Consequence:** the sentence describes this week. One muted line under it says "Every week… changes your regular week from {{date}}."
- **Disabling:** each button is disabled with its own reason when all of its targets already match.

Why: K1 measured 8 interactions with the radio, against 6 before. Making the choice the action removes one interaction. The Change regular week review stays, because it is the preview and the impact checks that replace the old invisible 105-date write.

## Copy (en-US; es-MX and fr-CA in the catalogs)

Upcoming holidays (`availabilitySpecial.holidays.*`):

- `usualClosedLine`: "Restaurants usually close {{names}}."
- `closeUsual_other`: "Close these {{count}}"
- `closedToast`: "Closed on {{names}}"
- `choice.closed`: "Closed"
- `choice.openAsUsual`: "Open as usual"
- `choice.specialHours`: "Special hours…"
- `group`: "{{name}}, {{date}}"
- `showMore_one`: "Show {{count}} more holiday this year"
- `showMore_other`: "Show {{count}} more holidays this year"
- `decided`: "Decided ({{count}})"
- `decision.closed`: "Closed"
- `decision.openAsUsual`: "Open as usual"
- `decision.specialHours`: "Special hours"
- `decision.other`: "Has special dates"
- `change`: "Change"
- `notDecided`: "Not decided"
- `saveFailed`: "Couldn't save."
- `retry`: "Retry"

Copy (`availabilitySchedules.copy.*`):

- `howOften`: "How often"
- `thisWeek`: "Just this week"
- `thisWeekDates`: "{{dates}}"
- `everyWeek`: "Every week"
- `everyWeekHint`: "changes your regular week from {{date}}"
- `past`: "(past)"
- `consequenceThisWeek`: "{{days}} will use {{weekday}}'s hours ({{hours}}) on {{dates}}."
- `consequenceEveryWeek`: "{{days}} will use {{weekday}}'s hours ({{hours}}) every week from {{date}}. This changes your regular week."
- `alreadySame_one`: "{{days}} already has these hours."
- `alreadySame_other`: "{{days}} already have these hours."
- `allSame`: "These days already have {{weekday}}'s hours."
- `saveTo`: "Copy to {{days}}"
- `review`: "Review regular week…"
- `copied`: "Copied {{weekday}}'s hours to {{dates}}"

Lists of names, days and dates use `Intl.ListFormat`, not string joins.

## Scenario walk-through (targets)

- **H1:** Special dates (1), Close these 3 (1) = 2, plus any step two.
- **H2:** Open as usual on Christmas Eve = 1 after reaching Special dates. A second Manager's context loads Special dates and sees Christmas Eve under Decided, with 0 decisions to make.
- **H3:** Special hours… on New Year's Eve (1), then the sheet as today.
- **K1:** Calendar (1), the day (1), Copy (1), the Wed and Thu chips (2), Every week… (1), drawer Save (1) = 7.
- **K2:** day drawer, Copy (1), Wed and Thu (2), Copy to Wed and Thu (1).
