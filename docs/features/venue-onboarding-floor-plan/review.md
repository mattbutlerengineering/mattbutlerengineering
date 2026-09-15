---
stage: review
run: feature:venue-onboarding-floor-plan
date: 2026-08-31
assumptions:
  - "Reviewed the merged state on main at `ddf6994aa` (git pull --ff-only ran past the required `ec5d82e92` floor; two later out-of-run merges landed first). Verified with `git diff --name-only ec5d82e92..ddf6994aa` over every run-touched path: empty — the run's code is byte-identical at both SHAs, so findings apply to the run's final merge state."
  - 'Mocked E2E specs were judged statically, exactly as the Implement and Verify gates did: `auth.setup.ts` hard-requires `E2E_AUTH0_*` env vars via playwright.config''s `dependencies: ["setup"]` (error quoted in verification.md M15), so no spec was executed in this environment. Selector and mock findings therefore rest on reading, plus the merged selector-drift review''s recorded checks.'
  - "Severity arbitration ran without a live user (autorun): the skill's fix loop expects the user to arbitrate majors, and this stage's rules forbid source changes. Default taken: each major carries a recommended routing (fix-before-Ship vs defer-to-issue) for Ship/Matt to accept or override; nothing was fixed in-session."
  - "In-flight state of #4820 and #4822 was taken from verification.md plus live issue labels (`gh issue view`: both OPEN, `in-progress`; no fix PRs visible yet — noting `gh` search lag). Their eventual fix content was NOT reviewed here; Ship must re-verify both merged and the live journey green before release."
---

# Review: venue-onboarding-floor-plan — floor plan inside the new-venue wizard

## Scope

The run's 12 squash merges on `main`, `f8dca42a2..ec5d82e92` (#4767 #4774 #4781
#4783 #4790 #4792 #4797 #4802 #4804 #4811 #4814 #4815), re-read at `ddf6994aa`
— 36 files: 10 new source files under
`apps/hospitality/src/components/venue-onboarding/` + `VenueOnboardingPage.*`,
their 11 test files, `onboarding-steps.ts`, 3 E2E files, 3 docs, `package.json`
(size budget), and the four regenerated `llms*.txt`. Frozen files re-checked
this session: `git log --oneline f8dca42a2..ec5d82e92 -- apps/hospitality/e2e/auth.spec.ts apps/hospitality/e2e/auth.setup.ts`
returned nothing. Three passes per the skill: correctness, design
(architecture.md contracts + house patterns), security. Every command quoted
below was run in this session.

## Findings

### Critical: plan activation 400s against production — the wizard cannot deliver an active plan (ALREADY ROUTED — issue #4820, fix in flight; do not double-count at Ship)

- Scenario: live journey run 33440536553 — venue, plan, and tables all created
  against production, then `POST /api/v1/floor-plans/:id/activate` → 400 "Body
  cannot be empty when content-type is set to 'application/json'". Root cause
  re-verified in source this session: `packages/api-client/src/floor-plans.ts`
  `setActive` calls `postOne(url, undefined, FloorPlanSchema)` while
  `client.ts` sets `"Content-Type": "application/json"` unconditionally, and
  the service route `/:id/activate`
  (`services/reservations/src/routes/floor-plans.ts`) declares no body schema —
  Fastify's JSON parser rejects the empty json-typed body before the handler.
  Pre-existing since #4735 (`useFloorPlans.ts:69` — the editor's "Set as
  Active" is broken too), exposed because this run made activate a mainline
  step. Not caused by this run's diff; fails the run's outcome anyway (M7/M16).
- Decision: routed — issue **#4820** (OPEN, `in-progress`, TDD worker
  running). **Blocks Ship** until the fix merges, deploys, and a fresh
  `venue-journey.yml` run is green through Step 6.

### Major: `isSubmitting` is a permanently-false dead flag still guarding Back and both step rails — Back mid-launch strands a completed launch (NEW — not covered by #4820/#4822/#4817)

- Scenario: measured — only `submit()` dispatches `SUBMIT_START/SUCCESS/ERROR`
  (`useOnboardingWizard.ts:397-409`) and no non-test caller of
  `actions.submit` exists after #4804 retired it, so `isSubmitting` is `false`
  forever. It still gates `disabled={step === 1 || isSubmitting}` on Back
  (`VenueOnboardingPage.tsx:244`), `onStepClick={isSubmitting ? undefined : actions.goToStep}`
  on the mobile indicator (`:152`) and the desktop rail
  (`OnboardingLayout.tsx:31`). Concrete failure: press Launch; while the
  sequence is in flight, click Back (enabled — nothing disables it). LaunchStep
  unmounts, its `unmountedRef` guard then suppresses `setCelebrating` and
  `onCelebrationDone` when the page-level `handleLaunch` resolves in the
  background. The venue goes fully live (toast fires, venue adopted), but
  `celebrationDone` is never set, so the handoff effect
  (`VenueOnboardingPage.tsx:132-136`) never navigates. Returning to step 6
  renders `Launching "{name}"` + an all-green panel + a disabled Launch button:
  parked on a finished launch with no forward action (the same parked-state
  class the #4804-review addendum fixed for Retry). Variant: Back pressed
  before the venue POST resolves (`launch.venueId` still null) reaches steps
  1-4, whose edits are then silently ignored by the already-running sequence.
  The architecture and breakdown item #9 both specified
  "`isSubmitting`/`submitError` re-derived from `launch`" — the worker's
  declared deviation "isSubmitting gating untouched" was accepted at PR review
  without this consequence being chased.
- Decision: deferred to Ship's arbitration with a **fix-before-Ship
  recommendation** — the fix is one derivation
  (`launch.inFlightStage !== null` feeding the three guards, or disabling Back
  on step 6 once `launchStarted`) plus one test, and it closes the strand
  window entirely. Mitigations if Matt defers instead: the window is the
  seconds-long launch call, and a reload recovers (venue/plan/tables are
  intact server-side; the readiness path takes over). Needs a new issue either
  way — none exists.

### Major: after a mid-sequence failure the draft is still editable, and Retry silently desyncs the live plan from the draft (NEW — not covered by #4820/#4822/#4817)

- Scenario: launch fails at table 6 of 14 (`createdTableNames` holds 5).
  Back (floor is 5, deliberately reachable) → edit on step 5: move or remove
  an already-created table, or swap templates (ConfirmDialog → "Replace
  layout"). Next → Retry. `runTablesStage` skips every name in
  `createdTableNames` and posts the rest: a moved/edited table keeps its old
  server position forever (name matches → skipped), a removed table survives
  on the server, and a template swap yields the union of both layouts on the
  live plan — while the `floorPlan` stage is already done, so the new
  template's `planName` is never posted either. The manager lands in the
  editor looking at a plan that is not what they arranged. Everything here is
  the machine working as coded (`launch-sequence.ts:250-269`); what's missing
  is any freeze on the draft once server state exists, mirroring the
  navigation lock that already floors at step 5.
- Decision: deferred — recommend one follow-up issue combined with the finding
  above (freeze `FloorPlanStep` to read-only once `launch.venueId !== null`,
  or reconcile on retry). Reasons for deferral rather than fix-before-Ship:
  reachable only after a live partial failure followed by deliberate edits;
  the editor landing shows the server truth, so the divergence is visible and
  hand-fixable; and the failure it compounds is itself blocked on #4820.

### Minor: M1 drift pin missing (ALREADY ROUTED — issue #4822, worker running)

- Scenario: `grep -rn "ONBOARDING_STEPS.length" src e2e` → no matches; both
  step counts are independently hardcoded (`TOTAL_STEPS = 6`, six array
  entries) and can drift again exactly as M1 forbade. Behavior itself verified
  six-across at Verify.
- Decision: routed — **#4822** (OPEN, `in-progress`). Non-blocking.

### Minor: S3 landing assertion undelivered; collection mocks method-blind and unexercised (ALREADY ROUTED — issue #4817, `ready`)

- Scenario: no spec clicks "Launch Venue"; #4815's stateful collection-POST
  mocks (venues/floor-plans/tables) are exercised by zero specs — the
  shipped≠run shape — and the bare collection handlers answer any HTTP method
  as a create.
- Decision: routed — **#4817** carries both. Non-blocking (S3 is SHOULD).

### Minor: a failed Retry is an unhandled promise rejection (NEW)

- Scenario: `ErrorRetryBanner` types `onRetry: () => void` and calls it bare
  (`ErrorRetryBanner.tsx:21`); the page passes async `handleRetry`, which
  awaits `handleLaunch` — and `handleLaunch` throws whenever
  `result.failedStage !== null` (`VenueOnboardingPage.tsx:76-78`). A retry
  that fails again therefore rejects with no catcher: console/Sentry noise on
  every consecutive failure. UI state stays correct (progress is dispatched
  via `onProgress` before the throw), so this is noise, not breakage — but it
  will pollute Sentry triage the first time a real outage makes users mash
  Retry.
- Decision: deferred — fold a `try/catch` into `handleRetry` in the same PR
  that fixes the dead-flag major (same file).

### Minor: dead `submit` surface and unreachable `submitError` banner (NEW)

- Scenario: `submit`, the three `SUBMIT_*` actions, and the
  `isSubmitting`/`submitError` state survive with zero production callers;
  `LaunchStep`'s `submitError` banner (`LaunchStep.tsx:278-284`) can never
  render (failures surface via `launch.errorMessage` in the Retry banner
  instead). Breakdown #9 promised retirement; the code kept the old surface.
  Dead-but-plausible code is exactly what misleads the next reader (it misled
  the guards in the major above).
- Decision: deferred — remove alongside the dead-flag fix; flagged, not
  silently removable under this stage's no-source-change rule.

### Minor: USER-FLOWS.md ticks "Floor plan can be activated immediately" — false in production until #4820 lands (covered by #4820)

- Scenario: #4814 ticked both Flow 1 floor-plan criteria citing unit evidence;
  the activate half is contradicted live by the Critical above. True again the
  moment #4820's fix deploys — no separate action needed unless #4820
  stalls.
- Decision: routed with #4820. Non-blocking on its own.

**Already recorded, not re-raised** (latent notes carried in breakdown.md's
Implement log, all with no current failure path): `templateById(id as TemplateId)`
throws on a hand-constructed unknown id; redundant `aria-label` on the
`aria-hidden` Progress; groove animates background rather than ux.md's
height-fill prose; `DEFAULT_LAYOUT` duplicated from `NewFloorPlanDialog`
(pinned by test; hoist is a backlog candidate); `TableShape` drag-shadow tween
not reduced-motion-gated (pre-existing, editor-shared).

## Passes with no findings

- **Security** — clean on all three checks: no secrets or hex-hidden values in
  the 10 new files (grep this session: only a `#4754` issue-ref comment); all
  user input crosses the boundary through `AddTableDialog` + server Zod/AJV
  validation (template data is static and schema-pinned by
  `floor-plan-templates.test.ts`'s `CreateTableBodySchema` parse); no
  injection surface (no raw HTML, no query construction; all rendering via
  React text nodes); errors shown to users are the server's RFC 7807 `detail`
  or fixed fallbacks — no internals leaked. The launch sequence calls only
  existing `requireAuth` + `requireVenueAccess` endpoints; no new route, no
  rate-limit config touched.
- **Correctness of the pure core** — `launch-sequence`'s resume algebra holds
  under re-reading (venue can never re-post once `venueId` is set;
  duplicate-400 counts as done; `LaunchStageError` preserves partial table
  progress; N = 0 skips the stage); reducer immutability is genuine
  throughout; `findDuplicateName` trims symmetrically; projections keep
  `DRAFT_ID`/`localId` out of every Launch payload.
- **Design conformance** — the merged shape matches architecture.md's
  contracts and file-ownership map everywhere except the two documented
  deviations already logged in breakdown.md (six-step flip moved into #4761;
  LaunchStep props optional) and the `isSubmitting` re-derivation gap raised
  as the major above. Rialto-only components, `var(--rialto-*)` throughout,
  logical properties, CSS Modules, `.js` import extensions, no
  setState-in-effect-body sync patterns, reduced-motion guards present on
  every new animation (`LaunchStep.module.css:77,105`,
  `LaunchStagePanel.module.css:62-66`), `aria-hidden` preview SVGs with
  accessible names on the cards, one polite live region per surface.
- **E2E hygiene (static)** — the updated selectors are strict-mode-safe as
  merged (radiogroup scoping dodges the rail label; the celebration is the
  page's only `role="status"`; "Active" exact-match has one reachable
  literal), frozen auth files untouched across the whole range, no Konva
  interaction anywhere in the specs.
- **Docs and budget** — #4814's claims verified against merged code (with the
  one production-truth caveat above); the 7.5 kB onboarding-chunk budget is
  measured, headroom-consistent, and was proven live by a forced red.

## Verdict

**Not ready to ship.** Two gates stand between this run and `release.md`:

1. **#4820** (Critical, in flight) — merged + deployed + a fresh green
   `venue-journey.yml` run through Step 6 is the evidence Ship must collect.
   Until then a manager finishing the wizard does not get an active plan, in
   production, every time.
2. **The dead-`isSubmitting` major** — fix before Ship (recommended; one
   derivation + one test, no design change) or an explicit deferral from Matt
   recorded in release.md. It is the only new finding with a user-stranding
   scenario and it is not tracked anywhere yet.

Everything else is routed (#4822 in flight, #4817 ready) or deferred with
reasons above. The wizard itself — model, reducer, step UI, panel, landing,
docs, budget — reviewed clean beyond these findings.

Next stage: Ship, once gate 1 (and gate 2's fix-or-deferral) is satisfied.
