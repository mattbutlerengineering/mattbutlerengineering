---
stage: architect
run: feature:hospitality-above-fold-usability
date: 2026-10-13
ux: skipped — no new screens or flows (prd.md ux-reason)
assumptions:
  - "Primary-content region per page is identified by a data-testid landmark (existing where present, added where absent) rather than heuristics, so the measurement and the guard assert the same node."
---

# Architecture: measure, one shared lever, convicted pages only

Feature scale — a note, not a book. Design follows PRD-1.

## Mechanism

1. **Measurement (audit).** A Playwright spec in
   `apps/hospitality/e2e/` (authed via the existing `authPage` fixture)
   sets viewport 1280×720 and 1366×768, visits each route, and reads
   `getBoundingClientRect().top` of that page's primary-content landmark.
   Output: a table (route × viewport × content-start-Y) written into this
   run directory as `audit.md`. The landmark is a `data-testid` on the
   page's primary region (e.g. the reservations table wrapper); pages
   missing one get it added — markup-only, no layout effect.
2. **Shared lever.** `DashboardLayout.module.css` `.content` drops its
   `padding-block-start: var(--rialto-space-xl)` override so top padding
   equals the sides (`--rialto-space-lg`, 24px): −8px on every page, one
   diff, token-only. The breadcrumb bar's negative top margin
   (`margin-block-start: calc(-1 * var(--rialto-space-lg))`) already
   matches `--rialto-space-lg` and needs no change.
3. **Per-page fixes.** Only for key pages the post-lever audit still
   convicts: merge/tighten that page's header and status rows within its
   own `*.module.css` / `*.tsx` (e.g. ReservationsPage `.statusBar`
   folding into the title row). Data decides the list; the breakdown caps
   it rather than naming pages the audit hasn't convicted yet.
4. **Guard.** The same spec doubles as the gate: for the six key pages,
   assert content-start-Y < 720 at 1280×720. New e2e files must be wired
   by explicit path into the workflow that runs them (gotcha: a spec no
   workflow names silently never runs) — the hospitality e2e suite runs
   via `pnpm test:e2e`; verify the CI workflow lists or globs the suite
   the spec lands in, and add the reference if not.

## Decisions (none clears the ADR bar — all reversible, none surprising)

- Fix lives in `apps/hospitality` only; no rialto token edits (blast
  radius: every consumer app). One line here, no ADR.
- Guard is an e2e assertion, not a unit test: the fold is a rendered-
  layout fact (CSS cascade + real fonts), invisible to jsdom.
- `space-xl → space-lg` by removing an override, not introducing new
  values — stays inside the token scale.
- Reserved ADR ids 88-90 deliberately unused.

## Blast radius / known hazards

- Visual baselines: a vertical-rhythm change can flip ±1px snapshots in
  unrelated sections (gotcha § CI). Expect baseline regen from the Linux
  CI artifact (`visual-actuals-replica-a`), never macOS-local.
- E2E needs `E2E_AUTH*` env and rialto built (`pnpm build --filter
@mattbutlerengineering/rialto`) — existing suite constraints, not new.
- Hospitality E2E is advisory in CI (not in `ci-gate` needs); the guard
  still runs there, and red is treated as red by the queue profile.
