---
stage: idea
run: feature:availability-setup-hierarchy
date: 2026-11-07
assumptions:
  - "Success sentence is the orchestrator's draft (brief, Idea inputs, [orchestrator default]); the ≤5 minute bar reuses the venue-availability PRD small-setup bar and PRD may sharpen it."
  - "Ambition ladder: the brief's standing instruction is the skill default, so Showstopper (recommended) is chosen, not picked live by the Owner; the four tests were run silently and all pass."
  - "Delivery shape (one branch and PR per breakdown item off main, merged under the release authorization) is an orchestrator default; it does not change this brief."
  - "Success criteria in the brief are derived from the drafted success sentence, not answered one by one; PRD sharpens them."
  - "The Showstopper moment (a setup map that fills in as the venue is configured) is drafted from the Owner's goal wording and the code read below; the Owner approved the brief but has not seen this moment."
  - "Evidence count of 1 (the Owner) and 0 independent operators is the Owner's live answer; no outside corroboration was run (the optional last30days step was not offered)."
---

# Idea: Availability setup hierarchy

> As a user, I am confused about how to set up availability. Having clearer UX for different resource types and hierarchy of resources would make it easier for me to follow. I want to simplify the UX without sacrificing usability.

## Problem

"I am confused about how to set up availability. I can't see what kinds of things I'm configuring or how they fit together, so I don't know where to go to change something."

The venue Manager cannot see the resource types behind availability (weekly hours, schedules, services, special dates, booking channels, sections and tables) or how they nest, so each change starts with a search for the page that holds the control.

## Who has it

The venue Manager, setting up a venue or changing it later. Hosts are view-only and are not the sufferer, but must not see editors they cannot use.

Today the things a Manager configures live on separate surfaces and no screen shows how they relate:

- `/setup` checklist: venue basics, operating hours, floor plan.
- `/availability`: Calendar | Special dates | Schedules tabs, quick setup, Change regular week, Tonight, Compare services, History, Booking rules.
- `/floor-plans`: floor plans, sections and tables.

They cope by trial: opening each page until they find the control.

## Why now

Availability shipped 2026-10-26 and per-day hours on 2026-11-04. No real venue uses it yet and the production backfill has not run (venue-availability `release.md`), so an information-architecture change costs least now, before operators learn the current layout. Both predecessor runs left IA out: venue-availability `ux.md` defers areas/sections to Phases 2–5, and the availability-config-usability PRD's "Out of scope" says nothing about IA.

## Evidence

**Anecdote, not validation.** Count: 1 report, the Owner's own; 0 independent operators. Nothing here is validated.

Code read in the worktree at `origin/main` @ `7c051456f` (2026-11-07). Each brief claim was re-checked; corrections are marked.

- **Four route labels, three nav entries for setup.** `apps/hospitality/src/components/DashboardLayout.tsx:50-69` `ROUTE_LABEL_KEYS` holds `floor-plans`, `availability`, `setup` and `hours` as separate labels (confirmed). The nav differs by readiness (`apps/hospitality/src/nav-sections.ts:78-82`): a venue still in setup sees a "Get Started" section of three steps (`onboarding` → `/onboarding`, `operating-hours` → `/availability`, `floor-plan` → `/floor-plans`, lines 85-95); an operational venue sees "Manage" with Floor plans, Availability, Menus, Booking widget (lines 134-141). The same two resources are therefore labelled "Set operating hours" / "Create floor plan" before launch and "Availability" / "Floor plans" after.
- **Checklist hands off to unrelated pages.** `apps/hospitality/src/pages/SetupPage.tsx:9-36` `STEP_CONFIG`: `onboarding` (`/onboarding`, no review view, `reviewPath: null`), `operating-hours` (`/availability`), `floor-plan` (`/floor-plans`) (confirmed). `/setup/hours` is a bare `<Navigate to="/availability">` (`main.tsx:367-368`), and `DashboardLayout.tsx:158-161` bounces only `/setup` itself so subpages stay reachable.
- **The Schedules tab hides the schedule level.** `AvailabilityScheduleControls.tsx:37`: `showSchedules = isManager && (hasOwnSchedules(state.config) || tab === "schedules")`, so a venue with one schedule never sees the venue → schedule → service nesting (confirmed).
- **Model.** `services/reservations/prisma/schema.prisma`: `Schedule` (line 576) → `ScheduleService` (611) → `VenueService` (597); `DateRule` (659) with `targetKind` (664) and `DateRuleTable` (705); the comment at line 658 reads "`sectionId` (P3) is deliberately absent" (confirmed). Physical: `FloorPlan` (215) → `FloorPlanSection` (235) → `Table` (255), with `Table.sectionId` (270) **and** a free-text `Table.location` string.
- **Correction — hours entry points.** The brief listed five (onboarding `OperatingHoursStep`, `AvailabilityQuickSetup`, `ChangeRegularWeekDrawer`, Schedules tab, Copy-day). On `7c051456f` the component `OperatingHoursStep` is **not rendered anywhere**: only its validation-error type is imported (`QuickSetupHoursStep.tsx:3`, `quick-setup-draft.ts:16`, `useOnboardingWizard.ts:11`). The onboarding wizard renders `QuickSetupHoursStep` (`pages/VenueOnboardingPage.tsx:12,219`). The live set that edits regular hours is: wizard (`QuickSetupHoursStep`), `AvailabilityQuickSetup` (empty venue, `AvailabilityPage.tsx:301`), `ChangeRegularWeekDrawer` (`AvailabilityPage.tsx:686`, and `AvailabilityScheduleControls.tsx:64`), the Schedules tab (`SchedulesTab.tsx` with `ScheduleEditorDrawer`, `AvailabilityPage.tsx:430,696`), and `CopyDayAction` from the day drawer (`AvailabilityDayDrawer.tsx:361`). Four places edit hours and one copies a day: five entry points to one concept holds, with the wizard in place of `OperatingHoursStep`. `OperatingHoursStep.tsx` (and its tests) is dead UI.
- **Correction — tables and Tonight.** The brief said physical resources are "blocked from Tonight and the day drawer". Tonight **does** block tables (`TonightControl.tsx:81,434` `block_tables`, targets all, a `location:` group, or picked tables, lines 65,134,192-204); the day drawer has no table targeting (no table reference in `AvailabilityDayDrawer.tsx`). `DateRule.targetKind = tables` exists, but Tonight groups by the free-text `Table.location`, not by `FloorPlanSection`: two groupings of the same room, and the hierarchy the Manager drew on `/floor-plans` is not what availability uses.
- **Prior-run deferrals:** venue-availability `ux.md` "Flows: Phases 2–5" (areas/sections F15).
- **Open issues:** none about availability setup UX (`gh issue list --search "availability in:title"` → only #7493 tracking); the venue-availability follow-ups (#7682–#7706) and audit issues (#7981, #7983, #7984) are closed (brief, from the orchestrator's read).
- **Work in flight (duplication check, 2026-11-07, pre-flight):** outcome **no work in flight**. `git branch -r | grep -iE 'availab|setup-hub|hierarch'` → only `origin/docs/venue-availability-autorun-2026-11-07` (#8470, merged; this run's base commit) and `origin/fix/availability-drawer-diffs` (#7599, merged 2026-10-25). `gh pr list --state all --search "availability setup hierarchy in:title"` → `[]`. This is a run-start check by the orchestrator, not re-run by Idea.

## Ambition rung

Chosen: Showstopper, in the user's words: "Having clearer UX for different resource types and hierarchy of resources would make it easier for me to follow." (Taken as the skill's recommended default per the brief's standing instruction; see assumptions.)
Not taken: Solid: rename the resource types and add a links-only "Venue setup" page, no live view; Moonshot: availability proposes its own resource tree from venue type, history and listings (seeded in `docs/backlog.md`).
Demo: pass — the Manager opens an empty venue's setup map, sets up a two-service varied week, and watches the hierarchy fill in (venue → schedule → services; venue → floor plan → sections → tables) with the guest-view strip showing the result; the after is a drawn tree, not a metric.
Removes a step: pass — removes "open each page until you find the control": every resource node links to its one editor, so the page search step is gone.
Only this product: pass — the product already holds the venue's readiness, the schedule/service/date-rule config and the floor plan, and today shows none of how they connect; no other tool has this venue's data.
Achievable: pass — riskiest piece is composing the schedule, service, date-rule and floor-plan reads into one hierarchy without a section-level rule in the model; the two-day spike is a read-only setup map over the existing availability-config and floor-plan hooks for one fixture venue, with each node linking to today's editors.

## The demo

Before: a new Manager clicks Set operating hours, lands on a calendar, clicks Create floor plan, lands on a different page, and never sees that hours, services, closures and tables belong to one structure. After: one setup surface shows the venue as a tree whose nodes (hours and schedules, services, special dates, booking channels, sections and tables) fill in as they set them up, each opening its one editor.

## Riskiest piece + spike

Showing a real hierarchy for physical resources when `DateRule` has no section target and Tonight groups by free-text `location`. Spike (~2 days): build the read-only setup map for one fixture venue from today's hooks, with section nodes derived from `FloorPlanSection → Table` and a "block this section" action expressed as a `tables` rule over that section's tables; judge whether the tree reads correctly without a schema change.

## Cheapest kill test

Show a static mock of the tree beside today's nav to one person who has not seen the product and ask them to find where to change Friday's hours and where to block the patio for one date. If they cannot, no hub fixes it. The Owner is the only tester available, so this is run by the Owner on a click-through, and the result counts as one anecdote.

## Solution hunch

One setup surface that names each resource type (hours/schedules, services, special dates, sections/tables, booking channels) and shows how they nest, with today's editors re-homed under it rather than rebuilt. A hunch, not a design.

## Success in one sentence

"A new Manager, from an empty venue and without help text, can say what each resource type is and where to change it, and sets up a two-service varied week plus one section blocked for one date in ≤5 minutes."

## Unknowns & risks

- Whether the IA change fits the existing model, or a visible hierarchy needs a model change. Concretely, "one section blocked for one date" has no section target in `DateRule` (`schema.prisma:658`); it is only expressible as a `tables` rule over the section's tables, and Tonight's grouping uses `Table.location`, not `sectionId`. Architect decides.
- The only tester is the Owner: 1 anecdote, 0 independent operators, so success is not independently testable before release.
- Route and nav changes touch bookmarks, the `/setup/hours` redirect (`main.tsx:367`), the readiness-dependent nav (`nav-sections.ts`), the onboarding wizard hand-offs and the e2e suites (`availability-*.spec.ts`, `onboarding.spec.ts`).
- "Simplify" could hide controls power users need (Compare services, Tonight, History, Booking rules).
- Dead `OperatingHoursStep` UI exists on `main`; whether to remove it is a scope question for PRD (it is a naming and duplication matter, not behaviour).
- No outside corroboration was gathered; silence is not a finding.
