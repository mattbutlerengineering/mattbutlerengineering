---
stage: architect
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
re-entry: architect
revision: 3
assumptions:
  - "No live user input was available. The interview was answered from docs/fixes/visual-tolerance-threshold/defect.md and autorun-brief.md, supplemented by first-hand read-only verification of playwright@1.62.1, playwright-core@1.62.1, the live config, the workflow, and the 49 committed baselines. Every source line cited below was read during this stage."
  - "No tolerance value is chosen here. The dispatch brief forbids picking numbers the measurement has not justified, so this design specifies the instrument and an executable decision rule instead; the numbers are produced by running it."
  - "Decision-rule constants are recommended defaults, not user-chosen: separation factor 10x, noise headroom multiplier 2x, signal margin 2x, drift percentile P90 (not max, with outliers listed by name), threshold sweep [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2], and — new in revision 2 — a form-review band of 0.3 decades. The six that belong to the rule are enumerated as `opts` in § `recommend` and echoed into `evidence.opts`, so a Recommendation is self-describing; the sweep is `measure()`'s parameter, not the rule's."
  - "The signal anchor is the prior run's perturbation, opacity: 0.55 applied by [data-testid=…] selector — carried from success criterion 1 in the brief rather than invented here. Revision 2 generalises the selector to cover every screenshot subject; the perturbation VALUE is unchanged."
  - "Revision 2, gap 1: the signal set is every one of the 49 snapshots. Membership is derivable, not listed — the perturbation CSS targets the two subject-locator forms visual.spec.ts uses ([data-testid] and [data-feed-state]), a coverage test fails closed on any third form, and the rule additionally verifies per snapshot that the perturbation was observed. Recommended default taken: an unobserved signal is a hard stop (verdict: signal-not-observed), never a silent exclusion."
  - "Revision 2, gap 2: the budget form is fixed by fiat to maxDiffPixels, for three stated reasons (a measured in-repo regression of the ratio form, a near-constant image width, and a live parseMaxDiffPixels contract on main). The regression is retained as a reported diagnostic with a named statistic and an explicit 0.3-decade boundary, but it reviews the fiat rather than overriding it. The both-keys min() form is dropped."
  - "Revision 2, gap 3: the instrument gains `push: branches: ['measure/**']` alongside workflow_dispatch. The measurement is taken by pushing a disposable measure/* ref at the run branch's head — no merge, no PR, no label, no tracker interaction. The run is NOT blocked on user authorization."
  - "includeAA stays at pixelmatch's default (false). Stated choice, not omission; rationale and the measurement behind it are in § Decisions & alternatives."
  - "No ADR offered. The closest candidate and why it misses the bar are recorded in § ADRs."
  - "Scope held to apps/rialto-web. packages/rialto/playwright.visual.config.ts carries the identical gap and is named, not taken."
  - "Revision 3 corrects the DECISION RULE only. The instrument ran for real — GitHub Actions run 33107801311, `Visual Noise Floor`, four jobs green, 1,176 rows, all 49 snapshots observed (`unobserved: []`, `excluded: []`). The three-leg capture, the provenance guard, the `measure/**` trigger, the perturbation and clause 0 are unchanged and were vindicated by the run."
  - "Revision 3, defect A: `qualifies` was `S >= separationFactor * N`, which at `N = 0` reads `S >= 0` — true for any signal whatsoever, so six sweep points qualified vacuously and clause 1's `largest` took the loosest. Replaced by a three-valued `separationState`, and clause 1's ordering reversed from largest to smallest with a stated reason: a threshold's blindness is unbounded in area, a budget's is bounded in area."
  - "Revision 3, defect B: no term in the rule was a function of the defect's own amplitude, so the emitted pair was behaviourally identical to the live config on defect.md § A's own table. Closed by a fourth pairing, `reproduction` — defect.md § A's synthetic uniform shift at `defectAmplitude` 36, the prior run's measured worst case — folded into clause 3's upper clamp, so the emitted budget is structurally below the count the reproduction produces."
  - "Revision 3, defect C: `round(sqrt(N * S))` and the lower clamp `noiseHeadroom * N` both collapse to 0 at `N = 0`, with nothing to rescue them. Closed by `N0 = max(N_run(0), 1)` and `N~(t) = max(N(t), N0)` — a measured zero at a filtered sweep point is not the claim that noise cannot occur."
  - "Revision 3: `drift` is removed from `N` and keeps every other job it had. It becomes `evidence.driftAboveBudget`, a baseline-regeneration precondition list, alongside the P90 outlier list item 2.4 already triages. Measured rationale in § Decisions & alternatives → Why `drift` is not a noise term."
  - "No new CI measurement is required and none is requested. The `reproduction` pairing is pure arithmetic over PNGs already in hand, and the corrected rule was re-evaluated offline against run 33107801311's own 1,176 rows plus its `visual-actuals-replica-a` artifact. The output is quoted in § `recommend`."
  - "Quoting the re-evaluated pair in this artifact is verification that the corrected rule works, not authorization to write it. Item 2.5 still reads the verdict and item 3.2 still writes the config; this stage writes no tolerance value anywhere."
  - "No tracker interaction; no tolerance value changed and no baseline regenerated by this stage — this stage designs only."
---

# Architecture: giving the rialto-web visual suite a measured sensitivity

Predecessor: [`defect.md`](./defect.md). Read its § Reproduction / Evidence
first — this design builds on its three measured facts (three gates in series,
`threshold` unset and therefore 0.2, a flat 300-pixel budget across an 8.93x
size range) and does not re-derive them.

> **Revision 2 (2026-08-27).** Decompose cut
> [`breakdown.md`](./breakdown.md) against revision 1 and routed three design
> gaps back rather than designing around them. This revision closes all three
> — the signal set (§ Components 3, § `recommend`), clause 4's decision
> boundary (§ `recommend` clause 4), and the dispatch precondition
> (§ Components 2) — and corrects the record on PR #4569, which is **merged**.
> Everything else is unchanged. § Hand-off lists exactly which breakdown items
> need re-cutting.

> **Revision 3 (2026-08-27).** The instrument was built, the gates passed, and
> **the measurement ran** — GitHub Actions run `33107801311`, `Visual Noise
Floor`, event `push` on `measure/visual-noise-floor-1` at `defe2c62`, four
> jobs green, 1,176 rows, artifact `visual-noise-floor-measurement`. The data
> is good. The **decision rule was wrong**, in three ways that only a real
> measurement could expose, because all three are triggered by a noise floor
> that measures **zero** — a state no synthetic fixture had produced:
>
> - **A.** Clause 1's qualification predicate is vacuous at `N = 0`
>   (`S >= 10 * 0` is true for any signal), so six of eight sweep points
>   qualified for nothing and `largest` took `t = 0.2` — Playwright's default,
>   the value `defect.md` indicts by name — at an 84% loss of detection power
>   (`S` falls 113,414 → 17,967) for zero measured gain.
> - **B.** The emitted `{0.2, maxDiffPixels: 0}` is behaviourally **identical
>   to the live config** on `defect.md` § A's own reproduction table. The run
>   would have closed looking successful with the defect reproducing verbatim.
> - **C.** Clause 3's budget collapses to `0` at `N = 0`, lower clamp included.
>
> This revision changes § Components 4, § Data model, § `measure`,
> § `recommend` clauses 1-4, and adds § Components 8. Nothing about the
> instrument changes. § Hand-off lists the re-cuts.

## Approach

The suite has three gates in series and evidence for none of them. The design
does not try to pick better numbers; it builds the **instrument that produces
the numbers**, expresses the choice as an **executable rule** over that
instrument's output, and adds a guard whose assertion is _"the values agree
with the measurement they cite"_ rather than _"the values are 300"_.

The shape that makes this affordable is one observation: **capturing renders and
comparing them are separable, and only the second needs tolerance.** Playwright
under `--update-snapshots=all` sets `expectScreenshotOptions.expected =
undefined` (`playwright/lib/matchers/expect.js:12644`) and writes the actual
without comparing at all — so a capture leg is entirely tolerance-blind. That
lets three CI legs produce three sets of real Linux renders, after which every
threshold in the sweep, every pairing, and every candidate budget is evaluated
**offline** by a pure analyzer calling the same `getComparator("image/png")` the
suite uses. Sensitivity becomes arithmetic over artifacts instead of a CI matrix,
and the same artifact that answers "what is the noise floor" is byte-for-byte the
artifact that answers "what should the new baselines be".

The alternative shape considered and rejected: run the real visual job N times
with N candidate tolerance values and see which stays green. It loses on three
counts — it costs one full CI leg per candidate (checkout, install, rialto
build, Chromium install and 49 screenshots, every time, on a personal-account
repo where Actions is paid), it can only ever report
pass/fail rather than the count that would let a rule interpolate, and it
answers "does this value pass today" without ever exposing how much headroom is
left before the next runner-image bump. The measurement, not the verdict, is the
product.

## Components

### 1. Tolerance declaration — `apps/rialto-web/playwright.config.ts`, `expect.toHaveScreenshot`

- Responsibility: owns **how sensitive this suite is**, for all 49 snapshots, in
  one place, together with a machine-readable record of the measurement that
  justifies it.
- Collaborators: read by Playwright at run time; read as _text_ by the config-text
  reader (6) for both the drift guard (7) and the PR-comment publisher's
  `parseMaxDiffPixels`.
- Deletion test: if it vanished, all three gates revert to Playwright defaults —
  which is exactly the defect. It survives.
- Invariant it owns: **no `toHaveScreenshot` call site may pass `threshold`,
  `maxDiffPixels`, or `maxDiffPixelRatio`.** 49 per-snapshot knobs are 49 places
  to loosen the suite quietly; one suite-wide declaration is the only surface the
  guard has to watch. (Today's four call sites pass only `timeout` — verified.)

### 2. Noise-floor capture — `.github/workflows/visual-noise-floor.yml`

- Responsibility: owns **producing comparable real-Linux renders**. Nothing else.
  It never compares, never asserts, never changes what any required check
  concludes.
- **Trigger — two, and only two: `workflow_dispatch`, plus
  `push: branches: ["measure/**"]`.** No `pull_request`, no `schedule`, no
  other push branch. This is the closure of Decompose's design gap 3, and the
  reasoning is in § Decisions & alternatives → _Reaching the measurement
  without a merge_. In one line: `workflow_dispatch` cannot fire for a file
  that is not on the default branch, this run may not merge, and a `push` to a
  ref nothing else watches costs exactly one measurement and is available on
  the run's own branch today.
  - Precedent for the dispatch half: `.github/workflows/pulumi-r2-checksum-validation.yml`,
    a dispatch-only harness built for exactly this "measure something CI cannot
    be asked casually" purpose. That precedent is kept — `workflow_dispatch` is
    the path every _future_ re-measure takes, once this file is on `main`.
  - The `measure/**` half is the pre-merge path, and it is deliberately a
    namespace nothing else in the repo reacts to. **Measured, not assumed:**
    running this repo's own trigger normaliser
    (`scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs`,
    `parseOnSection` + `filterValues` + `globToRegExp`) over every file in
    `.github/workflows/` against the ref `measure/visual-noise-floor-1`
    returns **no workflow that would fire** — every `push:` trigger in the repo
    is filtered to `branches: [main]`, and that same test asserts no `create:`
    trigger exists anywhere, so creating the branch fires nothing either.
  - The same guard constrains this workflow in the other direction, and it
    passes: `findTriggerViolations` on `push: branches: ["measure/**"]` returns
    `[]` (measured), because `measure/**` cannot match the
    `visual-diffs/pr-…/run-…` namespace that guard exists to protect. A future
    edit that loosened this to `branches: ["**"]` would red `pnpm test`.
  - A `measure/*` ref is disposable: push it at the run branch's head commit to
    take a measurement, delete it afterwards. Pushing it is a branch write, not
    a merge — the run already pushes its own branch and opens a PR.
- `concurrency: { group: visual-noise-floor-${{ github.ref }}, cancel-in-progress: false }`.
  A half-finished measurement is worse than none: cancelling one leg leaves two
  artifacts the analyzer will refuse anyway, having already paid for them.
- Three legs in **one workflow run**, each `runs-on: ubuntu-latest` (the same
  label the production `visual` job uses — a different label measures a different
  machine):
  - `capture (replica-a)` — production config, `--update-snapshots=all`
  - `capture (replica-b)` — identical, on a second runner
  - `capture (perturbed)` — the perturbation config (3), `--update-snapshots=all`
    Each uploads `apps/rialto-web/e2e/screenshots/` plus a `provenance.json`
    recording `ImageOS`, `ImageVersion`, the Playwright version, and the resolved
    Chromium build.
- **Why one run and not three dispatches:** GitHub moves runner images on its own
  schedule with no repo change (the 2026-08-11 Pulumi outage is the recorded
  in-repo instance). Two dispatches days apart are two populations, and silently
  differencing them would attribute an image bump to run-to-run noise. Legs of
  one run are near-simultaneous; the analyzer additionally **refuses** to
  difference legs whose recorded `ImageVersion` differs.
- **Why replica-b is a second runner, not a repeat on the first:** the production
  job's exposure is to whichever host GitHub allocates, so host-to-host variance
  is part of the noise being measured, and a same-host repeat measures a strict
  subset of it.
- Deletion test: if it vanished, "what is the noise floor" has no answer that can
  be obtained at all — the brief's own finding is that it cannot be taken locally.

### 3. Perturbation config — `apps/rialto-web/playwright.noise-floor.config.ts` + `apps/rialto-web/e2e/noise-floor-perturbation.css`

- Responsibility: owns **the known-regression signal, and its coverage of the
  snapshot set** — one config that spreads the production config and adds
  `expect.toHaveScreenshot.stylePath` pointing at a CSS file that reapplies the
  prior run's `opacity: 0.55`.
- `stylePath` is a documented `toHaveScreenshot` option in 1.62.1
  (`playwright/types/test.d.ts:233`, inside `TestProject.expect.toHaveScreenshot` — config level, which is where this uses it), injected before the screenshot, so the
  signal needs **no edit to any application source file**. The prior run patched
  `VisualTest.module.css` directly; that is a perturbation one bad `git add` away
  from being committed, and this is not.

**The CSS targets the screenshot subject, not a list of sections** (Decompose
design gap 1, first half). Its entire body is two selectors:

```css
[data-testid],
[data-feed-state] {
  opacity: 0.55;
}
```

- Those two are **exhaustive over `visual.spec.ts`**, measured: the spec builds
  a screenshot subject in exactly two ways — `page.getByTestId(id)` for the 38
  light and 9 dark harness sections (rendered by
  `src/pages/visual-test/Section.tsx`, which puts `data-testid={id}` on every
  one), and `page.locator("[data-feed-state]")` for the 2 telemetry HUD
  snapshots on `demos/telemetry?frozen=1` (`src/pages/telemetry/Telemetry.tsx:58`).
  47 + 2 = 49. Gap 1's premise — that the 2 telemetry snapshots are
  unreachable — was true of a section-list CSS and is **dissolved by covering
  the second locator form**, rather than by carving those two out of the rule.
- It is the prior run's perturbation generalised, not a new one: `defect.md`
  § Reproduction records the emitted CSS as
  `…[data-testid=button-variants],…{opacity:.55}` over 8 sections. Same
  property, same value, same selector _mechanism_ — only the enumeration is
  replaced by the attribute.
- **Known, harmless non-uniformity:** `DarkModeSection.tsx` wraps the nine dark
  sections in `<div data-theme="dark" data-testid="dark-mode-section">`, so
  those nine composite two stacked opacities (~0.30 effective) rather than one.
  That makes the perturbation _stronger_ on those nine and never weaker, and
  `S` is a **minimum**, so the rule's answer is driven by the least-perturbed
  members — the light sections, at exactly the prior run's 0.55. Recorded
  rather than engineered around: a `:not(:has([data-testid]))` refinement would
  silently _under_-perturb any future subject that nests a testid, which is the
  dangerous direction.
- **Coverage is a test, not a comment** — `apps/rialto-web/e2e/noise-floor-coverage.test.ts`,
  run by `pnpm --dir apps/rialto-web test`. It reads `visual.spec.ts` and
  `noise-floor-perturbation.css` as text, extracts every subject-locator form
  feeding a `toHaveScreenshot` call, and asserts each is covered by a selector
  in the CSS. **It fails closed:** a locator form it does not recognise is a
  violation, never silence. Precedent, and the same failure class: the
  neighbouring `apps/rialto-web/e2e/workflow-coverage.test.ts`, which exists
  because six real specs sat in this exact directory never running in CI
  (#3955). Without this test, adding a 50th snapshot with a third locator form
  would quietly shrink the signal set — the failure mode gap 1 named.
- A second config file rather than an env-var branch inside the production
  config: `apps/rialto-web/playwright.csp.config.ts` is the in-repo precedent for
  "a second purpose gets a second config". A production config that renders
  differently when an env var is set is a production config that can be perturbed
  in silence — the exact failure class this run exists to remove.
- Deletion test: without it there is a noise measurement and no signal to compare
  it against, and the rule (5) has nothing to separate.

### 4. Comparison analyzer — `scripts/visual-noise-floor.mjs`

- Responsibility: owns **"how many pixels differ between these two PNGs at this
  sensitivity"** — the only place outside Playwright that invokes the comparator.
- Calls `utils.getComparator("image/png")` from the installed `playwright-core`
  with `{ threshold: t, maxDiffPixels: 0 }` and reads the count out of the
  returned `errorMessage` (`null` means zero). Verified against
  `playwright-core/lib/coreBundle.js:7521-7568`: `count` is not a returned field,
  and `count > maxDiffPixels` with a zero budget makes the message carry the
  count for every non-zero result. Using the suite's own installed comparator —
  rather than adding `pixelmatch` as a dependency — is what makes the measurement
  a measurement of _this suite_ and not of a lookalike.
- Sweeps **four** pairings x eight thresholds x 49 snapshots offline. Emits the
  measurement set (see § Data model) as JSON plus a markdown table to
  `$GITHUB_STEP_SUMMARY`.
- **The fourth pairing, `reproduction`, needs no runner and no leg**
  (revision 3). Both of its sides come from one PNG — `replica-a` against
  `replica-a` shifted by `defectAmplitude` on R, G and B, `min(255, v + D)`,
  which is `defect.md` § A's reproduction verbatim. It is pure arithmetic over
  bytes already in hand: no render, no browser, no dev server, no fourth
  capture leg, and platform-independent for exactly the reason `defect.md`
  § A states ("the comparator is pure, and both images here come from the same
  committed PNG"). Measured cost: 392 rows, ~18 s for the whole eight-point
  sweep on a laptop.
- Deletion test: its callers would each need the comparator, the sweep, the
  name-set validation and the pairing logic. It survives.

### 5. Decision rule — `scripts/visual-tolerance-rule.mjs`

- Responsibility: owns **"which `(threshold, budget)` pair these measurements
  justify"** — and, equally, owns saying _no pair is justified_ when that is the
  answer.
- Pure arithmetic over the measurement set. No PNGs, no filesystem, no network,
  and — the direction that matters — **no import of (4)**. The rule is the policy
  here: it defines the `Measurement` row shape it needs, and the analyzer, which
  is the detail (it knows about PNG bytes, a vendored comparator, and CI artifact
  layout), produces rows to that shape. The workflow wires the two; neither the
  rule nor its tests can reach `playwright-core`.
- It is (4)'s only consumer and is still a separate module, because the two have
  genuinely different inputs — image bytes from a runner versus a table of
  integers — and only one of them can be tested without one.
- The rule is stated in full in § Interfaces & contracts.
- Deletion test: without it, "which number" collapses back into a judgement call
  made once and never re-derivable — which is how the suite got here.

### 6. Config-text reader — `scripts/visual-tolerance.mjs`

- Responsibility: owns **facts read out of the Playwright config's text** —
  comment stripping (string- and template-aware) and extraction of the three
  tolerance directives with their occurrence counts.
- Two adapters make this seam real rather than hypothetical: the drift guard (7)
  and `parseMaxDiffPixels` in `scripts/visual-diff-report.mjs`, which today owns
  a private `stripComments` of its own. `stripComments` moves here and
  `parseMaxDiffPixels` becomes a thin _policy_ over `readToleranceDirectives` —
  the same lexical rule with a different question asked of it. Two copies of
  "how do you strip a comment from this file" is the shape where one gets fixed
  and the other does not.
- **Text, never `import()`** — inherited constraint, not a preference: the
  publisher job deliberately runs no `pnpm install`, so `defineConfig` is
  unresolvable there. The guard could import, but a second reading strategy for
  one file is a second thing to keep true.
- Deletion test: survives — both callers need comment-aware lexing and neither
  should own it.

### 7. Drift guard — `scripts/__tests__/visual-tolerance-guard.test.mjs`

- Responsibility: owns **"the suite's sensitivity can never again change in
  silence"**. Runs under the root `pnpm test`, i.e. inside `CI Gate`, alongside
  `scripts/__tests__/pulumi-cli-pin.test.mjs` — the in-repo precedent for a test
  that reads a real file and asserts an invariant on it.
- It holds **no copy of any tolerance value**. Its assertions are in § Interfaces
  & contracts; the load-bearing one is internal self-consistency between the live
  directives and the provenance line in the same file.
- Deletion test: without it, #4496 recurs — a knob moved with no evidence and no
  red anywhere.

### 8. Defect-reproduction regression test — `scripts/__tests__/visual-defect-reproduction.test.mjs`

- Responsibility: owns **"the sensitivity that is actually declared is not blind
  to the regression this run exists to catch"** — `defect.md` § A's reproduction
  turned from a one-off Capture measurement into a standing assertion against
  the **live** config.
- Reads the live `(threshold, maxDiffPixels)` through the config-text reader (6)
  — no second copy of the lexer, and no number of its own — shifts each
  committed baseline by `defectAmplitude`, calls the same
  `getComparator("image/png")` the suite uses, and asserts the result is **not**
  `null`. Runs under the root `pnpm test`, i.e. inside `CI Gate`. Measured
  cost: ~2.5 s for all 49 baselines at one threshold.
- **Why not a sixth assertion inside the drift guard (7):** the guard is
  textual, names no number, and reaches no image; that purity is why it stays
  green through a legitimate re-tune. This one executes the comparator and means
  something different when it reds — not "a value moved without evidence" but
  "the declared sensitivity cannot see the defect". Different failure, different
  module.
- **Why it exists at all, now that clause 1 cannot select a blind sweep point:**
  the rule constrains what the _instrument_ emits. Nothing constrains a later
  hand edit, and the guard — which asserts only that the config agrees with its
  own provenance line — would stay green through one. This is the only check in
  the design that can be evaluated without a measurement, which is precisely
  what makes it the right shape for `CI Gate`.
- Deletion test: without it, `defect.md`'s reproduction has no standing
  counterpart anywhere in the repo, and Verify's evidence expires the moment
  the run ends. It survives.

### Not a module: baseline supply

Regeneration needs no code. The `visual-actuals-replica-a` artifact from (2) is
already 49 fresh Linux PNGs at the dispatched commit, produced by the same
runner label as the production job — strictly better than the documented
procedure's source (`rialto-web-visual-diffs`, which exists only on failure and
carries only the snapshots that failed). Drawing a module here would draw a name
around `unzip` and `cp`.

## Data model

The access patterns come first, because they are what the shape has to serve.
The rule (5) asks exactly five questions of the measurement set:

1. per `(pairing, threshold)`, the **maximum** count across the 49 snapshots;
2. per `(pairing, threshold)`, the **90th percentile** count across the 49;
3. per `(pairing, threshold)`, the **minimum** count across the signal set;
4. per `(pairing, threshold)`, the snapshots whose count exceeds P90 — **by
   name**, for human triage;
5. all four of the above again over the `ratio` column instead of `count`
   (clause 4's ratio-domain headroom). Revision 2 replaced revision 1's "does
   count correlate with area" with this: the same aggregates in a second unit,
   which the row set already carries, rather than a fit the row set cannot
   support. Nothing new is stored — `ratio` was always a column;
6. per `(threshold)`, the **minimum** count across the 49 in the `reproduction`
   pairing — clause 1's defect-blindness gate (revision 3). Same single pass,
   same shape, one more `pairing` value.

Question 3 is per-snapshot filtered by the signal set, which is a derived
predicate (below) rather than a stored field, so it is still a single pass.

Everything else is presentation. Nothing needs an index, a join, or a second
pass, so the model is a flat row set written once and read whole.

### `Measurement` (one row per snapshot x pairing x threshold — 49 x 4 x 8 = 1,568)

| field             | type                                                   | note                                                               |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `snapshot`        | string                                                 | baseline filename, e.g. `light-button-variants.png`                |
| `width`, `height` | int                                                    | read from the PNG header; **must** match across the pair           |
| `area`            | int                                                    | `width * height`; the denominator behind `ratio`, access pattern 5 |
| `pairing`         | `"run"` \| `"drift"` \| `"signal"` \| `"reproduction"` | see below                                                          |
| `threshold`       | number                                                 | one of the eight sweep points                                      |
| `count`           | int                                                    | differing pixels the comparator counted                            |
| `ratio`           | number                                                 | `count / area`                                                     |

The four pairings, and why each exists:

- **`run`** — replica-a vs replica-b. Same commit, same code, two runners: this
  is _instantaneous rendering noise_ and nothing else. It is the term success
  criterion 2 is about.
- **`drift`** — replica-a vs the **committed** baseline. Distance accumulated
  since each baseline was authored, across every runner-image and browser change
  in between. Revisions 1 and 2 called this the **headroom** term and folded it
  into `N`. **The measurement says it is not one, and revision 3 takes it out of
  `N`** — it is measured, reported and triaged exactly as before, and it gains
  the job it was actually good for: naming the baselines whose staleness the
  emitted budget cannot absorb. The argument, with the numbers, is § Decisions
  & alternatives → _Why `drift` is not a noise term_.
- **`signal`** — perturbed vs replica-a. The regression the suite must catch.
  Note that it carries run-to-run noise too: the perturbed leg is a third
  runner, so `count(signal, s, t)` is _perturbation plus noise_, never
  perturbation alone. That is why the "was this snapshot actually perturbed"
  question below is answered against the `run` pairing rather than against zero.
- **`reproduction`** — replica-a vs replica-a shifted uniformly by
  `defectAmplitude` on R, G and B (revision 3). Not a render and not a leg: a
  synthetic regression of **known amplitude**, and the only term in the model
  that is a function of amplitude rather than of one particular perturbation.
  `signal` answers _"does the suite catch the perturbation the prior run
  applied"_; `reproduction` answers _"does it catch a change of the amplitude
  already documented to have escaped"_. Revision 2 assumed those were the same
  question. Run 33107801311 proved they are not — see § Decisions &
  alternatives → _The signal term could not see the defect_.

**No `perturbed` flag, deliberately** (Decompose design gap 1, second half).
The row shape above is unchanged from revision 1, because signal-set membership
is a **derived predicate over rows**, not a stored field and not an `opts`
list — a hand-maintained set is exactly what rots the first time a snapshot is
added. Two facts define it, one static and one measured:

1. **By construction, the set is all 49.** The perturbation CSS targets the two
   subject-locator forms `visual.spec.ts` uses (§ Components 3), and
   `noise-floor-coverage.test.ts` fails closed if a third form ever appears.
   Membership needs no enumeration because non-membership is not
   representable — a snapshot the CSS cannot reach reds a test.
2. **Per snapshot, the rule verifies the perturbation was observed**, from the
   perturbation run's own numbers rather than from a declaration:

   ```
   observed(s)  ⟺  count(signal, s, 0) >= separationFactor * max(count(run, s, 0), 1)
   ```

   at the strictest sweep point `t = 0`, with the same `separationFactor` (10)
   clause 1 uses, and meaning the same thing: one order of magnitude between
   signal and noise. The prior run verified reachability the equivalent way and
   at first hand — `getComputedStyle(…).opacity` returned `0.55`
   (`defect.md` § Reproduction) — so this is that check moved from a one-off
   console read into the instrument.

**A snapshot that fails `observed` is a hard stop, not an exclusion.** The rule
returns `verdict: "signal-not-observed"` naming every failing snapshot, and
writes no numbers. That direction is chosen because the alternative is the
defect's own direction: dropping a snapshot from the `min` can only _raise_
`S`, which raises the budget, which loosens the suite — silently, and most
easily on exactly the low-contrast snapshots where the perturbation is hardest
to see (`light-table-empty` and `light-skeleton-variants` are the two most
likely candidates, both large and mostly flat). Exclusion exists only as
`opts.excludedFromSignal`, an explicit `{ snapshot, reason }[]` a human passes
after looking at the diff image; it is echoed verbatim into `evidence.excluded`
and therefore into the provenance record, so it can never happen quietly. An
excluded snapshot **still contributes to `N_run`, `D90` and `R`** — its noise,
its drift and its response to a known-amplitude shift are real properties of
this suite whether or not the perturbation reached it, and dropping it from
those terms would understate `N` and overstate `R`, producing a budget that
reds on a legitimate run (success criterion 2 failing by the other road) or one
blind to the defect on that snapshot.

**Owned invariant, and who owns it.** `drift` is contaminated by construction:
the whole defect is that sub-20% UI changes have been landing without going red
for ~6 months, so some of that distance is _real un-baselined UI change_, not
noise. The `Measurement` set does not own that distinction and cannot. Revisions
1 and 2 gave the rule (5) a **statistical** mitigation — P90 rather than max —
and revision 3 retires that as the mitigation, because the measurement showed it
does not work (§ Decisions → _Why `drift` is not a noise term_): on a
distribution that is 43/49 zeros, P90 returns whatever rank 45 happens to hold,
which is a number set by how many zeros are in the set rather than by how far
the suite drifts. What the rule owns instead is **naming**: the above-P90 list by
name for item 2.4's human triage, and `evidence.driftAboveBudget` — the
snapshots whose committed baseline is further from replica-a than the emitted
budget, i.e. the regeneration precondition the emitted pair depends on.
Classifying a named outlier as "real change" versus "noise" still requires a
human looking at a diff image. That is stated as a limit, not papered over.

### `Provenance` (one record, embedded as a comment in the tolerance declaration)

```ts
// noise-floor: run <github-run-id> · <ImageOS> <ImageVersion> · playwright <version>
// noise-floor-values: threshold=<t> maxDiffPixels=<n>
```

Two lines, in the config the values live in. The second line is what the guard
compares the live directives against. Revision 2 drops the optional
` maxDiffPixelRatio=<r>` tail: clause 4 fixes the form, and a provenance grammar
that can express a value the rule never emits is a grammar the guard would have
to keep true for no reason.

**Consistency, per interaction.** A `Measurement` set is only meaningful within a
single `(ImageVersion, playwright version, chromium build)` tuple — that tuple is
the unit of validity, and it is recorded, not assumed. This is a
must-be-true-at-read-time requirement: the analyzer hard-fails on mixed tuples
rather than producing a plausible average. The `Provenance` record, by contrast,
is deliberately eventually-stale — it names the measurement that was current when
the values were set, and going stale is the _signal_ that a re-measure is due,
not a failure.

## Interfaces & contracts

### `captureLegs` — workflow run → three artifacts (cross-process, cross-machine)

- Input: one of two events, and the ref they carry **is** the measurement's
  subject. No workflow inputs are required by either.
  - `workflow_dispatch` on a chosen ref — available once this file is on
    `main`, and the path every future re-measure takes.
  - a `push` of a `measure/**` ref — the pre-merge path, which is the only one
    available to this run. `git push origin HEAD:measure/visual-noise-floor-1`
    from the run branch dispatches the instrument at that exact tree.
  - **Ordering constraint the caller must know:** these are not
    interchangeable while the file is off `main`. Attempting the dispatch half
    first is not a fallback, it is a 404 (see § Decisions & alternatives →
    _Reaching the measurement without a merge_ for the measurement behind
    that), and it costs nothing to have tried.
- Output: `visual-actuals-replica-a`, `visual-actuals-replica-b`,
  `visual-actuals-perturbed` — each 49 PNGs plus `provenance.json`.
- Timeout: `timeout-minutes: 30` per leg. The production `visual` job is the same
  work and needs no more; an unbounded leg on a personal-account repo bills until
  GitHub's 6-hour default.
- Failure modes the caller sees: a leg that fails uploads nothing, and the
  analyzer job (`needs:` all three) refuses to run rather than differencing two
  legs and inventing a third. A leg that _passes_ but writes fewer than 49 PNGs
  fails the analyzer's name-set check, by name.
- **Retry safety: safe for correctness, unsafe for mixing.** Re-dispatching is
  idempotent — it writes nothing outside its own artifacts and touches no branch.
  But a re-dispatch is a **new sample**: the runner image may have moved in
  between. Legs may never be combined across runs, which the recorded
  `ImageVersion` enforces mechanically rather than by discipline.
- Cost boundary: this workflow can never change what a required check concludes.
  Both of its triggers are deliberate acts (a dispatch, or a push to a ref
  namespace no other workflow watches — measured), it is not in `CI Gate`'s
  `needs`, and it writes no ref.

### `measure({ replicaA, replicaB, perturbed, committed, thresholds, defectAmplitude })` → `Measurement[]`

- Input: four directories of PNGs plus the sweep points. `committed` is the
  checkout's `apps/rialto-web/e2e/screenshots/`. `defectAmplitude` (default
  `36`) is the per-channel shift behind the `reproduction` pairing; it is
  echoed into the emitted set's provenance, because a set whose reproduction
  rows were taken at a different amplitude is a **different measurement**, not
  a comparable one.
- Output: the full row set (§ Data model), plus the merged provenance tuple.
- Failure modes — all hard, all naming the snapshot, none silent:
  - a name present in one directory and absent from another;
  - a dimension mismatch within a pair (the comparator would pad and report a
    size-mismatch string, which is a different measurement wearing the same
    units);
  - an unreadable or non-PNG file;
  - provenance tuples that disagree between legs.
    A skipped snapshot would lower every max and every percentile, i.e. it would
    bias the answer in the direction of _less_ sensitivity — the same direction as
    the original defect. Nothing here degrades to a default.
- Pure and in-process once the artifacts are on disk. No timeout, no retry
  semantics.

### `recommend(measurements, opts)` → `Recommendation`

The rule, stated so it can be read off the output rather than argued about.

`opts` in full — every field defaulted, every default the recommended one from
§ frontmatter `assumptions`, and the resolved set echoed into `evidence.opts`:

| field                | default | meaning                                                           |
| -------------------- | ------- | ----------------------------------------------------------------- |
| `separationFactor`   | `10`    | required signal-to-noise ratio, clause 1 and `observed`           |
| `noiseHeadroom`      | `2`     | lower clamp multiplier on `Ñ(t)`, clause 3                        |
| `signalMargin`       | `2`     | upper clamp divisor on `S(t)`, clause 3                           |
| `defectAmplitude`    | `36`    | per-channel delta of the regression that escaped, clauses 1 and 3 |
| `driftPercentile`    | `90`    | percentile over the `drift` pairing — **reported, never a term**  |
| `formReviewDecades`  | `0.3`   | headroom gap at which clause 4 flags the form for review          |
| `excludedFromSignal` | `[]`    | `{ snapshot, reason }[]` — human-supplied, evidence-carrying      |

`defectAmplitude`'s default is **not invented here.** 36/255 is the prior run's
measured largest per-channel delta of the `opacity: 0.55` regression that
shipped undetected (`defect.md` § D, carried from
`docs/features/visual-diffs-in-pr/release.md`). It is the strongest amplitude
this suite is known to have missed, and therefore the weakest thing the fix has
to catch.

For each sweep point `t`, define over the 49 snapshots:

```
signalSet   = all 49 snapshots, minus opts.excludedFromSignal

N_run(t)    = max   over snapshots of count(pairing = run,          t)
N(t)        = N_run(t)                       <- revision 3: drift is not a noise term
N0          = max(N_run(0), 1)               <- the suite's noise floor, unfiltered
Ntilde(t)   = max(N(t), N0)                  <- a measured zero is not a proven zero
S(t)        = min   over signalSet of count(pairing = signal,       t)
R(t)        = min   over snapshots of count(pairing = reproduction, t)
D90(t)      = P90   over snapshots of count(pairing = drift,        t)   <- reported only
```

`Ntilde` is written `Ñ` below.

`signalSet` is defined and defended in § Data model — all 49 by construction,
verified per snapshot by `observed(s)`, and shrinkable only by an explicit,
reasoned `opts.excludedFromSignal` entry. **Clause 0, before anything else:**
if any snapshot in `signalSet` fails `observed(s)`, return
`verdict: "signal-not-observed"` naming them, with no numbers. The instrument,
not the suite, is what that verdict is about.

`S` is a **minimum**, not a max: the suite must catch the _weakest_ instance of
the regression, and averaging over sections that changed a lot would hide the
one that barely did. `R` is a minimum for the same reason one level stricter:
the suite must catch the defect's amplitude on the baseline where that
amplitude is hardest to see. `N_run` is a max because it is uncontaminated by
construction — it is the one term in the model that is noise and nothing else.

1. **Eligibility — three tests, then take the SMALLEST `t` that passes all
   three.** Revision 2 had one test (`S(t) >= 10 * N(t)`) and took the largest.
   Run 33107801311 showed that predicate is vacuous exactly where the answer
   mattered, so it is replaced rather than patched.

   **(a) Separation is three-valued, not boolean.**

   ```
   separationState(t) = "unseparated"  if N(t) > 0 and S(t) <  separationFactor * N(t)
                        "separated"    if N(t) > 0 and S(t) >= separationFactor * N(t)
                        "unbounded"    if N(t) = 0        -- separation is UNDEFINED here
   ```

   `S >= factor * N` at `N = 0` reads `S >= 0`, which is true for every
   threshold and every signal whatsoever — so revision 2 reported
   `qualifies: true` at six sweep points on the strength of no evidence at all,
   and `qualifying[qualifying.length - 1]` took the loosest of them. The same
   function already special-cased `n === 0` one line above — `separation` is
   reported as `null` there, because the ratio is undefined — and did not for
   `qualifies`. **Undefined and satisfied are different claims, and a boolean
   cannot hold both.** `"unbounded"` records the truth — _not violated, and not
   measured_ — which is neither a disqualification (nothing is wrong with a
   threshold that has no measurable noise) nor a recommendation.

   **(b) The sweep point must not be blind to the defect's own amplitude.**
   `R(t) = 0` means a uniform `defectAmplitude` shift applied to **every pixel**
   of every one of the 49 baselines counts **zero** differing pixels at that
   threshold. That is the defect, exactly, occurring at a sweep point. It is
   folded into the budget interval below rather than tested on its own, so it
   constrains the emitted **pair** and not merely the emitted `t` — which is the
   whole of defect B, where a dramatic-looking `maxDiffPixels: 0` changed
   nothing because the per-pixel gate had already discarded the pixels.

   **(c) The budget interval must be non-empty.**

   ```
   lower(t)    = ceil( noiseHeadroom * Ñ(t) )
   upper(t)    = min( floor( S(t) / signalMargin ), R(t) - 1 )
   feasible(t) <=> lower(t) <= upper(t)
   ```

   `R(t) - 1` is where (b) does its work: a budget strictly below the
   reproduction's own count means the reproduction **fails**, structurally, for
   every pair this rule is capable of emitting. At `R(t) = 0` the interval is
   empty and the point is ineligible — disqualified **by measurement**, not by a
   fiat that Playwright's default is bad.

   ```
   eligible(t) <=> separationState(t) != "unseparated"  AND  feasible(t)
   ```

   **Select the SMALLEST eligible `t`.** Revision 2 said largest, reasoning
   _"a larger `t` is further from the noise, so it survives the next
   runner-image bump with more margin."_ That is empty at `N = 0` — there is no
   measured noise to be further from — and it is the wrong trade even where
   `N > 0`, because the two knobs do not buy the same thing:

   > **A threshold's blindness is unbounded in area; a budget's blindness is
   > bounded in area.** At threshold `t`, a change whose per-pixel colour
   > distance falls under the cutoff is invisible across _any_ number of pixels
   > — `defect.md` § A measured 139,216 of 139,216. At budget `B`, at most `B`
   > pixels can change undetected, whatever their amplitude.

   Noise tolerance is therefore spent on the **budget**, where the damage it
   admits is capped, and the threshold is taken as small as the evidence allows.
   Ten remains the stated separation default — one order of magnitude between
   signal and noise — chosen because a smaller factor puts the budget's two
   clamps in conflict.

   `N` is monotone non-increasing in `t` (verified across the sweep), so
   `separated`/`unseparated` points form a prefix and `unbounded` points a
   suffix. "Smallest eligible" therefore also prefers a point whose separation
   was **measured** over one where it is merely unbounded, without needing a
   second rule to say so.

2. **Hard stops — two, and neither is a fallback.**

   - Every sweep point `"unseparated"` → `verdict: "no-separation"`, with the
     best achievable ratio and the snapshots driving it. Pixel counting cannot
     separate this regression from this suite's noise, and the design needs
     revisiting (§ Decisions records what the next move would be).
   - Some point is not `"unseparated"` but none is `feasible` →
     `verdict: "defect-not-caught"` (revision 3), carrying `R(t)`, `lower(t)`,
     `upper(t)` and an `infeasibleReason` per sweep point: `"blind-to-defect"`
     (`R(t) = 0`) or `"clamps-cross"` (the defect is visible at that threshold,
     but not by enough to fit a budget above the noise floor). This verdict is
     what makes _"the emitted pair does not fix the defect"_ **unrepresentable**
     rather than merely unlikely.

   The rule returns no number on either.

3. **Budget magnitude**: `B = round(sqrt(Ñ(t) * S(t)))`, clamped to
   `[lower(t), upper(t)]` exactly as defined in clause 1(c). The geometric mean
   sits centrally between noise and signal on a log scale, which is the scale
   these quantities differ on; the lower clamp guarantees observed noise still
   passes (success criterion 2), and the upper guarantees both that the known
   regression still fails with a factor-of-`signalMargin` margin (success
   criterion 1) **and** that the defect's own reproduction still fails
   (`defect.md` § A).

   **Every bound is floored on a measurement rather than on a zero**
   (revision 3, defect C). `round(sqrt(N * S))` is `0` when `N = 0`, and
   revision 2's lower clamp `noiseHeadroom * N` was `0` as well, so nothing
   rescued it: the rule would pin `maxDiffPixels: 0`, and the first runner-image
   bump that moves a single pixel reds the suite — success criterion 2 failing
   by the other road, on a repo whose own `.claude/rules/gotchas.md` records
   that these baselines are Linux-CI-runner-specific and that font metrics move
   them (the 2026-08-11 image bump that broke Pulumi deploys with no repo change
   is the in-repo precedent). `Ñ(t) = max(N(t), N0)` replaces `N(t)` in both
   places. `N0` is `N_run` at the **strictest** sweep point — run-to-run noise
   measured with no filter in front of it, i.e. the suite's noise floor in the
   literal sense this run is named for. Every `N_run(t)` for `t > 0` is that
   same noise seen through a filter, so a zero there is an artefact of the
   filter and never evidence of absence. The floor of `1` covers the remaining
   case: one run of two replicas can _bound_ the noise, it cannot establish that
   noise cannot occur.

4. **Budget form — fixed, and reviewed against a named statistic.** This is
   the clause meant to end the #4450 -> #4496 -> ? flip-flop, and revision 1
   left it undecidable: a regression with no statistic, no cutoff, and a third
   branch ("both regimes present") that a single fit cannot even produce. It is
   replaced by a decision and a diagnostic, which are different things.

   **The form is `maxDiffPixels`. One key, always.** Three stated reasons, in
   order of weight — see § Decisions & alternatives → _Fixing the budget form_
   for the full argument and the measurements behind each:

   1. the ratio form has already failed here once, measured and documented in
      the live config's own comment (#4450 -> #4496);
   2. image width is near-constant across the set (1184 / 1216 / 1232 px, a
      4.05% spread), so a ratio budget is an absolute budget scaled by section
      _height_ — a quantity that predicts content poorly;
   3. `parseMaxDiffPixels` on `main` returns `null` the moment a
      `maxDiffPixelRatio` appears (`scripts/visual-diff-report.mjs:265`), so a
      ratio silently degrades a feature that shipped four days ago.

   **The diagnostic**, computed at the selected `t` and reported, never acted
   on automatically. The named statistic is **feasible-interval headroom, in
   decades** — how many orders of magnitude of slack a form leaves between "all
   observed noise still passes" and "the known regression still fails":

   ```
   H_abs   = log10( (S(t) / signalMargin)   / (noiseHeadroom * Ñ(t)) )
   H_ratio = log10( (Sr(t) / signalMargin)  / max(noiseHeadroom * Nr(t), 1 / maxArea) )
   ```

   where `Sr` and `Nr` are the identical aggregates taken over the `ratio`
   column instead of `count`. Revision 3 replaces the absolute domain's
   `max(…, 1)` floor with `Ñ(t)`, which is already floored on a measurement
   (clause 3) rather than on the arbitrary constant `1`; the ratio domain keeps
   its `1 / maxArea` quantum, which is the smallest resolvable non-zero
   quantity there. Headroom, not correlation, because
   headroom is the thing actually at stake — margin before the next
   runner-image bump — and correlation is only ever a proxy for it. Both
   branches are defined and exhaustive:

   - `H_ratio - H_abs > formReviewDecades` (0.3 decades, i.e. the ratio form
     would leave more than double the slack) → `evidence.formReview =
"ratio-has-more-headroom"`, carrying both numbers. **The emitted form does
     not change.** This is a stated trigger to re-open the form decision at
     Architect with a measurement in hand — which is the opposite of the
     unreasoned reversal this clause exists to stop.
   - otherwise → `evidence.formReview = "absolute-confirmed"`.

   **"Both regimes present" is retired**, along with the both-keys
   `Math.min(maxDiffPixels1, maxDiffPixels2)` form (`coreBundle.js:7556-7562`).
   It was never a third regime — it is a third _policy_, tighter than either
   key alone, and the clamps in clause 3 already control tightness directly. It
   has never executed in this repo's history, and emitting it would trip
   reason 3 above for no gain.

- Output: `{ verdict, threshold, maxDiffPixels?, evidence }`. `maxDiffPixelRatio`
  is never emitted — clause 4 fixes the form. `evidence` carries `opts` as
  resolved; `N_run`, `N`, `N0`, `Ñ`, `S`, `R`, `separationState`, the separation
  ratio, `budgetInterval` and `feasible` **per sweep point** (so a reader can
  see why every rejected point was rejected, which is the thing revision 2's
  single `qualifies: true` column hid); the `observed(s)` result per snapshot;
  `excluded`; `H_abs`, `H_ratio`, `formReview`; `defectMargin = R(t) - B`; the
  above-P90 `drift` outlier list by name; and `driftAboveBudget` — everything
  the provenance comment and the Verify stage need, with no re-derivation.
- **Verdicts, all five, none of them a guess:** `"ok"` (a pair), three hard
  stops — `"signal-not-observed"` (clause 0: the instrument did not perturb
  something it should have), `"no-separation"` (clause 2: pixel counting cannot
  separate this regression from this suite's noise), `"defect-not-caught"`
  (clause 2, revision 3: no sweep point admits a budget that both clears the
  noise floor and stays under the defect's own reproduction) — and a throw on a
  malformed measurement set. On a `"no-separation"` return the rule also reports
  `evidence.ratioDomainSeparation = Sr(t) / Nr(t)` at the best `t`: if that
  clears `separationFactor` while the absolute domain did not, the route back
  to Architect is a form question rather than a comparator question. Recorded,
  never auto-taken.
- Failure modes: an empty or partial measurement set throws; it never
  extrapolates across a missing sweep point. A set with no `reproduction` rows
  throws for the same reason a set with no `t = 0` rows does — clause 1(b)
  becomes unevaluable, and the rule never skips a clause it cannot evaluate.
- Pure.

#### What the corrected rule emits against run 33107801311

Re-evaluated **offline**, on the run's own 1,176 rows plus 392 `reproduction`
rows computed locally from its `visual-actuals-replica-a` artifact (49 PNGs,
downloaded, not re-rendered). No new dispatch, no new leg, no new billing.
Recorded here as verification that the corrected rule works — **not** as
authorization to write it; item 2.5 still reads the verdict and item 3.2 still
writes the config.

```
verdict: "ok", threshold: 0, maxDiffPixels: 674
N0 = 4   (run-to-run noise at t = 0, floored at 1)

    t  N_run  N  Ñ       S       R  separationState  lower  upper  feasible  eligible
    0      4  4  4  113509  113840        separated      8  56754      true      true
0.005      0  0  4  113463  113840        unbounded      8  56731      true      true
 0.01      0  0  4  113414  113840        unbounded      8  56707      true      true
 0.02      0  0  4   49316  113840        unbounded      8  24658      true      true
 0.05      0  0  4   44289   79091        unbounded      8  22144      true      true
  0.1      0  0  4   40865   46900        unbounded      8  20432      true      true
 0.15      0  0  4   39310       0        unbounded      8     -1     false     false
  0.2      0  0  4   17967       0        unbounded      8     -1     false     false

defectMargin = R - B = 113166
driftP90 (reported only) = 7
driftReview = "regeneration-required"
driftAboveBudget:
  light-button-variants.png            124577
  light-master-override-variants.png    42005
  dark-dark-banner.png                  24486
  dark-dark-cards.png                    9583
```

Three things to read off that table.

**The defect-blindness gate removes exactly the two sweep points revision 2's
`largest` would have taken, and removes them on evidence.** `R = 0` at `t = 0.15`
and `t = 0.2` is a measured fact: a uniform 36/255 shift applied to 100% of the
pixels of every one of the 49 baselines counts **zero** differing pixels there.
It agrees independently with `defect.md` § B, which recorded the smallest
_failing_ uniform delta as 40/255 at `t = 0.15` and 53/255 at `t = 0.2` — 36 is
under both. No clause anywhere says "0.2 is Playwright's default, so reject it".

**`t = 0` is the only sweep point whose separation is a measurement.** It is the
only one where `N > 0`, so it is the only `separated` point; every other point is
`unbounded`. Selecting the smallest eligible `t` selects the only evidenced one,
which is a property of the ordering rather than a coincidence of this dataset
(§ clause 1: `N` is monotone, so measured points are always a prefix).

**Both success criteria hold at the emitted pair, from the same rows.** SC-1: the
weakest `signal` count is 113,509 > 674, so all 49 perturbed snapshots fail —
against the prior run's 49-of-49 pass. SC-2: the largest `run` count anywhere is
4 <= 674, a 168x margin, so two real Linux runners at the same commit still agree.

### `readToleranceDirectives(configSource)` → `{ threshold, maxDiffPixels, maxDiffPixelRatio, occurrences }`

- Input: the config file's **text**.
- Output: each directive's numeric literal or `null` if absent, plus a per-key
  occurrence count so a caller can distinguish "absent" from "ambiguous".
- Failure modes: a non-string, an empty string, or an unterminated string literal
  yields all-`null` with zero occurrences — say less rather than guess. A value
  that is not a numeric literal (an identifier, an expression) is reported as
  present-but-unreadable, which the guard treats as a failure and
  `parseMaxDiffPixels` treats as `null`.
- Pure. `parseMaxDiffPixels`'s existing null-on-ambiguity policy is unchanged and
  is expressed on top of this, not duplicated inside it.

### `visual-tolerance-guard` — the assertions

Every one of these stays green through a legitimate re-tune and reds on a silent
one. None of them names a number.

1. **`threshold` is present as an explicit numeric literal.** The defect is
   precisely that it was never set and inherited 0.2 by omission for ~6 months.
   Deleting it again reds. This is the direct analogue of
   `pulumi-cli-pin.test.mjs`'s "installs an explicit CLI version instead of
   inheriting the runner image's".
2. **`maxDiffPixels` is live as a readable numeric literal, and
   `maxDiffPixelRatio` is absent.** Revision 2 tightens this from "at least one
   budget directive is live" now that clause 4 fixes the form. It still names
   no number — it asserts a _shape_, and the shape has two live consumers:
   `parseMaxDiffPixels` (which returns `null` the moment a ratio appears,
   `scripts/visual-diff-report.mjs:265`) and the measured #4450 -> #4496
   incident. This is deliberately NOT the trap the guard's fifth assertion
   avoids: it reds on a change of _form_, which is an Architect-level decision
   that should require a design pass, not on a change of _value_, which is the
   expected re-tune lifecycle and stays green.
3. **No `toHaveScreenshot` call site in `apps/rialto-web/e2e/visual.spec.ts`
   passes `threshold`, `maxDiffPixels`, or `maxDiffPixelRatio`** — the
   single-point-of-control invariant from module (1).
4. **The provenance lines exist and parse.**
5. **`noise-floor-values` equals the live directives**, key for key. This is the
   whole design of the guard: the comparison is between the file and _itself_,
   so there is no external constant to bump. Change a value and forget the
   evidence line and it reds, naming both sides; change both together — which is
   what a legitimate re-tune does — and it stays green. The trap the prior run
   rejected (`architecture.md` § `parseMaxDiffPixels`: a drift test whose "only
   guarantee is that a red CI run forces someone to edit it — on the very PR that
   legitimately changes the budget") is avoided because the guard's second
   operand travels with the first.

- **Stated limit:** it cannot verify that a measurement actually happened, only
  that the author was made to name one. A run id can be typed. That is a real
  gap and the honest ceiling for a static guard; the alternative — re-running the
  instrument in CI to check — costs three runner legs per PR and would make the
  guard the most expensive thing in `CI Gate`.

## Stack & dependencies

- **No new runtime or dev dependency.** The comparator comes from the already-installed
  `playwright-core@1.62.1` via `utils.getComparator`, and PNG headers are read
  with 8 bytes of `Buffer` arithmetic. Adding `pixelmatch` directly would be a
  _different_ pixelmatch than the one the suite runs — a measurement of a
  lookalike.
- **Plain `.mjs` in `scripts/` + vitest in `scripts/__tests__/`** — the shape
  `visual-diff-report.mjs`, `publish-visual-diffs.mjs`, `pulumi-r2-validation-guard.mjs`
  and their tests already use. Nothing here needs TypeScript's help that JSDoc
  does not give.
- **Textual reads of the config, the spec, the perturbation CSS and the
  workflow, not YAML/TS/CSS parsing** — the same reasoning
  `pulumi-cli-pin.test.mjs` records, and the reasoning
  `visual-diff-ref-trigger-safety.test.mjs` states at length: adding a parser
  touches `pnpm-lock.yaml`, which is a turbo `globalDependencies` entry, so
  every task in the monorepo cache-busts for it. The price is paid in the
  readers instead, which is why the coverage test in module (3) must **fail
  closed** on a shape it does not recognise rather than report "nothing found".
- **A second Playwright config for the perturbed leg**, following
  `playwright.csp.config.ts`. Cost is one file; the thing bought is that the
  production config has no branch in it.
- **`ubuntu-latest`, deliberately unpinned**, unlike the Pulumi CLI. The
  production `visual` job runs on `ubuntu-latest`; pinning the _instrument_ to a
  fixed image would measure a machine the suite does not run on. The Pulumi
  lesson is applied differently here — the image version is **recorded** in every
  measurement rather than frozen, so a future re-measure can attribute a change
  instead of a deploy silently changing underneath.

## Decisions & alternatives

- **Build a measuring instrument** over **pick a number from the § B sensitivity
  curve** — the curve is synthetic (a uniform channel shift on one baseline) and
  says nothing about what two real Linux runs do to each other; picking off it
  would repeat #4496's mistake with a different knob.
- **Take the smallest eligible threshold and spend noise tolerance on the
  budget** over **take the largest qualifying threshold** (revisions 1-2) — the
  full argument is in § `recommend` clause 1 and rests on one asymmetry: a
  threshold's blindness is unbounded in area, a budget's is bounded in area. The
  measured cost of the old direction on run 33107801311's data was an 84% loss
  of detection power (`S` 113,414 -> 17,967) across six sweep points that
  qualified for nothing at all.
- **Capture legs are tolerance-blind; all comparison is offline** over **one CI
  run per candidate tolerance** — the latter costs a paid runner leg per
  candidate, and returns pass/fail where the rule needs counts.
- **`includeAA` stays at pixelmatch's default `false`** over **turning
  anti-aliasing detection off**. Three reasons, in order of weight:
  1. **It is not a knob this suite has.** Playwright 1.62.1 calls pixelmatch with
     an object literal containing exactly one key —
     `pixelmatch(expected.data, actual.data, diff.data, w, h, { threshold: options.threshold ?? 0.2 })`
     (`coreBundle.js:7550-7552`). `includeAA` is never forwarded from any config
     or matcher option. Reaching it means patching a vendored third-party file
     inside `playwright-core`'s bundle; `package.json` declares no
     `pnpm.patchedDependencies` at all, so this would introduce a patching
     mechanism the repo has never used, to reach a default that upstream may
     re-bundle at any minor version.
  2. **It is not what missed the regression.** Capture measured 130,114 of
     139,216 pixels counted at `threshold: 0` — the AA gate exempted ~6.5%, and
     the budget in front of it was 300. Gate 1 explains the false negative
     completely; gate 2 never came within three orders of magnitude of being
     decisive.
  3. **Its direction is the useful one.** The pixels it discards are glyph and
     border edges — exactly the pixels most likely to move for reasons unrelated
     to a code change (font-package bumps across runner images, the documented
     source of macOS-vs-Linux baseline divergence). Disabling it raises signal
     and noise together and forces the whole instrument to be re-run. This third
     reason is reasoning, not measurement, and it is the weakest of the three;
     the first alone settles it.
     The alternative that _would_ escape the AA gate inside the public API is
     `comparator: "ssim-cie94"` — genuinely forwarded (`expect.js:12616`, and
     `_comparator` is aliased at `expect.js:12426-12429`) and reaching a code path
     with no anti-aliasing exemption at all (`coreBundle.js:7543-7548`). It loses:
     it is absent from `types/test.d.ts` and so needs a cast in a typed config, and
     it hardcodes `maxColorDeltaE94: 1` and **ignores `threshold` entirely** —
     trading a tunable knob for a fixed perceptual one. It is, however, the right
     next move if the rule returns `no-separation`, and is recorded here so that
     branch is not re-discovered from scratch.

#### Fixing the budget form (revision 2 — closes Decompose design gap 2)

**`maxDiffPixels`, fixed by fiat, with the regression demoted to a reported
diagnostic** over **letting a correlation test choose the form**, which is what
revision 1 said and what Decompose correctly refused to implement.

Revision 1's instinct — "a rule that reads the answer off the data is the only
version of this decision that does not need to be made again" — is right about
the _goal_ and wrong about the _instrument_. Regressing `count` on `area` across
these 49 snapshots cannot carry that weight, for reasons that are measurable
rather than aesthetic:

- **The independent variable barely varies.** Measured across the 49 committed
  baselines: widths are `1184`, `1216`, `1232` — three values spanning 4.05%.
  Heights run 99 -> 850. So `area` is height times a constant, and "does noise
  scale with canvas?" is really "does noise scale with section height?" —
  which is a question about content density, not canvas, and height is a poor
  proxy for it (`light-table-empty`, 1232x207, is mostly nothing;
  `dark-dark-badges`, 1184x99, is almost entirely glyph edges).
- **The dependent variable is contaminated.** Revision 1 fit the regression on
  the `drift` pairing — the one pairing § Data model already says contains real
  un-baselined UI change, i.e. a handful of large, high-leverage outliers. OLS
  is maximally sensitive to exactly those. A fit whose residuals are dominated
  by contamination the design elsewhere refuses to trust cannot be trusted to
  pick the form either.
- **The evidence against the ratio form is not absent — it is a documented
  incident.** `apps/rialto-web/playwright.config.ts`'s own live comment records
  it: under `maxDiffPixelRatio: 0.01` a 45px row-height growth on
  `tape-chart-stress` passed, because a ratio buys the most slack exactly where
  a sparse whole-row change is easiest to hide. That is a measured in-repo
  failure of the ratio form on this very suite.
- **A ratio is now a live regression to a shipped feature.** `parseMaxDiffPixels`
  returns `null` the moment `maxDiffPixelRatio` appears in the config text —
  `scripts/visual-diff-report.mjs:265`,
  `if (source.match(MAX_DIFF_PIXEL_RATIO_PATTERN)) return null;` — and that file
  is on `main` as of PR #4569. See the correction bullet below.

So the honest conclusion is the boring one the dispatch brief asked for: the
evidence available at `n = 49` cannot distinguish the regimes, and a defensible
constant beats an undecidable rule. What survives from revision 1's intent is
the requirement that the fiat stay _re-examinable_: clause 4 still computes a
named statistic (feasible-interval headroom, in decades) against an explicit
boundary (0.3 decades), reports `formReview` on every run, and routes a
contradicting measurement back to Architect. The difference is that the number
now reviews the decision instead of silently reversing it — which is precisely
the failure mode #4450 -> #4496 was.

- **Correction (revision 2): PR #4569 is MERGED**, 2026-08-26T04:30:41Z, squash
  commit `8bd4f675`. Revision 1 called it unmerged and accepted a cross-run
  merge-order cost on that basis; **that cost is moot**, verified two ways:
  `git diff origin/main -- scripts/visual-diff-report.mjs` is empty (the file
  on `main` is byte-identical to this branch's), and
  `gh pr view 4569` reports `state: MERGED`. What the correction does _not_ do
  is remove the coupling — it inverts its polarity. `parseMaxDiffPixels` is now
  live on `main`, so emitting a ratio would degrade a real, shipped PR comment
  from `N px of budget` to `N px changed` today, rather than creating a
  merge-order hazard with an unmerged branch tomorrow. That is reason 3 in
  clause 4, and it argues for the absolute form rather than against touching it.
  Teaching the comment to render a per-image budget stays out of scope: with
  the form fixed to a single absolute key, there is no per-image budget to
  render.
- **Provenance self-consistency** over **a `PINNED` constant in the test file**
  (`pulumi-cli-pin.test.mjs`'s shape) — that shape is right when the correct
  value is externally fixed and a change is presumed wrong, and wrong here, where
  re-tuning after a re-measure is the _expected_ lifecycle. It is also the exact
  shape `docs/features/visual-diffs-in-pr/architecture.md` rejected for this same
  budget.
- **The instrument's replica-a artifact is the baseline source** over
  **the documented `rialto-web-visual-diffs` procedure** — the documented
  artifact exists only on failure and carries only failed snapshots, so a
  tightening that flips 40 of 49 leaves 9 stale. Replica-a is unconditionally all
  49, from the same runner label, at the dispatched commit. The documented
  constraint that matters (never macOS-rendered, taken from a Linux run at the
  PR's base commit) is satisfied more strictly, not relaxed.
- **Which replica becomes the baseline: `a`, arbitrarily** — and the arbitrariness
  is safe _because_ of the rule's lower clamp. A `b`-like future run then sits
  `N_run` away from the committed baseline, and `2 * N(t)` is derived to cover
  exactly that. If replica-a and replica-b differ by more than the selected
  budget, the rule reports `no-separation` — that is the same hard stop, arriving
  from the noise side.
- **A separate workflow file** over **a gated job inside `rialto-web-e2e.yml`** —
  that workflow triggers on push and pull_request paths, so a fourth job there
  is an `if:` expression away from running on every PR touching
  `apps/rialto-web/**`, three extra runner legs at a time.

#### Reaching the measurement without a merge (revision 2 — closes Decompose design gap 3)

**`push: branches: ["measure/**"]` alongside `workflow_dispatch`** over three
alternatives, none of which survives the run's authorization or its budget.

First, what was actually measured, because the constraint gap 3 states is real
but its shape matters:

- `GET /repos/…/actions/workflows/visual-noise-floor.yml` returns
  **`404 Not Found`** today. The dispatch endpoint
  (`POST /actions/workflows/{id}/dispatches`) addresses the same registry, so a
  file the registry cannot name cannot be dispatched.
- The registry is derived from the **default branch**, and this repo contains a
  live demonstration. `coverage-gate.yml` and `worktree-cleanup.yml` are
  present in `.github/workflows/` on `chore/codeburn-mcp-hygiene`,
  `chore/claude-bash-guard-e2e-reviewer` and
  `advisor/002-session-events-authorization`, and absent from `origin/main`.
  The registry reports both as **`state: "deleted"`** — not "active on some
  branch". For contrast, `visual-diff-ref-sweep.yml`, on `main` since
  `8bd4f6758`, reports `state: "active"`.
- The requirement is **narrower than "dispatch only works on the default
  branch"**, and the difference is load-bearing: the `--ref` may be any branch.
  This repo has `workflow_dispatch` runs on non-`main` branches today (`CI` and
  `tier-classifier` both appear in `gh run list` with `headBranch != main`). It
  is the **file's presence on the default branch** that is required, not the
  ref's identity. Worth stating precisely, because "dispatch needs main" would
  wrongly rule out the post-merge re-measure path as well.
- I did **not** attempt a live dispatch of a `state: "deleted"` workflow to
  confirm the refusal. That is a POST that either fails or starts a real,
  billed run, and neither outcome is worth taking to prove a point the registry
  already makes. Stated as a limit rather than papered over.

And what makes the alternative work — the same run that this design's
`parseMaxDiffPixels` coupling comes from:

- **A `pull_request`-triggered workflow runs the PR head's own file.** Measured
  on PR #4569: run `32903163602`, event `pull_request`, branch
  `feat/visual-diffs-in-pr`, created 2026-08-25T21:50:52Z, contains a job named
  **`Publish Visual Diffs`** which concluded `success`. That job was introduced
  by #4569 itself, which merged 6h40m later at 2026-08-26T04:30:41Z — so it ran
  from a workflow file that did not exist on `main` at the time. Non-dispatch
  events resolve the workflow from the event's ref; `workflow_dispatch` is the
  exception.

The alternatives, and why each loses:

- **Merge `visual-noise-floor.yml` to `main` first** — one file, dispatch-only,
  `CI Gate`-neutral. It is also a merge, which is an external commitment only
  the user can authorize, and this run is prepare-and-stop. Not available, and
  not worked around: the design does not need it.
- **`on: pull_request`, the shape run 1 used** — it works (measured above) and
  it costs. Three `ubuntu-latest` legs fire on _every_ push to the run's PR, on
  a personal-account repo that pays for Actions, to produce a measurement that
  is only wanted once. And run 1's own finding **D1** — that a `pull_request`
  `paths:` filter evaluates against the PR's cumulative `base...head` diff
  rather than the individual push — **cuts the other way here**. For run 1, a
  cumulative filter meant the workflow kept running as the PR grew. For a
  self-triggering workflow, the file is permanently in its own PR's diff, so a
  `paths:` filter naming it matches on every push forever, and one naming
  anything else never matches at all. `paths:` cannot bound the spend in either
  direction. D1 helped run 1 and hurts this one.
- **`on: pull_request: types: [labeled]`, or a job-level `if:` on a label** —
  cheap, but it requires adding a label to a PR, and this run is under an
  explicit no-tracker-interaction constraint. It also puts the trigger for a
  measurement in a place `git log` cannot see.
- **A cheap `gate` job plus `if:` on the three legs** — still bills a job per
  push, and invents a coordination artifact. `measure/**` is the same idea with
  the gate expressed as "did you push the ref", which git already records.

What the chosen shape costs and guarantees, measured rather than asserted:
running this repo's own `visual-diff-ref-trigger-safety` normaliser over all of
`.github/workflows/` against the ref `measure/visual-noise-floor-1` returns
**no workflow that would fire**, and the same guard returns **zero violations**
for this workflow's own `push: branches: ["measure/**"]` filter. So the total
spend of a measurement is exactly its own three capture legs plus the analyze
job, once per deliberate push, and zero on every ordinary push to
`fix/visual-tolerance-threshold`.

**Residual, stated plainly.** This closes gap 3 **without** any merge and
therefore **without** blocking on user authorization. It does require pushing a
branch to `origin` — which the run already does (item 3.5 opens a PR). If even
a branch write were withheld, the run would be blocked, and the ask would then
be narrow and specific: authorize merging the single file
`.github/workflows/visual-noise-floor.yml` to `main` ahead of the run's PR. It
is not being asked for.

#### The signal term could not see the defect (revision 3 — closes defect B)

**A fourth `reproduction` pairing, folded into the budget's upper clamp** over
**trusting `S(t)` to stand for "the suite catches regressions"**, which is what
revisions 1 and 2 did and what run 33107801311 falsified.

`S(t)` is the minimum over the signal set of **one** perturbation,
`opacity: 0.55`. That perturbation produces large per-pixel colour distances, so
`S` stays far above any plausible budget across the whole sweep —
`S(0.2) = 17,967`. No term in the rule was a function of **amplitude**, so a
threshold that cannot see a 36/255 shift over every pixel of every baseline
passed the signal test comfortably. The consequence, measured against the real
baseline `light-button-variants.png` (1232x113 = 139,216 px) by driving the
installed comparator exactly as `scripts/visual-noise-floor.mjs` does:

```
delta | LIVE today {t:unset->0.2, max:300} | rev2 rule {t:0.2, max:0} | rev3 rule {t:0, max:674}
------|------------------------------------|--------------------------|-------------------------
    1 | PASS                               | PASS                     | FAIL 130114 px differ
   20 | PASS                               | PASS                     | FAIL 130114 px differ
   36 | PASS                               | PASS                     | FAIL 130114 px differ
   52 | PASS                               | PASS                     | FAIL 130114 px differ
   53 | FAIL 88321 px differ               | FAIL 88321 px differ     | FAIL 130114 px differ
```

The middle column is the whole of defect B: `maxDiffPixels: 300 -> 0` reads as a
dramatic tightening and is **behaviourally identical to today's config on every
row**, because the per-pixel gate discards the pixels before the budget is ever
consulted. Written into the config, this run would have closed looking
successful while `defect.md`'s reproduction still reproduced verbatim — a false
negative inside the fix for a false negative.

Alternatives, and why each loses:

- **A fourth capture leg carrying a deliberately weak perturbation** — the
  honest fix to the signal's unrepresentativeness, and it costs an extra
  `ubuntu-latest` leg plus a fresh dispatch on a personal-account repo that pays
  for Actions, to measure something that is not a rendering property at all. The
  regression class the defect is about is a **colour distance**, and a colour
  distance can be applied to bytes.
- **Let the rule call the comparator and check the pair itself** — that puts
  policy on top of a vendored third-party bundle and makes the rule untestable
  without images, losing the property (§ Components 5) that the rule is
  reviewable as arithmetic. `reproduction` keeps the direction intact: the
  analyzer owns the comparator and emits integers, the rule reads integers.
- **Post-check the emitted pair rather than clamping to it** — a check that can
  fail _after_ selection has to decide what to do next. Clamping makes the good
  outcome structural and leaves `"defect-not-caught"` for the genuinely
  different case where no budget exists at any sweep point.

#### Why `drift` is not a noise term (revision 3)

**`N(t) = N_run(t)`, with `drift` retained in full as a triage list and a
regeneration precondition** over **`N(t) = max(N_run(t), P90(drift, t))`**, which
is what revisions 1 and 2 specified.

The premise checks out: breakdown item 3.3 ships `replica-a` as all 49
baselines, after which committed-baseline distance is zero by construction, so
`drift` describes the state this run **destroys**. At `t = 0` it did change the
answer — `N_run = 4` against `N_drift = 7`, making `N` 7 rather than 4. But the
decisive reasons are what the measurement shows about the term itself:

- **It is not noise, and it is not marginal about it.** `drift` is non-zero on 6
  of 49 snapshots at `t = 0`: 124,577 / 42,005 / 24,486 / 9,583 / 7 / 4. The top
  four are one to two orders of magnitude above anything the `run` pairing
  produced anywhere in the sweep. They are real un-baselined UI change — the
  defect's own six-month consequence — and feeding them into a noise floor
  loosens the suite using evidence of the very changes it failed to catch.
- **P90 is not a de-contaminant on this distribution.** 43 of 49 values are
  zero, so nearest-rank P90 returns whatever rank 45 happens to hold: 7, 2, 0,
  0, 0, 0, 0, 0 across the sweep. It suppressed the four outliers here only
  because there were four of them; with six, rank 45 would have been one. A
  statistic whose value is set by how many zeros are in the set is not measuring
  the quantity it is named for.
- **The headroom argument that put it in `N` is better served elsewhere.** "The
  only defensible floor under the budget once the baselines are refreshed" is
  answered by clause 3's `N0`, which is uncontaminated by construction.

What `drift` keeps: the pairing, the P90, and the above-P90 outlier list by name
— item 2.4's human triage input, unchanged — plus one new output,
`evidence.driftAboveBudget`: the snapshots whose committed baseline sits further
from `replica-a` than the emitted budget. That list **is** the precondition the
emitted pair depends on, because the pair is green only for baselines equal to
`replica-a`. On this data it names four snapshots, a fact items 2.4 and 3.3 can
both act on, and one the old single-number P90 hid inside an aggregate.

Effect on this run's answer, measured both ways: `threshold` unchanged at `0`;
`maxDiffPixels` 891 with `drift` in `N`, **674** without.

### Blast-radius ordering (a design constraint, per Capture § Why architect 4)

Not a work plan — the invariant a plan must satisfy. **The tolerance change and
the regenerated baselines are one PR, and that PR's own
`Visual Regression (rialto-web)` job is green before it merges.** #4496 merged
with its own visual check red and left `main` red for 41h14m; the mechanism was
splitting a sensitivity change from the baselines it invalidated. The instrument
makes the pairing structural rather than procedural: replica-a _is_ the new
baselines and _is_ the measurement the values came from, so a PR carrying one
without the other is a PR that could not have been produced by the designed path.
The residual hazard the design accepts: between dispatch and merge, `main` may
land a real UI change, which invalidates the captured baselines. Detection is
free — that PR's own visual job goes red — and the recovery is a re-dispatch at
the new base commit, not a force-through.

### Traceability

| Requirement                                              | Source                                      | Module                                                                |
| -------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Subtle perturbation now fails                            | brief SC-1                                  | (3) signal leg, (5) rule clauses 1-3                                  |
| Legitimate noise still passes                            | brief SC-2                                  | (2) replicas a/b, (4) `run` pairing, (5) lower clamp                  |
| `threshold` set on evidence                              | defect § Why architect 1                    | (2)+(4)+(5) end to end                                                |
| Budget re-derived jointly with `threshold`               | defect § Why architect 2                    | (5) clauses 3-4 (both terms are functions of the selected `t`)        |
| Absolute vs ratio decided by a stated rule               | defect § Why architect 3                    | (5) clause 4 + § Decisions → _Fixing the budget form_                 |
| Baseline regeneration without redding `main`             | defect § Why architect 4, brief constraints | (2) replica-a artifact + § Blast-radius ordering                      |
| Guard against silent drift                               | brief § Scope                               | (6) reader, (7) guard                                                 |
| `includeAA` explicitly decided                           | dispatch brief                              | § Decisions & alternatives                                            |
| Required checks unchanged                                | brief constraints                           | (2) triggers on dispatch and `measure/**` only, and is in no `needs:` |
| `packages/rialto` untouched                              | brief § Out                                 | no module reads or writes it                                          |
| Signal set defined and derivable                         | breakdown design gap 1                      | (3) CSS + coverage test, (5) clause 0 + § Data model                  |
| Budget form has a decision boundary                      | breakdown design gap 2                      | (5) clause 4 (`H_abs` / `H_ratio`, 0.3 decades)                       |
| Measurement reachable under prepare-and-stop             | breakdown design gap 3                      | (2) `push: branches: ["measure/**"]`                                  |
| A vacuous qualification is not a qualification           | run 33107801311 defect A                    | (5) clause 1(a) `separationState`                                     |
| The emitted pair must fail the defect's own reproduction | run 33107801311 defect B                    | (4) `reproduction` pairing, (5) clause 1(b)+(c), (8) standing test    |
| No bound is ever derived from a measured zero            | run 33107801311 defect C                    | (5) clause 3 (`N0`, `Ñ`)                                              |

## ADRs

**None — no decision met the bar.** Every choice here is reversible for the cost
of editing two numbers and re-dispatching one workflow; nothing is hard to
reverse, which is the criterion that fails.

**Re-checked in revision 2, since one candidate got stronger and one
disappeared.** The revision-1 candidate — the both-keys
`min(maxDiffPixels, maxDiffPixelRatio)` form — is gone: clause 4 no longer emits
it, so there is no decision left to record.

Its replacement, fixing the budget form to `maxDiffPixels` by fiat, is the
closest thing here to an ADR and still misses. It is a real trade-off with a
documented history of reversal (#4450 -> #4496), and it is mildly surprising
without context. But it fails the first test outright: it is **one config line
and one guard assertion to reverse**, and the design deliberately builds the
re-examination into the instrument — `evidence.formReview` reports on every run
whether the measurement contradicts the fiat, against a stated 0.3-decade
boundary. A decision that re-derives its own evidence each time it is exercised
is better served by executable code in `scripts/visual-tolerance-rule.mjs` and
by the config's provenance comment than by a document describing a choice made
once.

Design gap 3's closure was also considered and rejected for the same reason: a
workflow trigger is two lines of YAML, guarded by a test that already exists in
the repo.

**Re-checked again in revision 3.** The new candidate is the
`reproduction`-pairing gate — the decision that the rule may never emit a pair
blind to `defectAmplitude`. It is a real trade-off (it removes sweep points that
the noise data alone would have allowed) and it is surprising without context
(it is why the answer is `t = 0` and not `t = 0.2`). It still misses on
reversibility: it is one clamp term and one `opts` default, and the design makes
it self-re-deriving — `R(t)` is recomputed on every run and reported per sweep
point, so the evidence for the gate arrives with every use of it. And unlike a
document, the gate has an executable counterpart in `CI Gate`
(§ Components 8) that fails when it stops being true.

## Hand-off

Next stage: **Decompose (second pass)** —
`docs/fixes/visual-tolerance-threshold/breakdown.md`. Work items are
deliberately absent here per the protocol. Three things Decompose must not lose:

- The instrument has to be **run and its output read** before any tolerance
  value is written. A breakdown that lands the config change before the
  measurement reproduces #4496 inside its own fix.
- The `drift` outlier list needs a human (or a reviewing stage) to look at diff
  images and classify each named snapshot as real un-baselined change versus
  noise. It is a judgement the rule explicitly does not make.
- `verdict: "signal-not-observed"` is a **third** hard stop, distinct from
  `no-separation`: it says the instrument failed, not that the suite cannot be
  tuned. Its recovery is to fix the perturbation (or record an
  `excludedFromSignal` entry with a reason after looking at the diff image) and
  re-run the **pure rule offline** against the artifacts already on disk — not
  to re-dispatch.
- `verdict: "defect-not-caught"` is a **fourth**, and its recovery is neither of
  the above: it says the sweep contains no threshold at which a budget can sit
  both above the noise floor and below the defect's own reproduction. That is a
  design question (a finer sweep at the low end, or the `ssim-cie94` route § Decisions
  records), not an instrument failure and not a re-dispatch.
- **No item may write a tolerance value that has not passed clause 1(b).** The
  standing test in § Components 8 is what enforces that after the run ends, and
  it is the regression test `defect.md` § Defect says Verify will need.

### What revision 3 invalidates in the existing breakdown

Milestone 1 and items 2.1-2.3 **ran and are vindicated** — the instrument, the
three legs, the provenance guard, the perturbation, clause 0 and the
`measure/**` trigger all did exactly what they were cut to do, and the
measurement they produced is reusable and is not re-taken. What changes is the
rule and the two items that read it.

| Item                   | Why it needs re-cutting                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.3** (`measure()`)  | Re-open. Gains the fourth `reproduction` pairing and the `defectAmplitude` parameter (default 36, echoed into provenance). Row count becomes `names x 4 x thresholds` = 1,568. No new leg, no new dependency, no capture change.                  |
| **1.4** (clauses 0-3)  | Re-open. Clause 0 stands verbatim. Clause 1 is replaced (three-valued `separationState`, the `R(t) - 1` clamp, `feasible`, **smallest** eligible `t`); clause 2 gains `"defect-not-caught"`; clause 3 gains `N0` / `Ñ`; `N` drops the drift term. |
| **1.5** (clause 4)     | Small re-cut only: `H_abs`'s floor becomes `Ñ(t)` instead of `max(…, 1)`. Both branches and the 0.3-decade boundary are unchanged.                                                                                                                |
| **2.4** (drift triage) | Unchanged in kind, sharper in input: it now triages `evidence.driftAboveBudget` (4 named snapshots) as well as the above-P90 list, and it no longer feeds `N`, so its "Blocked by" edge into 2.5 is advisory rather than arithmetic.              |
| **2.5** (read verdict) | Gains a fourth branch, `"defect-not-caught"`, with the recovery in § Hand-off. Its `"ok"` branch also records `R(t)`, `defectMargin` and `driftAboveBudget`.                                                                                      |
| **3.1** (drift guard)  | Unchanged. Its five assertions still name no number.                                                                                                                                                                                              |
| **NEW 3.1b**           | `scripts/__tests__/visual-defect-reproduction.test.mjs` — § Components 8. TDD unit of its own, authored RED against the current config, green after 3.2. It is the item that makes `defect.md` § A a standing regression test.                    |
| **3.4** (demonstrate)  | Gains a third demonstration alongside SC-1 and SC-2: the `defect.md` § A table re-run at the written pair, quoted, with every row failing.                                                                                                        |

### What revision 2 invalidates in the existing breakdown

Everything not listed here survives as cut. The three "Blocked by: Design gap N"
edges are all released.

| Item                    | Why it needs re-cutting                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1**                 | Already satisfied by the orchestrator: the run is on `fix/visual-tolerance-threshold`, cut from `origin/main` @ `a4d0830b6`. The item's finding (#4569 merged; the cross-run cost moot) is now recorded in § Decisions. Close it. |
| **1.4**                 | Clauses 1-3 stand verbatim. Add clause 0 (`observed(s)` / `signal-not-observed`), the `opts` table, the four-verdict contract, and the rewritten clause 4 (`H_abs`/`H_ratio`, 0.3 decades, `formReview`, no `maxDiffPixelRatio`). |
| **2.1**                 | The CSS's content is now specified (two selectors, not a section list), and the item gains `apps/rialto-web/e2e/noise-floor-coverage.test.ts` as part of the same TDD unit. Its telemetry-unreachability caveat is obsolete.      |
| **2.2**                 | `on:` is no longer "`workflow_dispatch` only" — it is `workflow_dispatch` + `push: branches: ["measure/**"]`, plus a `concurrency` block. Add the two trigger-safety assertions (both run under `pnpm test`, both measurable).    |
| **2.3**                 | The dispatch precondition is replaced. The item becomes "push `measure/visual-noise-floor-<n>` at the run branch's head and read the run", with `gh workflow run` recorded as the post-merge path only.                           |
| **3.2**                 | The budget is a single `maxDiffPixels` key by design, not "the key(s) the verdict named", and the guard's assertion 2 has tightened to match.                                                                                     |
| **Design gaps section** | All three are closed here. It becomes a record of what was routed and where it landed, not an open list.                                                                                                                          |

One residual risk this revision knowingly creates, for Decompose to carry
rather than solve: clause 0 can fire on a genuinely-perturbed but very
low-contrast snapshot, `light-table-empty` and `light-skeleton-variants` being
the likeliest. That is a designed hard stop with a defined human override
(§ Data model), not a gap — but it is a plausible outcome of the first run and
item 2.5's branch list should say so.
