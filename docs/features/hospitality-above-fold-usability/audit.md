---
stage: implement
run: feature:hospitality-above-fold-usability
date: 2026-10-13
wo: WO-1
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

## Routes × viewports (BEFORE)

| Page             | Route           | 1280×720 content-start-Y | 1366×768 content-start-Y |
| ---------------- | --------------- | ------------------------ | ------------------------ |
| HomePage         | `/dashboard`    | _pending run_            | _pending run_            |
| ReservationsPage | `/reservations` | _pending run_            | _pending run_            |
| GuestsPage       | `/guests`       | _pending run_            | _pending run_            |
| TimelinePage     | `/timeline`     | _pending run_            | _pending run_            |
| FloorPlansPage   | `/floor-plans`  | _pending run_            | _pending run_            |
| WaitlistPage     | `/waitlist`     | _pending run_            | _pending run_            |
| ProfilePage      | `/profile`      | _pending run_            | _pending run_            |
| SettingsPage     | `/settings`     | _pending run_            | _pending run_            |

## Wiring check (done, not pending)

`apps/hospitality/e2e/workflow-coverage.test.ts` pins that
`e2e.yml`/`e2e-screenshots.yml` invoke the bare `pnpm --dir apps/hospitality
test:e2e` script, which relies on Playwright's `testDir` auto-discovery
(`playwright.config.ts`). `fold-budget.spec.ts` matches no `testIgnore`
pattern (`**/fixtures/*.test.ts`, `**/journeys/**`,
`**/workflow-coverage.test.ts`, `**/visual.spec.ts`), so it is picked up by
that same CI surface with no further wiring — verified by reading the
config, not assumed.
