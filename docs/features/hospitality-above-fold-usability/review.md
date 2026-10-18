---
stage: review
run: feature:hospitality-above-fold-usability
date: 2026-10-18
verdict: pass-with-findings
assumptions:
  - "Severity ranks are this reviewer's draft and no human has confirmed them. The review skill lets the user arbitrate severity, and an autorun has no live user. Both majors are ranked major, not critical: neither breaks a function, loses data or regresses accessibility."
  - "The fix/defer decision for the two majors is left OPEN. The skill gives no default for a major ('fixed or explicitly deferred by the user'), and the brief does not answer it. The decision goes to the Owner and is not guessed here."
  - "The committed hospitality visual baselines (apps/hospitality/e2e/screenshots/*-1280x720.png) are used as rendered evidence of what the page shows at 1280×720. Their provenance comes from commit messages: #6709 took them byte-for-byte from visual-noise-floor run 38753667617's visual-actuals-replica-a artifact, and #7044 took them from apps-visual run 39092483647's Linux *-actual.png files. They are Linux CI renders with mocked data, not production renders."
  - "The review is scaled to a feature run (protocol § Run scale). Verify (2026-10-15) already covered the fold numbers, so this pass re-measured nothing in a browser. It re-ran the unit, type and lint gates and read CI logs instead."
---

# Review: hospitality-above-fold-usability (#6367), as shipped

This review replaces the 2026-10-13 review, which covered only the first
batch's branch diff. This one reviews what is on `main`.

## Scope

**The three merged PRs (squash commits on `main`, read with `git show`):**

| PR    | Commit      | Merged (UTC)     | Product/test change                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #6541 | `5e9fd4333` | 2026-10-15 05:34 | `DashboardLayout.module.css` drops `.content`'s `padding-block-start: var(--rialto-space-xl)`, with a CSS-text unit test (`DashboardLayout.test.tsx`). Adds `e2e/fold-budget.spec.ts` (measures at 1280×720 and 1366×768; `< 720` guard on six key pages). Adds a `data-testid="primary-content"` wrapper or attribute to 8 pages. Whitespace-insensitive diff of the pages: 20 insertions, 5 deletions. The rest of the 202/316-line churn is a prettier re-indent under the new wrapper. |
| #6681 | `f72fb772f` | 2026-10-15 06:01 | `SettingsPage.tsx` moves the landmark from the (usually empty) alert `Stack` to `.layout`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| #6705 | `b652a6723` | 2026-10-15 14:40 | `PageHeader.module.css` drops `margin-block-start: lg` and changes `margin-block-end` from `lg` to `md`. `TimelinePage.module.css` drops `.headerTop`'s `margin-block-end: md`. The fold spec gets `waitForLoadState("networkidle")` and a `< 312px` ratchet. `PageHeader.test.tsx` gets CSS-text tests. Closes #6367.                                                                                                                                                                     |

**Later commits on `main` that touch the same files**
(`git log origin/main --since=2026-10-15 -- <the 14 files>`): #6708, #6706,
#6728, #6727, #6730, #6739 and #6741. All are localization work: translated
strings and formatting in the page TSX files. Only #6741 changes a file this
run's layout depends on. It adds `flex-wrap: wrap` to `TimelinePage.module.css`
`.dateNavLeft`, and that bears on suspicion S-1 below. None of them removes or
moves a `primary-content` landmark (all 8 are still present). None of them
edits `fold-budget.spec.ts`, `DashboardLayout.module.css` or
`PageHeader.module.css`.

**Related, not in the run's diff but read:** #6709 (`99b14fd00`) regenerated
31 of 38 hospitality visual baselines for the PageHeader change from the Linux
`visual-actuals-replica-a` artifact. #7044 (`c4b96e7c2`) refreshed baselines
again for unrelated content changes.

**Predecessor:** `verification.md` (2026-10-15) exists, so the soft gate is
satisfied. Its numbers (FINAL Settings 211.1) were taken after #6681.

## Gates re-run for this review (worktree at `13c3dec85`, cut from `origin/main` `4bc410fb0`)

Run one at a time, after `pnpm build --filter '@mbe/hospitality^...'` (exit 0,
9/9 tasks):

```
pnpm --dir apps/hospitality typecheck   exit 0  (tsc -p tsconfig.test.json && tsc -p tsconfig.e2e.json)
pnpm --dir apps/hospitality lint        exit 0  ✖ 145 problems (0 errors, 145 warnings)
                                                 touched files: one warning, DashboardLayout.test.tsx:83
                                                 (no-array-index-key), pre-existing, outside this run's hunk
pnpm --dir apps/hospitality test        exit 0  Test Files 222 passed (222) / Tests 2983 passed (2983)
```

**CI evidence for the fold guard under real Auth0** (`e2e.yml`, Hospitality E2E):

- PR #6541's run 38686416460 had 2 failures, both in this run's own spec:
  `fold-budget.spec.ts:39:7 › SettingsPage @ 1280x720` and `@ 1366x768`
  (`toBeVisible` on line 44), with 130 passing. The PR merged anyway, because
  E2E is advisory under ADR-016. See finding m-1.
- PRs #6681 and #6705: Hospitality E2E = SUCCESS.
- The latest run, 39136574381 (2026-10-18, head `53b85901`), shows
  `Running 252 tests using 1 worker` … `252 passed (11.1m)` with 0 failed and
  0 flaky. `playwright.config.ts` does not exclude `fold-budget.spec.ts` (its
  `testIgnore` lists fixtures, journeys, workflow-coverage and visual), so the
  16 fold tests are among the 252.
- `CI Gate` = SUCCESS on all three PRs. `main`'s own push runs for `b652a6723`
  and `f72fb772f` were `cancelled`, superseded by concurrency.

## Success criteria (PRD-1) against what shipped

| SC   | Result                     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SC-1 | **Met, with a weak guard** | The guard is green in CI under real Auth0 (run 39136574381). The Linux 1280×720 baselines show data rows above the fold on Reservations (3 rows), Guests (table header plus 1 row), Timeline (full grid) and Floor Plans (card). The guard, however, measures the top of a wrapper that starts with status chrome, not the data (M-2). One more fact: every BEFORE value (227–353px, audit.md) was already under 720, so the 720 bound never caught anything. The 312px ratchet is the only part of the guard that can go red. |
| SC-2 | Met                        | `audit.md` has BEFORE, AFTER-WO-2 and FINAL for all 8 routes × 2 viewports.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SC-3 | **Not demonstrated**       | No element, heading or landmark changed, so there is no known regression mechanism. But the only axe spec, `e2e/a11y.test.ts:5-11`, scans the homepage only, at critical and serious impact. SC-3 asks for "axe clean at all impacts on touched pages" (m-3).                                                                                                                                                                                                                                                                  |
| SC-4 | Met (eventually)           | `CI Gate` is green on all three PRs. Baselines were regenerated from the Linux artifact in #6709, 39 minutes after #6705 merged, never from macOS. The advisory E2E job was red on `main` for 27 minutes after #6541 (m-1).                                                                                                                                                                                                                                                                                                    |

## Findings

### Major: correctness/design — #6705 left every page title flush against the breadcrumb bar (LIVE IN PRODUCTION)

- Where: `apps/hospitality/src/components/PageHeader.module.css:1-5`, together
  with `apps/hospitality/src/components/DashboardLayout.module.css:121` (mobile:
  `:158`).
- Scenario: `.breadcrumbBar` sits inside `<main className={styles.content}>`
  (`DashboardLayout.tsx:370,385`). Its `margin-block-start:
calc(-1 * var(--rialto-space-lg))` cancels `.content`'s top padding, so the bar
  sits at the top of `main` and the routed page (`<Outlet />`, `:409`) follows
  it with no gap. PageHeader's `margin-block-start: lg` was the only space
  between the bar and the page title. #6705 removed it, with the comment "No top
  margin: DashboardLayout's .content padding already spaces the title from the
  breadcrumb bar". That comment is false: the padding is spent above the bar,
  not below it. Result: on the 9 DashboardLayout pages that render `PageHeader`
  with no padding of their own (Home, Reservations, Guests, Waitlist, Profile,
  Settings, Admin, Briefing and Chat), the H1's box starts at the bar's bottom
  border. The
  Linux 1280×720 baseline `e2e/screenshots/reservations-1280x720.png` shows the
  border at y≈108 and the "Reservations" glyph tops at y≈113. The pre-change
  baseline (`99b14fd00^`) shows a ~24px gap. This flattens exactly the
  breathing room PRD-1's non-goal protects ("Do not flatten the design … the
  target is wasted vertical spend above content, not density everywhere").
  Floor Plans, Booking Widget, Setup and Setup Hours (`lg`/`xl` padding on
  their own root) and Timeline (`md`) keep a gap from their own container
  padding.
- Fix (not applied; read-only stage): restore a gap between the bar and the
  page, preferably on the bar (`.breadcrumbBar { margin-block-end: … }`) so the
  layout owns it, and correct the comment. Ratchet interaction: a
  `--rialto-space-md` (16px) gap moves Timeline from 297.1 to about 313, past
  the 312px ratchet (`e2e/fold-budget.spec.ts:25`). Either use
  `--rialto-space-sm` (8px, Timeline ≈305) or re-baseline the ratchet in the
  same PR, from a measurement rather than by hand. Needs a Linux baseline regen.
- Standard: none (`docs/standards.json` is absent).
- Decision: **open, Owner to decide** whether to fix now (route to Implement)
  or defer.

### Major: design — the fold guard measures where a wrapper starts, not where the data starts, so the regression it exists for stays green

- Where: `apps/hospitality/e2e/fold-budget.spec.ts:48` reads the
  `primary-content` landmark. The landmarks are at
  `src/pages/ReservationsPage.tsx:214`, `GuestsPage.tsx:243`, `HomePage.tsx:84`
  and `WaitlistPage.tsx:535`.
- Decayed contract: architecture.md § Mechanism 1 places the landmark on "the
  page's primary region (e.g. the reservations table wrapper)". The idea names
  the problem as "the data they came for — the table, the grid". As shipped,
  the Reservations wrapper opens with the "Updated …" status bar, the four KPI
  stats, the toolbar and the error banner, and only then the table. The Guests
  wrapper opens with the segments grid. The Waitlist wrapper opens with the add
  form. The guard therefore measures the start of the status chrome that the
  idea called the problem.
- Scenario: Guests' `.segmentsGrid` is a 3-column grid
  (`GuestsPage.module.css:21-26`) with one card per segment the API returns.
  The Linux baseline already shows 4 segments wrapping to 2 rows, with the table
  header at y≈545. A venue with 7 or more segments adds a third row (about
  150px), which puts the table rows below 720 and the table header near it. The
  landmark still reads about 211px, so both `< 720` and `< 312` pass. The page
  then shows the exact defect #6367 filed, and the guard is green.
- Fix (not applied): either move the landmark onto the data region (table, grid
  or card list) per architecture.md, re-measure, and set the ratchet from those
  numbers; or record the weaker contract in architecture.md as a deliberate
  deviation.
- Standard: none.
- Decision: **open, Owner to decide.**

### Minor: process — #6541 merged with its own new spec red; `main`'s Hospitality E2E was red for 27 minutes

- Scenario: on #6541, `SettingsPage` was tagged on an alert `Stack` that is
  empty when there is no error. That gave it zero height, so the
  unconditional `toBeVisible()` (now `fold-budget.spec.ts:49`) failed for the
  report-only Settings route at both viewports (run 38686416460, 2 failed /
  130 passed). The batch merged on `CI Gate` alone, which ADR-016 allows
  because E2E is advisory. Two lessons: "report-only" routes are not report-only
  (the visibility assertion gates every route), and a spec a PR adds should be
  green on that PR before the merge.
- Decision: **fixed** by #6681 (`f72fb772f`, 06:01Z), which tags `.layout`. CI
  Hospitality E2E has been green since.

### Minor: residual waste — Floor Plans pads its content twice

- Where: `apps/hospitality/src/pages/FloorPlansPage.module.css:1-3`
  (`.container { padding: var(--rialto-space-lg) }`) sits inside
  DashboardLayout's `.content`, which already pads by `lg`.
- Scenario: at 1280×720, Floor Plans starts its content at 235.1px, against
  187–211 for the other routes (audit.md FINAL). Its title is inset 24px further
  on both axes than every other page (baseline `floor-plans-1280x720.png`:
  title at x≈288 vs 264). This is the same wasted-spend class #6367 targets.
  The architecture's "convicted pages only" rule (≥ 720px) correctly left it
  alone, yet #6705 tightened Timeline, which was not convicted either. The rule
  was applied inconsistently, and that inconsistency is recorded in
  breakdown.md WO-3, not in architecture.md.
- Decision: **deferred**. It is not a regression, and the page is within
  budget. Candidate backlog seed.

### Minor: evidence gap — SC-3 (axe at all impacts on touched pages) has never been run

- Where: `apps/hospitality/e2e/a11y.test.ts:5-11` scans only `""` (home) and
  filters to `critical` and `serious`.
- Scenario: a moderate or minor axe violation on Reservations, Guests,
  Timeline, Floor Plans or Waitlist would pass every gate this run has. Nothing
  in the diff creates one: it changes no element, heading or landmark, only
  CSS and `data-testid`. So this is missing evidence, not a known defect.
- Decision: **deferred**, so Operate can read the ui-quality loop's daily
  judgments (rubric `accessibility/axe-*` at any impact) for the touched pages
  dated after 2026-10-15, per the brief's minimum signal.

### Suspicion S-1 (not a finding): the guard is en-US only; Timeline's date row can now wrap in longer locales

#6741 added `flex-wrap: wrap` to `.dateNavLeft`
(`TimelinePage.module.css:30-34`). In es-MX or fr-CA, a wrapped date row would
add one row above Timeline's landmark, which sits only 15px under the ratchet,
so the fold may differ there. The fold spec runs in the default locale only.
Not demonstrated. To settle it, run `fold-budget.spec.ts` with the locale
stored as `fr-CA` (the `mbe-hospitality-locale` key) and read Timeline's
`contentStartY`.

## Passes with no findings

- **Security:** clean. The diff is CSS, `data-testid` attributes and tests. It
  adds no input, secret, request or error surface.
- **Complexity (lean cut-list):** nothing to cut. No `lean:` markers were
  added. The `toBeLessThan(720)` line is implied by the `< 312` ratchet, but it
  gives the more meaningful failure message, so it is not a cut. The
  `expect(typeof contentStartY).toBe("number")` line is a no-op and too small
  to list.
- **ADR compliance** (via `adr_status.py`: 28 ADRs, all `unrecognized`
  standing, status text `active`). The pass read ADR-001 (Rialto over Tailwind),
  ADR-016 (green-main gating) and ADR-028 (localization):
  - ADR-001: compliant. Only CSS Modules with `var(--rialto-*)` tokens are used.
  - ADR-016: compliant. Hospitality E2E and visual regression are advisory, so
    #6541's merge through a red E2E job breaks no rule, though it is a process
    lesson (m-1).
  - ADR-028: compliant. No UI strings were added.
  - The other 25 ADRs (API, auth, edge, agents, services, RLS, rialto motion
    and catalog) are out of scope because the diff does not reach them.
- **ADR owed?** No. Every decision is reversible, token-scale and unsurprising.
  This matches architecture.md's own call, and the reserved ADR-88..90 are
  correctly unused.
- **Out-of-scope guard (breakdown Notes):** no `packages/rialto` token values
  were touched.
- **Domain passes:** none selected. No changed path matches payments,
  migrations or dependencies.

## Verdict

**Pass with findings: no critical finding.** The change is already live, and
nothing in it breaks a function, a flow or accessibility semantics. Both
majors are reported as decisions for the Owner, because the skill gives no
default for them:

1. **LIVE IN PRODUCTION:** page titles sit flush against the breadcrumb bar on
   9 dashboard pages. This is a visible spacing regression from #6705, and it
   contradicts PRD-1's non-goal. The fix is small, but it collides with the
   312px ratchet.
2. The fold guard measures the start of the chrome, not the data, so it can
   stay green while a table falls below the fold.

Ship may record the release (the brief: "a critical review finding is reported
as a live production defect, not a blocker"; these are majors). The open
decisions should travel in `release.md` and the docs PR body until the Owner
answers them.
