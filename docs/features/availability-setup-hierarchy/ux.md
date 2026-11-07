---
stage: ux-design
run: feature:availability-setup-hierarchy
date: 2026-11-07
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
---

# UX: Availability setup hierarchy

Extends venue-availability `ux.md` (Voice & terms, Surfaces, Flows) and availability-config-usability (ADR-031: regular week, service days, per-day hours). Contradicts neither ADR-029 nor ADR-030. The one deliberate change to an earlier rule is the schedule node for a one-schedule venue (assumptions above).

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

### S-Avail. Availability page (changed lightly)

- Page title stays "Availability". Tabs: Calendar | Special dates | **Schedules**. The Schedules tab is **always shown to a Manager**, even with one schedule (removes the `hasOwnSchedules` hide). "Create another schedule…" moves from the toolbar to the Schedules tab header.
- Every editor on this page keeps its place. Add, in the page header, a back-link "Venue Setup" shown only when the page was opened from the hub.
- The Close dialog gains **One section** (below). The day drawer shows a section closure as "Bar closed".
- Purpose: operate the calendar (dates and drawers). Editing the structure starts from Venue Setup.

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

## Review

- Review: independent (fresh `reviewer` subagent given `idea.md`, `prd.md`, `ux.md` and the cited code paths; Critical/High only).
- C1: sections cannot be added or assigned in the floor plan editor, so W1, W3, "No section" and the Close dialog remedy depended on controls that do not exist — fixed: W1 uses template sections (Main Dining, Bar); code fact added; the smallest table-section control and optional Add section designed and recorded under Dependencies surfaced, with the PRD out-of-scope tension flagged.
- H1: the Special dates Add sheet has no "What" choice — fixed: F4 and W1 route through the calendar toolbar and day drawer **Close…** dialog; the Add sheet is stated unchanged.
- H2: weekly-hours design contradicted PRD criterion 2 — recorded: one form in three frames; the onboarding wizard cannot link away; the reading is flagged for the Owner in the control table and Dependencies.
- H3: the hub showed counts, not overrides with targets — fixed: the Special dates node lists the next five "date · target · what" rows, including a section by name.
- H4: wrong code fact on `RegularWeekStrip` — fixed: it takes a draft; the hub uses `RegularWeekLine`; PRD criterion 9 wording flagged in assumptions.
- H5: "Not set up" inconsistent between flow and sketch — fixed: every node shows the state "Not set up" in the empty state.
- Re-walk after fixes: W1 (template sections, Close dialog from the calendar), W3, W5, W7 and W9 re-read against the controls above; each finishes.
