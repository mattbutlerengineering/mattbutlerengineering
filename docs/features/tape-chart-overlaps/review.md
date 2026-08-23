---
stage: review
run: feature:tape-chart-overlaps
date: 2026-08-21
verdict: SHIP-WITH-FOLLOWUPS
assumptions:
  - "Autorun: no live user input. The skill's step 5 hands severity arbitration to the user; here every grade and every fix/defer call is the reviewer's, recorded for the orchestrator to arbitrate. Nothing was fixed in this pass — the two candidate fixes (F1, F2) both change source, not formatting, so the stage's fix policy forbids them."
  - "CI at head `9073dcbf4` is treated as the authority for the full rialto suite, the Linux visual job and Integrity, rather than re-run locally. Independently re-confirmed: `gh pr checks 4442` reports 0 failing across 40 checks (CI Gate, Integrity, Lint, Typecheck, Test (Node 22), Visual Regression (rialto-web), Functional (rialto-web), ADR compliance, Architecture Audit all pass), and a local targeted `vitest run src/components/TapeChart` gives 54/54."
  - "The five refreshed dark baselines' diff-pixel *locations* (inside the harness's fixed Dialog/Drawer overlays, none inside a TapeChart row) are taken from verification.md's measurement. The CI actuals it compared against are no longer fetched here, so that one claim is accepted rather than re-derived; byte-provenance (two baseline commits only) and the ±1 px image-height deltas were re-verified independently."
  - "F1's clipped-pair ordering scenario is derived from the code (`Math.max(0, rawStart)` at `useTapeChartLayout.ts:102` plus the comparator at `:36`), not from an executed test — `packRoom` is module-private and exercising it in isolation would have meant adding a file to the tree."
---

# Review: Tape chart overlaps — no bar may hide another

## Scope

`git diff main...HEAD` on `feat/tape-chart-overlaps`, head `9073dcbf4`, draft PR #4442 against
`main` — 37 files, 17 commits, +2598/−196. Every file read in full diff form, plus the surrounding
source for the files the diff only partially touches (`TapeChart.module.css`, `TapeChartPage.tsx`,
`tapechart-fixtures.ts`, `interaction.spec.ts`, `tools/cli/src/commands/pack.ts`).

Read first: `verification.md` (16 PASS / 0 FAIL / 1 PENDING-HUMAN, 4 items flagged for a human),
`breakdown.md` § Notes (Implement's 9 deviations), `architecture.md`, `ux.md` § "Geometry and
contract", `prd.md`, `autorun-brief.md`.

Repo lenses applied inline (no subagents dispatched — reviewer dispatches have died on host sleep
here before): `rialto-prop-drift-detector`, `e2e-selector-drift-reviewer`,
`generated-artifact-determinism-reviewer`, `reviewer`, `adr-compliance-reviewer`, plus
`packages/rialto/CLAUDE.md` and `.claude/rules/gotchas.md` §§ Pre-commit, CI, Releases.

## Findings

Six findings in the diff: **0 critical · 0 major · 3 minor · 3 nit**. Two further minor items (F7,
F8) are pre-existing repo defects this run surfaced but did not cause; they are recorded because two
of Verify's four flagged items depend on them.

### F1 — minor: `classifyOverlap`'s documented "earlier start first" does not hold for clipped pairs

- Where: `packages/rialto/src/components/TapeChart/types.ts:118` (the prop's JSDoc, which is also
  what `registry.json:4150` and the component page's Props table publish),
  `useTapeChartLayout.ts:36` (the sort), `:102` (the clip).
- Scenario: window `startDate="2026-03-05"`, `endDate="2026-03-12"` (`dayCount` 7). Reservation X =
  `2026-03-01 → 2026-03-11` in room R: `rawStart -4`, so `startOffset = Math.max(0, -4) = 0`,
  `span 6`. Reservation Y = `2026-03-03 → 2026-03-08` in the same room: `rawStart -2`, so
  `startOffset 0`, `span 3`. Both clip to the same visible start, so the comparator
  `a.startOffset - b.startOffset || a.span - b.span` falls through to span and sorts **Y first**.
  The callback is invoked as `classify(Y.reservation, X.reservation)` — `a.start` is `2026-03-03`,
  `b.start` is `2026-03-01`, i.e. `a` starts _later_ than `b`, which is the opposite of what the
  JSDoc, `architecture.md` § Interfaces ("`a` starts no later than `b`") and `ux.md` § classifyOverlap
  ("with the earlier-starting reservation as `a`") all promise. A consumer classifier that leans on
  the ordering — "`a` is the incumbent booking, `b` is the one that arrived later" is the obvious
  reading — returns the wrong kind for that pair, and `worstOf` then folds the wrong kind onto both
  bars.
- Not caught by the tests: every hook test uses in-window reservations, where the clip is a no-op
  and the promise holds.
- Fix, pick one: (a) order the pair by `reservation.start` at the call site in `packRoom` —
  `const [first, second] = a.reservation.start <= b.reservation.start ? [a, b] : [b, a]` — keeping
  the lane sort untouched; or (b) amend the JSDoc, `architecture.md` and `ux.md` to say "ordered by
  clipped in-view start, ties broken by visible span". (a) honours the published contract, (b) is
  one line of prose in three places plus a regenerated `registry.json`. Either needs a test with a
  pre-window pair.
- Decision: deferred to the orchestrator — it changes a published prop's contract or its docs, which
  is beyond this stage's fix policy.

### F2 — minor: root and package `llms.txt` / `llms-full.txt` lost `useTapeChartLayout` entirely

- Where: `llms.txt`, `llms-full.txt`, `packages/rialto/llms.txt`, `packages/rialto/llms-full.txt`
  (the `<file path=".../useTapeChartLayout.ts">` block in each).
- Scenario: `tools/cli/src/commands/pack.ts:185` sets `const statementsPerFile = 2` and takes the
  first two qualifying top-level statements in source order. The new `type OverlapClassifier`
  (`useTapeChartLayout.ts:11`) and `function worstOf` (`:17`) now occupy both slots, so the file's
  only exported hook — previously carried in full in `llms-full.txt` — is gone, and so is
  `packRoom`, the algorithm this whole feature is about. An agent that reads `llms-full.txt` to
  learn how tape-chart layout works now finds a five-line private fold helper and nothing else.
- **Answering the question Implement raised:** this is generator behaviour, not a hand edit and not
  a determinism problem — the output is deterministic, `pnpm regen --check` is clean, and CI's
  `Integrity` job passes on the head SHA. But the _outcome_ is a real regression in the artifact's
  usefulness, so "generator behaviour" is an explanation, not an acquittal.
- Fix (behaviour-neutral): move `OverlapClassifier`, `CONFLICT_ALWAYS`, `worstOf` and `packRoom`
  below `useTapeChartLayout` in the file, then `pnpm build --filter @mbe/cli... && pnpm regen`.
  Alternatively raise `statementsPerFile`, which is a repo-wide change and out of this run's scope.
- Decision: deferred — a source reorder is not a formatting fix, and it re-writes four generated
  files.

### F3 — minor: the Overlaps selection card reports the classified verdict under both charts

- Where: `apps/rialto-web/src/pages/data/TapeChartPage.tsx:28-42` (`describeOverlap`) and `:255-266`
  (the card, rendered once at the end of the section, after both charts).
- Scenario: on the component page, click **Oscar Delacroix** in the _default_ chart
  (`data-testid="tape-chart-overlaps-default"`), where — by design, since no `classifyOverlap` is
  passed — the bar is drawn red with the conflict glyph and carries `data-overlap="conflict"`.
  `handleReservationClick` sets the shared `selectedId`, and the card underneath reads
  **"Shared occupancy"**, because `describeOverlap` hard-codes the dorm rule. The card contradicts
  the chart the user just clicked, in the one section whose entire job is to show the two policies
  side by side — and this is the page G2 asks the design-system owner to judge.
- Fix: give each chart its own selection state (or its own card), or pass the kind in rather than
  re-deriving it — e.g. lift `selectedOverlapKind` from the clicked chart instead of recomputing
  from the fixture.
- Decision: deferred — demo-page only, no library behaviour; the orchestrator's call whether it
  ships before the owner sees the page.
- **RESOLVED** in `3a0020c34` (`fix(rialto-web): scope each Overlaps chart to its own selection
verdict`), pushed to `feat/tape-chart-overlaps`; PR #4442 all-green on that head, `CI Gate` pass.
  Each chart now owns its own `useState` selection id and renders its own `OverlapSelectionCard`
  directly beneath it. `describeOverlap(selected, reservations, classify?)` takes the classifier the
  chart was actually given — omitted means the component default, where every overlap is a conflict
  — and folds the worst kind over the selected bar's overlapping siblings, so the default chart's
  dorm bar now reads "Double-booked" under the red bar instead of "Shared occupancy", and a click in
  one chart no longer highlights or selects in the other. Test id
  `tape-chart-overlaps-selection` split into `-selection-default` / `-selection-classified`;
  `e2e/interaction.spec.ts` updated in the same commit plus a new spec pinning the two verdicts for
  the same dorm bunk. Four new vitest cases in `TapeChartPage.test.tsx` (RED first: `Unable to find
an element by: [data-testid="tape-chart-overlaps-selection-default"]`). No library change; the
  visual harness (`visual-test/TapeChartSections.tsx`) renders the chart only, never a selection
  card, so no baseline moved — `Visual Regression (rialto-web)` passed unchanged. `ux.md` §
  "Demo surfaces" item 7 updated to describe the per-chart cards.

### F4 — nit: `describeOverlap` calls any dorm reservation "Shared occupancy" even with no overlap

- Where: `apps/rialto-web/src/pages/data/TapeChartPage.tsx:33` — the category check returns before
  the sibling-overlap check at `:34-40`.
- Scenario: add a fourth Dorm A booking to `makeOverlapScenario()` that overlaps nothing (say
  `2026-03-08 → 2026-03-09`). Its bar renders with no `data-overlap` attribute in both charts, yet
  clicking it makes the card read "Shared occupancy" instead of "—". Unreachable with today's pinned
  fixture (all three dorm bars overlap), so there is no user-visible effect on this branch — it is a
  latent trap for whoever extends the fixture.
- Fix: run the sibling check first, then branch on category:
  `if (!hasSibling) return "—"; return isDorm ? "Shared occupancy" : "Double-booked";`
- Decision: deferred with F3 — same function, same commit if either is taken.
- **RESOLVED** incidentally in `3a0020c34` with F3: the rewritten `describeOverlap` filters the
  overlapping siblings first and returns "—" when there are none, so the category no longer
  short-circuits ahead of the overlap check. No fixture change was needed to reach it.

### F5 — nit: the Storybook copy of the overlap fixture has no guard against divergence

- Where: `packages/rialto/src/components/TapeChart/TapeChart.stories.tsx:72-182` duplicates
  `makeOverlapScenario()` (`apps/rialto-web/src/data/tapechart-fixtures.ts:154-273`) verbatim —
  four rooms, nine reservations, every date and rate.
- Scenario: a later PR shifts `ov-e` a day in the app fixture to change the 3-deep stack. The story
  keeps the old dates, silently demonstrates a different scenario, and its `play` assertions still
  pass because they only check two guest names. Nothing goes red.
- The duplication itself is correct and the comment says why (the library cannot import from the
  app). The gap is that nothing enforces the "inline copy" claim.
- Fix if wanted: export the scenario from the library (a `TapeChart/__fixtures__` module the story
  and the app both import), or accept the drift and drop the "inline copy of" wording so no one
  trusts it. Low value either way.
- Decision: deferred.

### F6 — nit: the name-collision guard tests a sample, not the pools

- Where: `apps/rialto-web/src/data/tapechart-fixtures.test.ts:219-232`.
- Scenario: the test builds its "playground pool" from one generation —
  `makeReservations(makeRooms(30), "2026-01-01", "2026-04-01", 1)` — so a `FIRST_NAMES` /
  `LAST_NAMES` entry that this particular seed and window never emit would not be in `pool` and a
  colliding fixture name would pass. `expect(pool.size).toBeGreaterThan(20)` bounds but does not
  close the hole.
- I verified the underlying property holds today: none of the 18 name tokens in
  `makeOverlapScenario()` appears in `FIRST_NAMES` (`tapechart-fixtures.ts:27`) or `LAST_NAMES`
  (`:49`). So the fixture is safe; only the guard is weaker than it reads.
- Fix: export the two arrays (or a derived `NAME_POOL` set) and assert against them directly.
- Decision: deferred.

### F7 — minor (pre-existing, out of scope): `maxDiffPixelRatio: 0.01` cannot see this feature's own glyph

- Where: `apps/rialto-web/playwright.config.ts:13-16`.
- Scenario, in this run's own terms: `light-tape-chart-overlaps.png` is 1232 × 668, so the gate
  tolerates ~8,230 differing pixels. The conflict glyph is 12 × 12 = 144 px per bar; eight
  conflict bars is ~1,152 px. A regression that drops the glyph from every bar in the section —
  the exact non-colour affordance R6 and `ux.md` § "Non-colour perception" exist to protect —
  passes this gate untouched. Implement's evidence for the same tolerance is stronger still: on
  run 32540738717 the stale single-lane `light-tape-chart-stress` baseline _passed_ against a
  render in which room-1003 had grown a whole 45 px lane, and `main`'s stress baseline passed for
  its entire life while being a macOS render with a different first column label.
- Nothing in this diff introduced it, and this run did not lean on it: all seven PNGs were
  byte-verified (`cmp` exit 0) against Linux CI actuals rather than trusted to the tolerance.
- Fix: swap to `maxDiffPixels` with a small absolute budget, or tighten the ratio, and re-run the
  full visual job to find which baselines then need regenerating.
- Decision: follow-up issue (see § Follow-ups).

### F8 — minor (pre-existing, out of scope): the advertised preview URL cannot resolve

- Where: `.github/workflows/preview-deploy.yml:140-146`.
- Scenario: the "Deploy Preview (rialto-web…)" and "Comment Preview URL" jobs both report `pass` on
  PR #4442, and the bot comment advertises `https://mbe-preview-4442-rialto-web.workers.dev`.
  Re-measured here: `dig +short` returns nothing from the local resolver **and** from
  `dig +short @1.1.1.1` — so this is not the LAN DNS sinkhole, the name genuinely does not exist.
  The workflow composes the host by string interpolation with no account subdomain, and a real
  `workers.dev` hostname is `<worker>.<account-subdomain>.workers.dev`; that missing segment is the
  most likely cause, though I did not confirm it against the Cloudflare account.
- Consequence for this run: G2 ("design-system owner views Overlaps on the deployed page") has no
  vehicle short of merging to production or running the dev server locally. That is why Verify
  recorded it PENDING-HUMAN, and the verdict below accepts that.
- Decision: follow-up issue.

## The four items verification.md flagged for a human

| Item                                                                        | Verdict                           |
| --------------------------------------------------------------------------- | --------------------------------- |
| R9 qualified — stress baseline "changes for exactly one reason"             | **Accept**                        |
| Five refreshed dark baselines vs `architecture.md`'s "must pass unmodified" | **Accept** (documented deviation) |
| `maxDiffPixelRatio: 0.01`                                                   | **Follow-up issue** (F7)          |
| G2 pending — owner's yes/no on the deployed page                            | **Accept as PENDING-HUMAN** (F8)  |

**R9 — accept.** The criterion as written cannot be met by construction, and the substitute
evidence is stronger than the criterion. `main`'s baseline renders "Wed 14" as the first column for
`startDate="2026-01-15"` where Linux renders "Thu 15": it was never a Linux artifact, so no
pixel-diff against it can isolate "one reason". A Linux-vs-Linux comparison is impossible because
CI emits an `-actual.png` only for a _failing_ test, and `main`'s stress test passes. What replaces
it is byte-identity with the Linux artifact from run 32543173746 plus a visual read of the intended
change (room-1003 as a 93 px two-lane row, 1004–1007 shifted, 1008 clipped). Re-verified here from
git alone: `light-tape-chart-stress.png` was deleted in `7a4de20b7` and re-added in `9073dcbf4` and
appears in no other commit on the branch, and its dimensions are unchanged at 1232 × 685.

**Five dark baselines — accept as a documented deviation.** The architecture's _intent_ was that a
no-overlap row's geometry is untouched; its chosen _proof_ was that the dark tape-chart baseline
never changes. The intent is independently proven by a better witness that did hold:
`light-tape-chart-default.png` is byte-identical to `main` (`cmp` exit 0, 0 differing pixels) over
the same overlap-free fixture, and the CSS algebra reduces to today's numbers for one lane
(`1 × (48 − 3) + 3 = 48`, `1 × (36 − 2) + 2 = 36`), which I re-derived from
`TapeChart.module.css:10,242-244,271-273`. The proof vehicle failed for a reason the architecture
did not anticipate: the harness renders every section on one page, so inserting
`tape-chart-overlaps` above the dark sections shifts them by a sub-pixel and flips the image height
by ±1 px. Re-measured here from the PNGs themselves — alerts 319→320, avatar 115→116, buttons
113→114, inputs 228→227, tape-chart 640→639 — which is the ±1 px clip cascade documented in gotchas
§ CI, not a geometry change. Residual risk I am accepting rather than re-deriving: the claim that
none of the ~1,496 differing pixels in `dark-dark-tape-chart.png` lands inside a TapeChart row rests
on verification.md's band measurement (see assumptions).
Follow-up worth filing separately: any additive section in the visual harness churns every baseline
below it, so this tax recurs on every future section.

**`maxDiffPixelRatio` — follow-up issue, not a blocker.** Reasoning in F7. It does not block this
ship because the diff neither introduced nor relied on the tolerance.

**G2 — accept as PENDING-HUMAN.** Independently confirmed unreachable (F8). The owner's judgement
is a human act that no stage can substitute; what they will see is pinned in
`light-tape-chart-overlaps.png` (a Linux render, byte-identical to run 32540738717's actual) and in
the Chromium measurements Verify recorded. It closes on merge, when the production deploy of
`rialto-web` puts the section on `mattbutlerengineering.com/rialto/components/tape-chart` — with
F3 noted as something the owner will very likely trip over.

## Passes with no findings

### Correctness — `packRoom` (`useTapeChartLayout.ts:29-73`)

Read line by line against the architecture's contract; no defect found beyond F1.

- **Lane packing** — the greedy first-fit over `laneEnds` after sorting by start is the standard
  interval-graph colouring, and it is optimal here: `laneEnds[i]` only ever advances (a bar is
  placed in lane `i` only when `laneEnds[i] <= bar.startOffset`, and is then set to that bar's
  strictly larger end), so `laneEnds.length` equals the maximum clique — the minimum lane count.
  Two overlapping bars can never share a lane, so the conflict marker is present exactly when the
  stacking is visible, which is the invariant `ux.md` § classifyOverlap depends on.
- **The O(n²) early `break` (`:62`) is sound.** `sorted` is non-decreasing in `startOffset`, so once
  `sorted[j].startOffset >= aEnd`, every later `j` satisfies it too. The secondary `|| a.span - b.span`
  tiebreak does not weaken this: it only reorders bars that already share a `startOffset`, and the
  break condition reads `startOffset` alone. The pair test `b.startOffset < a.startOffset + a.span`
  is the full intersection test given `a.startOffset <= b.startOffset` and `span >= 1`
  (`:104` pins `span = Math.max(1, …)`).
- **Touching is not overlapping.** `laneEnds[i]! <= bar.startOffset` and `b.startOffset >= aEnd`
  both admit equality, so a checkout-day-equals-checkin-day pair shares a lane and is never
  classified — correct end-exclusive hotel semantics, and `TapeChart.test.tsx:130`'s
  reservation `c` — which starts the day `b` ends — is asserted `overlap` undefined at `:140`.
- **`worstOf` (`:17-22`)** folds `conflict > shared > undefined` and compares against the
  `"conflict"` literal exactly, so an out-of-band string from an untyped JS consumer degrades to
  `"shared"` — the quiet direction the architecture specified, and never propagated verbatim into
  the DOM.
- **Clipping and exclusion.** `cancelled` / `noShow` are dropped at `:96` before any bar exists, so
  they can reach neither a lane nor the callback (`TapeChart.test.tsx:179` asserts
  `classify` is never called). Clipped bars keep `clippedStart` / `clippedEnd` untouched.
- **The `classify` memo dependency (`:82`).** `CONFLICT_ALWAYS` is a module-level const, so the
  no-prop path has a stable identity and the memo behaves exactly as on `main`. An inline arrow from
  a consumer recomputes the layout every render; that is documented on the prop itself
  (`types.ts:119-120`) and is a perf note, not a correctness bug. All three demo surfaces pass a
  stable reference — `TapeChartPage.tsx:71` (`useMemo`), `TapeChartSections.tsx:14` (module const),
  `TapeChart.stories.tsx:184` (module const).
- **Immutability.** `bars.slice().sort()` (`:36`) sorts a copy — the mutating in-place
  `assignLanes` of `main` is gone — and `:70` returns fresh `{...bar, lane, overlap}` objects. The
  consumer's `TapeChartReservation` is referenced by identity, never copied, which is what the
  contract promises the callback receives. `TapeChart.test.tsx:106` guards both halves.
- **Empty and single-bar rooms** yield `laneCount 1` via `Math.max(1, laneEnds.length)`; the
  `lanes` / `kinds` arrays are both indexed by `sorted` position, so `:70`'s zip is aligned.

### Design — components, CSS, contracts

- `TapeChartRow` memo comparator includes `laneCount` (`TapeChartRow.tsx:99`); `TapeChartGrid.tsx:80`
  feeds it `layout.laneCountByRoom.get(room.id) ?? 1`. `TapeChartRow` has exactly one caller, so the
  now-required prop breaks nothing.
- `TapeChartBar` sets `--tapechart-bar-lane` alongside the existing `--tapechart-bar-start` /
  `-span` in the same idiom, and `data-lane` / `data-overlap` match the DOM contract in both
  `ux.md` § DOM attributes and `architecture.md` § Row and bar DOM contract. `data-overlap={bar.overlap}`
  relies on React dropping `undefined` — verified in DOM by `TapeChart.test.tsx:339` and in the
  browser by Verify.
- `conflictGlyph` is a module-level element (`TapeChartBar.tsx:46-64`), hand-rolled SVG per the
  Banner idiom, `aria-hidden="true"` — correct, since the meaning is carried by the accessible name.
  12 × 12, first flex child, as `ux.md` § "The conflict glyph" specifies.
- `index.ts` exports `TapeChartOverlapKind` as a type; `registry.json`'s extra zero-prop entry for
  it matches how `TapeChartPositionedBar` and `TapeChartLayout` already appear — generator
  behaviour, not a new class.
- `defaultStrings.ts` deep-merges `overlapLabels` exactly as `statusLabels` / `roomStatusLabels`
  do, and `ResolvedStrings` gains it in the `Required<Pick<…>>` union. The aria template pushes
  `fmt.overlapLabel` immediately after `fmt.statusLabel` and before `via <source>` — the ordering
  `ux.md` § "Accessible text" specifies, asserted verbatim by
  `defaultStrings.test.ts:126-142` ("Tentative, Double-booked, via Direct, $360") including the
  silent case.
- **CSS geometry checks out at both densities.** `--tapechart-lane-pitch` is declared on `.root`
  (`:10`) where `--tapechart-row-height` and `--tapechart-bar-inset` are also declared, so
  `.root[data-density="compact"]`'s overrides resolve into it at computed-value time — Verify
  measured `calc(36px - 2px)` in compact, confirming this empirically rather than by spec reading.
  Lane `min-block-size` and `contain-intrinsic-size` share one formula, so an off-screen row's
  placeholder equals its rendered height at every lane count (measured `auto 93px` / `auto 138px` /
  `auto 48px`).
- **Rule ordering and compounds.** `.bar[data-overlap="conflict"]` (`:334`) sits after
  `.bar[data-selected="true"]` (`:330`) at equal specificity, so conflict takes `border-color` while
  selection keeps `box-shadow` — exactly the composition table in `ux.md`. `:focus-visible` (`:296`)
  sets only `outline` / `box-shadow` / `z-index`, none of which conflict touches, so the gold focus
  ring survives. `.bar[data-blocked="true"][data-overlap="conflict"]` (`:339`) at (0,3,0) restores
  the hatch while the (0,2,0) conflict rule keeps the red border and edge — the hoist of the
  gradient into `--tapechart-blocked-fill` is one of the two implementations `ux.md` explicitly
  authorised.
- **RTL and tokens.** Every property the diff adds is logical (`inset-block-start`, `block-size`,
  `min-block-size`, `border-inline-start-width`); the only colours are `var(--rialto-error)` and
  `var(--rialto-surface-elevated)`. No new `--rialto-*` token, no colour literal, no dependency, no
  `package.json` or lockfile in the diff — R7 re-verified independently.
- **No `setState` in `useEffect`** anywhere in the diff (the rialto pre-commit ban); no new
  `useEffect` at all.
- **`prop-drift` lens:** the diff only _adds_ to `TapeChartProps`, `TapeChartStrings`,
  `TapeChartFormattedParts` and `TapeChartPositionedBar` — nothing removed or renamed — so no
  existing test, story, or `component-fixtures.tsx` entry can have drifted. `TapeChartOverlapKind`
  is a type-only barrel export, invisible to the `BarrelExportName` runtime guard.
- **ADR lens:** no active ADR is engaged. ADR-001 — CSS Modules and `--rialto-*` tokens only, and
  the one new inline style (`TapeChartPage.tsx:223-229`) uses `var(--rialto-font-mono)` /
  `var(--rialto-text-xs)` where tokens exist and raw values only where none does (`margin: 0`,
  `overflowX`). ADR-013 does not apply: TapeChart is not a curated catalog component (no
  `TapeChart.catalog.ts`, no entry in `generated-schemas.ts`), which is also why that file is
  correctly absent from the diff. ADR-024 — the fixture speaks ISO `yyyy-mm-dd` strings throughout.
  ADR-025 — no motion added. CI's "ADR compliance" job passes.

### Correctness — demo surfaces, fixtures, E2E

- **Fixture determinism.** `makeOverlapScenario()` returns literals with pinned dates and fresh
  objects per call (`toEqual` + `not.toBe` at both the container and element level). The window
  `2026-03-02 → 2026-03-09` is in the past, so `todayOffset` is `null` and no today-line ever
  renders into a baseline. `TapeChartSections.tsx:13-14` hoists both the scenario and the classifier
  to module scope, so the harness render is referentially stable.
- **`e2e-selector-drift` lens: clean.** Both bar locators are scoped to a `data-testid` container
  (`tape-chart-overlaps-default`, `tape-chart-overlaps-classified`), which is exactly what the two
  charts sharing one fixture requires — an unscoped `/Marisol Vega/` would be a strict-mode
  collision. The selection card is a third distinct testid with a single instance. Guest names are
  pinned fixture literals, not generated or copy-derived, and the fixture test proves they cannot
  collide with the playground pool. No route mocks exist or are needed — this is a static showcase
  page, so there is no stateful-mock gap class here. `page.goto("components/tape-chart")` plus
  `waitForLoadState("networkidle")` matches the file's five existing tests verbatim.
- **No id collision** between the two fixtures on the shared `selectedId`: playground ids are
  `res-room-<n>-<cursor>` (`tapechart-fixtures.ts:131`), overlap ids are `ov-*`. Clicking in one
  section cleanly hides the other's card.
- **Playwright title stability.** No new spec _file_ was added, so
  `apps/rialto-web/e2e/workflow-coverage.test.ts` (which fails if any `e2e/*.spec.ts` is missing
  from `rialto-web-e2e.yml`'s explicit file list) is unaffected — `interaction.spec.ts` was already
  wired in. The `-g "TapeChart page"` filter Verify used is a local convenience; CI runs the whole
  file by path, so the title is not load-bearing.
- **`_b` convention** — `classifyDormAsShared` (`tapechart-fixtures.ts:280`), the story's
  `classifyDorm` (`TapeChart.stories.tsx:184`) and the rendered code sample
  (`TapeChartPage.tsx:22`) all use `_b`, which is what `scripts/check-ai-antipatterns.mjs`'s
  `unusedParams` ratchet requires; that job passes on the head SHA. `&apos;` — no apostrophe was
  introduced into JSX text (the new prose uses none), so `react/no-unescaped-entities` is not
  engaged; Lint passes.
- **`.overlapGlyph` in `querySelector`** is safe here, not a CSS-module false-pass:
  `packages/rialto/vitest.config.ts:30-34` sets `css.modules.classNameStrategy: "non-scoped"`
  deliberately, so the module class name is the literal.

### Generated artifacts

`generated-artifact-determinism` lens run in full. `tools/cli/src/commands/pack.ts` is not in the
diff and still uses the byte-order comparator `(a, b) => (a < b ? -1 : a > b ? 1 : 0)` — no
`localeCompare`, no bare `.sort()`. No `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`
change, so no dep-graph regeneration is owed and `dep-graph.json` / `dependency-graph.md` are
correctly absent. No package added or deleted, so `scripts/regen-manifest.mjs` needs no entry.
`registry.json`'s two additions are both faithful to source. Staleness is settled by CI's `Integrity`
job passing on `9073dcbf4` plus Verify's clean `pnpm regen --check`. The only substantive issue is
F2, which is a content-quality regression rather than drift.

### PNG provenance

All seven changed PNGs are accounted for. `git log --name-status main..HEAD` on the screenshots
directory shows them in exactly two commits and nowhere else: `7a4de20b7` (five dark modifications,
`light-tape-chart-overlaps` added, `light-tape-chart-stress` deleted) and `9073dcbf4`
(`light-tape-chart-stress` re-added). No `-actual`, `-diff` or `-expected` file appears anywhere in
`git diff --name-only main...HEAD`, and `git status --porcelain` shows no stray PNG in the working
tree after all local test runs. Dimensions re-measured against `main` corroborate the ±1 px clip
story rather than a geometry change (see the dark-baseline verdict above). I cannot compare images
semantically; the byte-identity to CI actuals recorded under B4 is the evidence that stands.

### Security

Nothing user-input-bearing in the diff, and no boundary is crossed.

- `classifyOverlap` is synchronous consumer code called inside `useMemo`; a throw propagates and
  crashes the render. That is stated and accepted in `architecture.md` § Interfaces ("a throw
  propagates out of the `useMemo` and crashes the render — … like `reservationAriaTemplate`, and is
  not caught"), and it matches how the component already treats every other consumer callback. No
  `try`/`catch` was added, so there is no swallowed-error path either. It is not reachable from
  library-internal code: `CONFLICT_ALWAYS` cannot throw.
- All new strings reach the DOM as text through React (`aria-label` via template literal, the code
  sample as `<pre>` children). No `dangerouslySetInnerHTML`, no `innerHTML`, no URL construction.
- No secrets, tokens, env reads, or network calls in the diff. Gitleaks and CodeQL pass.
- Fixture PII: nine invented guest names, room numbers, party sizes and integer rates. No email,
  phone, address, card, or anything resembling a real person's record.

### Scope discipline

No drive-by edits. Every one of the 37 files maps to a breakdown item: the seven rialto TapeChart
sources to milestone 1, the four demo/e2e files to milestone 2, `registry.json` + four `llms*` files
to items 6 and 12, the seven PNGs to item 14, the six `docs/features/` files to the run record item
13 explicitly stages. `a93a5f167` ("prettier-format the tape-chart-overlaps run record") touches
only the four run-record docs. The one refactor inside the diff — hoisting the blocked gradient into
`--tapechart-blocked-fill` — is required by the compound rule and is the exact form
`architecture.md` § CSS plan proposed. Every breakdown checkbox is ticked (`grep -c "\[ \]"` → 0).
`.changeset/` is untouched, which is not an omission: `autorun-brief.md:102`, `prd.md:166`,
`architecture.md:382` and `breakdown.md:124` all place publishing out of scope for this run.

## Follow-ups (not blockers)

- Tighten the rialto-web visual gate — `maxDiffPixelRatio: 0.01` cannot see a 45 px row growth on
  the stress section, a wrong-platform baseline, or this feature's own conflict glyph disappearing.
  Prefer an absolute `maxDiffPixels`.
- Fix the preview URL the deploy-preview workflow advertises — it reports success while publishing
  a hostname that resolves nowhere, which is what left G2 with no vehicle.
- Restore `useTapeChartLayout` to the packed `llms*` artifacts (F2), by declaration order or by
  raising `statementsPerFile`.
- Reconcile the `classifyOverlap` ordering contract with the clipped case (F1).
- Author a changeset for `classifyOverlap` when rialto is next published — deliberately out of scope
  here, but the prop is a public API addition and six changesets are already pending, so it would
  otherwise ship with no changelog line.
- Consider whether the single-page visual harness should be split, so an additive section stops
  churning every baseline below it.

## Verdict

**SHIP-WITH-FOLLOWUPS.** No critical and no major finding: the library change is correct — lane
packing is optimal, the early `break` is sound, the fold is worst-wins, nothing is mutated, the
single-lane geometry is provably pixel-identical, and the conflict state is perceivable on four
independent channels. CI is green on the head SHA across all 40 checks including `CI Gate`,
`Integrity` and both Linux visual jobs, and all seven baselines are Linux-provenanced. The six
in-diff findings are two contract/doc mismatches (F1, F2), two demo-page inaccuracies (F3, F4) and
two weak-guard nits (F5, F6); none breaks `main`, ships a defect to a consumer, or changes rendered
library behaviour. F3 is the
one an evaluator is most likely to trip over on the very page G2 asks them to judge, so it is worth
the orchestrator's decision before merge rather than after.
