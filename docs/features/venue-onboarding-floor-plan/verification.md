---
stage: verify
run: feature:venue-onboarding-floor-plan
date: 2026-08-31
assumptions:
  - "Criteria list = prd.md M1-M18 + S1-S5. breakdown.md's per-item acceptance lines are treated as subsumed by these per its own Coverage table; item-level evidence is cited from the Implement log's recorded worker gates and review verdicts rather than re-run issue-by-issue. Every repo gate quoted below was re-run fresh against merged main at ec5d82e92."
  - "M16's check names 'the first post-deploy venue-journey.yml run'; the next scheduled run is 14:00 UTC tomorrow, so this stage dispatched the workflow manually (gh workflow run venue-journey.yml --ref main, 2026-08-31T21:17Z, run 33440536553) rather than leaving the criterion unread. The brief is silent on this; dispatching exercises exactly what the daily schedule exercises, cleanup included."
  - "check-adr and check-deps were run as node tools/cli/dist/index.js check-adr / check-deps (after pnpm build --filter @mbe/cli...) — no root pnpm check-adr / check-deps scripts exist; the pre-commit hook invokes the same CLI subcommands (pnpm --filter @mbe/cli start check-adr --staged)."
  - "No manual or visual Konva-drag check was performed. breakdown.md surfaced that the drag/snap path ships with reducer-level coverage only and left the call to Verify; the decision here is that the unit evidence (snap assertion through the real FloorPlanCanvas path in FloorPlanStep.test.tsx) suffices for this stage, with the gap recorded under Not verified."
---

# Verification: venue-onboarding-floor-plan — floor plan inside the new-venue wizard

Verified against merged `main` at `ec5d82e92` (PR #4815, the last of 12 merged
PRs; `git pull --ff-only origin main` run first). All commands below were
actually run in this session on 2026-08-31; output is quoted, not recalled.

## Summary

**19 PASS, 1 PARTIAL, 3 FAIL** across 23 criteria (M1-M18, S1-S5).

The wizard itself verifies clean: six steps, five templates with invariant
proofs, real-canvas editing, draft preservation, a resumable four-stage Launch,
correct landing, honest copy, reduced motion, tokens, mobile band, keyboard —
all evidenced by 1936/1936 unit tests plus green lint / typecheck / regen /
check-adr / check-deps / size gates. The verdict is spoiled at the last
production step: **the live activate stage fails with a 400 ("Body cannot be
empty when content-type is set to 'application/json'")**, caught by the first
post-deploy run of the daily live journey, which this stage dispatched. Venue,
floor plan, and all tables are created against production and the Retry banner
appears exactly as designed — the failure is a client↔service content-type
defect on `POST /floor-plans/:id/activate` (pre-existing `@mbe/api-client`
behavior, unexposed until this feature made activate reachable), not a defect
in the wizard code this run wrote. It still fails the run's outcome sentence:
a manager finishing the wizard today does not end with an _active_ plan.

## Criteria & evidence

### Repo gates run once, cited by several criteria (M18 backbone)

- Check: `pnpm --dir apps/hospitality test`, root `pnpm typecheck`,
  `pnpm --dir apps/hospitality lint`, `pnpm build --filter @mattbutlerengineering/rialto`
  → `pnpm --dir apps/hospitality build` → `pnpm --dir apps/hospitality size`,
  `pnpm build --filter @mbe/cli...` → `pnpm regen --check`,
  `node tools/cli/dist/index.js check-adr`, `node tools/cli/dist/index.js check-deps`,
  `pnpm run check:circular-deps`
- Evidence:

  ```
  Test Files  143 passed (143)
       Tests  1936 passed (1936)
     Duration  42.27s

  Tasks:    48 successful, 48 total   (root pnpm typecheck, exit=0)

  ✖ 124 problems (0 errors, 124 warnings)   (lint exit=0; warnings pre-existing)

  All generated artifacts are up to date.   (pnpm regen --check, exit=0)

  Checking codebase against 1 active ADRs...
  ✅ No architectural violations detected.

  ✅ All external dependencies are consistent across the monorepo.

  PASS: No circular dependencies found.   (check:circular-deps)
  ```

- Result: PASS (feeds M18)

### M1. Six steps, one count

- Check: source greps + the merged suites.
- Evidence:

  ```
  useOnboardingWizard.ts:24  export const TOTAL_STEPS = 6;
  onboarding-steps.ts:16-21  Welcome / Location / Hours / Settings / Floor plan / Launch (6 entries)
  useOnboardingWizard.test.ts:454  it("caps advancement at TOTAL_STEPS") → expect(TOTAL_STEPS).toBe(6)
  VenueOnboardingPage.test.tsx:591 "should navigate through all 6 steps, reaching the floor
    plan step then the Launch review" — asserts floor-plan-step testid at step 5,
    launch-step testid + "Launch Venue" at step 6
  StepIndicator.test.tsx (4 tests) / VerticalStepRail.test.tsx (6 tests) — both drive
    labels from ONBOARDING_STEPS (VerticalStepRail.test.tsx:10 iterates all entries)
  ```

  But the promised drift pin does not exist:

  ```
  $ grep -rn "toHaveLength(TOTAL_STEPS)|ONBOARDING_STEPS.length|..." src
  NO EQUALITY PIN FOUND
  ```

- Result: **PARTIAL** — six steps verified in both sources and both rails, but
  no test asserts `ONBOARDING_STEPS.length === TOTAL_STEPS`, so the two
  hardcoded sources can drift again exactly as the criterion forbade.
  One-line test; see Failures.

### M2. Template picker with live previews

- Check: merged unit suites (all in the 1936 above) + static E2E read.
- Evidence:

  ```
  FloorPlanStep.test.tsx (25 tests): "renders a radiogroup with five cards labelled per
    template"; "renders the canvas with the chosen template's table count once the draft
    reflects it"; "with pristine: false, opens the confirm dialog and does not call
    onSelectTemplate until confirmed"
  TemplatePreview.test.tsx (6 tests): "renders one shape node per table plus the ground
    rect, for a 14-table shape mix"; "positions a square table at its centre offset by
    half its size"; "renders only the ground rect and no shape nodes for an empty tables
    array" — geometry-derived SVG, never a static image
  onboarding.spec.ts asserts getByRole("radio") toHaveCount(5) + toBeChecked (DOM only;
    spec not executed — see Not verified)
  ```

- Result: PASS

### M3. Template invariants

- Check: `floor-plan-templates.test.ts` (55 tests, in the green suite).
- Evidence (test names, all passing):

  ```
  "has unique table names" / "has valid capacity/minCovers on every table" /
  "has a valid shape with matching projected dimensions on every table" /
  "has x/y as multiples of GRID_SIZE on every table" / "keeps every table's bounding
  box inside the canvas" / "has no two bounding boxes that intersect" /
  "has every table parse against CreateTableBodySchema when projected" /
  "matches the 14 derived coordinates exactly, in order" (Restaurant) /
  Blank: "has no zones and tablesForTemplate returns []"
  ```

- Result: PASS

### M4. The chosen layout is editable on the real canvas

- Check: FloorPlanStep + reducer suites.
- Evidence:

  ```
  FloorPlanStep.test.tsx: "calls onMoveTable with the canvas-snapped coordinates on drag
    end" (mock feeds raw (137,253); the real FloorPlanCanvas snap path returns (140,260));
    "rejects a duplicate name and does not call onAddTable" (server-verbatim message);
    "selecting a table then pressing Remove table calls onRemoveTable with its localId"
  useOnboardingWizard.test.ts: addDraftTable / moveDraftTable / removeDraftTable cases,
    each asserting no mutation of the previous state object
  ```

- Result: PASS (real Konva drag never exercised anywhere in the repo — see
  Not verified)

### M5. Back / Next / rail preserve the draft

- Check: reducer suite + keystone review record.
- Evidence:

  ```
  useOnboardingWizard.test.ts:336 "leaves data.floorPlan deep-equal across next()/back()
    and goToStep() round trips at step 5"
  useOnboardingWizard.test.ts:355 "with launch.venueId set: GO_TO_STEP below 5 is refused
    and BACK floors at step 5" (post-venue lock)
  ```

  Page-level "edit on step 5, Back, Next, same draft" was an accepted AC of
  PR #4804, verified by its reviewer on an independent re-run (breakdown.md
  Implement log, pass 8/10, "all 13 ACs met with file:line test evidence").

- Result: PASS

### M6. Launch review shows the plan

- Check: LaunchStep suite.
- Evidence:

  ```
  LaunchStep.test.tsx: "renders the Floor Plan review card for a 14-table Restaurant
    draft"; "renders the empty-tables copy for a Blank draft"; "renders no fifth card
    when templateId is null (pre-#4761 default)"
  ```

- Result: PASS

### M7. Launch produces venue + plan + tables + active, visibly

- Check: unit suites (the criterion's stated check — no bootstrap route was
  built, so the route-probe clause is N/A) **plus** the live journey run.
- Evidence, unit (all green):

  ```
  VenueOnboardingPage.test.tsx:708 "runs the launch sequence in order — venue, floor
    plan, tables in order, then activate"
  launch-sequence.test.ts (29 tests): "posts the floorPlan create with the venueId,
    planName and DEFAULT_LAYOUT"; "matches the geometry constants NewFloorPlanDialog
    uses"; "at N = 0, posts no table and the sequence still activates"
  LaunchStagePanel.test.tsx (9 tests): four-row LED states pending/in-flight/done/
    failed, Progress at 43% for 6-of-14, Tables row absent at N = 0
  ```

- Evidence, live (run 33440536553, first post-deploy journey, auto-filed
  issue #4820):

  ```
  POST /api/v1/floor-plans/cmthqpg3f000401b7l9wkyjns/activate failed:
  400 Body cannot be empty when content-type is set to 'application/json'
  ```

  Venue, floor plan, and tables stages all succeeded against production (the
  plan id above is real). Root cause, measured in code: `@mbe/api-client`'s
  `setActive` calls `postOne(url, undefined, schema)` (floor-plans.ts:56-62)
  while the client sets `"Content-Type": "application/json"` unconditionally
  (client.ts:67); the service route `/:id/activate` declares no body schema
  (services/reservations/src/routes/floor-plans.ts:218-235), and Fastify's
  JSON parser rejects an empty json-typed body with 400 before the handler
  runs. Nothing offline can see this: unit fakes and E2E mocks accept a
  body-less POST.

- Result: **FAIL** (in production — the unit-level contract the criterion
  named passes in full, but the outcome "venue has an active plan" is not
  achieved against the deployed service; routes to a fix, see Failures)

### M8. Partial failure is recoverable and never re-posts the venue

- Check: launch-sequence + page + LaunchStep suites; live corroboration.
- Evidence:

  ```
  launch-sequence.test.ts: "resumes from a venue failure by retrying venue creation until
    it succeeds"; "resumes from a floorPlan failure without re-posting the venue";
    "resumes from a table failure starting at the first uncreated table"; "resumes from
    an activate failure calling only setActive"; "a mid-tables duplicate-name rejection
    counts that table as done and continues"
  VenueOnboardingPage.test.tsx:760 "M8: retry after a mid-table failure issues no second
    venue/floor-plan POST and resumes at the first uncreated table"
  LaunchStep.test.tsx: "removes the Launch button and shows ErrorRetryBanner after a
    failure, wiring Retry to onRetry"; resume-lead copy tests for tables- and
    venue-stage failures
  ```

  Live corroboration: the journey's failure screenshot/page-error captured the
  in-place error with a Retry control after the activate 400 — the recovery
  surface behaved as designed under a real production failure.

- Result: PASS

### M9. Landing: new venue selected, tables visible, no bounce

- Check: page suite (first-venue and multi-venue fixtures).
- Evidence:

  ```
  VenueOnboardingPage.test.tsx:845 "navigates to /floor-plans/{planId} once the
    celebration finishes and the new venue is selected"
  :868 "navigates to /floor-plans/{planId} after a successful Retry, without needing the
    celebration button (PR #4804 addendum)"
  :896 "Story 6: selects the newly-launched venue (not venues[0]) before navigating, in
    a multi-venue fixture"
  :920 "stays on the celebration and never navigates if refetchVenues never returns the
    new venue" — the deliberate, pinned failure mode (known open finding, accepted
    at review; not re-litigated here)
  VenueOnboardingPage.tsx:124 setVenueId(launch.venueId) gated on the venue being in the
    refetched list; :135 navigate(`/floor-plans/${launch.floorPlanId}`, { replace: true })
  ```

- Result: PASS (unit; live handoff unreached because the activate stage fails
  first — see M7)

### M10. Copy no longer contradicts

- Check: repo greps + LaunchStep suite.
- Evidence:

  ```
  $ grep -rn "finish setup" apps/hospitality/src            → NO MATCHES
  $ grep -rn "You're ready to take reservations" src (+ &apos; form) → NO MATCHES
  LaunchStep.test.tsx: "celebration copy reads 'live with N tables' when the launched
    draft has tables"; zero-tables body copy test
  ```

- Result: PASS

### M11. Reduced motion

- Check: css greps + suites.
- Evidence:

  ```
  LaunchStep.module.css:77,105  @media (prefers-reduced-motion: reduce) blocks
  LaunchStagePanel.module.css:62-64  prefers-reduced-motion: reduce → transition: none
  FloorPlanStep.module.css — no transition/animation rules at all (nothing to guard)
  LaunchStep.test.tsx: "skips the long celebration delay under prefers-reduced-motion
    but still shows the success state"
  ```

- Result: PASS

### M12. Tokens, rialto components, Konva fill rule

- Check: hex grep across all 10 new source files + suites + lint.
- Evidence:

  ```
  $ grep -rniE "#[0-9a-f]{3,8}\b" <10 new files>
  → single match: LaunchStagePanel.tsx:3 (comment "…(#4754)…" — an issue ref, not a color)
  LaunchStagePanel.test.tsx: "uses only rialto tokens for color — no hex or rgb() literals"
  TemplatePreview.test.tsx: every fill/stroke from var(--rialto-*) (component AC)
  No new Konva fill was introduced (no file under components/floor-plan/ changed),
  so the drift-guard-table clause is N/A. Lint: 0 errors.
  ```

- Result: PASS

### M13. Mobile: pick and preview, never blocked

- Check: FloorPlanStep suite at a mocked narrow matchMedia.
- Evidence:

  ```
  FloorPlanStep.test.tsx: "renders the preview and narrow-band copy, and no canvas or
    Add table button" (0-1023 px band; Next still enabled — wizard completes)
  ```

- Result: PASS

### M14. Keyboard completion

- Check: FloorPlanStep suite.
- Evidence:

  ```
  FloorPlanStep.test.tsx: "moves radiogroup focus and selection with arrow keys";
  "does not call onMoveTable when arrow keys are pressed on a picker card while a table
    is selected" (the #4804-addendum double-fire guard, RED-first);
  "announces a table moved on keyboard nudge, but not on pointer drag"
  AddTableDialog.test.tsx unchanged (dialog remains keyboard-native)
  ```

- Result: PASS

### M15. E2E spec update, frozen files untouched

- Check: static spec read + git history over the run's merge range.
- Evidence:

  ```
  onboarding.spec.ts:123 test("advances through all 6 steps, picks a template, and
    reaches the Launch review") — five radios asserted, pick by accessible name,
    comment at :163 "…accessible name (never canvas pixels)"; no Konva interaction
    anywhere in the spec
  $ git log --oneline f8dca42a2..ec5d82e92 -- apps/hospitality/e2e/auth.spec.ts \
      apps/hospitality/e2e/auth.setup.ts
  → (empty — neither frozen file touched by any of the 12 PRs)
  ```

  Execution attempt (recorded honestly):

  ```
  $ pnpm --dir apps/hospitality exec playwright test e2e/onboarding.spec.ts
  Error: Missing required E2E auth env vars: E2E_AUTH0_DOMAIN, E2E_AUTH0_CLIENT_ID,
  E2E_AUTH0_AUDIENCE, E2E_AUTH_EMAIL, E2E_AUTH_PASSWORD
      at auth-helpers.ts:39  (via auth.setup.ts:16 — playwright.config.ts chromium
      project has dependencies: ["setup"], so even mocked specs require them)
  ```

  The advisory `Hospitality E2E` CI job is where this spec actually runs.

- Result: PASS (spec content + frozen files; local execution blocked by
  environment, as the PRD pre-surfaced — see Not verified)

### M16. The daily live journey walks six steps and still cleans up

- Check: unit half from the green suite; live half from the first post-deploy
  `venue-journey.yml` run (dispatched by this stage, 2026-08-31T21:17Z).
- Evidence:

  ```
  e2e/journeys/journey-api.test.ts (16 tests) ✓ / journey-recorder.test.ts (12 tests) ✓

  Run 33440536553 (workflow_dispatch, head ec5d82e92): completed/failure
    Authenticate                         passed
    Sweep leftover synthetic venues      passed
    Step 1 — name the venue              passed
    Step 2 — location and time           passed
    Step 3 — operating hours             passed
    Step 4 — accept the recommended settings  passed
    Step 5 — pick a floor plan template  passed
    Step 6 — launch the venue            FAILED (30272 ms)
      POST /api/v1/floor-plans/…/activate → 400 (see M7)
      waiting for getByRole('status').getByText('Your venue is live — add tables next')
  Auto-filed issue: #4820
  ```

  The six-step walk itself works against production through the template pick
  (steps 1-5 green, including the new Step 5); the failure is the M7 activate
  defect surfacing at the celebration assertion. Cleanup: the run-start sweep
  passed (it deleted the prior failure's leftovers); this run's own synthetic
  venue (`synthetic-journey-33440536553`) is expected to be swept by the next
  run and was not directly verified deleted. Context: the prior scheduled run
  (33433100985, 19:54Z, head 63d7888dc) failed exactly as the PRD predicted
  for the mid-train window — old spec asserting the old celebration copy
  against a site already carrying #4760's new copy; #4762 closed that window.

- Result: **FAIL** (live journey red at Step 6 on the first post-deploy run;
  same root cause as M7, tracker record #4820)

### M17. Docs move with the code

- Check: doc greps + commit `0898c214c` (#4814) + regen.
- Evidence:

  ```
  apps/hospitality/CLAUDE.md:38  "venue-onboarding/ — 6-step wizard: WelcomeStep →
    LocationTimeStep → OperatingHoursStep → SettingsStep → FloorPlanStep → LaunchStep"
  docs/USER-FLOWS.md:30-32  Flow 1 steps describe the Floor Plan step, "Launch Venue",
    and the editor landing; :41-42 both floor-plan ACs ticked ([x]); :46 Done definition
    now reachable from the wizard
  docs/IMPROVEMENT-BACKLOG.md:22 (Completed Items)  "- [x] **#13** Floor plan templates —
    five layouts (Restaurant, Cafe, Bar, Patio, Blank) added to the venue-onboarding
    wizard's Floor Plan step"  (the §13 heading stays in P3 to preserve #14-18 numbering,
    per the commit's stated convention)
  pnpm regen --check → "All generated artifacts are up to date."
  ```

- Result: PASS

### M18. Gates

- Check: the repo-gates block above + size + CI.
- Evidence (size, from `pnpm --dir apps/hospitality size`, exit=0, all 10
  entries passing):

  ```
  Hospitality App (JS)      Size limit: 500 kB   Size: 12.04 kB brotlied
  Canvas Vendor (lazy)      Size limit: 100 kB   Size: 81 kB brotlied
  Venue Onboarding (lazy)   Size limit: 7.5 kB   Size: 5.89 kB brotlied
  ```

  No file under `packages/rialto/src` was touched by this run's 12 PRs
  (breakdown "Not touched by any item", re-confirmed by the merge-range file
  lists in the Implement log), so no `.changeset` is owed. CI: PR #4815
  `CI Gate  pass` (run 33438254919) and the PR merged 2026-08-31T21:07:53Z via
  auto-merge, which only completes on a green required check; the post-merge
  main-push ci.yml run on ec5d82e92 (33439735957) finished
  **completed/success** during this verification session (polled directly),
  so main is green at the run's final merge.

- Result: PASS

### S1. Arrow-key nudge

- Evidence: FloorPlanStep.test.tsx — nudge-by-GRID_SIZE with announce
  ("announces a table moved on keyboard nudge"), input-target skipping, and
  the defaultPrevented double-fire guard (all in the green suite).
- Result: PASS

### S2. Preview on the Launch review

- Evidence: LaunchStep.test.tsx "renders the Floor Plan review card for a
  14-table Restaurant draft" — the card renders TemplatePreview (same
  component as the picker); TemplatePreview className pass-through test.
- Result: PASS

### S3. E2E asserts the landing

- Check: static read of the merged spec.
- Evidence:

  ```
  $ grep -n "Launch Venue|toHaveURL|floor-plans" e2e/onboarding.spec.ts
  55: await expect(page).toHaveURL(/\/onboarding/);      ← only URL assertion in the file
  ```

  No spec clicks "Launch Venue"; the mocked create sequence
  (api-mocks.ts collection-POST handlers for venues / floor-plans / tables,
  shipped by #4815) is exercised by no spec — the "shipped ≠ run" shape the
  selector-drift reviewer flagged. Already tracked as follow-up **#4817**
  (retry-handoff E2E + method-guarding the collection mocks).

- Result: **FAIL** (SHOULD-level; machinery shipped, assertion not delivered —
  #4817 carries it)

### S4. Motion with intent

- Evidence:

  ```
  LaunchStagePanel.module.css:59  transition: background var(--rialto-duration-standard)
    var(--rialto-ease-precision);   (:64 → transition: none under reduced motion)
  FloorPlanStep.module.css — no bespoke transition/animation rules (template selection
    carries no custom motion; rialto Button/aria-pressed states only)
  ```

- Result: PASS

### S5. Onboarding-chunk budget

- Evidence: `apps/hospitality/package.json` entry "Venue Onboarding (lazy
  chunk)" `dist/assets/VenueOnboardingPage-*.js` limit 7.5 kB; measured this
  session at 5.89 kB brotlied (pass). PR #4811 proved the gate live
  (temporary 5 kB limit → "exceeded by 874 B", exit 1 — breakdown log).
- Result: PASS

## Failures

1. **Live activate stage 400s — the wizard cannot finish against production
   (M7, M16).** `POST /api/v1/floor-plans/:id/activate` with
   `Content-Type: application/json` and an empty body is rejected by Fastify
   before the handler runs. One root cause, measured: `@mbe/api-client`
   `postOne(url, undefined, …)` + unconditional JSON content-type
   (packages/api-client/src/client.ts:67, floor-plans.ts:56-62) against a
   route with no body schema (services/reservations/src/routes/floor-plans.ts:218).
   Blast radius beyond the wizard: `FloorPlanEditorPage`'s "Set as Active"
   uses the same client method, so plan activation is broken everywhere in
   production — pre-existing since #4735 (whose unauthenticated 401 probe
   could not see past auth to the body parser), surfaced now because this
   feature made activate a mainline step. Recovery machinery held live
   (venue + plan + tables persisted; Retry offered). **Routes to Implement /
   a maintenance capture**: fix the client (send `{}` or omit the
   content-type when there is no body) or give the route an empty-body
   tolerance; add the missing offline seam (a mock/contract test that rejects
   a body-less json-typed POST the way Fastify does). Tracker record already
   exists: auto-filed issue **#4820** (run 33440536553).
2. **S3 not delivered** — no landing assertion after a mocked Launch; the new
   collection-POST mock machinery is unexercised by any spec. Carried by
   follow-up **#4817** (with method-guarding of the bare collection handlers).
3. **M1 drift pin missing** — no test asserts
   `ONBOARDING_STEPS.length === TOTAL_STEPS`; both are independently
   hardcoded (6 and six entries) today. One-line test; fold into the #4817
   follow-up PR or the next hospitality change.

## Not verified

- **Mocked E2E specs were not executed locally** — `auth.setup.ts` hard-requires
  `E2E_AUTH0_*` env vars even for mocked projects (exact error quoted under
  M15); the advisory `Hospitality E2E` CI job is where `onboarding.spec.ts`
  actually runs. Spec changes were verified statically here, as they were at
  review (#4815 was reviewed with that limitation declared).
- **Real Konva drag** — nothing in the repo drives a real drag (unit suites
  mock react-konva; M4/M15 forbid E2E driving the canvas). The wizard's
  drag/snap path ships with the same reducer-level coverage shape the editor
  always had; the snap assertion does route through the real FloorPlanCanvas
  handler. No manual/visual check was performed this stage.
- **Cleanup of the failed journey run's synthetic venue**
  (`synthetic-journey-33440536553`) — the failure aborted before the spec's
  delete; the next run's "Sweep leftover synthetic venues" step is the
  designed reclaim (it demonstrably swept the prior failure's leftovers this
  run) but its deletion of this specific venue was not observed.
- **Multi-venue manager and Blank-template landings in production** — unit
  fixtures only; the live journey uses the Blank path but never reaches the
  landing while Failure 1 stands.

Next stage: the wizard-side criteria support proceeding to Review, but
Failure 1 is a production-blocking outcome gap — route it back to
Implement/capture (issue #4820) before or alongside Review.
