---
stage: idea
run: feature:availability-setup-hierarchy
date: 2026-11-07
amended: 2026-11-08
assumptions:
  - "Success sentence is the orchestrator's draft (brief, Idea inputs, [orchestrator default]); the ≤5 minute bar reuses the venue-availability PRD small-setup bar and PRD may sharpen it."
  - "Ambition ladder: the brief's standing instruction is the skill default, so Showstopper (recommended) is chosen, not picked live by the Owner; the four tests were run silently and all pass."
  - "Delivery shape (one branch and PR per breakdown item off main, merged under the release authorization) is an orchestrator default; it does not change this brief."
  - "Success criteria in the brief are derived from the drafted success sentence, not answered one by one; PRD sharpens them."
  - "The Showstopper moment (a setup map that fills in as the venue is configured) is drafted from the Owner's goal wording and the code read below; the Owner approved the brief but has not seen this moment."
  - "Evidence count of 1 (the Owner) and 0 independent operators is the Owner's live answer; no outside corroboration was run (the optional last30days step was not offered)."
  - "Amendment 2026-11-08: the Owner folded a second request into this run (live interview, every answer the Owner's own): onboarding and post-onboarding availability configuration should match, and /availability is overwhelming. The Owner picked the Showstopper rung live, accepted the success sentence, and kept one unknown (run churn) from the four offered. The 2026-11-07 rung, demo and success sentence are superseded below; the original Venue Setup hub work stays as merged."
---

# Idea: Availability setup hierarchy

> As a user, I am confused about how to set up availability. Having clearer UX for different resource types and hierarchy of resources would make it easier for me to follow. I want to simplify the UX without sacrificing usability.

> Amendment, 2026-11-08 (Owner, verbatim): "update the availability configuration during onboarding to match the configuration during after onboarding. Make it easier to understand the object heirarchy in both places." — "the experience should be consistent but also flexible. The current availability page is overwhelming with too many options and it's difficult to follow the heierarchy"

## Problem

"I am confused about how to set up availability. I can't see what kinds of things I'm configuring or how they fit together, so I don't know where to go to change something."

The venue Manager cannot see the resource types behind availability (weekly hours, schedules, services, special dates, booking channels, sections and tables) or how they nest, so each change starts with a search for the page that holds the control.

**Amendment (2026-11-08).** The Owner's sharpened problem: "The experience should be consistent but also flexible. The current availability page is overwhelming with too many options and it's difficult to follow the hierarchy." Mapping the hierarchy on a separate hub does not fix it: `/availability` itself is too dense, and onboarding and `/availability` frame the same data differently, so what a Manager entered during onboarding is not recognisable afterwards.

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
- **Amendment evidence (2026-11-08, `origin/main`).** The weekly-hours form is already one component: the onboarding wizard (`VenueOnboardingPage.tsx:219` → `QuickSetupHoursStep.tsx:74`) and the Change regular week / Schedule editor drawers and the empty-venue card all render `QuickSetupForm`. The mismatch is the frame and vocabulary: onboarding shows a flat services + days form with the guest-view strip and never names _schedule_ or _regular week_; `/availability` puts that form behind drawers under Calendar | Special dates | Schedules tabs beside Tonight, Booking rules, Compare services, History and Go to date, and this run's `ux.md:86` keeps every one of them in place. Anecdote: 1 report, the Owner's own, 0 independent operators. Whether the Owner's view was before or after #8493/#8499 deployed was not established.
- **Work in flight (amendment, 2026-11-08):** outcome **something already does this work** — this run itself. Its nine code PRs (#8483–#8489, #8493, #8499) are merged, #8482 (e2e) is open, and its artifacts live only on `feat/availability-setup-hierarchy`; `ux.md:15,321` flags the onboarding hours step "for the Owner". The Owner chose to fold the request into this run rather than open a second one. Other unmerged availability branches (`feat/availability-quick-setup`, `fix/onboarding-settings-same-rules`, the `fix/availability-*` worktrees) carry no run for this surface.

## Ambition rung

Chosen: Showstopper (picked live by the Owner, 2026-11-08), in the user's words: "the experience should be consistent but also flexible."
Not taken: Solid: same words and order (venue → schedule → services → days) in both places, rarely used actions moved behind a More menu; Moonshot: availability proposes schedules, special dates and closures from venue type, listing and history and the Manager only confirms (already seeded in `docs/backlog.md` by this run's 2026-11-07 pass; not seeded twice).
Superseded (2026-11-07 Showstopper, built and merged): a Venue Setup hub that draws the hierarchy and links to today's editors. It stays as merged; this amendment changes `/availability` and onboarding.
Demo: pass — the Manager finishes onboarding, opens `/availability` and sees exactly the first screen they just filled in, their hours in it, with a small "Add a second schedule / special date" step beside it.
Removes a step: pass — removes re-learning the page and hunting for the regular week after onboarding.
Only this product: pass — it builds on the onboarding draft and the saved venue config, which only this product holds.
Achievable: pass — riskiest piece is hiding the deeper layers without losing any control; the two-day spike is in the section below.

## The demo

Before: a Manager finishes onboarding's flat hours form, opens `/availability`, and meets tabs, drawers and a row of actions with no sign of the hours they just entered. After: `/availability` opens on the same first layer as onboarding — their services and the days they run, with the guest-view strip — and schedules, special dates and booking rules appear one layer down only when asked for.

## Riskiest piece + spike

Progressive disclosure on `/availability` without losing a control or slowing a frequent one. Spike (~2 days): render the saved config through `QuickSetupForm` as the first layer of `/availability` for one fixture venue, move every other action one layer down, and run this run's no-control-lost e2e (#8482) against it.

## Cheapest kill test

Put a click-through of the layered `/availability` first screen next to the onboarding hours step and ask the Owner to add a second schedule and one special date without help. If the Owner still calls the page overwhelming or cannot find the second layer, layering does not fix it. One anecdote.

## Solution hunch

One layered availability editor used in both places: onboarding and `/availability` share the same first layer (services and their days, same words, same strip), and `/availability` reveals schedules, special dates, booking rules and the operational actions one layer down. The Venue Setup hub keeps mapping the wider hierarchy. A hunch, not a design.

## Success in one sentence

"A Manager who finishes onboarding opens `/availability` and recognises the same first screen with their own hours, and can add a second schedule or a special date without help, while every control that exists today is still reachable."

Superseded 2026-11-07 sentence: "A new Manager, from an empty venue and without help text, can say what each resource type is and where to change it, and sets up a two-service varied week plus one section blocked for one date in ≤5 minutes."

## Unknowns & risks

- **Run churn (amendment, the Owner's kept unknown).** This reopens PRD, UX and breakdown after nine merged PRs. Some merged work may conflict with layering and need reversing — for example the always-shown Schedules tab (#8488) and `ux.md:86`'s rule that every control keeps its place on Availability.
- Whether the IA change fits the existing model, or a visible hierarchy needs a model change. Concretely, "one section blocked for one date" has no section target in `DateRule` (`schema.prisma:658`); it is only expressible as a `tables` rule over the section's tables, and Tonight's grouping uses `Table.location`, not `sectionId`. Architect decides.
- The only tester is the Owner: 1 anecdote, 0 independent operators, so success is not independently testable before release.
- Route and nav changes touch bookmarks, the `/setup/hours` redirect (`main.tsx:367`), the readiness-dependent nav (`nav-sections.ts`), the onboarding wizard hand-offs and the e2e suites (`availability-*.spec.ts`, `onboarding.spec.ts`).
- "Simplify" could hide controls power users need (Compare services, Tonight, History, Booking rules).
- Dead `OperatingHoursStep` UI exists on `main`; whether to remove it is a scope question for PRD (it is a naming and duplication matter, not behaviour).
- No outside corroboration was gathered; silence is not a finding.
