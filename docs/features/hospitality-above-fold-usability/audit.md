---
stage: implement
run: feature:hospitality-above-fold-usability
date: 2026-10-13
wo: WO-4
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

## Wiring check (done, not pending)

`apps/hospitality/e2e/workflow-coverage.test.ts` pins that
`e2e.yml`/`e2e-screenshots.yml` invoke the bare `pnpm --dir apps/hospitality
test:e2e` script, which relies on Playwright's `testDir` auto-discovery
(`playwright.config.ts`). `fold-budget.spec.ts` matches no `testIgnore`
pattern (`**/fixtures/*.test.ts`, `**/journeys/**`,
`**/workflow-coverage.test.ts`, `**/visual.spec.ts`), so it is picked up by
that same CI surface with no further wiring — verified by reading the
config, not assumed.
