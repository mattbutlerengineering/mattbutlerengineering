---
stage: verify
run: feature:hospitality-above-fold-usability
date: 2026-10-15
assumptions:
  - "fold-budget.spec.ts was run locally against the Vite dev server with a hand-built OIDC localStorage session (the app reads the user from localStorage; the API is fully mocked), because the E2E_AUTH0_* credentials are not available. This exercises exactly what CI's mockedPage fixture exercises, minus the real Auth0 login."
---

# Verification: hospitality-above-fold-usability

Supersedes the 2026-10-13 verification, which could not execute Playwright.
Every number below was measured in this pass; see audit.md for the full
BEFORE / AFTER-WO-2 / FINAL table.

## Summary

SC-1 and SC-2 are verified PASS. SC-4 is PASS for lint, typecheck, unit tests
and the fold-budget spec, with visual baselines intentionally left for the
Linux CI artifact. SC-3 (axe) is not run: `e2e/a11y.test.ts` needs real Auth0
credentials.

## Criteria & evidence

### SC-1 — each key page's primary content starts within the fold at 1280×720, asserted by the guard

- Check: `pnpm exec playwright test e2e/fold-budget.spec.ts` (local config
  without the Auth0 setup project).
- Evidence: 16/16 passed. contentStartY at 1280×720 (identical at 1366×768):
  Home 191.0, Reservations 187.1, Guests 211.1, Timeline 297.1, Floor Plans
  235.1, Waitlist 187.1 (key pages); Profile 187.1, Settings 211.1
  (report-only). All < 720 and < the 312 ratchet.
- Result: **PASS**.

### SC-2 — audit artifact with before/after numbers per route at both viewports

- Evidence: audit.md "Routes × viewports" holds BEFORE, AFTER-WO-2 and FINAL
  for all 8 routes at both viewports (values identical across viewports).
  Largest improvement: Timeline 353.1 → 297.1 (-56); every other route -40.
- Result: **PASS**.

### SC-3 — no accessibility regression

- Check: reviewed the diff for element/landmark/heading changes.
- Evidence: CSS-only product changes (`PageHeader.module.css`,
  `TimelinePage.module.css`, earlier `DashboardLayout.module.css`) plus a
  `data-testid` attribute. No element, heading or landmark changed.
- Result: **NOT RUN** (axe needs E2E credentials; no known regression
  mechanism).

### SC-4 — all CI gates green; visual baselines regenerated from the Linux artifact if tripped

- Evidence (apps/hospitality, run one at a time, after
  `pnpm build --filter @mbe/hospitality^...`):
  ```
  pnpm lint        0 errors, 142 warnings (all pre-existing)
  pnpm typecheck   clean (tsconfig.test.json + tsconfig.e2e.json)
  pnpm test        199 files / 2776 tests passed
  ```
  Before the dependency build, two `useSSESync.test.tsx` tests failed on a
  stale `dist/` of a workspace dependency (#6690 changed SSE types); they pass
  once deps are built and are unrelated to this change.
- Visual baselines: not regenerated. `PageHeader` spacing moves every page's
  `visual.spec.ts` snapshot, so the advisory `Visual Regression (hospitality)`
  job is expected red; baselines must come from the `visual-actuals-replica-a`
  artifact, never from macOS.
- Result: **PASS** for the runnable gates; baseline regen is the follow-up.

### Breakdown WO-3 — per-page header tightening

- Evidence: `PageHeader` top margin removed, bottom `lg` → `md`; Timeline
  `.headerTop` bottom margin removed. Unit-tested RED (2 failures) then GREEN
  in `PageHeader.test.tsx`. Screenshots of Timeline and Reservations at
  1280×720 checked by eye: title, stats and grid/table all visible, spacing
  intact.
- Result: **PASS**.

### Breakdown WO-4 — guard red/green proof

- Evidence: with `padding-block-start: var(--rialto-space-2xl)` on `.content`,
  `TimelinePage @ 1280x720` failed (`Expected: < 312`, `Received:
321.140625`); restored, 16/16 pass. The pre-fix BEFORE tree also fails the
  ratchet (Timeline 353.1). The 720px bound alone could not have failed on
  the 2xl substitution, hence the added 312px ratchet.
- Result: **PASS**.

## Failures

None.

## Not verified

- **SC-3's axe run** — needs `E2E_AUTH0_*` credentials (`e2e/a11y.test.ts`).
- **Visual regression** — needs Linux CI actuals (see SC-4).
- **The fold-budget spec under real Auth0** — CI's `e2e.yml` will exercise
  it with real credentials; local runs used a synthetic stored session.
