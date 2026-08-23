---
stage: prd
run: feature:tape-chart-overlaps
date: 2026-08-21
ux: required
assumptions:
  - "The brief names `--rialto-danger` as an existing token; no such token exists. Read as `--rialto-error` / `--rialto-error-muted` (packages/rialto/src/tokens/colors.css:49-51, dark at 95-96), the only error-family tokens rialto defines."
  - "The brief's 'existing virtualizeThreshold behaviour must keep working' is read as the mechanism that actually exists: `.row { content-visibility: auto; contain-intrinsic-size: auto var(--tapechart-row-height) }` in TapeChart.module.css. `virtualizeThreshold` is declared (types.ts:113-114) and read by no file in the component — there is no virtualization to preserve."
  - "Conflict state must also be exposed non-visually (a DOM attribute plus accessible text), consistent with the component's stated accessibility posture on its own page; the brief specifies only a visual affordance."
---

# PRD: Tape chart overlaps — no bar may hide another

## Problem statement

When two reservations on the same room overlap in time, the grid view of
rialto's `TapeChart` paints the later bar exactly over the earlier one. The
earlier bar is gone — not faded, not offset, not badged — and because both are
`<button>`s at identical absolute positions, the hidden one cannot be clicked
or reached by pointer. The chart asserts "this room is fine" while a second
booking sits underneath.

The fix is already half-built. `useTapeChartLayout` runs a lane-packing pass
and writes `bar.lane` (`useTapeChartLayout.ts:18,25`) and a row-wide
`maxLanes`; the DOM never consumes either. `TapeChartRow.tsx:63` drops every
bar into one `.lane` div, `TapeChartBar.tsx:49-52` sets only
`--tapechart-bar-start` / `--tapechart-bar-span`, and `.bar` pins
`inset-block-start` / `inset-block-end` to the full row. The green test at
`TapeChart.test.tsx:90` asserts lanes on the hook, not on screen — it
certifies behaviour no user can observe.

Nobody sees this on the public page because the demo generator
(`makeReservations`, `tapechart-fixtures.ts:107-143`) advances a monotonic
cursor per room and cannot emit an overlap. The visual-test harness, however,
already carries one: `tapeChartStressReservations` puts two bars on
`room-1003` (Jan 15–29 and Jan 19–21), so the committed
`light-tape-chart-stress.png` baseline is a picture of the bug.

## Solution

The grid honours lanes: every overlapping bar on a room gets its own vertical
slot, that room's row grows to fit its own lane count (never the global
`maxLanes`), and every bar stays visible and clickable. A single optional
`classifyOverlap` callback on `TapeChartProps` lets the consumer say whether a
given overlapping pair is a `"conflict"` or `"shared"` occupancy; absent the
prop, every overlap is a conflict. Conflicts get a visibly distinct treatment
built from rialto's existing tokens and `data-*` idioms; shared overlaps
simply stack. The live component page gains a dedicated "Overlaps" section
that demonstrates both states without the visitor having to construct them,
and the fixtures, Storybook, visual-test harness, and unit tests all gain the
overlap cases they are missing today.

Decisions fixed by the brief and not reopened here: per-row lanes (not
global), exactly one optional prop, `"conflict"` as the default, existing
tokens only, no new dependencies.

## Actors

- **Consumer developer** — builds a product on `@mattbutlerengineering/rialto`
  and owns the meaning of an overlap in their domain. Includes the coworker
  whose tables × time context (communal tables, intentional double-seats) is
  the reason `"shared"` exists.
- **Evaluator** — a developer assessing rialto through the public page at
  `mattbutlerengineering.com/rialto/components/tape-chart`; the page is the
  product, since `apps/rialto-web` is the only consumer.
- **Operator** — a front-desk or host-stand user of a product built on the
  chart, who today discovers the hidden booking when the second guest is at
  the counter.
- **Design-system owner** — Matt, owner of `packages/rialto` and acceptance
  judge for the run.

## User stories

1. As an **operator**, I want every reservation on a row to be visible and
   clickable even when it overlaps another, so that the chart never tells me a
   room is free when it is not.
2. As an **operator**, I want a double-booking to look different from two
   bars that merely sit near each other, so that a genuine conflict reads as a
   conflict at a glance.
3. As a **consumer developer**, I want to tell the chart which overlaps are
   legitimate in my domain, so that a communal table or an intentional hold
   does not raise a false alarm.
4. As a **consumer developer**, I want overlap handling to work without any
   new prop, so that a hotel-shaped integration gets the loud default for free.
5. As an **evaluator**, I want the overlap state demonstrated on the component
   page, so that I can judge how the library handles conflicts without
   constructing the case myself.
6. As the **design-system owner**, I want a room with no overlaps to render
   exactly as it does today, so that the change cannot silently reflow every
   chart already shipped.

## Success criteria

Primary: **no bar can hide another, and a genuine conflict reads as a
conflict rather than as ordinary side-by-side stacking.**

Rendering (library, `packages/rialto`):

- [ ] Given two overlapping reservations on one room in grid view, both
      `<button>` bars are in the DOM and each exposes a lane value a test can
      read (a DOM attribute or style variable); the two values differ.
- [ ] In a real browser, clicking the centre of each overlapping bar invokes
      `onReservationClick` with that bar's reservation — neither bar is
      occluded by the other.
- [ ] A room with a 3-deep overlap renders three distinct lanes; its row is
      taller than an un-overlapped row, and every other row's height is
      unchanged (per-row growth, not global).
- [ ] With no `classifyOverlap` prop, every overlapping bar carries a
      conflict marker in the DOM, and non-overlapping bars on the same chart
      do not.
- [ ] With `classifyOverlap` returning `"shared"` for a pair, that pair stacks
      with no conflict marker; with it returning `"conflict"`, the marker is
      present. The callback is invoked only for overlapping pairs.
- [ ] Conflict state is detectable without colour: the bar's accessible name
      or description, and its markup, distinguish it from an ordinary bar.
- [ ] The conflict treatment uses only existing rialto tokens
      (`--rialto-error`, `--rialto-error-muted`, `--rialto-warning`, …),
      existing `data-*` / `color-mix` idioms, and introduces no new token, no
      new colour literal, and no new dependency.
- [ ] A room with no overlaps renders at exactly today's height in both
      `comfortable` (48px) and `compact` (36px) density, and the existing
      `light-tape-chart-default.png` visual baseline passes unmodified.
- [ ] `light-tape-chart-stress.png` changes for exactly one reason —
      `room-1003` now shows both bars — and its new baseline is taken from a
      Linux CI artifact, never a macOS render.
- [ ] A DOM-level test proves lane rendering; the hook-only test at
      `TapeChart.test.tsx:90` is supplemented, not merely kept.
- [ ] Rows keep `content-visibility: auto` behaviour with variable heights,
      or the change states precisely how it degrades.
- [ ] `classifyOverlap` appears in the Props table on the component page (it
      is read from the compiled rialto manifest) with a description.

Demonstration (`apps/rialto-web`):

- [ ] `tapechart-fixtures.ts` emits deterministic overlap cases: at least one
      conflict pair, at least one shared pair, and at least one 3-deep stack;
      `tapechart-fixtures.test.ts` asserts they exist and that output stays
      deterministic.
- [ ] The component page has a dedicated "Overlaps" section showing the
      conflict default and the `"shared"` result side by side, with the
      callback's usage visible in prose or code.
- [ ] A Storybook story exercises overlaps; a visual-test section covers the
      overlap state and is listed by full id in `visual.spec.ts`.

Gates:

- [ ] Existing tests pass; `pnpm lint`, `pnpm typecheck`, `pnpm test` are
      green in `packages/rialto` and `apps/rialto-web`.
- [ ] The design-system owner views the "Overlaps" section on the deployed
      page and records a yes/no verdict that a conflict reads as a conflict.

## Out of scope

- **Time-axis variant** (tables × time). The component is rooms × days
  (`dayWidth`, `daysBetween`, ISO dates, end-exclusive checkout); the
  restaurant case is served only through `"shared"`.
- **Drag-move and `checkConflict` UX.** `onReservationMove`, `checkConflict`,
  and the `moveDialogTitle` / `conflictWarning` strings are declared in
  `types.ts` with no implementation behind them; this run neither implements
  nor touches them.
- **List view and mobile stack.** `TapeChartListView` and
  `TapeChartMobileStack` iterate reservations linearly and never occlude.
- **Detecting conflicts the consumer did not declare.** The component never
  infers `"shared"` from `TapeChartRoom.capacity` (party size, not concurrency)
  or any other field; the distinction is the consumer's knowledge.
- **Publishing.** `@mattbutlerengineering/rialto` stays at 0.2.0; no
  changeset, no `pnpm version-packages`, no npm publish.
- **Implementing `virtualizeThreshold`.** Dead today; stays dead.

## Open questions

- **Where the conflict mark lives** — on each bar in the pair, or on the
  overlapping span only? A 3-deep stack can mix results (a–b conflict, b–c
  shared): per-bar or per-pair marking? — **UX Design**.
- **Error vs warning family** for the conflict treatment, and whether the
  treatment survives `data-status` / `data-blocked` / `data-selected` styling
  on the same bar — **UX Design**.
- **Non-visual conveyance** — a new `TapeChartStrings` key for the conflict
  label (the existing `conflictWarning` belongs to the unbuilt move dialog),
  and whether it joins `reservationAriaTemplate` or a description — **UX
  Design**, then Architect for the string plumbing.
- **Lane geometry in compact density** — 36px rows split two or three ways
  may be unreadable; minimum lane height or a cap? — **UX Design**.
- **Where per-room lane count lives** — `useTapeChartLayout` returns only the
  global `maxLanes` (`types.ts:141-142`); `TapeChartRow`'s custom memo
  equality (`TapeChartRow.tsx:88-100`) needs the new input; `classifyOverlap`
  is pairwise per room — **Architect**.
- **Does `maxLanes` stay on the exported `TapeChartLayout` type** now that
  nothing should use it? — **Architect**.
- **Does `dark-dark-tape-chart.png` use the default fixture** (overlap-free,
  must pass unchanged) or the stress one? — **Verify**.
- **Fixture shape** — extend `makeReservations` (its cursor forbids overlaps
  by construction) or append explicit overlap records after it? — **Architect**.
- **One change or two** — rialto public API plus rialto-web demo in a single
  PR, or split? — **Architect** / **Decompose**.
