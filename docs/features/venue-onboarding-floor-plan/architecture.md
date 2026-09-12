---
stage: architect
run: feature:venue-onboarding-floor-plan
date: 2026-08-30
assumptions:
  - "Q3 (Launch call shape): the **client-side sequence** wins over a backend bootstrap route — `venues.create` -> `floorPlans.create` -> `tables.create` x N -> `floorPlans.setActive`, driven by a pure resumable machine in the app. It adds zero backend surface, zero `@mbe/types` schema, zero `@mbe/api-client` method and zero cross-service deploy ordering, and it is the only shape that can produce M7's per-table `n of N`. Loser recorded in Decisions 1."
  - "Step count: `TOTAL_STEPS` becomes 6 and `ONBOARDING_STEPS` gains `Floor plan` at index 4, between Settings and Launch; Launch moves from step 5 to step 6. `StepIndicator` and `VerticalStepRail` already derive everything from `ONBOARDING_STEPS`/`totalSteps`, so neither component changes — only their tests, which hardcode 5."
  - "Q5 (draft model): the draft lives in the wizard reducer as `data.floorPlan: FloorPlanDraft`, so M5 is satisfied by the same mechanism that already makes the other four steps survive Back/Next/rail. The draft stores `DraftTable[]` (the shape templates emit and the shape Launch posts); the `FloorPlan`/`Table[]` pair `FloorPlanCanvas` wants is a render-time projection, never stored — one direction, and no server-shaped placeholder fields leak into the Launch payload."
  - '`AddTableDialog` is reused with its public props unchanged. Its `venueId`/`floorPlanId` props are only used to populate the `CreateTableRequest` it hands back (`AddTableDialog.tsx:69-70`) and are never rendered, so the wizard passes the sentinel `DRAFT_ID = "__draft__"` and discards both fields when mapping the request into a `DraftTable`. A sentinel, not `""`, so a leak into a real payload fails loudly server-side instead of silently.'
  - "The floor plan is created with `isActive: false` and activated as a separate final call, rather than folding `isActive: true` into the create. `floorPlanService.create` honours `isActive ?? false` and would accept `true` on a brand-new venue with no siblings — but collapsing the call makes M7's fourth stage disappear, and it makes a plan go live half-populated when tables fail in between. Activate last means `Live` means complete."
  - 'Retry idempotency rests on the server''s own `Table @@unique([venueId, name])`: `tables.ts` maps that violation to `400 "A table with this name already exists"`, so re-posting a table the previous attempt already created is indistinguishable from success. `isAlreadyCreatedError()` matches that exact message and counts the table as done, which is what makes M8''s resume safe without any client-side idempotency key.'
  - "`minCovers`, `floorPlanId` and `shapeMetadata` survive the request boundary even though `CreateTableBodySchema` (`packages/types/src/schemas/reservation-requests.ts`) declares only `{name, capacity, location?, venueId?}` — `toRequestJsonSchema` strips `additionalProperties`, `createServiceApp` runs AJV with `strict: false` and no `removeAdditional`, and `tableService.create` reads all three. Measured, not assumed; no schema change is in scope."
  - 'No route change. `{ path: "floor-plans/:id" }` already exists in `apps/hospitality/src/main.tsx:243-250` under `DashboardLayout`, and `/floor-plans/:id` is in neither `OPERATIONAL_ONLY_PATHS` nor the operational redirect set — so both readiness outcomes land without a bounce. `main.tsx`, `App.tsx`, `App.test.tsx` and `App.module.css` are untouched, which removes the collision with issue #4728 entirely.'
  - "The post-Launch handoff is one effect in `VenueOnboardingPage` gated on `selectedVenueId === launch.venueId`, not a call inside `handleLaunch`. `VenueContext.setVenueId` refuses ids absent from `venues` and is memoised on `[venues]`, so a `setVenueId` called after `await refetchVenues()` inside an already-running handler closes over the pre-refetch list and silently no-ops — correct by accident for a first venue, wrong for story 6's multi-venue manager."
  - "`LaunchProgress` lives in the reducer too, so the panel survives the Back-to-step-5-and-return path S7 requires. `isSubmitting` and `submitError` become derived from it, so `useOnboardingWizard`'s existing public surface does not change shape for any current consumer."
  - 'Step 6 validation: `runStepValidation` gains `case 5` returning `valid: templateId !== null` with `errors.floorPlan` carrying the picker''s `role="alert"` sentence. Step locking after the venue exists is a reducer rule (`BACK` floors at step 5, `GO_TO_STEP` refuses steps < 5 when `launch.venueId !== null`), not a component concern.'
  - "The >= 1024 px editing threshold reuses the `matchMedia` + `useState`/`useEffect` hook pattern already in `TimelineGrid.tsx:35-51`, lifted to `FloorPlanStep` with a 1024 breakpoint. The 40 rem -> 64 rem cap is a second class on `.wizardContainer` applied only when `step === 5`, unanimated."
  - "Q9 (lazy-load): no second lazy boundary inside the step. `/onboarding` is already a lazy route and `konva`/`react-konva` are already isolated in `canvas-vendor` by `vite.config.ts` manualChunks, so the entry bundle is unaffected; the cost is that `canvas-vendor` is now fetched on the wizard as well as the editor, which is what the feature is. S5's `size-limit` entry must be added at a **measured** number (`pnpm --dir apps/hospitality build && pnpm --dir apps/hospitality size`), never a guessed one."
  - "Q10 (E2E mocks): today `api-mocks.ts` cannot serve the sequence — it has query-scoped list handlers (`**/api/v1/venues?*`, `**/api/v1/floor-plans?*`, `**/api/v1/tables?*`) and id-scoped item handlers, but **no** collection-POST handler for any of the three. Three new anchored handlers are needed; because the bare collection path is currently unrouted there is no registration-order hazard with the existing ones."
  - "rialto `Progress` takes `value` as a 0-100 percent (`Progress.tsx`), not the `created / total` fraction ux.md's S6 writes. The stage panel converts."
  - "No rialto change and therefore no `.changeset`: the panel composes existing `StatusLED` + `Progress`, the previews are inline SVG (`svg`/`rect`/`circle`/`div` are all unbanned by `prefer-rialto-components`), and the failure banner is the existing `ErrorRetryBanner`."
  - "`apps/hospitality/CLAUDE.md` is in scope for M17 (line 38 still says `5-step wizard: BasicInfo -> Location -> OperatingHours -> Settings -> Confirmation`) but must be sequenced behind issue #4728, which owns the same file for the auth run. `apps/hospitality/docs/USER-FLOWS.md` and `docs/IMPROVEMENT-BACKLOG.md` § 13 are uncontended."
  - "Evidence for the whole run stays where idea.md put it: documented spec gap only, n = 0 user reports. Nothing in this artifact claims a measured user problem."
surfaced:
  - "**PR #4735 is OPEN, not merged** (branch `fix/api-client-floor-plan-paths`, `mergedAt: null`, checked against `origin/main` = `e06b2951d`). The task brief described it as already landed. On `main` today `packages/api-client/src/floor-plans.ts` still posts to `/api/v1/floor-plans/:id/active` and `/api/v1/floor-plans/:id/bulk-update-positions`, which the reservations service does not serve — the routes are `POST /:id/activate` and `POST /tables/positions`. This architecture's Activate stage calls `floorPlans.setActive(id)` and therefore **404s until #4735 merges**. The PR preserves the method signature, so no code here changes when it lands; it is a hard sequencing dependency for Decompose, not a design question."
  - "The four template layouts (zones, table counts, names, capacities, coordinates) are ux.md's invention, carried into `floor-plan-templates.ts` unchanged. Nothing in the repo describes a template and no manager has seen them. Whether 14 tables / 48 covers is a recognisable 'Restaurant' is a product judgement this run cannot make."
  - "The >= 1024 px editing threshold and the 64 rem cap are computed from CSS, not measured in a browser at any width. A real device check could move either."
  - "The call budget was reasoned, not probed: worst case 23 requests (1 venue + 1 plan + 20 tables + 1 activate) against a 100/min per-IP global limiter and a hand-rolled 5/min per-identity venue cap. No live burst was run against the deployed reservations service, and the LAN DNS caveat in `.claude/rules/gotchas.md` makes a casual local probe untrustworthy. If the limiter does bite, the sequence surfaces it as a normal stage failure with a working Retry — degraded, not broken."
  - "The S5 onboarding-chunk `size-limit` budget has no number in this artifact on purpose. It requires a build measurement Implement must take, and a guessed budget is worse than none."
---

# Architecture — Venue onboarding floor plan

**State update.** `origin/main` is `e06b2951d`; the working tree is clean apart
from this untracked run directory. Every path and line number below is read
against that commit. One external dependency is open rather than merged — see
the first `surfaced:` entry on PR #4735 — and it is the only thing between this
design and a working Activate stage.

This artifact draws on `autorun-brief.md`, `idea.md`, `prd.md` (18 MUSTs, 5
SHOULDs, 10 open questions), `ux.md` (screens S1-S9, the zone rule, the copy
table, the downstream contract list) and the code at `e06b2951d`. No interview
was conducted; each decision the PRD left to this stage carries its
recommendation in `assumptions:` and its loser in Decisions.

## Approach

Two shapes were weighed for the only genuinely architectural question in this
feature: how four resources get created when the manager presses Launch.

**Chosen — a client-driven, resumable sequence.** A pure machine
(`launch-sequence.ts`) owns the ordering, the resume point and the
duplicate-is-done rule; a thin runner executes one stage per turn against the
existing `@mbe/api-client` methods and reports progress back into the wizard
reducer. Nothing new is added to `services/reservations`, `packages/types`,
`packages/api-client` or the Prisma schema. Per-table progress is a free
consequence of the loop rather than something the design has to reconstruct,
and the resume point is a value (`LaunchProgress`) rather than a state of the
world that has to be re-derived.

**Lost — a backend bootstrap route** (`POST /api/v1/floor-plans/bootstrap`
taking `{venueId, name, layoutJson, tables[]}` inside one
`prisma.$transaction`, precedent `floorPlanService.clone`). It is genuinely
better on atomicity: one call, no partial state, and M8 collapses to "retry the
one call". It loses on three counts. (i) It cannot produce M7's `Tables (n of
N)` — the PRD's own wording — because there is no observable boundary between
table 1 and table 14; the determinate `Progress` ux.md designed becomes a
spinner. (ii) It creates a **cross-service deploy-ordering hazard** the client
sequence does not have: hospitality ships to Cloudflare Workers and reservations
to DO App Platform from the same squash-merge, with no ordering guarantee, so a
wizard that reaches a not-yet-deployed route 404s in production — precisely the
failure idea.md measured on `/active`. (iii) Its cost is a route + service
method + Zod schema + JSON-schema derivation + shared type + client method +
two test suites + an llms regen across two packages, against a partial state
whose blast radius is a plan the manager finishes in the editor they are already
being landed in. Atomicity buys the least here of anywhere it could.

The rest of the feature follows from that choice and from one measured fact:
`FloorPlanCanvas` is already props-driven and reads nothing from the network
(`floorPlan.name` and `floorPlan.isActive` are the only two fields it touches),
so in-wizard editing needs a projection, not a fork.

## Components

### `apps/hospitality/src/components/venue-onboarding` — new, pure

1. **`floor-plan-templates.ts`** — the five templates as data plus one
   generator. Encodes ux.md's zone rule: a `Zone` is
   `{prefix, shape, capacity, minCovers, origin, cols, rows, pitchX, pitchY}`;
   the table at `(r, c)` is named `` `${prefix}${r * cols + c + 1}` `` and
   centred at `(origin.x + c * pitchX, origin.y + r * pitchY)` with
   `SHAPE_DEFAULTS[shape]` for size. Blank has no zones. M3's invariants are
   true by construction, not by validation.
   _Seam:_ `floor-plan-templates.test.ts` — asserts every M3 invariant across
   all five templates as a table-driven test (4-20 tables, unique names,
   `capacity >= 1`, `1 <= minCovers <= capacity`, sizes equal
   `SHAPE_DEFAULTS`, coordinates multiples of `GRID_SIZE`, every shape's
   bounding box inside 800x600, no two boxes intersecting, Blank empty).

2. **`floor-plan-draft.ts`** — the draft model and its projections.
   `DraftTable`/`FloorPlanDraft` types; `draftToCanvasTables` and
   `draftToCanvasFloorPlan` (the render-time projection into the shapes
   `FloorPlanCanvas` requires); `draftTableFromCreateRequest` (maps what
   `AddTableDialog` returns); `draftTableToCreateRequest` (maps to what the
   Launch sequence posts); `findDuplicateName` plus the
   `DUPLICATE_TABLE_NAME_MESSAGE` constant, so the in-draft uniqueness rule
   reads identically to the server's rejection.
   _Seam:_ `floor-plan-draft.test.ts` — round-trip
   `DraftTable -> CreateTableRequest -> DraftTable`, projection field-for-field,
   duplicate detection, and the assertion that no projection placeholder can
   reach a `CreateTableRequest`.

3. **`launch-sequence.ts`** — the resumable machine. Pure:
   `stagesFor(draft)` (omits `"tables"` at N = 0, per S6),
   `nextStage(progress, draft)` (first incomplete stage, `null` when done),
   `stageStateOf(progress, stage)` -> `pending | in-flight | done | failed`,
   `tablesDoneCount(progress)`, `isAlreadyCreatedError(err)`. Impure, and thin:
   `runLaunchSequence(api, draft, venuePayload, progress, onProgress)` loops
   `nextStage` until `null`, executes exactly one stage per turn, and stops at
   the first failure. Retry is the same function called again with the same
   `progress` — which is the whole of M8, because `nextStage` can never return
   `"venue"` once `progress.venueId` is set.
   _Seam:_ `launch-sequence.test.ts` — a fake api object drives: happy path
   ordering; failure at each of the four stages; resume from each failure
   asserting the venue POST is called exactly once across both attempts; the
   duplicate-400 mid-table case counting as done; the N = 0 path skipping
   `"tables"` entirely.

### `apps/hospitality/src/components/venue-onboarding` — changed

4. **`onboarding-steps.ts`** — `ONBOARDING_STEPS` gains `Floor plan` at index 4. _Seam:_ a new assertion that `ONBOARDING_STEPS.length === TOTAL_STEPS`,
   so the two can never drift again.

5. **`useOnboardingWizard.ts`** — `TOTAL_STEPS = 6`; `OnboardingWizardData`
   gains `floorPlan: FloorPlanDraft`; `OnboardingWizardState` gains
   `launch: LaunchProgress`; `OnboardingWizardErrors` gains `floorPlan`. New
   actions `SET_TEMPLATE`, `ADD_DRAFT_TABLE`, `MOVE_DRAFT_TABLE`,
   `REMOVE_DRAFT_TABLE`, `SET_LAUNCH_PROGRESS`. `runStepValidation` gains
   `case 5`. `BACK`/`GO_TO_STEP` gain the post-venue lock. `submit(promise)`
   is retired in favour of `setLaunchProgress(next)`, keeping the existing
   division of labour — the page owns I/O, the hook owns state — and
   `isSubmitting`/`submitError` are re-derived so no consumer's prop shape
   changes.
   _Seam:_ `useOnboardingWizard.test.ts` — the existing
   `expect(TOTAL_STEPS).toBe(5)` becomes 6; new cases for template selection
   resetting the draft, `pristine` flipping on first edit, M5's survive-Back
   assertion, and the lock refusing `goToStep(2)` once `launch.venueId` exists.

6. **`StepIndicator.test.tsx`**, **`VerticalStepRail.test.tsx`** — count and
   label updates only. Neither component file changes; both already render
   from `ONBOARDING_STEPS`/`totalSteps`.

### `apps/hospitality/src/components/venue-onboarding` — new UI

7. **`FloorPlanStep.tsx`** + `FloorPlanStep.module.css` — S3/S4. The template
   picker (five cards, each with a `TemplatePreview`, name, zone line and
   summary), the >= 1024 px canvas composition (`FloorPlanCanvas` fed the
   projection, `onTableMove` dispatching `MOVE_DRAFT_TABLE`, `AddTableDialog`
   behind Add Table, remove via the selected-table affordance), the
   0-1023 px preview-only band, and the replace-confirm when a template is
   swapped after editing (`ConfirmDialog`, gated on `!draft.pristine`).
   _Seam:_ `FloorPlanStep.test.tsx` — picking each template renders its
   count; picking after edits opens the confirm and cancelling preserves the
   draft; `onTableMove` snaps and persists; the duplicate-name path surfaces
   `DUPLICATE_TABLE_NAME_MESSAGE` in the dialog; below 1024 px the canvas is
   not interactive (M13); the whole step completes from the keyboard (M14).

8. **`TemplatePreview.tsx`** — the inline-SVG miniature, shared by the picker
   card and the S5 review. Pure props (`tables`, `width`, `height`), no
   labels, no Konva.
   _Seam:_ `TemplatePreview.test.tsx` — every table renders one shape node,
   the Blank case renders the empty ground, and all fills resolve from
   `var(--rialto-*)` (M12).

9. **`LaunchStagePanel.tsx`** + `.module.css` — S6/S7. Four (or three) rows of
   `StatusLED` + label + detail, the connecting groove, the determinate
   `Progress` on the Tables row (converting `created / total` to a 0-100
   `value`), and one polite live region carrying one sentence per stage
   transition with the per-table counter `aria-hidden`. Presentational: it
   takes `LaunchProgress` + `FloorPlanDraft` and renders; it decides nothing.
   _Seam:_ `LaunchStagePanel.test.tsx` — LED variant per stage state; exactly
   one red row on failure with earlier rows still green and later rows dark;
   the Tables row absent at N = 0; the live region announcing once per
   transition; `Progress` receiving a percent.

### `apps/hospitality/src/components/venue-onboarding` / `pages` — changed UI

10. **`LaunchStep.tsx`** + `.module.css` — a fifth review `Card` (Layout /
    Name / Tables + the S2 preview), the review collapsing to one line while
    the panel is mounted, `ErrorRetryBanner` wired to Retry, the Launch button
    unmounted permanently after the first press, and the celebration sentence
    changing (including the zero-table variant). The celebration animation,
    its reduced-motion guards and its `role="status"` are untouched.
    _Seam:_ `LaunchStep.test.tsx` — Launch renders the panel and disables
    itself; after a failure the Launch button is absent and Retry present;
    the celebration copy switches on table count.

11. **`VenueOnboardingPage.tsx`** + `.module.css` — renders step 5, applies the
    64 rem cap class on that step only, owns `handleLaunch`
    (`runLaunchSequence` -> `await refetchVenues()`), and owns the single
    handoff effect: adopt the new venue once `venues` contains it, then
    navigate to `/floor-plans/${launch.floorPlanId}` once
    `selectedVenueId === launch.venueId` and the celebration has finished.
    Celebration completion is local `useState` set from `onCelebrationDone` —
    a `useState` setter is stable across renders, so the timer's captured
    callback is not a stale closure the way `setVenueId` would be.
    _Seam:_ `VenueOnboardingPage.test.tsx` — the existing "navigate through
    all 5 steps" becomes 6; the full Launch happy path asserting call order
    and the landing URL; a multi-venue fixture asserting the new venue is the
    selected one at navigation time (story 6); a mid-table failure asserting
    no second venue POST on Retry (M8).

### `apps/hospitality/e2e`

12. **`api-mocks.ts`** — three new collection-POST handlers (`/api/v1/venues`,
    `/api/v1/floor-plans`, `/api/v1/tables`) returning created fixtures with
    stable ids, plus a stateful table list so the landing page shows what was
    created. **`onboarding.spec.ts`** — five Nexts, the template step, and
    (S3) pressing Launch through to the `/floor-plans/:id` landing.
    **`journeys/venue-journey.spec.ts`** — the four edits ux.md's
    § Downstream contract changes enumerates (line 123 step count; line 81 the
    new step; lines 90-92 celebration text; lines 96-117 dashboard handoff
    becomes editor handoff), with cleanup still deleting floor plans before
    the venue. `auth.spec.ts` and `auth.setup.ts` are frozen (M15).

### Unchanged on purpose

`main.tsx` (the landing route already exists), `App.tsx` / `App.test.tsx` /
`App.module.css` (issue #4728's file), `FloorPlanCanvas.tsx`, `TableShape.tsx`,
`TableSelectionOverlay.tsx`, `AddTableDialog.tsx`, `NewFloorPlanDialog.tsx`,
`floor-plan-geometry.ts`, `VenueContext.tsx`, `DashboardLayout.tsx`,
`useVenueReadiness.ts`, `FloorPlanEditorPage.tsx`, `StepIndicator.tsx`,
`VerticalStepRail.tsx`, `OnboardingWizardContext.tsx`, `OnboardingLayout.tsx`,
all of `packages/rialto`, `packages/types`, `packages/api-client` (beyond
#4735), all of `services/reservations`, and the Prisma schema. That list is the
strongest argument for Decision 1: the feature lands inside one component
folder.

## Data model

No persisted schema changes. The new state is all in-memory and all owned by
the wizard reducer.

| Source                                                                                                                        | Owner                                                          | Read by                                                                   | Notes                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FloorPlanDraft` (`templateId`, `planName`, `tables: DraftTable[]`, `pristine`)                                               | `useOnboardingWizard` reducer, at `data.floorPlan`             | `FloorPlanStep`, `LaunchStep` review, `runLaunchSequence`                 | Survives Back/Next/rail because it lives with the other four steps (M5). `pristine` is the replace-confirm trigger.                                                                                  |
| `DraftTable` (`localId`, `name`, `capacity`, `minCovers`, `shape`, `x`, `y`)                                                  | same                                                           | projections, Launch payload                                               | `localId` is draft-only and never sent. `x`/`y` are centres, multiples of `GRID_SIZE`.                                                                                                               |
| Canvas `FloorPlan` + `Table[]`                                                                                                | nobody — computed at render                                    | `FloorPlanCanvas`                                                         | Projection only. `Table.venueId`/`floorPlanId` are legitimately `string \| null` in `@mbe/types`, so the placeholders are not lies; the canvas reads only `floorPlan.name` and `floorPlan.isActive`. |
| `LaunchProgress` (`venueId`, `floorPlanId`, `createdTableNames`, `activated`, `inFlightStage`, `failedStage`, `errorMessage`) | reducer, at `state.launch`                                     | `LaunchStagePanel`, `LaunchStep`, the handoff effect, `runLaunchSequence` | The resume point. Lives in the reducer, not `LaunchStep`, so S7's Back-to-step-5-and-return keeps the panel. `createdTableNames` (not ids) because the name is the server's unique key.              |
| Celebration-finished flag                                                                                                     | `VenueOnboardingPage` local `useState`                         | the handoff effect                                                        | Local because a `useState` setter is render-stable; a context setter here is not.                                                                                                                    |
| Selected venue id                                                                                                             | `VenueContext` (`localStorage` key `mbe-hospitality-venue-id`) | `DashboardLayout`, the landing page                                       | Written synchronously by `setVenueId`, which is why the landing tree reads the right venue on mount. Unchanged.                                                                                      |
| Venue / FloorPlan / Table rows                                                                                                | `services/reservations` via Prisma                             | everything after the handoff                                              | Unchanged. `Table @@unique([venueId, name])` is load-bearing for retry.                                                                                                                              |

## Interfaces & contracts

### `tablesForTemplate(template: FloorPlanTemplate): DraftTable[]`

- **Inputs:** one of the five templates.
- **Output:** the generated tables, in zone order then row-major.
- **Failure modes:** none — pure, total, no I/O. The M3 invariants are
  properties of the template data, enforced by the test rather than by a
  runtime guard, because an invalid template is a build-time defect and
  defensive code for it would be dead.

### `nextStage(progress: LaunchProgress, draft: FloorPlanDraft): LaunchStageId | null`

- **Inputs:** the resume point and the draft.
- **Output:** the first incomplete stage, or `null` when the sequence is
  complete.
- **Failure modes:** none. The one invariant that matters:
  `progress.venueId !== null` implies the result is never `"venue"` — this is
  M8's "the venue is never re-posted", expressed as a total function rather
  than as a guard on a button.

### `runLaunchSequence(api, draft, venuePayload, progress, onProgress): Promise<LaunchProgress>`

- **Inputs:** the api client (passed in, so the policy owns the interface and
  the test needs no network), the draft, the `CreateVenueRequest` from
  `buildOnboardingPayload`, the current progress, and a progress callback.
- **Output:** the final progress — complete, or failed at exactly one stage.
- **Failure modes, all of which stop the loop and return rather than throw:**
  venue create 400 (slug taken) / 403 (bootstrap forbidden) / 409 / 429 (the
  5-per-minute cap) -> `failedStage: "venue"`, nothing persisted, Retry runs
  the whole sequence; floor-plan create failure -> `failedStage: "floorPlan"`,
  venue kept; table create failure -> `failedStage: "tables"` with
  `createdTableNames` holding everything before it, except that a 400 carrying
  `DUPLICATE_TABLE_NAME_MESSAGE` is recorded as done and the loop continues;
  activate failure -> `failedStage: "activate"`, a complete but inactive plan,
  which the editor can activate by hand. Every message reaching the banner is
  the server's RFC 7807 `detail` where present, else the stage's fallback from
  ux.md's copy table.
- **Budget:** worst case 1 + 1 + 20 + 1 = 23 requests, sequential, against the
  100/min per-IP global limiter in `createServiceApp`. Sequential is
  deliberate — parallel table POSTs would make `n of N` a lie.

### `POST /api/v1/tables` (existing, unchanged)

- **Inputs:** `{name, capacity, minCovers, venueId, floorPlanId, shapeMetadata}`.
- **Contract note:** `CreateTableBodySchema` declares only four of those, but
  `toRequestJsonSchema` strips `additionalProperties` and AJV runs
  non-strict without `removeAdditional`, so all six reach
  `tableService.create`. This is measured behaviour of the current stack, and
  it is the reason no `@mbe/types` change is in scope. If a future change
  turns on `removeAdditional`, this feature breaks silently — worth a note in
  the schema, not a defensive client change now.

### `POST /api/v1/floor-plans/:id/activate` (existing)

- Reached through `api.floorPlans.setActive(id)`, whose URL is corrected by
  **open** PR #4735. Until that merges the Activate stage 404s and surfaces as
  a normal stage failure. No code in this design changes when it lands.

### `VenueOnboardingPage` handoff (policy)

1. `runLaunchSequence` completes.
2. `await refetchVenues()`.
3. Toast (ux.md S9 copy), celebration plays, local flag set.
4. Effect: if `venues` contains `launch.venueId` and it is not selected, call
   `setVenueId` and wait a render.
5. Effect: once `selectedVenueId === launch.venueId` and the celebration has
   finished, `navigate("/floor-plans/" + launch.floorPlanId, {replace: true})`.

- **Failure mode:** if the refetch never returns the new venue the manager
  stays on the celebration rather than bouncing through `DashboardLayout`'s
  no-venue gate back to `/onboarding`. A stuck screen is a worse-but-honest
  outcome than a redirect loop; ux.md S8 chose it explicitly.

## Stack & dependencies

No new runtime dependency, in any package. `react-konva`, `konva`,
`@tanstack/react-query`, rialto and `@mbe/api-client` are all already in
`apps/hospitality`.

**Repo mechanics Implement must honour**

- No `packages/rialto/src` change, so **no `.changeset`** and no
  `registry.json` / exports regeneration.
- `package.json` changes only if S5's `size-limit` entry is added — which
  invalidates turbo's global cache for the whole run (`pnpm-lock.yaml` is
  untouched, but a `size-limit` edit still forces that package's rebuild), and
  requires the budget to come from `pnpm --dir apps/hospitality size`.
- `check-vendor-chunk-coverage.mjs` only demands budgets for `*-vendor-*.js`
  chunks >= 5 kB; the growth here is in the onboarding route chunk, which is
  not a vendor chunk, so the check is not tripped.
- `apps/hospitality/CLAUDE.md`, `docs/USER-FLOWS.md` and
  `docs/IMPROVEMENT-BACKLOG.md` edits trigger the llms regen — build the CLI
  first (`pnpm build --filter @mbe/cli...`), then `pnpm regen`, and stage
  `llms.txt`/`llms-full.txt` by explicit path.
- The PostToolUse prettier hook leaves ~170 files dirty. Never `git add -A`.
- ADRs touched, all satisfied without change: ADR-002/ADR-008 (the error
  envelope the banner reads), ADR-007 (path versioning — no new route),
  ADR-020 (`requireAuth` + `requireVenueAccess`, already enforced on every
  endpoint the sequence calls), ADR-025.
- Konva fills must resolve `var(--rialto-*)` at render time per
  `apps/hospitality/CLAUDE.md`'s constraint 1; `TemplatePreview` is plain SVG
  and uses the tokens directly.

## Decisions & alternatives

1. **Client sequence over a backend bootstrap route.** Covered in Approach.
   The deciding factors were M7's per-table observability and the cross-service
   deploy-ordering hazard, not the line count. Reversible: if partial states
   ever become a real complaint, the bootstrap route can be added behind the
   same `runLaunchSequence` signature and the panel degrades to three stages.

2. **Activate as a fourth call, not `isActive: true` at create.** Costs one
   request and one failure point; buys M7's literal fourth stage and the
   guarantee that a live plan is a complete plan. `floorPlanService.create`
   would have accepted `true` — this is a product choice, not a constraint.

3. **The draft lives in the wizard reducer, not in `FloorPlanStep` or a new
   context.** M5 is then satisfied by an existing, tested mechanism. Rejected:
   a dedicated `FloorPlanDraftContext` (a second state container for one step,
   with its own persistence question) and step-local state (fails M5 outright).

4. **`DraftTable` as the stored shape, canvas types as a projection.** Rejected:
   storing full `Table` objects. That reads simpler until the Launch payload
   has to strip six synthetic fields back out, and it invites a placeholder
   `venueId` into a real request. One direction is cheaper than two.

5. **The stage panel over `Handshake`.** ux.md made this call with a measured
   reason (`Handshake` renders one `state` for the whole track, so a finished
   stage and an unstarted stage are drawn identically — exactly the
   distinction M8 needs at the moment of failure) and it is adopted unchanged.
   The panel composes `StatusLED`, the primitive `Handshake` itself composes,
   so the two stay in one family. Also rejected upstream: `Steps` (no failed
   state), `WatchLoader` (no progress semantics), a lone `Progress` bar.

6. **The unique constraint as the idempotency key.** Rejected: a client-side
   idempotency token per table (needs a server change) and a
   read-then-create per table (doubles the request count for a case that only
   occurs on retry). Matching the server's exact rejection string is
   brittle-looking, and it is pinned by a test that reads it from one shared
   constant.

7. **The handoff as a render-gated effect rather than a call inside
   `handleLaunch`.** The straightforward version is measurably wrong for the
   multi-venue manager because of `setVenueId`'s `[venues]` memoisation. This
   is the one place the design pays for React's closure semantics, and it pays
   with one effect that reads both values at render time.

8. **No new lazy boundary inside the wizard.** A `Suspense` fallback on a step
   every manager reaches trades a guaranteed spinner for a saving on a chunk
   that is already lazy. Rejected in favour of measuring the real budget.

## ADRs

None recommended. The one decision with any architectural weight — no backend
bootstrap route — is reversible without a migration, affects one app's
component folder, and is already recorded here with its loser and its trigger
for revisiting. Every ADR-relevant constraint it touches (ADR-002/008 error
envelope, ADR-007 versioning, ADR-020 venue access) is satisfied by using the
existing endpoints unchanged, which is the outcome ADRs exist to produce. An
ADR here would restate a decision that is neither surprising nor hard to
reverse.

## Traceability

| Requirement                                             | Components                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| M1 six steps, one count                                 | 4 (`onboarding-steps.ts`), 5 (`TOTAL_STEPS`), 6 (tests)                                               |
| M2 template picker, live previews                       | 7 (`FloorPlanStep`), 8 (`TemplatePreview`)                                                            |
| M3 template invariants                                  | 1 (`floor-plan-templates.ts` + its test)                                                              |
| M4 real canvas editing                                  | 7, via `FloorPlanCanvas` + `AddTableDialog` unchanged, fed by 2                                       |
| M5 draft survives navigation                            | 5 (draft in reducer), 2 (draft types)                                                                 |
| M6 review shows the plan                                | 10 (`LaunchStep` fifth card), 8                                                                       |
| M7 four visible stages                                  | 3 (`stagesFor`/`stageStateOf`), 9 (`LaunchStagePanel`)                                                |
| M8 partial failure recoverable, venue never re-posted   | 3 (`nextStage`, `isAlreadyCreatedError`), 5 (`launch` in reducer), 10 (Launch button unmounted)       |
| M9 landing, new venue selected                          | 11 (handoff effect); no route change needed                                                           |
| M10 copy no longer says "finish setup"                  | 10, 11 (toast)                                                                                        |
| M11 reduced motion                                      | 9 (groove `transition: none`), 10 (existing guards)                                                   |
| M12 tokens / rialto / Konva fill rule                   | 7, 8, 9                                                                                               |
| M13 mobile pick + preview                               | 7 (the 0-1023 px band)                                                                                |
| M14 keyboard completion                                 | 7, 9 (live region), existing `TableSelectionOverlay` buttons                                          |
| M15 E2E updated, auth specs frozen                      | 12                                                                                                    |
| M16 daily live journey walks six steps, still cleans up | 12 (`venue-journey.spec.ts`)                                                                          |
| M17 docs                                                | `apps/hospitality/CLAUDE.md` (behind #4728), `docs/USER-FLOWS.md`, `docs/IMPROVEMENT-BACKLOG.md` § 13 |
| M18 gates                                               | every `Seam:` above; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm regen --check`                 |
| S1 nudge                                                | 7                                                                                                     |
| S2 review preview                                       | 8, 10                                                                                                 |
| S3 E2E landing assertion                                | 12 (needs the three new collection-POST mocks)                                                        |
| S4 motion presets                                       | 9                                                                                                     |
| S5 onboarding-chunk budget                              | `apps/hospitality/package.json`, at a measured number                                                 |
| Story: first-venue manager                              | 7, 3, 11                                                                                              |
| Story: multi-venue manager                              | 11 (the handoff effect is the whole of it)                                                            |
| Story: manager who wants no tables                      | 1 (Blank), 3 (`stagesFor` omits Tables), 10 (zero-table celebration copy)                             |
| Story: launch that fails halfway                        | 3, 9, 10                                                                                              |

## File ownership map for Decompose

Groups are pairwise disjoint by file. Order is a dependency order, not a
schedule.

| Group                  | Files                                                                                                                                            | Depends on                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **W1 pure model**      | `floor-plan-templates.ts(.test.ts)`, `floor-plan-draft.ts(.test.ts)`                                                                             | —                                           |
| **W2 wizard state**    | `onboarding-steps.ts`, `useOnboardingWizard.ts(.test.ts)`, `launch-sequence.ts(.test.ts)`, `StepIndicator.test.tsx`, `VerticalStepRail.test.tsx` | W1 types                                    |
| **W3 floor-plan step** | `FloorPlanStep.tsx`, `.module.css`, `.test.tsx`, `TemplatePreview.tsx`, `.test.tsx`                                                              | W1, W2                                      |
| **W4 launch UI**       | `LaunchStagePanel.tsx`, `.module.css`, `.test.tsx`, `LaunchStep.tsx`, `.module.css`, `.test.tsx`                                                 | W2, W3 (`TemplatePreview`)                  |
| **W5 page wiring**     | `VenueOnboardingPage.tsx`, `.module.css`, `.test.tsx`                                                                                            | W2, W3, W4                                  |
| **W6 E2E**             | `e2e/api-mocks.ts`, `e2e/onboarding.spec.ts`, `e2e/journeys/venue-journey.spec.ts`                                                               | W5                                          |
| **W7 docs**            | `apps/hospitality/CLAUDE.md`, `docs/USER-FLOWS.md`, `docs/IMPROVEMENT-BACKLOG.md` + llms regen                                                   | **sequence behind issue #4728** (same file) |
| **W8 budget**          | `apps/hospitality/package.json`                                                                                                                  | W5 (needs a real build to measure)          |

External: PR #4735 must merge before the Activate stage works end to end. It
blocks W6's happy-path landing assertion and M16's live journey; it does not
block W1-W5, whose tests all use fakes.

## Surfaced

**SURFACED (external dependency, and a correction to this run's brief).** The
brief stated PR #4735 had already landed. It has not: `state: OPEN`,
`mergedAt: null`, branch `fix/api-client-floor-plan-paths`, and `origin/main`
at `e06b2951d` still carries the wrong URLs in
`packages/api-client/src/floor-plans.ts`. The design cites it as satisfied
because the PR preserves `setActive(id)`'s signature — but until it merges,
Activate 404s.

**SURFACED (product, no default available).** The five templates' contents are
ux.md's invention and have been shown to nobody. This stage encoded them
faithfully and has no basis to change them.

**SURFACED (measurement Implement or a human must take).** Three numbers in
this design are reasoned rather than observed: the 1024 px editing threshold
and the 64 rem cap (computed from CSS, never checked in a browser); the 23-call
Launch burst against the 100/min and 5/min limiters (never probed against the
deployed service); and the S5 chunk budget (deliberately absent — it needs a
build).

**SURFACED (evidence).** Unchanged from idea.md: documented spec gap only,
n = 0 user reports. Nothing here rests on an observed user failure.
