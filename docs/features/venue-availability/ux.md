---
stage: ux-design
run: feature:venue-availability
date: 2026-10-25
assumptions:
  - Depth was decided with the Owner. Phase 1 gets complete flows and wireframes, including empty, loading and error states. Phases 2–5 get flows and screen structure, so every PRD story is reachable, with full wireframes left to a short UX pass at each phase's kickoff.
  - Every Phase 1 wireframe below was confirmed with the Owner on 2026-10-25. The Phase 2–5 structure was not individually confirmed.
  - Times are shown in the app's existing 12-hour convention ("5:00 PM", and "1:00 AM (next day)" for after-midnight closes), as in the prior-art run. Time entry uses rialto `TimePicker` or the native time input, whichever the editor already uses.
  - Facts checked against the code on 2026-10-25, each of which shaped a decision here
    - The staff booking form (`NewReservationDialog.tsx`) uses a free time input and a fixed 90-minute duration, and never calls availability. The server checks staff bookings only for conflict and pacing (pacing failures return 400), never for hours or party size.
    - Confirmation, modified and cancelled messages are email-only. SMS has templates only for reminders, waitlist and win-back (`sms-port.ts:52-57`), so the closure SMS is a new template.
    - The widget's date step is a native `<input type="date">`, and rialto `Calendar` is not used in hospitality. `Calendar` supports `isDateDisabled` but has no per-day content prop.
    - Roles: only platform admin is enforced. `VenueRole {owner, manager, staff}` exists in Prisma but nothing reads it, so Manager and Host here are new permission work for Architect.
    - **Manage links are broken (live defect).** Emails and SMS link to `${MANAGE_BASE_URL}?token=…`, with `MANAGE_BASE_URL=https://<domain>` (`pulumi/index.ts:251`, `email-content.ts:64`), but the page is at `/hospitality/reservations/manage`, and nothing on the root site redirects there. This was confirmed in code, not probed live. The Owner folded the fix into Phase 1, because F12's rebooking depends on it.
---

# UX: Venue availability configuration

## Surfaces

What changes:

- **Availability page (new; Manager).** Replaces `/setup/hours`. It has three tabs, **Calendar** (the default), **Templates** and **Closures**, and a **guest preview** panel that appears while anything is being edited. These entry points are repointed:
  - Setup checklist step and review link (`SetupPage.tsx:26,28`)
  - Sidebar setup step (`nav-sections.ts:87`)
  - Settings → Venue card (`SettingsPage.tsx:374`)
  - Booking-widget demo "set hours" (`BookingWidgetDemoPage.tsx:116`)
  - Readiness step `operating-hours` (`useVenueReadiness.ts`)
- **Tonight panel (new; Host).** Lives in the timeline header (`PageHeader` `aside` slot, beside Today and Walk-in) and makes night-of changes.
- **Staff booking form (changed; Manager and Host).** `NewReservationDialog` keeps its free time input and adds a live availability check, an open-times strip, and the override reason.
- **Booking widget (changed; Guest).** The date step moves to rialto `Calendar` with closed dates disabled and labelled. The time step shows closure and pause messages.
- **Guest manage page (changed; Guest).** `ManageReservationPage` gets a "cancelled by venue" state with the refund status and up to 3 rebook times. Links must actually reach this page (the Phase 1 defect fix).
- **Closure messages (new; Guest).** A closure email and a closure SMS.
- **Timeline blocks (changed).** An "Override" tag, and a closure band across closed time.

## Flows: Phase 1 (complete)

### F1: First run, bistro week in under 5 minutes (PRD 1, 3, 6, 7, 32)

1. A Manager with no availability opens **Availability**. Instead of the calendar, a **quick-setup card**, "Set your regular week", takes the page (Screen S1). The guest preview shows on the right.
2. One service row is pre-filled: "Dinner", opens 5:00 PM, last seating 9:15 PM, closes 10:00 PM, and day toggles M–S with Tue–Sat on.
3. The Manager adjusts the times and toggles days. The preview updates live (for example "Tue Oct 27 · 5:00 PM … 9:15 PM").
4. Optionally, "+ Add another service" adds a row (lunch, brunch, late), focuses its name field, and a live region announces "Service 2 added".
5. **Save and open bookings**:
   - **Valid:** the button reads "Saving…". On success, a toast says "Bookings are open Tue–Sat". The page switches to the Calendar tab with the month filled in, and the Setup checklist marks availability as done. Behind the scenes, a template named "Regular week" is created and assigned to the chosen days. The word "template" doesn't appear in this flow.
   - **Invalid** (overlapping services, last seating after close, no days on): field-level messages appear, focus moves to the first invalid field, and nothing is sent.
   - **Server error:** a rialto `Alert` (`role="alert"`) appears at the top of the card. Focus moves to it, the values are kept, and Save can be retried.

### F2: View the schedule and edit a day (PRD 1–5, 9, 10, 13, 14, 15, 29)

1. **Availability → Calendar** (Screen S2) shows a month grid. Each day cell shows the template chip ("Weeknight"), "Closed", or "● Override", plus any closure band. Today is marked. Prev/next month controls and a "Today" button sit above the grid. A legend explains the chips.
2. Activating a day opens the **day drawer** (rialto `Drawer`, Screen S3), titled "Friday, October 30". It shows "From template: Weekend" or "From override", with **Change template**. Each resolved service is listed with its window and last seating, plus an edit button. The drawer also offers "+ Add service for this date" and **Close this date…**, which goes to F5.
3. Editing a service opens it inline in the drawer: name, opens, last seating, closes, interval or fixed seating times, and channel ("Online + phone" or "Walk-in only"). Whenever a close is earlier than the open, a hint reads "Closes 1:00 AM the next day (Saturday)".
4. While the draft differs from the saved schedule, the **guest preview** (Screen S4) shows the draft's times with + and – marks, and lists any reservations that would fall outside.
5. **Save** shows the "Apply to" group, defaulting to the first option:
   - (●) Only Fri Oct 30
   - ( ) Every Friday from Oct 30
   - ( ) Every day using "Weekend" (N days)
6. If the draft strands reservations, Save opens the same affected-bookings step as F5 step 6 before anything is written.
7. On success the drawer closes, the calendar cell updates, a toast reads "Friday, October 30 updated", and focus returns to the day cell. On error, an `Alert` appears at the top of the drawer, the drawer stays open, and the values are kept.
8. **Change template** offers a rialto `Select` of templates, with the same Apply-to choice.

### F3: Templates (PRD 6, 7, 9, 11, 12)

1. **Availability → Templates** (Screen S5) lists templates with the days and date ranges each is assigned to, for example "Weeknight · Mon–Thu", "Weekend · Fri–Sun", "Summer patio · Jun 1 – Sep 15". The tab stays hidden until a second template exists or the Manager opens it from the overflow menu ("Manage templates"), so a one-template bistro never sees it (progressive disclosure).
2. **New template** opens an editor with the same service-row editor as F1, plus **Assign to**: day toggles and an optional date range (rialto `DateRangePicker`). The guest preview shows the first date the template would affect.
3. **Duplicate** creates "<name> (copy)" and opens it in the editor.
4. **Edit** works like F2, with the scope fixed to the whole template. The preview and stranded-booking list cover the next 30 days of days using it.
5. **Delete** is only offered for templates assigned to no days. Otherwise it's disabled with the reason "Assigned to Mon–Thu; reassign those days first" (rialto `DisabledTooltip`).

### F4: Copy a day (PRD 8)

1. In the day drawer's overflow menu, **Copy to other days…** opens a small dialog with weekday toggles, "From [date]" and Apply-to options matching F2.
2. On confirm, F2's save path runs, including any stranded-bookings step.

### F5: Close: date, range, repeat, service, area or channel (PRD 15–22, 25; the demo)

1. The Manager starts from **Close this date…** (day drawer), **+ New closure** (Closures tab) or **Close…** (calendar toolbar). A rialto `Dialog` opens, titled "Close", at **Step 1 of 2** (Screen S6).
2. **What:**
   - Whole venue
   - One service (choose it)
   - One area (Phase 3; hidden until areas exist)
   - Channel only: Online, In-house, Waitlist. Each is a checkbox; online alone is "pause online booking".
3. **When:** One date | Date range | Repeats (e.g. "Every Monday, Jan 1 – Mar 31"). For a single date, an optional time window ("from 10:00 PM").
4. **Messages:** "Note for staff" (internal) and "Message for guests" (optional, at most 200 characters, with a counter). The calendar behind the dialog updates live.
5. **Next** with no affected bookings goes straight to the final Save, labelled "Close Thu, Dec 24".
6. **Step 2 of 2: affected bookings** (Screen S7), shown only when bookings are affected:
   - A heading: "14 reservations · 52 guests · 3 deposits held on Thu, Dec 24 (5:00 PM – 11:00 PM)".
   - A list sorted by time showing guest, party and deposit, collapsed after 5 ("Show all 14"). Bookings that start before the closure and run into it are included and marked "runs into closure".
   - A required radio group, with no default:
     - **Cancel, notify & refund**, sub-text "Guests get up to 3 open times in the next 14 days to rebook."
     - **Keep them, notify guests of the change**
     - **Keep them, don't notify.** Choosing this reveals "Type CONFIRM to keep 14 bookings without telling the guests."
   - **Preview message ▸** expands the exact email and SMS text for the chosen option.
   - The primary button names the outcome: "Close and cancel 14", "Close and notify 14" or "Close and keep 14". It stays disabled until a choice is made, and for the third option, until CONFIRM is typed.
7. **Result:**
   - A toast: "Thu, Dec 24 closed · 14 guests notified".
   - The calendar shows the closure band.
   - Sends run in the background. On the Closures tab, the row shows "Notifying 14… → 14 sent" and lists failures ("2 couldn't be reached: no email or phone") with a "Copy their numbers" action.
   - If a refund fails, the row shows "Refund failed for Rivera ($40) · Retry".
   - If the save itself fails, an `Alert` appears in the dialog and nothing is cancelled or sent.
8. **Pause online booking indefinitely** (PRD 19) is this same flow with What = "Online" and When = "Until I resume". It appears as a banner on the Calendar tab ("Online booking paused · Resume") and as an "Online paused" pill in the app header.

### F6: Reopen (PRD 25)

1. **Closures tab → row → Remove closure** opens a rialto `ConfirmDialog`: "Reopen Thu, Dec 24? Guests can book again; the 14 cancelled reservations stay cancelled." Buttons: **Reopen** / **Keep closed**.
2. On confirm: toast "Thu, Dec 24 reopened", and the calendar and preview update.

### F7: Tonight panel, Host (PRD 26, 27, 28)

1. On the timeline, **Tonight ▾** in the header opens a popover (a bottom sheet on phones, Screen S8). It contains:
   - **Pause online booking** (toggle)
   - **Close early at** [time] + Apply
   - **Block** [time] **for** [duration]
   - **Pacing tonight** [n] covers / [interval]
   - The caption "Ends automatically when service ends."
2. Each active change becomes a dismissible chip in the header, such as "Online paused · until close ✕". The ✕ undoes it, after a confirm only when guests would be affected.
3. **Close early** with bookings after the new close runs F5's Step 2.
4. **Emergency: close tonight…** appears only if the Manager granted it to Hosts. It runs F5 with What = "Whole venue" and When = "Tonight" pre-filled, and Step 2 is still required.
5. All Tonight changes disappear at the service-day boundary.
6. Without the grant, the emergency entry is absent (not disabled). This keeps the panel short.

### F8: Staff booking with live check and override (PRD 30)

1. The staff booking form (Screen S9) keeps the free time input. When date, party and time are entered, the form checks availability live:
   - **Inside every limit:** nothing extra is shown.
   - **Outside a soft limit** (after last seating, over pacing, party over the service maximum): a warning names the limit ("⚠ After last seating (9:15 PM)"), and a required **Reason** field appears. The primary button becomes **Book with override**.
   - **Inside a closure:** "✕ Closed 10:00–11:00 PM, 'burst pipe'. Can't book." The button is disabled.
2. A strip of open times for that date and party sits under the time input as one-tap shortcuts.
3. The saved booking shows an **Override** tag on its timeline block, and its accessible label includes the reason ("Override: Regulars, kitchen agreed").
4. If the check fails because of a network error, a caption reads "Couldn't check availability; the server will check on save". The server is the final guard.

### F9: Guest books (PRD 31, 32, 33)

1. The widget's date step becomes rialto `Calendar` (Screen S10). Closed dates are disabled, and their accessible names carry the reason ("December 24, closed, private event"). The guest message shows under the calendar when that date is focused. Dates beyond the booking window are disabled.
2. If a guest still arrives on a closed date (deep link, gen-UI), the time step shows the closure message and a "See other dates" button instead of slots.
3. When online booking is paused: "Online booking is paused right now. Call (555) 123-4567." That uses the venue phone, falling back to the guest message.
4. A venue with nothing configured shows "Not taking online bookings yet", with the phone if one is set. It never shows an empty picker.
5. After-midnight slots appear under "Late Night", as in prior-art F7.

### F10: Guest receives a closure message (PRD 23, 24)

1. **Cancel, notify & refund:**
   - Email: subject "Your reservation at Bistro Lune on Thu, Dec 24 is cancelled". The body has the guest message, the refund line, up to 3 rebook buttons, and "Other dates and times".
   - SMS, for guests who prefer it, fits in one segment where possible: "Bistro Lune is closed Thu Dec 24. Your 7:00 PM table for 2 is cancelled and your $40 deposit refunded. Rebook: <link>".
2. **Keep and notify:** "Bistro Lune has changed its hours on Thu, Dec 24: [guest message]. Your 7:00 PM table is still booked. Manage or cancel: <link>".
3. The link opens the **manage page** (Screen S11).
   - For a cancelled-by-venue booking it shows "Your reservation was cancelled", the venue's message, the refund status ("$40 · on its way, 5–10 days" or "No deposit was held"), and up to 3 **one-tap rebook** buttons.
   - Each rebook re-checks the slot. If it has gone: "That time was just taken." The list refreshes, falling back to "Other dates and times →".
   - A successful rebook shows the normal confirmation.
4. With no qualifying times, the page shows only "Other dates and times →".

### F11: Existing venue after migration (PRD 34)

1. A venue with legacy hours opens Availability and sees its week already on the calendar under a template named "Regular week". The quick-setup card does not appear.
2. A one-time dismissible banner: "Your hours were carried over. Nothing changed for guests."

### F12: Audit history (PRD 35)

1. **Availability overflow → History** opens a drawer listing changes newest first. Each entry gives who, when, and what changed, for example "Closed Thu Dec 24: cancel & refund 14 · by Ana".
2. Empty state: "No changes yet." Loading uses a rialto `Skeleton` list.

## Flows: Phases 2–5 (structure; wireframes at each phase's kickoff)

### F13: Plan the year's holidays (Phase 2: PRD 36–39, 41–44)

- Adds a **Holidays** tab to Availability.
- It lists suggested holidays for the venue's region (US first) for the next 12 months, with computed dates and observed-date notes ("Independence Day · observed Fri Jul 3").
- For each holiday, a choice: Open as usual | Closed | Special hours | Use template [ ].
- An optional "Booking opens" date and time per holiday.
- **Copy from last year** pre-fills last year's decisions.
- Holidays with no decision within 30 days show a warning badge on the tab and a calendar banner ("Thanksgiving is in 3 weeks: open as usual?").
- Decisions appear as overrides on the calendar, are labelled "Holiday", and go through F5's Step 2 when bookings are affected.
- The public venue page and open sign show holiday hours (PRD 44).

### F14: Holiday template (Phase 2: PRD 40)

- In the Templates tab, a template can be marked "Holiday template".
- Its editor adds fixed seatings, longer turn times (from Phase 3), and a policy reference (from Phase 4). Fields not yet available are hidden until their phase ships.

### F15: Areas, channels, holdback, table out of service (Phase 3: PRD 45–50, 56, 58)

- The service editor (F2 and F3) gains an **Areas** section listing each floor-plan section with a channel choice: Online + phone | Phone only | Walk-in only | Not used.
- A seasonal area has an optional date range.
- **Hold back for walk-ins**: N tables or specific tables.
- The day drawer gains **Out of service** to pick tables.
- Templates gain an optional floor plan.
- The whole section stays hidden for venues with no sections defined (PRD 58).
- In the widget, an optional "Seating" choice appears only when more than one area is bookable online.

### F16: Turn times, buffers, pacing, party limits, booking windows (Phase 3: PRD 48, 51–55, 57)

- The service editor gains **Advanced** (collapsed): turn times by party-size band, reset buffer, pacing (covers and/or parties per interval, per-slot exceptions, service maximum), party-size min/max, booking window and release time, minimum notice, and online cutoff.
- The guest preview shows the effect live.
- Over-limit parties in the widget get the venue's chosen path ("Call us" or "Send a request") with the reason.
- Walk-ins count against pacing automatically; no UI.

### F17: Policies (Phase 4: PRD 59–65)

- Adds a **Policies** tab: a list of named policies (deposit, card hold or prepay; cancellation window and fees; no-show fee), with the venue default first.
- Policies are attached from the service editor, the day drawer and overrides, holidays, events, and a "Parties of N or more" rule.
- **Check a booking**: pick party, date and time to see the exact terms and amount.
- The repeat no-show rule is shown and editable here.
- The guest widget shows the plain-words terms before confirming.

### F18: Events (Phase 5: PRD 66–73, 77)

- Adds an **Events** tab: a list with status (Draft, Scheduled, On sale, Sold out, Closed) and a sold/capacity meter.
- The editor covers:
  - type: table-based or ticketed;
  - runs alongside normal service, or replaces it;
  - showings (one or recurring);
  - capacity, ticket types, per-order limit, add-ons;
  - sales windows (online and in-house);
  - refund policy;
  - guest message copy;
  - draft, then publish;
  - Duplicate.
- Cancelling or rescheduling an event runs F5's Step 2 for its ticket holders.
- **Room block for party season** creates a held block visible to staff but not to guests.
- The widget lists events as their own items beside normal times. Sold-out events offer "Notify me".

### F19: Private dining and buyouts (Phase 5: PRD 74–76)

- **Spaces** (in the Events tab) lists private rooms with guest range, F&B minimum and/or room fee, deposit, service charge and headcount due date, and whether they are bookable instantly or by inquiry.
- A partial buyout removes a space from public availability for a window.
- A full buyout runs F5 (whole venue), Step 2 included.
- A tentative hold shows its expiry, which is countdown-labelled in the list.

## Screens

### S1: Quick setup (first run)

```
Availability
┌ Set your regular week ───────────────────────────────────┐ ┌ Guest preview ─────────┐
│ Service   Opens     Last seating  Closes    Days          │ │ Tue, Oct 27 · Party 2  │
│ [Dinner ] [5:00 PM] [9:15 PM]    [10:00 PM] M T W T F S S │ │ 5:00 5:15 5:30 … 9:15  │
│                                             ○ ● ● ● ● ● ○ │ │                        │
│ + Add another service (lunch, brunch, late)               │ │                        │
│                         [Save and open bookings]          │ └────────────────────────┘
└───────────────────────────────────────────────────────────┘
```

- Purpose: set a working week in one form.
- Empty state: this screen is the empty state for Availability.
- Loading: a rialto `Skeleton` card while the venue loads.
- Error: a top-of-card `Alert` with the API error detail; values kept.

### S2: Calendar (home)

```
Availability            [Calendar]  Templates  Closures          ⋯ (History, Manage templates)
[◂] October 2026 [▸] [Today]                               [Close…]
┌ Mon ──── Tue ──── Wed ──── Thu ──── Fri ──── Sat ──── Sun ────┐
│ Closed   Weeknight Weeknight Weeknight Weekend Weekend  Closed │
│          ● Override                   ✕ Closed                 │
│ …                                                              │
└────────────────────────────────────────────────────────────────┘
Legend: template name · ● override · ✕ closed · ▬ partial closure
```

- Purpose: see what governs each day; open a day to change it.
- Empty state: never empty. With no availability, S1 shows instead.
- Loading: grid skeleton.
- Error: a page `Alert` with "Couldn't load availability · Retry".
- Phone: an agenda list (one row per day) instead of the grid; the drawer becomes full screen.
- Note: rialto `Calendar` has no per-day content prop, so this grid is a new component, or rialto `Calendar` gains a day-content slot. Architect decides; a rialto change needs a changeset.

### S3: Day drawer

```
┌ Friday, October 30 ───────────────────────── [✕]┐
│ From template: Weekend         [Change template] │
│ Lunch   11:30 AM – 2:30 PM · last 1:45     [✎]   │
│ Dinner   5:00 PM – 11:00 PM · last 10:00   [✎]   │
│ + Add service for this date                      │
│ [Close this date…]                        ⋯ Copy │
│ ── on Save ───────────────────────────────────── │
│ Apply to: (●) Only Fri Oct 30                    │
│           ( ) Every Friday from Oct 30           │
│           ( ) Every day using "Weekend" (3)      │
│                               [Cancel] [Save]    │
└──────────────────────────────────────────────────┘
```

- Purpose: change one day, or deliberately more.
- Empty state: a closed day shows "Closed (from template: Weekday)" with "+ Add service for this date".
- Loading: drawer skeleton.
- Error: drawer `Alert`; the drawer stays open.

### S4: Guest preview panel

```
┌ Guest preview · Draft, not saved ───────┐
│ ◂ Thu29 Fri30 [Sat31] Sun1 Mon2 ▸       │
│ Party [2 ▾]                              │
│ Dinner  5:00 5:15 5:30 … 9:45 +10:00     │
│ Late    –10:30 –10:45                    │
│ ⚠ 2 reservations would fall outside:     │
│   10:30 PM Okafor ·4 · 10:45 PM Lin ·2   │
│   (you'll choose what happens on Save)   │
└──────────────────────────────────────────┘
```

- Purpose: see exactly what guests will see before saving.
- Empty state: "No times on this date", with the reason ("Closed", or "No services").
- Loading: a slot skeleton, keeping the last result dimmed so the panel doesn't flash while typing.
- Error: "Preview unavailable · Retry". Save is still allowed, because the server validates.
- Accessibility: "+" and "–" are paired with text ("added" / "removed") for screen readers. Updates are announced politely and debounced.
- Phone: a "Preview" tab within the drawer.

### S5: Templates tab

```
Templates                                           [+ New template]
Weeknight       Mon–Thu                      [Edit] [Duplicate] [⋯]
Weekend         Fri–Sun                      [Edit] [Duplicate] [⋯]
Summer patio    Fri–Sun · Jun 1 – Sep 15     [Edit] [Duplicate] [⋯]
```

- Purpose: manage reusable weeks.
- Empty state: unreachable, because first run creates "Regular week".
- Loading: list skeleton.
- Error: page `Alert`.

### S6: Close, Step 1

```
Close                                              Step 1 of 2
What   (●) Whole venue ( ) One service [Dinner ▾] ( ) Online booking only
When   (●) One date [Thu, Dec 24] ( ) Date range ( ) Repeats
       From [all day ▾]
Note for staff    [Private event: Gomez wedding          ]
Message for guests[Closed for a private event.     ] 27/200
                                         [Cancel] [Next]
```

- Purpose: say what is closed, when, and why.
- Empty state: n/a.
- Loading: n/a.
- Error: field-level messages (no date, end before start); focus moves to the first.

### S7: Close, Step 2 (affected bookings)

```
Close                                              Step 2 of 2
14 reservations · 52 guests · 3 deposits held
on Thu, Dec 24 (5:00 PM – 11:00 PM)
  5:30 PM  Rivera  ·4  deposit $40
  6:00 PM  Chen    ·2
  … [Show all 14]
What should happen to them?   (required)
( ) Cancel, notify & refund
    Guests get up to 3 open times in the next 14 days to rebook.
( ) Keep them, notify guests of the change
( ) Keep them, don't notify
Preview message ▸
                          [Back] [Close and cancel 14]
```

- Purpose: decide what happens to the guests already booked.
- Loading: "Finding affected reservations…" (polite live region); the primary button is disabled.
- Error: if the affected lookup fails, "Couldn't check existing reservations. Try again." **Save is blocked.** This deliberately reverses the prior-art behaviour, because the PRD requires a decision.

### S8: Tonight panel

```
Timeline  Thu Oct 29   [Online paused · until close ✕]   [Today] [Walk-in] [Tonight ▾]
┌ Tonight ─────────────────────────────────┐
│ [Pause online booking]                   │
│ Close early at [9:30 PM] [Apply]         │
│ Block  [7:30 PM ▾] for [60 min ▾]        │
│ Pacing tonight [10] covers / 15 min      │
│ Ends automatically when service ends.    │
│ ──────────────────────────────────────── │
│ [Emergency: close tonight…]   (granted)  │
└──────────────────────────────────────────┘
```

- Purpose: react to tonight in one tap.
- Empty state: no active chips.
- Loading: controls are disabled with a spinner on the acting control.
- Error: inline under the control ("Couldn't pause online booking · Retry"). The chip appears only after success.

### S9: Staff booking form (changed)

```
New reservation · Thu Oct 29 · party [6]
Time [ 9:30 PM ]   Open: 6:00 6:15 6:45 7:30 …
⚠ After last seating (9:15 PM): needs a reason
Reason (required) [Regulars, kitchen agreed     ]
                              [Book with override]
```

- Purpose: book by phone quickly, with honest limits.
- Empty state: "No open times for 6 on this date"; typing a time is still allowed (with an override reason).
- Loading: "Checking…" caption by the time field.
- Error: "Couldn't check availability; the server will check on save". The server's rejection shows in the existing `role="alert"` banner.

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

- Purpose: choose a date the venue is open.
- Empty state: if no dates in the window are open, "No online availability in the next N days. Call (555) 123-4567."
- Loading: calendar skeleton.
- Error: "Couldn't load dates · Retry"; the native fallback is not shown.

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

- Purpose: rebook in one tap.
- Empty state: no qualifying times, so only "Other dates and times →".
- Loading: skeleton.
- Error: invalid or expired token gives the existing manage-page error. A taken slot gives "That time was just taken" and the list refreshes.

## Story coverage

Every PRD story with a UI is reachable through a flow:

- **Phase 1:** stories 1–5 → F1, F2. 6, 7 → F1, F3. 8 → F4. 9–14 → F2, F3. 15–22 → F5. 23–24 → F10. 25 → F6. 26–28 → F7. 29 → F2/S4. 30 → F8. 31–32 → F9. 33 → System (no UI; surfaced through F8 and F9 messages). 34 → F11. 35 → F12.
- **Phase 2:** 36–39, 41–44 → F13. 40 → F14.
- **Phase 3:** 45–50, 56, 58 → F15. 48, 51–55, 57 → F16.
- **Phase 4:** 59–65 → F17 (65 is System; shown in F10's refund line).
- **Phase 5:** 66–73, 77 → F18. 74–76 → F19.

## Conventions to match

- rialto components only: `Drawer`, `Dialog`, `ConfirmDialog`, `Alert`, `Toast` (`useToast`), `Tabs`, `SegmentedControl`, `Select`, `DateRangePicker`, `TimePicker`, `Calendar`, `Skeleton`, `DisabledTooltip`, `Tag`, `EmptyState`. Colour and spacing come from `--rialto-*` tokens (`.claude/rules/ui-quality.md`, `docs/ui-quality/rubric.md`).
- Focus management and live regions follow the prior-art run's patterns:
  - focus moves to the first invalid field;
  - after a dialog closes, focus returns to the invoking control;
  - additions and removals are announced politely;
  - Escape inside a nested picker closes only that picker. This was the prior run's verify failure, so it needs a real-browser test.
- Errors show `describeApiError(...).detail` in a `role="alert"` banner, as the existing dialogs do.
- No setState inside useEffect in rialto components (gotchas).
- Copy uses the product's nouns (reservations, covers, services, guests), never "slots" in guest-facing text.
- 12-hour times with "(next day)" for after-midnight closes. Dates are written out ("Thu, Dec 24").
- Mobile: the timeline's existing `useIsMobile` breakpoint (1024px). Availability uses an agenda list and full-screen drawers below it.

## Dependencies surfaced for Architect

- **Manage-link fix (Phase 1).** Message links must reach `/hospitality/reservations/manage?token=…`. Today they point at the site root.
- **Closure SMS template.** A new SMS kind that respects `communicationPreference`; today SMS carries only reminder, waitlist and win-back.
- **Roles.** Manager vs Host, plus a per-venue "Hosts can close in an emergency" grant. Nothing enforces venue roles today (`VenueRole` is unused).
- **Calendar day content.** A month grid with per-day labels; rialto `Calendar` lacks it.
- **Staff live check.** The staff form needs an availability check that classifies a typed time as ok, soft-limited (with the limit named) or hard-closed.

## Deliberately not designed

- Full Phase 2–5 wireframes (at each phase's kickoff, per the depth decision).
- Group Operator screens (out of PRD scope).
- Changing the staff booking duration (it stays at 90 minutes until Phase 3 turn times).
- Inbound SMS replies, such as reply-to-rebook.
- Visual polish beyond rialto defaults: illustrations, animation of calendar changes.
- A staff-facing "closure today" banner on the dashboard. The timeline closure band and Tonight chips cover it for Phase 1.
- Localization of the new copy beyond the existing i18n pipeline. New strings go through it; no new locales.
