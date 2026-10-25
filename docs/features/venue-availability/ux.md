---
stage: ux-design
run: feature:venue-availability
date: 2026-10-25
revision: 2 — after an own audit plus an independent heuristic audit (2026-10-25)
assumptions:
  - Depth was decided with the Owner. Phase 1 gets complete flows and wireframes, including empty, loading and error states. Phases 2–5 get flows and screen structure, so every PRD story is reachable, with full wireframes left to a short UX pass at each phase's kickoff.
  - All revision-1 Phase 1 wireframes were confirmed with the Owner on 2026-10-25. Revision 2 upgrades them in place and adds the three decisions the Owner made after the audit (edit scope chosen first; area closures in Phase 3; SMS+email for urgent closures). The new flows (F-UW, F-MS, F-SER, F-X, F-HOST, F-ONB, Special dates, Week view) come from the audit and were approved as a plan, not sketch by sketch.
  - Times use the app's 12-hour convention ("5:00 PM", and "1:00 AM (next day)" for after-midnight closes). Time entry uses whichever time input the editor already uses.
  - Facts checked against the code on 2026-10-25, each of which shaped a decision here
    - The staff booking form (`NewReservationDialog.tsx`) uses a free time input with a fixed 90-minute duration and never calls availability. The server checks staff bookings only for conflict and pacing (pacing failures return 400), never for hours or party size.
    - Confirmation, modified and cancelled messages are email-only. SMS has templates only for reminders, waitlist and win-back (`sms-port.ts:52-57`).
    - The widget's date step is a native `<input type="date">`. rialto `Calendar` supports `isDateDisabled` but has no per-day content.
    - Only platform admin is enforced. `VenueRole {owner, manager, staff}` exists but nothing reads it.
    - **Manage links are a live defect.** Messages link to `${MANAGE_BASE_URL}?token=…`, where `MANAGE_BASE_URL=https://<domain>` (`pulumi/index.ts:251`, `email-content.ts:64`). The page lives at `/hospitality/reservations/manage`, and nothing on the root site redirects there. The fix is in Phase 1.
    - Floor-plan sections (`FloorPlanSection`) exist, so Phase 1's Tonight table-blocking can offer "all tables in a section".
---

# UX: Venue availability configuration

The design rests on three ideas.

1. **One simple surface, depth on demand.** A bistro owner sees one form, then a calendar of their week. Every powerful capability (more schedules, multi-select, the week view, editing a service across schedules) appears only when the venue's setup needs it, or when the owner asks for it.
2. **Always explain the day.** Any date, opened anywhere, says in plain words what guests can book and why: which layers make it up, and what removing one would do.
3. **See the effect before it happens, and undo it after.** The scope is chosen before editing. A live guest preview and a stranded-booking list cover the whole scope. A save is undoable unless it already told guests something, and when it would, the doc says so before the click.

## Voice & terms

These are the owner-facing nouns. Use them in every label, message and accessible name.

- **Regular week**: what the venue normally does each weekday. The first-run setup creates it.
- **Schedule**: a named alternative week ("Summer hours", "Weekend", "Holiday prix-fixe"). The regular week is one of these. The word appears only after a venue has two of them. Until then, the drawer offers "Use another day's hours".
- **Service**: a bookable period within a day (Lunch, Dinner, Late). Never "shift".
- **Special hours**: hours that differ from the schedule on one date. The calendar chip, the Special dates filter and "Why this day" all use this term. Never "override" or "changed" in the UI.
- **Closure**: a time when something isn't bookable. It can cover the whole venue, a service, or online/phone/waitlist booking (areas come in Phase 3).
- **Special dates**: the list of every closure and special-hours date, past and upcoming.
- **Tonight**: temporary changes for the current service day, which end on their own.
- **Online booking / phone booking / walk-ins**: never "channel".
- **Override**: used **only** for a staff booking made past a soft limit (the timeline tag).
- Architect mapping (not UI copy): schedule = template; changed for this date = date override; closure = override with closed scope; Tonight = night-of change.

Copy rules:

- Say what will happen, with counts ("Save 9 dates", "Close and cancel 14").
- Name dates in full ("Thu, Dec 24").
- Guest-facing text never says "slot".

## Surfaces

- **Availability page (new; Manager edits, Host views).** Replaces `/setup/hours`. It has a **Calendar** tab (default, with a **Month | Week** toggle), a **Special dates** tab, and a **Schedules** tab (shown once 2+ schedules exist, or through the overflow "Create another schedule…"). History and Go to date live in the overflow. The **guest preview** panel shows whenever something is being edited.

  These entry points are repointed:
  - Setup checklist (`SetupPage.tsx:26,28`)
  - Sidebar setup step (`nav-sections.ts:87`)
  - Settings → Venue (`SettingsPage.tsx:374`)
  - Widget demo "set hours" (`BookingWidgetDemoPage.tsx:116`)
  - Readiness step `operating-hours` (`useVenueReadiness.ts`)

- **Onboarding hours step (changed).** The new-venue wizard renders the same quick-setup card (S1).
- **Tonight panel (new; Host and Manager).** In the timeline header (`PageHeader` `aside` slot), beside Today and Walk-in.
- **Staff booking form (changed).** `NewReservationDialog` gets a live availability check, an open-times strip, and the override reason.
- **Booking widget (changed; Guest).**
  - The date step moves to rialto `Calendar` with closed dates disabled and labelled.
  - The time step carries closure and pause messages.
  - Confirm handles a closure that lands mid-booking.
- **Guest manage page (changed).** Adds a "cancelled by venue" state with refund status and up to 3 rebook times. Message links must reach it (Phase 1 defect fix).
- **Closure messages (new).** A closure email and a closure SMS.
- **Timeline blocks (changed).** An "Override" tag, and a closure band across closed time.
- **Settings → Team (changed).** Manager vs Host role per staff member, plus the "Hosts can close in an emergency" grant.

## Flows: Phase 1 (complete)

### F1: First run, bistro week in under 5 minutes (PRD 1, 3, 6, 7, 32)

1. A Manager with no availability opens **Availability**. The quick-setup card **"Set your regular week"** fills the page (S1), with the guest preview beside it.
2. One service row starts empty: no name, times or days. Name chips (Lunch · Brunch · Dinner · Late) fill a name and typical times the Manager then adjusts, or the Manager types their own. Lunch is 11:30 AM–2:30 PM, Brunch 10:00 AM–2:00 PM, Dinner 5:00–10:00 PM, Late 10:00 PM–1:00 AM.
3. **Last seating** fills in automatically at close minus 45 minutes, with the hint "Last seating 9:15 PM, 45 min before close". Editing it removes the auto link.
4. Days: seven toggles, each with its full day name as its accessible name. Shortcuts: **Weekdays · Weekends · Every day**.
5. "+ Add another service" adds a row, focuses its name, and announces "Service 2 added". The preview updates live.
6. **Save and open bookings**:
   - **Valid:** "Saving…", then the toast "Bookings are open Tue–Sat · Undo". The page switches to the Calendar with the month filled in, and the Setup checklist marks availability as done. The regular week now exists. No schedule vocabulary appears.
   - **Invalid** (overlapping services, last seating after close, no days on): field-level messages, focus on the first invalid field, nothing sent.
   - **Server error:** an `Alert` (`role="alert"`) at the top of the card receives focus. Values are kept; Retry.

### F-ONB: Onboarding hours step (PRD 34, 6)

The new-venue wizard's hours step renders S1 unchanged inside the wizard frame. Saving it completes the Availability setup step, and the Manager never sets hours twice. "At least one day open" still gates Next.

### F2: Read a day, then change it (PRD 1–5, 9, 10, 13, 14, 15, 29)

1. **Availability → Calendar → Month** (S2). Each day cell shows its schedule name ("Weekend"), "Closed", or "Special hours", plus a closure band where part of the day is closed and a "3 services" count for busy venues.
   - Above the grid: a week summary for the visible week ("This week: open 5 days · 1 closure · online booking on"), prev/next/Today, Month | Week, a Services filter (venues with 2+ services) and **Change regular week…**.
   - "Venue time (Pacific)" appears when the device's time zone differs.
2. Activating a day opens the **day drawer** (S3). It reads top to bottom:
   - **Plain summary.** "Open for lunch and dinner. One change from your regular Friday."
   - **Why this day.** The active layers listed bottom-up, each with what removing it would do. A day made up of only the regular week shows just the plain summary; the stack appears once a second layer exists:
     - Regular week · Weekend · Lunch 11:30–2:30, Dinner 5:00–11:00
     - Summer hours (Jun 1 – Sep 15) · dinner until 11:30 · [Remove → back to 11:00]
     - Special hours for this date · dinner until 10:00 · [Remove → back to 11:30]
     - Closure 10:00–11:00 PM, private party · [Remove → reopens 10–11]
     - Tonight · online paused · [End now]
   - **You're changing:** a scope select, chosen _before_ editing and defaulting to **This date only**. It appears when the Manager first taps an edit control in the drawer. A drawer opened only to read never shows it.
     - This date only → 1 date
     - Fridays from Oct 30 [until: no end ▾] → 9 dates
     - Everywhere "Weekend" is used → 41 future dates. This option appears only when schedules exist; with one schedule it reads "Your regular week → 41 future dates".
   - **Services** for the chosen scope: name, opens, last seating, closes, interval or fixed seating times, and booking type (Online + phone · Phone only · Walk-in only). An overnight hint appears whenever a close is earlier than its open ("Closes 1:00 AM the next day (Saturday)").
   - **Actions:** "+ Add service", **Close…** (F5), **Use another day's hours…** (becomes "Use schedule…" once 2+ schedules exist), and an overflow with Copy to other days, History for this date.
3. **Preview and impact follow the scope** (S4). The guest preview shows the draft's times for the focused date with added/removed marks and a summary line ("3 times added · 2 removed"). The **stranded list covers every future booking on every date in scope**, not just the preview window ("2 on Fri Oct 30 · plus 6 more after Nov 24").
4. **Dates in scope that already have their own changes** get a choice: "2 Fridays already have their own changes: **Keep theirs** / **Replace them**" (default Keep).
5. **Save**: the button names the result ("Save 9 dates"). If bookings would be stranded, the affected-bookings step (S7) runs first.
   - **Success:** the drawer closes, cells update, focus returns to the day cell, and a toast reads "9 Fridays updated · Undo" (10 s). Also revertable from History.
   - **Concurrency:** if someone saved an overlapping change after the drawer opened: "Ana changed Fri Oct 30 at 3:42 PM. **Review her change** / **Overwrite** / **Discard mine**". Review shows both versions side by side.
   - **Error:** an `Alert` at the top of the drawer; it stays open with values kept.
6. **Leaving with unsaved edits** (close button, Escape, clicking another day, navigating away): "Discard changes to Fri Oct 30? **Discard** / **Keep editing**". While a drawer has an unsaved draft, its cell shows a draft dot.
7. **Discovery nudge:** after the third time the same weekday is changed for single dates, the drawer offers: "You've changed Fridays 3 times. **Make a Friday schedule?**" One tap creates the schedule from the current Friday and assigns it.

### F-UW: Change the regular week from a date (PRD 12, 9; scenario a)

1. **Calendar → Change regular week…** opens the S1 editor pre-filled with the current regular week, plus **Starting [date]** and **Ending: [date] / No end — this becomes the new regular week**, and a name field (suggested from the dates, e.g. "Summer hours").
2. The preview defaults to the start date. The stranded list covers every future booking from the start date to the end date (or onward, with no end).
3. Save → the calendar shows a labelled band across the period ("Summer hours · Jun 1 – Sep 15"). The day before and the day after show the handover in their "Why this day".
4. If the period overlaps another dated schedule: "Summer hours overlaps Patio season (Jul 1 – Aug 31). **Summer wins** / **Patio season wins** / **Adjust dates**".
5. Toast: "Summer hours from Jun 1 · Undo".

### F-MS: Select many days (PRD 8, 15, 16; scenarios d, f)

1. In Month or Week view:
   - **click-drag** a range;
   - **Shift-click** to extend;
   - **Ctrl/Cmd-click** to add single days;
   - click a **weekday header** to select that column for the visible month;
   - the toolbar's **Select…** menu adds "All Fridays in December" and "All dates using Weekend".

   On touch: long-press a day, then tap more.

2. A **selection bar** appears: "6 dates selected · **Edit hours** · **Close…** · **Use schedule / another day's hours** · **Clear changes** · ✕". The selection count is announced politely.
3. **Edit hours** opens the drawer with "You're changing: 6 selected dates" fixed, and the same services editor, preview, keep/replace and stranded handling as F2.
4. **Close…** opens F5 with those dates pre-filled.

### F3: Schedules (PRD 6, 7, 9, 11, 12)

1. The **Schedules** tab (S5) lists each schedule with where it applies ("Weeknight · Mon–Thu", "Summer hours · Jun 1 – Sep 15, every day"). The regular week is marked.
2. **New schedule** opens the S1 editor plus **Use on**: weekday toggles and an optional date range. Before saving, it shows the impact count and stranded list over every affected future date.
3. **Duplicate** → "<name> (copy)", opened in the editor.
4. **Edit** works like F2 with the scope fixed to "Everywhere this schedule is used".
5. **Delete** is offered only for schedules used nowhere. Otherwise a `DisabledTooltip` explains why ("Used on Mon–Thu; move those days to another schedule first").

### F-X: Edit a service across schedules (PRD 9; scenario f)

1. **Schedules → Compare services** shows a table-like grid. Rows are schedules; columns are one service's fields (opens, last seating, closes, interval, booking type, plus pacing and turn times from Phase 3). A service picker sits at the top ("Dinner").
2. Edit any cell in place, or select rows and use **Set selected to…**.
3. One combined impact line ("Changes 4 schedules · 118 future dates") and one combined stranded list, then **Save 4 schedules**. Undo works as in F2.
4. When editing a service inside one schedule, **Also apply to Dinner in:** ☐ Weekend ☐ Summer hours ☐ Holiday prix-fixe offers the same change elsewhere without opening Compare.

### F4: Copy a day (PRD 8)

Drawer overflow → **Copy to other days…** offers weekday toggles, From [date] and Until [date / no end]. Then the F2 save path runs, with impact, keep/replace and stranded handling.

### F5: Close (PRD 15–22; the demo; scenarios b, d)

1. Entry points:
   - **Close…** from the drawer, the selection bar, or the Calendar toolbar;
   - **+ Add special date** on the Special dates tab;
   - **Emergency: close tonight** in the Tonight panel.

   A `Dialog` opens at **Step 1 of 2** (S6).

2. **What:**
   - Whole venue
   - One service (pick)
   - Booking only: online / phone / waitlist, as checkboxes; online alone means "pause online booking"
   - Areas arrive in Phase 3 (story 78), and nothing about them appears in Phase 1.
3. **When:**
   - Tonight
   - One date
   - Several dates (from a selection or picked here)
   - Date range
   - Repeats (e.g. "Every Monday, Jan 1 – Mar 31")
   - Until I reopen

   Optional time window ("from 10:00 PM").

   **Live impact (the demo moment).** As What and When change, the foot of Step 1 updates at once: "**14 reservations · 52 guests** are booked in this closure", plus a guest-preview strip for the first affected date showing what guests will see ("Thu, Dec 24 · Closed · 'Closed for a private event'"). Step 2 is where the Manager decides what happens to those bookings.

4. **Messages:**
   - "Note for staff", internal.
   - "Message for guests", optional, at most 200 characters with a counter. Suggested phrasings are offered as chips ("Closed for a private event", "Closed due to weather", "Closed for the holiday").
5. **Conflicts** are listed before Step 2 when relevant. Example: "Wine Dinner (Phase 5) is on Thu Dec 24: **Cancel it too** / **Keep it running**". So is a date already changed: "Thu Dec 24 has special hours; the closure replaces them."
6. **Next**, with nothing affected: the final button names the result ("Close Thu, Dec 24").
7. **Step 2 of 2: affected bookings** (S7), only when bookings are affected:
   - **Header:** "14 reservations · 52 guests · 3 deposits held · Thu, Dec 24 (5:00–11:00 PM)".
   - **Several dates or kinds of change:** bookings are grouped by date and by what happens to them, for example "Dec 24 · shortened to 4–8 PM · 5 bookings" and "Dec 25 · closed · 9 bookings". Each group gets its own required choice, worded as below.
   - **List** sorted by time (guest · party · deposit), collapsed after 5. Bookings that start before the closure and run into it are marked "runs into closure".
   - **A required choice, worded for what is being closed:**
     - **Whole service or day:** **Cancel, notify & refund** ("Guests get up to 3 open times in the next 14 days to rebook") or **Keep them and notify** (for a Manager who will honour them anyway).
     - **Shortened service:** a booking can no longer run as booked, so **Cancel, notify & refund**, **Move to the nearest open time and notify** (the proposed new times are listed), or **Keep their times and notify**.
     - **Booking-only closures** (online/phone): existing bookings aren't affected, so Step 2 is skipped.
     - Every case also offers **Keep, don't tell guests**, which reveals a required checkbox: "I understand 14 guests won't be told."
   - **Notice timing:** if the closure starts within 6 hours, the header shows "Urgent: guests will get a text and an email". Delivery is by SMS and email wherever the guest has that contact, within the contact policy. Otherwise each guest's preferred channel is used.
   - **Preview message ▸** shows the exact email and SMS for the chosen option.
   - **The button names the outcome:** "Close and cancel 14", "Close and move 9", "Close and keep 14". Beside it: "Guests are told right away. This can't be undone."
8. **Result:**
   - Toast: "Thu, Dec 24 closed · 14 guests notified".
   - The calendar shows the band.
   - The closure's row on Special dates tracks **Sent · Rebooked · Unreachable**, and refund failures appear as "Refund failed: Rivera ($40) · Retry". The row also offers a printable **Call list**: name, party, time and phone for guests not yet confirmed delivered or rebooked.
   - If the save fails, nothing is cancelled or sent, and the `Alert` stays in the dialog.
9. **Pause online booking until I reopen** (PRD 19): F5 with "Online booking" and "Until I reopen". While active, a Calendar banner ("Online booking paused · **Resume**") and an app-header pill are shown.

### F-SER: Change one date of something that repeats (PRD 17; scenario e)

1. Opening a date that belongs to a repeating closure or a dated schedule shows it in "Why this day", with **Edit** and **Remove**.
2. Either one asks first: "**Only Tue, Jan 13** / **This and following** / **All dates in the series**".
3. **Only this date** → for a closure, choose **Skip this date** (bookable as usual) or **Edit this date** (for example, a different closure window). The series is untouched, and the date's "Why this day" shows "Skipped from: Mondays closed, Jan–Mar".
4. Impact, stranded handling and Undo work as in F2 and F5.
5. The same choice is available from the series row on Special dates (row → **Edit dates…**).

### F6: Special dates and reopening (PRD 15, 16, 19, 25)

1. **Special dates** (S6b) lists every closure and special-hours date, upcoming first. Filters: Closures / Special hours / Repeating / Past.
   - Each row: date or range · what · message for guests · guests affected and outcome counts · actions (Edit, Remove, Call list).
   - **+ Add special date** opens a multi-date sheet. Each row has a date, **Closed / Special hours / Same as [day]**, and an optional message for guests (one shared message can be applied to every row). Special hours open the inline service editor. Every row that affects bookings then goes through **one** Step 2, which shows a separate choice for each group (see S7). Christmas Eve hours and Christmas Day closed are one sitting.
2. **Reopen**: row → **Remove closure** → `ConfirmDialog`: "Reopen Thu, Dec 24? Guests can book again. The 14 reservations you cancelled stay cancelled." A checkbox, on by default, reads "Tell the 14 cancelled guests we've reopened (with a link to rebook)". Buttons: **Reopen** / **Keep closed**.
3. Toast "Thu, Dec 24 reopened". Removing a change that told no guests offers **Undo**.

### F7: Tonight panel (PRD 26, 27, 28; scenarios b, c)

1. **Tonight ▾** in the timeline header opens a popover (a bottom sheet on phones, with 44 px targets) (S8):
   - **Pause online booking** (toggle)
   - **Close early at** [time] · Apply
   - **Stop booking** [from 7:30 PM] **to** [8:00 PM] · Apply. Nothing new starts in that window; existing bookings are untouched.
   - **Block tables** [pick tables, or "All tables in Patio"] **from** [time] **for** [duration / rest of tonight]. This handles a rained-out patio in Phase 1: blocked tables stop being offered, and nothing is closed.
   - **Pacing tonight** [n] covers / [interval]
   - The end time, stated exactly: "Ends 4:00 AM Fri (end of Thursday's service)"
   - **Emergency: close tonight…** Managers always see it. Hosts see it only with the grant. It opens F5 with Whole venue + Tonight pre-filled, and Step 2 is still required (urgent notices apply). **For Hosts, What and When are locked** to Whole venue and Tonight (shown as text, not editable). Hosts still make the Step 2 choice and get the Call list. Anything longer than tonight needs a Manager.
2. Each active change becomes a header chip ("Online paused · until 4:00 AM ✕", "Patio tables blocked · rest of tonight ✕"). Tapping ✕ ends it, after a confirm only when guests would be affected.
3. **Close early** with bookings after the new close runs Step 2.
4. Everything here disappears at the service-day boundary and never touches schedules.
5. The footer link "Who can close in an emergency?" goes to Settings → Team for Managers. Hosts see the answer as text.

### F8: Staff booking with live check and override (PRD 30)

1. The free time input stays. As date, party and time are entered, a live check runs:
   - **Inside every limit:** nothing extra.
   - **Past a soft limit** (after last seating, over pacing, party over the service maximum): "⚠ After last seating (9:15 PM)", a required **Reason** field, and the button becomes **Book with override**.
   - **Inside a closure:** "✕ Closed 10:00–11:00 PM, 'burst pipe'. Can't book." The button is disabled.
   - **Phone booking closed:** "✕ Phone booking is closed for this date: '<staff note>'. Can't book by phone." The button is disabled. Walk-ins at the door still go through Walk-in.
   - **Waitlist closed:** the waitlist's Add button is replaced by "Waitlist closed tonight: '<staff note>'", with **Reopen waitlist** for Managers (or the Tonight chip's ✕).
   - **Blocked tables tonight:** the table picker greys them out with "Blocked tonight".
2. An open-times strip under the time input gives one-tap shortcuts.
3. Saved bookings show an **Override** tag on the timeline. Their accessible label includes the reason.
4. If the check itself fails: "Couldn't check availability; we'll check when you book." The server is the final guard.

### F9: Guest books (PRD 31, 32, 33)

1. **The date step uses rialto `Calendar`** (S10). Closed dates are disabled with accessible names that include the reason ("December 24, closed, private event"). When a closed date is focused, its guest message shows below the calendar. Dates beyond the booking window are disabled.
2. **Arriving on a closed date anyway** (deep link, gen-UI): the time step shows the closure message plus "See other dates".
3. **Online booking paused:** "Online booking is paused right now. Call (555) 123-4567." The phone number appears only while phone booking is open; otherwise the guest message shows alone (or "Not taking reservations right now" if there is none).
4. **Nothing configured:** "Not taking online bookings yet", with the phone if set. Never an empty picker.
5. **A closure lands mid-booking.** At confirm, or when the hold is refreshed: "This time just closed: the venue has closed Dec 24." Inline alternatives (the same up-to-3 rule) and "Pick another date". The hold is released.
6. After-midnight times appear under "Late Night", with an accessible name that includes the next-day date.

### F10: Guest receives a closure message (PRD 23, 24)

1. **Cancelled:**
   - **Email.** Subject: "Your reservation at Bistro Lune on Thu, Dec 24 is cancelled". The body has the guest message, the refund line, up to 3 rebook buttons, and "Other dates and times".
   - **SMS,** at most 3 segments (this answers the PRD's SMS-length open question). It lists each rebook time with its own one-tap link: "Bistro Lune is closed Thu Dec 24. Your 7:00 PM table for 2 is cancelled; $40 deposit refunded. Rebook in one tap: Wed 23 7:00 PM <link> · Sat 26 7:15 PM <link> · Sun 27 6:45 PM <link> · Other times <link>". If it would run past 3 segments, the SMS lists 2 times and "Other times".
2. **Moved:** "Bistro Lune has changed its hours on Thu, Dec 24. Your table for 2 is now at 7:00 PM (was 5:30 PM). Can't make it? Cancel free: <link>".
3. **Kept and notified:** "Bistro Lune has changed its hours on Thu, Dec 24: [message]. Your 7:00 PM table is still booked. Manage: <link>".
4. **Channel:** a closure starting within 6 hours sends both SMS and email where the guest has them. Otherwise, the preferred channel.
5. **The link opens the manage page** (S11).
   - For a booking the venue cancelled, it shows "Your reservation was cancelled", the venue's message, the refund status, and up to 3 **one-tap rebook** buttons.
   - Each rebook re-checks the time. If it's gone: "That time was just taken" and the list refreshes.
   - With nothing qualifying, the page shows only "Other dates and times →".
6. **Reopening** (F6) sends the opt-in "We've reopened Thu, Dec 24. Rebook: <link>".

### F11: Existing venue after migration (PRD 34)

1. A venue with legacy hours sees its week on the calendar as its regular week. The quick-setup card does not appear.
2. A one-time banner: "Your hours were carried over. Nothing changed for guests."

### F12: History (PRD 35)

1. **Overflow → History** opens a drawer, newest first. Each entry names who, when and what, in plain words: "Closed Thu Dec 24: cancelled 14 and notified · by Ana".
2. Filters: date range, person, type. Each entry links to its day, and **Revert** appears on entries that told no guests.
3. Empty state: "No changes yet." Loading uses a `Skeleton` list.

### F-HOST: What Hosts see (PRD actors, 26–28)

1. Hosts can open Availability: Calendar (Month and Week) and Special dates, **view only**.
   - The day drawer shows the plain summary and "Why this day", with no scope select, no editors and no Remove.
   - A one-line note: "Only managers change hours. For tonight, use the Tonight panel."
2. No disabled buttons appear for Manager-only actions; they are absent. A deep link to a Manager-only action shows "This needs a manager" with the venue's manager names.
3. **Settings → Team** (Manager only): each staff member's role (Manager / Host), plus a "Hosts can close in an emergency" toggle.

## Flows: Phases 2–5 (structure; wireframes at each phase's kickoff)

### F13: Plan the year's holidays (Phase 2: PRD 36–39, 41–44)

- **Special dates → Holidays** lists the next 12 months of the region's holidays (US first), with computed dates and observed notes ("Independence Day · observed Fri Jul 3").
- For each: **Open as usual / Closed / Special hours** (inline service editor) **/ Use schedule [ ]**, plus an optional "Booking opens [date, time]".
- Dates already decided by hand show "Already decided: Closed (added Oct 30)" and are never duplicated.
- **Copy from last year** pre-fills last year's decisions.
- An undecided holiday within 30 days badges the tab and shows a Calendar banner ("Thanksgiving is in 3 weeks: open as usual?").
- Decisions become special hours or closures labelled "Holiday", and go through Step 2 when bookings are affected.
- The public venue page and open sign show holiday hours (PRD 44).

### F14: Holiday schedule (Phase 2: PRD 40)

A schedule can be marked "Holiday schedule". Its editor adds fixed seatings, longer turn times (Phase 3) and a policy (Phase 4). Fields from phases not yet shipped stay hidden.

### F15: Areas, booking types, holdback, tables out of service, area closures (Phase 3: PRD 45–50, 56, 58, 78)

- The service editor gains **Areas**. Each floor-plan section gets Online + phone / Phone only / Walk-in only / Not used, plus an optional seasonal date range. **Hold back for walk-ins** takes N tables or specific tables.
- The day drawer gains **Tables out of service**.
- A schedule can carry a floor plan.
- F5 gains **What → One area** (story 78). Step 2 gains **Move to another area and notify** ("moved indoors").
- Everything stays hidden for venues with no sections (PRD 58).
- In the widget, a "Seating" choice appears only when 2+ areas are bookable online.

### F16: Turn times, buffers, pacing, party limits, booking windows (Phase 3: PRD 48, 51–55, 57)

- The service editor gains a collapsed **Advanced** section:
  - turn times by party-size band;
  - reset buffer;
  - pacing (covers and/or parties per interval, per-time exceptions, service maximum);
  - party min/max;
  - booking window and release time;
  - minimum notice;
  - online cutoff.
- F-X Compare columns include these fields.
- The preview shows their effect.
- Over-limit parties get "Call us" or "Send a request" with the reason.
- Walk-ins count automatically.

### F17: Policies (Phase 4: PRD 59–65)

- A **Policies** tab: named policies (deposit / card hold / prepay; cancellation window and fees; no-show fee), with the default first.
- Policies can be attached from the service editor, a special-hours date, a holiday, an event, or a "Parties of N or more" rule.
- **Check a booking** shows exact terms for a party, date and time.
- The repeat no-show rule is editable here.
- Guests see the terms in plain words before confirming.

### F18: Events (Phase 5: PRD 66–73, 77)

- An **Events** tab: status (Draft / Scheduled / On sale / Sold out / Closed) with a sold/capacity meter.
- The editor covers:
  - table-based or ticketed;
  - alongside or replacing service;
  - showings (one-off or repeating, with F-SER for one showing);
  - capacity, ticket types, per-order limit, add-ons;
  - online and in-house sales windows;
  - refund policy;
  - guest copy;
  - draft then publish;
  - Duplicate.
- Cancel/reschedule runs Step 2 for ticket holders.
- **Hold a room for party season** is staff-visible only.
- The widget lists events beside times; sold out offers "Notify me".

### F19: Private dining and buyouts (Phase 5: PRD 74–76)

- **Events → Spaces**: private rooms with guest range, F&B minimum and/or room fee, deposit, service charge, headcount due date, and instant or inquiry booking.
- A partial buyout removes a space for a window. A full buyout runs F5 (whole venue).
- A tentative hold shows its expiry.

## Screens

### S1: Quick setup (first run, onboarding, Change regular week)

```
Availability
┌ Set your regular week ────────────────────────────────────────┐ ┌ Guest preview ─────────┐
│ Service  [Lunch][Brunch][Dinner][Late]  or type a name         │ │ Add a service to see   │
│ [        ] Opens [  :  ] Last seating [  :  ] Closes [  :  ]   │ │ the times guests get.  │
│ Days  [Weekdays][Weekends][Every day]   M T W T F S S          │ │                        │
│                                         ○ ○ ○ ○ ○ ○ ○          │ │                        │
│ + Add another service                                          │ └────────────────────────┘
│                               [Save and open bookings]         │
└────────────────────────────────────────────────────────────────┘
(Change regular week adds:  Starting [Jun 1]  Ending [Sep 15 ▾ / No end]  Name [Summer hours])

After tapping [Dinner] and [Weekdays]:
│ [Dinner  ] Opens [5:00 PM] Last seating [9:15 PM] Closes [10:00 PM]   Preview: Mon, Oct 26 · 5:00 … 9:15
│            Last seating 9:15 PM, 45 min before close
│ Days  M T W T F S S   ● ● ● ● ● ○ ○
```

- Purpose: set a working week in one form.
- Empty state: this screen is the empty state for Availability.
- Loading: card `Skeleton`.
- Error: card `Alert`; values kept.
- Nothing is pre-filled (no name, times or days), so the PRD's timed bistro task is not pre-solved by the design; the name chips and day shortcuts make it a few taps.

### S2: Calendar, month and week

```
Availability   [Calendar] Special dates  Schedules*        ⋯ History · Go to date ⌘K · Create another schedule
This week: open 5 days · 1 closure · online booking on            Venue time (Pacific)
[◂] October 2026 [▸] [Today]   (Month|Week)  Services [All ▾]  [Select… ▾] [Change regular week…] [Close…]
┌ Mon ───── Tue ───── Wed ───── Thu ───── Fri ───── Sat ───── Sun ─────┐
│ Closed    Weeknight Weeknight Weeknight Weekend   Weekend   Closed   │
│           Special hrs                   ▬ part closed                │
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘
Week view:
Fri Oct 30  Lunch  ▓▓▓▓▓▓ 11:30–2:30      Dinner ▓▓▓▓▓▓▓▓▓▓▒▒ 5–10 (closed 10–11)
            (ghost outline = regular week)
Selection bar: 6 dates selected · Edit hours · Close… · Use another day's hours · Clear changes · ✕
* Schedules tab appears once 2+ schedules exist.
```

- Purpose: see what governs each day; select and change one or many.
- Empty state: never; S1 shows instead.
- Loading: grid `Skeleton`.
- Error: page `Alert`, "Couldn't load availability · Retry".
- Phone: agenda list in Month (one row per day), Week as a vertical list; drawers full screen; long-press to multi-select.
- Accessibility:
  - The grid is `role="grid"` with a roving tabindex and a single Tab stop. Arrow keys move by day, Home/End go to the week's ends, and PageUp/PageDown move by month.
  - Enter opens the drawer, Space toggles a day in the selection, and Shift+arrow extends the selection. The selection count is announced.
  - Each cell's name reads "Friday, October 30: Weekend, lunch and dinner, special hours, closed 10 to 11 PM". A venue with one schedule says "regular week" in place of a schedule name.
  - Status is never shown by colour or glyph alone.
- Build note: rialto `Calendar` has no per-day content, so this grid is either new or a rialto extension (with a changeset). Architect decides.

### S3: Day drawer

```
┌ Friday, October 30 ──────────────────────────────── [✕]┐
│ Open for lunch and dinner. One change from your regular │
│ Friday.                                                 │
│ ── Why this day ─────────────────────────────────────── │
│ Regular week · Weekend · Lunch 11:30–2:30, Dinner 5–11  │
│ Special hours for this date · dinner until 10   [Remove → 11] │
│ Closure 10–11 PM · private party      [Remove → reopen] │
│ ── You're changing: [This date only ▾] → 1 date ─────── │
│ Lunch   11:30 AM – 2:30 PM · last 1:45   Online+phone ✎ │
│ Dinner   5:00 PM – 10:00 PM · last 9:15  Online+phone ✎ │
│ + Add service   [Close…]   [Use another day's hours…] ⋯ │
│ 2 Fridays already have their own changes:               │
│   (●) Keep theirs  ( ) Replace them   (when scope > 1)  │
│                              [Cancel] [Save 1 date]     │
└─────────────────────────────────────────────────────────┘
```

- Purpose: understand a day, then change exactly the dates intended.
- Empty state: a closed day reads "Closed: your regular week is closed on Mondays." with "+ Add service".
- Loading: drawer `Skeleton`.
- Error: drawer `Alert`; values kept.
- Host view: summary and Why this day only, plus the Tonight note.

### S4: Guest preview panel

```
┌ Guest preview · Draft, not saved ─────────────────────┐
│ Compare with: (●) Last saved ( ) Regular week          │
│ ◂ Thu29 Fri30 [Sat31] Sun1 Mon2 ▸     Party [2 ▾]      │
│ 3 times added · 2 removed · 2 reservations affected    │
│ Dinner  5:00 5:15 5:30 … 9:45 +10:00                   │
│ Late    –10:30 –10:45                                  │
│ ⚠ Would fall outside: 10:30 PM Okafor ·4 · 10:45 Lin ·2│
│   plus 6 more on later dates in scope [Show]           │
└────────────────────────────────────────────────────────┘
```

- Purpose: see exactly what guests will see, and who would be stranded, before saving.
- Empty state: "No times on this date", with the reason.
- Loading: slot `Skeleton`; the previous result stays dimmed while typing.
- Error: "Preview unavailable · Retry". Save is still allowed (the server validates), and the stranded check runs again at save.
- Accessibility: "+" and "–" carry text ("added" / "removed"). Updates are announced politely and debounced.
- Phone: a "Preview" tab inside the drawer.

### S5: Schedules tab and Compare services

```
Schedules                                  [Compare services] [+ New schedule]
Regular week ★  Mon–Thu                    [Edit] [Duplicate] [⋯]
Weekend         Fri–Sun                    [Edit] [Duplicate] [⋯]
Summer hours    Jun 1 – Sep 15, every day  [Edit] [Duplicate] [⋯]

Compare services: [Dinner ▾]
Schedule        Opens   Last seating  Closes   Booking        ☐
Regular week    5:00    9:15          10:00    Online+phone   ☐
Weekend         5:00    10:00         11:00    Online+phone   ☐
Summer hours    5:30    10:15         11:30    Online+phone   ☐
[Set selected to…]      Changes 3 schedules · 118 future dates   [Save 3 schedules]
```

- Purpose: manage alternative weeks and change one service everywhere at once.
- Empty state: unreachable, since the tab appears only with 2+ schedules.
- Loading: list `Skeleton`.
- Error: page `Alert`.

### S6: Close, Step 1

```
Close                                                   Step 1 of 2
What   (●) Whole venue ( ) One service [Dinner ▾] ( ) Booking only ☐Online ☐Phone ☐Waitlist
When   ( ) Tonight (●) One date [Thu, Dec 24] ( ) Several dates ( ) Range ( ) Repeats ( ) Until I reopen
       From [all day ▾]
Note for staff     [Private event: Gomez wedding           ]
Message for guests [Closed for a private event.    ] 27/200
                   [Closed for a private event][Closed due to weather][Closed for the holiday]
⚠ Thu Dec 24 has special hours; the closure replaces them.
── 14 reservations · 52 guests are booked in this closure ──
Guests will see: Thu, Dec 24 · Closed · "Closed for a private event."
                                                   [Cancel] [Next]
```

- Purpose: say what is closed, when, and why.
- Error: field-level messages; focus moves to the first.

### S6b: Special dates tab

```
Special dates      [Closures][Special hours][Repeating][Past]        [+ Add special date]
Thu, Dec 24   Closed · whole venue   "Closed for a private event."   Sent 14 · Rebooked 12 · Unreachable 2  [Call list] [Edit] [Remove]
Thu, Dec 31   Special hours · 6:00 PM – 1:00 AM                       —                                           [Edit] [Remove]
Mondays, Jan 5 – Mar 30   Closed (repeating) · skipped Jan 19         —                                           [Edit dates…] [Remove]
```

- Empty state: "No special dates. Add a closure or different hours for a date."
- Loading: list `Skeleton`.
- Error: page `Alert`.

### S7: Close, Step 2 (affected bookings)

```
Close                                                   Step 2 of 2
Urgent: guests will get a text and an email          (only when it starts within 6 h)
14 reservations · 52 guests · 3 deposits held · Thu, Dec 24 (5:00–11:00 PM)
  5:30 PM  Rivera  ·4  deposit $40
  6:00 PM  Chen    ·2
  … [Show all 14]
What should happen to them?   (required)
( ) Cancel, notify & refund: guests get up to 3 open times in the next 14 days
( ) Keep them and notify
( ) Keep, don't tell guests   → ☐ I understand 14 guests won't be told
Preview message ▸
Guests are told right away. This can't be undone.   [Back] [Close and cancel 14]

Several dates (from + Add special date):
Dec 24 · shortened to 4:00–8:00 PM · 5 bookings  ( ) Cancel  ( ) Move to nearest open time  ( ) Keep times  ( ) Keep, don't tell
Dec 25 · closed · 9 bookings                     ( ) Cancel  ( ) Keep and notify  ( ) Keep, don't tell
                              [Back] [Save 2 dates · cancel 9 · move 5]
```

- Purpose: decide what happens to the people already booked.
- Loading: "Finding affected reservations…", with the primary button disabled.
- Error: if the lookup fails, "Couldn't check existing reservations. Try again." **Save is blocked.** This deliberately reverses the prior-art behaviour, because the PRD requires a decision.

### S8: Tonight panel

```
Timeline  Thu Oct 29  [Online paused · until 4:00 AM ✕] [Patio tables blocked ✕]  [Today] [Walk-in] [Tonight ▾]
┌ Tonight ───────────────────────────────────────────┐
│ [Pause online booking]                              │
│ Close early at [9:30 PM] [Apply]                    │
│ Stop booking [7:30 PM] to [8:00 PM]        [Apply]  │
│ Block tables [All tables in Patio ▾] from [now ▾]   │
│              for [rest of tonight ▾]       [Block]  │
│ Pacing tonight [10] covers / 15 min                 │
│ Ends 4:00 AM Fri (end of Thursday's service)        │
│ ─────────────────────────────────────────────────── │
│ [Emergency: close tonight…]                         │
│ Who can close in an emergency?                      │
└─────────────────────────────────────────────────────┘
```

- Purpose: react to tonight in one tap.
- Empty state: no chips.
- Loading: a spinner on the acting control, others disabled.
- Error: inline under the control ("Couldn't pause online booking · Retry"). A chip appears only on success.

### S9: Staff booking form (changed)

```
New reservation · Thu Oct 29 · party [6]
Time [ 9:30 PM ]   Open: 6:00 6:15 6:45 7:30 …
⚠ After last seating (9:15 PM): needs a reason
Reason (required) [Regulars, kitchen agreed     ]
                              [Book with override]
```

- Empty state: "No open times for 6 on this date". Typing a time is still allowed, with a reason.
- Loading: "Checking…" by the time field.
- Error: "Couldn't check availability; we'll check when you book." A server rejection uses the existing `role="alert"` banner.

### S10: Guest date step (changed)

```
Pick a date
┌ December 2026 ───────────────┐
│ Mo Tu We Th Fr Sa Su         │
│ …  22 23 [24] 25 26 27       │   24 = disabled
└──────────────────────────────┘
Thu, Dec 24: Closed for a private event.
Party [2 ▾]                               [Next]
```

- Empty state: "No online availability in the next N days. Call (555) 123-4567."
- Loading: calendar `Skeleton`.
- Error: "Couldn't load dates · Retry".
- Mid-booking closure (F9.5): the confirm step shows "This time just closed", with alternatives inline.

### S11: Guest manage page, cancelled by venue (changed)

```
┌ Your reservation was cancelled ─────────────┐
│ Bistro Lune is closed Thu, Dec 24           │
│ "Closed for a private event."               │
│ Refund: $40 · on its way (5–10 days)        │
│ Book one of these instead (party of 2):     │
│  [Wed Dec 23 · 7:00 PM] [Sat Dec 26 · 7:15] │
│  [Sun Dec 27 · 6:45 PM]                     │
│  Other dates and times →                    │
└─────────────────────────────────────────────┘
```

- Empty state: only "Other dates and times →".
- Loading: `Skeleton`.
- Error: an invalid token gives the existing manage-page error. A taken time gives "That time was just taken", and the list refreshes.

## Scenario walkthroughs

Each walkthrough is completable with the flows above.

- **(a) Summer hours from Jun 1:** Calendar → **Change regular week…** (F-UW) → adjust dinner to close at 11:30 → Starting Jun 1, Ending Sep 15, name "Summer hours" → review stranded (0) → Save. **5 steps.** On Sep 16, "Why this day" shows the regular week again with no action.
- **(b) Snow day at 3 PM, 40 bookings:** Manager on a phone → timeline **Tonight ▾** → **Emergency: close tonight** (F7 → F5 with Whole venue + Tonight pre-filled; the impact line already reads "40 reservations · 128 guests") → **Next** → Step 2 shows "Urgent: guests will get a text and an email" → **Cancel, notify & refund** → **Close and cancel 40**. Special dates row: Sent 40 · Rebooked 0 · Unreachable 3 → **Call list**. **5 taps** (Tonight, Emergency, Next, choice, Close) plus the calls.
- **(c) Patio rained out tonight:** Host → **Tonight ▾** → **Block tables: All tables in Patio, rest of tonight** → Block. A chip appears, patio tables stop being offered, and existing patio bookings show on the timeline to be moved by hand. **3 taps.** (Phase 3 adds a true area closure with "Move to another area and notify", story 78.)
- **(d) Christmas Eve special hours plus Christmas Day closed, in one sitting:** Special dates → **+ Add special date** → row 1: Dec 24, Special hours, dinner 4:00–8:00 PM → row 2: Dec 25, Closed, message "Closed for the holiday" → Next → a single Step 2 with one choice per group (Dec 24 shortened: Move; Dec 25 closed: Cancel) → **Save 2 dates · cancel 9 · move 5**. **One sheet.** Alternatively: select Dec 24–25 on the calendar → selection bar.
- **(e) Skip one Monday of a repeating closure:** Calendar → Mon Jan 19 → "Why this day: Mondays closed, Jan–Mar" → **Remove** → **Only Mon, Jan 19** → **Skip this date** → Save → Undo available. **5 steps**, and the series is untouched.
- **(f) Dinner pacing across 4 schedules (Phase 3 fields):** Schedules → **Compare services: Dinner** → select all 4 rows → **Set selected to…** pacing 12 covers / 15 min → one impact line and stranded check → **Save 4 schedules**. **5 steps.**
- **Bistro first run (the ≤5-min criterion):** F1 is still one screen. Pick Lunch and Dinner, adjust times, Wed–Sun, Save. No schedule, layer or scope vocabulary appears during first run. Afterwards a day drawer opened to read shows only its plain summary; the scope select appears on the first edit, and the layer stack only once a day has a second layer.

## Story coverage

Every PRD story with a UI is reachable through a flow:

- **Phase 1:**
  - 1–5 → F1, F2. 6–7 → F1, F3, F-ONB. 8 → F4, F-MS. 9 → F2, F3, F-X. 10 → F2 (scope first). 11 → F3. 12 → F-UW, F3. 13 → F2. 14 → S2 Month/Week + "Why this day".
  - 15–16 → F5, F6, F-MS. 17 → F5 Repeats, F-SER. 18 (booking-only closures) → F5. 19 → F5.9. 20 → F5.4. 21–22 → F5 Step 2. 23–24 → F10. 25 → F6.
  - 26–28 → F7. 29 → F2 + S4. 30 → F8. 31–32 → F9. 33 → System (surfaced in F8, F9). 34 → F11, F-ONB. 35 → F12.
- **Phase 2:** 36–39, 41–44 → F13. 40 → F14.
- **Phase 3:** 45–50, 56, 58, 78 → F15. 48, 51–55, 57 → F16, F-X.
- **Phase 4:** 59–65 → F17 (65 is System; shown in F10's refund line).
- **Phase 5:** 66–73, 77 → F18. 74–76 → F19.

## Conventions to match

- **rialto only:** `Drawer`, `Dialog`, `ConfirmDialog`, `Alert`, `Toast` (`useToast`, with an action for Undo), `Tabs`, `SegmentedControl`, `Select`, `DateRangePicker`, `TimePicker`, `Calendar`, `Skeleton`, `DisabledTooltip`, `Tag`, `EmptyState`, `Checkbox`. Use `--rialto-*` tokens (`.claude/rules/ui-quality.md`, `docs/ui-quality/rubric.md`).
- **Focus and announcements:**
  - Focus moves to the first invalid field.
  - Focus returns to the invoking control when a dialog closes.
  - Additions, removals and selection counts are announced politely.
  - Escape in a nested picker closes only that picker. This was the prior run's verify failure, so it needs a real-browser test.
- **Errors** show `describeApiError(...).detail` in `role="alert"`.
- **No setState in useEffect** in rialto components (gotchas).
- **Copy** follows Voice & terms. Counts go on buttons, irreversible actions say so beside the button, and guest text never says "slot".
- **Breakpoint:** 1024 px (`useIsMobile`). Touch targets are at least 44 px in the Tonight sheet and selection bar.

## Dependencies surfaced for Architect

- **Manage-link fix (Phase 1):** links must reach `/hospitality/reservations/manage?token=…`.
- **Closure SMS** (new SMS kind), plus **urgent dual-channel delivery** for closures within 6 hours, inside the contact policy.
- **Roles:** Manager vs Host, plus the per-venue emergency grant (nothing enforces `VenueRole` today).
- **Calendar grid** with per-day content and multi-select (rialto `Calendar` lacks both).
- **Staff live check:** classifies a typed time as ok, soft-limited (naming the limit) or closed.
- **Undo/revert** for configuration changes that told no guests.
- **Concurrency detection** on save ("someone changed this since you opened it").
- **Layer explanation:** for any date, the ordered layers with each one's removal result.
- **Stranded check** over every future booking in an edit's scope, beyond the preview window.
- **Table-aware Tonight blocks in Phase 1:** blocked tables and stopped time windows must reduce what the slot engine offers on every booking path, ahead of Phase 3's inventory work.

## Deliberately not designed

- Full Phase 2–5 wireframes (at each phase's kickoff).
- Group Operator screens (out of PRD scope).
- Changing staff booking duration (90 minutes until Phase 3 turn times).
- Inbound SMS replies (reply-to-rebook).
- Visual polish beyond rialto defaults (illustration, calendar animation).
- Printing or exporting the month (only the Call list prints in Phase 1).
- A dashboard "closure today" banner, which the closure band, Tonight chips and header pill cover.
- New locales; new strings go through the existing i18n pipeline.
- Area closure UI in Phase 1 (moved to Phase 3, story 78). Tonight table-blocking covers the urgent case.
