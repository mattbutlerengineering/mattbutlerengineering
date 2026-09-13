---
stage: idea
run: feature:venue-onboarding-floor-plan
date: 2026-08-30
assumptions:
  - "Slug: the user never chose one; `venue-onboarding-floor-plan` is the orchestrator's default, adopted as the run ref."
  - "Run scale: the user did not state product vs feature; the orchestrator's default of a feature run (artifacts under docs/features/) is adopted."
  - "Problem statement: the sufferer's-voice quote was orchestrator-drafted, not user-quoted; adopted and sharpened against the code."
  - "Who has it / coping: the restaurant-manager answer (project owner and self-serve prospects today; cope via the manual six-screen path or give up) was orchestrator-drafted; adopted, with the coping path corrected against the code and a live probe."
  - "Why now: the '#4492 opened the self-serve door, the floor plan is the last required step, first customers are the funnel' rationale was an orchestrator draft; adopted."
  - "Solution hunch: orchestrator-drafted; adopted as a hunch only, not a design."
  - "Success sentence: an orchestrator draft; adopted in substance."
  - "Unknowns: the brief's six risks were orchestrator-drafted; adopted, corrected where the code disagreed, and extended with what the repo read and one live probe added."
  - "'World class': the brief's reading of the user's words (one continuous flow, live template previews, a tactile canvas, a Launch that shows its work, rialto tone) is the orchestrator's; recorded as input for UX to refine, not as requirements."
  - "Blank template as the floor: with no skip path and blank in scope (both the user's decisions), every venue leaves the wizard with an active plan that may hold zero tables; the brief asked for this to be logged if relied on, and the success sentence relies on it."
surfaced:
  - "Production frequency of the dead end is unmeasured: no Sentry or analytics query was run at this stage, and the user-report count is zero (n = 0; label fixed by the user)."
  - "Whether the self-serve door #4492 opened works live is unverified: its own retro records that the feature 'has never run against a real database or a real Auth0 account' and that the non-admin journey account is still unprovisioned, so 'the first thing a prospect hits' is inferred from code, not observed."
  - "Scope of a measured pre-existing defect: `@mbe/api-client` posts activate to `/floor-plans/:id/active` and positions to `/floor-plans/:id/bulk-update-positions`; the service registers `/:id/activate` and `/tables/positions`; the deployed API answered 404 to both client paths on 2026-08-30. Whether this run fixes the client as a dependency or a maintenance run does it first has no default at this stage."
  - "Template contents: what a restaurant / cafe / bar / patio template holds (table count, names, capacities, shapes, positions) has no source anywhere in the repo — IMPROVEMENT-BACKLOG § 13 is one sentence — and there is no default to take."
  - "A second file shared with the parallel `auth-handshake-flows` run: its #4728 (open, `blocked`) rewrites the gate paragraph of `apps/hospitality/CLAUDE.md`, which this run also edits (pages/components tables, the stale 5-step line); the brief lists only `App.tsx`. Sequencing is a Decompose decision with no default here."
---

# Idea: Floor plan inside the new-venue wizard

Origin: the user's direct request, verbatim — "add the floorplan editor to the
new venue flow. make it a world class experience". No backlog seed claimed.
Prior art: PR #4492 (`feature:first-venue-self-serve`, merged 2026-08-23 as
`d08fd4969`), which let a zero-membership identity create its first venue; this
run is the step after that door. Fixed by the user, not assumptions: the editor
is a wizard step; templates restaurant / cafe / bar / patio / blank are in
scope; a backend transactional bootstrap endpoint is allowed if the Architect
wants it (Prisma schema changes are not); no skip-for-now path; no full editing
on mobile (template pick + preview there, editing desktop-first); tracker =
GitHub issues; release = merge on green.

## Problem

In the sufferer's words (orchestrator-drafted, see assumptions):

> I filled in five screens, hit Launch, got a checkmark and a toast telling me
> to "finish setup" — and a dashboard with nothing on it. I had to find Floor
> Plans in the sidebar, make a plan, add tables one dialog at a time, and then
> find Activate. Until I did, the Timeline was blank and I thought the product
> was broken.

Sharpened against the code (`apps/hospitality`, `main` at `1d6189203`,
2026-08-30):

- **The wizard ends at venue creation.** `useOnboardingWizard.ts:11` —
  `export const TOTAL_STEPS = 5;` — and `onboarding-steps.ts:16-20` list
  Welcome, Location, Hours, Settings, Launch. There is no floor-plan step and
  no floor-plan slice in `OnboardingWizardData` (`useOnboardingWizard.ts:13-18`).
- **Launch says two contradictory things in one transition.**
  `LaunchStep.tsx:100` celebrates with "You're ready to take reservations"; the
  toast fired by `VenueOnboardingPage.handleLaunch`
  (`VenueOnboardingPage.tsx:56-61`) says the venue "is ready — finish setup to
  start taking reservations"; then `handleCelebrationDone`
  (`VenueOnboardingPage.tsx:67-69`) runs
  `navigate("/dashboard", { replace: true })`. Nothing on the dashboard says
  what "finish setup" means.
- **The venue has no tables, so the core screen is empty.** The Timeline reads
  `useTables({ venueId, limit: 100 })` (`useTimelineData.ts:86-90`); a venue
  straight out of the wizard has none.
- **The documented flow says otherwise.** `apps/hospitality/docs/USER-FLOWS.md:31-32`
  — step 7 "Redirected to Floor Plan creation for the new venue", step 8
  "Creates floor plan → adds tables → activates the plan". Acceptance criteria
  at `:41-42` — "After venue creation, floor plan editor opens with the new
  venue's ID" and "Floor plan can be activated immediately" — are unchecked
  and unreachable from the wizard. The Done definition at `:46` — "Manager has
  a venue with at least one active floor plan containing tables. Timeline page
  shows the venue's tables." — cannot be met by the wizard alone.

## Who has it

- The **Restaurant Manager** persona (`apps/hospitality/CLAUDE.md:95`) on the
  first venue. A zero-venue account cannot see the dashboard at all —
  `DashboardLayout.tsx:83-86, 252-254` sends `no-venue` readiness to
  `/onboarding` — so the wizard is the forced first screen and its exit is the
  first dead end.
- In practice today: the project owner, and any prospect coming through the
  self-serve path #4492 opened (whether one has: see surfaced).
- **Coping today, as the code actually behaves** (the brief's six-screen path,
  corrected): `/dashboard` → sidebar → `/floor-plans` → `NewFloorPlanDialog`
  (`FloorPlansPage.tsx:124-127`; `onCreated` navigates to `/floor-plans/:id`
  at `:78`) → "+ Add Table" once per table (each `AddTableDialog` submit is an
  immediate `POST /api/v1/tables` via `useAddTable`,
  `FloorPlanEditorPage.tsx:209-213`) → drag → "Save Changes" → "Set as
  Active". The last two do not work against production (measured — Evidence),
  so the honest coping path is: create the plan and the tables, then give up
  on positions and activation — or give up entirely.

## Why now

- #4492 (merged 2026-08-23) made the wizard reachable by a fresh identity
  with no admin role; before it, only an admin could create a venue and the
  dead end was the owner's own problem. The gap is now the first thing after
  sign-in for exactly the audience the first-customers plan
  (factory-as-a-service funnel) is trying to reach.
- The floor plan is the last thing between a new venue and the product doing
  anything: the Timeline (`useTimelineData.ts:86-90`) and walk-ins need
  tables; Flow 1's Done definition needs an active plan with tables.
- Everything the step needs already exists and is tested — the canvas, the
  geometry, the dialogs, the routes — so the cost is wiring, not invention,
  and the wiring is cheapest while #4492's venue-bootstrap model is fresh.

## Evidence

**Label: documented spec gap only, n = 0 user reports** (fixed by the user;
never upgraded). Nobody has reported this. The case rests on the repo's own
documents and code, re-read on 2026-08-30 at `main` `1d6189203`, plus one
unauthenticated probe of the deployed API.

**Documented gap**

- `apps/hospitality/docs/USER-FLOWS.md:19` Flow 1 "First-Time Venue Setup
  (Manager)"; steps 7–8 at `:31-32`; the two unmet criteria at `:41-42`; the
  Done definition at `:46` — all quoted in Problem above.
- `apps/hospitality/docs/IMPROVEMENT-BACKLOG.md:223-225` — "### 13. Floor Plan
  Templates / Preset layouts (restaurant, cafe, bar, patio) that users can
  start from instead of empty canvas." P3, one sentence, no further spec.

**Measured in code**

- `VenueOnboardingPage.tsx:68` — `navigate("/dashboard", { replace: true });`
  and `:58` — the "finish setup to start taking reservations" toast.
- `onboarding-steps.ts:15-21` — five entries. `useOnboardingWizard.ts:11` —
  `TOTAL_STEPS = 5`; `:157` — `Math.min(validated.step + 1, TOTAL_STEPS)`;
  `:120-121` — any step past 4 validates as trivially `valid: true`.
- Two step counts, not one: `StepIndicator` takes `totalSteps={TOTAL_STEPS}`
  (`VenueOnboardingPage.tsx:78`, rendered at `StepIndicator.tsx:22`) while
  `VerticalStepRail` maps `ONBOARDING_STEPS` (`VerticalStepRail.tsx:34`).
  Pinned by `useOnboardingWizard.test.ts:242` — `expect(TOTAL_STEPS).toBe(5)`
  — and `StepIndicator.test.tsx:8,15,27,43` hardcode `totalSteps={5}`.
- `apps/hospitality/e2e/onboarding.spec.ts:123` —
  `test("advances through all 5 steps to confirmation"` — asserts at
  `:155-157` that one Next after Settings shows the Launch button.
- `apps/hospitality/CLAUDE.md:38` — "`venue-onboarding/` — 5-step wizard:
  BasicInfo → Location → OperatingHours → Settings → Confirmation" (labels
  already drifted from `onboarding-steps.ts`).

**Measured on the deployed service** — a pre-existing defect on the path this
feature reuses. It does not change the evidence label above; it changes the
risk section.

- `packages/api-client/src/floor-plans.ts:56` posts to
  `` `/api/v1/floor-plans/${id}/active` ``; `:72` posts a bare positions array
  to `` `/api/v1/floor-plans/${floorPlanId}/bulk-update-positions` ``.
- `services/reservations/src/routes/floor-plans.ts:219` registers
  `"/:id/activate"`; `:251` registers `"/tables/positions"` with a
  `{ floorPlanId, positions }` body; mounted at `/api/v1/floor-plans`
  (`app.ts:175`).
- Both suites are green against their own side:
  `packages/api-client/src/floor-plans.test.ts:155-188` pins `/active` and
  `/bulk-update-positions`; `services/reservations/src/routes/floor-plans.test.ts:515-526`
  pins `/activate`. The E2E mocks mirror the client (`e2e/api-mocks.ts:411,
415`), so nothing in the repo can see the disagreement. The client path
  dates from `23dcad59c`, the route from `6d414f440`.
- Probe, 2026-08-30, `https://api.mattbutlerengineering.com` (local resolver
  and `@1.1.1.1` agree on the origin): `POST /api/v1/floor-plans/probe-id/active`
  → **404**; `/activate` → 401 (`requireAuth`); `/bulk-update-positions` →
  **404**; `/tables/positions` → 400 (schema — route present); control
  `GET /api/v1/floor-plans` → 401. So `FloorPlanEditorPage`'s "Set as Active"
  (`:263-267` → `useActivateFloorPlan`, `useFloorPlans.ts:67-73`) and every
  position save (`:117` → `useBulkUpdatePositions`, `useFloorPlans.ts:82-89`)
  fail against production today. Consistent with n = 0: nobody has used it.

SURFACED: how often anyone hits the dead end is unmeasured, and whether the
self-serve path itself works live is unverified
(`docs/features/first-venue-self-serve/retro.md:49, 118-123`).

## Solution hunch

A hunch, not a design. User decisions are marked as such.

- **A sixth wizard step between Settings and Launch** (user's decision),
  holding a _draft_ floor plan in wizard state: pick a template — restaurant,
  cafe, bar, patio, blank (user's decision; blank is the floor, no skip path)
  — then arrange it on the real canvas. Reuse `FloorPlanCanvas`
  (`FloorPlanCanvas.tsx:22-44` takes `floorPlan`, `tables`, callbacks, and
  reads only `floorPlan.name` / `isActive` at `:127-128`), `TableShape`,
  `AddTableDialog` (`AddTableDialog.tsx:17-22` wants `venueId` / `floorPlanId`
  strings and hands back a `CreateTableRequest`, `:64-78`) and
  `floor-plan-geometry.ts:15-28` (800×600, 20 px grid, `SHAPE_DEFAULTS`).
  Template previews drawn from the same geometry. No second canvas.
- **Launch becomes a visible sequence**: venue → plan → tables → active, with
  progress the user can watch and a failure they can resume from without
  re-entering five screens. Whether that is N client calls or one
  transactional bootstrap route in `services/reservations` is the Architect's
  call (user's decision: allowed; Prisma schema changes are not). Precedent
  exists on both halves: `floorPlanService.clone` already creates a plan and
  its tables in one `prisma.$transaction` with `tx.table.createMany`
  (`services/floor-plan.ts:187-220`), and `CreateFloorPlanRequest.isActive` is
  accepted at creation (`packages/types/src/floor-plan.ts:28`,
  `schemas/reservation-requests.ts:138`, honoured at
  `services/floor-plan.ts:152`) — for a venue with no other plans, "create it
  active" may be one call fewer than "create, then activate".
- **Land with the plan live**: after Launch the new venue is selected and its
  tables visible — editor or Timeline, UX decides. `VenueContext.tsx:70-75`
  falls back to `venues[0]` only when no stored choice survives; a manager who
  already has a venue needs `setVenueId` (`:85-93`) after `refetchVenues`
  (`:95-97`).
- **Mobile**: template pick + preview; editing desktop-first (user's decision).
- **Use what rialto has** for the Launch sequence — `Progress`, `StatusLED`,
  `Odometer`, `Handshake`, `Meter` all exist under
  `packages/rialto/src/components/` — before adding a component (a new one
  needs a `.changeset`).

Not this run (carried from the brief): a skip-for-now path; full editing on
mobile; Prisma schema or migration changes; `FloorPlanEditorPage` changes
beyond what landing there requires (Flow 6 stays as-is); undo/redo,
multi-floor, rotation, or shapes beyond `SHAPE_DEFAULTS`; `auth.spec.ts` /
`auth.setup.ts`; rialto npm publish; `App.tsx` route changes unless sequenced
behind the auth run's #4728.

## Success in one sentence

A manager who finishes the new-venue wizard ends with a venue whose active
floor plan holds the tables they laid out inside the wizard — no dead end, no
half-created venue, Timeline populated with no extra navigation — verified by
unit tests in `apps/hospitality` (and `services/reservations`,
`packages/api-client`, `packages/types` if touched) and an updated
`onboarding.spec.ts`, with `CI Gate` green.

## Unknowns & risks

- **The activate and save paths are broken today (measured).** The client's
  `/active` and `/bulk-update-positions` URLs 404 on the deployed service; the
  routes are `/:id/activate` and `/tables/positions` (Evidence). Reusing
  `api.floorPlans.setActive` as-is would make Launch fail at its last step.
  SURFACED: fix inside this run as a dependency, or a maintenance run first —
  undecided, no default. Either way the client fix is small and the E2E mocks
  must move with it.
- **Draft model.** `FloorPlanCanvas`, `TableShape`, `AddTableDialog` and
  `CreateTableRequest` are typed on server `FloorPlan` / `Table`
  (`packages/types/src/table.ts:20-36` — `id`, `venueId`, `floorPlanId` all
  present; `reservation.ts:116-127` — `venueId?` / `floorPlanId?` on the
  request) that do not exist before Launch. The wizard needs local ids and a
  typed draft without forking the canvas. The canvas's own use of the plan is
  narrow (`FloorPlanCanvas.tsx:127-128`), which is what makes the hunch
  plausible, but it is unproven.
- **Launch is 3 + N calls or a new route, and partial failure is the real
  enemy.** Today's sequence is `POST /api/v1/venues` (5/min per identity,
  `routes/venues.ts:65`, enforced at `:615`; 409 on a serialization race,
  `:669-676`) → `POST /api/v1/floor-plans` (`routes/floor-plans.ts:145-158`,
  `requireAuth` + `requireVenueAccess`) → `POST /api/v1/tables` per table
  (`routes/tables.ts:136-188`; a duplicate name under
  `@@unique([venueId, name])`, `schema.prisma:163`, comes back as **400** "A
  table with this name already exists", `:178-184`, not 409) → activate. The
  service-wide limiter is 100/min (`create-service-app.ts:176-177`). A failure
  after the venue exists must be resumable without re-POSTing the venue —
  that burns the 5/min cap and, for a non-admin, a second venue is forbidden.
  A transactional bootstrap route removes the partial state but adds a route,
  a client method, a request type and tests.
- **Template contents have no source.** SURFACED: § 13 is one sentence; what
  each template contains, and how its names stay unique per venue, is
  undecided.
- **The canvas in a 40 rem card.** `VenueOnboardingPage.module.css:2` caps the
  wizard at `max-width: 40rem`; the canvas scales to its container
  (`FloorPlanCanvas.tsx:62-78`, `scale = width / CANVAS_WIDTH` at `:71`), so
  the 800 px design renders at most ~0.8× with ~16 px grid cells, less inside
  the Card's padding. Below 768 px the layout stacks
  (`OnboardingLayout.module.css:7-12, 43-49`). Whether a wizard-width canvas
  is usable, or the step has to escape the card, is for UX.
- **E2E coupling.** `onboarding.spec.ts:123` is named and written for five
  steps; it must change (this run may edit it). Playwright cannot usefully
  drive a Konva canvas — assert the step and the template pick, not drags (the
  unit suite already mocks `react-konva`, `FloorPlanCanvas.test.tsx:10`).
  `Hospitality E2E` is advisory and often red for auth reasons; unit tests
  carry the gate.
- **Bundle — smaller than the brief fears.** `/onboarding` is already lazy
  (`main.tsx:29, 73-76`) and konva is already its own `canvas-vendor` chunk
  with a 100 kB budget (`vite.config.ts:32-33`; `apps/hospitality/package.json`
  size-limit). What is unbudgeted is the onboarding chunk itself; size-limit
  objects only if `index-*.js` grows. Lazy-load the step if it does.
- **Venue selection after Launch.** `refetchVenues` alone selects the new
  venue only when it is the first one (`VenueContext.tsx:70-75`); otherwise
  `setVenueId` must run after the refetch, and it refuses ids not yet in the
  list (`:85-93`). Landing on the editor before the list refreshes reads the
  wrong venue.
- **Two shared files with the parallel auth run.** `App.tsx` (its #4728, open,
  `blocked`) and `apps/hospitality/CLAUDE.md` (the same issue rewrites the
  gate paragraph; this run edits the pages/components tables and the stale
  5-step line at `:38`). SURFACED: sequencing.
- **Docs already drift.** USER-FLOWS step 6 (`:30`) says the button is
  "Create Venue"; `LaunchStep.tsx:205` says "Launch Venue". Small, but the
  run's doc updates should fix what they touch.

Next stage: PRD (`prd` skill, or the router). The brief already answers the
UX conditional as `ux: required`, the tracker as GitHub issues (`ready` +
`feature` under a `tracking` parent), and release as merge on green.
