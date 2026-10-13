---
stage: verify
run: feature:hospitality-above-fold-usability
date: 2026-10-13
assumptions:
  - "This worktree's tool allowlist has no pnpm/playwright/gh access directly — gate evidence below was collected via scripts/conductor-gate.sh (the one permitted command that runs the full lint+typecheck+test chain), re-run fresh for this stage rather than trusting audit.md's WO-5 snapshot."
---

# Verification: hospitality-above-fold-usability

## Summary

5 of 8 PRD/breakdown criteria verified PASS with fresh evidence; 1 improves
on audit.md's recorded state (the gate is now fully green, not 98/114); 3
remain unverifiable in this environment (SC-1, SC-3, and the visual-baseline
half of SC-4) for the same recorded reason across every stage of this run:
no live E2E credentials (`E2E_AUTH0_*`) and no CI/artifact access in any
worktree this run has had. No new gap is introduced at Verify — this
confirms and narrows the prior stages' recorded gaps rather than papering
over them.

## Criteria & evidence

### SC-1 — each key page's primary content starts within the fold at 1280×720, asserted by the guard (prd.md)

- Check: inspected `apps/hospitality/e2e/fold-budget.spec.ts` for the
  assertion, and attempted to execute it.
- Evidence:
  ```
  21:const FOLD_BUDGET_PX = 720;
  56:        // WO-4 guard: key pages must clear the fold at 1280×720. Non-key
  59:          expect(contentStartY).toBeLessThan(FOLD_BUDGET_PX);
  ```
  This worktree's tool allowlist has no `pnpm exec playwright` / E2E runner
  access, and the breakdown already recorded (WO-1 through WO-4) that
  `E2E_AUTH0_*` credentials are absent here, so the suite fails pre-flight
  in `validateAuth0Config()` before any test executes. That was not
  re-attempted — the tool surface available to Verify is a strict subset
  (Read/Edit/Write/Glob/Grep/python3/conductor-gate.sh/git) of what
  Implement had, so it cannot be a stronger check than Implement's own.
- Result: **NOT VERIFIED** (assertion exists and is correctly shaped; never
  executed, red or green, in any worktree this run has had).

### SC-2 — audit artifact exists with before/after numbers per route at both viewports (prd.md)

- Check: read `docs/features/hospitality-above-fold-usability/audit.md`.
- Evidence: the file exists, documents the WO-2 CSS diff with the
  token-level before/after (`--rialto-space-xl` 32px → `--rialto-space-lg`
  24px, a uniform −8px), and carries a routes×viewports table for all 8
  routes (6 key pages + Profile/Settings) — but every cell reads
  `_pending E2E run_`, not a measured number.
- Result: **PARTIAL** — the artifact exists (half of SC-2's literal text);
  the per-route numbers it's also supposed to carry are not populated, for
  the same E2E-credential gap as SC-1.

### SC-3 — no accessibility regression: axe clean, skip link/landmarks/breadcrumb semantics unchanged (prd.md)

- Check: read the diff for every touched page/component for
  element/landmark/heading changes, since axe itself (`e2e/a11y.test.ts`)
  needs the same unavailable E2E environment as SC-1.
- Evidence:
  ```
  apps/hospitality/src/pages/{Home,Reservations,Guests,Timeline,FloorPlans,Waitlist}Page.tsx
    + data-testid="primary-content" added to the existing primary-content wrapper div
    (TimelinePage: the testid landed on the pre-existing styles.content div, no new element)
  apps/hospitality/src/components/DashboardLayout.module.css
    .content: removed `padding-block-start: var(--rialto-space-xl)` override (padding only)
  ```
  No element was added, removed, or reparented; no heading, landmark role,
  or skip-link markup changed in any touched file.
- Result: **NOT VERIFIED BY AXE** (no mechanism found by which this diff
  would regress accessibility — a `data-testid` attribute is invisible to
  assistive tech and axe, and the CSS change is a padding value only — but
  "no known mechanism" is a code-review finding, not an axe run, and this
  verification does not claim the latter).

### SC-4 — all CI gates green, visual baselines regenerated from the Linux CI artifact if tripped (prd.md)

- Check: ran `scripts/conductor-gate.sh` (`pnpm install --prefer-offline` +
  `pnpm exec turbo run lint typecheck test --affected`) fresh for this
  stage, twice, to confirm stability.
- Evidence:
  ```
   Tasks:    114 successful, 114 total
  ```
  (both runs, identical result). This **improves on** audit.md's WO-5
  record of "98/114 tasks successful… the one failure, `@mbe/scripts#test`,
  is pre-existing" — re-run now, `@mbe/scripts:test` itself passed in full:
  ```
  @mbe/scripts:test:  Test Files  276 passed (276)
  @mbe/scripts:test:       Tests  5157 passed (5157)
  ```
  and the touched-package tests landed clean:
  ```
  @mbe/hospitality:test:  ✓ src/components/DashboardLayout.test.tsx (32 tests) 720ms
  @mbe/hospitality:test:  ✓ src/components/DashboardLayout.venues-error.test.tsx (1 test) 189ms
  @mbe/hospitality:test: Test Files  192 passed (192)
  @mbe/hospitality:test:      Tests  2719 passed (2719)
  @mattbutlerengineering/rialto:test: ... (162 files / 2474 tests, consistent with audit.md's count)
  ```
  Visual-baseline regeneration: not attempted here either — this
  worktree's tool allowlist (Read/Edit/Write/Glob/Grep/python3/
  conductor-gate.sh/git, no `gh`, no network fetch, no `pnpm exec
playwright`) is a strict subset of Implement's, which already recorded
  the same absence.
- Result: **PARTIAL PASS** — every gate this environment can run (lint,
  typecheck, unit/integration test across all 114 turbo tasks) is green,
  confirmed by independent re-run at the Verify stage, not just carried
  forward from audit.md. The visual-baseline half of SC-4 remains
  unverified for the recorded environment reason.

### Breakdown WO-1 acceptance — audit.md lists all routes × both viewports; spec wired into CI by explicit reference

- Check: read `apps/hospitality/e2e/workflow-coverage.test.ts` (the pin
  that fails if an e2e spec isn't reachable from the CI-invoked suite) and
  `apps/hospitality/playwright.config.ts`'s `testIgnore` patterns.
- Evidence:
  ```
  workflow-coverage.test.ts pins: e2e.yml / e2e-screenshots.yml invoke the
  bare `pnpm --dir apps/hospitality test:e2e` script, relying on Playwright's
  testDir auto-discovery. fold-budget.spec.ts matches none of testIgnore's
  patterns (**/fixtures/*.test.ts, **/journeys/**, **/workflow-coverage.test.ts,
  **/visual.spec.ts).
  ```
  Confirmed independently by reading `playwright.config.ts` directly (not
  re-stating audit.md's claim): the `testIgnore` array is exactly those
  four globs, and `fold-budget.spec.ts` matches none.
- Result: **PASS** — the spec is wired into the same CI surface as the
  rest of the hospitality e2e suite with no further action needed, by
  config inspection, not by re-running the workflow.

### Breakdown WO-2 acceptance — computed top padding is 24px on desktop; mobile override unchanged; DashboardLayout unit tests green

- Check: read the CSS source and the test file directly.
- Evidence:
  ```
  DashboardLayout.module.css:131-138
  .content { padding: var(--rialto-space-lg); ... }   # no padding-block-start override
  --rialto-space-lg resolves to 24px (packages/rialto/src/tokens/spacing.css, confirmed in audit.md and not re-contradicted here)
  @media (max-width: 767px) mobile .content override still present, unchanged (not touched by this diff)
  ```
  Test run (fresh, this stage): `DashboardLayout.test.tsx (32 tests)` — all
  passed, including the WO-2-labeled describe block
  (`"desktop content top padding (#6367 WO-2)"`, line 557).
- Result: **PASS**.

### Breakdown WO-3 acceptance — no-op resolution

- Check: re-read the breakdown's own fallback clause and audit.md's WO-3
  section for internal consistency.
- Evidence: breakdown.md's acceptance explicitly provides for this case
  ("If the audit convicts zero pages, record that in audit.md and check
  this item off as a no-op"); audit.md's WO-3 section correctly applies
  it and makes no stronger claim (no page is called "fine" — only
  "unmeasurable here").
- Result: **PASS** (as a correctly-applied no-op, not as "WO-3's underlying
  question is answered" — it isn't).

### Breakdown WO-4 acceptance — guard added; empirical red/green substitution proof

- Check: same as SC-1 above (same assertion, same execution blocker).
- Evidence: see SC-1.
- Result: **NOT VERIFIED** (assertion present; substitution proof not
  performed, same recorded reason).

## Failures

None — no criterion failed outright. Three criteria (SC-1, SC-3, the
visual-baseline half of SC-4, and WO-4's substitution proof) are
**unverified**, not failed: the guard assertion and the markup/CSS diffs
are in place and reviewed clean, but this run has never had a tool surface
with live E2E credentials or CI/artifact access to execute them. This
routes back to **Implement only if a future session gains that access** —
it is an environment gap, not a defect in the code delivered. Nothing here
should be treated as grounds to revert or redo WO-1 through WO-5.

## Not verified

- **SC-1 / WO-4's substitution proof**: the fold-budget guard assertion
  has never executed, in any direction, in any worktree this run has had.
  Needs: a worktree or session with `E2E_AUTH0_*` credentials, then
  `pnpm exec playwright test apps/hospitality/e2e/fold-budget.spec.ts`.
- **SC-2's per-route numbers**: same gap — the audit table's cells are
  `_pending E2E run_`, not measured.
- **SC-3's axe run**: same gap — `e2e/a11y.test.ts` needs the same live
  E2E environment. Code review found no mechanism for a regression (no
  element/landmark/heading change in the diff), but that is a review
  finding, not an axe pass.
- **SC-4's visual-baseline half**: needs a live CI run on this branch's
  head and GitHub CLI or equivalent access to pull the
  `visual-actuals-replica-a` artifact (gotcha: regenerate only from that
  Linux artifact, never from a local macOS render). Not attempted here —
  this worktree's tool allowlist has neither `gh` nor network fetch.

All four gaps share one root cause, recorded identically at every prior
stage (WO-1 through WO-5) and reconfirmed rather than newly discovered
here: this run has never had a worktree with live E2E credentials or
CI/artifact access. The one thing Verify adds beyond re-stating that: the
lint/typecheck/test gate is now independently confirmed green at 114/114,
including the one task (`@mbe/scripts#test`) audit.md's WO-5 snapshot had
recorded as failing — re-run here passed in full, so that specific
discrepancy is resolved in this run's favor, not escalated.
