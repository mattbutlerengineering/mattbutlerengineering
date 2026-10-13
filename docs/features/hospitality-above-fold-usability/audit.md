---
stage: implement
run: feature:hospitality-above-fold-usability
date: 2026-10-13
wo: WO-2
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

## Wiring check (done, not pending)

`apps/hospitality/e2e/workflow-coverage.test.ts` pins that
`e2e.yml`/`e2e-screenshots.yml` invoke the bare `pnpm --dir apps/hospitality
test:e2e` script, which relies on Playwright's `testDir` auto-discovery
(`playwright.config.ts`). `fold-budget.spec.ts` matches no `testIgnore`
pattern (`**/fixtures/*.test.ts`, `**/journeys/**`,
`**/workflow-coverage.test.ts`, `**/visual.spec.ts`), so it is picked up by
that same CI surface with no further wiring — verified by reading the
config, not assumed.
