---
stage: verify
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
assumptions:
  - "No live user input was available. The criteria list was assembled from defect.md § Success criteria carried from the brief (SC-1, SC-2) plus every acceptance criterion of breakdown.md milestone 3 (items 3.1-3.6); no criterion was dropped and none was added."
  - "Adversarial posture, per the dispatch: nothing was accepted from Implement's own summary. Every number below was re-derived at this stage — the § A reproduction from a Verify-authored script that imports none of the run's modules, SC-1/SC-2 from the raw measurement rows, and the emitted (threshold, maxDiffPixels) pair by re-running `recommend()` over the artifact. The two guards were verified by MUTATION (break it, observe red, restore), never by reading."
  - "Verify reports; it does not fix. Three findings below are unrepaired by design (F-1 turbo cache blindness, F-2 the guards' real binding strength, F-3 the reproduction test's CI cost). Whether any is worth acting on is Review's call, not this stage's."
  - "The test gate was run as `pnpm exec turbo run test --concurrency=4`, per the dispatch and breakdown.md § Standing rules, not as full-concurrency `pnpm test`."
  - "No tracker interaction of any kind. Nothing was pushed, merged, tagged, published, deployed, or enqueued for auto-merge. The only file this stage writes is this one."
---

# Verification: the rialto-web visual suite's measured sensitivity

## Summary

**PASS, with three findings and no failures.**

Both success criteria are demonstrated as counts from real Linux CI data, not
asserted. The shipped pair `{threshold: 0, maxDiffPixels: 674}` is the verbatim
output of the decision rule re-run at this stage over the same artifacts. All 49
committed baselines are byte-identical to a freshly downloaded copy of run
`33107801311`'s `visual-actuals-replica-a` — none was rendered on macOS. Both new
guards were proven to red by mutation and to go green again on restore, and both
were observed executing inside the real `CI Gate` `Test (Node 22)` job on the PR's
current head. The three re-pinned tests all still bind, each proven by a mutation
that reds them. PR #4613 is open, unmerged, with no auto-merge enabled; its own
`Visual Regression (rialto-web)` job ran 49 real snapshots on a Linux runner and
passed.

The failure class this run was warned about — _work that shipped, merged, and
closed COMPLETED having never once executed_ — was searched for specifically and
**was not found in the shipped artifacts**. It was, however, found in the _local
gate_ that Implement used to justify them: finding **F-1** below shows
`turbo run test` replaying a cached green over a genuinely failing guard. The
conclusion is unaffected (real CI ran the guards for real and they passed), but
the local evidence for it was weaker than it looked.

|                    |                                          |
| ------------------ | ---------------------------------------- |
| Criteria checked   | 2 success criteria + 6 milestone-3 items |
| PASS               | 8                                        |
| FAIL               | 0                                        |
| Mutation tests run | 8 (A–H), all restored                    |
| Findings           | 3 (none blocking)                        |
| Working tree after | clean apart from this artifact           |

---

## Criteria & evidence

### SC-1 — the subtle perturbation now fails

_From `defect.md` § Success criteria: "the 51%-pixel opacity perturbation (or an
equivalently subtle one) now **fails**"._

- **Check:** every `signal` row (perturbed capture vs. the shipped baselines) at
  the written threshold `t = 0`, read from the raw measurement rows of run
  `33107801311` — not from Implement's summary — and compared against the written
  budget 674.
- **Evidence:**

  ```
  --- pairing=signal t=0  n=49 ---
    min count: 113509  (dark-dark-badges.png)
    max count: 951157  (light-textarea-states.png)
    rows with count > 674: 49/49
    rows with count <= 674: 0/49

  SC-1 (every signal row must EXCEED 674): PASS

  smallest signal margin: 112835 px above the budget

  five smallest signal rows:
    dark-dark-badges.png  113509
    light-badge-variants.png  117967
    light-toggle-states.png  122472
    light-breadcrumb-default.png  122887
    light-tag-variants.png  125440
  ```

- **Result: PASS.** 49/49. The weakest signal in the whole suite clears the
  budget by 168×. The prior run's identical perturbation passed all 49 under the
  old config; it now fails all 49.

### SC-2 — legitimate rendering noise still passes

_From `defect.md` § Success criteria: "whatever noise the current baselines
legitimately carry still **passes**"._

- **Check:** every `run` row (replica-a vs. replica-b — two different Linux
  runners inside the same CI run) at `t = 0`, against the budget 674. Then, as an
  independent third runner, the PR's own visual job.
- **Evidence — the arithmetic:**

  ```
  --- pairing=run t=0  n=49 ---
    min count: 0  (dark-dark-alerts.png)
    max count: 4  (telemetry-default.png)
    rows with count > 674: 0/49
    rows with count <= 674: 49/49

  SC-2 (every run row must be AT OR UNDER 674): PASS

  largest run-to-run noise anywhere (all thresholds): 4
  ```

- **Evidence — a third, live Linux runner** (`Visual Regression (rialto-web)`,
  job `98677545039`, head `6438c4fb1`):

  ```
  Run pnpm exec playwright test --reporter=github,json --config apps/rialto-web/playwright.config.ts apps/rialto-web/e2e/visual.spec.ts
  Running 49 tests using 1 worker
    49 passed (1.4m)
  ```

  Step list confirms it really executed: `Run visual regression tests` →
  `success`; `Upload diff artifacts on failure` → `skipped`.

- **Result: PASS.** The largest legitimate noise anywhere in the suite is **4 px**
  against a **674 px** budget — 168× headroom on one side, 168× on the other. The
  budget sits at the geometric mean of the two, by construction.

### Item 3.1 — the drift guard reds on a silent re-tune

- **Check:** mutation, not reading. Move `maxDiffPixels` without its evidence
  line; then move the evidence line to match.
- **Evidence — Mutation A** (`674 → 675`, `noise-floor-values:` untouched):

  ```
   FAIL  scripts/__tests__/visual-tolerance-guard.test.mjs > rialto-web visual tolerance — the drift guard > keeps the live directives and their evidence line in agreement, key for key
  AssertionError: expected { threshold: +0, maxDiffPixels: 675 } to deeply equal { threshold: +0, maxDiffPixels: 674 }
    {
  -   "maxDiffPixels": 674,
  +   "maxDiffPixels": 675,
      "threshold": 0,
    }
   Test Files  1 failed (1)
        Tests  1 failed | 4 passed (5)
  ```

- **Evidence — Mutation B** (provenance line updated to `maxDiffPixels=675`):

  ```
   ✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 3ms
   Test Files  1 passed (1)
        Tests  5 passed (5)
  VITEST_EXIT=0
  ```

- **Holds no copy of a tolerance value** — verified by extracting every numeric
  token in the file:

  ```
  --- all bare numbers in the guard ---
  0 0.2 1 2 255 36 4 4450 4496 49 6
  ```

  `0.2`, `36` and `255` occur only inside prose comments (lines 23 and 64);
  `4450`/`4496` are PR numbers. The executable assertions use `toBe(1)` and
  `toBe(0)` — occurrence _counts_, never values.

- **Result: PASS.** The guard reds on drift and releases on a lockstep re-tune,
  exactly as designed, holding no second copy of either number.

### Item 3.1b — the defect-reproduction test reds when the sensitivity goes blind

- **Check:** delete the `threshold: 0,` line so the suite falls back to
  Playwright's implicit `0.2` — the exact pre-fix state.
- **Evidence — Mutation C:**

  ```
   FAIL  scripts/__tests__/visual-defect-reproduction.test.mjs > the declared visual sensitivity can see defect.md § A's reproduction > telemetry-game.png
  AssertionError: a uniform +36/255 shift on every pixel of telemetry-game.png is invisible to the tolerance declared in apps/rialto-web/playwright.config.ts: expected null not to be null
   ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[49/49]⎯
   Test Files  1 failed (1)
        Tests  49 failed | 1 passed (50)
  ```

- **Result: PASS.** All 49 fail on the removal, as the breakdown predicted. The
  one passing test is the deliberate `has baselines to test at all` floor. The
  file's only numeric tokens are `0 255 36 8` — `36` is `DEFECT_AMPLITUDE` (the
  subject under test), the rest are a message, a `toBeGreaterThan(0)`, and
  `"utf8"`. No tolerance value.

### Item 3.2 — the written pair is the rule's verbatim output

- **Check:** re-run `recommend()` at this stage over run `33107801311`'s
  measurement rows and compare to what is in the file. Nothing rounded, nothing
  "adjusted for safety".
- **Evidence:**

  ```
  re-derived by Verify: {"verdict":"ok","threshold":0,"maxDiffPixels":674}
  has maxDiffPixelRatio? false
  R (min reproduction count at chosen t): 113840  S: 113509  Ntilde: 4
  budgetInterval at chosen t: {"lower":8,"upper":56754}  geometricMean: 674
  sqrt(8*56754) = 673.81896678559 -> round 674
  formReview: ratio-has-more-headroom decadeDelta: 0.7818553644227544
  ```

  The live config carries exactly that pair, with both provenance lines:

  ```
        // noise-floor: run 33107801311 · ubuntu24 20260823.283.1 · playwright 1.62.1
        // noise-floor-values: threshold=0 maxDiffPixels=674
        threshold: 0,
        maxDiffPixels: 674,
  ```

  The measurement's own provenance block agrees, key for key:

  ```
  {"imageOs":"ubuntu24","imageVersion":"20260823.283.1","playwrightVersion":"1.62.1","chromiumBuild":"chromium-1234 (151.0.7922.34)"}
  ```

  `gh run view 33107801311` confirms the run is real, green, and on the ref the
  breakdown names:

  ```
  {"conclusion":"success","createdAt":"2026-08-27T19:18:25Z","databaseId":33107801311,"event":"push","headBranch":"measure/visual-noise-floor-1","headSha":"defe2c62256767434912765fbb72652fafede000","workflowName":"Visual Noise Floor"}
  ```

- **`formReview: "ratio-has-more-headroom"` changes nothing emitted.** The
  diagnostic fired at Δ 0.7819 decades and the emitted object still has exactly
  three keys — `verdict`, `threshold`, `maxDiffPixels`. `maxDiffPixelRatio` is
  absent from the recommendation (`has maxDiffPixelRatio? false`) and appears in
  the config only inside a prose comment:

  ```
  23:      // maxDiffPixelRatio: 0.01 (~8.4k px budget) because most of the diff
  ```

  `readToleranceDirectives` reports `occurrences.maxDiffPixelRatio === 0` for that
  file, so the comment-blindness trap is not being tripped.

- **Result: PASS.**

### Item 3.3 — all 49 baselines are the Linux artifact, byte for byte

- **Check:** download `visual-actuals-replica-a` fresh from run `33107801311`
  (not the copy already on disk in the scratchpad) and byte-compare every
  committed baseline against it.
- **Evidence:**

  ```
  committed baselines:       49   fresh artifact:       49
  IDENTICAL=49  DIFFERENT=0  MISSING=0
  --- extras in artifact not committed ---
  --- git status of screenshots dir ---
  ```

  (No `BYTE-DIFFERS`, no `MISSING IN ARTIFACT`, no `EXTRA`, and the directory is
  clean.) `git diff --name-status` over the branch shows only `M` lines for the
  6 files whose bytes moved — no `A`, no `D`, count still 49.

- **The four `driftAboveBudget` names are real and match the commit body**, read
  from the measurement rather than from the message:

  ```
  drift rows above budget:
    light-button-variants.png  124577
    light-master-override-variants.png  42005
    dark-dark-banner.png  24486
    dark-dark-cards.png  9583
  ```

- **Result: PASS.** No macOS-rendered baseline was found, because there is none:
  every one of the 49 is byte-identical to the Linux artifact.

### Item 3.4 — `defect.md` § A's table, re-derived independently

- **Check:** a Verify-authored script
  (`scratchpad/verify/verify-repro.cjs`) that imports **none** of the run's
  modules — its own `min(255, v + D)` brightening, its own
  `utils.getComparator("image/png")` call, the shipped pair typed in by hand from
  the config. Deltas per § A, plus the pre-fix config and the rejected pass-2
  emission for contrast.
- **Evidence:**

  ```
  baseline: light-button-variants.png  1232x113 = 139216 px
  sha256(baseline) = 8194c2bccaa4e173dd1529aaa041cab9b8c4b95ef7ccb333009f154d31d0cb98

  delta | OLD {maxDiffPixels:300} | SHIPPED {threshold:0,maxDiffPixels:674} | PASS-2 {0.2, 0}
      1 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
      5 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     10 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     20 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     30 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     36 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     40 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     45 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     50 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     52 | PASS (0 differ) | FAIL 136632 px | PASS (0 differ)
     53 | FAIL 94942 px | FAIL 136632 px | FAIL 94942 px
     55 | FAIL 94942 px | FAIL 136632 px | FAIL 94942 px
     60 | FAIL 94942 px | FAIL 136632 px | FAIL 94942 px
     80 | FAIL 94942 px | FAIL 136632 px | FAIL 94942 px
  ```

- **Three things this table settles.**
  1. **The shipped config fails every row**, 1/255 through 80/255. The defect is
     gone at the amplitude that produced it and at 36× smaller.
  2. **The defect still reproduces against the _new_ baseline** under the old
     config — the first column passes rows 1 through 52 on the regenerated
     `light-button-variants.png`, so the fix is the tolerance, not a lucky
     baseline swap.
  3. **The rejected pass-2 pair `{0.2, 0}` is column-for-column identical to the
     unfixed config.** The dispatch's warning is confirmed by measurement: that
     emission would have shipped the defect intact.

  The counts differ from `defect.md` § A's (136,632 vs. 130,114; 94,942 vs.
  88,321) **because the baseline file itself changed** — § A measured the
  pre-regeneration PNG, this measures the shipping one. The
  `light-button-variants` figure cross-validates exactly against the CI artifact
  measurement computed by a completely different code path:

  ```
  n= 49  min= 113840  at  dark-dark-badges.png
  light-button-variants count: 136632
  rows with count <= 674: 0
  ```

  `min = 113840` is also the `R` the rule reports and the `113,840px` the config
  comment cites — three independent derivations, one number.

- **Result: PASS.**

### Item 3.5 — the PR's live state

- **Check:** `gh pr view 4613`, the `statusCheckRollup` on the current head, the
  GraphQL auto-merge field, and `git ls-remote` for the disposable ref.
- **Evidence:**

  ```
  {"additions":8167,"autoMergeRequest":null,"baseRefName":"main","changedFiles":30,
   "closedAt":null,"createdAt":"2026-08-27T21:01:44Z","deletions":84,
   "headRefName":"fix/visual-tolerance-threshold",
   "headRefOid":"6438c4fb1cb42c8692ee55377e559a81c8c5932b",
   "isDraft":false,"mergeStateStatus":"CLEAN","mergeable":"MERGEABLE",
   "mergedAt":null,"number":4613,"state":"OPEN"}
  ```

  ```
  CI Gate                          SUCCESS
  Visual Regression (rialto-web)   SUCCESS
  Test (Node 22)                   SUCCESS
  Lint                             SUCCESS
  Typecheck                        SUCCESS
  Integrity                        SUCCESS
  Architecture Audit               SUCCESS
  ```

  Nothing in the full rollup is `FAILURE`; the only non-success entries are
  `SKIPPED` (`Accessibility AI Attribution`, `Cleanup Preview`,
  `Report CI Health`, and one `auto-merge` leg).

  **Auto-merge is not enabled**, and the workflow that would have enabled it
  explicitly declined:

  ```
  Checking PR #4613...
  {"eligible":false,"reason":"blocked by tier:standard — requires human approval per docs/change-tiers.md"}
  Skipping #4613: blocked by tier:standard — requires human approval per docs/change-tiers.md
  ```

  ```
  {"data":{"repository":{"pullRequest":{"autoMergeRequest":null,"state":"OPEN","merged":false}}}}
  ```

  The disposable measurement ref is gone:

  ```
  $ git ls-remote origin 'refs/heads/measure/*'
  (empty)
  ```

- **The docs-only tip, and whether it matters.** The branch tip `6438c4fb1` is
  docs-only (`breakdown.md`, +82/-1) and `b43ccbb7b` before it is docs-only
  (`.claude/rules/gotchas.md`, +1/-1). The code-carrying commit is `affa5cbdf`,
  and it carries **no** check-runs of its own:

  ```
  $ gh api .../commits/affa5cbdf/check-runs   # filtered to Visual|CI Gate|Test
  (empty)
  ```

  **The distinction does not matter**, and this was checked rather than assumed:
  CI checks out the _head SHA_, and the head SHA's tree contains `affa5cbdf`'s
  code verbatim — the two later commits touch only markdown. The
  `Visual Regression` job on `6438c4fb1` ran `playwright test … visual.spec.ts`
  against the shipped `playwright.config.ts` and the 49 shipped baselines and
  reported `49 passed`. It would have been a genuine gap only if a later commit
  had changed code, which neither did.

- **The run's own constraint held:** required checks on `main` are unchanged.

  ```
  {"strict":false,"contexts":["CI Gate"],"checks":[{"context":"CI Gate","app_id":null}]}
  ```

  The one workflow this branch adds (`visual-noise-floor.yml`) never fires on a
  `pull_request` event — it produced no check on #4613, as the rollup above shows.

- **Result: PASS.**

### Item 3.6 — the gotchas correction

- **Check:** read the diff; confirm one bullet, no other file.
- **Evidence:** `git diff` over `.claude/rules/gotchas.md` is a single-line
  replacement (`1 insertion(+), 1 deletion(-)`) naming `visual-actuals-replica-a`
  as the preferred source, keeping `rialto-web-visual-diffs` as the on-failure
  fallback and the never-commit-a-macOS-baseline rule verbatim.
- **Result: PASS.**

---

## The three re-pinned tests

Re-pinning is how a test quietly stops binding, so each was checked by breaking
the thing it is supposed to catch.

### `apps/rialto-web/e2e/noise-floor-coverage.test.ts`

**Before:** `expect(production).not.toContain("noise-floor")` — a blanket ban that
the mandated provenance comments would have violated.
**After:** `not.toContain("stylePath")`, `not.toContain("noise-floor-perturbation")`,
plus a filter requiring every remaining `noise-floor` mention to sit on a comment
line.

- **Mutation D — `stylePath` leaked into the production config:**

  ```
       × leaves the production config free of any perturbation branch 5ms
  AssertionError: expected 'import { defineConfig, devices } from…' not to contain 'stylePath'
      205|     expect(production).not.toContain("stylePath");
   Test Files  1 failed (1)
        Tests  1 failed | 9 passed (10)
  ```

- **Mutation E — a `noise-floor` mention on a non-comment line, with no
  `stylePath` and no `-perturbation` suffix** (the case the new filter, and only
  the new filter, has to catch):

  ```
       × leaves the production config free of any perturbation branch 4ms
  AssertionError: expected [ Array(1) ] to deeply equal []
  - []
  + [
  +   "  testMatch: process.env.MODE === \"noise-floor\" ? \"**/visual.spec.ts\" : undefined,",
   Test Files  1 failed (1)
        Tests  1 failed | 9 passed (10)
  ```

**Verdict: still binds, on both halves.** The re-pin narrowed the assertion from
"the string never appears" to "the string never appears in executable text",
which is the smallest change that admits the provenance comments, and the
executable half was proven live.

### `scripts/__tests__/visual-tolerance.test.mjs`

**Before:** `occurrences.threshold === 0`, `threshold === null` — an assertion of
the defect, which had to change once the defect was fixed.
**After:** `occurrences.threshold === 1` and `Number.isFinite(threshold)`, same
for `maxDiffPixels`, plus `occurrences.maxDiffPixelRatio === 0` retained and a new
`expect(LIVE_CONFIG).toContain("maxDiffPixelRatio")` pinning the comment-blindness
trap against the real file.

**Does it still bind anything?** Yes, and it was checked rather than reasoned
about: `LIVE_CONFIG` is `readFileSync(resolve(ROOT, "apps/rialto-web/playwright.config.ts"))`,
the real file, so Mutation C (deleting `threshold: 0`) drives `occurrences.threshold`
to 0 and reds it. It is now a near-duplicate of drift-guard assertion 1 — redundant,
but redundant is not inert.

### The pass-2 `S(t) = 0` test in `visual-tolerance-rule.test.mjs`

**Before (pass 2):** `verdict ok, threshold 0.1, maxDiffPixels 0`, with `H_abs`
and `H_ratio` both `-Infinity` — i.e. it _asserted the wrong rule's output_.
**After:** the degenerate point is asserted **ineligible**:

```js
expect(degenerate.budgetInterval).toEqual({ lower: 2, upper: 0 });
expect(degenerate.feasible).toBe(false);
expect(degenerate.infeasibleReason).toBe("clamps-cross");
expect(degenerate.eligible).toBe(false);
// The rule still answers, from the point that IS eligible.
expect(result.verdict).toBe("ok");
expect(result.threshold).toBe(0);
expect(result.maxDiffPixels).toBe(10);
```

**Verdict: strictly stronger than what it replaced.** The old version pinned the
defective behaviour as correct; the new one pins the exact condition that made it
defective (`eligible === false` at `S = 0`) _and_ that the rule still returns a
usable answer from elsewhere in the sweep. On the real data this same machinery
correctly marks `t = 0.15` and `t = 0.2` infeasible with
`infeasibleReason: "blind-to-defect"` and `R = 0`.

---

## Are these tests actually reached by CI?

The `scripts/**` tree sits outside every ESLint gate and the vitest include-list
trap already fired once in this run, so this was proven end to end rather than
inferred.

**The chain, named:**

| Link         | Value                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Package      | `@mbe/scripts` (`scripts/package.json`), a declared `pnpm-workspace.yaml` member                                            |
| Its script   | `"test:coverage": "cd .. && vitest run --config scripts/vitest.config.mjs --coverage"`                                      |
| Include glob | `include: ["scripts/__tests__/**/*.test.mjs"]` — a **glob**, not a path list                                                |
| CI command   | `pnpm turbo test:coverage --concurrency=2` (ci.yml, `test` job)                                                             |
| Gate         | `test` is a `needs:` of `ci-gate` — `needs: [detect-changes, prepare, lint, typecheck, architecture-audit, build, test, …]` |

For `noise-floor-coverage.test.ts` the trap was real and was closed explicitly —
`apps/rialto-web/vitest.config.ts`'s `include` is an exact-path list, and the diff
adds `"e2e/noise-floor-coverage.test.ts"` to it.

**Quoted from the real CI Gate `Test (Node 22)` job (`98678416171`, head
`6438c4fb1`, conclusion `SUCCESS`):**

```
2026-08-27T21:30:38.2205498Z  ✓ e2e/noise-floor-coverage.test.ts (10 tests) 25ms
2026-08-27T21:33:28.2358910Z  ✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 22ms
2026-08-27T21:33:28.2529860Z  ✓ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests) 124158ms
2026-08-27T21:33:28.2599188Z  Test Files  139 passed (139)
```

All three execute for real inside the required check. Locally the same three
appear in the junit report:

```
<testsuite name="scripts/__tests__/visual-defect-reproduction.test.mjs" tests="50" failures="0" errors="0" skipped="0" time="3.96141"
<testsuite name="scripts/__tests__/visual-tolerance-guard.test.mjs" tests="5" failures="0" errors="0" skipped="0" time="0.004921125"
```

**Result: PASS** — with the caveat recorded as finding F-1.

---

## Gates

All three run at the shipped tree, clean.

**`pnpm lint`**

```
@mbe/hospitality:lint: ✖ 122 problems (0 errors, 122 warnings)
 Tasks:    47 successful, 47 total
Cached:    5 cached, 47 total
  Time:    31.245s
```

0 errors. The 122 warnings are pre-existing `prefer-rialto-components` warnings in
`apps/hospitality`, untouched by this branch.

**`pnpm typecheck`**

```
 Tasks:    48 successful, 48 total
Cached:    19 cached, 48 total
  Time:    20.965s
```

**`pnpm exec turbo run test --concurrency=4`**

```
 Tasks:    50 successful, 50 total
Cached:    20 cached, 50 total
  Time:    3m3.379s
```

No timeout in any package, touched or untouched.

**Additionally, run un-cached rather than relied on:** `@mbe/scripts` was executed
from a cold task at the shipped config —

```
 Test Files  139 passed (139)
      Tests  2769 passed (2769)
   Duration  14.38s
```

---

## Findings

None blocks the fix. All three are reported, none repaired — Verify does not fix.

### F-1 — `turbo run test` cache-replays a green over a genuinely failing guard

**Severity: moderate. Pre-existing repo-wide shape, not introduced by this run,
but the two new guards sit squarely inside it.**

`turbo.json`'s `test` task declares `inputs: ["src/**", "package.json", "vitest.config.ts"]`.
`@mbe/scripts` has no `src/`, and its config is `vitest.config.mjs`, not `.ts` — so
for that package the input set matches essentially nothing that changes. Both new
guards read files **outside** their own package (`apps/rialto-web/playwright.config.ts`
and the 49 baselines), which are outside turbo's package-scoped hash either way.

**Measured, twice.** With the config mutated to `maxDiffPixels: 675` — a change the
guard genuinely fails on, proven in Mutation A:

```
--- pnpm exec turbo run test --filter=@mbe/scripts ---
 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    43ms >>> FULL TURBO
```

A green, in 43 ms, over a failing guard. The same mutation through the CI task, on
a cold cache, is correctly red:

```
@mbe/scripts:test:coverage:  ❯ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests | 1 failed) 10ms
@mbe/scripts:test:coverage:  FAIL scripts/__tests__/visual-tolerance-guard.test.mjs > … > keeps the live directives and their evidence line in agreement, key for key
@mbe/scripts:test:coverage:  Test Files  1 failed | 138 passed (139)
@mbe/scripts:test:coverage:  ELIFECYCLE  Command failed with exit code 1.
```

**But the CI task is not immune either — it is only immune on a cold cache.**
Primed green at the shipped config, then given the same config-only mutation:

```
=== STEP 1: prime test:coverage cache at the shipped config ===
@mbe/scripts:test:coverage:  Test Files  139 passed (139)
 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    35.007s

=== STEP 2: mutate ONLY apps/rialto-web/playwright.config.ts (674 -> 675, guard-breaking) ===
=== STEP 3: re-run the CI task ===
@mbe/scripts:test:coverage:  Test Files  139 passed (139)
 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    47ms >>> FULL TURBO
```

The mechanism, from turbo's own dry-run:

```
taskId: @mbe/scripts#test:coverage
hash: fccb6e82793756cf
inputs count: 278
any input mentioning rialto-web: []
```

278 inputs, every one under `scripts/`. The task hash is blind to the config file
and to all 49 baselines.

**What this does and does not mean.**

- It did **not** affect this PR. This PR changes many files _inside_ `scripts/`,
  so the hash moved and CI ran both guards for real — quoted above.
- It **does** mean the drift guard is defeatable by cache on precisely the change
  class it exists to catch: a future PR that edits **only**
  `apps/rialto-web/playwright.config.ts` can compute the same `@mbe/scripts` hash,
  restore a green from `.turbo/cache` (`restore-keys: ${{ runner.os }}-turbo-${hashFiles('pnpm-lock.yaml')}-`)
  or from the remote cache, and never execute the guard. Same exposure for the
  49 baselines and the reproduction test.
- It also means Implement's recorded local gate
  (`pnpm exec turbo run test --concurrency=4 50/50`) is **weak evidence** for
  items 3.1/3.1b/3.2 specifically. The conclusion survives because real CI ran
  them; the local justification did not prove what it appeared to.
- The shape is pre-existing and repo-wide: `pulumi-cli-pin.test.mjs` (reads
  `.github/workflows/pulumi-up.yml`) and `ci-node-matrix.test.mjs` (reads
  `ci.yml`) have the identical exposure today.

**Not repaired here** — the fix is a `turbo.json` change affecting every package,
which is a design decision outside a Verify stage's authority. Routing suggestion:
`docs/backlog.md` seed, or a follow-up maintenance run.

### F-2 — what the two guards actually guarantee is narrower than it reads

**Severity: low. A characterization, not a defect — but worth stating so nobody
over-trusts the pair.**

Two further mutations, both with the provenance line kept in lockstep (i.e. a
"legitimate re-tune" as far as the drift guard is concerned):

- **Mutation G — budget inflated `674 → 200000`:**

  ```
   ✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 4ms
   ❯ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests | 19 failed) 4051ms
  ```

  Caught — but by **19 of 49**, not all 49. The 30 baselines large enough to
  produce more than 200,000 differing pixels still pass. Any single failure reds
  CI, so this is adequate; it is simply less total than it looks, and it is the
  direct consequence of a flat absolute budget over an 8.9× image-size range.

- **Mutation H — threshold loosened `0 → 0.1`:**

  ```
   ✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 5ms
   ✓ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests) 3833ms
   Test Files  2 passed (2)
        Tests  55 passed (55)
  ```

  **Both guards stay green.** A future edit could move the per-pixel filter from
  "any non-zero delta" to `0.1` — the point at which the measurement records
  `R = 46900` rather than `113840`, i.e. a 2.4× loss of reproduction margin — and
  nothing in `CI Gate` would object.

The honest statement of the guarantee is therefore: **"the declared sensitivity is
not blind to a 36/255 whole-image shift, and neither value moved without its
evidence line moving too."** It is _not_ "threshold stays 0". The design says as
much (`architecture.md` § Components 8; the guard's own comment: _"this cannot
verify a measurement happened, only that the author was made to name one"_), and
per the sweep table any `t ≥ 0.15` does red the reproduction test with
`infeasibleReason: "blind-to-defect"`. The uncovered band is `0 < t ≤ 0.1`.

### F-3 — the reproduction test costs 50× the estimate on a CI runner

`breakdown.md` item 3.1b budgeted _"~2.5 s for all 49 at one threshold; if the
observed cost differs materially, record it rather than trimming the set."_ Local
cost matches (3.96 s). CI cost does not:

```
✓ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests) 124158ms
```

**124 seconds** on the `ubuntu-latest` runner — roughly a third of the whole
`@mbe/scripts` leg. Recorded, per the item's own instruction, not trimmed. The
`Test (Node 22)` job still concluded `SUCCESS` well inside its limits, so nothing
is broken; it is a cost worth knowing before anyone adds a second amplitude or a
second suite.

---

## Diff accounting

All 30 files in PR #4613 are accounted for. Nothing unexplained.

| Group                             | Files                                                                                                                                                                                                                                                                                                                                                                  | Owner                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| The fix                           | `apps/rialto-web/playwright.config.ts`, 6 changed baseline PNGs                                                                                                                                                                                                                                                                                                        | items 3.2, 3.3                   |
| The two new guards                | `scripts/__tests__/visual-tolerance-guard.test.mjs`, `scripts/__tests__/visual-defect-reproduction.test.mjs`                                                                                                                                                                                                                                                           | items 3.1, 3.1b                  |
| The instrument                    | `scripts/visual-tolerance.mjs`, `scripts/visual-noise-floor.mjs`, `scripts/visual-tolerance-rule.mjs` + their 3 test files, `.github/workflows/visual-noise-floor.yml`, `apps/rialto-web/playwright.noise-floor.config.ts`, `apps/rialto-web/e2e/noise-floor-perturbation.css`, `apps/rialto-web/e2e/noise-floor-coverage.test.ts`, `apps/rialto-web/vitest.config.ts` | milestone 1, items 2.1, 2.2      |
| Refactor the guards consume       | `scripts/visual-diff-report.mjs` (lexer extracted), `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs` (`measure/**` added to the same normaliser)                                                                                                                                                                                                            | items 1.2, 2.2                   |
| Run artifacts                     | `docs/fixes/visual-tolerance-threshold/{defect,architecture,breakdown,autorun-brief}.md`                                                                                                                                                                                                                                                                               | this run                         |
| Docs                              | `.claude/rules/gotchas.md` (1 line)                                                                                                                                                                                                                                                                                                                                    | item 3.6                         |
| **Carried from the previous run** | `docs/features/visual-diffs-in-pr/retro.md`, `docs/features/visual-diffs-in-pr/review.md`, and 5 of the 6 `docs/backlog.md` lines                                                                                                                                                                                                                                      | commits `68dfed84f`, `a4fa04e98` |

**The carried commits are deliberate and were recorded at the time.** Item 1.1's
acceptance measured the cut as _"7 files, 2,392 insertions, all markdown under
`docs/` — zero code"_, which is exactly these two commits plus this run's own
capture. They are `feature:visual-diffs-in-pr`'s Operate and Review artifacts,
riding along because this branch was cut on top of them. It is a scope-carry —
markdown only, no code, no behavioural surface — and it is noted rather than
flagged as a defect. The 6th `docs/backlog.md` line is this run claiming its own
seed (`(claimed: maintenance:visual-tolerance-threshold)`), which is protocol.

---

## Mutation log

Every mutation was applied with `sed` (bypassing the formatting hook), observed,
and restored from a byte-checked backup. `git status --short` was empty before and
after; the config's md5 was re-verified as `6ce9a9efd52cdaa2adad5a5b34756731` after
each restore.

| #   | Mutation                                                                      | Expected                    | Observed                                                  | Restored |
| --- | ----------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------- | -------- |
| A   | `maxDiffPixels 674 → 675`, provenance untouched                               | guard reds                  | `1 failed \| 4 passed (5)` on assertion 5                 | ✅       |
| B   | provenance also → `675`                                                       | guard greens                | `5 passed (5)`                                            | ✅       |
| C   | delete `threshold: 0,`                                                        | reproduction reds on all 49 | `49 failed \| 1 passed (50)`                              | ✅       |
| D   | leak `stylePath: "./e2e/noise-floor-perturbation.css"` into production config | coverage test reds          | `1 failed \| 9 passed (10)`, `not.toContain("stylePath")` | ✅       |
| E   | non-comment `"noise-floor"` mention (no `stylePath`, no `-perturbation`)      | coverage test reds          | `1 failed \| 9 passed (10)`, the `live` filter            | ✅       |
| F   | guard-breaking config change through `turbo run test`                         | expected red                | **green, `FULL TURBO`, 43 ms** → finding F-1              | ✅       |
| G   | budget → `200000`, provenance in lockstep                                     | reproduction reds           | reds, but **19 of 49** → finding F-2                      | ✅       |
| H   | threshold `0 → 0.1`, provenance in lockstep                                   | (open question)             | **both guards green** → finding F-2                       | ✅       |

---

## Failures

**None.** No criterion failed. Nothing routes back to Implement.

---

## Not verified

Stated so no gap reads as covered.

- **Cross-time / cross-runner-image stability of the noise floor.** SC-2 is
  demonstrated against replica-a vs. replica-b — two runners inside **one** run at
  **one** moment. `threshold: 0` counts every non-zero pixel delta, so a future
  `ubuntu24` image bump that changes font rasterization could exceed 674 across the
  suite. That exposure is real, is named in `architecture.md` (the "`R` is a point
  check" limitation) and in the repo's own runner-image-bump gotcha, and it was not
  and cannot be measured today. Detection is free (the visual job reds); recovery
  is a fresh `measure/**` capture.
- **The `packages/rialto` Storybook visual suite** (`playwright.visual.config.ts`:
  `maxDiffPixelRatio: 0.01`, `threshold` unset) has the identical blind spot. Held
  out of scope by `defect.md`; unverified here and still defective.
- **`scripts/**` remains outside every ESLint gate** — two independent causes,
  both already recorded in `docs/backlog.md`. `pnpm lint`'s green says nothing
  about the four modules this run added. Not this run's job; restated so the green
  is not misread.
- **The provenance run id cannot be verified by the guard**, by design — a static
  test can only force an author to name a run, not confirm one happened. Verify
  closed that gap manually this once (`gh run view 33107801311` above); it is not
  closed for the next re-tune.
- **`--concurrency=4` was used for the test gate**, per the dispatch, so full-
  concurrency `pnpm test` behaviour on this tree is unmeasured.
- **No live-site or deployed-surface probe** was run. This change alters what a CI
  job concludes; it ships no runtime code, so there is no deployed surface to probe.

---

## Hand-off

Next stage: **Review** (`docs/fixes/visual-tolerance-threshold/review.md`).

Carry forward for Review's attention: **F-1** (the turbo-cache hole is the one
finding with teeth, and it is repo-wide rather than this run's), **F-2** (state the
guarantee accurately in any summary — "not blind to 36/255", not "threshold stays
0"), and the scope-carry of the prior run's two markdown artifacts in the same PR.
