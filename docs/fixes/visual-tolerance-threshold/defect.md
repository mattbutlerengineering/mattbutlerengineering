---
stage: capture
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
re-entry: architect
origin: "docs/backlog.md seed (from: feature:visual-diffs-in-pr), claimed in place as maintenance:visual-tolerance-threshold"
assumptions:
  - "No live user input was available. The interview was answered entirely from docs/fixes/visual-tolerance-threshold/autorun-brief.md, supplemented by first-hand measurement recorded below."
  - "Defect brief, not condition brief. Rationale in § Defect — the suite returns a false negative, it is not merely degraded."
  - "re-entry: architect. Rationale in § Why architect."
  - "Scope held to the brief's: apps/rialto-web only. packages/rialto/playwright.visual.config.ts carries the same class of gap (maxDiffPixelRatio: 0.01, threshold unset) and is named, not taken."
  - "No tracker interaction. No intake issue seeded this brief; work items will live in the run's own artifacts, not in GitHub issues."
  - "The prior run's two headline figures — 71,140 of 139,216 pixels changed, largest per-channel delta 36/255 — are carried as its first-hand measurement and were NOT re-measured here (they require the perturbed build, which no longer exists on the branch). Every other number in this brief was measured directly during Capture."
---

# Defect: the rialto-web visual suite reports "0 pixels differ" for a change to every pixel in the image

Seeded from `docs/backlog.md` (seed origin `feature:visual-diffs-in-pr`), claimed
in place as `maintenance:visual-tolerance-threshold`.

## Defect

**Observed.** `Visual Regression (rialto-web)` — the job a reviewer, human or
agent, reads as "the UI did not change" — passes on changes that visibly alter
the rendered component. Measured during Capture against the real committed
baseline `light-button-variants.png` (1232×113 = 139,216 px) through Playwright
1.62.1's own comparator, using the repo's live options verbatim
(`{ maxDiffPixels: 300 }`): a uniform per-channel RGB shift applied to **100% of
the pixels in the image** is reported by the comparator as **`null` — no
difference at all** — for every shift up to and including **52/255 (20.4%)**.
Not "within budget". Zero differing pixels counted.

**Expected.** A change a reviewer would call a visual regression makes the suite
go red; ordinary cross-platform/anti-aliasing rendering noise does not.

**Why this is a defect and not a condition.** A tolerance being _loose_ would be
a tuning preference — a condition. What is actually happening is a **false
negative in a detector**: the mechanism the repo believes is doing the detecting
(`maxDiffPixels: 300`, deliberately tightened in #4496) is never consulted,
because the count reaching it is already zero. The green check asserts something
untrue, there is a reproducible instance, and the reproduction is the regression
test Verify will need. That is a defect brief.

The consequence compounds with what `feature:visual-diffs-in-pr` just shipped
(PR #4569, unmerged): inline diff images in PR comments are only as useful as
the failures that produce them, and a suite that does not fail produces no
images.

## Reproduction / Evidence

### A. Comparator-level reproduction (first-hand, this stage, deterministic)

This exercises the exact code path `toHaveScreenshot` uses. Traced in the
installed 1.62.1 sources: `expect.js:12585 toHaveScreenshot` → merges
`expectConfig().toHaveScreenshot` into `helper.options` → passes
`{ maxDiffPixels, maxDiffPixelRatio, threshold: helper.options.threshold }`
(`expect.js:12617-12619`; **no default is injected at the matcher layer**) →
`coreBundle.js:22209 getComparator("image/png")` → `compareImages`.

It needs no browser and no dev server, so it sidesteps the documented trap that
a local macOS run diverges from the Linux CI baselines: the comparator is pure,
and both images here come from the same committed PNG.

```js
// node scratch/repro.js   (run from the repo root)
const PWC = "node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core";
const { utils } = require(process.cwd() + "/" + PWC + "/lib/coreBundle.js");
const { PNG } = require(process.cwd() + "/" + PWC + "/lib/utilsBundle.js");
const fs = require("fs");

const BASELINE = "apps/rialto-web/e2e/screenshots/light-button-variants.png";
const comparator = utils.getComparator("image/png");
const expectedBuf = fs.readFileSync(BASELINE);
const png = PNG.sync.read(expectedBuf);

// Perturb: add a constant delta to R,G,B of EVERY pixel (alpha untouched).
function shiftAll(delta) {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = Math.min(255, out.data[i] + delta);
    out.data[i + 1] = Math.min(255, out.data[i + 1] + delta);
    out.data[i + 2] = Math.min(255, out.data[i + 2] + delta);
  }
  return PNG.sync.write(out);
}

// The repo's live options, verbatim from apps/rialto-web/playwright.config.ts.
const LIVE = { maxDiffPixels: 300 };
for (const d of [1, 20, 36, 52, 53, 80]) {
  const r = comparator(shiftAll(d), expectedBuf, LIVE);
  console.log(d, r === null ? "PASS (0 pixels differ)" : "FAIL " + r.errorMessage.trim());
}
```

Verbatim output (full sweep, including the same comparison with `threshold: 0`
added and nothing else changed):

```
baseline: light-button-variants.png  1232x113 = 139216 px

delta  | live config {maxDiffPixels:300}        | with threshold:0 added
-------|----------------------------------------|-----------------------
     1 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
     5 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    10 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    20 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    30 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    36 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    40 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    45 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    50 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    52 | PASS (0 pixels differ)                 | FAIL 130114 pixels (ratio 0.94 of all image pixels) are diff
    53 | FAIL 88321 pixels (ratio 0.64 of all image pixels) are different. | FAIL 130114 pixels …
    55 | FAIL 88323 pixels (ratio 0.64 of all image pixels) are different. | FAIL 130114 pixels …
    60 | FAIL 88323 pixels (ratio 0.64 of all image pixels) are different. | FAIL 130114 pixels …
    80 | FAIL 88323 pixels (ratio 0.64 of all image pixels) are different. | FAIL 130114 pixels …

largest whole-image per-channel delta that still PASSES: 52/255 (20.4%)
first per-channel delta that FAILS:                      53/255 (20.8%)
```

Read that first column as the defect statement: **139,216 of 139,216 pixels
changed by 20.4% each, and the suite's verdict is "no difference".**

### B. Sensitivity curve (first-hand, this stage) — design input for Architect

Same method, sweeping `threshold` and reporting the smallest whole-image
per-channel delta that produces any failure at all:

```
threshold | smallest uniform per-channel delta that FAILS {maxDiffPixels:300}
----------|------------------------------------------------------------------
        0 | 1/255 (0.4%)
     0.01 | 3/255 (1.2%)
     0.02 | 6/255 (2.4%)
     0.05 | 14/255 (5.5%)
      0.1 | 27/255 (10.6%)
     0.15 | 40/255 (15.7%)
      0.2 | 53/255 (20.8%)   <- current (unset -> Playwright default)
```

And the budget's own spread — `maxDiffPixels: 300` is absolute, so it buys a
different fraction of every baseline across the suite's 8.9× size range:

```
baseline pixel counts (maxDiffPixels: 300 is a flat budget for all 49):
  smallest:
  dark-dark-badges.png                  1184x99  =  117216 px  -> 300/px = 0.256%
  light-badge-variants.png              1232x99  =  121968 px  -> 300/px = 0.246%
  light-breadcrumb-default.png          1232x103 =  126896 px  -> 300/px = 0.236%
  largest:
  light-tape-chart-stress.png           1232x685 =  843920 px  -> 300/px = 0.036%
  light-textarea-states.png             1232x805 =  991760 px  -> 300/px = 0.030%
  light-master-override-variants.png    1232x850 = 1047200 px  -> 300/px = 0.029%
```

### C. The gate order, read from the installed source (not cited from memory)

`playwright-core@1.62.1/lib/coreBundle.js`, function `compareImages`:

| Line        | What it does                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `7550-7552` | `count = pixelmatch(expected, actual, …, { threshold: options.threshold ?? 0.2 })` — **the per-pixel filter runs first, and its default is 0.2** |
| `6659`      | inside pixelmatch: `const maxDelta = 35215 * options.threshold * options.threshold`                                                              |
| `6665-6666` | a pixel counts only if `                                                                                                                         | delta | > maxDelta` **and** (`includeAA: false`, `coreBundle.js:6623`, never overridden by Playwright) it is not detected as anti-aliasing in either image — a **second** filter |
| `7556-7562` | only now: `maxDiffPixels = min(maxDiffPixels1, maxDiffPixels2)` when both are set, else `maxDiffPixels1 ?? maxDiffPixels2 ?? 0`                  |
| `7564`      | `count > maxDiffPixels ? "…different." : ""` — **the budget is the third gate, applied to an already-filtered count**                            |

There are **three** gates in series, not two. Tuning the last while the first is
at its default changes nothing about what the suite catches — which is precisely
what #4496 did.

### D. Prior-run evidence (carried, not re-measured — see `assumptions:`)

`docs/features/visual-diffs-in-pr/release.md` § Demonstration, measured
2026-08-25 on PR #4569:

- Perturbation `opacity: 0.55` on 8 of the harness's sections, pushed as
  `9d145cade`; CI run `32901834483`: **49 passed**, no failure, no publisher
  activity.
- Verified at the time that the perturbation really rendered: the emitted CSS
  contained `…[data-testid=button-variants],…{opacity:.55}` and
  `getComputedStyle(…).opacity` returned `0.55`.
- **71,140 of 139,216 pixels changed; largest per-channel delta anywhere
  36/255.** Consistent with reproduction A: 36 is well inside the 52 ceiling.
- Only a high-delta perturbation (`background: #7b2ff7`, `e296aef39`, run
  `32903163602`) produced a failure — 8 of 49.

## Root-cause hypothesis

**Hypothesis (well-supported, but still a hypothesis about intent).** No commit
has ever set `threshold` on this suite — `git log -S threshold` over
`apps/rialto-web/playwright.config.ts` and `e2e/visual.spec.ts` returns nothing,
across the file's whole life (introduced 2026-02-25, `2c5d5797b`). Both prior
tuning passes reasoned exclusively about the _budget_: #4450 → `maxDiffPixelRatio:
0.01`, then #4496 → `maxDiffPixels: 300`, whose own in-file comment argues
entirely in units of pixel counts. The per-pixel filter in front of the budget
appears never to have been considered, so the suite inherited Playwright's
default `threshold: 0.2` by omission rather than by decision.

What is _measured_, not hypothesised: the gate order, the 0.2 default, and the
52/255 ceiling it produces under the live config.

## Blast radius

- **What.** `Visual Regression (rialto-web)` — one job, 49 snapshots, covering
  the entire rialto component surface rendered by the `/visual-test` harness
  plus the telemetry HUD. Every low-contrast or colour-shift regression smaller
  than ~20% per channel is invisible to it, at any image size, regardless of how
  much of the image changed.
- **Who.** Every reviewer of a PR touching `apps/rialto-web/**`,
  `packages/rialto/src/**`, or `infrastructure/worker/**` (the workflow's path
  filter). In this repo that is predominantly agents, which read a green check
  literally and have no independent way to notice.
- **How badly.** A false _negative_ on a safety net — the failure mode that
  produces no signal at all. Anything already merged under this tolerance was
  never actually checked at this sensitivity; the suite's whole history is
  suspect at the sub-20% level, not just future PRs.
- **Since when.** The suite has never set `threshold` — 2026-02-25 to now, ~6
  months. #4496 (merged 2026-08-23T23:43:34Z) did not introduce the gap; it
  narrowed the _third_ gate while the first stayed open.
- **Adjacent, out of scope, same class.**
  `packages/rialto/playwright.visual.config.ts:31` sets `maxDiffPixelRatio: 0.01`
  and likewise no `threshold` — the Storybook suite has the same blind spot.
- **Cost of the last change here, for scale.** #4496 merged with its own visual
  check red and left `main` red for **41h14m** until #4561 (merged
  2026-08-25T16:57:52Z) landed **24** regenerated baselines. Any tightening this
  run makes will move some or all of the 49 baselines, and that is the
  documented way to start a cascading red streak on `main`.

## Ruled out

- **"The perturbation never rendered."** Ruled out by the prior run at the
  time — emitted CSS and `getComputedStyle` both confirmed `opacity: 0.55` was
  live in the page under test. Do not re-walk the harness or the CSS pipeline.
- **"It's a `maxDiffPixels` tuning problem."** Ruled out by measurement: at the
  default threshold the count reaching the budget is literally `0`, so _no_
  budget value — including `maxDiffPixels: 0` — would have failed the run.
- **"The image sizes mismatched and it took the size-mismatch path."** Ruled
  out: the perturbations were colour-only, dimensions identical; and
  reproduction A reuses one PNG as both sides, so that branch cannot fire.
- **"Stale, missing, or misnamed baselines."** Ruled out: 49 baseline PNGs
  exist in `apps/rialto-web/e2e/screenshots/`, all 49 git-tracked, matching the
  spec's 38 light + 9 dark + 2 telemetry assertions exactly 1:1.
- **"The spec never ran"** (the #3955 workflow-scoping class). Ruled out:
  `rialto-web-e2e.yml`'s `visual` job invokes
  `apps/rialto-web/e2e/visual.spec.ts` by explicit path, and the perturbed run
  `32901834483` reported all 49 as _passed_, not skipped.
- **"A per-spec override is loosening it."** Ruled out: all four
  `toHaveScreenshot` call sites in `visual.spec.ts` pass `{ timeout: 15_000 }`
  and nothing else.

## Why architect

`re-entry: architect`, not `implement`. A one-line `threshold:` addition is the
_shape_ of the fix, not the work — four questions have to be decided, and none
has an obviously correct answer:

1. **What number, on what evidence?** The curve in § B says the answer spans two
   orders of magnitude (`0.01` → 3/255, `0.2` → 53/255). Picking a point needs
   the suite's real noise floor, which nobody has measured. That measurement
   cannot be taken locally — baselines are Linux-CI-runner-specific and macOS
   renders differ — so acquiring it is itself a designed step (e.g. two CI runs
   at one commit with `threshold: 0`, reading the actual inter-run diff counts).
2. **The two knobs interact.** Tightening `threshold` raises the count, which
   then meets the budget for the first time — so `maxDiffPixels: 300` cannot be
   re-justified on its old reasoning and has to be re-derived jointly.
3. **Absolute, ratio, or both?** `min(maxDiffPixels, w×h×ratio)` is available
   (`coreBundle.js:7556-7562`) but is _not_ in force today — with
   `maxDiffPixelRatio` absent the effective budget is a flat 300 for baselines
   ranging 117,216 → 1,047,200 px, i.e. 0.256% down to 0.029%. This repo has
   already flip-flopped ratio → absolute once (#4450 → #4496); a third reversal
   without a stated rule is how it flips again.
4. **Blast radius is a design constraint, not an implementation detail.** Up to
   49 Linux-CI baselines may need regenerating, under a documented hazard that
   getting it wrong reds `main` for days. Sequencing that safely, plus the drift
   guard the brief puts in scope, plus keeping the shape adoptable by the
   `packages/rialto` suite later, is architecture work.

Next stage: **Architect** — `docs/fixes/visual-tolerance-threshold/architecture.md`,
then Decompose (`breakdown.md`). Work items deliberately omitted here per the
protocol; the `architecture.md` + `breakdown.md` chain owns them.

## Notes

### Corrections to the autorun brief (2026-08-27, re-verified at Capture)

The brief asked to be re-verified. Most of it holds; four things do not.

1. **Wrong — "a commented-out `maxDiffPixelRatio: 0.01` at line 23".** #4496
   **deleted** that directive (`- maxDiffPixelRatio: 0.01` / `+ maxDiffPixels:
300` in its diff). Lines 19-27 of the current config are one explanatory
   comment that _mentions_ `maxDiffPixelRatio: 0.01` in prose at line 23. There
   is no dormant setting to uncomment — the ratio gate is absent, not disabled
   in place.
2. **Misleading — "effective per-image budget is `min(maxDiffPixels, w × h ×
maxDiffPixelRatio)`".** That is the source's general formula and the cited
   lines are right, but it is not the effective budget here: with
   `maxDiffPixelRatio` undefined, `maxDiffPixels2` is `undefined` and the
   `min()` branch never runs. Today's budget is a flat **300** for every
   baseline.
3. **Imprecise in a way that matters — "a pixel is only counted as different
   once its delta exceeds `threshold`", supported by "36/255 = 0.14, under the
   0.2 default".** That reads as an apples-to-apples comparison and is not one.
   pixelmatch does not compare a normalised per-channel delta to `threshold`; it
   compares a YIQ-weighted squared colour distance against `35215 × threshold²`
   (`coreBundle.js:6659`). The conclusion survives — the measured cutoff at
   `threshold: 0.2` is 53/255, so 36/255 was indeed under it — but the
   arithmetic used to reach it does not, and Architect must not pick a number by
   treating `threshold` as a fraction of 255.
4. **Incomplete — "the gate order is the whole defect: `threshold` filters
   first, `maxDiffPixels` counts second".** There are three gates. Between them,
   pixelmatch's anti-aliasing detector discards any over-threshold pixel it
   judges to be anti-aliasing in _either_ image (`includeAA: false`, never
   overridden). Measured: at `threshold: 0` a change to every pixel counts
   130,114 of 139,216 (0.94), not 139,216; at delta 53 under the live config it
   counts 88,321 (0.64). Roughly 6% of this baseline is permanently exempt from
   the budget at any threshold.

Confirmed correct, no change needed: `maxDiffPixels: 300` live at line 28;
`threshold` unset everywhere (config, spec, and the whole file history); four
`toHaveScreenshot` calls passing only `timeout`; 49 assertions and 49 committed
baselines; 1232×113 = 139,216 px for `light-button-variants`; Playwright's
default `threshold` is 0.2; #4496 → #4561 left `main` red ~41 hours (41h14m
exactly) and #4561 regenerated 24 baselines; `CI Gate` is the only required
check on `main` (`{"strict": false, "contexts": ["CI Gate"]}`, re-read
2026-08-27), so the visual job is advisory.

### Success criteria carried from the brief

Both halves must be **demonstrated**, not asserted:

1. the 51%-pixel opacity perturbation (or an equivalently subtle one) now
   **fails**; and
2. whatever noise the current baselines legitimately carry still **passes**.

### Constraints carried from the brief

- Baselines are Linux-CI-runner-specific; never commit one rendered on macOS.
  Regenerate from a CI artifact on a Linux run at the PR's base commit.
- Do not merge a PR with its own visual check red — that is exactly what #4496
  did, and it cost 41 hours of red `main`.
- This run may change what the visual job _concludes_; it must not change which
  checks are _required_.
- Release authorization: **NONE — prepare and stop.** Every stage through Ship;
  a PR may be opened; no merge, tag, publish, or deploy.
- Tracker: no interaction of any kind.
