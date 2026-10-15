---
stage: implement
run: feature:hospitality-above-fold-usability
date: 2026-10-15
wo: WO-5
---

# Fold-budget audit

Produced by `apps/hospitality/e2e/fold-budget.spec.ts` (#6367 WO-1). Each row
measures `getBoundingClientRect().top` of the page's `data-testid="primary-content"`
landmark. The per-test JSON attachment (`fold-budget-<Page>-<viewport>`) from
the Playwright JSON report fills the table below.

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

## Routes × viewports — measured (BEFORE / AFTER-WO-2 / FINAL)

Measured locally, 2026-10-15, by running `fold-budget.spec.ts` (Chromium,
`mockedPage` fixture, readings taken after `networkidle`) against the
Vite dev server. The suite's Auth0 ROPC login was replaced by a
hand-built `storageState` carrying a fake OIDC user (the app only reads it
from `localStorage`; the API is fully mocked), so no credentials were
needed. Values are `getBoundingClientRect().top` of
`[data-testid="primary-content"]`, in px, and are identical at 1280×720
and 1366×768 (the layout is height-independent), so one column per state
is shown.

- **BEFORE** — tree as of the pre-#6541 layout: `.content` top padding
  `--rialto-space-xl` (32px) restored, `PageHeader` and `TimelinePage` CSS as
  on `main`.
- **AFTER-WO-2** — `main` at `8f0ff88d8`+: `.content` top padding 24px.
- **FINAL** — WO-2 plus WO-3 (below).

| Page             | Route           | BEFORE | AFTER-WO-2 | FINAL | Δ vs BEFORE |
| ---------------- | --------------- | ------ | ---------- | ----- | ----------- |
| HomePage         | `/dashboard`    | 231.0  | 223.0      | 191.0 | -40.0       |
| ReservationsPage | `/reservations` | 227.1  | 219.1      | 187.1 | -40.0       |
| GuestsPage       | `/guests`       | 251.1  | 243.1      | 211.1 | -40.0       |
| TimelinePage     | `/timeline`     | 353.1  | 345.1      | 297.1 | -56.0       |
| FloorPlansPage   | `/floor-plans`  | 275.1  | 267.1      | 235.1 | -40.0       |
| WaitlistPage     | `/waitlist`     | 227.1  | 219.1      | 187.1 | -40.0       |
| ProfilePage      | `/profile`      | 227.1  | 219.1      | 187.1 | -40.0       |
| SettingsPage     | `/settings`     | 251.1  | 243.1      | 211.1 | -40.0       |

WO-2's uniform -8px is confirmed empirically. Measurement note: a reading
taken the moment the landmark first appears was not stable (late status
banners and skeletons above it moved it by up to ~60px between runs), which
is why the spec now waits for `networkidle` before measuring; with that wait
three consecutive runs returned identical values.

## WO-3: per-page header tightening

**Convictions.** PRD-1's SC-1 threshold (content start < 720px) convicts no
page, even BEFORE: the tallest, TimelinePage, started at 353px. But SC-1 only
proves the content is not entirely below the fold — it does not speak to the
issue's complaint (whitespace above useful content), and a 720px guard cannot
fail on any regression short of ~370px of added spend. The audit therefore
looked for _wasted_ spend rather than threshold breaches, using screenshots
of the measured pages at 1280×720.

**Finding.** Every page that uses `PageHeader` stacked three gaps above its
title/content: `.content` padding (24px) **plus** `PageHeader`'s own
`margin-block-start: --rialto-space-lg` (24px) — 48px of empty space between
the breadcrumb bar and the `<h1>` — and `margin-block-end: lg` (24px) below it.
TimelinePage added another 16px (`.headerTop` `margin-block-end: md`) on top
of `PageHeader`'s bottom margin before its date row.

**Changes (token values only, no markup, no copy, heading/landmark semantics
untouched):**

1. `PageHeader.module.css`: removed `margin-block-start`; `margin-block-end`
   `lg` → `md` (-32px on every `PageHeader` page).
2. `TimelinePage.module.css`: removed `.headerTop`'s `margin-block-end`
   (-16px; `PageHeader`'s bottom margin already separates the date row).

Guarded by `PageHeader.test.tsx` › "vertical spend above content (#6367
WO-3)" (reads the CSS source like WO-2's DashboardLayout test): RED against
the pre-change CSS (2 failures), GREEN after.

Not changed: description collapsing, moving secondary controls, or any
`aside` layout — measured spend after the margin fixes is 187-297px, under
half the fold, with the content (stat cards, tables, grid) visibly on screen
in every screenshot; further compaction would be redesign, which the PRD
excludes.

## WO-4: fold-budget guard — red/green proof

`fold-budget.spec.ts` asserts, for the six key pages at 1280×720:

- `contentStartY < 720` (PRD SC-1), and
- `contentStartY < 312` (`CONTENT_START_RATCHET_PX`), a regression ratchet
  sitting ~15px above the tallest measured key page (Timeline, 297px).
  Deliberate addition beyond the PRD: the 720px bound alone is decorative
  (see WO-3), and the breakdown's own proof — substituting
  `--rialto-space-2xl` for the top padding — cannot trip it.

ProfilePage/SettingsPage and the 1366×768 reading stay report-only.

Proof, all run locally:

| State                                                             | Result                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FINAL tree                                                        | 16/16 pass                                                                 |
| RED: `padding-block-start: var(--rialto-space-2xl)` on `.content` | 1 fail — `TimelinePage @ 1280x720`: expected < 312, received 321.14        |
| Restored                                                          | 16/16 pass                                                                 |
| Original BEFORE tree (xl override + old header margins)           | 1 fail — TimelinePage 353.1 ≥ 312 (the ratchet catches the pre-fix layout) |

## Gates and visual baselines

See verification.md for gate output. No visual baselines were regenerated:
`PageHeader` spacing shifts every page's `visual.spec.ts` snapshot
(`e2e/screenshots/*-1280x720.png`), so the advisory `Visual Regression
(hospitality)` job is expected to go red on this PR. Per the repo gotcha,
baselines are regenerated only from the Linux `visual-actuals-replica-a`
artifact (`visual-noise-floor.yml`), never from a macOS render, so that is
the follow-up.

## PRD-1 success criteria — final check

- **SC-1** — **Met.** All six key pages start at 187-297px at 1280×720
  (< 720), asserted by the guard, which was run green and proven red.
- **SC-2** — **Met.** Per-route numbers for BEFORE, AFTER-WO-2 and FINAL at
  both viewports are in the table above.
- **SC-3** — **Not run.** `e2e/a11y.test.ts` needs real Auth0 credentials;
  the diff is two CSS margin changes plus test/doc files, with no element,
  heading or landmark change, so no mechanism for an axe regression is known.
- **SC-4** — **Partial.** Lint/typecheck/unit tests and `fold-budget.spec.ts`
  are green; visual baselines intentionally not regenerated (see above).

## Wiring check (done, not pending)

`apps/hospitality/e2e/workflow-coverage.test.ts` pins that
`e2e.yml`/`e2e-screenshots.yml` invoke the bare `pnpm --dir apps/hospitality
test:e2e` script, which relies on Playwright's `testDir` auto-discovery
(`playwright.config.ts`). `fold-budget.spec.ts` matches no `testIgnore`
pattern (`**/fixtures/*.test.ts`, `**/journeys/**`,
`**/workflow-coverage.test.ts`, `**/visual.spec.ts`), so it is picked up by
that same CI surface with no further wiring — verified by reading the
config, not assumed.
