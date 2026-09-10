# Autorun brief — venue-onboarding-floor-plan

Collected 2026-08-30 in a single up-front interview (four questions answered
by the user; every other field below is the orchestrator's recommended
default and must be logged under `assumptions:` by the stage that relies on
it). This file is the brief, not an artifact: it never counts toward
orientation.

User's request, verbatim: "add the floorplan editor to the new venue flow.
make it a world class experience".

## Feature description (what / why)

**What.** Put the floor plan editor inside the new-venue wizard
(`apps/hospitality/src/pages/VenueOnboardingPage.tsx` +
`src/components/venue-onboarding/`, five steps today: Welcome → Location →
Hours → Settings → Launch). **User's answer: editor as a wizard step.** A new
"Floor plan" step sits between Settings and Launch:

1. pick a template — restaurant, cafe, bar, patio, or blank (backlog #13,
   `apps/hospitality/docs/IMPROVEMENT-BACKLOG.md` § 13, user ticked it
   in-scope);
2. arrange tables on the _real_ canvas (`src/components/floor-plan/
FloorPlanCanvas.tsx`, react-konva, 20 px grid snapping, `TableShape`,
   `AddTableDialog`) against an in-memory draft — drag, add, remove;
3. Launch creates venue → floor plan → tables → activates the plan as one
   resumable sequence, then lands the user in the editor / dashboard with
   the plan live.

The step is part of the flow (the user did **not** tick a skip-for-now
path); the blank template is the floor, so every venue leaves the wizard
with an active plan (possibly empty — log as an assumption if relied on).

**Why.** `docs/USER-FLOWS.md` Flow 1 ("First-Time Venue Setup") steps 7–8
say "Redirected to Floor Plan creation for the new venue → creates floor
plan → adds tables → activates"; its Done definition is "a venue with at
least one active floor plan containing tables". Today
`VenueOnboardingPage.handleCelebrationDone` navigates to `/dashboard` and
the success toast says "finish setup to start taking reservations" with no
path to do so. The Timeline (the product's core screen) is empty until an
active plan exists. #4492 (run `first-venue-self-serve`, merged
2026-08-23) made venue creation self-serve for a zero-membership identity,
so this dead end is now the first thing a prospect hits.

"World class" (orchestrator's reading of the user's words, for UX to
refine): one continuous flow with no dead end and no half-created state;
template cards with live previews drawn from the same geometry the canvas
uses; a canvas that feels tactile (snap, selection, keyboard nudge,
undo-free simplicity); a Launch that shows what it is doing (rialto already
has `Progress`, `StatusLED`, `Odometer`, `Handshake`, `Meter` — reuse before
inventing; a new rialto component needs a `.changeset`); rialto tone
(material honesty, surgical gold, precision motion via `useMotionPreset()`).

## Run scale

Feature run. Slug: `venue-onboarding-floor-plan` (orchestrator default — log
as assumption). Artifacts under `docs/features/venue-onboarding-floor-plan/`.
A second run (`auth-handshake-flows`) is active in parallel; the two share
no files except possibly `apps/hospitality/src/App.tsx` (that run's #4728)
— Decompose must keep this run's items off `App.tsx` or sequence behind it.

## Idea-stage inputs

- **Problem, from the sufferer's view.** "I filled in five screens, hit
  Launch, got confetti and a toast telling me to 'finish setup' — and a
  dashboard with nothing on it. I had to find Floor Plans in the sidebar,
  make a plan, add tables one dialog at a time, remember to Save, then find
  Activate. Until I did, the Timeline was blank and I thought the product
  was broken."
- **Who has it; how they cope today.** Restaurant manager persona
  (`apps/hospitality/CLAUDE.md` personas) creating their first venue —
  today, in practice, the project owner and any prospect trying the
  self-serve path from #4492. Coping: six screens after the wizard
  (`/dashboard` → `/floor-plans` → `NewFloorPlanDialog` →
  `/floor-plans/:id` → `AddTableDialog` × N → Save → Activate), or giving
  up.
- **Why now.** #4492 opened the self-serve door two weeks ago; the floor
  plan is the last required step before the product does anything
  (Flow 2/Timeline needs an active plan with tables). First customers are
  the stated funnel (memory: first-customers = factory-as-a-service).
- **Evidence (user's answer: documented spec gap only).** No user reports
  (n = 0 — never upgrade this label). Documented: USER-FLOWS Flow 1
  steps 7–8 and two acceptance criteria are unmet — "After venue creation,
  floor plan editor opens with the new venue's ID" and "Floor plan can be
  activated immediately" — and its Done definition is unreachable from the
  wizard. Measured in code: `handleCelebrationDone` → `navigate("/dashboard")`;
  `ONBOARDING_STEPS` has no floor-plan step; `TOTAL_STEPS = 5`.
- **Solution hunch (not a design).** A sixth wizard step holding a draft
  floor plan (template → editable canvas); Launch runs the create sequence
  with progress; land in the editor for the new plan. Reuse
  `FloorPlanCanvas`/`TableShape`/`AddTableDialog`/`floor-plan-geometry`
  rather than forking them; the canvas already takes `floorPlan` +
  `tables` + callbacks, so a draft model is mostly a typing exercise.
- **Success in one sentence.** A manager who finishes the new-venue wizard
  ends with a venue whose active floor plan has tables they laid out inside
  the wizard — no dead end, no half-created venue, Timeline populated
  immediately — verified by unit tests and the onboarding E2E spec.
- **Biggest unknowns / ways this dies.**
  - **Draft model.** `FloorPlanCanvas` and `AddTableDialog` are typed
    against server `FloorPlan`/`Table`/`CreateTableRequest` (ids,
    `venueId`, `floorPlanId`) that don't exist before Launch. Needs a
    client-side draft with local ids, without forking the canvas.
  - **Launch is a multi-call transaction.** Venue (`POST /api/v1/venues`),
    plan (`POST /api/v1/floor-plans`), N tables (`POST /api/v1/tables`
    each; `Table @@unique([venueId, name])`), then activate
    (`/floor-plans/:id/active`). A template can be 10–20 tables; the
    service-wide limiter is 100/min. Partial failure = a venue with no
    plan. **User ticked "backend endpoint if Architect wants one"**: a
    transactional bootstrap route in `services/reservations` (e.g. create
    plan + tables + activate in one call, `requireVenueAccess`) is allowed;
    **Prisma schema changes are out.**
  - **Canvas in a wizard card.** The 800×600 design canvas scales to its
    container; the wizard `Card` is narrower than the editor page. Mobile:
    the user did **not** tick full editing at 375 px — mobile gets
    template pick + preview, editing is desktop-first (log as assumption
    where it bites).
  - **E2E.** `apps/hospitality/e2e/onboarding.spec.ts` asserts "advances
    through all 5 steps" — it must change (this run may edit it; it may
    not drive a Konva canvas — assert the step and the template pick, not
    drags). `auth.spec.ts` / `auth.setup.ts` stay frozen.
  - **Bundle.** react-konva enters the wizard route; `/perf-budget` /
    size-limit may object — lazy-load the step if so.
  - **Venue context.** After Launch, `VenueContext` must select the new
    venue before the editor/dashboard reads it (`refetchVenues()` today).

## Scope boundaries

**In:** the sixth wizard step (template picker + editable canvas draft);
the four templates + blank (`#13`); the Launch create sequence with visible
progress and partial-failure recovery; landing in the editor for the new
plan (or dashboard with the plan active — UX decides); a backend bootstrap
endpoint if the Architect chooses it (route + service + tests in
`services/reservations`, `@mbe/api-client` method, `@mbe/types` request
type); updating `onboarding-steps.ts`, `VerticalStepRail`/`StepIndicator`
counts, `useOnboardingWizard` state; unit tests for all of it;
`apps/hospitality/e2e/onboarding.spec.ts` update; docs
(`apps/hospitality/CLAUDE.md` pages/components, `docs/USER-FLOWS.md` Flow 1
checkboxes if satisfied, `IMPROVEMENT-BACKLOG.md` § 13 if delivered);
llms regen; a rialto `.changeset` if `packages/rialto/src` changes.

**Out:** skip-for-now path; full table editing on mobile; Prisma schema or
migration changes; changes to `FloorPlanEditorPage` beyond what landing
there requires (Flow 6 stays as-is); undo/redo, multi-floor, rotation, or
table-shape additions beyond `SHAPE_DEFAULTS`; `auth.spec.ts` /
`auth.setup.ts`; rialto npm publish; `App.tsx` route changes unless
sequenced behind the auth run's #4728.

## Success criteria

- Wizard shows six steps; the Floor plan step offers restaurant / cafe /
  bar / patio / blank with previews; the chosen layout is editable on the
  real canvas (drag with 20 px snap, add via `AddTableDialog`, remove);
  Back/Next preserve the draft.
- Launch produces venue + plan + tables + active plan; a failure after the
  venue exists is recoverable without re-entering the wizard data (no
  orphaned venue with no plan, or a clear resume path).
- Post-Launch, the new venue is selected and its tables are visible
  (editor or Timeline) with no extra navigation.
- Gates: lint, typecheck, unit tests green in `apps/hospitality` (+
  `services/reservations`, `packages/api-client`, `packages/types` if
  touched); `pnpm regen --check` clean; `check-adr`/`check-deps` clean;
  onboarding E2E spec passes when the environment allows; size-limit not
  exceeded.
- Reduced motion respected on every new animation; all colours via
  `--rialto-*` (Konva fills resolved at render time per the
  `TableShape.tsx` pattern).

## Stack / design constraints (already in force)

Hospitality: rialto components only (no raw `<button>`/`<input>`), all
colours `var(--rialto-*)` (Konva exception via `getComputedStyle` +
`MutationObserver` on `data-theme`), CSS Modules, `@mbe/api-client` for
every call, immutable state, `.js` import extensions, SSE callbacks via
refs, `useApiCall` + `ErrorRetryBanner` for recovery. Rialto: tokens,
logical properties, `useMotionPreset()`, no `setState` in `useEffect`
bodies, `role="img"` + `aria-label` on instruments. Backend: ADR-002 error
envelope, `requireAuth` + `requireVenueAccess`, never a route-level
`config.rateLimit` with a moved hook (gotchas § Fastify). Process: TDD
(failing test first); Zero-Touch Audit; stage by explicit path (never
`git add -A` — a PostToolUse prettier hook keeps ~170 files dirty);
`pnpm typecheck` before push; never `status` as a zsh variable; `gh pr
edit` is broken (use `gh api -X PATCH`); `pnpm build --filter @mbe/cli...`
before `pnpm regen`.

## Already decided

- User's four answers: editor as a wizard step; evidence = documented spec
  gap only; tracker = export issues + merge on green; scope ticks =
  templates (#13) and a backend endpoint if the Architect wants one; NOT
  ticked = skip-for-now path, full mobile editing.
- Reuse the existing floor-plan components; do not build a second canvas.
- #4492 / `first-venue-self-serve` is prior art (venue creation for
  zero-membership identities); do not redo.
- Merge policy: review-gate pass + `CI Gate` green → merge (`tier:*` does
  not block); no stacking; ≤3 worker agents at a time across both active
  runs.

## Tracker (user's answer: export breakdown → issues)

Decompose publishes work items as GitHub issues carrying `ready` +
`feature` labels under a `tracking` parent, mapping recorded in
`breakdown.md`; `/implement-queue` may drain them. No import of existing
issues (none are open for floor plans or onboarding).

## User-facing surface

Yes — `ux: required` in `prd.md`.

## Release authorization (user's answer: merge on green)

Mechanism: PR to `main`; `CI Gate` is the sole required check; merge via
`gh pr merge <N> --auto --squash --delete-branch`; `deploy-static.yml`
deploys hospitality as a Cloudflare Worker and `deploy-services.yml`
deploys `services/reservations` to DO App Platform — deploy only via CI.
Versioning: a `.changeset` entry per change to `packages/rialto/src`
(pre-1.0, patch). **Authorized:** merging this run's PRs once the review
gate and `CI Gate` are green, including a backend PR. **Not authorized:**
rialto npm publish; Prisma migrations; manual deploys; any merge past an
unfixed critical review finding.
