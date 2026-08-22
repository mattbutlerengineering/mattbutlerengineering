---
stage: ux-design
run: feature:tape-chart-overlaps
date: 2026-08-21
assumptions:
  - "Conflict is marked per bar, not per pair: a bar carries data-overlap=\"conflict\" if any overlapping pair it belongs to is a conflict, otherwise \"shared\" if it overlaps anything, otherwise no attribute. In a mixed 3-deep stack (a–b conflict, b–c shared) a and b are conflict, c is shared. No user confirmed this; chosen because the bar is the only interactive, labelled unit in the grid."
  - "Conflict uses the error token family (--rialto-error, --rialto-error-muted), not warning: TapeChart.module.css:295-298 already spends --rialto-warning on the tentative status bar, so a warning-coloured conflict would be indistinguishable from a tentative booking; colors.css:48-49 documents error as 'invalid borders', which a double-booking is."
  - "Conflict treatment composes as: conflict border beats status and selected border colour; conflict never sets box-shadow, so the gold focus/selected glow composes untouched; blocked bars keep their grey hatch background and gain only the red border, edge and glyph."
  - "Lanes never split the row — every lane is exactly one today-sized bar tall, and the row grows per lane (pitch = row-height − bar-inset). At compact density a 3-deep stack is 104px tall with 32px bars; there is no lane cap because a cap would re-hide a bar, which is the defect being fixed."
  - "One new TapeChartStrings key, overlapLabels (Partial<Record<'conflict' | 'shared', string>>, defaults 'Double-booked' / 'Shared occupancy'), following the statusLabels idiom; it reaches the accessible name through a new optional overlapLabel on TapeChartFormattedParts so the default reservationAriaTemplate appends it and custom templates can opt in. The existing conflictWarning string is left to the unbuilt move dialog."
  - "Shared overlaps get no visual treatment at all (brief: 'simply stack with no alarm') — only the data-overlap=\"shared\" attribute and the accessible-name suffix."
  - "Overlap is judged on the in-view, clipped span (the same startOffset/span lane packing uses), so a conflict marker is present exactly when two bars visibly share days; an overlap entirely outside the window is not surfaced until it scrolls into view."
  - "The Overlaps section on the component page shows two charts stacked vertically (default above, classifyOverlap below) over the same fixture rather than literally side by side: a 7-day grid is ≥720px wide (160px room column + 7×80px) and two abreast do not fit the page column."
  - "The demo classifyOverlap rule is room-category based (overlaps in a 'Dorm' room are shared, everywhere else conflict), chosen so the rule is one readable line and hotel-shaped; the mixed-result stack is covered by a unit test, not by the demo."
---

# UX: Tape chart overlaps — every bar visible, every conflict legible

Grid view of `TapeChart` only. List view and mobile stack are untouched
(they iterate linearly and never occlude — PRD out of scope).

## Flows

### Operator scans the rack chart and finds a double-booking

1. Operator opens a product built on `TapeChart` in grid view, 24 rooms × 14
   days.
2. Rows with no overlap look exactly as they do today (48px comfortable / 36px
   compact, one bar lane).
3. A room with two overlapping bookings is taller: two bar lanes, the earlier
   booking on top, the later one beneath. Both bars are fully visible, both are
   `<button>`s, neither covers the other.
4. Because the consumer passed no `classifyOverlap`, both bars carry the
   conflict treatment: red border, red inline-start edge, a small red
   warning glyph before the guest name. It reads as "something is wrong here"
   at a glance, distinct from every status tint and from the grey hatch of a
   blocked bar.
5. Operator clicks either bar → `onReservationClick` fires with that bar's
   reservation; the clicked bar gets the gold focus/selected glow; the red
   conflict border stays.
6. A screen-reader user Tabs to the same bar and hears the usual label with
   `Double-booked` spoken after the status (e.g. "Yuki Singh, 1003, Jan 19 to
   Jan 21, 2 nights, Tentative, Double-booked, via Direct, $360").

### Consumer developer declares a legitimate overlap

1. Developer renders `<TapeChart … classifyOverlap={(a, b) => …} />`.
2. For every pair of bars in one room whose in-view spans intersect, the
   component calls the callback once with the two reservations (earlier start
   first). No call for non-overlapping pairs.
3. A pair answered `"shared"` stacks in two lanes with no red treatment; the
   bars carry `data-overlap="shared"` and the accessible name ends with
   `Shared occupancy`. A pair answered `"conflict"` renders as in the operator
   flow.
4. In a 3-deep stack with mixed answers, each bar shows the worst answer it is
   part of (see Decisions § 1).

### Evaluator reads the component page

1. Evaluator opens `/rialto/components/tape-chart`, scrolls past the
   playground to the new **Overlaps** section (second section on the page).
2. Reads one paragraph explaining the default and the callback.
3. Sees chart 1 (default): three rooms with overlaps, all red; one control
   room, unchanged height.
4. Sees chart 2 (same fixture with `classifyOverlap`): the two private rooms
   still red, the dorm row now calm — stacked, no alarm.
5. Reads the 6-line classifier code sample between the charts' captions.
6. Clicks bars in either chart; a caption card shows guest · room · dates ·
   overlap label, proving every bar is reachable.

## Screens

### Grid row — single lane (unchanged)

```
┌ room ──────┬────────────────────────────────────────────────┐
│ 1002       │ ┌──────────────┐                               │  48px
│ Standard·2 │ │ Clara Singh  │                               │  (36px compact)
│            │ └──────────────┘                               │
└────────────┴────────────────────────────────────────────────┘
```

Bar block-size 42px (32px compact), inset 3px (2px) top and bottom — exactly
today's geometry, so `light-tape-chart-default.png` and `dark-dark-tape-chart.png`
(both render the overlap-free default fixture) pass unmodified.

### Grid row — 2-lane conflict (default, no `classifyOverlap`)

```
┌ room ──────┬────────────────────────────────────────────────┐
│            │ ┃⚠ Daniil Patel                      $2,520 ┃ │  lane 0 (42px)
│ 1003       │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │  3px gap
│ Standard·2 │            ┃⚠ Yuki Singh       $360 ┃          │  lane 1 (42px)
│            │            ┗━━━━━━━━━━━━━━━━━━━━━━━━┛          │
└────────────┴────────────────────────────────────────────────┘  93px total
   ┃ = 3px --rialto-error inline-start edge; ━ = 1px --rialto-error border
   ⚠ = 12px red warning glyph, aria-hidden
```

- Lane 0 is the top lane; lane index increases downward. Lane order is the
  one `assignLanes` already produces (earlier start first, shorter span first
  on ties), so the DOM order of bars is also top-to-bottom reading order.
- Both bars show the full conflict treatment (per-bar marking).
- Background: `color-mix(in srgb, var(--rialto-error) 10%, var(--rialto-surface-elevated))`
  replaces the status tint (the status is still in the accessible name and
  the bar text; the double-booking is the more important fact).

### Grid row — 3-lane shared (with `classifyOverlap` → `"shared"`)

```
┌ room ──────┬────────────────────────────────────────────────┐
│            │ ┌──────────────────────┐                       │  lane 0
│ Dorm A     │ └──────────────────────┘                       │
│ Dorm · 6   │      ┌──────────────────────────┐              │  lane 1
│            │      └──────────────────────────┘              │
│            │           ┌─────────────────┐                  │  lane 2
│            │           └─────────────────┘                  │
└────────────┴────────────────────────────────────────────────┘  138px total
```

Ordinary bars, ordinary status tints, no glyph — only the stacking says
"three at once". `data-overlap="shared"` is on each bar for tests and
consumers; the accessible name ends with `Shared occupancy`.

### Grid row — conflict composed with other bar states

| Bar state on the same element | What wins | Why |
| --- | --- | --- |
| `data-status="tentative"` (warning tint/border) | conflict tint + red border | conflict rule is written after the status rules in the CSS module; same specificity, later wins |
| `data-blocked="true"` (grey hatch, italic) | hatch background stays; border, edge and glyph go red | the hatch is the bar's identity ("maintenance block"); a block overlapping a booking is a real conflict and must still shout |
| `data-selected="true"` (gold glow + gold border) | gold glow stays, border stays red | selection is carried by the glow; conflict never sets `box-shadow`, so nothing collides |
| `:focus-visible` (gold glow, `z-index: 2`) | both | same reason; focused bar rises above siblings as today |
| `data-overlap="shared"` | no rule | shared has no styling |

Explicit composition rules an implementer must write (everything else falls
out of rule order):

```css
/* after .bar[data-selected="true"] and the status rules */
.bar[data-overlap="conflict"] {
  background: color-mix(in srgb, var(--rialto-error) 10%, var(--rialto-surface-elevated));
  border-color: var(--rialto-error);
  border-inline-start-width: 3px;
}
/* blocked keeps its hatch; only the chrome turns red */
.bar[data-blocked="true"][data-overlap="conflict"] {
  background: /* the existing data-blocked repeating-linear-gradient, unchanged */;
}
.overlapGlyph { color: var(--rialto-error); flex-shrink: 0; }
```

(Whether the blocked exception is expressed by duplicating the gradient or by
hoisting it into a custom property is Architect's call; the visible result is
what is specified.)

### The conflict glyph

- 12 × 12 inline SVG, `aria-hidden="true"`, stroke `currentColor`, drawn the
  way `Banner.tsx:30-45` hand-rolls its variant icons (no new dependency; no
  lucide import into TapeChart either, to keep the bar's bundle footprint as
  it is). Shape: triangle outline with a vertical bar and dot — the universal
  warning sign, recognisable as a shape alone.
- First flex child of the bar, before `.barTitle`; inherits the bar's existing
  `gap: var(--rialto-space-2xs)`.
- Same size at both densities. On a 1-day bar at the narrowest day width
  (56px) the title ellipsises to ~2 characters; that is accepted — the full
  name is in the accessible label and the glyph is the more important thing to
  keep.

### Non-colour perception of conflict (PRD assumption 3)

Four independent channels, any one of which is enough:

1. The glyph (shape, not colour).
2. The 3px inline-start edge (a thickness difference, visible in greyscale).
3. `data-overlap="conflict"` on the `<button>` (DOM, testable, stylable by the
   consumer).
4. `Double-booked` in the accessible name (speech/braille).

### Empty / loading / error states

Unchanged. Overlap rendering exists only inside the grid render branch; the
skeleton, the empty state and the error banner never show bars. The "loading
with existing reservations" info banner above the grid is unaffected.

## Geometry and contract (what the implementer builds to)

### CSS variables

| Variable | Set on | Value | Read by |
| --- | --- | --- | --- |
| `--tapechart-lane-count` | the `role="row"` div (next to the existing `--tapechart-day-count`) | that room's own lane count, `≥ 1` — never the global `maxLanes` | `.lane` min height, `.row` intrinsic size |
| `--tapechart-bar-lane` | the bar `<button>` (next to `--tapechart-bar-start` / `--tapechart-bar-span`) | `bar.lane`, 0-indexed | `.bar` block offset |

Existing `--tapechart-row-height` (48/36) and `--tapechart-bar-inset` (3/2)
are reused unchanged; no new root variables.

### Lane-offset math, in words

- **Lane pitch** `P = row-height − bar-inset` (45px comfortable, 34px compact).
- **Row block-size (min)** `= lane-count × P + bar-inset`. One lane gives
  exactly `row-height` (48 / 36): today's height to the pixel. Two lanes:
  93 / 70. Three: 138 / 104. Four: 183 / 138.
- **Bar top** `= bar-inset + lane × P`. **Bar block-size** `= row-height − 2 × bar-inset`
  (42 / 32) — replaces today's `inset-block-end` pin with an explicit height so
  a bar never stretches to the taller row.
- Lane 0 therefore sits at 3px from the top with a 42px height: pixel-identical
  to the current bar.
- The room header cell is a grid sibling and stretches with the row;
  `justify-content: center` keeps the room name vertically centred.
- The today line (`inset-block: 0` on `.lane`) spans the full taller row with
  no change.

### `content-visibility` / intrinsic size

`.row` keeps `content-visibility: auto`. Its `contain-intrinsic-size` must use
the same formula as the row's real height (`auto calc(var(--tapechart-lane-count, 1) * (var(--tapechart-row-height) - var(--tapechart-bar-inset)) + var(--tapechart-bar-inset))`)
so an off-screen row's placeholder equals its rendered height and the 70vh
scroller never jumps on first scroll. If Architect chooses to leave it at
`auto var(--tapechart-row-height)`, the stated degradation is: multi-lane rows
below the fold are estimated short until first rendered, which can nudge the
scrollbar once per such row; the `auto` keyword then remembers the real size.
`virtualizeThreshold` stays dead (PRD).

### DOM attributes

| Element | Attribute | Values | Purpose |
| --- | --- | --- | --- |
| bar `<button>` | `data-lane` | `"0"`, `"1"`, … | test-readable lane (PRD criterion 1) |
| bar `<button>` | `data-overlap` | `"conflict"` \| `"shared"` \| absent | conflict marker / shared marker; absent on a bar that overlaps nothing |
| `role="row"` div | `data-lane-count` | `"1"`, `"2"`, … | test-readable per-row growth (PRD criterion 3) — jsdom cannot compute the CSS height |

`data-status`, `data-blocked`, `data-selected`, `aria-pressed`, `tabIndex`
and `aria-label` stay as they are.

### `classifyOverlap` — the one new prop

```ts
export type TapeChartOverlapKind = "conflict" | "shared";

/** Called once per pair of reservations whose visible spans overlap in one
 *  room, earlier start first. Absent → every overlap is a "conflict". */
classifyOverlap?: (a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind;
```

Behaviour the UX depends on (Architect owns the mechanism):

- Invoked only for overlapping pairs, exactly once per unordered pair, in a
  deterministic order (by the same sort `assignLanes` applies), with the
  earlier-starting reservation as `a`. The PRD's "invoked only for overlapping
  pairs" criterion tests this.
- "Overlapping" means the two bars' in-view spans intersect
  (`a.startOffset < b.startOffset + b.span && b.startOffset < a.startOffset + a.span`),
  i.e. precisely the condition under which they occupy different lanes. A
  conflict marker is therefore present exactly when the stacking is visible.
- Per-bar result: `conflict` if any pair containing the bar is conflict; else
  `shared` if the bar overlaps anything; else none.
- Cancelled and no-show reservations are already dropped before lane packing
  and are never passed to the callback.
- The JSDoc on the prop is what the component page's Props table shows
  (`PropsTable` reads the compiled manifest) — write it as a consumer-facing
  sentence including the default.

### Accessible text

- New `TapeChartStrings.overlapLabels?: Partial<Record<TapeChartOverlapKind, string>>`,
  defaults `{ conflict: "Double-booked", shared: "Shared occupancy" }`,
  deep-merged in `mergeStrings` the way `statusLabels` is.
- New optional `TapeChartFormattedParts.overlapLabel?: string`, resolved from
  the bar's overlap kind; `undefined` on a non-overlapping bar.
- `defaultReservationAriaTemplate` pushes `fmt.overlapLabel` immediately after
  `fmt.statusLabel` (before `via <source>`). Custom templates receive it in
  `fmt` and may ignore it — that is the consumer's choice, the same as every
  other part.
- No `aria-description`, no `title` tooltip, no live region: the overlap is a
  static property of the bar.

### Keyboard, focus, RTL, dark, motion

- Keyboard: unchanged roving `tabIndex`; Enter/Space activate. The conflict
  treatment does not alter focus order.
- RTL: the red edge is `border-inline-start`, the glyph is the first flex
  child — both flip with `dir="rtl"` for free (matches the Banner variant-edge
  idiom at `Banner.module.css:20-35`).
- Dark: tokens swap (`--rialto-error: #e06050`, `colors.css:95`); no dark rule.
- Motion: none added; the existing `box-shadow` transition and reduced-motion
  override are untouched.

## Demo surfaces (`apps/rialto-web`, Storybook, visual harness)

### Component page — new "Overlaps" section

Position: second `<Section>` on `TapeChartPage`, directly after "Interactive
playground" and before "Responsive behavior". It is the design answer the
coworker asked for, so it sits above the reference prose.

Content, in order:

1. **Prose (one paragraph, `<Text>`):** "Two reservations on one room can
   overlap. The grid never hides one behind the other — each gets its own lane
   and the row grows to fit. By default every overlap is treated as a
   double-booking and drawn in the error family. Pass `classifyOverlap` to tell
   the chart which overlaps are legitimate in your domain; those simply stack."
2. **Caption** (`Text variant="label"`): "Default — every overlap is a
   conflict".
3. **Chart 1**: `<Card variant="flat"><TapeChart …overlapFixture /></Card>`,
   `density="comfortable"`, `viewMode="grid"`, fixed dates, no
   `classifyOverlap`, `currency="USD"`, `locale="en-US"`.
4. **Code sample** (`<pre style={{ margin: 0 }}>` in a flat card, the idiom
   `ToastPage.tsx:136` already uses):

   ```tsx
   const roomsById = new Map(rooms.map((r) => [r.id, r]));
   const classifyOverlap = (a, b) =>
     roomsById.get(a.roomId)?.category === "Dorm" ? "shared" : "conflict";

   <TapeChart rooms={rooms} reservations={reservations} classifyOverlap={classifyOverlap} />
   ```

5. **Caption**: "With `classifyOverlap` — dorm bunks share, private rooms
   conflict".
6. **Chart 2**: identical props plus `classifyOverlap`.
7. **Selection card** (shared by both charts, same pattern as the playground's
   `selected` card): `Guest · Room` / `start → end · Double-booked | Shared occupancy | —`.
   Clicking a bar in either chart selects it; the gold glow appears on that
   bar in both charts (same `selectedReservationId`), which incidentally shows
   the glow/red-border composition.

The page's locale/density/RTL controls do **not** drive this section: it is
pinned to `en-US` / comfortable / LTR so the two charts are always comparable.

### Overlap fixture (`tapechart-fixtures.ts`)

A new deterministic, date-pinned export (Architect names it; e.g.
`overlapScenario()` returning `{ rooms, reservations, startDate, endDate }`),
appended explicitly — not generated through `makeReservations`, whose cursor
forbids overlaps by construction. Dates pinned to a fixed Monday-start week so
the chart is identical on every visit and usable by Storybook and the visual
harness. Contents (7 days, 4 rows, top to bottom):

| Room | Category · cap | Bars | Result, default | Result, classified |
| --- | --- | --- | --- | --- |
| 201 | Standard · 2 | A: Mon–Thu confirmed; B: Wed–Sat confirmed | 2 lanes, both red | same |
| 202 | Deluxe · 3 | C: Mon–Fri checkedIn; D: Tue–Thu tentative; E: Thu–Sun confirmed (all cover Thu) | 3 lanes, all red | same |
| Dorm A | Dorm · 6 | F: Mon–Wed; G: Mon–Thu; H: Tue–Fri, all confirmed | 3 lanes, all red | 3 lanes, calm |
| 203 | Standard · 2 | I: Tue–Fri confirmed | 1 lane, 48px, unchanged | same |

Rows 201 and 203 also make the "sibling rows keep their height" point
visually. `tapechart-fixtures.test.ts` gains assertions that this export
contains ≥1 conflict pair, ≥1 pair that the dorm rule classifies shared, ≥1
3-deep stack, and is deep-equal across two calls.

### Storybook

Two stories in `TapeChart.stories.tsx`, both on the overlap fixture:
`Overlaps` (no callback — everything red) and `OverlapsClassified` (the dorm
rule). Two rather than one because a function arg cannot be toggled from the
Storybook controls panel.

### Visual-test harness

One new section in `TapeChartSections.tsx`:
`<Section id="tape-chart-overlaps" title="TapeChart — Overlaps">` rendering
the overlap fixture **with** the dorm classifier (so a single screenshot
covers conflict, shared and 3-deep at once), comfortable density, grid view,
Jan-2026-style pinned dates. Listed by full id in `visual.spec.ts`'s
`lightSections` immediately after `"tape-chart-stress"`. Its baseline, and the
changed `light-tape-chart-stress.png` (room-1003 now shows both Daniil Patel
and Yuki Singh, both red, row 93px), come from a Linux CI artifact — never a
macOS render. No dark overlap section (see Deliberately not designed).

## Decisions on the PRD's open questions

1. **Per-bar, not per-pair.** The bar is the clickable, focusable, labelled
   unit; a per-pair span overlay would be a non-interactive element with no
   accessible name, colour-only, and foreign to the bar-level `data-*` idiom.
   Mixed stack: worst answer wins per bar (a, b conflict; c shared).
2. **Error family, and it survives every other state.** Warning is already
   the `tentative` bar colour; error is unused on bars and documented for
   invalid borders. Composition table above: conflict owns background (except
   on blocked bars) and border colour; selection/focus own `box-shadow`; they
   never touch each other's property.
3. **New string key, into the aria name.** `overlapLabels` (statusLabels
   idiom) → `fmt.overlapLabel` → default template, right after the status.
   `conflictWarning` stays reserved for the move dialog. No `aria-description`.
4. **Compact lanes are never narrower than a compact bar.** Rows grow by a
   full 34px pitch per lane; a 36px row is never split. No cap.

Answers the PRD routed elsewhere but that this design constrains:

- The per-room lane count must reach `TapeChartRow` as an input (it drives
  `--tapechart-lane-count` / `data-lane-count`) and therefore the row's memo
  equality — Architect.
- `dark-dark-tape-chart.png` renders `tapeChartDefaultReservations`
  (`DarkModeSection.tsx:99-108`), which is overlap-free (room r7's two bars are
  Jan 15–17 and Jan 19–22): it must pass unmodified — Verify.
- The stress fixture's only overlapping room is `room-1003` (`room-1009`'s two
  bars are Jan 15–21 and Jan 23–26, disjoint), so the stress baseline changes
  for exactly that one row — Verify.

## Conventions to match

- Rialto tokens only: `--rialto-error`, `--rialto-surface-elevated`,
  `--rialto-space-2xs`; `color-mix(in srgb, …)` at the same 10–18% tint range
  the status rules use (`TapeChart.module.css:295-306`); `data-*` state
  attributes on the bar; CSS logical properties (`border-inline-start-width`,
  `inset-block-start`).
- No new colour literal, no new token, no new dependency, no lucide import
  into TapeChart (Banner's hand-rolled SVG idiom instead).
- Gold (`--rialto-accent`) is never used for the conflict — it stays the
  focus/selected signal.
- Rialto rendering rule: lane count, overlap kind and the accessible label
  are all derived at render/memo time; no `setState` in a `useEffect`.
- Showcase page scaffolding: `<Section title>`, `<Card variant="flat">`,
  `<Text variant="label">`, `<pre style={{ margin: 0 }}>` for code — all
  already on `TapeChartPage.tsx` / `ToastPage.tsx`.
- Visual-harness `<Section id>` → `data-testid`, listed by full id in
  `visual.spec.ts` (never a glob).

## Deliberately not designed

- **List view / mobile stack conflict labelling.** Both are out of scope per
  PRD, so a screen-reader user who prefers list view (the page calls it "the
  preferred mode for screen reader users") will not hear `Double-booked`
  there. Flagged for the human; a follow-up can reuse `overlapLabels`.
- **Row-level or chart-level conflict summary** (a dot beside the room name,
  a "Conflicts: N" stat pill, a filter). The marked bars are in the row; a
  summary is polish.
- **A visible word on the bar.** The glyph carries the visual cue; the word
  lives in the accessible name. Bars as narrow as 56px cannot afford both.
- **Any styling for `"shared"`** beyond stacking.
- **A lane cap, compression, or "+N more" affordance.** Every bar stays a
  full-height bar, however deep the stack.
- **Dark-mode visual baseline for the overlaps section.** The error token
  swaps by itself; one light baseline is the regression guard for this run.
- **Hover tooltips, drag/move, `checkConflict`, the move dialog.** Untouched.
- **Time-axis (tables × time) variant.** Out of scope; the restaurant case is
  served by returning `"shared"`.
