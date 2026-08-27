---
stage: architect
run: feature:tape-chart-overlaps
date: 2026-08-21
ux: required — ux.md
assumptions:
  - "Overlap classification lives in `useTapeChartLayout` (the hook), not in `TapeChartRow` or `TapeChartBar`: the hook already owns lane packing per room, has the clipped spans the overlap predicate needs, and is the one memo seam — row and bar stay humble adapters that render data attributes and CSS variables."
  - "`assignLanes` is rewritten as a pure `packRoom(bars, classify)` that returns new bar objects (sorted copy, `lane` and `overlap` filled) instead of sorting and assigning in place. The mutation today never leaks (the arrays are created inside the memo), but the repo's immutability rule is unconditional and the overlap pass needs to produce a new field per bar anyway, so one pure function is cheaper than a mutating one plus a second pass."
  - "`maxLanes` stays on the exported `TapeChartLayout` type with its JSDoc corrected (it no longer drives row height). Removing a field from an exported type is a semver-visible change the run is not authorised to publish, and keeping it costs one line; the PRD's open question is answered 'keep, re-document'."
  - "Per-room lane count is returned by the hook as `laneCountByRoom: Map<string, number>` and reaches `TapeChartRow` as a new `laneCount` prop (added to the memo comparator). Deriving it in the row from `bars` (`max(lane) + 1`) was the alternative; it lost because `assignLanes` already computes the number and the hook unit test and the DOM test should assert the same value from one owner."
  - "`classifyOverlap` is a plain `useMemo` dependency of the layout. A consumer passing an inline arrow re-runs the layout and re-renders every row each parent render — the same contract `reservations`/`rooms` already have. No ref-latest trick: it would make the layout stale when the rule changes without the data changing and trips `react-hooks/refs`. The prop's JSDoc tells consumers to keep the reference stable."
  - "One derived CSS custom property, `--tapechart-lane-pitch`, is declared on `.root` (`calc(var(--tapechart-row-height) - var(--tapechart-bar-inset))`) so the lane formula is written once. ux.md's 'no new root variables' is read as 'no new consumer-facing inputs'; the pitch is an internal derivation that resolves correctly under the `[data-density=compact]` override because it is declared on the same element."
  - "`.row`'s `contain-intrinsic-size` is updated to the lane formula (ux.md's preferred option) rather than left at `auto var(--tapechart-row-height)`; the custom property is set inline on the row itself, so `contain: style` does not hide it."
  - 'The blocked+conflict composition hoists the hatch gradient into `--tapechart-blocked-fill` on `.bar[data-blocked="true"]` and re-applies it in one compound rule, rather than duplicating the five-line gradient.'
  - "The real-browser occlusion proof (PRD rendering criterion 2) is a Playwright test in `apps/rialto-web/e2e/interaction.spec.ts` (already in the workflow's explicit spec list) against the component page's Overlaps section. The two Overlaps charts and the playground chart share the aria label 'Reservations tape chart', so each Overlaps chart wrapper carries a `data-testid` to scope locators and avoid strict-mode collisions."
  - "One PR, not two: `apps/rialto-web` consumes rialto via `workspace:*`, so the page section cannot typecheck until the prop exists and the prop is unobservable until the page shows it. Decompose orders the work inside one branch."
  - "The two Storybook stories carry an inline copy of the overlap fixture; `packages/rialto` cannot import from `apps/rialto-web` (dependency direction), matching how the existing stories already inline their data."
  - "The visual-test harness section imports `makeOverlapScenario` from `src/data/tapechart-fixtures` instead of adding a third copy to `visual-test/fixtures.ts`; both files live in the same app, and the scenario is already date-pinned and deterministic."
  - "The fixture export is `makeOverlapScenario()` (following `makeRooms` / `makeReservations`), pinned to 2026-03-02 (a Monday) through 2026-03-09; the demo classifier is exported alongside it as `classifyDormAsShared(rooms)` so the page, the harness and the fixture test share one rule."
  - "The first push is expected to turn the `Visual Regression (rialto-web)` job red (new `light-tape-chart-overlaps.png` has no baseline; `light-tape-chart-stress.png` changes). Both baselines are then copied from the `rialto-web-visual-diffs` CI artifact, never rendered on macOS."
---

# Architecture: Tape chart overlaps — lanes rendered, conflicts classified

## Approach

Finish the half-built pipeline at its existing seam. `useTapeChartLayout`
already turns reservations into per-room positioned bars with a `lane`; today
that number dies at the DOM. The change (1) makes the hook's per-room pass pure
and extends it with one more fact per bar — its overlap kind, derived from an
optional consumer callback — and one more fact per room — its own lane count;
(2) makes `TapeChartRow` and `TapeChartBar` render those facts as CSS custom
properties and `data-*` attributes; and (3) lets the CSS module turn the
variables into geometry and the error-family treatment. Nothing in the render
tree computes anything: the hook is policy, the row and bar are adapters, the
stylesheet is detail. Everything user-visible in `ux.md` § "Geometry and
contract" maps to exactly one of those three places.

Two shapes were compared. The alternative — leave the hook alone and compute
overlap kind and lane count inside `TapeChartRow` with a `useMemo` over `bars`
and `classifyOverlap` — keeps the hook untouched but splits the "what overlaps
what" rule across two files, makes the per-row memo comparator carry the
callback, and leaves the hook-only test at `TapeChart.test.tsx:90` certifying a
pipeline that is still only half-connected. It lost on locality: one owner for
lane, lane count and overlap kind is the whole point.

## Components

### `useTapeChartLayout` (policy — `useTapeChartLayout.ts`)

- Responsibility: turn `(reservations, rooms, startDate, endDate,
classifyOverlap?)` into an immutable `TapeChartLayout`: clipped, lane-packed
  bars per room, each bar's overlap kind, each room's lane count, day count,
  daily counts.
- Collaborators: `dateMath` (unchanged). Called only by `TapeChart.tsx`.
- Internals: `assignLanes(bars): number` (mutating, sorts in place,
  `useTapeChartLayout.ts:11-30`) becomes `packRoom(bars, classify): { bars, laneCount }`, pure:
  1. `sorted = bars.slice().sort(byStartThenSpan)` — same comparator as today, so
     lane order and DOM order are unchanged (ux.md relies on this).
  2. Lane assignment exactly as today, but writing into a parallel `lanes[]`
     array rather than `bar.lane`.
  3. Overlap pass: for `i < j` over `sorted`, with `a = sorted[i]`, `b = sorted[j]`:
     because the list is sorted by `startOffset`, `b.startOffset >= a.startOffset`,
     so "in-view spans intersect" reduces to `b.startOffset < a.startOffset + a.span`;
     once it fails for one `j` it fails for every later `j`, so the inner loop
     breaks there. For each intersecting pair, call `classify(a.reservation, b.reservation)`
     once (earlier start first; on equal starts the sort order — shorter span
     first — decides, deterministically). Fold into `kinds[i]`, `kinds[j]` with
     worst-wins: `conflict` > `shared` > undefined.
  4. Return `{ bars: sorted.map((bar, i) => ({ ...bar, lane: lanes[i], overlap: kinds[i] })), laneCount: laneEnds.length }`.
     The memo then builds `barsByRoom` and `laneCountByRoom` from the per-room
     results and computes `maxLanes` as before. The consumer's `reservations`
     objects are never touched (they are referenced from `bar.reservation`, not
     copied or mutated — same as today).
- Default classifier: a module-level `const CONFLICT_ALWAYS = () => "conflict" as const`
  used when the prop is `undefined`, so the memo dependency is a stable value
  in the default case.

### `TapeChart` (root adapter — `TapeChart.tsx`)

- Responsibility: destructure the new `classifyOverlap` prop and pass it to the
  hook. Nothing else changes; `virtualizeThreshold` stays unread.
- Collaborators: `useTapeChartLayout`, `TapeChartGrid`, `mergeStrings`.

### `TapeChartGrid` (adapter — `TapeChartGrid.tsx`)

- Responsibility: per room, read `layout.barsByRoom.get(id) ?? []` (as today)
  and `layout.laneCountByRoom.get(id) ?? 1`, and pass `laneCount` to the row.
- Collaborators: `TapeChartRow`.

### `TapeChartRow` (adapter — `TapeChartRow.tsx`)

- Responsibility: render the room's lane count as `--tapechart-lane-count`
  (inline style next to `--tapechart-day-count`, line 44) and `data-lane-count`
  on the `role="row"` div. New prop `laneCount: number`, and one new line in the
  custom memo comparator (`TapeChartRow.tsx:88-100`): `prev.laneCount === next.laneCount`.
  Per-bar overlap state needs no comparator entry: the hook returns new bar
  objects every run, so `prev.bars === next.bars` already covers it.
- Collaborators: `TapeChartBar`.

### `TapeChartBar` (adapter — `TapeChartBar.tsx`)

- Responsibility: render the bar's lane and overlap kind. Style gains
  `--tapechart-bar-lane: bar.lane` (next to `--tapechart-bar-start` /
  `--tapechart-bar-span`, lines 49-52); the `<button>` gains
  `data-lane={bar.lane}` and `data-overlap={bar.overlap}` (React omits the
  attribute when `undefined`, matching "absent on a bar that overlaps
  nothing"). When `bar.overlap === "conflict"`, a 12×12 inline SVG warning glyph
  (`aria-hidden`, `stroke="currentColor"`, `className={styles.overlapGlyph}`)
  is the first flex child before `.barTitle`, hand-rolled the way
  `Banner.tsx:30-45` does its variant icons — no lucide import.
  `buildFormattedParts` adds `overlapLabel: bar.overlap ? strings.overlapLabels[bar.overlap] : undefined`.
- Collaborators: `defaultStrings` (`ResolvedStrings.overlapLabels`).

### Strings (`defaultStrings.ts`)

- Responsibility: own the default overlap labels and their place in the
  accessible name. `DEFAULT_STRINGS.overlapLabels = { conflict: "Double-booked", shared: "Shared occupancy" }`;
  `ResolvedStrings` adds `overlapLabels: Record<TapeChartOverlapKind, string>` to
  its `Omit` list and intersection exactly as `statusLabels` is handled;
  `mergeStrings` deep-merges it on the line after `statusLabels` (line 96);
  `defaultReservationAriaTemplate` pushes `fmt.overlapLabel` immediately after
  `fmt.statusLabel` (between lines 41 and 42), guarded by `if (fmt.overlapLabel)`.
  `conflictWarning` (line 83) is untouched.

### Stylesheet (`TapeChart.module.css`) — detail

See "CSS plan" below; it is the only place geometry and colour live.

### Demo surfaces (`apps/rialto-web`, Storybook) — out-of-library

- `src/data/tapechart-fixtures.ts`: `makeOverlapScenario()` and
  `classifyDormAsShared(rooms)`.
- `src/pages/data/TapeChartPage.tsx`: the "Overlaps" section (ux.md § Demo
  surfaces), second section on the page.
- `src/pages/visual-test/TapeChartSections.tsx`: `tape-chart-overlaps` section.
- `e2e/visual.spec.ts`: id appended after `"tape-chart-stress"`.
- `e2e/interaction.spec.ts`: the occlusion test.
- `packages/rialto/src/components/TapeChart/TapeChart.stories.tsx`: `Overlaps`,
  `OverlapsClassified`.

Every PRD requirement traces to one of these: rendering criteria 1-3, 8-10 →
hook + row + bar + CSS; 4-6 → hook + bar + strings; 7 → CSS; 11 → tests; 12 →
the prop's JSDoc via the manifest; demonstration criteria → demo surfaces.

## Data model

Access patterns that decide the shape: the grid reads "bars for room X" and
"lane count for room X" once per row per layout; the stat pills count bars
across all rooms (`TapeChartStatPills.tsx:24`); tests read "bars for room X" by
id. A `Map<string, …>` keyed by room id serves all three, which is why
`laneCountByRoom` is a second map next to `barsByRoom` rather than a change to
`barsByRoom`'s value shape (which would touch the stat pills and every existing
hook test for no access-pattern gain). Consistency is trivial: the whole layout
is recomputed in one `useMemo` and is immutable thereafter.

`types.ts` changes, in file order:

```ts
export type TapeChartOverlapKind = "conflict" | "shared";

export interface TapeChartFormattedParts {
  // …existing fields unchanged…
  /** Label for the bar's overlap kind; undefined when the bar overlaps nothing. */
  overlapLabel?: string;
}

export interface TapeChartStrings {
  // …existing keys unchanged…
  /** Spoken after the status in the default aria template. */
  overlapLabels?: Partial<Record<TapeChartOverlapKind, string>>;
}

export interface TapeChartProps {
  // …existing props unchanged…
  /**
   * Decide whether two reservations whose visible spans overlap in one room are
   * a `"conflict"` (double-booking, drawn in the error family) or `"shared"`
   * (legitimate co-occupancy, stacked without alarm). Called once per
   * overlapping pair, earlier start first. Default: every overlap is a
   * `"conflict"`. Keep the reference stable (module scope or `useCallback`) —
   * a new function each render recomputes the layout and re-renders every row.
   */
  classifyOverlap?: (a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind;
}

export interface TapeChartPositionedBar {
  // …existing fields unchanged…
  /** Worst overlap kind across every pair this bar belongs to; absent when it overlaps nothing. */
  overlap?: TapeChartOverlapKind;
}

export interface TapeChartLayout {
  barsByRoom: Map<string, TapeChartPositionedBar[]>;
  dayCount: number;
  /** Lanes in each room (≥ 1); drives that row's height. */
  laneCountByRoom: Map<string, number>;
  /** Highest lane count across all rooms. Informational — row height is per room. */
  maxLanes: number;
  dailyCounts: Array<{ … }>;   // unchanged
}
```

`index.ts` adds `TapeChartOverlapKind` to the exported types. The JSDoc on
`classifyOverlap` is what the Props table shows: `component-metadata.ts:531-568`
resolves `TapeChartProps` through the type checker from the barrel, so a prop
declared in `types.ts` is picked up, and `getJsDocComment` (line 567) becomes
`description`. The `dist/manifest.json` entry for TapeChart already lists
function-typed props (`onReservationClick`, `checkConflict`), so a callback prop
survives projection.

## Interfaces & contracts

### `classifyOverlap` (consumer → library)

- Input: two `TapeChartReservation`s from the consumer's own `reservations`
  array (same object identity — no copies), in one room, whose clipped in-view
  spans intersect; `a` starts no later than `b`. Never a cancelled or no-show
  reservation; never a pair outside the visible window; never the same pair
  twice per layout.
- Output: `"conflict" | "shared"`. The library folds per bar with worst-wins.
- Failure modes: a throw propagates out of the `useMemo` and crashes the
  render — the callback is synchronous consumer code, like `reservationAriaTemplate`,
  and is not caught. A non-stable reference is not an error but recomputes the
  layout every render (documented on the prop). Anything other than the two
  literals is a TypeScript error; at runtime an unknown string is treated as
  `"shared"` by the worst-wins fold only if it is not `"conflict"` — the fold
  compares against `"conflict"` exactly, so garbage degrades to "no alarm", the
  quiet direction.

### `useTapeChartLayout(reservations, rooms, startDate, endDate, classifyOverlap?)` (internal)

- Input: as today plus the optional classifier; `undefined` selects
  `CONFLICT_ALWAYS`.
- Output: `TapeChartLayout` above. Every bar object and both maps are fresh per
  memo run; inputs are never mutated (a test asserts `toEqual` on the input
  before and after).
- Failure modes: none new; an empty room yields `[]` and lane count `1`.

### Row and bar DOM contract (library → tests, consumers, CSS)

| Element        | Attribute / variable                        | Value                                                       |
| -------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `role="row"`   | `--tapechart-lane-count`, `data-lane-count` | room's lane count, `≥ 1`                                    |
| bar `<button>` | `--tapechart-bar-lane`, `data-lane`         | `bar.lane`, 0-indexed                                       |
| bar `<button>` | `data-overlap`                              | `"conflict"` \| `"shared"` \| absent                        |
| bar `<button>` | `aria-label`                                | default template appends the overlap label after the status |

Unchanged: `data-status`, `data-blocked`, `data-selected`, `aria-pressed`,
`tabIndex`, roving focus.

### Strings contract

`strings.overlapLabels` is deep-merged like `statusLabels`; a custom
`reservationAriaTemplate` receives `fmt.overlapLabel` and may ignore it.

## CSS plan (`TapeChart.module.css`)

```css
.root {
  /* existing vars unchanged */
  /* derived, never set by consumers; resolves under [data-density=compact] because it is declared here */
  --tapechart-lane-pitch: calc(var(--tapechart-row-height) - var(--tapechart-bar-inset));
}

.row {
  /* …existing… */
  contain-intrinsic-size: auto
    calc(var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset));
}

.lane {
  min-block-size: calc(
    var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset)
  );
  /* background unchanged */
}

.bar {
  inset-block-start: calc(
    var(--tapechart-bar-inset) + var(--tapechart-bar-lane, 0) * var(--tapechart-lane-pitch)
  );
  block-size: calc(var(--tapechart-row-height) - 2 * var(--tapechart-bar-inset));
  /* inset-block-end removed — a bar must not stretch to a taller row */
}
```

Arithmetic check (comfortable 48/3, compact 36/2): one lane → `1×45+3 = 48` /
`1×34+2 = 36`, lane-0 bar at `3px`/`2px` with height `42`/`32` — pixel-identical
to today, which is what keeps `light-tape-chart-default.png` and
`dark-dark-tape-chart.png` unchanged. Two lanes → `93`/`70`; three → `138`/`104`.
`.roomHeader` keeps `min-block-size: var(--tapechart-row-height)` and stretches
as a grid sibling; `.todayLine`'s `inset-block: 0` spans the taller lane.

Conflict treatment, placed after `.bar[data-selected="true"]` (line 322-325) so
equal-specificity order gives conflict the border colour while selection keeps
`box-shadow`:

```css
.bar[data-blocked="true"] {
  --tapechart-blocked-fill: repeating-linear-gradient(/* existing gradient, unchanged */);
  background: var(--tapechart-blocked-fill);
  /* rest unchanged */
}
.bar[data-overlap="conflict"] {
  background: color-mix(in srgb, var(--rialto-error) 10%, var(--rialto-surface-elevated));
  border-color: var(--rialto-error);
  border-inline-start-width: 3px;
}
.bar[data-blocked="true"][data-overlap="conflict"] {
  background: var(--tapechart-blocked-fill); /* hatch is the bar's identity; chrome stays red */
}
.overlapGlyph {
  color: var(--rialto-error);
  flex-shrink: 0;
}
```

`reset.css:4` sets `box-sizing: border-box`, so the 3px edge eats padding, not
width; the bar never grows into the 2px gap. `data-overlap="shared"` has no
rule. No new token, no colour literal, logical properties throughout.

`content-visibility` behaviour: unchanged in kind — the placeholder size now
equals the rendered size for every lane count, so a multi-lane row below the
70vh fold does not nudge the scrollbar on first paint. jsdom cannot verify
this; the stress visual section (24 rows, taller than 70vh) is where it shows.

## Stack & dependencies

- React + CSS Modules + rialto tokens — as today; no new package, no lucide
  import (bundle footprint of the bar unchanged; `size-limit` on
  `dist/lib/rialto.js` is 150 kB and this adds well under 1 kB).
- `@testing-library/react` + `user-event` + vitest (jsdom) — already used by
  `TapeChart.test.tsx`.
- Playwright in `apps/rialto-web` — already wired (`rialto-web-e2e.yml`).

## Test strategy (per seam)

- **Hook (`TapeChart.test.tsx` › `useTapeChartLayout`)** — RED first:
  1. Existing lane test (line 90) kept, extended: `laneCountByRoom.get("r1") === 2`, `get("r2") === 1`, `maxLanes` assertion retained.
  2. Default classifier: both overlapping bars `overlap === "conflict"`; a disjoint bar on the same room has `overlap === undefined`.
  3. `vi.fn(() => "shared")`: called exactly once for one overlapping pair, with `(earlier, later)` reservations; not called for a disjoint pair; both bars `"shared"`.
  4. Mixed 3-deep stack (a d0–d5, b d1–d4, c d2–d6; classifier returns `"conflict"` only for (a,b)): a and b `"conflict"`, c `"shared"`, lane count 3, exactly three calls.
  5. Cancelled/no-show never reach the classifier.
  6. Immutability: input arrays/objects `toEqual` a deep snapshot taken before the call; returned bars are not the input objects.
- **Strings (`defaultStrings.test.ts`)**: defaults present; template output contains `…, Tentative, Double-booked, via Direct, …` order; `mergeStrings({ overlapLabels: { conflict: "Conflit" } })` keeps the `shared` default.
- **DOM (`TapeChart.test.tsx` › `<TapeChart />`)**: two overlapping reservations on `r1`, one on `r2`. Assert: both bar buttons in the document; `data-lane` values `"0"` and `"1"`; both `data-overlap="conflict"`; `r1` row `data-lane-count="2"`, `r2` row `"1"`; `aria-label` contains `Double-booked`; `.overlapGlyph` present (vitest config uses `classNameStrategy: "non-scoped"`, so the raw class name is queryable); `user.click` on each bar calls `onReservationClick` with that bar's id. Second render with `classifyOverlap={() => "shared"}`: `data-overlap="shared"`, label `Shared occupancy`, no glyph. Third: no overlap → no `data-overlap` attribute. jsdom clicks are not occlusion-aware — this proves wiring, not visibility.
- **Real browser (`apps/rialto-web/e2e/interaction.spec.ts`)**: go to `components/tape-chart`, scope to `getByTestId("tape-chart-overlaps-default")`, click the bar `getByRole("button", { name: /<guest A>/ })` then `/<guest B>/` on room 201; after each click assert the selection card shows that guest. Playwright's actionability check fails with "element intercepts pointer events" when a bar is covered — that is the occlusion proof. Guest names in the overlap fixture must not appear in the playground's name pools (`tapechart-fixtures.ts:26-65`) so `getByRole` resolves to one node within the scoped section.
- **Fixtures (`tapechart-fixtures.test.ts`)**: `makeOverlapScenario()` is deep-equal across calls; every `roomId` exists; ids unique; `start < end`; all dates inside `[startDate, endDate)`; at least one room where some day has ≥ 3 active reservations; under `classifyDormAsShared(rooms)` at least one overlapping pair classifies `"conflict"` and at least one `"shared"`.
- **Visual**: new `tape-chart-overlaps` section (dorm classifier, comfortable, grid, pinned dates); `visual.spec.ts` `lightSections` gains `"tape-chart-overlaps"` right after `"tape-chart-stress"`. Baselines that change: `light-tape-chart-stress.png` (room-1003 only: Daniil Patel Jan 15–29 and Yuki Singh Jan 19–21 now both visible, red, row 93px) and the new `light-tape-chart-overlaps.png`. `light-tape-chart-default.png` and `dark-dark-tape-chart.png` must pass unmodified (overlap-free fixtures; single-lane geometry is pixel-identical). Both new/changed PNGs come from the `rialto-web-visual-diffs` artifact of the failing Linux run (`*-actual.png`), never from macOS (`gotchas.md` § CI). The visual job is in `rialto-web-e2e.yml`, not `ci.yml`, so it is not part of the required `CI Gate` — but green-main policy says fix it before merging, not after.
- **Storybook**: `Overlaps` play asserts two buttons with the overlapping guests' names are in the document. The package-local visual suite lists only `data-display-tapechart--default`, so the new stories add no Storybook baseline.
- **a11y matrix**: the TapeChart fixture (`component-fixtures.tsx:736`) renders an empty chart; no change needed.

## Demo and fixture plan

`makeOverlapScenario()` returns `{ rooms, reservations, startDate: "2026-03-02", endDate: "2026-03-09" }`
with the four rooms and nine reservations of ux.md's table (201: A Mon–Thu, B
Wed–Sat; 202: C Mon–Fri checkedIn, D Tue–Thu tentative, E Thu–Sun confirmed;
Dorm A: F Mon–Wed, G Mon–Thu, H Tue–Fri; 203: I Tue–Fri). Written as literals,
not via `makeReservations` (its cursor forbids overlaps). `classifyDormAsShared(rooms)`
returns `(a, _b) => roomsById.get(a.roomId)?.category === "Dorm" ? "shared" : "conflict"`
— the second parameter is underscore-prefixed so the AI-antipattern ratchet's
`unusedParams` count does not rise.

`TapeChartPage.tsx`: new `<Section title="Overlaps">` between the playground
and "Responsive behavior", content and order per ux.md; `classifyOverlap` is
`useMemo(() => classifyDormAsShared(rooms), [rooms])`; each chart sits in a
`<Card variant="flat" data-testid="tape-chart-overlaps-default" | "-classified">`
(`CardProps extends HTMLAttributes`, so the attribute passes through); the
selection card shares `selectedId`. The section is pinned to `en-US` /
comfortable / LTR and ignores the page controls.

## Generated artifacts to regenerate before push

- `packages/rialto/registry.json` — committed; `pnpm --dir packages/rialto build` (runs `generate-all.ts`) rewrites it with the new prop; `scripts/all-artifacts.drift.test.ts` fails the rialto test suite if it is stale. Commit it by explicit path.
- `packages/rialto/dist/manifest.json` — built, not committed; the Props table and `apps/rialto-web` typecheck read it, so build rialto before typechecking the app (`packages/rialto/CLAUDE.md` § Component Authoring Patterns).
- `packages/rialto/package.json` exports map — no new component folder, so unchanged; `pnpm exports:check` confirms.
- `packages/rialto-catalog/src/generated-schemas.ts` — TapeChart has no `*.catalog.ts`; unchanged (`pnpm regen --check` confirms).
- `llms.txt` / `llms-full.txt` at the root, `packages/rialto/`, and `apps/rialto-web/` — all three embed touched files (`types.ts`, `useTapeChartLayout.ts`, `tapechart-fixtures.ts`); `pnpm build --filter @mbe/cli... && pnpm regen`, then stage by explicit path. The pre-push hook takes its full path automatically because `packages/rialto/src` and `apps/rialto-web/src` are regen sources.
- `infrastructure/worker/dep-graph.json` / `docs/architecture/dependency-graph.md` — no `package.json` dependency change, so untouched; if either shows in `git status`, something added a dependency that should not have been.
- Visual baselines — from the Linux artifact, above.
- Not touched: `.changeset/`, `packages/rialto/package.json` `version` (stays 0.2.0).

## Decisions & alternatives

- **Classification in the hook** over `TapeChartRow` — the row would own a second copy of the overlap predicate and carry the callback through its memo comparator.
- **Pure `packRoom`** over keeping the in-place sort/assign — the repo rule is unconditional, and the overlap pass needs new per-bar fields anyway; one allocation per bar per layout is noise.
- **`laneCountByRoom` map** over deriving `max(lane)+1` in the row — one owner; the hook test and the DOM test assert the same number. Recorded as a coin-flip: the row derivation is one line and cannot desync from `bars`.
- **Keep `maxLanes`, fix its doc** over removing it — exported type, no publish authorised, one line.
- **Callback as a plain memo dependency** over a ref-latest pattern — stale-rule bug and a lint rule, for a cost the existing array props already impose.
- **Derived `--tapechart-lane-pitch`** over writing the formula three times — one place to get the arithmetic wrong.
- **Hoisted `--tapechart-blocked-fill`** over duplicating the gradient — ux.md left this to Architect.
- **Occlusion proof in `interaction.spec.ts`** over a Storybook play function — Playwright's hit-target check is the only harness here that fails on a covered element.
- **One PR** over rialto-then-demo — `workspace:*` coupling; an intermediate state would ship a prop the page does not show.
- **Inline fixture in stories** over importing the app fixture — dependency direction forbids it.

## Risks and rollback

- **Baseline cascade.** Single-lane geometry is pixel-identical by construction, so only the stress row should change. If `light-tape-chart-default.png` or `dark-dark-tape-chart.png` diffs, the lane arithmetic drifted — fix the CSS, do not regenerate those two.
- **Visual job red on first push** (missing overlap baseline) — expected; pull the artifact, commit, re-push. Not a `CI Gate` check, but fix before merge.
- **Unstable `classifyOverlap` reference** re-renders every row each parent render. Documented on the prop; demo/harness/stories all use stable references.
- **Compact 3-deep rows** are 104px; readable per ux.md (no lane cap, by design).
- **`react-hooks/set-state-in-effect`** is `warn` in `@mbe/config/eslint/react`; nothing here uses `useEffect`.
- **Shipped ≠ run** (memory): the Verify stage must open the deployed page and click a covered-then-visible bar, not only read the green interaction spec.
- **Rollback**: a single squash-merged PR; `git revert` restores code, baselines and `registry.json` together, and the next `main` push redeploys rialto-web via `deploy-static.yml`. No data, schema, or publish to unwind. There is no flag: the visible change with no prop (every overlap red) is the intended default, so rollback is revert, not configuration.

## ADRs

None — no decision is hard to reverse: the prop is additive, the hook is
internal, and the CSS is one module.
