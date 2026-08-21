---
stage: decompose
run: feature:tape-chart-overlaps
date: 2026-08-21
assumptions:
  - "Branch is `feat/tape-chart-overlaps`, cut from `origin/main`; every work item lands on it in the order below, one PR (architecture decision 10)."
  - "ux.md's fixture notation `Mon–Thu` means the bar occupies the Mon, Tue, Wed and Thu columns: `start` = Mon, `end` = the day after Thu (end-exclusive checkout). This is the only reading under which ux.md's 'all cover Thu' holds for room 202 (C Mon–Fri, D Tue–Thu, E Thu–Sun). Concrete ISO dates are pinned in item 7."
  - "Architect left the overlap fixture's guest names and room ids unnamed. Chosen here so the Playwright locators are exact strings: rooms `ov-201` / `ov-202` / `ov-dorm-a` / `ov-203`; guests Marisol Vega, Tobias Lindqvist, Harriet Okafor, Elias Brandt, Nadia Petrova, Oscar Delacroix, Wren Castellano, Imani Adeyemi, Lucas Moreau. No first or last name appears in `FIRST_NAMES` / `LAST_NAMES` (`tapechart-fixtures.ts:26-65`), in the visual-harness fixtures, or in `TapeChart.stories.tsx`."
  - 'The Overlaps section''s selection card gets `data-testid="tape-chart-overlaps-selection"` so the Playwright occlusion test can assert on it without colliding with the playground''s own card.'
  - "The component-page wiring test (`TapeChartPage.test.tsx`) mocks `@mattbutlerengineering/rialto` the way every other `apps/rialto-web` page test does (the real dist is unbuilt in worktrees). It proves the section passes the right props to two charts; rendering is proved by the Playwright spec in item 11."
  - "A draft PR is opened at Implement (item 13), not deferred to Ship: `rialto-web-e2e.yml` triggers only on `pull_request` and push-to-`main`, so the Linux `rialto-web-visual-diffs` artifact the baselines must come from cannot exist without a PR. The brief authorises opening the PR; Ship marks it ready and enables auto-merge."
  - "`pnpm test:storybook` (vitest + Storybook play functions) is not wired into any CI workflow; the `Overlaps` story's play assertion is verified locally plus `pnpm typecheck`. The package-local Storybook visual suite lists only `data-display-tapechart--default` and gains no baseline."
  - "The e2e occlusion spec (item 11) is a verification test written after its surface exists; its RED state is the pre-item-8 page (no `tape-chart-overlaps-default` test id). Implement does not need to witness that RED run — every other item is strict RED→GREEN."
---

# Breakdown: Tape chart overlaps — lanes rendered, conflicts classified

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

One branch, one PR. Items are ordered by dependency; do them top to bottom.
Every item names the test that proves it. Run `pnpm` from inside the package
directory (`packages/rialto`, `apps/rialto-web`), never the monorepo root.
Vitest does not typecheck — `pnpm typecheck` is a separate gate. Stage files by
explicit path (the PostToolUse prettier hook leaves ~170 unrelated files dirty).

## Milestone 1: the library renders lanes and marks conflicts (`packages/rialto`)

Demonstrable when done: `pnpm test` in `packages/rialto` shows overlapping bars
in separate lanes with `data-overlap="conflict"` in jsdom, and `registry.json`
lists `classifyOverlap` with its description.

- [x] **Pure `packRoom` and per-room lane count** — replace the mutating `assignLanes` in `useTapeChartLayout.ts:11-30` with a pure `packRoom(bars)` and return `laneCountByRoom`
  - Accept:
    - `packages/rialto/src/components/TapeChart/useTapeChartLayout.ts`: `assignLanes` is gone; `packRoom(bars: TapeChartPositionedBar[]): { bars: TapeChartPositionedBar[]; laneCount: number }` sorts a copy (`bars.slice().sort((a, b) => a.startOffset - b.startOffset || a.span - b.span)` — the existing comparator, unchanged), assigns lanes into a parallel `lanes[]` array with the existing first-fit algorithm, and returns `sorted.map((bar, i) => ({ ...bar, lane: lanes[i] }))`; it never writes `bar.lane` on an input object and never sorts the input array in place.
    - The `useMemo` builds `barsByRoom` from each room's `packRoom(...).bars` and a new `laneCountByRoom: Map<string, number>` from `.laneCount` (every room present, `≥ 1`, an empty room is `1`); `maxLanes` is still computed as the max over rooms.
    - `packages/rialto/src/components/TapeChart/types.ts` `TapeChartLayout` gains `laneCountByRoom: Map<string, number>` with JSDoc `/** Lanes in each room (≥ 1); drives that row's height. */`, and `maxLanes`'s JSDoc becomes `/** Highest lane count across all rooms. Informational — row height is per room. */`.
    - `bar.reservation` is still the consumer's own object (same identity); the consumer's `reservations` array and objects are not mutated.
  - Test (RED first): `packages/rialto/src/components/TapeChart/TapeChart.test.tsx` › `useTapeChartLayout`:
    - extend `"assigns overlapping reservations to separate lanes"` (line 90) with `expect(result.current.laneCountByRoom.get("r1")).toBe(2)` and `expect(result.current.laneCountByRoom.get("r2")).toBe(1)`; keep the existing `lanes` and `maxLanes` assertions.
    - new `"does not mutate its inputs and returns fresh bar objects"`: `const snapshot = structuredClone(reservations)` before `renderHook`; after, `expect(reservations).toEqual(snapshot)`; `expect(bars[0]!.reservation).toBe(reservations[0])` (identity preserved) while `bars[0]` is not any input object.
  - Blocked by: —

- [x] **`classifyOverlap` prop and per-bar overlap kind** — add the one new prop, thread it into the hook, and fold a worst-wins `overlap` onto every bar
  - Accept:
    - `types.ts`, in file order: `export type TapeChartOverlapKind = "conflict" | "shared";` (before `TapeChartReservation`); `TapeChartProps.classifyOverlap?: (a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind;` carrying exactly this JSDoc (it is what the Props table shows):
      ```
      /**
       * Decide whether two reservations whose visible spans overlap in one room are
       * a `"conflict"` (double-booking, drawn in the error family) or `"shared"`
       * (legitimate co-occupancy, stacked without alarm). Called once per
       * overlapping pair, earlier start first. Default: every overlap is a
       * `"conflict"`. Keep the reference stable (module scope or `useCallback`) —
       * a new function each render recomputes the layout and re-renders every row.
       */
      ```
      and `TapeChartPositionedBar.overlap?: TapeChartOverlapKind;` with JSDoc `/** Worst overlap kind across every pair this bar belongs to; absent when it overlaps nothing. */`.
    - `packages/rialto/src/components/TapeChart/index.ts` adds `TapeChartOverlapKind` to the `export type { … }` list (the barrel at `packages/rialto/src/components/index.ts:99` is `export * from "./TapeChart"`, so nothing else is needed).
    - `useTapeChartLayout.ts`: signature becomes `useTapeChartLayout(reservations, rooms, startDate, endDate, classifyOverlap?)`; module-level `const CONFLICT_ALWAYS = () => "conflict" as const;`; `const classify = classifyOverlap ?? CONFLICT_ALWAYS;` is the value in the `useMemo` dependency array (so the default case has a stable dependency); `packRoom(bars, classify)` runs the overlap pass over the sorted copy: for `i < j`, break the inner loop at the first `j` with `sorted[j].startOffset >= sorted[i].startOffset + sorted[i].span`; for every intersecting pair call `classify(sorted[i].reservation, sorted[j].reservation)` exactly once; fold into `kinds[i]`/`kinds[j]` with `conflict` > `shared` > `undefined` (compare against the literal `"conflict"` exactly; anything else counts as `shared`); returned bars carry `overlap: kinds[i]` (the key is absent/undefined, never `null`, on a bar that overlaps nothing).
    - `packages/rialto/src/components/TapeChart/TapeChart.tsx` destructures `classifyOverlap` from props (line 34-56) and passes it as the fifth argument at line 71. `virtualizeThreshold` stays unread.
    - Cancelled and no-show reservations are dropped before packing (existing line 51) and so never reach `classify`.
  - Test (RED first): `TapeChart.test.tsx` › `useTapeChartLayout`, all in room `r1`, window `2026-04-20`→`2026-04-27`:
    - `"marks every overlapping bar as a conflict by default"`: a `04-20→04-24`, b `04-22→04-26`, c `04-26→04-27` → a and b `overlap === "conflict"`, c `overlap === undefined`.
    - `"invokes classifyOverlap once per overlapping pair, earlier start first"`: `const classify = vi.fn(() => "shared" as const)` with the same a/b/c → `toHaveBeenCalledTimes(1)`, `toHaveBeenCalledWith(reservations[0], reservations[1])` (the a and b objects, by identity), a and b `"shared"`, c `undefined`.
    - `"folds a mixed 3-deep stack worst-wins per bar"`: a `04-20→04-25`, b `04-21→04-24`, c `04-22→04-26`; classifier returns `"conflict"` only when `(x.id === "a" && y.id === "b")`, else `"shared"` → a `"conflict"`, b `"conflict"`, c `"shared"`, `laneCountByRoom.get("r1") === 3`, classifier called exactly 3 times.
    - `"never passes cancelled or no-show reservations to classifyOverlap"`: a confirmed `04-20→04-24` plus x cancelled and y noShow on the same dates → classifier not called, a `overlap === undefined`.
  - Blocked by: Pure `packRoom` and per-room lane count

- [ ] **Overlap labels in the strings and the default aria template** — `overlapLabels` string key, `overlapLabel` formatted part, spoken right after the status
  - Accept:
    - `types.ts`: `TapeChartFormattedParts.overlapLabel?: string;` (JSDoc `/** Label for the bar's overlap kind; undefined when the bar overlaps nothing. */`); `TapeChartStrings.overlapLabels?: Partial<Record<TapeChartOverlapKind, string>>;` (JSDoc `/** Spoken after the status in the default aria template. */`).
    - `packages/rialto/src/components/TapeChart/defaultStrings.ts`: `ResolvedStrings` adds `"overlapLabels"` to the `Omit` union and `overlapLabels: Record<TapeChartOverlapKind, string>` to the intersection, exactly as `statusLabels` is handled; `DEFAULT_STRINGS.overlapLabels = { conflict: "Double-booked", shared: "Shared occupancy" }`; `mergeStrings` adds `overlapLabels: { ...DEFAULT_STRINGS.overlapLabels, ...overrides.overlapLabels }` on the line after `statusLabels` (line 96); `defaultReservationAriaTemplate` inserts `if (fmt.overlapLabel) pieces.push(fmt.overlapLabel);` between `pieces.push(fmt.statusLabel)` (line 41) and the `via` line (line 42). `conflictWarning` (line 83) is untouched.
  - Test (RED first): `packages/rialto/src/components/TapeChart/defaultStrings.test.ts`:
    - `DEFAULT_STRINGS` › `"has default overlap labels"`: `overlapLabels` `toEqual({ conflict: "Double-booked", shared: "Shared occupancy" })`.
    - `reservationAriaTemplate` › `"speaks the overlap label immediately after the status, before the source"`: `{ ...baseReservation, source: "Direct" }` with `{ ...baseFmt, statusLabel: "Tentative", overlapLabel: "Double-booked", priceTotal: "$360" }` → result `toContain("Tentative, Double-booked, via Direct, $360")`; and with `overlapLabel` absent the result does not contain `"Double-booked"`.
    - `mergeStrings` › `"deep-merges overlapLabels"`: `mergeStrings({ overlapLabels: { conflict: "Conflit" } })` → `overlapLabels.conflict === "Conflit"` and `overlapLabels.shared === "Shared occupancy"`.
  - Blocked by: `classifyOverlap` prop and per-bar overlap kind

- [ ] **Grid, row and bar adapters render lane and overlap** — the DOM contract: `--tapechart-lane-count` / `data-lane-count` on the row, `--tapechart-bar-lane` / `data-lane` / `data-overlap` on the bar, the conflict glyph, the overlap label in the accessible name
  - Accept:
    - `packages/rialto/src/components/TapeChart/TapeChartGrid.tsx` passes `laneCount={layout.laneCountByRoom.get(room.id) ?? 1}` to every `TapeChartRow` (line 76-87).
    - `packages/rialto/src/components/TapeChart/TapeChartRow.tsx`: new prop `laneCount: number` on `TapeChartRowProps`; the `role="row"` div's inline style gains `["--tapechart-lane-count" as string]: laneCount` next to `--tapechart-day-count` (line 44) and the div gains `data-lane-count={laneCount}`; the memo comparator (line 88-100) gains `prev.laneCount === next.laneCount`. No comparator entry for per-bar overlap (bars are fresh objects per layout run, covered by `prev.bars === next.bars`).
    - `packages/rialto/src/components/TapeChart/TapeChartBar.tsx`: `style` gains `["--tapechart-bar-lane" as string]: bar.lane` (line 49-52); the `<button>` gains `data-lane={bar.lane}` and `data-overlap={bar.overlap}` (React omits the attribute when `undefined`); when `bar.overlap === "conflict"` a 12×12 inline `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.overlapGlyph}>` (triangle outline + vertical bar + dot, hand-rolled per `Banner.tsx:30-45`) is the first flex child before `.barTitle`; `buildFormattedParts` adds `overlapLabel: bar.overlap ? strings.overlapLabels[bar.overlap] : undefined`. No `lucide-react` import in any TapeChart file; no `useEffect`.
    - `data-status`, `data-blocked`, `data-selected`, `aria-pressed`, `tabIndex`, roving focus and the click/keydown handlers are unchanged.
  - Test (RED first): `TapeChart.test.tsx` › `<TapeChart /> rendering`, rooms `ROOMS` (`r1` "101", `r2` "102"), window `2026-04-20`→`2026-04-27`, reservations a `r1 04-20→04-24` "Ines Duarte", b `r1 04-22→04-26` "Kofi Mensah", c `r2 04-21→04-23` "Leila Haddad"; locate bars with `screen.getByRole("button", { name: /Ines Duarte/ })` etc.:
    - `"renders overlapping bars in distinct lanes with a conflict marker by default"`: a `data-lane="0"`, b `data-lane="1"`; b's `style` attribute includes `--tapechart-bar-lane` with value `1`; a and b `data-overlap="conflict"`; c has no `data-overlap` attribute and `data-lane="0"`; `screen.getByRole("row", { name: "101" })` has `data-lane-count="2"` and its `style` includes `--tapechart-lane-count` with value `2`; row `"102"` has `data-lane-count="1"`; a's `aria-label` contains `"Double-booked"`; `a.querySelector(".overlapGlyph")` is non-null (vitest `classNameStrategy: "non-scoped"`, `packages/rialto/vitest.config.ts:32`) and `c.querySelector(".overlapGlyph")` is null.
    - `"stacks shared overlaps without the conflict marker"`: same data with `classifyOverlap={() => "shared"}` → a and b `data-overlap="shared"`, `aria-label` contains `"Shared occupancy"`, no `.overlapGlyph` anywhere in the region, lanes still `"0"` / `"1"`.
    - `"calls onReservationClick with each overlapping bar's own reservation"`: `user.click(a)` → `onClick` last called with `id === "a"`; `user.click(b)` → `id === "b"` (jsdom is not occlusion-aware — this proves wiring; item 11 proves visibility).
    - `"renders a non-overlapping room at one lane with no overlap attribute"`: `BASE` → the Jane Doe bar has `data-lane="0"` and no `data-overlap`; row `"101"` `data-lane-count="1"`.
  - Blocked by: `classifyOverlap` prop and per-bar overlap kind; Overlap labels in the strings and the default aria template

- [ ] **CSS lane geometry and conflict treatment** — `TapeChart.module.css` turns the variables into per-row height, per-bar offset, and the error-family conflict chrome; single-lane rows stay pixel-identical
  - Accept (`packages/rialto/src/components/TapeChart/TapeChart.module.css`):
    - `.root` (line 3-17) declares `--tapechart-lane-pitch: calc(var(--tapechart-row-height) - var(--tapechart-bar-inset));` after the existing custom properties; `.root[data-density="compact"]` is unchanged (the pitch resolves to 34px there because it is declared on the same element).
    - `.row` `contain-intrinsic-size` (line 234) becomes `auto calc(var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset))`; `content-visibility: auto` and `contain: layout style` stay.
    - `.lane` `min-block-size` (line 239) becomes `calc(var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset))`; its background is unchanged.
    - `.bar`: `inset-block-start: calc(var(--tapechart-bar-inset) + var(--tapechart-bar-lane, 0) * var(--tapechart-lane-pitch));`, new `block-size: calc(var(--tapechart-row-height) - 2 * var(--tapechart-bar-inset));`, and the `inset-block-end` declaration (line 266) is removed. Arithmetic: one lane → row 48/36, lane-0 bar at 3/2 with height 42/32 (today's pixels); two lanes → 93/70; three → 138/104.
    - `.bar[data-blocked="true"]` (line 312-321) hoists its gradient into `--tapechart-blocked-fill: repeating-linear-gradient(…existing five-line gradient, unchanged…)` and sets `background: var(--tapechart-blocked-fill);`.
    - Immediately after `.bar[data-selected="true"]` (line 322-325), in this order:
      ```css
      .bar[data-overlap="conflict"] {
        background: color-mix(in srgb, var(--rialto-error) 10%, var(--rialto-surface-elevated));
        border-color: var(--rialto-error);
        border-inline-start-width: 3px;
      }
      .bar[data-blocked="true"][data-overlap="conflict"] {
        background: var(--tapechart-blocked-fill);
      }
      .overlapGlyph {
        color: var(--rialto-error);
        flex-shrink: 0;
      }
      ```
      No rule for `data-overlap="shared"`. No `box-shadow` in any conflict rule (selection/focus own it). `.roomHeader`, `.todayLine`, the reduced-motion block and everything else are untouched.
    - `git diff packages/rialto/src/components/TapeChart/TapeChart.module.css` adds no colour literal (`#…`, `rgb(`, `hsl(`), no token other than `--rialto-error` / `--rialto-surface-elevated` / `--rialto-space-2xs`, and only logical properties.
  - Test: jsdom cannot compute layout — the proof is the visual suite in item 14: `apps/rialto-web/e2e/visual.spec.ts` `light / tape-chart-default` and `dark / dark-tape-chart` pass against their **unmodified** committed baselines on Linux CI (single-lane geometry unchanged), and the `light-tape-chart-stress` diff is confined to the `room-1003` row. If either unmodified baseline diffs, the lane arithmetic is wrong: fix this item, do not regenerate those two PNGs.
  - Blocked by: Grid, row and bar adapters render lane and overlap

- [ ] **Rialto gates, build and `registry.json` regen** — make the committed registry and the built manifest carry `classifyOverlap`, and leave `packages/rialto` fully green
  - Accept (all from `packages/rialto`):
    - `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0 (`TapeChart.test.tsx`, `defaultStrings.test.ts`, `scripts/all-artifacts.drift.test.ts` included).
    - `pnpm build` (runs `vite build` then `scripts/generate-all.ts`) rewrites `packages/rialto/registry.json`; the TapeChart entry's `props` array now contains `{ "name": "classifyOverlap", "type": "((a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind) | undefined", "required": false, "description": "Decide whether two reservations whose visible spans overlap in one room are a `\"conflict\"` … re-renders every row." }` (description = the JSDoc from item 2, as `getJsDocComment` renders it); `dist/manifest.json` (uncommitted) carries the same prop.
    - `pnpm exports:check` exits 0 (no new component folder, exports map unchanged); `git status --short packages/rialto` shows exactly the TapeChart source/test files, `registry.json`, and nothing under `dist/`.
    - `packages/rialto/package.json` `version` is still `0.2.0`; `.changeset/` untouched.
  - Test: `packages/rialto/scripts/all-artifacts.drift.test.ts` › `"registry.json is byte-identical to committed version"` passes (it fails RED before the build, once item 2's prop exists).
  - Blocked by: CSS lane geometry and conflict treatment

## Milestone 2: the demo surfaces prove it (`apps/rialto-web`, Storybook, Playwright)

Demonstrable when done: the local component page's Overlaps section shows
both charts, every bar in room 201 is clickable in a real browser, and the
visual harness has a `tape-chart-overlaps` section.

- [ ] **Overlap fixture and dorm classifier** — `makeOverlapScenario()` and `classifyDormAsShared(rooms)` in `tapechart-fixtures.ts`, written as literals (never through `makeReservations`)
  - Accept (`apps/rialto-web/src/data/tapechart-fixtures.ts`):
    - `export function makeOverlapScenario(): { rooms: TapeChartRoom[]; reservations: TapeChartReservation[]; startDate: "2026-03-02"; endDate: "2026-03-09" }` (a Monday-start week), returning fresh arrays/objects on every call, with rooms in this order: `{ id: "ov-201", name: "201", category: "Standard", capacity: 2 }`, `{ id: "ov-202", name: "202", category: "Deluxe", capacity: 3 }`, `{ id: "ov-dorm-a", name: "Dorm A", category: "Dorm", capacity: 6 }`, `{ id: "ov-203", name: "203", category: "Standard", capacity: 2 }`, and exactly these nine reservations (`currency: "USD"`, `source: "Direct"`, a `partySize` and `ratePerNight` on each):

      | id     | roomId      | start      | end        | status    | guestName        |
      | ------ | ----------- | ---------- | ---------- | --------- | ---------------- |
      | `ov-a` | `ov-201`    | 2026-03-02 | 2026-03-06 | confirmed | Marisol Vega     |
      | `ov-b` | `ov-201`    | 2026-03-04 | 2026-03-08 | confirmed | Tobias Lindqvist |
      | `ov-c` | `ov-202`    | 2026-03-02 | 2026-03-07 | checkedIn | Harriet Okafor   |
      | `ov-d` | `ov-202`    | 2026-03-03 | 2026-03-06 | tentative | Elias Brandt     |
      | `ov-e` | `ov-202`    | 2026-03-05 | 2026-03-09 | confirmed | Nadia Petrova    |
      | `ov-f` | `ov-dorm-a` | 2026-03-02 | 2026-03-05 | confirmed | Oscar Delacroix  |
      | `ov-g` | `ov-dorm-a` | 2026-03-02 | 2026-03-06 | confirmed | Wren Castellano  |
      | `ov-h` | `ov-dorm-a` | 2026-03-03 | 2026-03-07 | confirmed | Imani Adeyemi    |
      | `ov-i` | `ov-203`    | 2026-03-03 | 2026-03-07 | confirmed | Lucas Moreau     |

      Resulting lanes under the existing sort: 201 → a lane 0, b lane 1; 202 → c 0, d 1, e 2 (all three cover Thu 03-05); Dorm A → f 0, g 1, h 2; 203 → i 0.

    - `export function classifyDormAsShared(rooms: TapeChartRoom[]): (a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind` builds `roomsById` once and returns `(a, _b) => roomsById.get(a.roomId)?.category === "Dorm" ? "shared" : "conflict"` (second parameter underscore-prefixed for the AI-antipattern ratchet). `TapeChartOverlapKind` is imported from `@mattbutlerengineering/rialto`.
    - `makeRooms`, `makeReservations`, `defaultDateRange` and the name pools are unchanged.
  - Test (RED first): `apps/rialto-web/src/data/tapechart-fixtures.test.ts` › new `describe("makeOverlapScenario")`:
    - `"is deterministic and returns fresh objects"`: two calls `toEqual` each other and `not.toBe` each other.
    - `"is well-formed"`: 4 rooms, 9 reservations; every `roomId` exists in `rooms`; reservation ids unique; guest names unique; every `start < end`, `start >= startDate`, `end <= endDate`.
    - `"contains a 3-deep stack"`: for some room and some ISO day in `[startDate, endDate)`, ≥ 3 reservations satisfy `start <= day < end`.
    - `"has both conflict and shared pairs under the dorm rule"`: over every same-room pair with `a.start < b.end && b.start < a.end`, `classifyDormAsShared(rooms)(a, b)` yields at least one `"conflict"` and at least one `"shared"`.
    - `"guest names cannot collide with the playground name pools"`: tokens of every generated `guestName` from `makeReservations(makeRooms(30), "2026-01-01", "2026-04-01", 1)` (seeded, deterministic) form a set; no first or last name of any scenario guest is in it.
  - Blocked by: Rialto gates, build and `registry.json` regen

- [ ] **Component page "Overlaps" section** — second `<Section>` on `TapeChartPage.tsx`, two stacked charts over the fixture, code sample, shared selection card
  - Accept (`apps/rialto-web/src/pages/data/TapeChartPage.tsx`):
    - A `<Section title="Overlaps">` is inserted between `"Interactive playground"` (ends line 161) and `"Responsive behavior"` (line 163), containing in order: (1) `<Text>` with exactly: "Two reservations on one room can overlap. The grid never hides one behind the other — each gets its own lane and the row grows to fit. By default every overlap is treated as a double-booking and drawn in the error family. Pass `classifyOverlap` to tell the chart which overlaps are legitimate in your domain; those simply stack." (`classifyOverlap` in `<code>`); (2) `<Text variant="label">Default — every overlap is a conflict</Text>`; (3) `<Card variant="flat" data-testid="tape-chart-overlaps-default">` wrapping `<TapeChart rooms reservations startDate endDate locale="en-US" currency="USD" density="comfortable" viewMode="grid" onReservationClick={handleReservationClick} selectedReservationId={selectedId} />` with **no** `classifyOverlap`; (4) a flat card with `<pre style={{ margin: 0 }}>` (the `ToastPage.tsx:136` idiom) showing the 6-line classifier sample from ux.md § Demo surfaces; (5) `<Text variant="label">With classifyOverlap — dorm bunks share, private rooms conflict</Text>` (`classifyOverlap` in `<code>`); (6) `<Card variant="flat" data-testid="tape-chart-overlaps-classified">` with identical props plus `classifyOverlap={overlapClassifier}`; (7) when the selected id belongs to the scenario, `<Card variant="elevated" data-testid="tape-chart-overlaps-selection">` showing `{guestName} · {room name}` as `Text variant="label"` and `{start} → {end} · {Double-booked | Shared occupancy | —}` as caption, where the label is derived at render time from the dorm rule (dorm room → "Shared occupancy", any other room with an overlapping sibling → "Double-booked", else "—").
    - Data is memoised once: `const overlap = useMemo(() => makeOverlapScenario(), [])` and `const overlapClassifier = useMemo(() => classifyDormAsShared(overlap.rooms), [overlap.rooms])` (stable references — the prop's JSDoc demands it). The section is pinned to `en-US` / comfortable / LTR and ignores the page's locale/density controls. Selection reuses the page's existing `selectedId` / `handleReservationClick`.
    - `pnpm lint` and `pnpm typecheck` exit 0 in `apps/rialto-web` (rialto built in item 6 so the `.d.ts` carries `classifyOverlap`).
  - Test (RED first): new `apps/rialto-web/src/pages/data/TapeChartPage.test.tsx`, mocking `@mattbutlerengineering/rialto` behaviourally (per `ErrorForbiddenExamplePage.test.tsx`: `Card` passes `data-testid` through; `TapeChart` stub renders `<div data-testid="tapechart-stub" data-reservations={reservations.length} data-classifier={String(typeof classifyOverlap === "function")} />`; `Text`, `Stack`, `SegmentedControl` minimal) and `../components/PropsTable`:
    - `"renders the default and classified overlap charts over the same fixture"`: within `getByTestId("tape-chart-overlaps-default")` the stub has `data-reservations="9"` and `data-classifier="false"`; within `tape-chart-overlaps-classified`, `"9"` and `"true"`.
    - `"shows the classifier usage as code"`: `screen.getByText(/classifyOverlap = \(a, b\) =>/)` is in the document.
  - Blocked by: Overlap fixture and dorm classifier

- [ ] **Storybook `Overlaps` and `OverlapsClassified` stories** — two stories on an inline copy of the overlap fixture (rialto cannot import from the app)
  - Accept (`packages/rialto/src/components/TapeChart/TapeChart.stories.tsx`):
    - Module-level `overlapRooms` / `overlapReservations` literals identical in ids, dates, statuses and guest names to item 7's table, and `const classifyDorm = (a: TapeChartReservation, _b: TapeChartReservation) => overlapRooms.find((r) => r.id === a.roomId)?.category === "Dorm" ? ("shared" as const) : ("conflict" as const);`.
    - `export const Overlaps: Story` with args `{ rooms: overlapRooms, reservations: overlapReservations, startDate: "2026-03-02", endDate: "2026-03-09", currency: "USD", locale: "en-US" }` and a `play` that asserts `canvas.getByRole("button", { name: /Marisol Vega/ })` and `canvas.getByRole("button", { name: /Tobias Lindqvist/ })` are both in the document.
    - `export const OverlapsClassified: Story` with the same args plus `classifyOverlap: classifyDorm`.
    - Existing stories untouched; `pnpm typecheck` and `pnpm lint` in `packages/rialto` exit 0.
  - Test: `pnpm --dir packages/rialto test:storybook` runs the `Overlaps` play function green (local only — not in CI; if the Storybook vitest project cannot start in this environment, record that under Notes and rely on typecheck), plus the typecheck above.
  - Blocked by: Overlap fixture and dorm classifier

- [ ] **Visual-harness section and `visual.spec.ts` entry** — `tape-chart-overlaps` section with the dorm classifier, listed by full id after `tape-chart-stress`
  - Accept:
    - `apps/rialto-web/src/pages/visual-test/TapeChartSections.tsx`: imports `makeOverlapScenario, classifyDormAsShared` from `../../data/tapechart-fixtures`; module-level `const OVERLAP = makeOverlapScenario(); const CLASSIFY_OVERLAP = classifyDormAsShared(OVERLAP.rooms);`; a new `<Section id="tape-chart-overlaps" title="TapeChart — Overlaps">` inserted directly after the `tape-chart-stress` section (line 47), wrapping `<div className={styles.card}><TapeChart startDate="2026-03-02" endDate="2026-03-09" rooms={OVERLAP.rooms} reservations={OVERLAP.reservations} classifyOverlap={CLASSIFY_OVERLAP} currency="USD" density="comfortable" viewMode="grid" onReservationClick={() => {}} /></div>`. No dark overlap section.
    - `apps/rialto-web/e2e/visual.spec.ts` `lightSections` gains `"tape-chart-overlaps"` on the line after `"tape-chart-stress"` (line 58); `darkSections` unchanged.
    - No file named `light-tape-chart-overlaps.png` is committed from this machine: if `visual.spec.ts` is run locally, Playwright writes a macOS baseline into `apps/rialto-web/e2e/screenshots/` — delete it before committing (`gotchas.md` § CI: baselines come only from the Linux artifact, item 14).
  - Test: `apps/rialto-web/e2e/visual.spec.ts` › `light / tape-chart-overlaps` exists and is RED on CI until item 14 lands its baseline; `apps/rialto-web/e2e/workflow-coverage.test.ts` stays green (no new spec file).
  - Blocked by: Overlap fixture and dorm classifier

- [ ] **Playwright occlusion proof** — in a real browser, both overlapping bars in room 201 of the page's default Overlaps chart receive a centre click
  - Accept (`apps/rialto-web/e2e/interaction.spec.ts`, appended):
    ```ts
    test("TapeChart page — overlapping bars are both clickable (no occlusion)", async ({
      page,
    }) => {
      await page.goto("components/tape-chart");
      await page.waitForLoadState("networkidle");
      const chart = page.getByTestId("tape-chart-overlaps-default");
      const card = page.getByTestId("tape-chart-overlaps-selection");
      const first = chart.getByRole("button", { name: /Marisol Vega/ });
      const second = chart.getByRole("button", { name: /Tobias Lindqvist/ });
      await expect(first).toHaveAttribute("data-lane", "0");
      await expect(second).toHaveAttribute("data-lane", "1");
      await expect(first).toHaveAttribute("data-overlap", "conflict");
      await first.click(); // actionability check fails with "intercepts pointer events" if covered
      await expect(card).toContainText("Marisol Vega");
      await second.click();
      await expect(card).toContainText("Tobias Lindqvist");
      const dormBar = page
        .getByTestId("tape-chart-overlaps-classified")
        .getByRole("button", { name: /Oscar Delacroix/ });
      await expect(dormBar).toHaveAttribute("data-overlap", "shared");
    });
    ```
    Locators are scoped to the two `data-testid` cards (the playground chart shares the `"Reservations tape chart"` label); no `force: true`, no `dispatchEvent`.
  - Test: `pnpm exec playwright test --config apps/rialto-web/playwright.config.ts apps/rialto-web/e2e/interaction.spec.ts` (from the repo root, rialto built) passes locally; `interaction.spec.ts` is already in `rialto-web-e2e.yml`'s functional list (line 91), so `Functional (rialto-web)` runs it on the PR.
  - Blocked by: Component page "Overlaps" section

## Milestone 3: generated artifacts, push, and Linux baselines

Demonstrable when done: the draft PR is open with `CI Gate` green, both
`Rialto Web E2E` jobs green, and every changed PNG traceable to a Linux run.

- [ ] **Full gates and llms regen** — both packages green, `llms.txt` / `llms-full.txt` regenerated from committed-clean sources, `pnpm regen --check` clean
  - Accept:
    - `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0 in both `packages/rialto` and `apps/rialto-web` (rialto rebuilt after the last rialto edit).
    - Before regenerating, `git status --short` lists only this feature's files: unrelated prettier-hook reflow is reverted with `git checkout -- <path>` (dirty unrelated sources poison the embedded llms content and CI regenerates from the committed tree).
    - From the repo root: `pnpm build --filter @mbe/cli... && pnpm regen`, then `pnpm regen --check` exits 0. Changed outputs are exactly `llms.txt`, `llms-full.txt`, `packages/rialto/llms.txt`, `packages/rialto/llms-full.txt`, `apps/rialto-web/llms.txt`, `apps/rialto-web/llms-full.txt` (they embed `types.ts`, `useTapeChartLayout.ts`, `tapechart-fixtures.ts`); `packages/rialto-catalog/src/generated-schemas.ts`, `infrastructure/worker/dep-graph.json` and `docs/architecture/dependency-graph.md` are unchanged (no new dependency, no catalog entry) — if any of them moved, something added a dependency it should not have.
  - Test: `pnpm regen --check` exit 0 (RED before regen once item 2/7 sources exist) and the six package test/lint/typecheck runs above.
  - Blocked by: Playwright occlusion proof; Storybook `Overlaps` and `OverlapsClassified` stories; Visual-harness section and `visual.spec.ts` entry

- [ ] **Commit, push, open the draft PR** — one conventional commit series staged by explicit path, pushed to `feat/tape-chart-overlaps`, draft PR against `main` to trigger the Linux visual job
  - Accept:
    - Staged by explicit path only (never `git add -A`): the TapeChart source/test/story/CSS files, `packages/rialto/registry.json`, `apps/rialto-web/src/data/tapechart-fixtures.ts` + test, `TapeChartPage.tsx` + test, `TapeChartSections.tsx`, `e2e/visual.spec.ts`, `e2e/interaction.spec.ts`, the six llms files, and `docs/features/tape-chart-overlaps/breakdown.md`. No `.changeset/`, no `dist/`, no PNG from this machine.
    - Commit message in Conventional Commits form, e.g. `feat(rialto): render TapeChart overlap lanes and classify conflicts`; `git push -u origin feat/tape-chart-overlaps` and the remote SHA verified with `git rev-parse origin/feat/tape-chart-overlaps` (never trust a piped push).
    - `gh pr create --draft --base main --title "feat(rialto): render TapeChart overlap lanes and classify conflicts" --body-file <file>` with the body summarising the three milestones and the test plan; PR base ref is `main`; no auto-merge enabled here (Ship owns that).
    - `gh pr checks <N>` after the run: `CI Gate` = success; `Functional (rialto-web)` = success; `Visual Regression (rialto-web)` = **failure with exactly two failing tests** (`light / tape-chart-overlaps` missing baseline, `light / tape-chart-stress` diff) and `light / tape-chart-default` + `dark / dark-tape-chart` passing; artifact `rialto-web-visual-diffs` uploaded. Any other visual failure is a geometry regression — return to item 5.
  - Test: `gh pr checks <N>` output as above (a `gate-missing` state — no `CI Gate` run at all — is handled per `gotchas.md` § CI by `gh workflow run ci.yml --ref feat/tape-chart-overlaps`, not by re-pushing).
  - Blocked by: Full gates and llms regen

- [ ] **Baseline round-trip from the Linux CI artifact** — commit `light-tape-chart-overlaps.png` (new) and `light-tape-chart-stress.png` (changed) taken from the failing Linux run, never from macOS
  - Accept:
    - `gh run list --workflow rialto-web-e2e.yml --branch feat/tape-chart-overlaps --limit 1` → `gh run download <run-id> -n rialto-web-visual-diffs -D <scratchpad dir>`; the download contains `…/light-tape-chart-overlaps-actual.png` and `…/light-tape-chart-stress-actual.png` (+ `-diff.png`/`-expected.png` for stress) and **no** `light-tape-chart-default-*` or `dark-dark-tape-chart-*` files.
    - Read `light-tape-chart-stress-diff.png` (image) and confirm the highlighted pixels lie only in the `room-1003` row — Daniil Patel (Jan 15–29) and Yuki Singh (Jan 19–21) now both visible, both red, row 93px; `room-1009`'s two bars (Jan 15–21, Jan 23–26) are disjoint and unchanged.
    - Copy the two `-actual.png` files to `apps/rialto-web/e2e/screenshots/light-tape-chart-overlaps.png` and `apps/rialto-web/e2e/screenshots/light-tape-chart-stress.png`; `light-tape-chart-default.png` and `dark-dark-tape-chart.png` keep their committed bytes (`git status` does not list them).
    - Commit `test(rialto-web): refresh tape-chart visual baselines from Linux CI` with exactly those two PNGs, push, and on the new head `gh pr checks <N>` shows `Visual Regression (rialto-web)` = success alongside `CI Gate` and `Functional (rialto-web)` = success.
    - Every checkbox above is now checked; PR remains a draft for Verify/Review/Ship.
  - Test: `apps/rialto-web/e2e/visual.spec.ts` › `light / tape-chart-overlaps`, `light / tape-chart-stress`, `light / tape-chart-default`, `dark / dark-tape-chart` all green on Linux CI (the same actuals are byte-identical across CI retries, so one run is authoritative).
  - Blocked by: Commit, push, open the draft PR

## Design gaps found

None routed back to Architect. Two details the architecture left unnamed
(fixture guest names / room ids, and a test id for the Overlaps selection
card) are fixed above and logged under `assumptions:` — they are test hooks
and literals, not design decisions.

## Notes

<Deviations discovered during Implement get logged here, dated.>
