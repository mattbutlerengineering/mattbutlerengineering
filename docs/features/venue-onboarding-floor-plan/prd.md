---
stage: prd
run: feature:venue-onboarding-floor-plan
date: 2026-08-30
ux: required
assumptions:
  - "Slug and scale (inherited from idea.md): `venue-onboarding-floor-plan` and feature-run scale are orchestrator defaults the user never chose."
  - "Problem framing (inherited): the sufferer's-voice quote and the who / why-now / solution-hunch answers were orchestrator-drafted, adopted and re-measured against the code on 2026-08-30 at main 1d6189203."
  - "Blank template as the floor (inherited): every venue leaves the wizard with an active plan that may hold zero tables. This PRD relies on it and adds the measured consequence: a zero-table venue is `setup` readiness, not `operational` (useVenueReadiness.ts:66), so the landing requirement (M9) is written around that rule rather than assuming the Timeline is reachable."
  - "Actor vocabulary: the brief names a persona, not actors; this PRD splits the Restaurant Manager into First-venue manager (the #4492 zero-membership identity the no-venue gate forces into /onboarding) and Multi-venue manager (an admin adding a venue — the VenueContext fallback behaves differently for them), and adds Maintainer for the merges, the api-client fix and the daily live journey."
  - "Template bounds: the brief estimates a template at 10–20 tables; this PRD fixes the requirement at 4–20 tables per non-blank template (upper bound leaves 1 + 1 + 20 + 1 = 23 calls well inside the 100/min service limiter). UX may narrow the range; widening past 20 needs Architect's call-budget check. Concrete layouts are UX Design's, not this PRD's."
  - "Mobile is defined as the existing < 768 px stacked layout (OnboardingLayout.module.css:7-12) rather than only the 375 px the evaluation rubric names; the brief said 375 px and gave no breakpoint, so the layout's own breakpoint is taken."
  - "The daily live venue journey (apps/hospitality/e2e/journeys/venue-journey.spec.ts) is put in scope as a MUST: the brief lists it neither in nor out, and the sixth step breaks it by construction (it clicks Launch Venue after four Nexts). Only auth.spec.ts / auth.setup.ts are frozen by the brief."
  - "A duplicate table name is rejected at draft time with the server's own message (A table with this name already exists) so Launch cannot fail on it; the brief asked only that names stay unique per venue, the mechanism is this PRD's choice."
  - "Draft persistence is in-memory only: a reload before Launch loses the draft exactly as it loses the other four steps today; the brief's Back/Next preservation criterion is read as step navigation, not reload survival."
surfaced:
  - "Production frequency of the dead end is unmeasured (inherited): no Sentry or analytics query was run at Idea or PRD stage; n = 0 user reports, label fixed by the user and never upgraded."
  - "Whether the #4492 self-serve door works live is unverified (inherited): first-venue-self-serve/retro.md records that it has never run against a real database or a real Auth0 account and that the non-admin journey account is still unprovisioned (E2E_NONADMIN_AUTH_EMAIL / _PASSWORD); the journey's non-admin step is skipped every day until then."
  - "api-client fix state at PRD time (external dependency): the corrected paths (/floor-plans/:id/activate; /floor-plans/tables/positions with { floorPlanId, positions }) exist only as uncommitted working-tree edits in this checkout — packages/api-client/src/floor-plans.ts, floor-plans.test.ts and apps/hospitality/e2e/api-mocks.ts (git status M, 19+/11-). HEAD = origin/main = 1d6189203 still posts to /active and /bulk-update-positions; no PR is open yet. Decompose must cite the PR number; Implement must branch after it merges. Not scoped into this run."
  - "Template contents (inherited): what a restaurant / cafe / bar / patio layout holds has no source in the repo (IMPROVEMENT-BACKLOG.md § 13 is one sentence). This PRD sets invariants (M3) and leaves the layouts to UX Design."
  - "Two files shared with the parallel auth-handshake-flows run (inherited): apps/hospitality/src/App.tsx and apps/hospitality/CLAUDE.md (its #4728, open, blocked). Measured here: hospitality's routes live in src/main.tsx (lazy routes at :24-77, `path: setup` at :286), so a landing-route change may not touch App.tsx at all; sequencing is a Decompose decision with no default."
  - "No size-limit entry exists for the onboarding chunk: apps/hospitality/package.json budgets index-*.js (500 kB), canvas-vendor-*.js (100 kB), FloorPlanEditorPage-*.js (3.5 kB) and the vendor chunks only. Whether to add one for the onboarding route, and at what limit, has no default — Architect."
  - "Whether Hospitality E2E will be runnable the day Verify runs is not knowable now (e2e.yml gates the hospitality job on E2E_AUTH0_* secrets and an auth preflight; the job is advisory and often red for environmental reasons), so unit tests carry the gate and the E2E update is confirmatory."
  - "Whether the E2E mock layer (api-mocks.ts) can serve the full create sequence (POST venues, POST floor-plans, POST tables, POST activate) was not measured; only GET venues, GET floor-plans and the activate/positions handlers were read. An E2E assertion on the post-Launch landing is therefore SHOULD, not MUST."
---

# PRD: Floor plan inside the new-venue wizard

Prior art: PR #4492 (`feature:first-venue-self-serve`, merged 2026-08-23 as
`d08fd4969`) let a zero-membership identity create its first venue. This run is
the step after that door: the wizard must hand the manager a venue that works,
not a venue that needs six more screens. Fixed by the user, recorded here as
requirements and never as assumptions: the editor is a wizard step between
Settings and Launch; templates restaurant / cafe / bar / patio / blank; a
backend transactional bootstrap endpoint is allowed if the Architect wants it
(Prisma schema changes are not); no skip-for-now path (blank is the floor); no
full table editing on mobile (template pick + preview there, editing
desktop-first); tracker = GitHub issues; release = merge on green.

## Problem statement

In the sufferer's words (orchestrator-drafted, see assumptions):

> I filled in five screens, hit Launch, got a checkmark and a toast telling me
> to "finish setup" — and a dashboard with nothing on it. I had to find Floor
> Plans in the sidebar, make a plan, add tables one dialog at a time, and then
> find Activate. Until I did, the Timeline was blank and I thought the product
> was broken.

Sharpened against the code (`apps/hospitality`, `main` at `1d6189203`,
2026-08-30 — `idea.md` Evidence, re-read here and extended):

- **The wizard ends at venue creation.** `useOnboardingWizard.ts:11`
  `TOTAL_STEPS = 5`; `onboarding-steps.ts:16-20` lists Welcome, Location,
  Hours, Settings, Launch; `OnboardingWizardData` (`:13-18`) has no floor-plan
  slice. `handleLaunch` (`VenueOnboardingPage.tsx:49-62`) posts the venue and
  nothing else; `handleCelebrationDone` (`:67-69`) navigates to `/dashboard`.
- **Launch contradicts itself.** `LaunchStep.tsx:100` celebrates "You're ready
  to take reservations"; the toast at `VenueOnboardingPage.tsx:58` says
  "finish setup to start taking reservations". Nothing says what setup is.
- **A venue with no tables is not operational, by the app's own rule.**
  `useVenueReadiness.ts:65-69` — gate 3 is "a floor plan with at least one
  table" — so the venue the wizard produces today is `setup`, and
  `DashboardLayout.tsx:51, 94-101` bounces `/timeline`, `/reservations` and
  `/guests` to `/setup`, whose "Create Floor Plan" card (`SetupPage.tsx:23-29`)
  sends the manager to `/floor-plans` to start the six-screen coping path. The
  Timeline itself reads `useTables({ venueId })` (`useTimelineData.ts:86-90`)
  and is empty until tables exist.
- **`POST /api/v1/venues` creates no floor plan.** `services/venue.ts` has no
  floor-plan reference; a comment in `e2e/journeys/journey-api.ts:198-199`
  claiming "onboarding always creates a default floor plan" is stale.
- **The documented flow says otherwise.** `docs/USER-FLOWS.md:31-32` steps
  7–8; the acceptance criteria at `:41-42` ("After venue creation, floor plan
  editor opens with the new venue's ID", "Floor plan can be activated
  immediately") are unchecked and unreachable; the Done definition at `:46`
  cannot be met from the wizard.
- **The only production exercise of the wizard will break.**
  `e2e/journeys/venue-journey.spec.ts:82-94` runs daily at 14:00 UTC against
  the live site (`venue-journey.yml:13-15`), clicks "Launch Venue" after the
  fourth Next and asserts the `/dashboard` handoff (`:96-117`). A sixth step
  fails it by construction unless it is updated in the same change.

**Evidence label: documented spec gap only, n = 0 user reports** (fixed by
the user; never upgraded). SURFACED: how often anyone hits the dead end is
unmeasured, and whether the self-serve path works live is unverified.

## Solution

When this ships, a manager who completes the new-venue wizard leaves it with
a venue whose active floor plan holds the tables they laid out inside the
wizard — no dead end, no half-created venue, the new venue selected and its
tables on screen with no extra navigation.

| Moment                                 | Today                                                        | Required after this run                                                                                  |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Step count (rail + mobile indicator)   | 5, from two sources (`TOTAL_STEPS`, `ONBOARDING_STEPS`)      | 6 — Welcome, Location, Hours, Settings, **Floor plan**, Launch — both sources agree and are pinned equal |
| After Settings → Next                  | Launch review                                                | Floor plan step: five template choices with previews, chosen layout editable on the real canvas          |
| Back / Next / rail click around step 5 | n/a                                                          | draft survives unchanged                                                                                 |
| Launch review                          | four cards (basic, location, hours, settings)                | plus the floor plan (template, table count)                                                              |
| Launch pressed                         | one `POST /venues`, spinner text "Creating..."               | venue → plan → tables → active, each stage visibly in flight / done                                      |
| A stage fails after the venue exists   | n/a (only the venue call exists)                             | error in place, Retry resumes from the failed stage, venue never re-posted                               |
| Success toast / celebration            | "finish setup to start taking reservations"                  | states the venue is live with its tables; no "finish setup"                                              |
| After the celebration                  | `/dashboard`, new venue selected only if it is the first one | new venue selected for every manager; the plan's tables visible; no readiness bounce                     |
| Mobile (< 768 px)                      | n/a                                                          | template pick + preview; no drag editing; wizard still completes                                         |
| `onboarding.spec.ts` "all 5 steps"     | asserts Launch button after four Nexts                       | asserts the Floor plan step, a template pick, then Launch after five Nexts; never drives Konva           |
| Daily live journey                     | launches on "Step 5"                                         | picks a template on step 5, launches on step 6, handoff assertion matches the new landing                |

**The Launch sequence is a requirement on the outcome, not on the call
shape.** Whether it is 3 + N client calls (`api.venues.create`,
`api.floorPlans.create`, `api.tables.create` × N, `api.floorPlans.setActive`)
or one venue call plus one transactional bootstrap route in
`services/reservations` is the Architect's decision (Open questions, Q3);
M7–M8 hold either way. Precedent for both halves exists:
`floorPlanService.clone` already creates a plan and its tables in one
`prisma.$transaction` (`services/floor-plan.ts:187-220`), and
`CreateFloorPlanRequest.isActive` is honoured at creation
(`services/floor-plan.ts:152`, `schemas/reservation-requests.ts:138`), so for
a venue with no other plans "create it active" is one call fewer than
"create, then activate".

## Actors

- **First-venue manager** — an authenticated identity with zero venue
  memberships (the door #4492 opened), which the no-venue gate
  (`DashboardLayout.tsx:83-86`) sends straight to `/onboarding`. Today in
  practice: the project owner and any prospect on the self-serve path.
- **Multi-venue manager** — an admin identity that already has one or more
  venues and opens `/onboarding` to add another (non-admins cannot create a
  second venue under #4492's rule). Today: the project owner. Matters because
  `VenueContext.tsx:70-75` falls back to `venues[0]`, which is not the new
  venue for this actor.
- **Maintainer** — the project owner as repo administrator: lands the
  api-client fix, merges this run's PRs, and owns the daily live venue journey
  and its Auth0 secrets.

## User stories

1. As a First-venue manager, I want to lay out my tables inside the same
   wizard I am already in, so that I never leave it to hunt for Floor Plans in
   a sidebar.
2. As a First-venue manager, I want to start from a layout that looks like my
   kind of venue, so that I arrange tables instead of building from nothing.
3. As a First-venue manager, I want to see what Launch is doing and to retry a
   failed step without re-entering five screens, so that a network blip never
   leaves me a half-made venue I cannot finish.
4. As a First-venue manager, I want to land with my new venue selected and my
   tables on screen, so that the product works the moment I finish.
5. As a First-venue manager on a phone, I want to pick a layout, see it, and
   still be able to launch, so that the phone never blocks me from finishing.
6. As a Multi-venue manager, I want the wizard to select the venue I just
   created rather than my first one, so that I do not read or edit the wrong
   venue after Launch.
7. As a Maintainer, I want the E2E spec and the daily live journey to walk the
   six-step wizard, so that a regression in the first thing a prospect touches
   is caught by a machine, not a prospect.
8. As a Maintainer, I want the api-client path fix landed before Implement
   starts, so that Launch's last stage cannot fail against production for a
   reason this run did not cause.

## Success criteria

Each criterion names its check. Unit tests carry the gate; E2E is confirmatory
when the environment allows; a probe is named where only a live check can
answer. Proposed new test files are named by directory and purpose — Architect
may rename them, the seam stays.

### MUST

- [ ] **M1. Six steps, one count.** `ONBOARDING_STEPS` has six entries in the
      order Welcome, Location, Hours, Settings, Floor plan, Launch;
      `TOTAL_STEPS === 6`; a test pins `ONBOARDING_STEPS.length === TOTAL_STEPS`
      so the two sources can never drift again; `StepIndicator` (mobile,
      `VenueOnboardingPage.tsx:76-81`) and `VerticalStepRail` (desktop,
      `OnboardingLayout.tsx:28-29`) both render six steps with the shared
      labels; step 5 renders the Floor plan step, step 6 the Launch step; Next
      is absent on step 6 and present on step 5. Check:
      `useOnboardingWizard.test.ts:241` ("caps advancement at TOTAL_STEPS")
      updated to 6 plus the equality pin; `StepIndicator.test.tsx` (hardcoded
      `totalSteps={5}` at `:8,15,27,43`) and `VerticalStepRail.test.tsx:7`
      ("renders all 5 steps") updated; `VenueOnboardingPage.test.tsx:382`
      ("should navigate through all 5 steps") updated to six.
- [ ] **M2. Template picker with live previews.** The Floor plan step offers
      exactly five choices — Restaurant, Cafe, Bar, Patio, Blank — as rialto
      controls with accessible names; each non-blank choice shows a preview
      drawn from that template's own table geometry (the same `CANVAS_WIDTH`
      / `CANVAS_HEIGHT` / `GRID_SIZE` / `SHAPE_DEFAULTS` numbers the canvas
      uses, `floor-plan-geometry.ts:15-28`), never a static image, so the
      preview is what lands on the canvas; Blank previews an empty canvas.
      Choosing a template replaces the draft with its tables; choosing another
      template after the draft has been edited never discards the edits
      silently (mechanism — confirm, or undo — is UX's). Check: the Floor-plan
      step's unit test (proposed `FloorPlanStep.test.tsx` beside the other
      step tests in `src/components/venue-onboarding/`) asserts the five
      options, selection state, draft replacement, and the edited-draft guard;
      `onboarding.spec.ts` asserts the five options are visible and that
      picking one marks it selected (DOM only).
- [ ] **M3. Template invariants (contents are UX Design's).** Every non-blank
      template holds 4–20 tables; table names are unique within the template
      (the server's `@@unique([venueId, name])`, `schema.prisma:163`, answers
      400 "A table with this name already exists", `routes/tables.ts:178-184`);
      every table has `capacity >= 1` (`CreateTableBodySchema`, `packages/types/src/schemas/reservation-requests.ts:273`, is
      `.min(1)`) and `1 <= minCovers <= capacity`; `shape` is one of
      rectangle / square / circle with `width`/`height` exactly
      `SHAPE_DEFAULTS[shape]`; `x` and `y` are multiples of `GRID_SIZE` (20);
      every table's box lies within 0..800 × 0..600; no two tables overlap;
      Blank has zero tables. Check: a pure test (proposed
      `floor-plan-templates.test.ts` beside `floor-plan-geometry.test.ts`)
      iterates every template and asserts each invariant, and parses each
      table mapped to `CreateTableRequest` with `CreateTableBodySchema` from
      `@mbe/types` — a UX-authored layout that breaks a rule fails a unit
      test, not a production call.
- [ ] **M4. The chosen layout is editable on the real canvas.** The step
      renders `FloorPlanCanvas` (`FloorPlanCanvas.tsx:22-44`; not a fork) over
      the draft: dragging a table ends with its position snapped to the 20 px
      grid via `snapToGrid` and written to the draft; "Add table" opens
      `AddTableDialog` (`AddTableDialog.tsx:17-22`) and the result joins the
      draft at `CANVAS_CENTER` with `SHAPE_DEFAULTS` dimensions; selecting a
      table exposes Remove, which drops it from the draft; adding a table
      whose name already exists in the draft is rejected at the dialog with
      the server's message, so Launch cannot fail on it. Check: reducer tests
      in `useOnboardingWizard.test.ts` for the draft actions (set template,
      move, add, remove, duplicate-name reject); the step's unit test with
      `react-konva` mocked as in `FloorPlanCanvas.test.tsx:10`; E2E never
      drives the canvas.
- [ ] **M5. Back / Next / rail preserve the draft.** Back from Floor plan to
      Settings and Next again, a rail or indicator click to an earlier step
      and back, and Back from Launch to Floor plan all show the identical
      draft (template, tables, positions), still editable; the draft is a
      slice of `OnboardingWizardData` alongside the other four steps. Check:
      `useOnboardingWizard.test.ts` — `BACK`, `NEXT`, `GO_TO_STEP` leave the
      draft slice untouched; `VenueOnboardingPage.test.tsx` — edit on step 5,
      Back, Next, same draft rendered.
- [ ] **M6. Launch review shows the plan.** The Launch step's review includes
      the floor plan: template name and table count (a preview is S2). Check:
      `LaunchStep.test.tsx:99` ("renders the review summary") extended.
- [ ] **M7. Launch produces venue + plan + tables + active, visibly.** Pressing
      Launch runs the sequence with the Launch button disabled; the UI shows
      each of four stages — Venue, Floor plan, Tables (n of N), Activate — as
      pending / in flight / done, using existing rialto instruments
      (`Progress`, `StatusLED`, `Handshake`, `Odometer`, `Meter` all exist
      under `packages/rialto/src/components/`; a new one needs a `.changeset`);
      on completion the venue has exactly one floor plan, `isActive: true`,
      `layoutJson` equal to the `DEFAULT_LAYOUT` `NewFloorPlanDialog.tsx:78`
      sends, and every draft table persisted with its name, capacity,
      minCovers and `shapeMetadata` as edited (the table body schema passes
      `floorPlanId` / `shapeMetadata` through — `toRequestJsonSchema` strips
      `additionalProperties`, AJV runs without `removeAdditional`, and
      `tableService.create` reads them at `services/table.ts:93-95`). Check:
      `VenueOnboardingPage.test.tsx` with the api client mocked asserts call
      order, payloads and the four stage states; if Architect adds a bootstrap
      route, a route test in `services/reservations/src/routes/` asserts one
      call yields plan + tables + active behind `requireAuth` +
      `requireVenueAccess`, and Verify probes the deployed route
      (unauthenticated → 401, never 404).
- [ ] **M8. Partial failure is recoverable and never re-posts the venue.**
      When any stage after venue creation fails (network, 4xx, 5xx, 429): the
      created venue's id stays in wizard state; the error shows in place with
      a Retry (the `useApiCall` + `ErrorRetryBanner` pattern,
      `src/components/ErrorRetryBanner.tsx`); Retry resumes at the first
      incomplete stage; `POST /api/v1/venues` is never called twice for one
      Launch (`VENUE_CREATE_RATE_LIMIT` is 5/min per identity,
      `routes/venues.ts:65`, and a non-admin's second venue is 403); on
      retry, a 400 "already exists" for a table created before the failure
      counts as done; a plan that exists but is inactive is activated, not
      recreated. If the manager abandons the wizard after the venue exists,
      the readiness path (`useVenueReadiness` → `setup` → `SetupPage`
      "Create Floor Plan") remains the fallback, so the venue is never a dead
      end. Check: `VenueOnboardingPage.test.tsx` cases — plan create fails →
      Retry → `venues.create` not called again, `floorPlans.create` called
      again; table k of N fails → Retry resumes at k and treats a duplicate
      400 as done; activate fails → Retry calls only activate. With a
      bootstrap route the three collapse to: venue ok, bootstrap fails →
      Retry calls only the bootstrap, and a route test proves a failing table
      insert rolls the plan back. `useVenueReadiness.test.ts:116` (empty plan
      → `setup`) stays green as the pinned fallback rule.
- [ ] **M9. Landing: new venue selected, tables visible, no bounce.** After
      the sequence and the celebration, the app navigates to a surface where
      `VenueContext.selectedVenueId` is the new venue's id — which requires
      `refetchVenues()` to resolve before `setVenueId(newId)`, because
      `setVenueId` refuses ids not yet in the list (`VenueContext.tsx:85-93`)
      — and the new plan's tables are visible with no further click. The
      surface is UX Design's (Q1) under three constraints: (i) with one or
      more tables the venue is `operational` and any surface is allowed;
      (ii) with zero tables (Blank) the venue is `setup` and
      `OPERATIONAL_ONLY_PATHS` (`/timeline`, `/reservations`, `/guests`,
      `DashboardLayout.tsx:51`) bounce to `/setup`, so the landing must be a
      surface that is not bounced (`/floor-plans/:id` and `/dashboard` are
      not) or the bounce must be the intended landing; (iii) a Multi-venue
      manager lands on the new venue, not `venues[0]`. Check:
      `VenueOnboardingPage.test.tsx:487` case replaced — asserts
      `refetchVenues` then `setVenueId(newId)` then `navigate` to the chosen
      route carrying the new plan id, for both a first-venue and a
      multi-venue fixture; `useVenueReadiness.test.ts` unchanged; landing in
      E2E is S3.
- [ ] **M10. Copy no longer contradicts.** No success toast or celebration
      says "finish setup"; both state the venue is live with its N tables
      (wording, and the N = 0 case, are UX's). Check:
      `VenueOnboardingPage.test.tsx:487` and `LaunchStep.test.tsx:118`
      updated; a grep for "finish setup" under `src/` finds nothing.
- [ ] **M11. Reduced motion.** Every new animation — template selection,
      canvas affordances, the Launch stages, the celebration — goes through
      `useMotionPreset()` (`packages/rialto/src/providers/useMotionPreset.ts:110`)
      or the `prefers-reduced-motion` guard already in `LaunchStep.tsx:25-31`;
      under reduced motion nothing travels or loops, and every Launch stage
      state is still shown. Check: unit tests with `matchMedia` mocked, on
      the pattern of `LaunchStep.test.tsx:135`, for each new surface.
- [ ] **M12. Tokens, rialto components, Konva fill rule.** All new colours are
      `var(--rialto-*)`; all new UI is rialto components (no raw `<button>` /
      `<input>` / `<select>`); any new canvas fill — a preview drawn on canvas
      included — resolves tokens at render time per `TableShape.tsx:9-67` with
      a theme-keyed fallback table covered by a drift-guard test that reads
      `packages/rialto/src/tokens/colors.css` (as `TableShape.test.tsx` does);
      `.js` import extensions; immutable state. Check: `pnpm lint` in
      `apps/hospitality`; a reviewer grep for hex literals in the new files
      outside a documented fallback table; the drift-guard test exists for
      any new table.
- [ ] **M13. Mobile: pick and preview, never blocked.** Below 768 px the step
      shows the picker and a preview; the canvas is `readOnly`
      (`FloorPlanCanvas.tsx:28`) or replaced by the preview, with a note that
      arranging is available on a larger screen; Next and Launch still work so
      a phone completes the wizard. Check: the step's unit test at a mobile
      width / `matchMedia` asserting read-only or preview-only and Next
      enabled; `onboarding.spec.ts` runs at 1280 × 720 (`playwright.config.ts`)
      — no mobile E2E is required.
- [ ] **M14. Keyboard completion.** The wizard is completable keyboard-only
      through the new step: the picker is operable with the keyboard with a
      visible focus ring, Add table (a dialog) and Remove (a button) are
      keyboard-native, and no keyboard trap exists on the canvas; arranging by
      drag stays pointer-first (nudge is S1). Check: the step's unit test
      tabs through the picker and activates a choice with the keyboard;
      `AddTableDialog.test.tsx` unchanged.
- [ ] **M15. E2E spec update, frozen files untouched.** `onboarding.spec.ts:123`
      ("advances through all 5 steps") becomes six: after Settings' Next the
      Floor plan step is visible with five options; pick one; Next; the
      Launch button is visible; no Konva interaction anywhere in the spec;
      `auth.spec.ts` and `auth.setup.ts` have no diff. Check: `git diff
--stat` on the two frozen files is empty; the spec passes when the
      environment allows (SURFACED above).
- [ ] **M16. The daily live journey walks six steps and still cleans up.**
      `e2e/journeys/venue-journey.spec.ts` picks a template on step 5 (DOM
      only), launches on step 6, and its handoff assertion (`:96-117`)
      matches the new landing; the synthetic venue — now carrying a plan and
      tables — is still deleted by the existing 409 → delete-floor-plans →
      retry path (`journey-api.ts:230-241`; `floorPlanService.delete`
      cascades tables, `services/floor-plan.ts:250-256`). Check:
      `journey-api.test.ts` / `journey-recorder.test.ts` green; Verify reads
      the first post-deploy `venue-journey.yml` run — wizard steps green,
      cleanup step green, zero leftover synthetic venues.
- [ ] **M17. Docs move with the code.** `apps/hospitality/CLAUDE.md:38` names
      six steps with the shared labels; `docs/USER-FLOWS.md` Flow 1 steps 6–8
      and its two floor-plan acceptance criteria (`:41-42`) describe the
      wizard and the "Create Venue" / "Launch Venue" drift at `:30` is fixed;
      `IMPROVEMENT-BACKLOG.md` § 13 is marked delivered. Check: reviewer
      reads each against the code; `pnpm regen --check` clean.
- [ ] **M18. Gates.** Lint, typecheck and unit tests green in
      `apps/hospitality` (and `services/reservations`, `packages/api-client`,
      `packages/types` where touched); `pnpm regen --check`, `check-adr` and
      `check-deps` clean; size-limit unchanged: `index-*.js` ≤ 500 kB and
      `canvas-vendor-*.js` ≤ 100 kB (`/onboarding` stays lazy, `main.tsx:29`,
      and konva stays in `canvas-vendor`, `vite.config.ts:32-33`, so no konva
      byte enters `index-*.js`); a `.changeset` exists iff
      `packages/rialto/src` changed; `CI Gate` green. Check: CI; `pnpm --dir
apps/hospitality size`.

### SHOULD

- [ ] **S1. Arrow-key nudge.** With a table selected, arrow keys move it one
      grid cell (20 px) with the same snap; Delete / Backspace removes it.
      Check: the step's unit test.
- [ ] **S2. Preview on the Launch review.** The Launch step's floor-plan card
      renders the same preview as the picker. Check: `LaunchStep.test.tsx`.
- [ ] **S3. E2E asserts the landing.** After a mocked Launch,
      `onboarding.spec.ts` asserts the landing URL and the new venue's name in
      the chrome — only if `api-mocks.ts` can serve the create sequence
      (SURFACED above). Check: the spec.
- [ ] **S4. Motion with intent.** Template selection and Launch-stage
      transitions use the rialto precision presets (`useMotionPreset().precision`)
      rather than bespoke timings. Check: reviewer reads the CSS / motion
      props.
- [ ] **S5. Onboarding-chunk budget.** A size-limit entry for the onboarding
      route chunk, at a limit Architect sets from a measurement, so the wizard
      cannot grow unnoticed the way `FloorPlanEditorPage-*.js` cannot. Check:
      `apps/hospitality/package.json`.

## Constraints (already decided — not design)

- Reuse `FloorPlanCanvas`, `TableShape`, `AddTableDialog`,
  `floor-plan-geometry` — never a second canvas; `FloorPlanEditorPage` changes
  only as far as landing there requires (Flow 6 stays as-is).
- Hospitality: rialto components only; `var(--rialto-*)` everywhere with the
  Konva exception (`apps/hospitality/CLAUDE.md` § Critical Constraints, item
  1); CSS Modules; `@mbe/api-client` for every call; immutable state; `.js`
  import extensions; SSE callbacks via refs; `useApiCall` + `ErrorRetryBanner`
  for recovery. Rialto: tokens, logical properties, `useMotionPreset()`, no
  `setState` in a `useEffect` body, `role="img"` + `aria-label` on
  instruments, a `.changeset` per change to `packages/rialto/src`.
- Backend, if a bootstrap route is chosen: ADR-002 error envelope,
  `requireAuth` + `requireVenueAccess`, never a route-level `config.rateLimit`
  with a moved hook (gotchas § Fastify); no Prisma schema or migration change.
- Process: TDD (failing test first); Zero-Touch Audit; stage by explicit path
  (a PostToolUse prettier hook keeps ~170 files dirty — never `git add -A`);
  `pnpm typecheck` before push; `pnpm build --filter @mbe/cli...` before
  `pnpm regen`; `gh pr edit` is broken (use `gh api -X PATCH`).
- Delivery: PRs to `main`; `CI Gate` is the sole required check; merge via
  `gh pr merge <N> --auto --squash --delete-branch` once the review gate and
  `CI Gate` are green (`tier:*` does not block; no stacking; ≤ 3 worker
  agents across both active runs); deploy only via CI (`deploy-static.yml`
  for hospitality, `deploy-services.yml` for `services/reservations`); rialto
  npm publish, Prisma migrations and manual deploys are not authorised.
- Tracker: Decompose publishes work items as GitHub issues (`ready` +
  `feature` under a `tracking` parent), mapping recorded in `breakdown.md`;
  no existing issues are imported.

## External dependency (satisfied before Implement)

- **`@mbe/api-client` floor-plan paths.** `idea.md` measured that the client
  posts activate to `/floor-plans/:id/active` and positions to
  `/floor-plans/:id/bulk-update-positions` with a bare array, while the
  service registers `/:id/activate` (`routes/floor-plans.ts:219`) and
  `/tables/positions` with `{ floorPlanId, positions }` (`:251`); the deployed
  API answered 404 to both client paths on 2026-08-30. The Maintainer is
  fixing the **client** to match the deployed service in a standalone
  `fix(api-client)` PR, independent of this run. SURFACED: at PRD time the fix
  is uncommitted working-tree edits in this checkout only (three files, no PR
  number). Decompose cites the PR number; Implement branches after it merges;
  this run's Launch sequence uses `api.floorPlans.setActive` (or the bootstrap
  route) as it stands after that fix and never designs around the broken
  paths. The E2E mocks (`api-mocks.ts:411, 415`) move with the client in that
  PR, not here. Side effect outside this run: `FloorPlanEditorPage`'s "Set as
  Active" and position saves start working against production.

## Out of scope

- A skip-for-now path (user decision; Blank is the floor).
- Full table editing on mobile (user decision; M13 is the mobile surface).
- Prisma schema or migration changes, including a cascade on
  `FloorPlan.venue` / `Table.venue` (`schema.prisma:129, 154` have none; the
  venue DELETE's `has_dependents` → 409 semantics stay as they are).
- The api-client path fix itself (external dependency above).
- `FloorPlanEditorPage` changes beyond what landing there requires; undo /
  redo; multi-floor; rotation; shapes beyond `SHAPE_DEFAULTS`; custom or
  editable templates; renaming the plan after Launch (Flow 6).
- Draft survival across a reload before Launch (the other four steps do not
  survive one either).
- `auth.spec.ts` / `auth.setup.ts`; rialto npm publish; `App.tsx` route
  changes unless sequenced behind the auth run's #4728.
- `SetupPage` / `/setup` flow changes — it remains the fallback for an
  abandoned wizard, unchanged.
- Measuring the dead end's production frequency (Sentry / analytics) —
  surfaced, a candidate backlog seed at Operate, not built here.

## Open questions

1. **Landing surface after Launch** — editor for the new plan, Timeline, or
   dashboard — under M9's three constraints, including what a Blank
   (zero-table, `setup`-readiness) venue lands on and what its celebration
   says. — UX Design.
2. **Canvas inside the 40 rem card or escaping it.** The wizard caps at
   `max-width: 40rem` (`VenueOnboardingPage.module.css:2`); the canvas scales
   to its container (`FloorPlanCanvas.tsx:62-78`), so the 800 px design
   renders at ≤ 0.8× with ~16 px grid cells, less inside Card padding. Is that
   usable, or does the step widen? — UX Design.
3. **Launch call shape**: 3 + N client calls with M8's resume rules, or one
   transactional bootstrap route in `services/reservations` (route + service
   - tests, `@mbe/api-client` method, `@mbe/types` request type)? Note the
     `isActive`-at-creation shortcut and the `clone` transaction precedent. —
     Architect.
4. **Template layouts** — the tables each of Restaurant / Cafe / Bar / Patio
   holds, within M3's invariants, and their names. — UX Design.
5. **Draft model** — local ids for draft tables, how `AddTableDialog`'s
   required `venueId` / `floorPlanId` string props are satisfied before
   Launch, and how the draft maps to `CreateTableRequest` at Launch, without
   forking the dialog or the canvas. — Architect.
6. **Progress instrument** for the four Launch stages — `Progress`,
   `Handshake`, a `StatusLED` list, or a composition. — UX Design.
7. **Plan name** — a fixed default (e.g. "Main Floor") or a field in the
   step? — UX Design.
8. **Sequencing against the auth run** — which of `App.tsx` /
   `apps/hospitality/CLAUDE.md` this run actually touches (routes live in
   `main.tsx`), and whether its items go behind #4728. — Decompose.
9. **Lazy-load the step separately?** Only if a measurement shows the
   onboarding chunk growing beyond a limit worth guarding (S5). — Architect.
10. **Does the E2E mock layer serve the create sequence** so S3 is possible?
    — Architect / Verify.

Next stage: UX Design (`ux: required`) — design the Floor plan step (picker,
previews, canvas in or out of the card, mobile variant), the template layouts
within M3, the Launch stages and their instrument, the landing, and the copy;
Q1, Q2, Q4, Q6, Q7 are its inputs.
