---
stage: verify
run: feature:tape-chart-overlaps
date: 2026-08-21
assumptions:
  - 'The stress-baseline criterion (''changes for exactly one reason — room-1003'') is read as ''the only code-caused change is room-1003''. The committed baseline on `main` was not a Linux render (its first column reads ''Wed 14'' for `startDate="2026-01-15"`; Linux renders ''Thu 15''), so a pixel-for-pixel ''one reason'' comparison against `main` is impossible by construction. The verdict rests on the visible room-1003 change plus byte-identity with the Linux CI artifact.'
  - "Full-suite rialto failures whose files pass in isolation with `--testTimeout=120000` are treated as the CPU-contention flake described in gotchas § CI, as the autorun brief instructs, and both results are reported."
  - "The deployed-page criterion (design-system owner's yes/no on the live 'Overlaps' section) is recorded PENDING-HUMAN, not PASS: the PR is an unmerged draft and the PR-preview host in the bot comment (`mbe-preview-4442-rialto-web.workers.dev`) does not resolve from the public resolver (`curl: (6) Could not resolve host`; `dig @1.1.1.1` returns nothing)."
  - "PRD open question 'does `dark-dark-tape-chart.png` use the default fixture?' is answered here: yes — `DarkModeSection.tsx:97-108` renders `tapeChartDefaultReservations`, the same overlap-free fixture as `light-tape-chart-default`."
---

# Verification: Tape chart overlaps — no bar may hide another

## Summary

Verified against PR #4442 (draft, head `9073dcbf4`, base `main`, `mergeStateStatus: CLEAN`) on
branch `feat/tape-chart-overlaps`, 2026-08-21.

**16 PASS (one qualified) · 0 FAIL · 1 PENDING-HUMAN** across the 17 PRD success criteria; all
4 extra breakdown acceptance criteria PASS. The primary criterion — no bar can hide another, and a
conflict reads as a conflict — is demonstrated at three levels: jsdom DOM assertions, a real-Chromium
Playwright click on each bar of an overlapping pair, and a pixel-level pass of the Linux CI visual
job. Nothing routes back to Implement. Two items need a human eye before Review: the qualified
stress-baseline verdict (the previous baseline was a non-Linux render) and the refreshed dark
baselines, which `architecture.md` said must pass unmodified.

No source, test, or PNG was modified during verification; `git status` shows only this file and a
pre-existing untracked `docs/fixes/e2e-behind-edge-csp/`.

## Criteria & evidence

### R1. Both overlapping `<button>` bars are in the DOM with differing lane values

- Check: `pnpm --dir packages/rialto exec vitest run src/components/TapeChart` and the assertions in
  `TapeChart.test.tsx` › `<TapeChart /> rendering`.
- Evidence:

  ```
   ✓ src/components/TapeChart/defaultStrings.test.ts (25 tests) 20ms
   ✓ src/components/TapeChart/TapeChart.test.tsx (29 tests) 1210ms
   Test Files  2 passed (2)
        Tests  54 passed (54)
  ```

  `TapeChart.test.tsx:328` "renders overlapping bars in distinct lanes with a conflict marker by
  default":

  ```ts
  expect(a).toHaveAttribute("data-lane", "0");
  expect(b).toHaveAttribute("data-lane", "1");
  ```

  Real browser (scratch Playwright script against the local dev server, Overlaps section, room 201):
  `Marisol Vega lane '0' top 1405.7 bottom 1447.7` · `Tobias Lindqvist lane '1' top 1450.7 bottom 1492.7`
  — vertical extents are disjoint.

- Result: PASS

### R2. In a real browser, clicking each overlapping bar invokes `onReservationClick` — neither occluded

- Check: `pnpm exec playwright test e2e/interaction.spec.ts -g "TapeChart page"` in
  `apps/rialto-web` (rialto rebuilt first; dev server on :5173); CI job `Functional (rialto-web)`;
  `document.elementFromPoint` at each bar's centre.
- Evidence:

  ```
  Running 1 test using 1 worker
    ✓  1 [chromium] › e2e/interaction.spec.ts:73:1 › TapeChart page — overlapping bars are both clickable (no occlusion) (1.6s)
    1 passed (2.1s)
  ```

  CI run 32544530839 (head `9073dcbf4`) › `Functional (rialto-web)`: `56 passed (1.9m)`,
  conclusion `success`.

  `elementFromPoint(centre)` is the bar itself for all 9 bars in the default chart and all 9 in the
  classified chart (`hitAtCentreIsThisBar: true` × 18). jsdom wiring:
  `TapeChart.test.tsx:365` "calls onReservationClick with each overlapping bar's own reservation"
  clicks `/Ines Duarte/` then `/Kofi Mensah/` — passed.

- Result: PASS

### R3. A 3-deep room renders three lanes; its row grows, other rows do not (per-row, not global)

- Check: row `data-lane-count` and `getBoundingClientRect().height` in Chromium, Overlaps section.
- Evidence:

  ```
  room      laneCount  height  containIntrinsicSize
  '201'     '2'        94      'auto 93px'
  '202'     '3'        139     'auto 138px'
  'Dorm A'  '3'        139     'auto 138px'
  '203'     '1'        49      'auto 48px'
  playground rows 1000/1001/1002 (no overlaps): laneCount '1', height 49
  ```

  (Heights include the row's 1 px `border-block-end`; 48 + 45 = 93, 48 + 2 × 45 = 138.)
  Bars in 202: `Harriet Okafor lane 0`, `Elias Brandt lane 1`, `Nadia Petrova lane 2`. Hook:
  `TapeChart.test.tsx:159` "folds a mixed 3-deep stack worst-wins per bar" asserts
  `laneCountByRoom.get("r1") === 3`.

- Result: PASS

### R4. No `classifyOverlap` → every overlapping bar carries a conflict marker; non-overlapping bars do not

- Check: `TapeChart.test.tsx:328-349`; browser attribute read on the default chart.
- Evidence:

  ```ts
  expect(a).toHaveAttribute("data-overlap", "conflict");
  expect(b).toHaveAttribute("data-overlap", "conflict");
  expect(c).not.toHaveAttribute("data-overlap");
  ```

  Browser, default chart: 8 overlapping bars `overlap: 'conflict'`; `Lucas Moreau` (room 203, no
  overlap) `overlap: null`.

- Result: PASS

### R5. `classifyOverlap` → `"shared"` stacks without the marker, `"conflict"` keeps it; called only for overlapping pairs

- Check: hook tests `TapeChart.test.tsx:141,159,179`; DOM test `:352`; browser read of the classified
  chart.
- Evidence:

  ```
  ✓ invokes classifyOverlap once per overlapping pair, earlier start first
  ✓ folds a mixed 3-deep stack worst-wins per bar
  ✓ never passes cancelled or no-show reservations to classifyOverlap
  ✓ stacks shared overlaps without the conflict marker
  ```

  `:152 expect(classify).toHaveBeenCalledWith(reservations[0], reservations[1]);`
  `:356-362 data-overlap "shared" on both bars, aria-label contains "Shared occupancy", no .overlapGlyph in the region`.
  Browser, classified chart: Dorm A bars `Oscar Delacroix / Wren Castellano / Imani Adeyemi` all
  `overlap: 'shared'`; rooms 201 and 202 stay `'conflict'`.

- Result: PASS

### R6. Conflict state is detectable without colour (accessible name/description and markup)

- Check: aria-label and markup assertions; browser aria-label read.
- Evidence:

  ```ts
  expect(a.getAttribute("aria-label")).toContain("Double-booked");
  expect(a.querySelector(".overlapGlyph")).not.toBeNull();
  ```

  `defaultStrings.test.ts:135 expect(result).toContain("Tentative, Double-booked, via Direct, $360");`
  Browser aria-label: `'Marisol Vega, 201, Sunday, March 1, 2026 to Thursday, March 5, 2026, 4 nights, 2 guests, Confirmed, Double-booked, via Direct, $720.00'`;
  shared variant carries `Shared occupancy`. Markup: `data-overlap` on the button, `data-lane-count`
  on the row.

- Result: PASS

### R7. Conflict treatment uses only existing tokens/idioms — no new token, colour literal, or dependency

- Check: `git diff main...HEAD -- TapeChart.module.css` scanned for colour literals and token
  definitions; `git diff --name-only main...HEAD` scanned for `package.json` / lockfile.
- Evidence:

  ```
  added colour literals (#hex / rgb / hsl / oklch): (no added color literals)
  added --rialto-* references:  3 var(--rialto-error   1 var(--rialto-surface-elevated
  added --rialto-* definitions: (none)
  package.json / pnpm-lock.yaml in diff: (none)
  ```

  `.bar[data-overlap="conflict"] { background: color-mix(in srgb, var(--rialto-error) 10%, var(--rialto-surface-elevated)); border-color: var(--rialto-error); border-inline-start-width: 3px; }`
  — `--rialto-error` is defined at `tokens/colors.css:49` (dark `:95`).

- Result: PASS

### R8. A no-overlap room renders at today's height in both densities; `light-tape-chart-default.png` passes unmodified

- Check: `cmp` of the baseline against `main`; computed geometry in Chromium in both densities; CSS
  algebra for the single-lane case.
- Evidence:

  ```
  cmp main:light-tape-chart-default.png HEAD:light-tape-chart-default.png → IDENTICAL (cmp exit 0)
  pngdiff: 1232x639 vs 1232x639, differing pixels: 0 (0.000%)
  CI run 32544530839 › Visual Regression (rialto-web): 49 passed (1.4m)
  ```

  Chromium, playground (overlap-free), single-lane rows:

  ```
  comfortable: rowHeightVar '48px', lanePitchVar 'calc(48px - 3px)', rowHeaderHeight 48, barHeight 42, row 49 (48 + 1px border)
  compact:     rowHeightVar '36px', lanePitchVar 'calc(36px - 2px)', rowHeaderHeight 36.640625, barHeight 32, row 37.640625
  ```

  `.lane { min-block-size: calc(var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset)) }`
  resolves to 1 × (48 − 3) + 3 = 48 px and 1 × (36 − 2) + 2 = 36 px — the same values `main`'s
  `min-block-size: var(--tapechart-row-height)` produced. The compact row's 36.64 px is the
  two-line room header's content height (`rowHeaderHeight 36.640625`) exceeding the 36 px floor; the
  diff touches no `.roomHeader`, font-size, or line-height rule, so that floor is unchanged from
  `main`. Bar height 42 / 32 = `row-height − 2 × inset`, as before.

  **Deviation, not a criterion failure:** `dark-dark-tape-chart.png` (same overlap-free fixture,
  `DarkModeSection.tsx:97-108`) _is_ in `git diff --name-only main...HEAD`, contrary to
  `architecture.md` § Test strategy ("must pass unmodified"). Measured: `main 1184x640 → HEAD 1184x639`;
  after aligning for the 1 px shift, 1,496 px (0.2 %) differ, all inside the harness's fixed
  Dialog/Drawer overlays and the header text (bands `rows 80-84`, `182-190`, `236-402 x=[268,831]`),
  none in a TapeChart row. Same ±1 px clip mechanism as gotchas § CI, triggered by the new
  `tape-chart-overlaps` section sitting above every dark section. Four other dark baselines
  (`alerts`, `avatar`, `buttons`, `inputs`) changed by the same ±1 px. All five are byte-identical to
  run 32540738717's `*-actual.png`, and that run's `*-expected.png` is byte-identical to `main`'s
  committed files.

- Result: PASS (PRD names only `light-tape-chart-default.png`; the dark-baseline deviation is flagged
  for Review)

### R9. `light-tape-chart-stress.png` changes only for room-1003, new baseline from a Linux CI artifact

- Check: `cmp` against the downloaded `rialto-web-visual-diffs` artifact; visual read of both PNGs;
  commit provenance.
- Evidence:

  ```
  gh run download 32543173746 -n rialto-web-visual-diffs → visual-light-tape-chart-stress-chromium/light-tape-chart-stress-actual.png
  cmp HEAD:light-tape-chart-stress.png <artifact actual> → IDENTICAL
  run 32543173746: headSha 7a4de20b7, workflow "Rialto Web E2E", conclusion failure (stress baseline absent by design)
  commit 9073dcbf4 "test(rialto-web): regenerate tape chart stress baseline from Linux CI" — Bin 0 -> 69452 bytes
  ```

  HEAD PNG (viewed): room 1003 is a two-lane row — `Daniil Patel` (lane 0) and `Yuki Singh` (lane 1)
  both drawn with the warning glyph and red edge; rows 1004–1007 shifted down one lane pitch; 1008
  clipped. `main`'s PNG (viewed): 1003 single lane, `Yuki Singh` hidden; first column **"Wed 14"**
  for `startDate="2026-01-15"`, whereas HEAD's reads **"Thu 15"** — so the old baseline was not a
  Linux render (see assumptions). Pixel comparison against `main` is therefore dominated by
  platform rendering, not by this change: `histogram of max-channel delta: 0 → 24,738 · 1-2 → 401,372 · 3-8 → 85,763 · 9-32 → 305,236 · >32 → 26,811`.
  The same run's `light / tape-chart-default` and `dark / dark-tape-chart` were green.

- Result: PASS (qualified — the column-label change is the prior baseline's provenance defect, not
  a code-caused change; human judgement invited)

### R10. A DOM-level test proves lane rendering; the hook-only test at `TapeChart.test.tsx:90` is supplemented

- Check: test inventory in `TapeChart.test.tsx`.
- Evidence:

  ```
   90:  it("assigns overlapping reservations to separate lanes", () => {           ← kept (hook)
  328:  it("renders overlapping bars in distinct lanes with a conflict marker by default", () => {
  352:  it("stacks shared overlaps without the conflict marker", () => {
  365:  it("calls onReservationClick with each overlapping bar's own reservation", async () => {
  375:  it("renders a non-overlapping room at one lane with no overlap attribute", () => {
  ```

  `:343 expect(row101).toHaveAttribute("data-lane-count", "2");` `:345 … "102" … "1"`.

- Result: PASS

### R11. Rows keep `content-visibility: auto` with variable heights

- Check: computed style on rows in Chromium; CSS source.
- Evidence:

  ```
  contentVisibility 'auto' on every row; containIntrinsicSize 'auto 93px' (2 lanes), 'auto 138px' (3 lanes), 'auto 48px' (1 lane)
  ```

  `.row { content-visibility: auto; contain-intrinsic-size: auto calc(var(--tapechart-lane-count, 1) * var(--tapechart-lane-pitch) + var(--tapechart-bar-inset)); }`
  — the placeholder size now tracks the row's own lane count, so off-screen rows reserve the correct
  height rather than a fixed 48 px.

- Result: PASS

### R12. `classifyOverlap` appears in the component page's Props table with a description

- Check: committed `registry.json`, built `dist/manifest.json`, and the rendered table in Chromium.
- Evidence:

  ```
  registry.json:4150  "name": "classifyOverlap",
                     "type": "((a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind) | undefined",
                     "required": false,
                     "description": "Decide whether two reservations whose visible spans overlap in one room are\na `\"conflict\"` …"
  dist/manifest.json (after `pnpm --dir packages/rialto build`, registry.json unchanged → tree clean): same entry
  Rendered page: Props-table rows matching classifyOverlap: 1
    row text: classifyOverlap ((a: TapeChartReservation, b: TapeChartReservation) => TapeChartOverlapKind) — Decide whether two reservations whose visible spans overlap in one room are a `"conflict"` (double-booking, drawn in the error family) or `"shared"` …
  ```

- Result: PASS

### D1. Fixtures emit deterministic overlap cases (conflict pair, shared pair, 3-deep) with tests

- Check: `pnpm --dir apps/rialto-web test` › `tapechart-fixtures.test.ts`.
- Evidence:

  ```
   ✓ src/data/tapechart-fixtures.test.ts (29 tests) 329ms
  ```

  `makeOverlapScenario` › "is deterministic and returns fresh objects" (`toEqual` + `not.toBe`),
  "is well-formed", "contains a 3-deep stack" (`expect(deepest).toBeGreaterThanOrEqual(3)`), "has both
  conflict and shared pairs under the dorm rule" (`kinds.has("conflict")` and `kinds.has("shared")`),
  "guest names cannot collide with the playground name pools". Fixture: rooms `ov-201` (2 bars),
  `ov-202` (3 bars), `ov-dorm-a` (3 bars), `ov-203` (1 bar).

- Result: PASS

### D2. Component page has a dedicated "Overlaps" section showing both states with the callback's usage visible

- Check: `TapeChartPage.tsx`, `TapeChartPage.test.tsx`, and the live page in Chromium.
- Evidence:

  ```
  TapeChartPage.tsx:197  <Section title="Overlaps">
                  :207  <Card variant="flat" data-testid="tape-chart-overlaps-default">
                  :238  <Card variant="flat" data-testid="tape-chart-overlaps-classified">
                  :250  classifyOverlap={overlapClassifier}
                  :255  <Card variant="elevated" data-testid="tape-chart-overlaps-selection">
   ✓ src/pages/data/TapeChartPage.test.tsx (2 tests): renders the default and classified overlap charts over the same fixture; shows the classifier usage as code
  ```

  Chromium: both test-ids present, 9 bars each; default chart all-conflict, classified chart Dorm A
  shared. Code sample `OVERLAP_CLASSIFIER_SAMPLE` rendered (`(a, _b) =>`, per breakdown note).

- Result: PASS

### D3. Storybook story exercises overlaps; visual-test section exists and is listed by full id in `visual.spec.ts`

- Check: story and spec sources; CI visual jobs.
- Evidence:

  ```
  TapeChart.stories.tsx:257  export const Overlaps: Story   (play asserts buttons /Marisol Vega/ and /Tobias Lindqvist/)
                       :273  export const OverlapsClassified: Story   (classifyOverlap: classifyDorm)
  TapeChartSections.tsx:55   <Section id="tape-chart-overlaps" title="TapeChart — Overlaps">   (classifyOverlap={CLASSIFY_OVERLAP})
  visual.spec.ts:59          "tape-chart-overlaps",   (lightSections, after "tape-chart-stress")
  e2e/screenshots/light-tape-chart-overlaps.png  1232x668, byte-identical to run 32540738717's actual
  CI: Visual Regression (rialto-web) 49 passed · Visual Regression (Storybook) SUCCESS
  ```

- Result: PASS (story play functions were not executed locally — see Not verified)

### G1. Existing tests pass; `pnpm lint`, `pnpm typecheck`, `pnpm test` green in both packages

- Check: run serially from each package directory (gotchas § Build).
- Evidence:

  ```
  packages/rialto  lint:      ✖ 157 problems (0 errors, 157 warnings)        exit 0
  packages/rialto  typecheck: tsc --noEmit                                  exit 0
  packages/rialto  test (full, 556 s): Test Files 6 failed | 132 passed (138); Tests 105 failed | 2047 passed | 4 skipped (2156)   exit 1
      failure classes (junit.xml): 84 × "Axe is already running" cascade, 22 × 5 s timeout; files:
      a11y-matrix (85), generate-manifest (9), generate-registry (5), component-metadata (3), generate-exports (3), all-artifacts.drift (1)
      — no TapeChart file among them
  packages/rialto  re-run of exactly those 6 files, --testTimeout=120000: Test Files 6 passed (6); Tests 124 passed (124); 15.63 s   exit 0
  packages/rialto  TapeChart files alone: 54 passed (54)                                                                            exit 0
  apps/rialto-web  lint:      ✖ 149 problems (0 errors, 149 warnings)        exit 0
  apps/rialto-web  typecheck: tsc --noEmit                                  exit 0
  apps/rialto-web  test: Test Files 1 failed | 45 passed (46); Tests 1 failed | 588 passed (589); 163.82 s
      FAIL src/pages/examples/ReservationsListExamplePage.test.tsx > clicking a sortable column header reorders the rows
      (file not in the PR diff; last touched #3782) — isolated re-run: 16 passed (16), 5.29 s      exit 0
  CI run 32544530809 (head 9073dcbf4): Lint SUCCESS · Typecheck SUCCESS · Test (Node 22) SUCCESS · Build SUCCESS · Integrity SUCCESS
  ```

  The full-suite failures are the contention flake documented in gotchas § CI (Implement saw the same
  class: 109 failures, 168/168 on re-run). Honest reading: the suite is green file-by-file and on CI;
  it was not observed green in a single local pass.

- Result: PASS

### G2. Design-system owner views "Overlaps" on the deployed page and records a yes/no

- Check: PR state and preview reachability.
- Evidence:

  ```
  gh pr view 4442: state OPEN, isDraft true, mergeStateStatus CLEAN — not merged, not deployed to production
  curl https://mbe-preview-4442-rialto-web.workers.dev/rialto/components/tape-chart → curl: (6) Could not resolve host
  ```

  What the owner will see is captured in `light-tape-chart-overlaps.png` (Linux render) and the
  Chromium measurements above; the judgement itself is theirs.

- Result: PENDING-HUMAN

### B1. `registry.json` regenerated and byte-identical to the build (breakdown item 6)

- Evidence: `pnpm --dir packages/rialto build` → `Generated registry: 153 components`,
  `[generate-all] exports map already in sync.`; `git status --short packages/rialto` → clean. Commit
  `4d4a34508 chore(rialto): regenerate registry.json with TapeChart classifyOverlap`.
- Result: PASS

### B2. `llms.txt` / `llms-full.txt` regenerated; `pnpm regen --check` clean (breakdown item 12)

- Evidence:

  ```
  pnpm build --filter @mbe/cli...  → Tasks: 6 successful, 6 total   exit 0
  pnpm regen --check               → All generated artifacts are up to date.   exit 0
  git status after                 → (no tracked-file changes)
  CI: Integrity SUCCESS
  ```

- Result: PASS

### B3. Draft PR open against `main` with a real `CI Gate` (breakdown item 13)

- Evidence:

  ```
  gh pr view 4442 --json …: number 4442, baseRefName "main", isDraft true, headRefOid 9073dcbf4…, mergeStateStatus "CLEAN"
  statusCheckRollup: {"name":"CI Gate","status":"COMPLETED","conclusion":"SUCCESS","workflow":"CI"}  (check run)
                     {"name":"CI Gate","conclusion":"SUCCESS","workflow":null}                         (commit status)
  gh pr checks 4442: 0 failing; CI Gate pass; Visual Regression (rialto-web) pass; Functional (rialto-web) pass; codecov/patch pass
  ```

  The gate is present and attributed — not the `gate-missing` / `gate-unattributed` states from
  gotchas § CI.

- Result: PASS

### B4. Baselines round-tripped from the Linux CI artifact (breakdown item 14)

- Evidence: all 7 changed/added PNGs are byte-identical to their CI `*-actual.png` (`cmp` exit 0 for
  each): `light-tape-chart-stress` ← run 32543173746; `light-tape-chart-overlaps`, `dark-dark-alerts`,
  `dark-dark-avatar`, `dark-dark-buttons`, `dark-dark-inputs`, `dark-dark-tape-chart` ← run
  32540738717 (first attempt and `retry1` actuals byte-identical to each other). Landed in two commits
  (`7a4de20b7`, `9073dcbf4`) rather than one — see deviations.
- Result: PASS

## Implement deviations (breakdown.md § Notes) — does any compromise a criterion?

- `packRoom` spreads `overlap: undefined` onto non-overlapping bars — **no**: React drops the
  attribute (`Lucas Moreau overlap: null` in the browser; `:339 not.toHaveAttribute`).
- Extra `TapeChartOverlapKind` registry entry from the generator — **no**: generator behaviour,
  registry byte-stable on rebuild.
- `packages/rialto/llms*.txt` travelled in milestone-1 commits — **no**: `regen --check` clean.
- 14 unrelated Storybook play failures outside TapeChart — **no criterion touched**; not re-verified
  here (Not verified).
- Concurrent gate runs starved each other — **no**: re-run serially, same result class observed here.
- Code sample reads `(a, _b) =>` instead of ux.md's `(a, b) =>` — **no**: D2 asks for usage "visible
  in prose or code"; the page test covers it.
- PR title differs from the breakdown wording — **no criterion**.
- Five dark baselines refreshed (`architecture.md` said `dark-dark-tape-chart.png` must pass
  unmodified) — **no PRD criterion compromised** (R8 names only the light default), but it is a
  documented deviation from the architecture's test strategy; evidence in R8 shows the change is an
  overlay clip shift, not row geometry. **Review should confirm it accepts this.**
- Stress baseline deleted to force a Linux actual, landed one commit later — **no**: provenance
  byte-verified (B4).
- "Thu 15" vs "Wed 14" provenance claim — **confirmed** by viewing both PNGs (R9).

## Observations (not criterion failures)

- `apps/rialto-web/playwright.config.ts:15` — `expect.toHaveScreenshot.maxDiffPixelRatio: 0.01`.
  Implement's concern is borne out twice: on run 32540738717 the stale single-lane stress baseline
  _passed_ against a render where room-1003 had grown by 45 px, and `main`'s baseline has passed for
  its whole life despite being a non-Linux render with different column labels. 1 % of 1232 × 685 is
  ≈ 8.4 k px — enough to hide a whole-row layout change on a sparse grid. Candidate follow-up:
  `maxDiffPixels` or a tighter ratio; out of this run's scope.
- The PR-preview host in the bot comment does not resolve; the deployed-page verdict has to wait for
  the production deploy on merge (or a local run).

## Failures

None.

## Not verified

- **The owner's yes/no on the deployed page** (G2) — PR unmerged; preview unreachable.
- **A Linux render of `main`'s stress section** — would be needed to prove R9's "exactly one reason"
  pixel-for-pixel; no such artifact exists (a passing CI test emits no actual).
- **Storybook play functions** (`Overlaps`, `OverlapsClassified`) were not executed locally — only
  their source and CI's `Visual Regression (Storybook)` success are cited; the 14 unrelated story
  failures Implement reported were not checked against `main`.
- **A single clean local pass of the full rialto suite** — observed only file-by-file in isolation and
  on CI (`Test (Node 22)` SUCCESS).
- **Compact-density visual baseline** — none exists; compact geometry rests on computed-style
  measurements and CSS algebra (R8), not a screenshot.
- **`visual.spec.ts` locally** — deliberately not run (macOS renders must never become baselines); CI's
  Linux job is the authority (`49 passed`). `git status` after all local Playwright work shows no
  PNGs.
