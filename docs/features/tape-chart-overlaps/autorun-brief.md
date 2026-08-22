# Autorun brief — feature:tape-chart-overlaps

Not an artifact. Never counts toward orientation. Collected 2026-08-21 from
Matt Butler in one interview; `idea.md` already existed and is the source
for every Idea-stage input (problem, who, why now, evidence, unknowns).

## What and why

Rialto's `TapeChart` grid renders overlapping reservations on one row
directly on top of each other — the later bar hides the earlier one
entirely (invisible and unclickable). `useTapeChartLayout` already
computes `bar.lane` / `maxLanes`; no renderer consumes them. The live
demo cannot generate overlaps (fixture cursor is monotonic), so the public
component page proves nothing. Full problem statement: `idea.md`.

## Run

- Scale: **feature**. Slug: `tape-chart-overlaps`.
  Run dir: `docs/features/tape-chart-overlaps/`.
- Live page: https://mattbutlerengineering.com/rialto/components/tape-chart
- Surfaces touched: `packages/rialto/src/components/TapeChart/**`
  (library), `apps/rialto-web/src/data/tapechart-fixtures.ts`,
  `apps/rialto-web/src/pages/data/TapeChartPage.tsx`,
  `apps/rialto-web/src/pages/visual-test/TapeChartSections.tsx`,
  `packages/rialto/src/components/TapeChart/TapeChart.stories.tsx`.

## Decisions already made (do not re-litigate)

1. **Solution shape — per-row lanes + one optional callback.**
   - Honor `bar.lane` as a vertical offset so every bar is visible and
     clickable.
   - Row height is **per-row** (driven by that room's own lane count),
     NOT the global `maxLanes`. One 4-way overlap must not quadruple all
     rows.
   - Add exactly one optional prop on `TapeChartProps`, shape along the
     lines of `classifyOverlap?: (a: TapeChartReservation, b: TapeChartReservation) => "conflict" | "shared"`.
     Default when absent: `"conflict"` (hotel-loud: an overlap is a
     double-booking unless the consumer says otherwise).
   - `"conflict"` overlaps get a visually distinct treatment; `"shared"`
     overlaps simply stack with no alarm.
   - The distinction is the consumer's knowledge, not the component's.
     The restaurant/communal-table case is served by the consumer
     returning `"shared"`.
2. **Visual constraints — rialto tokens only, no new colors.** Conflict
   treatment uses existing tokens (`--rialto-danger`, `--rialto-warning`,
   etc.) and existing idioms (`data-*` attributes, `color-mix`). No new
   design tokens. No new dependencies.
3. **Scope.**
   - IN: rialto grid renders lanes + conflict state; fixtures gain
     deterministic overlap cases (at least one conflict pair, at least
     one shared pair, at least one 3-deep stack); a dedicated "Overlaps"
     section on the component page demonstrating both states; a
     Storybook story; a visual-test section; a DOM-level test that proves
     lane rendering (the existing hook-only test at
     `TapeChart.test.tsx:90` is insufficient and must be supplemented, not
     merely kept).
   - OUT: time-axis (tables × time) variant; changes to drag-move /
     `checkConflict` UX; list view and mobile stack (already correct —
     they iterate linearly, no occlusion).
4. **Rendering model constraints (from repo rules):** rialto components
   must not call `setState` inside a `useEffect` body — derive at render
   time. Immutable data patterns. Existing `virtualizeThreshold` /
   `contain-intrinsic-size` behaviour must keep working with variable row
   heights, or the change must explain how it degrades.

## Success criteria

Primary (from idea.md): **No bar can hide another, and a genuine conflict
reads as a conflict rather than as ordinary side-by-side stacking.**

Concretely:

- Given two overlapping reservations on one room, both `<button>`s are in
  the DOM, both visible, both clickable, neither occluded.
- With no `classifyOverlap` prop, overlapping bars carry a conflict
  affordance distinguishable from non-overlapping bars.
- With `classifyOverlap` returning `"shared"`, the same bars stack without
  the conflict affordance.
- A room with no overlaps renders at the same height it does today.
- The live component page shows the overlap state in a dedicated section
  without the visitor having to construct it.
- Existing tests pass; `pnpm lint`, `pnpm typecheck`, `pnpm test` green in
  `packages/rialto` and `apps/rialto-web`.

## UX

User-facing surface: **yes** → PRD records `ux: required`.

## Tracker

No existing GitHub issues match (searched 2026-08-21: "tape chart",
"tapechart", "overlap" — zero open hits). **No tracker interaction** for
this run — no seeding, no mirroring.

## Release authorization

- Mechanism: feature branch → PR to `main` → `CI Gate` green → auto-merge
  (`gh pr merge <N> --auto --squash --delete-branch`). Merge to `main`
  auto-deploys the rialto-web showcase via `deploy-static.yml`.
- **Authorized:** open the PR, and enable auto-merge once CI Gate is green
  and the review stage has no unfixed critical findings.
- **NOT authorized:** changeset, `pnpm version-packages`, npm publish of
  `@mattbutlerengineering/rialto` (stays 0.2.0). Do not touch
  `.changeset/`. Publishing is a separate human decision.
- Never merge past unfixed critical review findings — stop and surface.

## Repo gotchas the stages must honour

- Run `pnpm` from inside the package dir, not the monorepo root.
- Vitest does NOT typecheck — run `pnpm typecheck` explicitly.
- Visual baselines are Linux-CI-specific; never commit macOS-rendered
  PNGs. If the visual-test change needs new baselines, pull them from the
  CI artifact or leave the section without a committed baseline and say so.
- PostToolUse prettier hook reformats; stage by explicit path, never
  `git add -A`.
- llms.txt regen: `pnpm build --filter @mbe/cli...` then `pnpm regen`
  before push if rialto public API changed.
- `gh pr edit` is broken on this repo — use
  `gh api -X PATCH repos/{owner}/{repo}/pulls/<N> -F body=@file`.
