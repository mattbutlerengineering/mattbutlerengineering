---
stage: ux-design
run: feature:availability-setup-hierarchy
date: 2026-11-07
amended: 2026-11-08
assumptions:
  - "Unattended run: the skill asks to confirm the walkthrough list and each sketch with the user; the Owner is not available, so the list and sketches are the stage's own, drawn from idea.md and prd.md (the Owner's two kill-test questions, 'where to change Friday's hours' and 'block the bar for one date', are walkthroughs W2 and W3). The Owner can veto at the UX approval gate."
  - "No docs/ux-patterns.md exists in the repo; the skill calls it a suggestion, not a gate. Conventions come from venue-availability ux.md (Voice & terms, Surfaces) and the code facts below."
  - "Navigation decision (PRD open question, UX's call): one nav item, 'Venue Setup' at /setup, replaces the 'Floor Plans' item and the pre-launch step items; 'Availability' stays as the calendar page. Daily calendar work keeps its one-click entry; the structure lives on the hub. The Owner can veto."
  - "One-schedule venue (PRD open question): the schedule is shown as its own node, captioned 'Schedule', named 'Regular week'. This deliberately relaxes venue-availability ux.md 'the word schedule appears only after a venue has two of them' for the setup hub and the always-shown Schedules tab; calendar, day drawer and quick setup keep that rule. PRD criterion 1 requires the level to be visible."
  - "Glossary (PRD criterion 5): 'Venue Setup', 'Availability', 'Floor Plan', 'Regular week', 'Schedule', 'Service', 'Special dates', 'Booking', 'Section', 'Table'. Retired in UI: 'Operating Hours', 'Set Operating Hours', 'Create Floor Plan', 'Get Started' as a destination name, 'location' (for a section), 'area', 'zone', 'channel'. Nav and page titles keep the existing nav catalog's Title Case; node labels and buttons use venue-availability sentence case."
  - "Tonight grouping (PRD open question): UX proposes grouping by floor-plan section, with a 'No section' group, replacing free-text location. Architect decides the mapping; the design below works if grouping stays on location, as long as the label says 'Section' only where it is a section."
  - "Section close target: UX adds 'One section' to the Close dialog 'What' choices next to 'One service'. Whether storage is a section target or a rule over the section's tables is Architect's; the UI names the section either way."
  - "The hub shows the saved regular week with the existing `RegularWeekLine` (takes `AvailabilityConfig`). `RegularWeekStrip` (the guest-view strip) takes a draft and stays in quick setup and onboarding launch; the PRD criterion 9 wording 'the guest-view strip shows the result' is met in the quick-setup flow before save, not as a hub element. Flagged for the Owner."
  - "Sections can be created only by room templates today and a table cannot be put in a section in the editor (code facts). UX designs the smallest table-section control and an optional Add section, and records the tension with the PRD out-of-scope line 'A new editor for any resource type' under Dependencies surfaced for the Owner and Architect; the W1 fixture uses template sections (Main Dining, Bar) so it does not depend on them."
  - "PRD criterion 2 'one primary editor' is read as one form (`QuickSetupForm`) in three frames for weekly hours; the onboarding wizard keeps rendering it because it cannot link to a venue that does not exist yet. The reading is flagged for the Owner."
  - "Review ran independently (fresh reviewer subagent); findings and dispositions are under Review."
  - "Amendment 2026-11-08 (PRD criteria 14-24): the Owner delegated ('make the ux easy for them and use our scenarios to support'), so the walkthrough list W10-W22 and the S-Avail2 sketch are the stage's own, drawn from the PRD scenario table and a rendered walkthrough of today's screens (mocked e2e venue, 1280x900, screenshots 2026-11-08). The Owner can veto at approval."
  - "Amendment layer names reuse today's three tab names (Schedules, Calendar, Special dates) so no new vocabulary is taught; only the order and the default change. 'Week' was rejected as a layer name because the calendar already has a Month | Week switch."
  - "Amendment PRD corrections made at this stage, each recorded in prd.md in place: criterion 15 first-paint budget 6 → 7 (a visible **Add a schedule…** is how a one-schedule Manager learns schedules exist, criterion 19); criterion 21 phone budget 1 → 2 (a 375 px header cannot hold both night-of buttons beside the layer control; today's phone menu already costs 2); criterion 22 Hosts keep today's page (Calendar and Special dates read-only, no Schedules layer) instead of a new read-only Schedules layer; scenario budgets S5 5 → 6 and S7 6 → 8 (measured on the existing Close dialog: Close…, One date, Date, the day, Next, the primary = 6)."
  - "Amendment time display (PRD criterion 16, open question): a service reads '{open}–{close}, last seating {last}' everywhere a configured service is described; the guest preview keeps showing bookable times under its own label ('First and last time a guest can book'), which is a different fact, not a different format."
---

# UX: Availability setup hierarchy

Extends venue-availability `ux.md` (Voice & terms, Surfaces, Flows) and availability-config-usability (ADR-031: regular week, service days, per-day hours). Contradicts neither ADR-029 nor ADR-030. The one deliberate change to an earlier rule is the schedule node for a one-schedule venue (assumptions above).

**Amendment (2026-11-08).** Supersedes S-Avail below with S-Avail2 and adds W10-W22, F6-F8, S-Onb and the service time rule. The hub (S-Hub), nav, Close dialog, Tonight and floor plan screens are unchanged by the amendment.

## Scenario walkthroughs

Each is walked below using only controls this document defines. Controls are named in **bold** as they are defined under Screens.

### W1. New Manager, empty venue, two-service varied week and one blocked section (PRD criteria 3, 4, 9)

- Actor and goal: a Manager with an empty venue wants to say what each resource type is and set up a two-service varied week, then block the Bar for one date, in 5 minutes or less.
- Steps:
  1. Opens **Venue Setup** from the nav. Every node shows the state "Not set up" and a one-line "what this is".
  2. On **Regular week**, presses **Set up regular week**. This opens the existing quick-setup card on Availability (S1), unchanged.
  3. Fills Lunch and Dinner with different days per service (the `availability-quick-setup.spec.ts` varied-week scenario) and presses **Save and open bookings**. Lands on the Availability calendar, as today.
  4. Returns with the nav item **Venue Setup**. Regular week now reads "Open Tue–Sat", two **Service** rows read Lunch and Dinner with their days; the saved regular-week line shows the week.
  5. On **Floor plan**, presses **Add floor plan** and picks a room template that carries sections (for example Main Dining and Bar, `room-templates.ts`) in the existing new-floor-plan dialog. Sections exist only through templates today (code facts), so the fixture uses template sections; custom section names need the new control recorded under Dependencies surfaced.
  6. Back on Venue Setup, the **Bar** section row reads "Bar · 6 tables". Presses **Close for a date…** on that row.
  7. Lands on the Availability Calendar tab with the Close dialog open (the toolbar's **Close…** dialog), "What" set to One section: Bar. Picks the date, presses the existing confirm.
  8. Venue Setup's Special dates node lists "Thu, Dec 24 · Bar closed" with the section's name.
- Result: completes. The varied-week part (steps 2–3) is the same interactions as today, plus one navigation (step 1 to 2) that today's nav item "Set Operating Hours" did not need; PRD criterion 3 counts interactions from the editor open, as `availability-quick-setup.spec.ts` does. If the count is taken from the app's first screen, the hub adds one click; recorded under Deliberately not designed with the mitigation (a pre-launch empty venue's `/setup` shows the first unset node's button as the primary action).

### W2. Manager with one schedule changes Friday's hours (the Owner's first kill-test question; PRD 1, 2, 7)

- Actor and goal: a Manager whose venue has only the regular week wants Friday to close at midnight, once, then forever.
- Steps:
  1. Opens **Venue Setup**. The tree shows Schedules → **Regular week** → services with days. Friday's service reads "Dinner · Tue–Sat".
  2. For one Friday: the one-date path is Availability calendar → that Friday's day drawer (existing). The hub row **Special dates** says "One date that differs from the schedule? Open the calendar." and its **Open calendar** button goes there.
  3. For "every Friday from now": on **Regular week**, presses **Change regular week…**, which opens the existing drawer (F-UW).
- Result: completes. The hub names both paths on the nodes that own them, so the Manager does not search pages.

### W3. Manager blocks the bar for one date, where the venue's tables have free-text locations that disagree with its sections (PRD 4, 5, 6; Open question 2)

- Actor and goal: close the Bar on Dec 24 only.
- Steps:
  1. Opens **Venue Setup**, finds section row **Bar** under Floor plan, presses **Close for a date…**.
  2. Close dialog opens with "One section: Bar" preselected; picks date Dec 24; confirms.
  3. The calendar's Dec 24 day drawer lists "Bar closed", by section name, not by table list. Tonight's table picker lists sections by name for the same room.
- Result: completes for sections. Tables that have a section but a different free-text location are grouped under their section everywhere; a table with no section appears in a **No section** group on Venue Setup and Tonight, with a **Move to a section** link to the floor plan editor (only if the table-section control in Dependencies surfaced is built; otherwise the group shows with no link). The disagreement is shown, not hidden. How the mapping is stored is Architect's.

### W4. Manager with a Summer-hours schedule compares services and edits one (PRD 1, 2, 7)

- Actor and goal: a venue with Regular week and Summer hours wants to see which services belong to which, compare them, and edit Summer hours.
- Steps: Opens **Venue Setup**; Schedules lists both schedules, each with its services and where it applies; presses **Compare services** on the Schedules group header (opens the existing Compare services); presses **Edit** on Summer hours, which opens the existing Schedule editor (S-SE).
- Result: completes. The Schedules tab is now always shown to a Manager, so the Edit and Compare entry points exist on both surfaces as links to the same components, not copies.

### W5. Host opens Venue Setup (PRD 10, 9)

- Actor and goal: a Host wants to see how the venue is set up.
- Steps: Opens **Venue Setup**. Sees the tree with values and counts. No **Set up**, **Edit**, **Change regular week…**, **Close for a date…**, **Add floor plan** or **Booking rules…** button is rendered. Unset nodes read "Not set up. A manager sets this up." View-only links read **View calendar** and **View floor plan**.
- Result: completes. Dependency: floor-plan pages are not role-gated today (code facts); recorded under Dependencies surfaced.

### W6. Old links, bookmarks and the readiness redirect (PRD 8)

- Actor and goal: a Manager opens `/setup/hours`, `/availability`, `/floor-plans`, `/setup`; an unready venue opens `/timeline`.
- Steps: `/setup/hours` still goes to `/availability`. `/availability` and `/floor-plans` render as today. `/setup` renders **Venue Setup** for ready and unready venues alike. An unready venue opening `/timeline`, `/reservations` or `/guests` is still sent to `/setup`.
- Result: completes. Change from today: an operational venue is no longer bounced from `/setup` to `/timeline`, because `/setup` is now the standing hub (Dependencies surfaced).

### W7. Pre-launch checklist and launch (PRD 3, 6, 8)

- Actor and goal: a Manager mid-onboarding wants to know what remains and finish.
- Steps: nav shows one item, **Venue Setup**, with a "1 of 3" count. Opens it. The **Setup progress** strip lists Venue basics, Regular week, Floor plan with Done / Next / Not yet; the Next one has the primary button. When all three are done the strip reads "Ready for reservations" with **Go to Timeline**.
- Result: completes. Venue basics keeps its own wizard at `/onboarding` (no review view exists, `SetupPage.tsx:17-21`); its row stays a static "Done" after completion.

### W8. Power user keeps every tool (PRD 7)

- Actor and goal: a Manager who uses Tonight, Compare services, History, Booking rules, Change regular week, Copy day and the guest view wants each still reachable.
- Steps: Tonight stays in the Timeline header (`TimelineTonight`, untouched). Compare services, Booking rules… and Change regular week… are buttons on Venue Setup nodes and keep their places on Availability. History and Go to date stay in the Availability overflow menu. Copy day stays inside the day drawer. The guest-view strip stays in quick setup and onboarding launch; the hub shows the saved regular-week line.
- Result: completes. No control is removed; "Where each existing control lives" lists where each one has its entry point.

### W9. Urgent block mid-service on Tonight (PRD 5, 6; venue-availability F-Tonight)

- Actor and goal: a Host or Manager stops bookings for the Bar tonight because the bar is shut for a private event.
- Steps: Timeline → Tonight → "Block tables" target list shows sections by name (Bar, Main Dining, No section), then individual tables under each; picks Bar.
- Result: completes, given Architect's grouping choice. If grouping stays on location, the list shows "Location" rows and does not use the word "Section" (glossary rule).

### Amendment walkthroughs (2026-11-08; PRD criteria 14-23)

Fixtures: **F-one** is the suite's one-schedule venue (`mockApi`: Lunch 11:30 open / 2:00 last seating / 3:00 close and Dinner 5:00 / 9:30 / 11:00, every day). **F-bistro** is `mockEmptyVenue` after `setUniformBistroWeek` (Lunch and Dinner presets, Mon–Fri). **F-dinner** is `mockEmptyVenue({ config })` with Dinner alone, every day. **F-close** is F-one plus the stateful closure mock now private to `availability-close.spec.ts` (`/closures` GET/POST and `/closures/impact`), lifted into `e2e/helpers/` so S5, S7 and S10 can use it; with no affected bookings unless a walkthrough says otherwise. Steps count Locator actions as `helpers/interaction-counter.ts` does; choosing a time is 2 (open the list, pick); a date picker is 2 (open, pick) plus 1 per month moved. Each starts on `/availability` first paint, counted after the role read settles.

#### W10. After onboarding, the same screen (PRD 14, 23)
- Actor/goal: a Manager who just saved Lunch and Dinner Mon–Fri in quick setup (`mockEmptyVenue`, `setUniformBistroWeek`) reloads `/availability`.
- Steps: none. The **Schedules** layer is selected; under **Regular week** the **week form** shows Lunch and Dinner with their times, Days Mon–Fri ticked, and the **Guest preview** beside it — the same form and preview the hours step showed.
- Result: completes in 0 steps. Opening **Calendar** and back returns to the same form.

#### W11 (S1, catalogue A1). Dinner 17:00–22:00 Tue–Sat on an existing week — budget ≤ 6
- Fixture F-one. Steps: Dinner **Closes** → 10:00 PM (2); Dinner **Different days for this service** (1); untick Sunday and Monday in "Dinner runs on" (2); **Save** (1). **6.**
- The footer reads "Changes apply from today, Sun, Nov 8." and "This becomes your regular week: open every day."; the stranded-bookings preview lists any booking outside the new hours; with none, Save lands and the undo toast says "Regular week changed from Nov 8".

#### W12 (S2, B7). Add lunch beside dinner — budget ≤ 5
- Fixture F-dinner. Steps: **Add another service** (1); **Lunch** preset (1); **Save** (1). **3.**

#### W13 (S3, B8). Brunch on weekends only — budget ≤ 6
- Fixture F-bistro (Lunch Mon–Fri, so Brunch 10:00–2:00 on Sat–Sun overlaps nothing). Steps: **Add another service** (1); **Brunch** (1); **Different days for this service** (1); **Weekends** in "Brunch runs on" (1); **Save** (1). **5.** On F-one (Lunch every day) Brunch would overlap Lunch on Sat–Sun and Save would stay blocked with "Brunch and Lunch overlap on Saturday" — that is the form's existing validation, not a gap.

#### W14 (S4, A4). Last seating earlier than close — budget ≤ 3
- Fixture F-one. Steps: Dinner **Last seating** → 9:00 PM (2); **Save** (1). **3.** Picking Last seating unlinks it from Closes, so the "… min before close" hint no longer shows (`QuickSetupServiceRow.tsx:155-161`).

#### W15 (S5, D21). Close all day on one holiday — budget ≤ 6
- Fixture F-close. Steps: header **Close…** (1); **One date** (1); **Date** (1); next month › (1); the day (1); the primary "Close Thu, Dec 24" (1). **6.** With no affected bookings step one's primary saves (`CloseDialog.tsx:430-437`). With affected bookings the primary reads **Next** and step two needs one decision per group before its primary: +2 or more, and over budget — recorded as the honest cost of a closure that touches guests, not designed away. The Close dialog is today's (S-Close); only its entry moved to the header.

#### W16 (S6, D23). Special hours on one date — budget ≤ 7
- Steps: **Calendar** (1); the date's cell (1); **Edit Dinner** in the day drawer (1); **Closes** → 1:00 AM (2); **Save** (1). **6.**

#### W17 (S7, E37). A week-long vacation — budget ≤ 8
- Fixture F-close. Steps: header **Close…** (1); **Date range** (1); **From** (2); **To** (2); the primary (1). **7** within one month, +1 per month moved. **Several dates** (one chip per date) is the wrong choice for a range and is not used.

#### W18 (S8, C16). Summer hours Jun 1 – Sep 15 — budget ≤ 10
- Fixture F-one. Steps: **Add a schedule…** (1) opens the schedule editor seeded from the regular week's services; **Name** "Summer hours" (1); **Starting** (2 + months moved) — the days now follow the regular week (every day) because they were untouched; **Ending** (2); Dinner **Closes** → 11:30 PM (2); **Save** (1). **9** plus month moves. Today's New schedule opens empty and "Start from your regular week" clears the days (`ScheduleEditorDrawer.tsx:89-92,117-118,411-416`), which would cost 11. Days are not seeded before a Starting date because a dateless schedule with days outranks the regular week on every day (`ScheduleEditorDrawer.tsx:86-88`). The new schedule appears under **Other schedules** with "Jun 1 – Sep 15, every day" and **Edit**, **Duplicate**, **Delete**.

#### W19 (S9, H74/H75). How far ahead and minimum notice — budget ≤ 5
- Fixture F-one. Steps: header **⋯** (1); **Booking rules…** (1); "How far ahead guests can book (days)" (1); "Minimum notice (hours)" (1); **Save** (1). **5.** The **Booking** line under the schedules updates to the new values.

#### W20 (S10, L107/E44). Pause online booking tonight — budget ≤ 3
- Fixture F-close. Steps: header **Pause online booking** (1); the dialog's primary (1). **2.** The page-level paused banner shows on every layer (it renders in the calendar branch only today; see Dependencies).

#### W21. Starting later (PRD 17)
- Actor/goal: a Manager wants the new dinner hours only from next Monday.
- Steps: edit Dinner in the **week form**; **Starting later…** (1) opens Change regular week with the edited draft carried over and **Starting** empty; pick the date (2); **Save hours from Nov 9** (1).
- Result: completes; the inline form returns to the saved week; the change shows in Calendar from Nov 9.

#### W22. Host (PRD 22)
- Actor/goal: a Host opens `/availability`. Result: the page is today's Host page — **Calendar** and **Special dates** only, read-only, no **Close…**, **Pause online booking**, **⋯**, or **Add a schedule…**.

## Code facts

- Nav labels by readiness — `apps/hospitality/src/nav-sections.ts:78-95,134-141`: a venue in setup gets "Get Started" with three items (Venue Basics → `/onboarding`, Set Operating Hours → `/availability`, Create Floor Plan → `/floor-plans`), locked unless completed or current. An operational venue gets "Manage": Floor Plans, Availability, Menus, Booking Widget. Same two resources, two names.
- Route labels — `DashboardLayout.tsx:50-69` `ROUTE_LABEL_KEYS`: `floor-plans`, `availability`, `setup`, `hours` are four keys; catalog values are "Floor Plans", "Availability", "Setup", "Operating Hours" (`i18n/catalogs/en-US.json` `layout.routes`).
- Readiness redirect — `DashboardLayout.tsx:82,146-175`: `OPERATIONAL_ONLY_PATHS = ["/timeline","/reservations","/guests"]` bounce a `setup`-status venue to `/setup`. An operational venue at exactly `/setup` is bounced to `/timeline`; `/setup/*` subpages are exempt (#4982).
- Setup page — `pages/SetupPage.tsx:9-60`: three steps, each with a static "Done" or CTA row; `onboarding` has `reviewPath: null`; the page itself also redirects to `/timeline` when `readiness.status === "operational"`. Step copy: "Set Operating Hours", "Create Floor Plan" (`setup.steps.*`).
- Routes — `main.tsx:277-293,367-368`: `floor-plans`, `floor-plans/:id`, `availability`, `setup`; `setup/hours` is `<Navigate to="/availability" replace />`. Availability tab state is page state (`AvailabilityPage.tsx:139` `useState("calendar")`), not a URL parameter.
- Schedules tab hidden for one schedule — `components/availability/AvailabilityScheduleControls.tsx:37`: `showSchedules = isManager && (hasOwnSchedules(state.config) || tab === "schedules")`. Without it a Manager sees "Create another schedule…" instead.
- Change regular week — `ChangeRegularWeekDrawer.tsx` and `AvailabilityScheduleControls.tsx:57-62`: a toolbar button on the calendar tab; edits the regular week from a start date until an optional end date; its message "Edit it on Schedules" refers to the Schedules tab.
- Schedules tab — `SchedulesTab.tsx`: lists schedules with usage text, Compare services, schedule editor drawer, delete.
- Close dialog — `CloseStepOne.tsx:153-166`: "What" is Whole venue / One service / Booking only (channels Online, Phone, Waitlist, line 42). There is no section choice.
- Booking rules — `BookingRulesDrawer.tsx`: venue-setting drawer, opened from Availability; days ahead, minimum notice, largest party online. Not a rule on the calendar.
- Tonight — `TonightControl.tsx:65,134,191-204,407`: block-tables targets are all, `location:<text>` groups from the free-text `Table.location`, or picked tables; table rows read "Name · location". Tonight sits in the Timeline header (`TimelinePage.tsx:610`, `TimelineTonight`), not on Availability.
- Floor plan — `pages/FloorPlanEditorPage.tsx:75-103,412-434`: the sidebar lists sections with table counts (`tables.filter(t => t.sectionId === row.id)`) and a floor-material picker; sections come from `useFloorPlanSections`. No role check appears in `FloorPlansPage.tsx` or `FloorPlanEditorPage.tsx`. (grep for `viewerRole`, `isManager`, `canEdit` returns nothing in either file.)
- Roles on Availability — `pages/AvailabilityPage.tsx:415,462,468-470`: `isManager = team?.viewerRole === "manager"`; `canAct` gates editing; Hosts view.
- Settings → Venue — `pages/SettingsPage.tsx:378`: "Operating hours" button goes to `/availability`.
- Regular-week guest strip — `RegularWeekStrip.tsx` (used by `QuickSetupForm.tsx` and `venue-onboarding/LaunchStep.tsx`) takes a `QuickSetupDraft` and builds a config from it (`applyChanges(EMPTY_CONFIG, draftToChanges(...))`); it is a draft preview. `RegularWeekLine.tsx` takes a saved `AvailabilityConfig` and renders the week as one line.
- Weekly-hours editors — `QuickSetupForm.tsx` is the one form; `QuickSetupCard`/`QuickSetupBlock` (empty venue), `ChangeRegularWeekDrawer.tsx` and `ScheduleEditorDrawer.tsx` are frames around it (they import it), and `venue-onboarding/launch-sequence.ts:264` saves the wizard's hours at launch.
- Sections — sections are created only by room templates (`components/floor-plan/apply-room-template.ts:161-169`, `FloorPlansPage.tsx:91-94`) and by the launch sequence; the floor-plan editor lists sections and sets floor material (`FloorPlanEditorPage.tsx:91-103,412-434`), has no add/rename section, and `TableDetailsForm.tsx:165-171` has a free-text `location` input and no section field.
- Special dates tab — `SpecialDatesTab.tsx:405-511`: Add opens `AddSpecialDatesSheet`, whole-venue closed or special-hours rows only. The Close dialog (`CloseDialog`/`CloseStepOne`) opens from the calendar toolbar (`availability.close.open` = "Close…") and the day drawer.
- e2e — `apps/hospitality/e2e`: `availability-*.spec.ts` (including `availability-quick-setup.spec.ts`, `availability-interaction-baselines.spec.ts`), `onboarding.spec.ts`, `floor-plan.spec.ts`, `floor-plan-status.spec.ts`. These assert today's nav names and routes; where an entry point moved they are updated deliberately (PRD criterion 12).

### Amendment code facts (2026-11-08)

- `pages/AvailabilityPage.tsx:147`: the tab starts at `entry.tab ?? "calendar"`; `:303` clamps a Host off `schedules`; `:340-361` swaps the whole page for `AvailabilityQuickSetup` while `source === "empty"`; `:264-272` moves focus to the calendar when quick setup's save swaps the card out.
- `components/availability/availability-entry.ts:4`: `AVAILABILITY_TABS = ["calendar", "special", "schedules"]`; `?tab=` is the hub's deep-link contract (#8488).
- `AvailabilityScheduleControls.tsx`: renders the Calendar | Special dates | Schedules segmented control and the **Change regular week…** button (Manager, calendar tab, not phone).
- `AvailabilityToolbar.tsx`: date navigation, Month | Week, ⋯ (History, Go to date, Booking rules…), Select…, **Close…**, **Pause online booking**; the phone branch folds them into one **More actions** menu.
- `ChangeRegularWeekDrawer.tsx:80,148-156`: `startsOn` starts `null` and `scheduleSaveBlock({ startRequired: true })` blocks Save until it is set; `:274-289` **Start today** / **Start tomorrow** set it in one click; `:184-213` save goes through `buildRegularWeekChanges` and `useScheduleSave`, offers undo, and closes; `:361-369` `DraftPreview` evaluates the change against real bookings (the stranded check); `:91-115` `useConflictReview` handles a colleague's newer save; `:349` renders `QuickSetupForm` with `inDrawer` (no guest-preview column).
- `QuickSetupForm.tsx:86-160`: one component for onboarding (`local`), quick setup, the drawer (`inDrawer`) and the schedule editor; without `inDrawer` it renders the `RegularWeekStrip` "Guest preview" column.
- `quick-setup-draft.ts` `draftFromConfig(config, makeId)`: the regular week as the form's draft, used by the drawer (`ChangeRegularWeekDrawer.tsx:55-56`).
- `SchedulesTab.tsx:118-197`: header **Compare services** and **New schedule**; one row per schedule with name, a "Regular week" tag, where it applies, **Edit**, **Duplicate**, and **Delete** (not for the regular week, disabled while used).
- Times: `RegularWeekLine.tsx:79-83,94` and `venue-setup/useSetupNodeText.ts:79-96` print `opensAt`–`lastSeatingAt` under the key `availability.regularWeekLine.hours` "{{open}}–{{close}}"; the day drawer prints open–close ("Lunch 11:30 AM – 3:00 PM"); `RegularWeekStrip` prints first–last bookable time under "First and last time a guest can book".
- Onboarding: `onboarding.hours.heading` is already "Regular week", intro "So guests know when you're open."; the step label is "Hours — When you're open" (`onboarding.steps.hours`); the launch review has no line naming where hours are changed later.
- Booking rules: `BookingRulesDrawer.tsx` is three `Input`s and Save; the Booking summary already exists on the hub ("Up to 30 days ahead · 1 hour notice · parties up to 12 online", `setup.hub`).

## Flows

### F1. Read the hierarchy (primary; PRD 1, 3, 6)

1. Manager (or Host) opens **Venue Setup** from the nav.
2. Reads two groups: "When you're open" (Schedules → services; Special dates; Booking) and "Where guests sit" (Floor plan → sections → tables). Each row says what it is, its state, and its one action.
3. Presses a row action to leave for the one editor. Pressing a row's name expands its children (disclosure), it never navigates.

### F2. Set up an empty venue (PRD 3, 4; W1, W7)

1. Opens Venue Setup. Every node shows the state "Not set up" and one line on what it is.
2. Presses **Set up regular week**; edits in quick setup on Availability; saves; returns by the nav item.
3. Presses **Add floor plan**; edits in the floor plan editor; returns.
4. Reads nodes that now show values. Pre-launch, the Setup progress strip updates and ends with **Go to Timeline**.

### F3. Change something later (PRD 2, 7; W2, W4)

1. Opens Venue Setup, finds the node, presses its action: **Change regular week…**, **Edit** (schedule), **Compare services**, **Open Special dates**, **Booking rules…**, **Open floor plan**, **Close for a date…**.
2. Each lands on the existing editor, which on exit returns to where it was opened (browser back).

### F4. Block a section for a date (PRD 4; W1, W3)

1. Hub: **Close for a date…** on a section row. Or the Availability calendar toolbar or day drawer **Close…**, then "What: One section". (The Special dates tab's Add sheet adds whole-venue closed or special-hours dates only and is unchanged.)
2. Close dialog, "What" = One section, Select lists section names (as the floor plan names them). Date choices and confirm are the existing "When" choices.
3. Confirmation names the section ("Close Bar on Thu, Dec 24") and the count of existing bookings affected, as every closure already does.
4. Day drawer and Special dates list show "Bar" by name; Venue Setup's Special dates node lists "Thu, Dec 24 · Bar closed".

### F5. Old links (PRD 8; W6)

1. `/setup/hours` redirects to `/availability`; `/availability`, `/floor-plans`, `/floor-plans/:id` unchanged; `/setup` renders the hub for every status.
2. An unready venue opening an operational page is still redirected to `/setup`.

### F6. Recognise and change the week (amendment primary; PRD 14, 17; W10-W14, W21)

1. `/availability` opens on **Schedules** for a Manager with hours (an empty venue still gets quick setup, which is the same form). While the role read is pending the layer area is a skeleton; the calendar is never painted first for a Manager.
2. The **week panel** is the week form plus its footer. The footer always shows "Changes apply from today, {date}." and **Starting later…**; once the form is dirty it adds the drawer's captions ("This becomes your regular week: open …", "{days} is closed.", schedules that cover some days), the drawer's **own special hours** choice when covered dates have their own changes (`OwnChangesChoice`), **Discard** and **Save**.
3. **Save** is the drawer's own save with Starting = today and no end — `buildRegularWeekChanges`, the conflict mode from the own-changes choice, stranded preview, conflict review, undo — not a second implementation. On success the form shows the saved week, not dirty.
4. **Starting later…** (always shown, one interaction) opens Change regular week with the current draft (the saved week when not dirty) and Starting empty — today's drawer, unchanged otherwise. It is the one-click route to Change regular week that the calendar toolbar button used to be.
5. Leaving the layer, the page, or the venue with a dirty form asks first: the tab guard covers the layer switch, `ScheduleDraftGuard`/`LeaveGuard` cover route and venue changes.

### F7. Go one layer down (PRD 12, 15, 18; W15-W20)

1. The layer control **Schedules | Calendar | Special dates** switches in place; Calendar-only controls (date navigation, Month | Week, Select…) appear only on Calendar.
2. Header actions are the same on every layer: **Close…**, **Pause online booking**, **⋯** (Booking rules…, Compare services, Duplicate regular week…, History, Go to date).
3. **Go to date** from another layer switches to Calendar, then opens the dialog. **Compare services** switches to Schedules and opens its panel.

### F8. Onboarding names the same object (PRD 20)

1. Hours step: heading "Regular week" (unchanged); intro "Your services and the days they run. Change it any time in Availability → Schedules."
2. Launch review: the guest preview card gains one caption line, "Change these later in Availability → Schedules."

## Screens

### S-Hub. Venue Setup (`/setup`)

Desktop (≥1024 px): single column inside the dashboard chrome, max readable width; the saved regular-week line sits in the Schedules node. Below 1024 px the same tree stacks; action buttons wrap under their row, 44 px targets.

```
Venue Setup
Everything a guest can book, and how it fits together. Each line opens where you change it.

[Pre-launch only] Setup progress  ▓▓▓░░  1 of 3
  ✓ Venue basics      Done
  ▶ Regular week      Next   [Set up regular week]
  · Floor plan        Not yet

BISTRO 42   Chicago · USD

WHEN YOU'RE OPEN
┌ Schedules (1)    Named weeks your venue runs. The regular week is one.       [Compare services]  [Create another schedule…]
│ ┌ Schedule · Regular week     Open Tue–Sat                                   [Change regular week…]  [Edit]
│ │   Service · Lunch           11:30 AM–2:30 PM · Tue–Fri
│ │   Service · Dinner          5:00–10:00 PM · Tue–Sat
│ │   Open Tue–Sat; Lunch Tue–Fri, Dinner Tue–Sat        (RegularWeekLine, from the saved config)
│ └ Schedule · Summer hours     Jun 1 – Sep 15, every day                      [Edit]
│
├ Special dates      3 upcoming · Closures and special hours for one date or a range.   [Open calendar]  [Open Special dates]  [Close for a date…]
│     Thu, Dec 24 · Bar closed
│     Fri, Dec 31 · Dinner closed
│     Sat, Jan 1 · Whole venue closed                  (next 5; "Show all 3" opens Special dates)
│
└ Booking     How guests book: online, by phone, on the waitlist.              [Booking rules…]
      Up to 60 days ahead · 2 hours notice · parties up to 8 online
      Online booking closed on 2 upcoming dates; phone booking closed on 0     → Special dates

WHERE GUESTS SIT
└ Floor plan · Main floor   2 sections · 14 tables                              [Open floor plan]  [Add another floor plan]
    ├ Section · Bar          6 tables  ▸ (expands to table names and seats)    [Close for a date…]
    ├ Section · Main Dining    8 tables  ▸
    └ No section               0 tables                                          [Move to a section]
```

- Purpose: show every in-scope resource type, its parent, its state, and the one door to its editor.
- Row anatomy: a **kind caption** (Schedule, Service, Section, Table; the same words as the glossary), a **name**, a **state** (value or count or "Not set up"), then actions. Rows that have children are disclosures (button with `aria-expanded`); the tree is a nested list with `role="tree"` only if the Architect keeps keyboard tree semantics; otherwise nested lists with headings. Rows start expanded for Schedules and Floor plan down to services/sections; tables are collapsed.
- Group headings are plain text (`<h2>`): "When you're open", "Where guests sit". The nav and the checklist never use these as destination names.
- **One-schedule venue:** the single schedule renders as a node captioned "Schedule" named "Regular week", with **Create another schedule…** on the Schedules header. The word Schedule appears on this hub, the Schedules tab and the schedule editor; the calendar, day drawer and quick setup keep "Regular week" and "Use another day's hours".
- **Special dates and their targets:** the node lists the next five upcoming rows, each "date · target · what" (target is the venue, a service name, a section name, or Online / Phone / Waitlist), read-only; "Show all N" opens the Special dates tab. A per-target filter is not designed.
- **Booking:** the Booking node is the venue's booking rules plus closures of online, phone, waitlist. "Walk-ins" are not a closable channel today (`CloseStepOne.tsx:42`) and are not listed.
- **No section** appears only when at least one active table has no section.
- **Multiple floor plans:** one **Floor plan · name** node per plan, each with its sections; the **Add another floor plan** action is on the group heading.
- Empty state (nothing set up): each node keeps its place and reads, for example, "Regular week — Not set up. The days and services guests can book. [Set up regular week]", "Special dates — Not set up. Closures and special hours for a date; none yet. [Close for a date…]" (the button is disabled with a tooltip "Set up your regular week first" until a schedule exists, matching `DisabledTooltip` use on the Schedules tab), "Booking — Not set up. How far ahead, how much notice and how large a party guests can book online; defaults apply. [Booking rules…]", "Floor plan — Not set up. Where tables sit; guests can't book without a table. [Add floor plan]". No section or table nodes are shown below an unset Floor plan; a line "Sections and tables appear here once you add a floor plan" takes their place.
- Loading state: the tree skeleton (rialto `Skeleton`) with the group headings and two skeleton rows per group; actions are not rendered until data arrives. Each group loads independently (config and floor plan are separate reads), so a slow floor plan does not block the schedule group.
- Error state: a per-group `Alert` (`role="alert"`) with the existing `describeApiError` text and **Retry**; the other group stays usable. If both fail, the page shows the existing `ErrorRetryBanner`.
- Host state: same tree, values and counts; no action buttons except **View calendar** and **View floor plan**; unset nodes read "Not set up. A manager sets this up."; no Setup progress strip (Hosts do not see pre-launch setup).

### S-Nav. Navigation

```
Pre-launch               Operational
GET STARTED              (primary items …)
  Venue Setup  1 of 3    MANAGE
ACCOUNT                    Venue Setup
                           Availability
                           Menus
                           Booking Widget
                         ACCOUNT
```

- Purpose: one item for the structure and, after launch, one item for the calendar. The three pre-launch step items and the "Floor Plans" item go; their destinations are nodes.
- The item is called "Venue Setup" in both states (same destination, same label). Section headings "Get Started" and "Manage" are headings, not destination names.
- The pre-launch item carries the progress count; no locked items, so nothing is "Not yet available" in the nav.
- Hosts: nav shows Venue Setup (view-only) after launch; Hosts have no pre-launch role today.
- Document title and breadcrumb: `/setup` "Venue Setup"; `/availability` "Availability"; `/floor-plans` "Floor Plan" (list) and the plan's name on `/:id`; `/setup/hours` redirects, so its `hours` label is only seen in a flash and takes the "Availability" value.

### S-Avail. Availability page (changed lightly) — superseded 2026-11-08 by S-Avail2

- (2026-11-07, as built in #8488) Page title stays "Availability". Tabs: Calendar | Special dates | **Schedules**. The Schedules tab is **always shown to a Manager**, even with one schedule (removes the `hasOwnSchedules` hide). "Create another schedule…" moves from the toolbar to the Schedules tab header.
- Every editor on this page keeps its place. Add, in the page header, a back-link "Venue Setup" shown only when the page was opened from the hub.
- The Close dialog gains **One section** (below). The day drawer shows a section closure as "Bar closed".
- Purpose: operate the calendar (dates and drawers). Editing the structure starts from Venue Setup.

### S-Avail2. Availability page, layered (amendment; replaces S-Avail)

Desktop, Manager, one-schedule venue, first paint:

```
Availability                                   [Close…] [Pause online booking] [⋯]
Your hours, holidays and one-off changes.            (Venue Setup ← only from hub)

( Schedules | Calendar | Special dates )

Regular week                                              [Add a schedule…]
Your usual week. Other schedules and special dates change it on the days they cover.
┌──────────────────────────────────────────────────┬─────────────────────┐
│ Service 1  [Lunch][Brunch][Dinner][Late]          │ Guest preview       │
│ Service name [Lunch            ]                  │ Party [2 ▾]         │
│ Opens [11:30 AM] Last seating [2:00 PM] Closes [3:00 PM] │ MONDAY       │
│ Different days for this service · Different hours…│ Lunch 11:30 AM – …  │
│ Service 2 … Dinner …                              │ …                   │
│ [Add another service]                             │                     │
│ Days [Weekdays][Weekends][Every day]  ☑Mon … ☑Sun │                     │
└──────────────────────────────────────────────────┴─────────────────────┘
Changes apply from today, Sun, Nov 8.  [Starting later…]   (dirty adds: captions, own-changes choice, [Discard] [Save])
(dirty only) What changes for guests — stranded preview (existing DraftPreview)

Booking: Up to 30 days ahead · 1 hour notice · parties up to 12 online
```

- Actionable controls outside the week panel at first paint: **Close…**, **Pause online booking**, **⋯**, the three layer options, **Add a schedule…** = **7** (PRD 15 as corrected; today 12-15). The week panel (form + footer, including **Starting later…**) is the thing the page is for and is not counted, as PRD 15 counts "outside the week form".
- **⋯** menu: Booking rules…, Compare services, Duplicate regular week…, History, Go to date.
- **Other schedules** (only when the venue has any): a list under the week panel, one row per schedule: name, where it applies ("Jun 1 – Sep 15, every day"), **Edit**, **Duplicate**, **Delete** (today's `SchedulesTab` row actions, unchanged). Compare services opens below the list as today.
- **Add a schedule…** opens today's schedule editor seeded from the regular week's services; once a Starting date is set and the days are untouched, the days follow the regular week. The hub's "Create another schedule…" is renamed **Add a schedule…** and does the same (one label, glossary verb Add; "New schedule" retires).
- **Calendar** layer: today's calendar page below the layer control: week summary, Services filter, venue time, holiday nudge, regular-week line, date navigation, Month | Week, Select…, grid, selection bar, day drawer. The toolbar loses ⋯, **Close…** and **Pause online booking** (now in the header) and the **Change regular week…** button (the week form and **Starting later…** replace it).
- **Special dates** layer: today's Special dates tab, unchanged.
- Loading: while the config or the role read is pending, the layer area is a `Skeleton` the height of two service rows and the header actions render disabled; a Manager never sees the calendar first. Error: the existing load-failure banner above the layer control; the form is not shown over a failed read.
- Save failure, conflict, stranded, own changes: the drawer's existing `SaveFailure`, `ConflictReviewPanel`, `OwnChangesChoice` and `DraftPreview`, rendered inline under the form.
- Paused banner: `OnlinePausedBanner` shows above the layer control on every layer.
- Phone (375): header shows **Close…** and **⋯**; **Pause online booking** sits in **⋯** at the top (2 interactions, PRD 21 as corrected). The layer control spans the width. The week form stacks, guest preview below it (today's `QuickSetupForm` phone layout). On the Calendar layer the toolbar's own menu holds only the Select… items and is labelled **Select…**, so the page has one ⋯, not two.
- Host: today's page (W22). No header actions, no Schedules layer.
- Purpose: see and change the usual week where it is; everything else is one named step away.

### S-Onb. Onboarding hours step and launch review (amendment)

- Hours step: heading "Regular week" (unchanged); intro "Your services and the days they run. Change it any time in Availability → Schedules." Step label stays "Hours", description stays "When you're open".
- Launch review: one caption under the guest preview card, "Change these later in Availability → Schedules."

### Service time rule (amendment; PRD 16)

- A configured service reads "**Lunch** 11:30 AM–3:00 PM, last seating 2:00 PM" — open–close, then last seating — on the regular-week line, the hub's service rows and schedule line, the day drawer's service rows, and the Other schedules rows where times show. When last seating equals close, ", last seating …" is left out.
- Per-day differences keep their wording with the same pair: "Fri, Sat until 12:00 AM, last seating 11:00 PM".
- The guest preview is not a service description: it keeps "First and last time a guest can book" and its bookable times (PRD 16 corrected in place to leave it out).

### S-Close. Close dialog "What" (changed)

```
What
 ( ) Whole venue
 ( ) One service        [Service ▾]
 ( ) One section        [Section ▾]     Bar · Main Dining · No section
 ( ) Booking only       [x] Online  [ ] Phone  [ ] Waitlist
```

- Purpose: name the thing being closed, in the floor plan's words.
- Disabled when the venue has no sections: "Add a section to your floor plan first" with a link to the floor plan.
- Error and loading: unchanged. A failure to load sections disables only the new choice and says why.

### S-Tonight. Tonight "Block tables" list (changed)

```
Block tables
 ( ) All tables
 ( ) Section: Bar        6 tables
 ( ) Section: Main Dining  8 tables
 ( ) Pick tables           (grouped by section; tables with no section under "No section")
```

- Purpose: stop a section or table for tonight in the same grouping as the floor plan.
- Proposed: group by section. If Architect keeps `location`, label rows "Location: <text>" and nothing says "Section" for them.

### S-Floor. Floor Plan pages (changed lightly)

- Title "Floor Plan" (list and editor). The sidebar's section list gains a **Close for a date…** button for Managers and keeps its table counts. Back-link "Venue Setup" shown when opened from the hub.
- Purpose unchanged: draw the room. No new editor.
- Host: the floor plan editor is not role-gated today (code facts); Dependencies surfaced.

### S-Strip. Setup progress strip (pre-launch only, Managers)

- A compact list of the three steps, reusing the `SetupPage` step state (Completed, Current, Not yet available). Done rows are static. The Next row has the primary button naming the node's action.
- When all complete: "Ready for reservations" and **Go to Timeline**.
- Loading and error states: as Venue Setup; the strip disappears if readiness fails and the tree remains.

### Where each existing control lives (PRD criterion 2 and 7)

| Resource type                             | Primary editor                                                                                                                                                                                        | Other entries (links, not editors)                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue basics                              | `/onboarding` wizard                                                                                                                                                                                  | Setup progress strip row                                                                                                                                                                                                              |
| Regular week and schedules (weekly hours) | One form, `QuickSetupForm`, in three frames: quick-setup card (empty venue), Change regular week… drawer (regular week, with dates), Schedule editor drawer (named schedules, from the Schedules tab) | Hub schedule nodes (**Edit**, **Change regular week…**, **Set up regular week**); the calendar toolbar **Change regular week…** opens the same drawer; the onboarding step renders the same form (cannot link away; see Dependencies) |
| Services                                  | Schedule editor (services section)                                                                                                                                                                    | Hub service rows open it on that service; Compare services stays on the Schedules tab and is linked from the hub                                                                                                                      |
| Special dates (closures, special hours)   | Special dates tab and the Close dialog / day drawer                                                                                                                                                   | Hub **Open Special dates**, **Close for a date…**                                                                                                                                                                                     |
| Booking                                   | Booking rules drawer; Close dialog "Booking only"                                                                                                                                                     | Hub Booking node                                                                                                                                                                                                                      |
| Floor plan, sections, tables              | Floor plan editor `/floor-plans/:id`                                                                                                                                                                  | Hub nodes; Tonight (temporary table blocks); Close dialog (section)                                                                                                                                                                   |

Copy day stays inside the day drawer. Quick setup, Change regular week and the Schedule editor are frames of the one form; PRD criterion 2 allows quick setup and Copy day to stay in-flow, and this doc counts Change regular week as a frame, not a second editor. That reading of "one primary editor" is UX's and is flagged for the Owner: counted by frame, the number for this type is three. History, Go to date: Availability overflow, unchanged. Tonight: Timeline header, unchanged. The guest-view strip: quick setup and onboarding launch. The hub shows the saved regular-week line.

**Amendment (2026-11-08) — where each control lives on `/availability`:**

| Control | Before (2026-11-07) | After |
|---|---|---|
| Regular week editor | Change regular week… drawer (Calendar toolbar), hub | **Week panel** on the Schedules layer (default); the drawer via **Starting later…** (always shown); hub **Change regular week…** opens `/availability?tab=schedules` |
| New schedule | Schedules tab header ("New schedule"); hub "Create another schedule…" | **Add a schedule…** beside the Regular week heading, and on the hub; opens seeded from the regular week |
| Compare services | Schedules tab header | **⋯** → Compare services |
| Duplicate / Edit regular week | Schedules tab row | **⋯** → Duplicate regular week…; the week form is the edit |
| Edit / Duplicate / Delete other schedules | Schedules tab rows | **Other schedules** rows (unchanged actions) |
| Close…, Pause online booking | Calendar toolbar | Page header (every layer) |
| History, Go to date, Booking rules… | Calendar toolbar ⋯ | Page header **⋯** |
| Date navigation, Month/Week, Select… | Calendar toolbar | Calendar layer toolbar (unchanged) |
| Holiday nudge, week summary, Services filter, regular-week line | above the calendar toolbar | Calendar layer only |

### Glossary (test fixture for PRD criterion 5)

| Concept                                 | UI term                                                                 | Never in UI                                          |
| --------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| The setup hub (nav, title, route label) | Venue Setup                                                             | Setup, Get Started (as a destination), Hours         |
| The calendar page                       | Availability                                                            | Operating Hours, Set Operating Hours                 |
| The room page                           | Floor Plan (singular in titles and nav sublabels)                       | Create Floor Plan, Floor Plans as a destination name |
| Weekly pattern                          | Regular week                                                            | operating hours as a resource name                   |
| Named alternative week                  | Schedule (hub, Schedules tab, schedule editor; from the first schedule) | template, period                                     |
| Bookable period                         | Service                                                                 | shift, slot                                          |
| One-date difference                     | Special hours; list = Special dates; closure = Closure                  | override, changed                                    |
| How guests book                         | Booking (Online booking, phone booking, waitlist)                       | channel                                              |
| A part of the floor                     | Section                                                                 | area, zone, location (for a section)                 |
| One seat group                          | Table                                                                   | —                                                    |
| Temporary night change                  | Tonight                                                                 | —                                                    |
| Layers of the Availability page (amendment) | Schedules, Calendar, Special dates (in that order) | Week (as a layer name), Hours (as a layer name) |
| A service's times (amendment) | "11:30 AM–3:00 PM, last seating 2:00 PM" | "11:30 AM–2:00 PM" for open–last seating |

Button copy: sentence case with counts and names ("Close Bar on Thu, Dec 24"). Action verbs: Set up (empty), Edit, Change, Close, Open, Add, Compare.

## Conventions to match

- Rialto components and `var(--rialto-*)` tokens; CSS Modules; no inline styles (`packages/rialto`; repo rules). `Skeleton`, `Alert`, `Button`, `Tag`, `Heading`, `Text`, `DisabledTooltip`, `SegmentedControl` as already used by the availability page.
- Voice & terms from venue-availability `ux.md`: no "channel", no "slot", "Override" only for staff bookings, counts on buttons, dates in full.
- Roles: Managers edit, Hosts view; render no control a Host cannot use (the Availability page's `isManager` pattern).
- i18n: every new string in en-US, es-MX, fr-CA; plural keys for counts; key-parity test.
- Breakpoint 1024 px (`useIsMobile`/`useViewport`); touch targets at least 44 px.
- Accessibility: disclosure rows use buttons with `aria-expanded`; each action's accessible name names its target ("Close Bar for a date…"); status is text, not colour alone; the page is one `<h1>`, group headings `<h2>`.
- Routes keep working; route changes redirect rather than 404.
- Deep links used by the hub are in-app state, not new URL contracts, where the existing page uses state (`AvailabilityPage` tabs). If Architect finds deep links need URL parameters (for example opening the Schedules tab or the Close dialog preselected), they are Architect's contract.

## Dependencies surfaced for Architect

- **Hub deep links.** The hub needs to open Availability on a given tab (Schedules, Special dates) and the Close dialog with a section preselected. Today tab state is page state (`AvailabilityPage.tsx:139`). Needs a route-state or query contract.
- **`/setup` becomes a standing page.** It must stop bouncing operational venues (`DashboardLayout.tsx:158-161`) and stop its own redirect (`SetupPage.tsx:55-60`); unit and e2e tests that assert the bounce change deliberately. The unready-venue redirect to `/setup` stays.
- **Section as a close target.** Close dialog "One section", the day drawer and Special dates need the section's name, and the guest-facing result must block its tables. UI works with either a stored section target or a rule over the section's tables (and, if over tables, a decision on what happens when a table later changes section).
- **Tonight grouping source.** Prefer floor-plan sections over `Table.location`: the Manager draws sections on the floor plan, and one grouping everywhere is the point of this run. Fallback keeps `location` and labels it "Location". A venue where the two disagree gets a "No section" bucket and a link, not a silent merge.
- **Hub reads.** Config, tables, sections, floor plans and the venue's booking settings are separate reads; the hub needs them composed without waterfalls, and per-group loading and errors.
- **Role gating of floor-plan pages.** No `viewerRole` check exists in `FloorPlansPage.tsx` or `FloorPlanEditorPage.tsx`; Hosts reach editors there. PRD criterion 10 requires none shown on the hub; whether the pages themselves are gated is a role-scope question (PRD says no role changes), recorded for Architect.
- **Always-shown Schedules tab and the toolbar button** change `AvailabilityScheduleControls` tests.
- **Regular-week line on the hub** reuses `RegularWeekLine` (config in, one line out). No hub guest-view strip; see assumptions.
- **No way to add or rename a section, or put a table in one, outside room templates.** W3 and the "No section" group need a table-to-section control. UX designs the smallest one: a **Section** select on the table details form (options: the plan's sections and "No section"), and, only if the Owner wants custom section names, an **Add section** (name only) button on the sidebar's Sections heading. Both are small new controls and sit against the PRD out-of-scope line "A new editor for any resource type"; this is the case where UX shows the re-home cannot work. Architect and the Owner decide at the architecture gate; if neither is built, the hub drops **Move to a section**, the Close dialog's disabled state says "Sections come from your floor plan template", and the template-section fixture (Main Dining, Bar) is the only one.
- **Onboarding wizard hours step stays.** The wizard creates the venue; its hours are saved at launch (`launch-sequence.ts:264`), so the step cannot link away to the hub's editor. PRD criterion 2 lists the onboarding step as a link, not a second editor. The step renders the same `QuickSetupForm`, so the editor component count is still one. Flagged for the Owner.
- **Nav items** change `nav-sections.ts` and its test, and `layout.routes.*` / `nav.*` / `setup.steps.*` catalog entries in three locales.
- **(Amendment) Inline regular-week editor.** The week panel needs `ChangeRegularWeekDrawer`'s draft, save, conflict mode and `OwnChangesChoice`, captions, conflict review, stranded preview and undo without the drawer, with Starting = today and no end; the inline save is the drawer's `submit` with `startsOn = today`, including `conflictMode`. The drawer stays for **Starting later…** and must accept a starting draft. One implementation of the save, not two. The inline form needs `ScheduleDraftGuard`/`LeaveGuard` for route and venue changes (the page's `LeaveGuard` covers only the day drawer today, `AvailabilityPage.tsx:767`).
- **(Amendment) Default tab, role-pending state and entry contract.** Manager default becomes `schedules`; while the role read is pending the page renders the layer skeleton, never the calendar (today `useIsManager` is false while pending, `AvailabilityPage.tsx:303,450-462` fall through to the calendar). `?tab=calendar` must still open Calendar; the hub's links keep working; the hub's Change regular week action becomes a link to `?tab=schedules`. Host default stays `calendar`. Quick setup's save no longer moves focus to the calendar (`AvailabilityPage.tsx:264-272`).
- **(Amendment) Header actions on every layer.** Close…, Pause online booking and the ⋯ items are owned by the calendar toolbar and its page state today (`closing`, `historyOpen`, `bookingRulesOpen`, `goToOpen`); they must work from the Schedules and Special dates layers too, and `OnlinePausedBanner` (calendar branch only today, `AvailabilityPage.tsx:597-603`) moves above the layer control.
- **(Amendment) Add a schedule… seed.** A new schedule editor mode seeded from the regular week's services, with days filled from the regular week only once Starting is set and the days are untouched (today's New opens empty and "Start from your regular week" clears days, `ScheduleEditorDrawer.tsx:89-92,117-118`; a dateless schedule with days would outrank the regular week every day, `:86-88`). Duplicate keeps today's behaviour.
- **(Amendment) Close fixture.** Lift the stateful closure mock from `availability-close.spec.ts:95-175` (GET/POST `/closures`, `/closures/impact`) into `e2e/helpers/` for the scenario specs.
- **(Amendment) One service-time formatter** used by `RegularWeekLine`, `useSetupNodeText`, the day drawer and schedule rows; tests pin the format with distinct open, last seating and close.
- **(Amendment) Tests that change deliberately**: interaction baselines (quick-setup save now lands on the week form, not the grid), `availability-entry`, `availability-regular-week`, `availability-phone`, `AvailabilityScheduleControls`, `AvailabilityToolbar`, `SchedulesTab`, onboarding copy, `venue-setup-hub` links.

## Deliberately not designed

- Section- or area-level availability rules beyond a one-date section closure (Phase 3: per-section service hours, seating limits).
- Walk-ins as a closable booking channel; there is none today.
- Per-target filtering of Special dates from the hub.
- Drag-and-drop or inline editing on the hub; it navigates, it does not edit.
- Seeding the tree from venue type or history (Moonshot rung in `idea.md`).
- Visual polish beyond Rialto defaults; illustration; a graphical tree or diagram.
- A Host pre-launch experience; Hosts have none today.
- A review view for Venue basics (none exists, `SetupPage.tsx:17-21`).
- Timing: the hub adds one navigation before quick setup when counted from the app's first screen (W1). A mitigation, making the first unset node's button the strip's primary action on an empty pre-launch venue, is already in S-Strip; further reduction is not designed.
- Settings → Venue's "Operating hours" button (`SettingsPage.tsx:378`) is renamed "Venue Setup" and points to `/setup` (glossary: "Operating Hours" is retired); no further Settings change.
- (Amendment) Inline editing of a non-regular schedule on the Schedules layer; **Edit** keeps opening the schedule editor drawer.
- (Amendment) The calendar cells' "Regular · 2 services" text; calmer cells are a later pass.
- (Amendment) A Host Schedules layer (PRD 22 as corrected).
- (Amendment) New Close dialog steps to shorten W15/W17; the dialog is unchanged and only its entry moved.

## Review

- Review: independent (fresh `reviewer` subagent given `idea.md`, `prd.md`, `ux.md` and the cited code paths; Critical/High only).
- C1: sections cannot be added or assigned in the floor plan editor, so W1, W3, "No section" and the Close dialog remedy depended on controls that do not exist — fixed: W1 uses template sections (Main Dining, Bar); code fact added; the smallest table-section control and optional Add section designed and recorded under Dependencies surfaced, with the PRD out-of-scope tension flagged.
- H1: the Special dates Add sheet has no "What" choice — fixed: F4 and W1 route through the calendar toolbar and day drawer **Close…** dialog; the Add sheet is stated unchanged.
- H2: weekly-hours design contradicted PRD criterion 2 — recorded: one form in three frames; the onboarding wizard cannot link away; the reading is flagged for the Owner in the control table and Dependencies.
- H3: the hub showed counts, not overrides with targets — fixed: the Special dates node lists the next five "date · target · what" rows, including a section by name.
- H4: wrong code fact on `RegularWeekStrip` — fixed: it takes a draft; the hub uses `RegularWeekLine`; PRD criterion 9 wording flagged in assumptions.
- H5: "Not set up" inconsistent between flow and sketch — fixed: every node shows the state "Not set up" in the empty state.
- Re-walk after fixes: W1 (template sections, Close dialog from the calendar), W3, W5, W7 and W9 re-read against the controls above; each finishes.

### Amendment review (2026-11-08)

- Review: independent (fresh `reviewer` subagent given `idea.md`, `prd.md`, `ux.md` and the amendment code paths; Critical/High only). No Critical; seven High.
- H1: W13 on F-one cannot save (Brunch overlaps Lunch every day) — fixed: W13 runs on F-bistro; the overlap on F-one is named as the form's validation.
- H2: W18 omitted the empty New schedule editor and cleared days (real 11 > 10) — fixed by design: **Add a schedule…** opens seeded from the regular week with its days (new seed under Dependencies), giving 9; the hub's label unified to **Add a schedule…**.
- H3: Close counts, W17's choice and the fixture were wrong — fixed: W15 counts month navigation and no Next without affected bookings (6), with-bookings cost recorded; W17 uses **Date range** (7); F-close fixture named, lifted from `availability-close.spec.ts`.
- H4: the inline save dropped `OwnChangesChoice` and the drawer's captions — fixed: F6.2/F6.3, S-Avail2 and Dependencies state the inline save is the drawer's `submit` with `startsOn = today`, conflict mode included.
- H5: a Manager would see the calendar while the role read is pending — fixed: role-pending skeleton in F6.1, S-Avail2 Loading and Dependencies; counts taken after the role settles.
- H6: Change regular week would be two interactions away — fixed: **Starting later…** is always shown in the week panel footer.
- H7: the service time rule left the guest preview out while PRD 16 included it — fixed: PRD 16 corrected in place and flagged.
- Medium, also fixed: LeaveGuard for the inline form; paused banner on every layer; W14 hint text; W12 fixture F-dinner; W19 field labels; one label for adding a schedule; phone has one ⋯ (Calendar's menu becomes **Select…**).
- Re-walk after fixes: W10-W22 re-read against S-Avail2, F6-F8 and the fixtures above; each finishes within its budget except the with-bookings variant of W15/W17, recorded.
