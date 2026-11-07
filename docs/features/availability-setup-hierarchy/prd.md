---
stage: prd
run: feature:availability-setup-hierarchy
date: 2026-11-07
ux: required
assumptions:
  - "Brief success criteria are orchestrator drafts; this PRD sharpens them. Brief criteria map to PRD 1 (hierarchy surface), 2 (one primary editor), 3 (varied week), 8 (old routes), 10 (hosts), 11 (locales), 12 (existing suites). Changes: criterion 1 names the resource types and the parent/child pairs; criterion 2 turns 'exactly one primary editor' into a per-type table check; criterion 3 fixes the ≤5 minute bar as a scripted-interaction count plus a timed Owner walkthrough that counts as one anecdote."
  - "Added criterion 5 (one term per concept across surfaces, including the pre-launch versus post-launch nav labels). The brief's Scope asks for clearer naming but its Success criteria list has no check for it."
  - "Added criterion 6 (a setup surface and its nodes show the current state of each resource, empty or configured). The Showstopper moment in idea.md depends on it; the brief criteria do not state it."
  - "Added criterion 7 (no control that exists today becomes unreachable: Compare services, Tonight, History, Booking rules, Copy day, Change regular week). It answers the idea's 'simplify could hide controls power users need' risk."
  - "Added criterion 9 ('the demo runs as written'), required by the prd skill because idea.md carries a demo script. The script is copied from idea.md."
  - "Decision on the dead `OperatingHoursStep` component (idea.md): removing it, its tests and its stale references is IN scope as a naming/duplication cleanup that makes 'one primary editor per resource type' true in the code as well as the UI. Its validation-error type stays available to the three importers. This is the PRD's call, not the Owner's; the Owner can veto at the PRD approval gate."
  - "Section/table blocking: the PRD states the user-visible requirement (a Manager can block a named section for one date, and sees the same section grouping on Tonight, the day drawer and /floor-plans) and leaves the mechanism open. Whether that needs a model change is Architect's call (Owner: 'Architect decides')."
  - "The venue-availability small-setup bar (≤5 minutes) is reused as the time target. The brief's two-service varied week plus one blocked section is the fixture; the PRD adds no other scenario."
  - "Evidence stays at 1 anecdote (the Owner) and 0 independent operators; the PRD claims no validation and criterion 3 is labelled accordingly."
---

# PRD: Availability setup hierarchy

## Problem statement

"I am confused about how to set up availability. I can't see what kinds of things I'm configuring or how they fit together, so I don't know where to go to change something." (Owner, 2026-11-07.)

The venue Manager configures a venue across separate pages: the `/setup` checklist, `/availability` and `/floor-plans`. No screen names the resource types (weekly hours and schedules, services, special dates, booking channels, sections and tables) or shows how they nest. The same resource carries different labels before and after launch ("Set operating hours" and "Create floor plan", then "Availability" and "Floor plans"). Regular hours can be edited from four places and a day can be copied from a fifth. Tonight blocks tables by free-text location while `/floor-plans` defines sections, so the room is grouped two ways. The Manager copes by opening each page until the control turns up.

This is one anecdote from the Owner. Nothing here is validated by an independent operator.

## Solution

When this ships, a Manager has one place to set up and change the venue that shows every resource type in scope and how they nest: venue → schedules → services; venue → floor plan → sections → tables; and date overrides with the thing each one targets. Each node says what the resource is, shows whether it is set up, and opens the one editor for it. Every other place that touches the resource (onboarding, Tonight, the day drawer) links to that editor rather than carrying its own copy.

Each concept has one name on every surface, before and after launch. Nothing the Manager can do today is removed or hidden; controls move or are linked, not dropped. Old URLs still work. Hosts see only what they can use.

How this looks and where it lives is the UX stage's decision. How the section grouping is stored is the Architect's.

## Actors

- **Manager** — the venue owner or manager who sets up a venue and changes its availability and floor plan. The person with the problem. New Managers start from an empty venue.
- **Host** — floor staff with a view-only role. Reads availability and the floor plan; must not see editors they cannot use.
- **Guest** — books through the widget. Not a user of this surface, but the guest-view strip shows what they will see, and nothing here may change what they see.

## User stories

1. As a Manager, I want one setup surface that lists the kinds of things I configure and how they nest, so that I know what exists and where each thing sits before I touch anything.
2. As a Manager, I want each resource on that surface to open its one editor, so that I do not search pages for the control.
3. As a new Manager with an empty venue, I want to see which resource types are not set up yet and what each one is, so that I can work through them in order without help text.
4. As a Manager, I want to set up a two-service varied week without more steps than today, so that a clearer layout does not cost me time.
5. As a Manager, I want to block one named section of the floor for one date, so that I close the patio the way I drew it on the floor plan.
6. As a Manager, I want the same name and the same section grouping for a resource on every page, before and after launch, so that I am not reading two vocabularies for one thing.
7. As a Manager who already uses Tonight, Compare services, History, Booking rules, Change regular week and Copy day, I want them to stay reachable, so that simplifying does not take away tools I rely on.
8. As a Manager with a bookmark or an onboarding link to `/availability`, `/floor-plans`, `/setup` or `/setup/hours`, I want it to keep working, so that the redesign does not break my routine.
9. As a Host, I want to see the venue's availability and floor plan without editors I cannot use, so that I am not offered actions that fail.

## Success criteria

Checks are by component test, e2e, or a person, as marked. Criteria 1-4 and 9 are the acceptance bar; the rest guard against regressions.

- [ ] 1. **One surface shows every type and its nesting.** A single setup surface lists each of: weekly hours and schedules, services, special dates (closures and overrides), booking channels, floor plan, sections, tables. It shows these parent/child pairs: venue → schedules → services; venue → floor plan → sections → tables; date overrides → their targets (venue, service, booking channel, tables or sections). A one-schedule venue still shows the schedule level. Component + e2e.
- [ ] 2. **One primary editor per resource type.** For each resource type in criterion 1, a table in the e2e names its primary editor, and no other surface renders a second editor for it; other entry points (onboarding step, Tonight, day drawer, nav, `/setup` checklist) navigate to the primary editor. The same scripted e2e counts editors per resource type on one fixture venue before the change and after it; the "after" count is 1 for every type. Regular-hours entry points drop from today's five (wizard step, quick setup, Change regular week, Schedules tab editor, Copy day) to the primary editor plus links; Copy day and quick setup may stay as actions inside the primary editor's flow.
- [ ] 3. **The setup scenario is fast, and not slower than today.** On the fixture empty venue, the scripted e2e sets up a two-service varied week (the `availability-quick-setup.spec.ts` varied-week scenario) and then blocks one named section for one date. The varied-week part takes no more interactions than the same scenario on `origin/main` @ `7c051456f`; the whole script finishes inside the ≤5 minute small-setup bar when the Owner times it by hand. The hand timing is one anecdote, not validation; an independent operator is not available.
- [ ] 4. **Block a section for a date.** A Manager picks a named section (as listed on the floor plan) and one date and blocks it; the section's tables are unavailable for that date to guests, and the date shows the section by name, not a list of tables. Component + e2e + service test for the guest-facing result. Mechanism is the Architect's.
- [ ] 5. **One term per concept.** A scripted check of nav items, page titles, setup-surface labels, checklist steps and drawer titles finds one label per resource type, identical before and after launch for the same destination. A glossary of terms is recorded by UX and used as the test fixture; the venue-availability `ux.md` "Voice & terms" stays the baseline.
- [ ] 6. **State is visible.** On an empty venue every node shows "not set up" plus what it is; after the Manager configures hours or a section, the node shows its current value or count without a page reload beyond the editor's own save. Component test per resource type.
- [ ] 7. **No control lost.** A scripted e2e on the fixture confirms each of Tonight, Compare services, History, Booking rules, Change regular week, Copy day, the Special dates tab and the guest-view strip is still reachable by a Manager and still performs its action. Their existing specs stay green unchanged or are updated only where the entry point moved, and each such update is listed in the PR body.
- [ ] 8. **Old routes still work.** `/availability`, `/floor-plans`, `/setup/hours` and `/setup` each resolve (render or redirect to where the content now lives, with no 404). The `/setup` readiness redirect still bounces an unready venue to the setup flow and does not redirect once the venue is operational. e2e.
- [ ] 9. **The demo runs as written.** Script (copied from `idea.md` § The demo): _Before: a new Manager clicks Set operating hours, lands on a calendar, clicks Create floor plan, lands on a different page, and never sees that hours, services, closures and tables belong to one structure. After: one setup surface shows the venue as a tree whose nodes (hours and schedules, services, special dates, booking channels, sections and tables) fill in as they set them up, each opening its one editor._ Checkable body: open the setup surface on the fixture empty venue; every node in criterion 1 is present and marked not set up; set a two-service varied week; the hours, schedule and service nodes update and the guest-view strip shows the result; add one section and block it for one date; the section node and the date override appear in the tree; each node opens its one editor. E2E.
- [ ] 10. **Hosts see no unusable editor.** Signed in as a Host, no setup-surface node, nav item or page shows an editor, save button or "set up" call to action; read-only views remain. Component + e2e.
- [ ] 11. **Three locales.** Every new or changed string exists in en-US, es-MX and fr-CA; the i18n key-parity test passes. Existing tests for message coverage stay green.
- [ ] 12. **No regressions.** The existing suites named in the brief stay green: `packages/availability` (including the engine property test), availability and floor-plan tests in `services/reservations`, availability, floor-plan and venue-onboarding component tests in `apps/hospitality`, and e2e `availability-*.spec.ts`, `onboarding.spec.ts` and the floor-plan specs. Changes to expectations only where an entry point moved.
- [ ] 13. **Dead onboarding hours component removed.** `OperatingHoursStep` and its tests are deleted, nothing in `apps/hospitality` imports it, and the onboarding wizard still renders `QuickSetupHoursStep`. Typecheck and the onboarding component tests pass.

## Out of scope

- New section- or area-level availability rules beyond what criterion 4 needs; the full Phase 3 (areas, per-section service hours, seating limits). If criterion 4 cannot be met without any model change, Architect keeps it to the smallest one and records why.
- Holidays, pacing and turn times, policies, events (Phases 2, 4, 5).
- Menus and the booking widget as resources; their nav entries stay as they are.
- Guest-facing booking behaviour: the guest sees the same availability as before, except that a blocked section blocks its tables (criterion 4).
- Venue-availability's and availability-config-usability's Owner-only post-release steps (production backfill, migration confirm, timed walkthrough, collapse script).
- External listing sync, group cascade.
- A new editor for any resource type. Existing editors are re-homed and linked; they are rebuilt only where UX shows a re-home cannot work.
- Role or permission changes. Hosts stay view-only and Managers stay editors.
- Seeding a resource tree from venue type or history (the Moonshot rung in `idea.md`).
- Independent-operator research. None is available; the run does not claim validation.

## Open questions

- Does "block this section for a date" need a section-level target in the stored rules, or can it be expressed over the section's tables on today's model, and what happens when a table is moved between sections afterward? — Architect.
- Should Tonight's grouping move from free-text table location to floor-plan sections, and what happens to venues whose locations and sections disagree? — UX proposes, Architect decides the mapping.
- Where does the setup surface live in navigation (replace the "Get Started" and "Manage" entries, sit beside them, or become the landing for `/setup`), and does the `/setup` readiness redirect still target it? — UX, with Architect on route contracts.
- Is the per-schedule level shown to a one-schedule venue as a node or collapsed into the venue node? Criterion 1 requires it to be visible. — UX.
- What is the glossary entry for each of the resource types in criterion 5, including "schedule" versus "week" and "section" versus "area"? — UX, against venue-availability `ux.md` "Voice & terms".
- Can anyone besides the Owner time criterion 3? Without one, the ≤5 minute check is a single anecdote. — Owner.
