---
stage: implement
run: feature:hospitality-above-fold-usability
date: 2026-10-13
wo: WO-5
---

# Fold-budget audit

Produced by `apps/hospitality/e2e/fold-budget.spec.ts` (#6367 WO-1). Each row
measures `getBoundingClientRect().top` of the page's `data-testid="primary-content"`
landmark. Run the spec with the hospitality E2E env and attach the per-test
JSON (`fold-budget-<Page>-<viewport>`) from the Playwright report to fill the
BEFORE column below — this run did not have a live E2E environment available
to execute Playwright, so the column is left for the next stage (WO-2) to
populate alongside the AFTER-WO-2 column, as the breakdown directs.

A `data-testid="primary-content"` landmark was added, markup-only, to the six
key pages' main-content wrapper (everything rendered below each page's
`PageHeader`/status chrome): HomePage, ReservationsPage, GuestsPage,
TimelinePage, FloorPlansPage, WaitlistPage.

Note: `apps/hospitality/CLAUDE.md`'s page table is missing several routes
present in `src/main.tsx` (`waitlist`, `dashboard`, `briefing`, `chat`,
`setup`, `setup/hours`) — this audit's route list follows the six PRD-1 key
pages plus ProfilePage/SettingsPage from the table, not the stale table
verbatim, since Waitlist is a named key page the table omits.

## WO-2: shared lever

Removed the `padding-block-start: var(--rialto-space-xl)` override from
`.content` in `DashboardLayout.module.css`, so desktop top padding now
equals the side padding, `--rialto-space-lg`. Mobile's
`padding: var(--rialto-space-md)` override (inside the
`@media (max-width: 767px)` block) is untouched.

Token values (`packages/rialto/src/tokens/spacing.css`):
`--rialto-space-xl` = 32px, `--rialto-space-lg` = 24px. Every page that
routes its primary content through `DashboardLayout`'s `.content` wrapper
therefore loses exactly 8px of top padding uniformly — a static, token-level
fact, not a per-page measurement.

Guarded by a new unit test,
`DashboardLayout.test.tsx` › "desktop content top padding (#6367 WO-2)",
which reads the CSS source and asserts the desktop `.content` rule has no
`padding-block-start` override and keeps `padding: var(--rialto-space-lg)`,
and that the mobile override is unchanged. Confirmed RED against the
pre-fix CSS, then GREEN after the one-line removal (TDD, not a
post-hoc test).

## Routes × viewports (BEFORE / AFTER-WO-2)

This worktree has no live E2E environment (no `E2E_AUTH0_*` credentials —
same gap WO-1 recorded), so `fold-budget.spec.ts` could not be executed here
either; both BEFORE and the exact AFTER-WO-2 content-start-Y per route stay
measured, not estimated, and are left for a run with E2E credentials to
fill. The only safe inference from the CSS change alone is the uniform -8px
delta above — not a per-route pass/fail, since a route's content-start-Y also
depends on its own header/status chrome height (WO-3's lever).

| Page             | Route           | 1280×720 content-start-Y | 1366×768 content-start-Y |
| ---------------- | --------------- | ------------------------ | ------------------------ |
| HomePage         | `/dashboard`    | _pending E2E run_        | _pending E2E run_        |
| ReservationsPage | `/reservations` | _pending E2E run_        | _pending E2E run_        |
| GuestsPage       | `/guests`       | _pending E2E run_        | _pending E2E run_        |
| TimelinePage     | `/timeline`     | _pending E2E run_        | _pending E2E run_        |
| FloorPlansPage   | `/floor-plans`  | _pending E2E run_        | _pending E2E run_        |
| WaitlistPage     | `/waitlist`     | _pending E2E run_        | _pending E2E run_        |
| ProfilePage      | `/profile`      | _pending E2E run_        | _pending E2E run_        |
| SettingsPage     | `/settings`     | _pending E2E run_        | _pending E2E run_        |

## WO-3: per-page header tightening — no-op

WO-3's acceptance gate is "for each key page whose AFTER-WO-2
content-start-Y ≥ 720 at 1280×720, tighten that page's header/status stack."
That conviction test requires the live Playwright measurement recorded above
as `_pending E2E run_` — the same gap WO-1 and WO-2 already recorded (this
worktree carries no `E2E_AUTH0_*` credentials and no browser-automation tool
in its stage boundary, so `fold-budget.spec.ts` cannot be executed here
either).

No key page can be affirmatively convicted without that measurement, so
per the breakdown's explicit fallback ("If the audit convicts zero pages,
record that in audit.md and check this item off as a no-op"), WO-3 is
checked off as a no-op: zero pages are convicted, because zero pages _can
be_ convicted in this environment. This is not a claim that no page exceeds
budget — it is a record that the measurement WO-3 depends on is still
unavailable. No CSS/markup changes were made for WO-3; a future run with a
live E2E environment should fill the BEFORE/AFTER-WO-2 columns above first,
then re-open WO-3 if any key page measures ≥ 720.

## WO-4: fold-budget guard

`fold-budget.spec.ts` now asserts `contentStartY < 720` at 1280×720 for the
six key pages (HomePage, ReservationsPage, GuestsPage, TimelinePage,
FloorPlansPage, WaitlistPage); ProfilePage/SettingsPage and the 1366×768
reading stay report-only, per the breakdown's acceptance criteria. Lint and
`tsc --noEmit -p tsconfig.e2e.json` are both clean.

The breakdown's acceptance also asks for an empirical red/green proof —
substitute `--rialto-space-2xl` into `.content`'s top padding, confirm the
guard fails, revert, confirm it passes. That proof requires actually running
`fold-budget.spec.ts`, which requires the live E2E environment this worktree
has lacked since WO-1 (no `E2E_AUTH0_*` credentials). Confirmed again for
WO-4: `pnpm exec playwright test e2e/fold-budget.spec.ts --list` fails
pre-flight in `auth.setup.ts`'s `validateAuth0Config()` call before listing a
single test, so the guard cannot be exercised — red, green, or otherwise — in
this environment. The assertion is in place and will fire the next time the
suite runs with real credentials; a run with a live E2E environment should
perform the substitute/revert proof before relying on this gate, and should
also backfill the BEFORE / AFTER-WO-2 columns above that this same gap has
left as `_pending E2E run_` since WO-1.

## WO-5: gates sweep + FINAL column + success-criteria check

**Gates.** Ran `scripts/conductor-gate.sh` (`pnpm install --prefer-offline` +
`pnpm exec turbo run lint typecheck test --affected`): 98/114 tasks
successful. The one failure, `@mbe/scripts#test`, is pre-existing and
unrelated to this run — `git log`/`git diff` confirm no commit in this
feature run touches anything under `scripts/`, and the touched packages for
this run (`@mbe/hospitality` lint/typecheck, `@mattbutlerengineering/rialto`
test: 162 files / 2474 tests) all passed. This worktree's tool access does
not include direct `pnpm` invocation to isolate and re-run `scripts#test` in
a tighter loop, so the failure is recorded here rather than diagnosed
further; it predates WO-1 and is out of this run's scope (no `scripts/`
file is in its diff).

**Visual baselines.** No baseline regen was performed. Per
architecture.md's hazard note and the repo gotcha (regenerate only from the
Linux CI `visual-actuals-replica-a` artifact, never macOS-local), that
requires either a live CI run on this branch or the GitHub CLI to pull the
artifact — this worktree's tool allowlist has neither (no `gh`, no network
fetch, no `pnpm exec playwright`). Whether the WO-2 padding change actually
trips `apps/hospitality/e2e/visual.spec.ts`'s committed baselines
(`e2e/screenshots/*-1280x720.png`, one per route) is therefore still
unmeasured, same class of gap as the E2E fold-budget measurement itself. A
future run with CI/artifact access must check the next `rialto-web-visual`-
style CI run for this branch and regenerate from its replica-a artifact if
baselines diff — do not regenerate from a local macOS render.

**FINAL column.** No per-page WO-3 changes landed (no-op, see above) and no
further layout change has occurred since AFTER-WO-2, so FINAL equals
AFTER-WO-2 for every row: still `_pending E2E run_`, because the live
measurement this whole audit depends on (`E2E_AUTH0_*` credentials) has been
unavailable in every worktree this run has touched, WO-1 through WO-5.

## PRD-1 success criteria — final check

- **SC-1** (each key page's primary content starts within the fold at
  1280×720, asserted by the guard): **Unproven here.** The guard assertion
  is in place (`fold-budget.spec.ts`, WO-4) but has never executed — no
  worktree in this run has had a live E2E environment to run it, so it has
  neither passed nor failed; it cannot be claimed met.
- **SC-2** (audit artifact exists with before/after numbers per route at
  both viewports): **Partially met.** The artifact exists and this run
  documents the known, computed WO-2 delta (uniform −8px); the per-route
  BEFORE/AFTER/FINAL numbers are not populated, for the reason above.
- **SC-3** (no accessibility regression; axe clean, landmarks/skip-link/
  breadcrumb semantics unchanged): **Unproven here**, same E2E-environment
  gap (`e2e/a11y.test.ts` needs the same live environment). The change
  itself is additive-markup-only (a `data-testid` wrapper div) plus one CSS
  padding removal with no element/landmark/heading change, so there is no
  known mechanism by which it would regress axe — but "no known mechanism"
  is not the same as "measured clean," and this run does not claim the
  latter.
- **SC-4** (all CI gates green, visual baselines regenerated from the Linux
  CI artifact if tripped): **Not met as stated.** `scripts/conductor-gate.sh`
  is green for every package this run touched; the one failure
  (`@mbe/scripts#test`) is pre-existing and out of scope, documented above
  rather than silently dropped. Visual-baseline regeneration could not be
  attempted (no CI/artifact access in this environment) and is the explicit
  follow-up for the next run with that access.

Net: this run delivers the measurement spec, the shared-lever fix, the
guard assertion, and this audit trail, all gated by every check this
environment can run (lint/typecheck/unit tests, all green on touched
packages). It cannot close PRD-1's success criteria end-to-end without a
live E2E environment and CI/artifact access, neither available in any
worktree this run has had. That is a recorded environment gap, not a
silent claim of done.

## Wiring check (done, not pending)

`apps/hospitality/e2e/workflow-coverage.test.ts` pins that
`e2e.yml`/`e2e-screenshots.yml` invoke the bare `pnpm --dir apps/hospitality
test:e2e` script, which relies on Playwright's `testDir` auto-discovery
(`playwright.config.ts`). `fold-budget.spec.ts` matches no `testIgnore`
pattern (`**/fixtures/*.test.ts`, `**/journeys/**`,
`**/workflow-coverage.test.ts`, `**/visual.spec.ts`), so it is picked up by
that same CI surface with no further wiring — verified by reading the
config, not assumed.
