---
stage: ux-design
run: feature:availability-config-usability
date: 2026-11-03
assumptions:
  - "Walkthrough list not confirmed live (autorun). The skill says to confirm the list with the user; no Owner is live. The list was taken from the brief's success sentence, idea.md's demo and unknowns, and prd.md's success criteria and stories: the demo week, the uniform bistro week, one weekday in Change regular week, a migrated day-named venue, a past-midnight close, and the strip's empty, loading and error states."
  - "Sketch confirmations not live (autorun). The skill says to confirm each sketch with the user. None was confirmed: every sketch in this file (quick setup, the guest-preview strip, the different-hours block, Change regular week, the calendar's regular-week line) is the Stage's own draft, not an Owner-approved wireframe."
  - "docs/ux-patterns.md does not exist and the ux-patterns skill was not run. The skill makes it a suggestion, not a gate, so the stage proceeded. Conventions were taken from docs/features/venue-availability/ux.md (its Voice & terms, 12-hour times, copy rules) and from the existing components."
  - "Layering per-service days over the shared Days field (a service follows the shared Days until the Manager chooses different days for it) is the Stage's decision, not an Owner answer. Reason: the uniform bistro week must take no more interactions than today, and the existing e2e addresses the shared Weekdays button by name."
  - "The live strip is specified for quick setup only (the card on Availability), as the PRD places it 'beside quick setup'. Change regular week keeps its existing draft preview; the new-venue wizard gets a local, no-request summary because the venue does not exist yet. Both are Stage decisions."
  - "Strip content is a list of seven weekdays with each running service's first and last bookable time, for a party of 2 by default (PREVIEW_PARTY_DEFAULT). The PRD left 'what the strip shows, and how it reads when the week is partly entered' to UX; the format, the 'Not offered' line, the 'Updated' tag and the partial-entry rules are the Stage's own design."
  - "Error state of the strip falls back to local rows computed from the typed hours, labelled as not checked. This is a Stage decision, not an Owner answer; it keeps the Manager unblocked if the preview cannot answer for an empty venue (an unverified risk named in idea.md)."
  - "Change regular week: the Name field appears only when an Ending date is set (a named period). With no end the change is the new regular week and needs no name. The PRD requires the one-weekday change to create no schedule, but does not say what happens to the name field; this is the Stage's decision."
  - "A day opened in the day drawer, with the scope 'Your regular week', now means that weekday's hours in the regular week, and the discovery nudge ('You've changed Fridays 3 times') now writes that weekday's hours into the regular week instead of making a weekday schedule. The PRD does not name either surface; the Stage amended them so the product does not contradict 'one regular week'. Flagged for the Owner."
  - "Migrated and saved weeks are shown in the editor with a base set of hours per service (the hours most of its days share; a tie goes to the earlier Monday-first day) plus 'different hours' blocks for the other days. The rule is the Stage's decision."
  - "A day ticked into a different-hours block moves out of any other block, announced politely, rather than being refused. Stage decision, to avoid a dead end when changing one day of a block."
  - "The phone shows the strip inline below the form, not pinned. Stage decision; the tradeoff (the strip is below the fold while typing) is recorded under Deliberately not designed."
  - "The calendar shows the regular week as one summary line (with a Details disclosure) beside the existing week summary. The brief says the calendar shows the result as one regular week and names no control; the line is the Stage's own design."
  - "Interaction counts quoted in the walkthroughs are the Stage's hand counts of controls in this design, one control activation per interaction. They are not the e2e's counts and are never claimed as evidence; the PRD leaves the unit of an interaction to Architect or the e2e author."
  - "Copy is written in en-US only. Implement translates it to es-MX and fr-CA through the existing i18n pipeline."
  - "Every owner-facing line that says what a guest can book uses the first and last time a guest can book (first seating to last seating), not open and close. This is a Stage convention chosen so the strip can be compared with the preview; it means two existing lines (the guest preview's focus-date services and the calendar's day lines) change. Flagged for the Owner and for Architect."
  - "In Change regular week the covered weekdays follow the days the edited services run on: with no end date, a weekday no service runs on is closed from the start date; with an end date, it keeps the hours it has. The PRD does not say; it is the Stage's decision."
  - "New schedule and Edit schedule use the same service rows as quick setup (different days for a service, different hours on some days), so a varied period saved from Change regular week can be edited afterwards. The PRD does not name the Schedules tab; the Stage widened it only to avoid a dead end. Flagged for the Owner."
  - "The strip's title is 'Guest preview', the same as the existing panel, and its retry button is 'Check again' so a failed save never shows two 'Retry' buttons. Stage decisions on terms."
  - "Independent review: independent (fresh reviewer subagent UxStage.UxReviewer, its own context, given idea.md, prd.md, ux.md and the Code facts paths). Its 0 Critical and 7 High findings are listed under Review with dispositions. This is not an inline review."
---

# UX: One regular week that can differ by day

This spec amends `docs/features/venue-availability/ux.md` (the predecessor; it is never edited). Where a predecessor flow or screen changes, this file names it and gives the delta. Everything the predecessor does not name here stays as it was. The predecessor's flow called "F11" is "Existing venue after migration"; the brief's "F11 regular week" means that flow plus the calendar's regular week, and both are amended below.

The design rests on three ideas.

1. **The uniform week is the default path and costs nothing extra.** Every new control sits behind a disclosure that starts closed. A bistro that runs one set of days with one set of hours sees today's form, with the same controls in the same order.
2. **Per-day differences are said in the Manager's words.** "Different days for this service" and "Different hours on some days". The words schedule, assignment, scope and override never appear in setup or in Change regular week.
3. **The Manager watches the week before saving it.** A guest-preview strip lists each weekday with what a guest could book, and moves as the Manager types.

## Voice & terms

The predecessor's Voice & terms bind (Regular week, Service, Special hours, Closure, never "shift", "channel", or guest-facing "slot"). These are added:

- **Days** (shared): the days services without their own days run on. Unchanged label.
- **Different days for this service**: a service that runs on fewer or other days than the shared Days. Never "assign".
- **Different hours on some days**: hours for a service that differ on named weekdays. Never "exception", "override" or "variant".
- **Guest preview**: what a guest could book. The quick-setup strip is its week-at-a-glance form (S12); the panel in Change regular week and the calendar is the same thing for one date (S4). Never "Guest view". Every owner-facing line that says what a guest can book gives the **first and last time a guest can book** (first seating to last seating), never open and close; opening and closing times are for editing, in the time fields.
- **Regular week**: now also the whole non-uniform week. A migrated venue's day-named schedules ("Thu–Fri hours") are never shown to the Manager as separate things; they read as part of it.

Copy rules, from the predecessor: counts on buttons, full day names where names are spoken, 12-hour times ("5:00 PM", "12:15 AM (next day)").

## Scenario walkthroughs

These are the test the flows must pass. Taken from the brief, `idea.md` and `prd.md` (see `assumptions:`: not confirmed live). Each is walked twice: written first, then re-walked in "Walkthrough re-check" using only controls this file defines.

### W1. The demo week, from an empty venue

- Actor and goal: a Manager with a new venue enters lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, and brunch Sat–Sun, in quick setup, without visiting the Schedules tab.
- Steps:
  1. Open **Availability**. The venue has no hours, so S1 shows, with the **Guest preview** beside it.
  2. Service 1: tap the **Lunch** chip. Name, opens 11:30 AM, last seating 1:45 PM, closes 2:30 PM fill in.
  3. Under **Days**, tap **Every day**. Guest preview shows lunch on all seven days.
  4. On Lunch, tap **Different days for this service**. Its days open, filled with every day. Tap **Weekdays**. Guest preview loses lunch on Sat and Sun.
  5. Tap **Add another service**. Service 2 takes focus. Tap the **Dinner** chip (5:00 PM, last seating 9:15 PM, closes 10:00 PM). It follows the shared Days (every day).
  6. On Dinner, tap **Different days for this service** and untick **Monday**. Guest preview shows Monday with "Not offered: Dinner".
  7. On Dinner, tap **Different hours on some days**. A block opens with no day ticked and Dinner's own days offered; focus is on the first day. Tick **Friday** and **Saturday**. Set **Closes** to 12:00 AM. The block says "Closes 12:00 AM the next day". Last seating follows to 11:15 PM. Guest preview tags Fri and Sat "Updated" with dinner ending 11:15 PM.
  8. Tap **Add another service**, tap the **Brunch** chip, tap **Different days for this service**, tap **Weekends**.
  9. Tap **Save and open bookings**. Toast: "Bookings are open Mon, Tue, Wed, Thu, Fri, Sat and Sun · Undo". The calendar shows, with the line "Regular week: Lunch Mon–Fri · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun".
- Result: completes. About 18 control activations by hand count (not evidence; see assumptions). No schedule vocabulary is shown.

### W2. The uniform bistro week (must not get slower)

- Actor and goal: a Manager sets dinner Mon–Fri, nothing else.
- Steps: tap **Dinner**; tap **Weekdays** under **Days**; tap **Save and open bookings**.
- Result: completes in 3 activations, the same controls as today's `availability-quick-setup.spec.ts:93`. No new control sits in the path. The Guest preview fills in beside the form as a side effect and asks for nothing.

### W3. Change one weekday's hours

- Actor and goal: a Manager whose saved week has dinner closing 12:00 AM on Fri and Sat wants Friday to close at 11:00 PM, and leave the other six weekdays alone.
- Steps:
  1. **Calendar → Change regular week…** opens the editor, pre-filled with the saved week.
  2. **Starting**: pick the date. No **Ending**. The note "No end — this becomes the new regular week" shows and no **Name** field is asked.
  3. On Dinner, a block "Fri, Sat · closes 12:00 AM" is already open. Tap **Different hours on some days**: a second block opens. Tick **Friday**. The announcement says "Friday moved from the other hours". The first block now reads "Sat".
  4. In the new block set **Closes** to 11:00 PM.
  5. The draft preview (existing) shows the first Friday in the change with "1 time removed" and the other dates in its date strip unchanged. The line says "Applies to N future dates".
  6. Tap **Save hours from Nov 6**. Toast: "Regular week changed from Nov 6 · Undo".
- Result: completes. No schedule or assignment is created or named by the Manager; Schedules tab does not appear.

### W4. A migrated venue whose week is day-named schedules

- Actor and goal: a Manager whose venue the legacy migration carried over, with undated schedules "Regular week" (Mon–Wed 11:00 AM–10:00 PM) and "Thu–Fri hours" (Thu–Fri 11:00 AM–11:00 PM) and one service called "Service" (`legacy-migration.ts:121,281`), wants Thu–Fri to close at 11:30 PM.
- Steps:
  1. **Availability → Calendar**. The one-time banner reads "Your hours were carried over. Nothing changed for guests." Mon–Fri cells read "Regular week"; Sat–Sun read "Closed". The calendar line reads "Regular week: Service Mon–Fri, later Thu–Fri". The Schedules tab is not shown.
  2. **Change regular week…** → **Starting**: pick a date. On "Service": base hours 11:00 AM–10:00 PM, days Mon–Fri follow the shared Days; one block "Thu, Fri · closes 11:00 PM" is open.
  3. In that block set **Closes** to 11:30 PM.
  4. Tap **Save hours from …**.
- Result: completes. "Thu–Fri hours" is never named in the UI. The editor reads the migrated week as base hours plus one block (the base rule is in the Change regular week flow).

### W5. A past-midnight close

- Actor and goal: a Manager sets dinner on Fri and Sat to close at 1:00 AM.
- Steps: in W1 step 7 set **Closes** to 1:00 AM. The block says "Closes 1:00 AM the next day". Last seating follows to 12:15 AM. Guest preview shows "Dinner 5:00 PM – 12:15 AM (next day)" for Fri and Sat. If the span is too long (over 16 hours) the field says "A service that runs past midnight can be at most 16 hours long." and Save is refused with focus on that field.
- Result: completes.

### W6. The strip's empty, loading and error states

- Actor and goal: a Manager types a week while the strip has nothing, is waiting, or fails.
- Steps:
  1. Nothing entered: the strip says "Add a service with its times and days to see what guests can book each day."
  2. A service has a name and times but none has any day: the strip says "Choose days to see your week." A service that is complete but has no days while another is shown adds the line "Dinner isn't shown yet: choose its days."
  3. First answer pending: seven rows of `Skeleton` lines. Later answers pending: the last rows stay, dimmed, with `aria-busy`.
  4. The check fails: "Preview unavailable", the help "You can still save; the bookings check runs again when you do.", a **Check again** button, and the rows computed locally from the typed hours under the note "These are the hours you typed, not checked against your bookings." **Save and open bookings** stays enabled.
- Result: completes.

## Code facts

Read on the worktree at branch `feat/availability-config-usability` on 2026-11-03. Every line is a fact the sketches depend on.

- Quick setup wiring — `apps/hospitality/src/components/availability/AvailabilityQuickSetup.tsx`:
  - `:34-41` the saved toast lists the days of the draft (`draft.days` in Monday-first order), so a per-service draft needs a union of days.
  - `:43-67` saves through `draftToChanges(draft, state.config, …)` with `expectedVersion`; a `version-conflict` problem refetches and shows `availability.quickSetup.versionConflict`; other errors show `describeApiError(error).detail`.
  - `:72` a `LeaveGuard` asks before leaving a typed, unsaved draft.
- Card — `QuickSetupCard.tsx`:
  - `:21-53` validation runs only after the first Save click (`attempted`); invalid input sends nothing and focuses the first invalid field (`quickSetupFieldId`).
  - `:62-68` a server error shows an `Alert` in a focusable slot that takes focus; `:71-77` the button reads "Saving…", "Retry" (after an error) or "Save and open bookings".
- Form — `QuickSetupForm.tsx`:
  - `:95-170` a service row has name chips (Lunch, Brunch, Dinner, Late), a name, three `TimePicker`s and a Remove button. It has no days: days are one shared draft field.
  - `:172-212` `DaysField` is one fieldset (`id` `quick-setup-days`) under the services, with shortcut buttons Weekdays, Weekends, Every day and seven long-name checkboxes.
  - `:152-159` last seating shows the hint "Last seating 9:15 PM, 45 min before close" only while linked. The form has no past-midnight hint (no "overnight" text in the file); the drawer editor has one (`ServicesEditor.tsx:72,108-120`).
  - `:214-244` the "Guest preview" beside the form is **local text**: one "first seating, last seating" line per service with a name, an opening and a last seating. It makes no request and ignores days.
  - `:250-299` two-column layout (`QuickSetupForm.module.css:1-6`), one column at 720 px (`:77-82`). `:262-266` adding a service focuses its name and announces "Service N added".
- Draft model — `quick-setup-draft.ts`:
  - `:29-43` a draft is `services[]` plus one `days` list for the whole week.
  - `:229-251` validation: per-service completeness and order, `validateConfig` overlap, `spanIssues`, and `days_required`.
  - `:261-281` `span_too_long` is 16 hours past midnight (`MAX_PAST_MIDNIGHT_SPAN`); `legacy_closed_day` only for the wizard.
  - `:294-337` `draftToConfig` builds one regular schedule, one assignment with all days, one row per service.
  - `:344-373` `draftToChanges` writes that, and removes the regular schedule's previous services and assignments.
  - `:388-396` `draftToLegacyHours` projects to the legacy one-window-per-day shape for the wizard.
- Onboarding step — `QuickSetupHoursStep.tsx:21-26,37`: the wizard renders `QuickSetupForm` with the draft held by the wizard, validates with `legacyReader: true`, and the venue does not exist yet. `VenueOnboardingPage.tsx:218` mounts it.
- Page — `apps/hospitality/src/pages/AvailabilityPage.tsx`:
  - `:254-278` `source === "empty"` renders the card for a Manager only; a Host sees `availability.quickSetup.hostEmpty`; a team read in flight shows a `Skeleton`.
  - `:421-436` the calendar's week summary line ("This week: open 5 days · …"); `:453-466` the toolbar, where `onChangeRegularWeek` (`:460`) is offered only when `canAct`; `:465-467` the carried-over banner shows for `source === "legacy"` or `migrated`.
  - `:346-368` the Schedules tab is its own page state.
- Setup checklist — `pages/SetupPage.tsx:22-29`: the hours step links to `/availability`; no change.
- Change regular week — `ChangeRegularWeekDrawer.tsx`:
  - `:44-50` the drawer covers the days the regular week runs on; other days keep their schedule's hours.
  - `:61-66` it seeds one list of services from the regular schedule (one set of hours for all its days).
  - `:119-127` Save is blocked until **Starting** is chosen and **Name** is non-empty (`schedule-changes.ts:73-91`: `startRequired`, then `endBeforeStart`, then `nameRequired`).
  - `:245-252` **Name** is always required, even with no end date; `:258-262` the editor is the shared `ServicesEditor` (uniform rows); `:274-281` `DraftPreview` gets the dates the change reaches.
  - `:216-241` **Starting** (required, no default), **Ending** (optional) and the "No end" note.
  - `e2e/availability-dead-ends.spec.ts:281-300` expects "Choose a start date to save." and the Save button disabled; its Starting/Ending pickers are addressed by name.
- Week builder — `schedule-changes.ts:241-249` `regularWeekdays` reads only the regular schedule's own assignments (or every day when none); `:257-…` with no end the builder creates a new regular schedule and ends the old assignments the day before; with an end it creates a dated schedule.
- Draft preview — `DraftPreview.tsx:86` the preview's focus date is always the first date of the change (`kept.dates[0]`); `:50-70` it stays mounted, paused, when the draft cannot be previewed.
- Guest preview — `AvailabilityGuestPreview.tsx`:
  - `:35` the real debounce constant: `PREVIEW_DEBOUNCE_MS = 400`, **private** to this file; `:71-83` `useSettledBody` applies it. The quick-setup form and card contain no debounce and make no preview request (see the facts above), so the PRD's "the form's existing preview debounce" is this component's, not the form's.
  - `:38` the date strip is `STRIP_SIZE = 5`; `:335-338` it is built from the dates the edit reaches; `:339` compare defaults to "saved"; `:340` party defaults to `PREVIEW_PARTY_DEFAULT`.
  - `:301-309` the focus date lists each service's name, opens and closes; last seating is in the data but not shown. `:393-402` a pending or fetching result is dimmed (`stale`); `:395-424` a failure shows "Preview unavailable", the help line and **Retry** (503 reads "taking longer than usual").
- Preview hook — `hooks/useAvailabilityPreview.ts:38` no retry; the last good result is kept while a newer one loads or fails.
- Preview contract — `packages/types/src/schemas/availability-config-api.ts:496,535-553`: a 30-day window of per-date `added` / `removed` seating minutes, no service names; one `focusDay` with `services` (name, opensAt, lastSeatingAt, closesAt). `services/reservations/src/services/availability-preview.ts:92-110`: `before` is the saved config, the window runs 30 dates from `focusDate`, and times are filtered to tables that fit the party only when the venue has active tables (`bookableOnly`). Whether the endpoint answers for a venue with no saved hours is not verified here.
- Calendar labels — `day-summary.ts:13-34`: a day is labelled "Closed", "Special hours", "Open", or the schedule's name; only the system-seeded "Regular week" reads in the viewer's language. A migrated "Thu–Fri hours" shows as that name today.
- Migration — `packages/availability/src/legacy-migration.ts:121,281`: a single window is named "Service"; the largest group of weekdays that share hours is the "Regular week", the others "<days> hours", `kind: "alternate"`, undated.
- Discovery nudge — `ScheduleNudge.tsx:26-63`: after three one-off changes to the same weekday it offers "Make a Friday schedule", which creates a schedule assigned to that weekday.
- Schedules — `SchedulesTab.tsx`, `ScheduleEditorDrawer.tsx:254`: a schedule's editor has a **Use on** weekday toggle group and uniform services.
- Existing e2e selectors — `e2e/availability-quick-setup.spec.ts:92-160`: buttons addressed by name: "Dinner", "Weekdays", "Save and open bookings"; comboboxes "Opens", "Closes", "Last seating"; the first textbox matching /name/i; the toast /Bookings are open Mon, Tue/. Playwright's role queries fail when two controls match.

## Flows

### F1 (amended): First run, quick setup (PRD 1, 2, 3, 4, 8)

Predecessor F1 stands; changes are only these.

1. The S1 card is unchanged in order: service rows, **Add another service**, **Days**, **Save and open bookings**. The Guest preview (S12) replaces the local text list beside the form.
2. **Shared Days stays.** A service follows the shared **Days** until the Manager chooses different days for it. The uniform week is exactly today's path.
3. **Different days for this service** (a ghost button in each service row, collapsed). It opens that service's days: legend "<Service> runs on", the shortcuts Weekdays / Weekends / Every day and seven day checkboxes, prefilled with the days the service follows now. A **Use the shared days** button closes it and the service follows the shared Days again.
4. **Different hours on some days** (a ghost button in each service row, collapsed). It adds a block (S13) under the service. A service may have several blocks.
5. **Days validity.** A service with its own days needs at least one ("Choose at least one day for Dinner."). The shared Days is required only while at least one service follows it. When every service has its own days the shared Days field shows "Every service has its own days." and its controls are hidden.
6. **Block validity.** A block needs at least one day, a time for each of its three fields, a close that differs from its open, a last seating no later than its close, and days its service runs on. A day cannot be in two blocks: ticking a day in one block moves it out of the other, announced politely ("Friday moved from the other hours"); a block left with no days is removed with the announcement "Hours for Fri removed". Overlap is checked per day: "Dinner overlaps Brunch on Saturday."
7. **Past-midnight.** A close earlier than its open shows "Closes 1:00 AM the next day" under the times, in the base row as well as in blocks (new in S1; the drawer editor already has it).
8. **Save.** As today: validation after the first Save, focus on the first invalid field, first the services in card order, then blocks, then days. The toast names the union of the days any service runs: "Bookings are open Mon, Tue, … · Undo".
9. **Keyboard.** Tab order follows the screen: chips, name, three times, **Different days for this service**, (its days when open), **Different hours on some days**, (blocks when open), Remove service, then the next service, **Add another service**, **Days**, the Guest preview's **Party**, **Check again** (when shown), **Save**. Each disclosure sets `aria-expanded` and moves focus into what it reveals (the first day checkbox for days; the first day checkbox of a new block). Closing a disclosure or removing a block returns focus to the button that opened it.

### F-STRIP (new): Watch the week while typing (PRD 4, 11; the Showstopper)

1. The Guest preview (S12) shows beside the form from the first render. It lists the seven weekdays, Monday first.
2. **Which services show.** A service is _complete_ with a name and its three times. It is _placed_ with at least one day (its own or the shared Days). The strip has three disjoint states by this rule: no complete service → the empty message; complete services but none placed → "Choose days to see your week."; otherwise the seven rows, drawn from the services that are complete and placed. Under the rows, one line per service left out says why: "Late isn't shown yet: choose a time." (not complete) or "Dinner isn't shown yet: choose its days." (complete, not placed).
3. Each weekday row names the services that run that day, each with its first and last bookable time ("Dinner 5:00 PM – 9:15 PM"), and a muted "Not offered: Dinner" line for services that run on other days but not on this one. A day with no service reads "Closed".
4. Edits settle for the form's existing preview debounce (400 ms; `AvailabilityGuestPreview.tsx:35`) and then the strip asks the venue's real engine. A row whose lines changed since the last answer is tagged **Updated** until the next answer. The strip's own live region announces "Friday, Saturday updated" once per answer, never per row.
5. **Party** is a `Select` (default 2, the preview's default). Times are for that party; when the venue has tables and none fits, the row says "Runs, but no table fits a party of 2."
6. The strip is advice. A slow or failed answer never blocks Save, as for the existing preview.
7. After Save the strip is replaced by the calendar. The strip, the calendar's regular-week Details (F-CAL) and the guest preview (S4) are built from the same first and last bookable times for the same week; S4's focus-date lines move from opening and closing to first and last bookable time to match (see Dependencies).

### F-ONB (amended): Onboarding hours step (PRD 1, 2, 3, 8)

The wizard step renders the same form, including **Different days for this service** and **Different hours on some days**. The venue does not exist yet, so the Guest preview is its local mode: the same seven rows computed from the typed hours, with the title "Guest preview", the subtitle "From the hours you typed", no request and no **Party**. "At least one day open" still gates Next. The wizard keeps sending legacy hours (one window per day); how a varied week survives that projection is Architect's (see Dependencies).

### F-UW (amended): Change regular week (PRD 5, 6, 7)

Predecessor F-UW stands for the period case. Changes:

1. **Entry** is unchanged: **Calendar → Change regular week…** (Managers only).
2. **The editor** is the S1 editor with its new parts (different days for a service, different hours on some days), pre-filled from the saved regular week, including migrated day-named schedules read as part of it (rule below).
3. **Starting** stays required with no default; **Start today** and **Start tomorrow** under the dates set it in one click. **Ending** stays optional (placeholder "No end").
   - With **Ending** set: the change is a named period. **Name** appears (with the existing name suggestion button) and works as in predecessor F-UW. A period is a schedule, and the Schedules tab shows it.
   - With no **Ending**: "This becomes your regular week: open …" (item 4) says so; the note "No end — this becomes the new regular week" shows only while no service has days, **Name** is not asked, and Save changes the regular week in place. No schedule or assignment is shown to the Manager or named by them.
4. **Which days.** The days a change covers follow the editor, live. The line under the dates reads:
   - no **Ending**: "This becomes your regular week: open Tue–Sun." (a weekday no service runs on is closed from the start date; the line names it, "Monday is closed.");
   - with an **Ending**: "Applies to Tue–Sun. Other days keep their hours." (a weekday no service runs on in the period keeps the hours it has).
     If a weekday is run by something outside the regular week (a day a schedule the Manager made covers), the line names it and offers **Open Schedules**: "Sat–Sun use “Weekend”. Edit it on Schedules."
5. **Pre-fill rule.** For each service, the base hours are the hours most of its days share (a tie goes to the earlier day, Monday first). Each other set of hours becomes a block with those days. The shared Days is every day any service runs; a service whose days equal that follows it, any other service shows its own days. Blocks that already exist are open on arrival, so the Manager sees what differs.
6. **Preview.** The existing draft preview (S4) stays. Its focus date is the first date of the change that falls on the weekday the Manager is editing (the last block or day they touched); with nothing touched it is the first date, as today. Added and removed marks and the stranded list are unchanged.
7. **Save.** Button "Save hours from Nov 6". Toast without a name: "Regular week changed from Nov 6 · Undo"; with a period: "Summer hours from Jun 1 · Undo" (unchanged).
8. **Keyboard and discard** are unchanged: Escape, the backdrop and Cancel ask "Discard changes?" while the draft differs from the one it opened on.

### F11 (amended): Existing venue after migration (PRD 7)

1. The one-time banner stays: "Your hours were carried over. Nothing changed for guests."
2. Day-named schedules the migration made read as part of the regular week. Cells in the calendar say "Regular week" (the same label a one-schedule venue shows), the day drawer's "Why this day" shows "Regular week · <the day's services>" with no "Thu–Fri hours", and Change regular week reads them as base hours plus blocks (F-UW 5). The Schedules tab is shown only while the venue has a schedule that is not part of the regular week.
3. A schedule the Manager made on purpose with dates (Summer hours) is not part of the regular week and keeps its name everywhere.

### F3 (amended): Schedules (PRD 5)

A saved period can carry different days and different hours (F-UW 3), so **New schedule** and **Edit** use the same service rows as quick setup, with the same two buttons. **Use on** stays the schedule's own weekdays and dates; a service's own days sit inside them. Everything else in F3 stands. **Compare services** (F-X) shows a service's base hours with "+ different hours" where a schedule has blocks, and the edit opens that schedule's Edit (see Deliberately not designed).

### F2 (amended): Read a day, then change it (PRD 6, 9)

Only these lines of predecessor F2 change.

1. **Scope select, third option.** For a day on the regular week it reads "Every regular Friday → 41 future dates" and means that weekday's hours of the regular week. It never changes other weekdays. Changing all days at once is Change regular week's job.
2. **Why this day.** The regular week's line shows that day's services as first and last bookable time ("Regular week · Lunch 11:30 AM – 1:45 PM, Dinner 5:00 PM – 11:15 PM").
3. **Discovery nudge (step 7).** After the third one-off change to the same weekday: "Friday has had 3 one-off changes. **Make these Friday's regular hours**". One tap writes that day's hours into the regular week as different hours on that weekday. Toast "Friday's regular hours updated · Undo". It no longer makes a schedule.

### F-CAL (new): The calendar shows one regular week (PRD 6, 7)

1. Under the existing "This week: open 5 days · …" line (S2) a second line reads, for example, "Regular week: Lunch 11:30 AM–3:00 PM Mon–Fri · Dinner 5:00 PM–11:00 PM Tue–Sun, Fri–Sat until 12:00 AM (next day) · Brunch 10:00 AM–2:00 PM Sat–Sun". Each service gives its base hours, open to close. A set of different hours with the same opening says only its close ("Fri–Sat until 12:00 AM (next day)"); one whose opening moves says both ends ("Fri 6:00 PM–11:00 PM").
2. **Details ▾** opens the same seven rows as the Guest preview, read-only (no Party, no Updated tags), as the saved week. A uniform week reads "Regular week: Dinner 5:00 PM–10:00 PM Mon–Fri" and shows no Details disclosure.
3. The line is shown to Hosts too (view only). Only **Change regular week…** is Manager-only, as today.
4. On a phone the line is the first row under the toolbar; **Details** is collapsed.
5. In the month grid and the phone agenda, a closed day is flat with a dashed outline and a special-hours day carries an accent rule on its leading edge, so exceptions stand out among regular days; the label still names which.
6. Month cells and agenda rows name the day's services under the label ("Lunch · Dinner", "Brunch · Dinner"), so a weekday's services read at a glance; week cells list each service with its hours and carry no service count.

### F12 (amended): History (PRD 9)

A regular-week change is worded with its days: "Changed regular week from Nov 6: Dinner Fri closes 11:00 PM · by Ana". **Revert** works as for any change that told no guests.

### F-HOST (amended): What Hosts see (PRD 10)

Hosts see the regular-week line and Details (F-CAL) and nothing else new. They never see quick setup, Change regular week, or the nudge. Tonight changes (F7) are unchanged and apply to the day's resolved services.

## Screens

### S1 (amended): Quick setup, desktop

```
Availability
┌ Set your regular week ─────────────────────────────────────────────────────┐
│ Tell guests when you take bookings. You can change any day later.            │
│ ┌ Service 1 ───────────────────────────────┐ ┌ Guest preview ───────────────┐ │
│ │ [Lunch][Brunch][Dinner][Late]             │ │ What guests can book      │ │
│ │ Service name [Dinner        ]             │ │ Party [2 ▾]               │ │
│ │ Opens [5:00 PM] Last seating [9:15 PM]    │ │ Mon Lunch 11:30 AM–1:45 PM│ │
│ │ Closes [10:00 PM]                          │ │     Not offered: Dinner   │ │
│ │ Last seating 9:15 PM, 45 min before close │ │ Tue Lunch 11:30 AM–1:45 PM│ │
│ │ [Different days for this service]          │ │     Dinner 5:00–9:15 PM   │ │
│ │ [Different hours on some days]             │ │ …                         │ │
│ │ [Remove service 1]                         │ │ Fri Dinner 5:00–11:15 PM  │ │
│ └────────────────────────────────────────────┘ │     [Updated]             │ │
│ [Add another service]                          │ Sat …                     │ │
│ Days  [Weekdays][Weekends][Every day]          └───────────────────────────┘ │
│   ☑ Monday ☑ Tuesday ☑ Wednesday ☑ Thursday ☑ Friday ☐ Saturday ☐ Sunday   │
│                                          [Save and open bookings]            │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Purpose: set a working week, uniform or not, in one pass.
- The service row's two new buttons are ghost buttons, the least prominent controls in the row; the shared **Days** keeps its place and look.
- With **Different days for this service** open:

```
│ [Use the shared days]                                                       │
│ Dinner runs on  [Weekdays][Weekends][Every day]                              │
│   ☐ Monday ☑ Tuesday ☑ Wednesday ☑ Thursday ☑ Friday ☑ Saturday ☑ Sunday  │
```

- With every service on its own days, the shared field reads:

```
│ Days   Every service has its own days.                                      │
```

- Empty state: this card is the empty state for Availability (predecessor S1). The Guest preview starts at "Add a service with its times and days to see what guests can book each day."
- Loading state: the card is shown when the venue config has loaded. While the team role is loading the page shows the existing `Skeleton` (`AvailabilityPage.tsx:254-278`). The Guest preview's own loading state is in S12.
- Error state: unchanged. A server error shows the existing `Alert` at the top of the card; it takes focus; values are kept; the button reads **Retry**. A lost race shows "Someone else just changed availability. Try saving again to keep your week."
- Phone (≤ 767 px; the form's own stack breakpoint is 720 px): one column. Service rows stack. The day checkboxes wrap; every new button and checkbox has a target of at least 44 px. The Guest preview follows the **Days** field, before **Save** (S12 Phone).
- Copy (en-US):
  - Buttons: "Different days for this service", "Use the shared days", "Different hours on some days".
  - Legend: "{{service}} runs on". With no name yet: "Service {{n}} runs on".
  - Errors: "Choose at least one day for {{service}}." (new); existing issue copy otherwise.
  - Announcements: "Different hours added", "Friday moved from the other hours", "Hours for Fri removed".

### S13 (new): A different-hours block

```
┌ Different hours ─────────────────────────────────────────────────────────┐
│ New block, nothing ticked:  ☐ Tue ☐ Wed ☐ Thu ☐ Fri ☐ Sat ☐ Sun           │
│ (Dinner runs Tue–Sun, so Monday is not offered.)                              │
│ After ticking Fri and Sat:  ☐ Tue ☐ Wed ☐ Thu ☑ Fri ☑ Sat ☐ Sun           │
│ Opens [5:00 PM]  Last seating [11:15 PM]  Closes [12:00 AM]                  │
│ Closes 12:00 AM the next day                                                 │
│ [Remove these hours]                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Purpose: say which days of a service have other hours, and what they are.
- The day checkboxes offer only the days the service runs on; a day the service does not run on is not offered. Each block's fields are prefilled with the service's base hours when it is added, so the Manager changes only what differs. Last seating stays linked to the close until it is edited, as in the base row.
- A block whose hours match the service's base hours says "These match the other days. Remove them." as a hint; this is not an error.
- Accessible names: the block is a `fieldset` whose legend is "{{service}}: different hours". Its pickers are named "Opens", "Last seating", "Closes" like the base row; they exist in the DOM only while the block is open, so a closed block adds no duplicate names to the e2e's role queries.
- Empty state: a block with no days shows "Choose at least one day for these hours." after Save is attempted.
- Loading state: none; it is local state.
- Error state: field-level messages as in the base row, plus "Dinner overlaps Brunch on Saturday." and the 16-hour span message.
- Keyboard: Space toggles a day; Tab moves day to day then to the pickers; **Remove these hours** returns focus to **Different hours on some days**.

### S12 (new): Guest preview strip

```
┌ Guest preview ──────────────────────────────┐   desktop: right column, sticky
│ What guests can book, party of [2 ▾]       │
│ First and last time a guest can book.      │
│ ─ Monday ──────────────────────────────── │
│   Lunch   11:30 AM – 1:45 PM               │
│   Not offered: Dinner                      │
│ ─ Tuesday ─────────────────────────────── │
│   Lunch   11:30 AM – 1:45 PM               │
│   Dinner  5:00 PM – 9:15 PM                │
│ ─ Friday ──────────────────────── Updated  │
│   Lunch   11:30 AM – 1:45 PM               │
│   Dinner  5:00 PM – 11:15 PM               │
│ ─ Saturday ────────────────────── Updated  │
│   Brunch  10:00 AM – 1:15 PM               │
│   Dinner  5:00 PM – 11:15 PM               │
│ ─ Sunday ──────────────────────────────── │
│   Brunch  10:00 AM – 1:15 PM               │
│   Dinner  5:00 PM – 9:15 PM                │
│ Late isn't shown yet: choose a time.       │
└────────────────────────────────────────────┘
```

- Purpose: see the week the way a guest would book it, and catch a wrong week before saving.
- Structure: a region ("Guest preview") with a list of seven items. Each item's accessible name reads "Friday: Lunch 11:30 AM to 1:45 PM, Dinner 5:00 PM to 11:15 PM, updated". Rows are text, not buttons, so no control named "Dinner" is added to the card. Tags carry text ("Updated"), never colour alone.
- Times: 12-hour. A last seating after midnight reads "12:15 AM (next day)".
- States of one row: runs (lines), runs but no table fits ("Runs, but no table fits a party of 2."), not offered ("Not offered: Dinner"), no service ("Closed").
- Empty state (no complete service): "Add a service with its times and days to see what guests can book each day." Seven rows are not drawn. Complete services with no days anywhere: "Choose days to see your week." (F-STRIP 2).
- Loading state: the first answer shows seven rows of `Skeleton` text lines. Later answers keep the last rows, dimmed, with `aria-busy="true"`, until the new answer lands (the existing preview's dimmed-while-loading pattern, `AvailabilityGuestPreview.tsx:393-402`). A slow answer (503) reads "Preview is taking longer than usual".
- Error state: "Preview unavailable", help "You can still save; the bookings check runs again when you do.", **Check again** (not `disabled` while fetching, as the existing preview's Retry, so focus is kept; named differently so the card never has two buttons called "Retry" after a failed save), and the local rows under "These are the hours you typed, not checked against your bookings."
- Local mode (wizard): title "Guest preview", subtitle "From the hours you typed", no **Party**, no request, the rows from the typed hours only, no tags.
- Phone: the same list sits inline below **Days**, one line per day; each day's lines wrap. No pinning. The **Party** `Select` is full width.
- Keyboard: **Party** is the only stop besides **Check again**. The list is read in order by a screen reader. Its live region (polite) says "Friday, Saturday updated" once per answer.

### S2 (amended): Calendar, regular-week line

```
Availability   [Calendar] Special dates  Schedules*        ⋯ History · Go to date · Create another schedule
This week: open 5 days · 1 closure · online booking on                          Venue time (Pacific)
Regular week: Lunch 11:30 AM–3:00 PM Mon–Fri · Dinner 5:00 PM–11:00 PM Tue–Sun, Fri–Sat until 12:00 AM (next day) · Brunch 10:00 AM–2:00 PM Sat–Sun   [Details ▾]
[◂] October 2026 [▸] [Today]   (Month|Week)  Services [All ▾]  [Select… ▾] [Change regular week…] [Close…]
┌ Mon ──── Tue ───── Wed ───── Thu ───── Fri ───── Sat ───── Sun ─────┐
│ Regular week  Regular week  …                                        │
│ Lunch         Lunch · Dinner …                                       │
```

- Purpose: show the saved week as one regular week and lead to Change regular week.
- Details open:

```
Regular week
  Monday     Lunch 11:30 AM – 1:45 PM
  Tuesday    Lunch 11:30 AM – 1:45 PM · Dinner 5:00 PM – 9:15 PM
  …
  Friday     Lunch 11:30 AM – 1:45 PM · Dinner 5:00 PM – 11:15 PM
```

- Empty state: never; the venue has no hours, so S1 shows instead (predecessor S2).
- Loading state: the line is part of the page's existing grid `Skeleton`; it renders when the config loads.
- Error state: the page `Alert` "Couldn't load availability · Retry" (existing). The line is omitted.
- Phone: the line is one row; **Details** is collapsed.
- Cells for regular-week days read "Regular week" (as for a one-schedule venue today) with the day's services named beneath. A dated schedule keeps its name.

### S3 (amended): Day drawer scope

```
── You're changing: [This date only ▾] → 1 date ───────────────
   This date only → 1 date
   Fridays from Oct 30 [until: no end ▾] → 9 dates
   Every regular Friday → 41 future dates
```

- Purpose: unchanged (predecessor S3). Only the third option's wording and meaning change (F2 1).
- Empty, loading, error: unchanged.

### S14 (amended): Change regular week, desktop

```
┌ Change regular week ────────────────────────────────────────────────── [✕]┐
│ Starting [Nov 6 ▾]   Ending [No end ▾]     [Start today] [Start tomorrow]    │
│ Days  Mon–Sun [Change days]                                                  │
│ This becomes your regular week: open Mon–Sun.                                │
│ (Name [            ] [Use “Summer hours”]  shown only when Ending is set)   │
│ Applies to 56 future dates                                                  │
│ ┌ Dinner ─────────────────────────────────────────────────────────────────┐│
│ │ Opens [5:00 PM]  Last seating [9:15 PM]  Closes [10:00 PM]               ││
│ │ [Different days for this service]  [Different hours on some days]        ││
│ │ ┌ Dinner: different hours ──────────────────────────────────────────────┐││
│ │ │ ☐ Mon ☐ Tue ☐ Wed ☐ Thu ☑ Fri ☐ Sat ☐ Sun                              │││
│ │ │ Opens [5:00 PM] Last seating [10:15 PM] Closes [11:00 PM]               │││
│ │ │ [Remove these hours]                                                    │││
│ │ └─────────────────────────────────────────────────────────────────────────┘││
│ │ ┌ Dinner: different hours ──────────────────────────────────────────────┐││
│ │ │ … Sat, Closes [12:00 AM] · Closes 12:00 AM the next day …               │││
│ └─ [Add another service] ─────────────────────────────────────────────────┘│
│ ── Guest preview · Draft, not saved (existing S4) ──────────────────────── │
│ ◂ Fri 6 Sat 7 Sun 8 … ▸   Compare with (●) Last saved ( ) Regular week      │
│ 1 time removed · 0 reservations affected                                    │
│ …                                                                            │
│ [Cancel]                                                [Save hours from Nov 6]│
└──────────────────────────────────────────────────────────────────────────────┘
```

- Purpose: change a service's days or hours for one weekday (or several) without learning schedules.
- The editor in the drawer is the same component as S1's service rows, in the drawer's wide layout. The shared **Days** sits above the services as a summary, "Days: Mon–Sun", with **Change days**, which opens the same shortcuts and checkboxes. The line under the dates follows the editor (F-UW 4).
- Empty state: a venue with no regular week never opens this drawer (S1 shows). With services removed the existing blocked reason says "Add a service to save."
- Loading state: the drawer opens with the config already loaded. The existing preview's states (dimmed while loading, "Preview unavailable · Retry") apply.
- Error state: existing `SaveFailure` at the top of the drawer; values kept. A change made since the drawer opened opens the existing conflict review panel.
- Phone: full-screen drawer (`size="full"`); the same stack as S1 on a phone; the preview is below the services as today; the footer buttons stay pinned.
- Why-Save-is-off lines (existing `BlockedReason`): "Choose a start date to save." first, then "The end date is before the start date.", then (period only) "Name this period to save." (new wording; the existing line says "schedule"), then "Add a service to save." — the same order as `scheduleSaveBlock`, with the name line skipped when no Ending is set.

## Walkthrough re-check

Each walkthrough is re-walked using only the controls defined in Flows and Screens.

- **W1.** Step 1 S1 with the Guest preview (S12). Step 2 the **Lunch** chip (existing). Step 3 shared **Days → Every day** (existing). Step 4 **Different days for this service → Weekdays** (F1 3; S1). Step 5 **Add another service** (existing), **Dinner** chip. Step 6 **Different days for this service**, untick **Monday** (F1 3). Step 7 **Different hours on some days** (F1 4; S13), tick **Friday** and **Saturday**, **Closes** 12:00 AM; the overnight hint (F1 7); the **Updated** tag (F-STRIP 4). Step 8 as step 4 for Brunch with **Weekends**. Step 9 **Save and open bookings** (existing), then the calendar line (F-CAL 1). Completes.
- **W2.** **Dinner**, **Weekdays**, **Save and open bookings**: all existing; nothing new is in the path (F1 2). Completes in 3.
- **W3.** **Change regular week…** (existing), **Starting** (existing), no **Ending**, no **Name** (F-UW 3), the existing block "Fri, Sat · closes 12:00 AM" (F-UW 5), **Different hours on some days** (S13), tick **Friday** with the move announcement (F1 6), **Closes** 11:00 PM, the preview's date strip (existing; focus per F-UW 6), **Save hours from Nov 6** and the toast (F-UW 7). Completes.
- **W4.** The carried-over banner (F11 1), the "Regular week" cells and the absent Schedules tab (F11 2), **Change regular week…**, the block "Thu, Fri · closes 11:00 PM" pre-filled (F-UW 5), **Closes** 11:30 PM, Save. Completes.
- **W5.** The overnight hint and the last seating at 12:15 AM (F1 7; S12 Times); the 16-hour message (existing issue copy). Completes.
- **W6.** The four states are in S12. Completes.

## Story coverage

Every PRD story with a UI surface is reachable:

- **1** → F1 (3), W1. **2** → F1 (4), S13, W1. **3** → F1, W1. **4** → F-STRIP, S12, W1, W6.
- **5** → F-UW, S14, W3. **6** → F-CAL, S2, S3, F2 (amended), S4 (existing). **7** → F11, F-UW (5), W4. **8** → F1 (2), W2.
- **9** → F12 (amended) and the existing undo toast on every save. **10** → F7 (unchanged, Host view in F-HOST).
- **11** → the Guest sees nothing new; the strip and the guest preview show the Manager what the Guest will be offered (F-STRIP 7). The Guest's own flow, F9, is unchanged.
- The agent's availability chat tools (#7920) have no screen in this run; their criterion is Architect's and Verify's.

## Conventions to match

- The predecessor's conventions bind: rialto components only (`Drawer`, `Alert`, `Toast` with Undo, `Select`, `TimePicker`, `Checkbox`, `Tag`, `Skeleton`, `Card`, `Button`), `--rialto-*` tokens in CSS Modules, no inline styles (`.claude/rules/ui-quality.md`).
- Focus and announcements: focus moves to the first invalid field; a disclosure moves focus in and returns it on close; additions, removals and moves are announced politely; Escape in a nested picker closes only that picker.
- Errors show `describeApiError(error).detail` in `role="alert"`; a quick-setup error takes focus (`QuickSetupCard.tsx:62-68`).
- The uniform path's DOM must not gain duplicates of the controls the e2e addresses by name ("Weekdays", "Dinner", "Opens", "Closes", "Last seating", /name/i): every new control sits behind a closed disclosure, and the strip's rows are text.
- Times are 12-hour; a past-midnight time reads "(next day)". Weekday names come from the active locale, never a hand-kept list (`QuickSetupForm.tsx:35-36`).
- Breakpoints: the form stacks at 720 px (`QuickSetupForm.module.css:77-82`), the viewport hook's phone is ≤ 767 px (`useViewport.ts`), the predecessor's is 1024 px for the drawer layout. New components use the viewport hook the surrounding component already uses.
- Copy: en-US here; es-MX and fr-CA in Implement, with the locale-parity check.

## Dependencies surfaced for Architect

- **Per-weekday data model (#7738).** The editor and the draft need to read and write, for the regular week: per-service days and per-weekday hours for one service (several sets of hours across its days). Today `draftToConfig` writes one schedule, one assignment with all days, one row per service (`quick-setup-draft.ts:294-337`) and `draftToChanges` clears the old rows (`:344-373`); neither can express the demo week. The period case in Change regular week uses the same editor and builds a dated schedule (`schedule-changes.ts:257-…`), so a period needs the same per-weekday hours.
- **One regular week, including migrated venues (PRD 7).** UX requires that day-named, undated, migration-made schedules (`legacy-migration.ts:281`, `kind: "alternate"`) read as the regular week in the calendar's cells and "Why this day" (`day-summary.ts:13-34`), in Change regular week's pre-fill (F-UW 5), and in the Schedules tab's visibility. Open: whether undated schedules a Manager made on purpose (for example "Weekend") also fold in. UX assumes they do not and shows them under F-UW 4's "Open Schedules" line. This decides `Closes #7738` versus `Refs #7738`.
- **A change in place with no schedule (PRD 5).** With no end date the editor changes the regular week without showing a schedule. Today the builder creates a new regular schedule and renumbers precedences (`schedule-changes.ts:257-…`) and the drawer requires a name (`ChangeRegularWeekDrawer.tsx:245-252`, `schedule-changes.ts:85`). The name is dropped when there is no end (F-UW 3); what the stored change looks like is Architect's. The undo and History wording (F12) need a description of a weekday-level change.
- **The strip's data (the Showstopper's riskiest piece).** The strip needs, per weekday, each running service's name and first and last bookable time, for an unsaved week with no saved hours. The preview returns a 30-day window of per-date `added` minutes with no service names, and the full service list for the focus date only (`availability-config-api.ts:535-553`); `before` is the saved config (`availability-preview.ts:92-110`). Options for Architect: seven requests (one per weekday date), one request plus an extension that returns services per date, or a new mode. Whether the endpoint answers at all for a venue with no saved hours is unverified; the strip's error state degrades to local rows if it cannot (S12).
- **Strip honesty and cost.** The strip's per-weekday times must equal the guest preview's after save (PRD). Today the guest-facing service lines say opening to closing (`AvailabilityGuestPreview.tsx:301-309`; the calendar's day lines, `day-summary.ts:56-66`) although `lastSeatingAt` is in the data (`availability-config-api.ts:318-324`). This spec uses first to last bookable time for every owner-facing "what a guest can book" line (Voice & terms), so those two lines change to match; without that the e2e comparison of the strip with the preview would compare a last seating with a close. The first-view bar is the existing debounce; the constant is private (`AvailabilityGuestPreview.tsx:35`) and the quick-setup form has no preview request or debounce (`QuickSetupForm.tsx:214-244`), so the PRD's wording "the form's existing preview debounce" refers to this component. Seven requests per settled edit are a cost to weigh. Times are filtered to tables that fit the party only when the venue has active tables (`availability-preview.ts:108`); the row "Runs, but no table fits a party of 2" needs to tell that apart from "service not offered".
- **Draft preview focus.** The change's preview focus date is always the first date (`DraftPreview.tsx:86`); F-UW 6 needs a focus date input for the weekday being edited.
- **Covered weekdays follow the draft (F-UW 4).** `regularWeekdays` reads the stored regular schedule's assignments (`schedule-changes.ts:241-249`, used at `ChangeRegularWeekDrawer.tsx:102-105`), and the drawer's "Applies to" line is fixed text. F-UW 4 needs the covered days, the line, the impact count and the preview dates to follow the days the edited services run on: a day added is opened, and with no end a day no service runs on is closed from the start date.
- **Schedules tab editors and Compare services (F3 amended).** A varied period saved from Change regular week must be editable afterwards, so New schedule and Edit schedule use the same service rows (`ScheduleEditorDrawer.tsx` today renders the uniform `ServicesEditor` and a Use-on `WeekdayToggles`, `:254`). Compare services (`CompareServices.tsx`, F-X) is a grid of one service's fields per schedule; Architect decides how a schedule with different hours shows there. UX only requires "base hours + different hours" and that the edit lands in Edit schedule.
- **Period copy.** `availabilitySchedules.blocked.nameRequired` reads "Name this schedule to save." and shows in Change regular week's period case; UX words it "Name this period to save." there.
- **Day drawer and nudge (F2 amended).** "Every regular Friday" must write only that weekday's hours; the nudge (`ScheduleNudge.tsx:26-63`) must write the weekday's hours into the regular week instead of making a schedule. Flagged because the PRD names neither surface.
- **Onboarding wizard.** The wizard sends one window per day, derived from the draft (`quick-setup-draft.ts:388-396`; `QuickSetupHoursStep.tsx:21-26`). A varied week (several services on different days, different hours on some days) is lossy through it: services on a day merge into earliest open to latest close, as today for several services. Architect decides whether the projection is acceptable or the wizard hides the new controls. UX shows them and flags this.
- **Validation per day.** Overlap and span checks run per weekday, with the day named in the message ("Dinner overlaps Brunch on Saturday."). New issue codes and copy.
- **Existing e2e constraints.** `availability-quick-setup.spec.ts` and `availability-dead-ends.spec.ts:281-300` select by accessible name; the new design keeps their paths unchanged, and Architect and Implement must not break them. `availability-quick-setup.spec.ts` does not mock the preview endpoint (no "preview" in the file), so the strip lands in its error state there ("Preview unavailable"); the three-activation path and the saved body are unaffected, and the card's own error `Alert` must not be confused with the strip's.
- **Copy.** New keys in en-US, es-MX and fr-CA: the buttons, legends, errors and announcements in S1, S12, S13, F-CAL and F12; the toast "Regular week changed from {{date}}" and the nudge text. Locale-parity check applies.

## Deliberately not designed

- A strip in Change regular week. The PRD places it beside quick setup; Change regular week keeps its existing draft preview with added/removed marks, whose focus now follows the weekday being edited (F-UW 6). The reason: one weekday's change is verified by a dated before/after, and a second per-week view would duplicate S4.
- A strip in the new-venue wizard from the engine. The venue does not exist, so there is nothing to preview against; the wizard gets the local rows (F-ONB).
- A phone strip that stays on screen while typing (pinned bar or sheet). The strip is below the form on a phone. Reason: the Showstopper's full effect is on a desktop-width form; a pinned strip needs a design pass of its own.
- Per-day hours in the Compare services grid beyond "base hours + different hours" (F3 amended; Architect decides the grid's cells).
- A week-at-a-glance editor (a seven-column grid to edit all services by weekday). Quick setup and Change regular week stay service-first.
- Copying one day's hours to other days inside the editor (a block is the way to do this).
- A seven-column "week grid" for the preview in Change regular week (the existing date strip and added/removed marks stay).
- #7981, #7984, #7983 leftovers and the agent chat tools' UI (out of scope per the PRD).

## Review

- Review: independent. A fresh reviewer subagent (`UxStage.UxReviewer`, its own context) was given `idea.md`, `prd.md`, `ux.md`, the predecessor `ux.md` and the Code facts paths, and asked for Critical and High findings only. It found 0 Critical and 7 High, after reading 38 of the cited code locations. Each is dispositioned below; the walkthroughs were re-walked after the fixes (Walkthrough re-check).
- **H1.** The strip, F2 2 and S4 used different quantities (last seating versus close), so the PRD's "strip equals the preview" could not be tested — fixed: Voice & terms fixes one convention (first and last bookable time) for every owner-facing "what a guest can book" line; F2 2's example corrected; F-STRIP 7 says S4 and the calendar's day lines change to match; Dependencies "Strip honesty and cost" records the two lines (`AvailabilityGuestPreview.tsx:301-309`, `day-summary.ts:56-66`) that must change.
- **H2.** The Days controls in Change regular week had no defined effect, and a "Deliberately not designed" bullet contradicted them — fixed: F-UW 4 now defines the covered days as following the editor, live, with the line wording for no end and for a period; S14's sketch shows the Days summary and the live line; the contradicting bullet is removed; Dependencies records that `regularWeekdays` must follow the draft.
- **H3.** A varied period saved from Change regular week had no editor afterwards — fixed: F3 (amended) makes New schedule and Edit schedule use the same service rows; Compare services is recorded under Dependencies and Deliberately not designed; the "dated schedules keep the uniform editor" bullet is replaced.
- **H4.** The strip's states conflicted with each other, and the S12 and S13 sketches contradicted W1 and F1 9 — fixed: F-STRIP 2 defines three disjoint states from one rule (complete, placed); the S12 sketch's footer names a service not shown (Late) instead of a shown one (Brunch); S13's sketch starts a new block with no day ticked and W1 step 7 says so.
- **H5.** Term drift (Guest view, Your week, Guest preview; "schedule" in the period case) — fixed: one title, "Guest preview", everywhere (Voice & terms, S12, wizard local mode), the existing "Preview unavailable" / "Preview is taking longer than usual" copy reused, and "Name this period to save." proposed for the period case (Dependencies, S14).
- **H6.** Two buttons named "Retry" after a failed save — fixed: the strip's button is "Check again" (F-STRIP, S12, W6, F1 9); the card's primary button keeps "Retry".
- **H7.** Two Code fact line numbers past end of file — fixed: `DraftPreview.tsx:86` and `:50-70`; `useAvailabilityPreview.ts:38` (Code facts and Dependencies). The reviewer's suggested `:41` for `retry: false` was checked against the file and `:38` is the line.
