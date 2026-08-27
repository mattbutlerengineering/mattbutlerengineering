---
stage: decompose
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
revision: 3
assumptions:
  - "No live user input was available. The skill's review-the-cut step could not run — as in both prior passes. Milestone boundaries, item sizing and the per-item verification class (local / CI / human) are this stage's, drafted from architecture.md (revision 3), defect.md and autorun-brief.md. No design decision was taken here."
  - "Third Decompose pass, against architecture.md revision 3 (commit 8c609a7ba). This is a targeted re-cut, not a rewrite: the milestone structure, the verification classes, the measurement-gated ordering and every item revision 3 did not move are preserved verbatim from pass 2."
  - "The measurement is NOT re-taken. GitHub Actions run 33107801311 ran for real and its capture legs are unaffected by revision 3. Re-opening 1.3/1.4/1.5 re-opens the OFFLINE analysis only. No item in this breakdown implies a second CI dispatch, and item 2.3b carries an explicit criterion that proves none happened."
  - "Two items are ADDED beyond architecture.md § Hand-off's re-cut list, which the dispatch brief states is a floor and not a ceiling. 2.3b (re-analyse run 33107801311's artifacts offline through the corrected modules) is a sizing decision: the work exists, 2.3 is discharged and closed, and 2.5 is a human judgement gate whose verification class would be muddied by folding a mechanical local run into it. 3.1b is Architect's own, named in § Hand-off. Neither renumbers anything, so architecture.md's references to 1.3, 1.4, 1.5, 2.1-2.5, 3.1, 3.2, 3.4 all still resolve."
  - "Item 2.3 is CHECKED. Its acceptance criteria 1-6 are discharged by run 33107801311, verified first-hand this stage via `gh run view` (event push, ref measure/visual-noise-floor-1, head defe2c62, four jobs success) and via the downloaded artifacts on disk. Criterion 6's 'paste the verdict into Notes' is discharged by this pass writing it there — together with the fact that the run's own Recommendation was produced by the pre-revision-3 rule and is superseded by construction."
  - "Item 2.3's criterion 7 (delete the disposable `measure/**` ref) is MEASURABLY NOT MET — `git ls-remote origin 'refs/heads/measure/*'` still returns `measure/visual-noise-floor-1` at defe2c62 as of this pass. Recommended default taken: it is re-homed as run-close housekeeping (item 3.5's acceptance, and named in every hard-stop branch of 2.5 so it is not leaked when the run stops early) rather than left as an unmet criterion on a discharged measurement. Recorded in § Notes and reported, never silently moved."
  - "The three items architecture.md revision 3 surfaced are each given a named home rather than left in prose: the `t = 0` runner-image-bump exposure and the `R`-is-a-point-check limitation live in item 2.5's ok-branch list (the way the clause-0 hard stop already lives in its signal-not-observed branch), and the `light-button-variants.png` live finding is stated as a finding in item 2.4's input."
  - "No tracker interaction anywhere in this breakdown — no item carries a `(tracker: #N)` reference, no export step is offered. Directed by autorun-brief.md § Decisions already made."
  - 'No item writes a tolerance value, regenerates a baseline, pushes, merges, tags, publishes or deploys. Milestone 3 remains gated on item 2.5 returning `verdict: "ok"`; that gate is unchanged and is now guarded by four verdicts rather than three.'
  - "One new interpretation recorded rather than routed: `driftReview` appears in architecture.md's quoted sample output (line 827) and in the offline recommendation JSON but is absent from § `recommend`'s Output contract. Recorded under § Design gaps found with the reason it cannot change what the run emits."
---

# Breakdown: giving the rialto-web visual suite a measured sensitivity

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

> Source: [`architecture.md`](./architecture.md) **revision 3** (commit
> `8c609a7ba`) in this directory. This is a work breakdown, not a design pass:
> every mechanism named below is Architect's.
>
> **Third pass — a targeted re-cut.** Pass 1 cut the work against revision 1 and
> routed three design gaps back. Pass 2 re-cut against revision 2, which closed
> all three. Then **the instrument was built and it ran** — GitHub Actions run
> [`33107801311`](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/33107801311),
> `Visual Noise Floor`, event `push` on `measure/visual-noise-floor-1` at
> `defe2c62`, four jobs green, 1,176 rows, all 49 snapshots observed perturbed.
>
> **The instrument worked. The decision rule was wrong, and the measurement is
> what exposed it.** With a noise floor that measures **zero** at every
> `t >= 0.005`, revision 2's `qualifies` predicate (`S >= 10 * N`) read
> `S >= 0` — true for any signal at all — so six sweep points qualified
> vacuously, clause 1's `largest` took `t = 0.2`, and the emitted pair
> `{threshold: 0.2, maxDiffPixels: 0}` was **behaviourally identical to today's
> config on every row of `defect.md` § A's own reproduction table**. The run
> would have closed looking successful with the defect reproducing verbatim.
>
> Revision 3 corrects the rule. **The capture is untouched and is not
> re-taken:** items 1.1, 1.2, 2.1, 2.2 stand as cut and stay checked, and item
> **2.3 is discharged** by run 33107801311. What re-opens is the offline
> analysis — 1.3, 1.4, 1.5 — plus the two items that read its output.

## The shape of this run, and why it is unusual

This run **did not know its own answer** when it started. `architecture.md`
deliberately picks no tolerance values; it specifies an instrument
(`visual-noise-floor.yml` + `scripts/visual-noise-floor.mjs`), an executable
decision rule (`scripts/visual-tolerance-rule.mjs`), a drift guard and a
standing defect-reproduction test — and the numbers come out of running those
on real Linux CI.

So the dependency graph has an edge most breakdowns do not have:

```
milestone 1  (pure modules, no numbers)          <- 1.3/1.4/1.5 RE-OPENED by revision 3
      |
      v
milestone 2  --> A REAL MEASUREMENT EXISTS   <-- the hard boundary
      |            run 33107801311, three artifacts     [CAPTURE: DONE, NOT RE-TAKEN]
      |            |
      |            +-- 2.3b re-analyses those SAME artifacts offline  [LOCAL, no CI]
      v
milestone 3  (values written, baselines regenerated, guards green)
```

**Nothing in milestone 3 can be written before item 2.5 has read a verdict.** A
breakdown that lands the config change before the measurement reproduces #4496
inside its own fix (architecture.md § Hand-off), so the ordering is expressed
as blocking edges on every milestone-3 item, not as advice.

Three consequences of that shape, all made structural below:

- **Authoring the workflow (2.2) and running it (2.3) are different items.**
  This repo has a documented failure class of work that shipped, merged and
  closed COMPLETED having never once executed — four instances in one day, the
  `pulumi-r2-checksum-validation.yml` harness among them, and that harness is
  the precedent `architecture.md` cites for this workflow's shape. That
  separation paid for itself: the run is what found the rule defect.
- **Re-opening milestone 1 does NOT re-open the measurement.** The three
  capture legs are tolerance-blind by construction and their PNGs are
  amplitude-independent; the fourth `reproduction` pairing is pure arithmetic
  over `replica-a` bytes already in hand. Item **2.3b** re-runs the analysis
  offline over the same artifacts and carries a criterion that proves no second
  run exists. **No item below implies a second CI dispatch.**
- **The rule has four verdicts, not three.** Pass 1 had `no-separation` alone;
  pass 2 added `signal-not-observed`; revision 3 adds `defect-not-caught`,
  whose recovery is neither of the others'. Item 2.5 is where all four go, and
  its branch list names each. No item below assumes the measurement cooperates,
  and no item may proceed by picking a number the rule declined to emit.

## Standing rules for every item

- **TDD is the repo default.** Any item that adds logic starts with a failing
  test. For a new `scripts/<name>.mjs` the `scripts/__tests__/<name>.test.mjs`
  sibling is part of that same item, never a follow-up — matching
  `ci-gate-commit-status.mjs` / `secret-scan.mjs`.
- **Gates before an item is checked off:** `pnpm lint`, `pnpm typecheck`,
  `pnpm test`. Use `pnpm exec turbo run test --concurrency=4` for the test
  gate — full-concurrency `pnpm test` times out spuriously in unrelated
  packages (documented; `tools/cli` and `buildApp()` route tests are the
  recorded victims). `/local-ci-precheck` runs the same set before a push.
- **`scripts/**` is currently outside every ESLint gate** (two independent
  causes, both recorded in `docs/backlog.md` line 53 — `@mbe/scripts` declares
  no `lint` script, and `lint-staged.config.js` routes `.mjs` through
  `PRETTIER_ONLY_GLOB`). Worth knowing so nobody reads a green `pnpm lint` as
  coverage of the new modules — **not this run's job to fix**, and no item
  below touches it.
- Stage by explicit path — never `git add -A` (the PostToolUse prettier hook
  leaves ~171 files dirty).
- Third-party actions pinned by full commit SHA. Reuse the pins already in
  this repo: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`,
  `pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288`,
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020`,
  `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`,
  `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`.
- Any `run:` block whose exit code is the point opens with `set -o pipefail` —
  GitHub Actions' default shell is `bash -e`, without `pipefail`, so a gate
  piped into `tee`/`grep` goes green regardless of what it found.
- **Nothing here is merged, tagged, published, or deployed.** Release
  authorization is withheld (`autorun-brief.md` § Decisions already made);
  Ship prepares and stops. The one ref this run wrote — the disposable
  `measure/visual-noise-floor-1` — is a branch write, not a merge, and its
  deletion is run-close housekeeping (item 3.5, and every hard-stop branch of
  2.5).

**Verification class** is stated on every item, because the three are not
interchangeable:

| Class     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| **local** | provable at a terminal on this machine; no runner, no network               |
| **CI**    | requires a real GitHub Actions run; cannot be faked or asserted from a diff |
| **human** | requires a person looking at something and forming a judgement              |

## Milestone 1: the instrument's pure core computes, at a terminal

**Demonstrable at the boundary:** given four directories of PNGs, you can
produce the full **1,568-row** measurement set — four pairings now, not three —
and a `Recommendation` verdict including its form diagnostic, from a shell
prompt, with no runner and no network, proven on synthetic fixtures. Still zero
tolerance values written.

- [x] **1.1 Cut the run's branch from current `origin/main` and record the
      #4569 ordering** — the run's Capture and Architect commits sat on
      `feat/visual-diffs-in-pr`, which was 27 ahead / 19 behind `origin/main`.
      `architecture.md` revision 1 was written on the belief that PR #4569 is
      unmerged; it merged **2026-08-26T04:30:41Z** (squash `8bd4f675`), and
      `origin/main` already carries `scripts/visual-diff-report.mjs`
      byte-identical to this branch. Revision 2 § Decisions records the
      correction and its consequence: the coupling **inverted rather than
      vanished** — `parseMaxDiffPixels` is live on `main`, so emitting a ratio
      would degrade a shipped PR comment today. That is reason 3 of clause 4's
      fiat, not a merge-order hazard.
  - Accept: **met, measured 2026-08-27.** The run is on
    `fix/visual-tolerance-threshold`, cut from `origin/main` @ `a4d0830b6`;
    `git rev-list --left-right --count origin/main...HEAD` = **0 behind / 6
    ahead** at the time of measurement; `git diff --stat origin/main...HEAD`
    listed **7 files, 2,392 insertions, all markdown under `docs/`** — zero
    code, versus the 29 files / 10,215 insertions of already-merged code the
    old base carried. `git show origin/main:scripts/visual-diff-report.mjs`
    contains both `parseMaxDiffPixels` and a private `stripComments` — the
    precondition item 1.2 depends on. Recorded in **Notes**.
  - Blocked by: —
  - Verification: **local**
  - **Revision 3: unchanged, stays checked.** Its evidence is intact.

- [x] **1.2 `scripts/visual-tolerance.mjs` — `readToleranceDirectives()`, and
      `parseMaxDiffPixels` re-expressed on top of it** — component (6). The
      comment-aware lexer moves out of `scripts/visual-diff-report.mjs` and
      becomes the one place that answers "what does this config's text say
      about tolerance"; `parseMaxDiffPixels` becomes a thin _policy_ over it,
      keeping its null-on-ambiguity behaviour unchanged.
  - Accept: `scripts/__tests__/visual-tolerance.test.mjs` is written first and
    observed failing. `readToleranceDirectives(configSource)` returns
    `{ threshold, maxDiffPixelRatio, maxDiffPixels, occurrences }`; each value
    is the numeric literal or `null`; `occurrences` carries a per-key count so
    a caller can tell **absent** (0) from **ambiguous** (>1) from
    **present-but-unreadable** (count >= 1 with a `null` value — an identifier
    or an expression where a literal was expected). A non-string, an empty
    string, or an unterminated string literal yields all-`null` with zero
    occurrences and never throws. Comment stripping is string- and
    template-aware. The module imports no `node:fs` and is pure.
    `scripts/visual-diff-report.mjs` no longer defines `stripComments` and its
    `parseMaxDiffPixels` delegates; **its existing test file passes unchanged**
    — that is the regression proof, including the
    `playwright-config-commented-ratio.txt` fixture still returning `300` and
    a live `maxDiffPixelRatio` still returning `null`.
  - Blocked by: 1.1 (satisfied)
  - Verification: **local**
  - **Revision 3: unchanged, stays checked.** Landed in `de85c8bb1`. Items
    3.1 and 3.1b both consume this reader, and neither adds a second one.

- [x] **1.3 `scripts/visual-noise-floor.mjs` — `measure()`, now with the
      fourth `reproduction` pairing** — component (4). The only place outside
      Playwright that invokes the comparator: it calls
      `utils.getComparator("image/png")` from the installed
      `playwright-core@1.62.1` with `{ threshold: t, maxDiffPixels: 0 }` and
      reads the count out of the returned `errorMessage` (`null` => 0).
      **RE-OPENED by revision 3.** Landed once as `4bb697ac0` and ran for real
      in run 33107801311; the three original pairings are unchanged and their
      rows are reused verbatim. What is new is a fourth pairing that needs no
      runner, no leg and no fourth input directory.
  - Accept: the new tests are written first and observed failing.
    - **`PAIRINGS` becomes four values** — `run`, `drift`, `signal`,
      `reproduction`. Row count is `names x 4 x thresholds` = **1,568**
      (49 x 4 x 8), up from 1,176. The `Measurement` row **shape** is otherwise
      unchanged from pass 1 — still no `perturbed` flag, because signal-set
      membership is a derived predicate over rows, not a stored field.
    - **`reproduction` is `replica-a` against `replica-a` shifted**, per
      `architecture.md` § Data model: a constant `defectAmplitude` added to
      R, G and B of every pixel, `min(255, v + D)`, alpha untouched. This is
      `defect.md` § A's reproduction verbatim. **It is pure arithmetic over
      bytes already in hand:** no render, no browser, no dev server, no fourth
      capture leg, no new artifact to download. A dedicated test asserts the
      pairing's two sides are both derived from `replicaA` and that no fourth
      input directory is accepted.
    - **`measure()` gains `defectAmplitude`, default `36`**, and the CLI gains
      `--defect-amplitude`. The default is not invented here: 36/255 is the
      prior run's measured largest per-channel delta of the `opacity: 0.55`
      regression that shipped undetected (`defect.md` § D). A test asserts the
      resolved amplitude is **echoed into the emitted set's provenance** —
      a set whose reproduction rows were taken at a different amplitude is a
      _different_ measurement, not a comparable one, and the provenance is
      where that is representable.
    - **The existing invocation in `.github/workflows/visual-noise-floor.yml`
      stays valid unchanged** — its `Measure` step passes no amplitude flag and
      picks up the default. Verified this stage against the committed workflow;
      item 2.2 is therefore **not** re-opened. A test that reads the workflow
      text is not required, but the item's `git diff` must show
      `.github/workflows/visual-noise-floor.yml` untouched.
    - Everything else from pass 1 stands verbatim and its tests must stay
      green: `{ replicaA, replicaB, perturbed, committed, thresholds }`;
      sweep defaults `[0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2]` with
      `t = 0` load-bearing downstream; PNG dimensions read from the header with
      `Buffer` arithmetic; **no new runtime or dev dependency in any
      `package.json`** (`git diff` on the item proves it); every failure hard
      and naming the snapshot (name present in one directory and absent from
      another, dimension mismatch within a pair, unreadable or non-PNG file,
      provenance tuples that disagree between legs); **nothing skipped and
      nothing degrading to a default**, because a skipped snapshot lowers every
      max and percentile, biasing the answer toward _less_ sensitivity — the
      direction of the original defect. The markdown table still goes to
      `GITHUB_STEP_SUMMARY` when it is set.
  - Blocked by: —
  - Verification: **local**

- [x] **1.4 `scripts/visual-tolerance-rule.mjs` — `recommend()`, clauses 0-3
      and the four-verdict contract** — component (5). Pure arithmetic over
      the measurement rows, and the owner of saying _no pair is justified_.
      **RE-OPENED by revision 3, and this is the item the measurement
      falsified.** Landed once as `d5d243c7e`; run 33107801311 showed clause 1
      selecting `t = 0.2` on a vacuous predicate and clause 3 collapsing the
      budget to 0. **Clause 0 stands verbatim — it ran and was vindicated**
      (`unobserved: []`, all 49 snapshots observed perturbed).
  - Accept: the new tests are written first and observed failing. The module
    still has **zero import statements** — in particular it never reaches
    `playwright-core` or item 1.3, and neither does its test.
    - **Clause 0 is unchanged, and its tests must stay green untouched.**
      `observed(s) <=> count(signal, s, 0) >= separationFactor * max(count(run, s, 0), 1)`;
      any failure returns `verdict: "signal-not-observed"` naming every failing
      snapshot and writing no numbers; exclusion is never automatic; an
      excluded snapshot still contributes to `N_run`, `D90` and `R`. The
      `opts` table, `signalSet`, `excludedFromSignal` and their
      reason-required validation are likewise unchanged, except that `opts`
      gains **`defectAmplitude` (default 36)** and it is echoed into
      `evidence.opts` with the rest.
    - **`N` drops the drift term.** `N(t) = N_run(t)`. `drift` keeps every
      other job it had — the pairing, the P90, and the above-P90 outlier list
      by name — and gains one: `evidence.driftAboveBudget`, the snapshots whose
      committed baseline sits further from `replica-a` than the emitted budget.
      A test asserts moving a `drift` value cannot move `N`, and a second
      asserts it still moves `driftP90` and `driftAboveBudget`.
    - **No bound may be derived from a measured zero.**
      `N0 = max(N_run(0), 1)` and `Ntilde(t) = max(N(t), N0)`; `Ntilde`
      replaces `N` in **both** places it appeared — the geometric mean and the
      lower clamp. A dedicated test drives the exact shape run 33107801311
      produced (`N_run(0) > 0`, `N_run(t) = 0` for every `t > 0`) and asserts
      the emitted budget is **not** 0.
    - **Clause 1(a) — separation is three-valued, not boolean.**
      `separationState(t)` is `"unseparated"` when `N > 0 and S < factor * N`,
      `"separated"` when `N > 0 and S >= factor * N`, and **`"unbounded"`
      when `N = 0`**, where separation is undefined rather than satisfied. A
      regression test pins the defect directly: on a set with `N = 0` at six
      sweep points, the rule must **not** report those points as qualifying and
      must **not** select the largest.
    - **Clause 1(b)+(c) — the budget interval, with the defect folded in.**
      `R(t) = min over ALL 49 snapshots of count(reproduction, t)`;
      `lower(t) = ceil(noiseHeadroom * Ntilde(t))`;
      `upper(t) = min(floor(S(t) / signalMargin), R(t) - 1)`;
      `feasible(t) <=> lower(t) <= upper(t)`;
      `eligible(t) <=> separationState(t) != "unseparated" AND feasible(t)`.
      A test asserts `R(t) = 0` makes the point ineligible **by measurement**
      (the interval is empty), never by a fiat about Playwright's default.
    - **Clause 1 selects the SMALLEST eligible `t`**, reversed from pass 1's
      largest. A test covers the reversal explicitly against a set where both
      orderings are available and asserts the smaller is taken.
    - **Clause 2 — two hard stops, neither a fallback.** Every point
      `"unseparated"` => `verdict: "no-separation"` carrying the best
      achievable ratio, the snapshots driving it, and
      `evidence.ratioDomainSeparation`. Some point not `"unseparated"` but none
      `feasible` => **`verdict: "defect-not-caught"`** carrying `R(t)`,
      `lower(t)`, `upper(t)` and an `infeasibleReason` per sweep point,
      `"blind-to-defect"` (`R(t) = 0`) or `"clamps-cross"`. A test asserts the
      two are distinguishable and that neither returns a number.
    - **Clause 3** computes `B = round(sqrt(Ntilde(t) * S(t)))` clamped to
      `[lower(t), upper(t)]`.
    - **`VERDICTS` is exactly four** — `"ok"`, `"signal-not-observed"`,
      `"no-separation"`, `"defect-not-caught"` — plus a throw on a malformed
      set. **A set with no `reproduction` rows throws**, for the same reason a
      set with no `t = 0` rows does: clause 1(b) becomes unevaluable, and the
      rule never skips a clause it cannot evaluate.
    - **Every existing fixture in `scripts/__tests__/visual-tolerance-rule.test.mjs`
      gains `reproduction` rows or the rule throws.** That is the intended
      failure and re-pinning them is part of this item — including the pass-2
      test named "stays on the two specified branches when `S(t)` itself
      measures 0", whose recorded outcome (`verdict ok`, `threshold 0.1`,
      `maxDiffPixels 0`) is **no longer reachable**: at `S = 0` the upper clamp
      is `0` and the lower clamp is at least `2`, so the point is infeasible
      and ineligible. Re-pin it to the new behaviour rather than deleting it;
      see **Notes**.
    - `evidence` carries, per sweep point: `N_run`, `N`, `Ntilde`, `S`, `R`,
      `separationState`, the separation ratio (`null` when unbounded),
      `budgetInterval`, `feasible`, `infeasibleReason` and `eligible` — so a
      reader can see why every rejected point was rejected, which is the thing
      pass 2's single `qualifies: true` column hid. Plus, at the selected `t`:
      `opts` as resolved, `N0`, `defectMargin = R(t) - B`, `driftP90`
      (reported, never a term), the above-P90 `drift` outlier list **by name**,
      and `driftAboveBudget`. `H_abs` / `H_ratio` / `formReview` arrive in 1.5.
  - Blocked by: — (not blocked by 1.3; the rule is the policy and never
    imports the analyzer)
  - Verification: **local**

- [x] **1.5 `recommend()`'s clause 4 — the budget form and its headroom
      diagnostic** — the clause meant to end the #4450 -> #4496 flip-flop.
      **RE-OPENED by revision 3, minimally.** Landed once as `66a237886`. Both
      branches, the 0.3-decade boundary, the fixed `maxDiffPixels` form and the
      retired `min()` both-keys form are **all unchanged**; exactly one term
      moves.
  - Accept: the change is test-first and the delta is one floor.
    - **`H_abs`'s denominator floor becomes `Ntilde(t)`**, replacing pass 2's
      arbitrary constant: `H_abs = log10((S(t) / signalMargin) / (noiseHeadroom * Ntilde(t)))`.
      `Ntilde` is already floored on a measurement by clause 3, so the
      `max(..., 1)` wrapper is redundant and its constant is unevidenced.
      **`H_ratio` is untouched** and keeps its `1 / maxArea` quantum, which is
      the smallest resolvable non-zero quantity in the ratio domain.
    - **Everything else stands verbatim, with its tests green untouched:** the
      emitted form is `maxDiffPixels`, one key, always; `maxDiffPixelRatio` is
      **never** emitted on any verdict (dedicated test, now covering the fourth
      verdict too); `Sr` / `Nr` are the identical aggregates over the `ratio`
      column, no new stored field; both branches implemented and exhaustive
      (`H_ratio - H_abs > formReviewDecades` => `"ratio-has-more-headroom"`
      carrying both numbers, otherwise `"absolute-confirmed"`), with a test
      asserting the **emitted form does not change** on the first branch.
    - `evidence` still gains `H_abs`, `H_ratio` and `formReview`. The module
      still has zero import statements.
  - Blocked by: 1.4
  - Verification: **local**

## Milestone 2: a real Linux measurement exists, and someone has read it

**Demonstrable at the boundary:** a GitHub run id, three artifacts of 49 real
Linux PNGs each, a step-summary table, and a `Recommendation` JSON whose
verdict and evidence are quoted into this file — numbers that did not exist
anywhere before this milestone, taken on the machine class the production job
actually runs on.

**The capture half of this boundary is reached.** Run `33107801311` exists and
its artifacts are in hand. Revision 3 re-opens only the arithmetic performed on
them, which item 2.3b does offline.

- [x] **2.1 `apps/rialto-web/playwright.noise-floor.config.ts` +
      `apps/rialto-web/e2e/noise-floor-perturbation.css` +
      `apps/rialto-web/e2e/noise-floor-coverage.test.ts`** — component (3),
      the known-regression signal **and its coverage of the snapshot set**.
      One TDD unit; coverage is a test rather than a comment, on the precedent
      of the neighbouring `workflow-coverage.test.ts` (#3955 — six real specs
      sat in this exact directory never running in CI).
  - Accept:
    - **The CSS is exactly two selectors**, per `architecture.md` §
      Components 3: `[data-testid], [data-feed-state] { opacity: 0.55 }`.
      Not a section list. Those two are exhaustive over `visual.spec.ts`,
      which builds a screenshot subject in exactly two ways —
      `page.getByTestId(id)` for the 38 light + 9 dark harness sections
      (`Section.tsx` puts `data-testid={id}` on every one) and
      `page.locator("[data-feed-state]")` for the 2 telemetry HUD snapshots
      (`Telemetry.tsx:58`). 47 + 2 = 49, and 49 baseline PNGs are committed.
      The perturbation **value** is the prior run's, unchanged.
    - **No `:not(:has(...))` refinement is added.** `DarkModeSection.tsx`
      wraps the nine dark sections in
      `<div data-theme="dark" data-testid="dark-mode-section">`, so those nine
      composite two stacked opacities (~0.30 effective). That makes the
      perturbation _stronger_ on those nine and never weaker, and `S` is a
      **minimum**, so the rule's answer is driven by the least-perturbed
      members. Refining it would silently under-perturb any future subject that
      nests a testid — the dangerous direction.
    - **`noise-floor-coverage.test.ts` reads `visual.spec.ts` and the CSS as
      text**, extracts every subject-locator form feeding a
      `toHaveScreenshot` call, and asserts each is covered by a selector in
      the CSS. **It fails closed:** a locator form it does not recognise is a
      violation, never silence. A test asserts the fail-closed direction
      against a synthetic third locator form.
    - **It actually runs.** `apps/rialto-web/vitest.config.ts` declares
      `include: ["src/**/*.test.{ts,tsx}", "e2e/workflow-coverage.test.ts"]`
      — an explicit path list, not an `e2e/` glob — so the new file is added
      to that list in this item, and `pnpm --dir apps/rialto-web test` is
      observed executing it.
    - `pnpm --dir apps/rialto-web exec playwright test --config playwright.noise-floor.config.ts e2e/visual.spec.ts --list`
      enumerates the **same 49 tests** as the same command against
      `playwright.config.ts`.
    - `pnpm typecheck` passes; the item's `git diff --name-only` contains
      **no path under `apps/rialto-web/src/**`**; the production
      `playwright.config.ts` gains **no env-var branch**.
  - Blocked by: —
  - Verification: **local**
  - **Revision 3: unchanged, stays checked.** Landed in `813ae3802` and
    **vindicated by run 33107801311** — the perturbed leg captured 49 PNGs and
    clause 0 reported `unobserved: []`, i.e. every one of the 49 snapshots was
    measurably perturbed. The generalised two-selector CSS did exactly what it
    was cut to do.

- [x] **2.2 `.github/workflows/visual-noise-floor.yml`** — component (2), the
      capture instrument. Four jobs in one run: three tolerance-blind capture
      legs plus an analyze job.
  - Accept:
    - **`on:` contains exactly two triggers — `workflow_dispatch` and
      `push: branches: ["measure/**"]`.** No `pull_request`, no `schedule`, no
      other push branch. `permissions: contents: read`.
    - `concurrency: { group: visual-noise-floor-${{ github.ref }}, cancel-in-progress: false }`
      — a half-finished measurement is worse than none.
    - **Two trigger-safety assertions, both running under `pnpm test`:**
      `findTriggerViolations` returns `[]` for this workflow (the existing
      repo-wide scan in `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs`
      picks it up automatically), and exactly one workflow fires for the ref
      `measure/visual-noise-floor-1`.
    - Three capture jobs, each `runs-on: ubuntu-latest` (the same label the
      production `visual` job uses) and each `timeout-minutes: 30`, invoking
      Playwright with `--update-snapshots=all` so the leg never compares:
      `replica-a` and `replica-b` on the production config, `perturbed` on
      2.1's config. **replica-b is a second runner, not a repeat on the
      first.**
    - Each uploads `apps/rialto-web/e2e/screenshots/` plus a `provenance.json`
      recording `ImageOS`, `ImageVersion`, the Playwright version and the
      resolved Chromium build, as `visual-actuals-replica-a` / `-replica-b` /
      `-perturbed`.
    - The analyze job declares `needs:` **all three**, does its **own clean
      checkout**, downloads the three artifacts, runs
      `scripts/visual-noise-floor.mjs` then `scripts/visual-tolerance-rule.mjs`,
      uploads both JSONs and writes the markdown table to
      `$GITHUB_STEP_SUMMARY`.
    - Every third-party action is pinned by full commit SHA. Every `run:` block
      whose exit code is the point opens `set -o pipefail`.
    - **The workflow cannot change what any required check concludes:** it
      appears in no `needs:` of `ci.yml`, writes no ref, and branch protection
      still returns `{"strict": false, "contexts": ["CI Gate"]}`.
  - Blocked by: 1.3, 1.4, 1.5 (the analyze job calls both modules), 2.1
  - Verification: **local** for every criterion above. Whether it _works_ was
    2.3.
  - **Revision 3: unchanged, stays checked.** Landed in `defe2c622` and
    **vindicated by run 33107801311** — all four jobs concluded `success` in
    4m32s, the three provenance tuples agreed, and the analyze job's own clean
    checkout supplied an uncontaminated `committed` side. Verified this stage
    that 1.3's new `--defect-amplitude` flag **defaults**, so the analyze job's
    `Measure` invocation stays valid with no edit; this item is not re-opened.

- [x] **2.3 Take the measurement: push `measure/visual-noise-floor-<n>` and
      read the run's output** — the item that turns a workflow file into a
      measurement, separate from 2.2 on purpose because the repo's recorded
      failure class is work that shipped, merged and closed COMPLETED having
      never once executed.
  - Accept, in order — **criteria 1-6 met, evidenced below; criterion 7
    re-homed, see the note:**
    1. **Met.** The measurement was taken by ref push, not by dispatch:
       `git push origin HEAD:measure/visual-noise-floor-1` from
       `fix/visual-tolerance-threshold`. `gh workflow run` was correctly not
       attempted — while the file is off `main` the registry reports it
       `state: "deleted"` and the dispatch endpoint addresses that registry.
    2. **Met.** Run id **`33107801311`**, `Visual Noise Floor`, event `push`,
       ref `measure/visual-noise-floor-1`, head `defe2c62`, 2026-08-27
       19:18:25Z -> 19:22:57Z.
    3. **Met.** All four jobs concluded `success`:
       `capture (replica-a, playwright.config.ts)`,
       `capture (replica-b, playwright.config.ts)`,
       `capture (perturbed, playwright.noise-floor.config.ts)`, `analyze`.
    4. **Met.** Each artifact contains exactly **49 PNGs** plus
       `provenance.json` (verified on the downloaded `visual-actuals-replica-a`,
       and mechanically by the analyzer's name-set check, which the analyze
       job's success proves passed for all three legs).
    5. **Met.** The three `provenance.json` tuples **agree** — the analyzer
       hard-fails on disagreement, so `analyze` concluding `success` is the
       proof. Merged tuple: `ImageOS ubuntu24`, `ImageVersion 20260823.283.1`,
       Playwright `1.62.1`, Chromium `chromium-1234 (151.0.7922.34)`. Quoted in
       **Notes**.
    6. **Met.** The step-summary table rendered; `measurement.json`
       (**1,176 rows**, 392 each of `run` / `drift` / `signal`) and
       `recommendation.json` were downloaded and read. The verdict is quoted in
       **Notes** — **together with the fact that it is superseded by
       construction**: it was produced by the pre-revision-3 rule and emitted
       `{threshold: 0.2, maxDiffPixels: 0}`, which is behaviourally identical
       to today's live config on `defect.md` § A's own table. Reading it is
       what found the defect, so this criterion is discharged in the strongest
       possible way; the authoritative Recommendation comes from **2.3b**.
    7. **Re-homed, not met.** The disposable ref
       `measure/visual-noise-floor-1` still exists at `defe2c62` on `origin`
       (measured this stage). Deleting it is run-close housekeeping, not part
       of "a measurement exists", and blocking a discharged measurement on it
       would misrepresent the run's state. It moves to **3.5**'s acceptance and
       is named in every hard-stop branch of **2.5**, so it cannot leak if the
       run stops early. Recorded in **Notes**.
  - **Re-opening 1.3, 1.4 and 1.5 does NOT re-open this item.** The capture
    legs are tolerance-blind by construction (`--update-snapshots=all` writes
    actuals without comparing) and their PNGs are independent of every
    parameter revision 3 moved; the fourth `reproduction` pairing is arithmetic
    over `replica-a` bytes already in hand. **The measurement is reused, not
    retaken.** Its artifacts live on GitHub (30 days for
    `visual-noise-floor-measurement`, 14 for the actuals) and on local disk;
    item 2.3b consumes them.
  - Blocked by: 2.2
  - Verification: **CI** — irreducibly. There is no local substitute:
    `defect.md` § Why architect records that this measurement cannot be taken
    on macOS, which is the whole reason the instrument exists.

- [x] **2.3b Re-analyse run 33107801311's artifacts offline through the
      corrected modules** — **NEW in pass 3.** The item that converts a
      re-opened milestone 1 into a new answer **without a second CI run**.
      Architect re-evaluated the corrected rule offline to verify it works;
      that verification is not the code, and this is where the code is run for
      real over the real artifacts.
  - Accept:
    1. **No new CI run is created.** `gh run list --workflow visual-noise-floor.yml`
       lists exactly **one** run, `33107801311`. No `gh workflow run`, no
       `measure/**` push, no new ref. This criterion is the point of the item:
       it makes "the measurement was reused" checkable rather than asserted.
    2. `scripts/visual-noise-floor.mjs` (item 1.3) is run over the three
       artifacts of run `33107801311` plus a pristine
       `apps/rialto-web/e2e/screenshots`, producing **1,568 rows** — 392 each
       of `run`, `drift`, `signal`, `reproduction`.
    3. **The 1,176 `run` / `drift` / `signal` rows are identical, count for
       count, to run 33107801311's own `measurement.json`.** A diff over those
       three pairings is empty. This is the proof that the re-analysis measured
       the same population and not a new one; any difference is a defect in
       1.3 and stops the item.
    4. The merged provenance tuple equals the run's:
       `ubuntu24 / 20260823.283.1 / playwright 1.62.1 / chromium-1234 (151.0.7922.34)`,
       and the emitted set records `defectAmplitude: 36`.
    5. `scripts/visual-tolerance-rule.mjs` (items 1.4 + 1.5) is run over that
       set, and its **verdict and full `evidence` block are pasted verbatim
       into Notes** — reading it is part of the item.
    6. `evidence.perThreshold` shows a reason for every rejected sweep point,
       and `evidence.observed` still reports all 49 snapshots perturbed
       (`unobserved: []`) — clause 0's result is unchanged from the run's own,
       because clause 0 is unchanged.
  - Blocked by: 1.3, 1.4, 1.5, 2.3
  - Verification: **local** — arithmetic over CI-produced artifacts already in
    hand. Explicitly **not CI**: no runner, no dispatch, no ref.

- [x] **2.4 Triage the `drift` outliers and the regeneration precondition — a
      human looks at diff images** — `drift` is contaminated by construction:
      the defect is that sub-20% UI changes have been landing without going red
      for ~6 months, so part of the replica-a-vs-committed distance is **real
      un-baselined UI change**, not noise. Revision 3 **removed `drift` from
      `N`** — the P90 was not a de-contaminant on a distribution that is 43/49
      zeros — so this item no longer feeds the arithmetic. It gained a sharper
      job instead.
  - **A live finding this item inherits, stated rather than buried.** The
    instrument found the defect occurring in production, on `main`, right now:
    `light-button-variants.png` drifts on **124,577 of 139,216 px (89.5%)** at
    `t = 0` — a whole-image change — decaying to **245 px at `t = 0.2`**, which
    is under the live `maxDiffPixels: 300` budget. **The live suite therefore
    reports this snapshot as passing today.** That is `defect.md`'s thesis
    reproduced against real committed baselines rather than a synthetic shift,
    and it is the first item in this breakdown to hold it. Three more snapshots
    sit above the emitted budget in the same list.
  - Accept: every snapshot named in **both** of the rule's drift outputs is
    classified as **real un-baselined UI change** or **rendering noise**, each
    with a one-line reason referencing the diff image actually looked at:
    - the above-P90 `drift` outlier list (available from run 33107801311's own
      rows, and unchanged by revision 3); and
    - **`evidence.driftAboveBudget`** — new in revision 3, and the more
      important of the two: the snapshots whose committed baseline sits further
      from `replica-a` than the emitted budget. **That list is the
      regeneration precondition** — the emitted pair is green only for
      baselines equal to `replica-a`, so every name on it is a baseline whose
      staleness the budget cannot absorb.
      The classification is written into **Notes**; every name on
      `driftAboveBudget` is carried into item **3.3** as a stated, deliberate
      baseline update, not something a reviewer discovers; anything classified as
      real UI change is also carried into item 3.4's SC-2 argument.
  - Blocked by: 2.3 (the drift rows and the diff images), 2.3b (the
    `driftAboveBudget` list, which is a function of the emitted budget)
  - Verification: **human.** Stated plainly: this step is **not automatable**,
    and no acceptance criterion below silently assumes it was. It needs a
    person (or a reviewing stage acting as one) opening diff images.

- [x] **2.5 Read the verdict and take the branch it dictates** — the decision
      gate. **Four outcomes, all designed**, and revision 3 added the fourth.
  - Accept, whichever applies:
    - **`verdict: "ok"` — a `(threshold, maxDiffPixels)` pair** => the pair,
      `separationState` and the separation ratio at the selected `t`, `R(t)`,
      `defectMargin`, `driftAboveBudget`, the resolved `evidence.opts`,
      `evidence.excluded`, and the form diagnostic (`H_abs`, `H_ratio`,
      `formReview`, alongside `Nr(t)` so a reviewer can see when the flag rests
      on the ratio-domain floor) are recorded in **Notes**, and milestone 3 is
      unblocked. This is the only path on which any item in milestone 3 may
      start. If `formReview` is `"ratio-has-more-headroom"`, that is recorded
      as a **stated trigger to re-open the form decision at Architect with a
      measurement in hand** — it does **not** change what this run emits, which
      stays a single `maxDiffPixels` key.
      **Two named, accepted risks travel with this branch — carried the way
      the clause-0 hard stop is carried in the branch below, i.e. stated up
      front so nobody meets them as a surprise:**
      1. **A selected `t = 0` has the least tolerance for a runner-image bump
         of any sweep point in the sweep.** The only defence is the emitted
         budget standing over a measured floor of 4 px, and a font-metric
         change in a future `ubuntu-latest` image could exceed it on the large
         snapshots (`light-master-override-variants` at 1,047,200 px is the
         worst case). This repo's own record has the precedent: the 2026-08-11
         image bump broke Pulumi deploys with no repo change. It is an
         **accepted, named risk, not a gap** — the alternative is a larger `t`,
         whose blindness is unbounded in area, and `defect.md` § A is what that
         costs. Detection when it fires is free (the visual job goes red) and
         the recovery is a re-measure, which is what `workflow_dispatch` is for
         once the instrument is on `main`.
      2. **`R` is a point check at one amplitude** (`defectAmplitude` 36, the
         prior run's measured worst case). It is harmless while the rule
         selects the smallest `t` — the emitted budget sits far below `R` — but
         it becomes load-bearing if a future measurement makes `t = 0`
         ineligible, because a single amplitude cannot describe the shape of
         the blind spot. **Recorded, not solved** (Architect's own words);
         see § Design gaps found.
    - **`verdict: "signal-not-observed"`** => **hard stop, and a different one
      from the others: it says the instrument failed, not that the suite cannot
      be tuned.** Milestone 3 does not start. The named snapshots are recorded
      in **Notes**. **This is a plausible first-run outcome, not an exotic
      one:** clause 0 can fire on a genuinely-perturbed but very low-contrast
      snapshot, `light-table-empty` (1232x207, mostly flat) and
      `light-skeleton-variants` being the likeliest candidates named by
      Architect. (Run 33107801311 did not fire it — `unobserved: []` — but a
      re-analysis is not a re-measurement and the branch stays live.) Recovery,
      in order: (a) look at the diff image for each named snapshot; (b) either
      fix the perturbation, or record an explicit `opts.excludedFromSignal`
      entry with a reason — which echoes into `evidence.excluded` and therefore
      into the provenance record, so it can never happen quietly, and which
      still leaves that snapshot contributing to `N_run`, `D90` and `R`; then
      (c) **re-run the pure rule offline against the artifacts already on disk.
      Do NOT re-dispatch.** Delete the `measure/visual-noise-floor-1` ref as
      part of stopping.
    - **`verdict: "no-separation"`** => **hard stop.** Milestone 3 does not
      start, no tolerance value is written, no baseline is regenerated. The
      best achievable ratio and the snapshots driving it are recorded in
      **Notes**, together with `evidence.ratioDomainSeparation`: if that clears
      `separationFactor` while the absolute domain did not, the route back to
      Architect is a **form** question; otherwise it is a **comparator**
      question, and the run routes back with `comparator: "ssim-cie94"` named
      as the designed next move together with the two costs
      `architecture.md` § Decisions already records against it (absent from
      `types/test.d.ts`, so a typed config needs a cast; and it hardcodes
      `maxColorDeltaE94: 1` and ignores `threshold` entirely, which makes the
      whole `t` sweep meaningless). Recorded, never auto-taken. Delete the
      `measure/**` ref as part of stopping.
    - **`verdict: "defect-not-caught"`** => **hard stop, and its recovery is
      neither of the two above.** NEW in revision 3. It says the sweep contains
      no threshold at which a budget can sit both above the noise floor and
      below the defect's own reproduction — i.e. every point is either blind to
      a 36/255 whole-image shift (`infeasibleReason: "blind-to-defect"`,
      `R(t) = 0`) or visible but not by enough to fit a budget above the floor
      (`"clamps-cross"`). Milestone 3 does not start. `R(t)`, `lower(t)`,
      `upper(t)` and `infeasibleReason` **per sweep point** are recorded in
      **Notes**. It is **not** an instrument failure and **not** a
      re-dispatch: the route back is a design question — a finer sweep at the
      low end, or the `ssim-cie94` route § Decisions records. Delete the
      `measure/**` ref as part of stopping.
    - **In no branch is a number guessed.** No item below may proceed by
      picking one.
  - Blocked by: 2.3b (the authoritative verdict). 2.4 is **advisory** rather
    than arithmetic since revision 3 — `drift` no longer feeds `N`, so an
    outlier misread as noise can no longer move the emitted pair. Read 2.4
    before this item anyway: its `driftAboveBudget` classification is what
    tells you whether the `ok` branch's baselines are safe to regenerate.
  - Verification: **human** — reading a verdict and stopping a run is a
    judgement, even when the verdict itself is arithmetic.

## Milestone 3: the sensitivity is declared, evidenced, guarded, and demonstrated

**Demonstrable at the boundary:** one PR that changes the tolerance **and** its
49 baselines together, whose own `Visual Regression (rialto-web)` job is green;
two guards in `CI Gate` — one that reds if either value ever moves again
without its evidence, one that reds if the declared sensitivity ever goes blind
to `defect.md`'s reproduction; and both success criteria shown as counts, not
claims. Nothing is merged.

**Every item in this milestone is blocked by 2.5 returning `verdict: "ok"`.**

- [x] **3.1 `scripts/__tests__/visual-tolerance-guard.test.mjs`, authored RED**
      — component (7), the drift guard. Written **before** the config change,
      TDD order, so its failure against today's config is observed rather than
      assumed.
  - Accept: the file implements `architecture.md` § `visual-tolerance-guard`'s
    five assertions and **holds no copy of any tolerance value** — a reviewer
    can grep it for a numeric literal and find none:
    1. `threshold` is present in `apps/rialto-web/playwright.config.ts` as an
       explicit numeric literal. (The defect is precisely that it was never set
       and inherited 0.2 by omission for ~6 months.)
    2. **`maxDiffPixels` is live as a readable numeric literal, and
       `maxDiffPixelRatio` is absent** — it asserts a **shape**, and the shape
       has two live consumers: `parseMaxDiffPixels` (which returns `null` the
       moment a ratio appears, `scripts/visual-diff-report.mjs:265`) and the
       measured #4450 -> #4496 incident. This reds on a change of _form_ (an
       Architect-level decision) and stays green on a change of _value_ (the
       expected re-tune lifecycle).
    3. **No `toHaveScreenshot` call site in `apps/rialto-web/e2e/visual.spec.ts`
       passes `threshold`, `maxDiffPixels` or `maxDiffPixelRatio`** — today all
       four pass only `timeout`, and this is module (1)'s
       single-point-of-control invariant.
    4. The two provenance lines exist and parse, in exactly the § Data model
       grammar (no ` maxDiffPixelRatio=<r>` tail — the rule never emits one).
    5. `noise-floor-values` equals the live directives key for key — the
       guard's second operand travels with the first, so a legitimate re-tune
       that updates both stays green and a silent one reds naming both sides.
       It reads the config's text through item 1.2's `readToleranceDirectives`,
       never `import()`.
       The item is complete when the test is **observed failing** against the
       unmodified config — at minimum on assertion 1 (`threshold` absent) and
       assertion 4 (no provenance lines); note assertion 2 already passes today,
       since the live config carries `maxDiffPixels: 300` and no ratio — and that
       verbatim output is recorded in **Notes**. It goes green in 3.2; the items
       land in the same PR, guards first in the diff.
  - Blocked by: 1.2, 2.5
  - Verification: **local**
  - **Revision 3: unchanged.** Its five assertions still name no number.

- [x] **3.1b `scripts/__tests__/visual-defect-reproduction.test.mjs`, authored
      RED** — **component (8), new in revision 3.** The standing regression
      test that turns `defect.md` § A from a one-off Capture measurement into a
      permanent assertion against the **live** config, inside `CI Gate`.
  - Accept: written before the config change, TDD order, and **observed
    failing** against today's config — recorded verbatim in **Notes**.
    - It **reads the live `(threshold, maxDiffPixels)` through item 1.2's
      `readToleranceDirectives`** — no second copy of the lexer, and **no
      tolerance value of its own**. The one number it names is the amplitude,
      `defectAmplitude` 36, which is `defect.md` § D's measured worst case and
      is the thing under test, not a threshold.
    - For each of the 49 committed baselines it applies the uniform per-channel
      shift (`min(255, v + 36)` on R, G, B, alpha untouched), calls the same
      `utils.getComparator("image/png")` the suite uses with the live
      directives, and asserts the result is **not `null`** — i.e. the declared
      sensitivity can see a change to every pixel of every baseline.
    - **RED today is total:** under the live config (`threshold` unset ->
      Playwright's 0.2, `maxDiffPixels: 300`) a 36/255 shift returns `null` on
      every baseline, so all 49 assertions fail. That is `defect.md`'s § A
      table, run against the whole suite.
    - It runs under the root `pnpm test`, i.e. inside `CI Gate` — the file
      lands in `scripts/__tests__/`, which the root vitest config already
      covers (`visual-tolerance-guard.test.mjs` and `pulumi-cli-pin.test.mjs`
      are the neighbours). Measured cost ~2.5 s for all 49 at one threshold; if
      the observed cost differs materially, record it rather than trimming the
      set.
    - **It is a separate module from 3.1 on purpose.** The drift guard is
      textual, names no number and reaches no image; that purity is why it
      stays green through a legitimate re-tune. This one executes the
      comparator and means something different when it reds — not "a value
      moved without evidence" but "the declared sensitivity cannot see the
      defect". Different failure, different module.
  - Blocked by: 1.2, 2.5
  - Verification: **local**

- [x] **3.2 Write the measured tolerance into
      `apps/rialto-web/playwright.config.ts` with its provenance** —
      component (1). The one place this suite's sensitivity is declared, for
      all 49 snapshots, together with the machine-readable record of the
      measurement that justifies it. The budget is a single `maxDiffPixels`
      key **by design**, not "the key(s) the verdict named".
  - Accept: `expect.toHaveScreenshot` carries the `threshold` and the single
    `maxDiffPixels` value item 2.5's verdict named — **and nothing else**. No
    `maxDiffPixelRatio` appears anywhere in the file, live or emitted (the
    existing explanatory comment that _mentions_ it in prose is unchanged and
    is why `readToleranceDirectives` is comment-aware). No value is rounded,
    reinterpreted, or "adjusted for safety" relative to the rule's output; any
    deviation would be a new decision, which this stage has no authority to
    take. The two provenance lines from `architecture.md` § Data model sit in
    the same file, in exactly that form, naming the real run id from 2.3
    (`33107801311`) and its real `ImageOS`/`ImageVersion` and Playwright
    version. **Both** `scripts/__tests__/visual-tolerance-guard.test.mjs` (all
    five assertions) **and** `scripts/__tests__/visual-defect-reproduction.test.mjs`
    (all 49) go **green**. No `toHaveScreenshot` call site in `visual.spec.ts`
    is touched. `pnpm exec turbo run test --concurrency=4` passes, which
    includes both guards and `scripts/__tests__/visual-diff-report.test.mjs` —
    the latter is the proof that `parseMaxDiffPixels`, live on `main` since
    #4569 merged, still returns a number rather than `null` for this config.
  - Blocked by: 3.1, 3.1b
  - Verification: **local**

- [x] **3.3 Regenerate all 49 baselines from the `visual-actuals-replica-a`
      artifact** — the "not a module" of `architecture.md` § Components:
      regeneration needs no code, because replica-a **is** 49 fresh Linux PNGs
      at the dispatched commit, produced by the same runner label as the
      production job.
  - Accept: all 49 files in `apps/rialto-web/e2e/screenshots/` come from the
    `visual-actuals-replica-a` artifact of run **`33107801311`** — **not**
    from a local run (macOS font metrics and glyph advances differ; a
    macOS-rendered baseline must never be committed) and **not** from the
    documented `rialto-web-visual-diffs` procedure, which exists only on
    failure and carries only the snapshots that failed, so a tightening that
    flips 40 of 49 would leave 9 stale. The file count stays exactly 49 and
    every filename is unchanged (`git status --short` shows only `M` lines
    under that directory, never `A` or `D`). Files are staged by explicit path.
    - **New input from revision 3: `evidence.driftAboveBudget` is this item's
      precondition list** — the baselines whose staleness the emitted budget
      **cannot** absorb, and therefore the ones whose regeneration is
      load-bearing rather than incidental. Each name on it, with 2.4's
      classification, is stated in the commit body or the PR body: a baseline
      being deliberately advanced to current `main`'s rendering is correct and
      must be visible, not discovered by a reviewer. On run 33107801311's data
      that list is four names, headed by `light-button-variants.png` at 124,577
      px of drift.
    - **The hazard this item exists to avoid:** #4496 merged with its own
      visual check red because it split a sensitivity change from the baselines
      it invalidated, and left `main` red for **41h14m** until #4561 landed 24
      regenerated baselines — so 3.2 and 3.3 land in **one PR**, never two, and
      that PR's own visual job is green before anything else happens (3.5).
  - Blocked by: 2.3 (the artifact), 2.4 (the classification of every
    `driftAboveBudget` name), 3.2 (the values these baselines are measured
    against)
  - Verification: **local** (the copy and its provenance), with the live
    confirmation deferred to 3.5.

- [x] **3.4 Demonstrate all three reproductions as counts** — the brief
      requires both success criteria to be _demonstrated, not asserted_, and
      revision 3 adds a third demonstration alongside them. All three are
      computable offline from the artifacts already in hand, because replica-a
      **is** the new baseline set: the `signal` pairing is exactly "the
      perturbation against the new baselines", the `run` pairing is exactly "a
      second real runner against the new baselines", and the `reproduction`
      pairing is exactly "the defect's own amplitude against the new
      baselines".
  - Accept, at the `(threshold, maxDiffPixels)` written in 3.2, using item
    1.3's analyzer over item 2.3's artifacts:
    - **SC-1 — the subtle perturbation now fails.** For **every** snapshot in
      the signal set (all 49, minus any `evidence.excluded` entry, each of
      which is named here with its reason), `count(signal, t*)` exceeds
      `maxDiffPixels`; the per-snapshot table is recorded in **Notes** and the
      smallest margin is stated explicitly. This is the direct answer to the
      prior run's `opacity: 0.55` perturbation passing all 49.
    - **SC-2 — legitimate rendering noise still passes.** For **every** one of
      the 49 snapshots — including any excluded from the signal set, whose
      noise and drift are real properties of this suite regardless —
      `count(run, t*)` is at or under `maxDiffPixels`; the largest observed
      value and its snapshot are named. The budget is a single absolute number
      for all 49 by design, so there is no per-image budget to state.
    - **Third demonstration — `defect.md` § A's own table, re-run at the
      written pair, with every row failing.** The table's deltas
      (1, 20, 36, 52, 53) are applied to `light-button-variants.png` through
      the same comparator and quoted verbatim in **Notes** alongside the
      original three columns, so a reader sees `PASS -> FAIL` on the rows that
      indict the live config. This is the demonstration that revision 2's
      emitted pair would have failed: `{0.2, 0}` reproduces `PASS` on rows 1
      through 52, identically to today. It is the same assertion item 3.1b
      makes permanent, shown once as evidence.
    - All numbers are traceable to run id `33107801311`; none is recomputed
      from a fresh capture, and **no new push or dispatch is required**.
  - Blocked by: 3.2, 3.3
  - Verification: **local** (arithmetic over CI-produced artifacts), with 3.5
    supplying the independent live confirmation of SC-2.

- [ ] **3.5 Open the single PR, confirm its own visual job is green, delete the
      measurement ref — and stop** — `architecture.md` § Blast-radius ordering
      is a design constraint, and this is the item that satisfies it.
  - Accept: exactly **one** PR carries the tolerance change (3.2), both guards
    (3.1, 3.1b) and all 49 regenerated baselines (3.3) — a PR carrying one
    without the others is a PR that could not have been produced by the
    designed path. Its own `Visual Regression (rialto-web)` job concludes
    **success**; that conclusion is a **third** real Linux runner agreeing with
    3.4's SC-2 arithmetic, and it is recorded. `CI Gate` is green, including
    both new guards. **Nothing is merged, tagged, published or deployed** —
    release authorization is NONE; the PR is prepared and left.
    - **Run-close housekeeping, re-homed here from item 2.3 criterion 7:** the
      disposable ref `measure/visual-noise-floor-1` is deleted
      (`git push origin --delete measure/visual-noise-floor-1`) and its
      deletion confirmed with `git ls-remote origin 'refs/heads/measure/*'`
      returning nothing. Deleting it does **not** invalidate run
      `33107801311`, its artifacts, or the provenance recorded in 3.2 — the run
      id and head SHA (`defe2c62`, reachable from this branch's history) remain
      the citable provenance.
    - Residual hazard the design accepts and this item watches for: if `main`
      lands a real UI change between 2.3's capture and this PR, the captured
      baselines are invalidated — detection is free (this job goes red) and the
      recovery is a **re-push of a fresh `measure/**` ref at the new base
      commit**, never a force-through and never a locally regenerated baseline.
      That recovery is the one circumstance in this breakdown under which a
      second CI measurement is legitimate, and it is a recovery, not a step.
  - Blocked by: 3.4
  - Verification: **CI** for the visual job's conclusion; **local** for the
    single-PR shape and the ref deletion.

- [x] **3.6 Correct the baseline-regeneration procedure in
      `.claude/rules/gotchas.md`** — that file's § CI bullet tells the next
      person to pull `*-actual.png` from the `rialto-web-visual-diffs` CI
      artifact. `architecture.md` § Decisions supersedes it: that artifact
      exists only on failure and carries only failed snapshots.
  - Accept: the existing bullet names `visual-actuals-replica-a` from
    `visual-noise-floor.yml` as the preferred source (unconditionally all 49,
    same runner label, at a known commit) and keeps
    `rialto-web-visual-diffs` as the on-failure fallback; the
    Linux-CI-runner-specific constraint and the never-commit-a-macOS-baseline
    rule are unchanged. One bullet — no other file is touched.
  - Blocked by: 3.3 (the procedure is only true once it has been used once)
  - Verification: **local**

## Design gaps found

**None open.** Pass 1 routed three gaps back to Architect rather than designing
around them; revision 2 closed all three, and revision 3 changed the decision
rule without opening a fourth. What follows is the record — what was found,
where it landed, and the items recorded rather than routed.

### Gap 1 — the signal set was never defined, so `S(t)` was undefined — CLOSED, AND NOW PROVEN

Pass 1 found `S(t) = min over PERTURBED snapshots` with no way to know which
snapshots those were. **Closed by dissolving the premise:** the perturbation
CSS is `[data-testid], [data-feed-state] { opacity: 0.55 }` — both of
`visual.spec.ts`'s subject-locator forms — so the set is all 49 by
construction; `noise-floor-coverage.test.ts` fails closed on a third form; and
the rule verifies `observed(s)` per snapshot.
**Landed in:** 1.4 (clause 0), 2.1 (CSS + coverage test), 2.5, 3.4.
**Revision 3 status: proven by measurement.** Run 33107801311 reported
`unobserved: []` and `excluded: []` — all 49 snapshots measurably perturbed on
a real runner. The closure is no longer an argument.

### Gap 2 — clause 4 had three outcomes and no decision boundary — CLOSED

**Closed by separating the decision from the diagnostic.** The budget form is
fixed by fiat to a single `maxDiffPixels` key, for three stated reasons (the
measured in-repo failure of the ratio form #4450 -> #4496; near-constant image
width, 1184 / 1216 / 1232 px, so a ratio is an absolute budget scaled by section
height; and `parseMaxDiffPixels` live on `main` since #4569, which a ratio would
degrade today). The regression is demoted to a reported diagnostic with a named
statistic against an explicit 0.3-decade boundary.
**Landed in:** 1.5, 3.1 assertion 2, 3.2, 2.5. **Revision 3 touches one floor
term inside it and nothing else.**

### Gap 3 — the dispatch precondition collided with release authorization — CLOSED, AND NOW EXERCISED

**Closed without a merge and without blocking on authorization:**
`workflow_dispatch` **plus** `push: branches: ["measure/**"]`, with the
measurement taken by pushing a disposable ref at the run branch's head.
**Landed in:** 2.2, 2.3, Standing rules.
**Revision 3 status: exercised for real.** The push of
`measure/visual-noise-floor-1` produced run `33107801311` and nothing else in
the repo fired. The closure is measured, not predicted. Its one loose end — the
ref is still on `origin` — is item 3.5's housekeeping, recorded in Notes.

### Recorded, not routed: `maxArea` in clause 4's `H_ratio` floor

`architecture.md` § `recommend` clause 4 writes
`H_ratio = log10((Sr(t) / signalMargin) / max(noiseHeadroom x Nr(t), 1 / maxArea))`
and does not define `maxArea`. The only reading that makes the floor mean "one
pixel in the largest image" is the largest `area` in the measurement set, and
Implement takes it — recorded rather than silently absorbed, because baseline
areas span 117,216 -> 1,047,200 px, so a min-vs-max reading moves the floor by
up to ~0.95 decades. It matters in exactly one narrow case — `Nr(t) = 0` at the
selected `t` — where `H_ratio` is inflated and could trip the 0.3-decade
`formReview` flag on a floor artifact rather than a measurement. **Blast radius
is zero for what this run emits:** `formReview` is reported, never acted on, and
the form stays `maxDiffPixels` on either branch. Item 2.5 records `Nr(t)`
alongside `formReview` so a reviewer can see when the flag rests on the floor.
**Unchanged by revision 3** — `H_ratio`'s floor is the one clause 4 term
revision 3 does not move.

### Recorded, not routed: `driftReview` is emitted but not contracted (new in pass 3)

`architecture.md` line 827 — inside the quoted output of the corrected rule —
shows `driftReview = "regeneration-required"`, and the offline recommendation
JSON carries the same field. **It does not appear in § `recommend`'s Output
contract**, which enumerates `driftAboveBudget` and the above-P90 outlier list
but no `driftReview`; nor is its branch set defined (what value when
`driftAboveBudget` is empty is unstated).
**Recorded rather than routed back**, for three reasons: it is a reported
label, like `formReview`, and cannot change the emitted pair; the information it
summarises is carried in full and by name by `driftAboveBudget`, which **is**
contracted and which item 2.4 consumes directly; and the Output contract is
unambiguous about what `evidence` carries, so Implement has a defensible
reading (emit the contracted fields; if `driftReview` is emitted anyway, derive
it from `driftAboveBudget` being non-empty and say so). Stopping the run to have
a label named costs more than the ambiguity does. Flagged here so a reader
comparing item 2.3b's output against architecture.md's quoted block meets the
difference as a known one.

### Recorded, not routed: `R` is a point check at one amplitude (Architect's own, revision 3)

`R(t)` is measured at a single `defectAmplitude` (36/255, `defect.md` § D's
measured worst case). One amplitude cannot describe the shape of a threshold's
blind spot — it can only prove that one specific point is inside or outside it.
Architect surfaced this explicitly as **recorded, not solved**: it is harmless
while the rule selects the smallest eligible `t` (the emitted budget then sits
orders of magnitude below `R`), and becomes load-bearing only if a future
measurement makes `t = 0` ineligible and the rule has to choose among larger
thresholds on the strength of a single-point check. No item designs around it;
item 2.5's `ok` branch names it so the reader meets it at the decision, and
item 1.3's `defectAmplitude` parameter is the seam through which a future
architecture pass could sweep amplitudes rather than fix one.

## Coverage

Every component in `architecture.md` § Components — including **(8), new in
revision 3** — and both success criteria from the brief, mapped to the item
that owns them.

| Architecture component                                                                                            | Owned by                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| (1) Tolerance declaration — `apps/rialto-web/playwright.config.ts`                                                | 3.2                                                                                          |
| (2) Noise-floor capture — `.github/workflows/visual-noise-floor.yml`                                              | 2.2 (authored), 2.3 (run — run `33107801311`)                                                |
| (3) Perturbation config — `playwright.noise-floor.config.ts` + `e2e/noise-floor-perturbation.css` + coverage test | 2.1                                                                                          |
| (4) Comparison analyzer — `scripts/visual-noise-floor.mjs`                                                        | 1.3 (authored, incl. the `reproduction` pairing), 2.3b (run offline over the real artifacts) |
| (5) Decision rule — `scripts/visual-tolerance-rule.mjs`                                                           | 1.4 (clauses 0-3, four verdicts), 1.5 (clause 4), 2.3b (run)                                 |
| (6) Config-text reader — `scripts/visual-tolerance.mjs`                                                           | 1.2                                                                                          |
| (7) Drift guard — `scripts/__tests__/visual-tolerance-guard.test.mjs`                                             | 3.1 (RED), 3.2 (green)                                                                       |
| **(8) Defect-reproduction regression test — `scripts/__tests__/visual-defect-reproduction.test.mjs`**             | **3.1b (RED), 3.2 (green)**                                                                  |
| Not a module: baseline supply (replica-a artifact)                                                                | 3.3                                                                                          |

| Success criterion                                  | Owned by                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 — the subtle perturbation now **fails**       | 2.1 (the signal), 3.4 (counts), guaranteed arithmetically by 1.4's upper clamp `B <= S(t)/signalMargin`                                       |
| SC-2 — legitimate rendering noise still **passes** | 2.2 (replicas a/b), 3.4 (counts), 3.5 (live, a third runner), guaranteed arithmetically by 1.4's lower clamp `B >= noiseHeadroom * Ntilde(t)` |

**Both criteria hold on the corrected rule against the real measurement**
(architecture.md § `recommend`, re-evaluated offline on run 33107801311's own
rows): SC-1's weakest signal is 113,509 against a budget of 674 — all 49
perturbed snapshots fail, versus 49 of 49 passing in the prior run. SC-2's
largest run-to-run noise anywhere is 4 against the same 674 — a 168x margin.
Item 2.3b reproduces those numbers from the shipped modules; item 3.4
demonstrates them at the written pair.

**Where the four verdicts land.** All four are branches of **2.5**, the only
item authorized to stop the run: `ok` (the sole path into milestone 3),
`signal-not-observed` (the instrument failed — recovery is a fixed perturbation
or a reasoned exclusion, then re-run the rule offline), `no-separation` (pixel
counting cannot separate this regression from this suite's noise — route back to
Architect on a form or comparator question) and `defect-not-caught` (no
threshold admits a budget both above the noise floor and below the defect's own
reproduction — route back on a sweep or comparator question). A malformed
measurement set throws, in **1.4**. The clause-0 low-contrast case
(`light-table-empty`, `light-skeleton-variants`) is named inside 2.5's
`signal-not-observed` branch with its recovery, and its designed human override
(`opts.excludedFromSignal` with a reason) is implemented in **1.4** and surfaced
in **3.4**'s SC-1 scope.

No ADR item: `architecture.md` § ADRs records that no decision met the bar —
re-checked in revision 3, where the new candidate (the `reproduction`-pairing
gate) misses on reversibility: it is one clamp term and one `opts` default, it
re-derives its own evidence on every run via `R(t)`, and it has an executable
counterpart in `CI Gate` (component 8, item 3.1b) that reds when it stops being
true. The durable part lives in `scripts/visual-tolerance-rule.mjs` as
executable, unit-tested code and in the config's provenance comment.

## Notes

_Deviations discovered during Implement get logged here, dated. The items above
also route specific evidence here: 1.1's branch measurement; 2.3's run id and
provenance tuple; 2.3b's re-analysed verdict and evidence; 2.4's outlier
classification; 2.5's branch, risks and form diagnostic; 3.1's and 3.1b's
observed RED output; 3.4's per-snapshot SC-1/SC-2 tables and the re-run
`defect.md` § A table._

**2026-08-27 (Decompose, pass 1).** `architecture.md` revision 1 stated that
PR #4569 is unmerged and accepted a cross-run merge-order cost on that basis.
Measured: **#4569 merged 2026-08-26T04:30:41Z** (squash `8bd4f675`),
`origin/main` is `a4d0830b6`, and `scripts/visual-diff-report.mjs` there is
byte-identical to this branch's copy.

**2026-08-27 (Decompose, pass 2) — item 1.1 discharged.** The run was re-based
onto `fix/visual-tolerance-threshold`, cut from `origin/main` @ `a4d0830b6`.
Measured: `git rev-list --left-right --count origin/main...HEAD` = **0 behind /
6 ahead**; `git diff --stat origin/main...HEAD` = **7 files, 2,392 insertions**,
every one of them markdown under `docs/` — **zero code**.
`git show origin/main:scripts/visual-diff-report.mjs` contains both
`parseMaxDiffPixels` and a private `stripComments`, so item 1.2's precondition
holds. **The #4569 coupling inverted rather than vanished** —
`parseMaxDiffPixels` is live on `main`, so emitting a `maxDiffPixelRatio` would
degrade a shipped PR comment today.

**2026-08-27 (Decompose, pass 2) — measurements taken while re-cutting.**
Recorded so Implement and Review do not re-derive them:

- `apps/rialto-web/vitest.config.ts` `include` is an explicit path list
  (`["src/**/*.test.{ts,tsx}", "e2e/workflow-coverage.test.ts"]`), not an
  `e2e/` glob — deliberately, because `e2e/a11y.test.ts` is a
  Playwright-authored `*.test.ts` that breaks under vitest.
  `scripts/check-orphaned-tests.mjs` will not catch an omission here
  (directory reachability, not per-package globs).
- Every `push:` trigger in `.github/workflows/` is filtered to
  `branches: [main]` — 13 workflows, `storybook.yml` in list form — and there
  is no `create:` trigger anywhere in the directory.
- `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs` scans **every**
  file in `.github/workflows/` and asserts zero `findTriggerViolations` and
  zero unreadable files. It exports only `parseOnSection` and
  `findTriggerViolations`.
- `visual.spec.ts` builds a screenshot subject in exactly two ways —
  `page.getByTestId(id)` (lines 66, 89) and `page.locator("[data-feed-state]")`
  (lines 135, 143). 49 baseline PNGs are committed.
- `apps/rialto-web/playwright.config.ts` today carries `maxDiffPixels: 300`,
  no `threshold`, and no live `maxDiffPixelRatio` (only a prose mention inside
  the explanatory comment) — so guard assertion 2 passes today and assertions
  1 and 4 are the RED item 3.1 must observe.

**2026-08-27 (Implement, item 1.5) — clause 4 at a sweep point the formula does
not name.** `H_abs`/`H_ratio` are `log10` of a quantity whose numerator is
`S(t) / signalMargin`; both floors guard the DENOMINATOR, so neither guards
`S(t) = 0`. Under revision 2's rule that point was reachable and selectable, and
the measured behaviour was `verdict ok`, `threshold 0.1`, `maxDiffPixels 0`,
`H_abs`/`H_ratio` both `-Infinity`, difference `NaN`, landing on
`absolute-confirmed` by the strict `>`.
**Superseded by revision 3, and this is a checkable consequence for item 1.4.**
At `S(t) = 0` the upper clamp `min(floor(0 / signalMargin), R(t) - 1)` is at
most `0` while the lower clamp `ceil(noiseHeadroom x Ntilde(t))` is at least
`2`, so `feasible(t)` is false and the point is **ineligible**. The pass-2 test
that pinned the old outcome must be re-pinned to the new one rather than
deleted — the `S = 0` sweep point is still worth a test, it now asserts
ineligibility instead of a `-Infinity` diagnostic.

**2026-08-27 (Implement, item 2.3) — the measurement, and what reading it
found.** Run **`33107801311`**, `Visual Noise Floor`, event `push`, ref
`measure/visual-noise-floor-1`, head `defe2c62`, 2026-08-27 19:18:25Z ->
19:22:57Z (4m32s). All four jobs `success`. Verified first-hand this stage with
`gh run view 33107801311`.

- **Provenance (all three legs agree, which the analyzer enforces):**
  `ImageOS ubuntu24`, `ImageVersion 20260823.283.1`, Playwright `1.62.1`,
  Chromium `chromium-1234 (151.0.7922.34)`.
- **Measurement:** 1,176 rows — 392 each of `run`, `drift`, `signal` — over 49
  snapshots x 3 pairings x 8 thresholds. `unobserved: []`, `excluded: []`:
  **every one of the 49 snapshots was measurably perturbed on a real runner.**
- **The run's own recommendation is SUPERSEDED BY CONSTRUCTION.** It was
  produced by the pre-revision-3 rule and emitted
  `{verdict: "ok", threshold: 0.2, maxDiffPixels: 0}` — behaviourally
  identical to today's live config on every row of `defect.md` § A's table,
  because the per-pixel gate discards the pixels before the budget is ever
  consulted. Recording it is the point: **the instrument worked and the rule
  was wrong, and reading the output is what found that.** The authoritative
  Recommendation comes from item 2.3b, over the same rows.
- **What the corrected rule emits on the same data** (architecture.md
  § `recommend`, re-evaluated offline by Architect; item 2.3b reproduces it
  from the shipped modules): `verdict: "ok"`, `threshold: 0`,
  `maxDiffPixels: 674`, `N0 = 4`, `defectMargin = 113166`, `driftP90 = 7`,
  `driftAboveBudget` = `light-button-variants.png` 124,577 /
  `light-master-override-variants.png` 42,005 / `dark-dark-banner.png` 24,486 /
  `dark-dark-cards.png` 9,583. `R = 0` at `t = 0.15` and `t = 0.2`, which is
  what removes the two points revision 2's `largest` would have taken.
- **Artifacts:** on GitHub under run `33107801311`
  (`visual-noise-floor-measurement` 30 days, the three `visual-actuals-*`
  14 days), and on local disk at the session scratchpad
  (`.../scratchpad/nf/{measurement.json,recommendation.json,replica-a/}`).
  Item 2.3b consumes them; **no re-dispatch is authorized or required.**

**2026-08-27 (Decompose, pass 3) — item 2.3 criterion 7 outstanding.** Measured:
`git ls-remote origin 'refs/heads/measure/*'` returns
`defe2c62... refs/heads/measure/visual-noise-floor-1`. The disposable ref was
never deleted. Re-homed to item **3.5**'s acceptance (and named in every
hard-stop branch of **2.5**) so it is discharged whichever way the run ends;
reported rather than silently moved. Deleting it does not invalidate run
`33107801311` or its artifacts.

**2026-08-27 (Decompose, pass 3) — the live finding inside the drift rows.**
Not a design gap and not a synthetic result: the instrument found the defect
occurring in production. `light-button-variants.png` (1232x113 = 139,216 px)
drifts from its committed baseline on **124,577 px (89.5%) at `t = 0`**,
decaying across the sweep to 65,910 / 58,974 / 55,274 / 6,462 / 5,180 / 575 and
**245 at `t = 0.2`** — which is under the live `maxDiffPixels: 300`, so **the
live suite reports this snapshot as passing today**. A whole-image, sub-threshold
change sitting on `main` right now that the visual job calls "no difference".
It is item **2.4**'s first input and item **3.3**'s first regeneration
precondition.

**2026-08-27 (Implement, items 1.3-1.5) — four deviations from the letter of
the re-cut, none of them design decisions.**

1. **1.3 — the provenance-shape test was re-pinned, not the tuple.**
   `architecture.md` has `defectAmplitude` "echoed into the emitted set's
   provenance", which changes the shape the analyzer's existing
   `expect(provenance).toEqual(PROVENANCE)` test pins. The four merged
   `PROVENANCE_FIELDS` (`ImageOS`, `ImageVersion`, `playwrightVersion`,
   `chromiumRevision`) are byte-identical to before, so item **2.3b**'s
   criterion 4 still reads run `33107801311`'s own tuple unchanged;
   `defectAmplitude` sits alongside them.
2. **1.4 — `Nr_drift` is gone from clause 4's evidence.** Pass 2 reported
   `Nr_run` and `Nr_drift` beside `Nr` because `N` was a max over both
   pairings. `N(t) = N_run(t)` since revision 3, so a ratio-domain drift
   aggregate is a term of nothing. `Nr` and `Nr_run` both stay (now equal by
   construction, which is itself the readable fact). The absolute-domain drift
   evidence — `driftP90`, `driftOutliers`, `driftAboveBudget` — is untouched.
3. **1.4 — clause 2's two hard stops were made total on eligibility, not on
   the prose.** `architecture.md` words them as "all unseparated" ->
   `no-separation` and "some point is not unseparated but none is feasible" ->
   `defect-not-caught`, which is not literally exhaustive. Implemented off the
   eligibility definition instead: no eligible point and every point
   `unseparated` -> `no-separation`; no eligible point otherwise ->
   `defect-not-caught`. Both readings agree everywhere the prose is defined;
   this one also answers where it is silent, and cannot fall through.
4. **1.4 — `evidence.driftReview` is additive.** Not in `architecture.md`
   § `recommend`'s Output contract. It is `"regeneration-required"` when
   `driftAboveBudget` is non-empty and `"no-regeneration-required"` otherwise —
   a summary of a field the contract does require, per § Design gaps' "recorded,
   not routed". It can never change the emitted pair.

**1.5 carried no deviation.** Exactly one term moved: `H_abs`'s denominator
from `max(noiseHeadroom x N, 1)` to `noiseHeadroom x Ntilde(t)`. `H_ratio`,
both branches, the 0.3-decade boundary and the fixed `maxDiffPixels` form are
untouched, and their tests went green without edit.

**2026-08-27 (Implement, item 2.3b) — the corrected rule, run for real over run
33107801311's own artifacts. No second CI run.**

Criterion 1 first, because it is the point of the item.
`gh run list --workflow visual-noise-floor.yml --limit 20` returns **exactly one
row** — `33107801311`, `success`, ref `measure/visual-noise-floor-1`, event
`push`, `4m32s`, `2026-08-27T19:18:25Z`. No `gh workflow run` was issued, no
`measure/**` ref was pushed, and `git ls-remote origin 'refs/heads/measure/*'`
still returns the single pre-existing `defe2c62 refs/heads/measure/visual-noise-floor-1`
(item **3.5**'s to delete). The re-analysis is arithmetic over artifacts already
on disk.

**Criterion 2 — the analyzer ran over the three CI artifacts plus a pristine
baseline directory.**

```
node scripts/visual-noise-floor.mjs \
  --replica-a <scratch>/replica-a --replica-b <scratch>/replica-b \
  --perturbed <scratch>/perturbed --committed apps/rialto-web/e2e/screenshots \
  --out <scratch>/measurement-2.3b.json          # 48.6s wall
```

`git status --porcelain apps/rialto-web/e2e/screenshots` was empty before and
after — the committed leg is the pristine 49 baselines. Output: **1,568 rows**,
`{"run":392,"drift":392,"signal":392,"reproduction":392}`, 49 snapshots x 8
thresholds x 4 pairings.

**Criterion 3 — the 1,176 `run`/`drift`/`signal` rows are identical to the CI
run's own `measurement.json`.** Joined on `(snapshot, pairing, threshold)` and
compared on `count`, `ratio`, `width`, `height`, `area`: 1,176 rows on each
side, **0 differences**, no key present on one side only. The re-analysis
measured the same population; the `reproduction` pairing is the only thing
added.

**Criterion 4 — provenance.** The CI measurement's tuple is
`{"imageOs":"ubuntu24","imageVersion":"20260823.283.1","playwrightVersion":"1.62.1","chromiumBuild":"chromium-1234 (151.0.7922.34)"}`
and the re-analysis emits that tuple **unchanged**, plus `"defectAmplitude":36`.

**Criterion 5 — the corrected rule's output, verbatim.** Produced by
`node scripts/visual-tolerance-rule.mjs < measurement-2.3b.json`, exit 0. This
is the authoritative Recommendation for the run; it supersedes the
pre-revision-3 `{threshold: 0.2, maxDiffPixels: 0}` recorded above.

```json
{
  "verdict": "ok",
  "threshold": 0,
  "maxDiffPixels": 674,
  "evidence": {
    "opts": {
      "separationFactor": 10,
      "noiseHeadroom": 2,
      "signalMargin": 2,
      "defectAmplitude": 36,
      "driftPercentile": 90,
      "formReviewDecades": 0.3,
      "excludedFromSignal": []
    },
    "excluded": [],
    "signalSet": [
      "dark-dark-alerts.png",
      "dark-dark-avatar.png",
      "dark-dark-badges.png",
      "dark-dark-banner.png",
      "dark-dark-buttons.png",
      "dark-dark-cards.png",
      "dark-dark-inputs.png",
      "dark-dark-tape-chart.png",
      "dark-dark-toggles.png",
      "light-accordion-default.png",
      "light-alert-variants.png",
      "light-avatar-variants.png",
      "light-avatargroup-default.png",
      "light-badge-variants.png",
      "light-banner-variants.png",
      "light-breadcrumb-default.png",
      "light-button-sizes.png",
      "light-button-variants.png",
      "light-card-variants.png",
      "light-checkbox-states.png",
      "light-datalist-default.png",
      "light-dialog-open.png",
      "light-drawer-open.png",
      "light-emptystate-default.png",
      "light-input-states.png",
      "light-master-override-requireHold-splitflap.png",
      "light-master-override-variants.png",
      "light-meter-variants.png",
      "light-numberinput-states.png",
      "light-pagination-default.png",
      "light-progress-states.png",
      "light-segmentedcontrol-default.png",
      "light-select-states.png",
      "light-skeleton-variants.png",
      "light-slider-states.png",
      "light-stat-variants.png",
      "light-steps-default.png",
      "light-table-default.png",
      "light-table-empty.png",
      "light-tabs-default.png",
      "light-tag-variants.png",
      "light-tape-chart-default.png",
      "light-tape-chart-overlaps.png",
      "light-tape-chart-stress.png",
      "light-textarea-states.png",
      "light-toggle-states.png",
      "light-tooltip-default.png",
      "telemetry-default.png",
      "telemetry-game.png"
    ],
    "thresholds": [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2],
    "observed": {
      "dark-dark-alerts.png": {
        "signalAtZero": 371245,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-avatar.png": {
        "signalAtZero": 133004,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-badges.png": {
        "signalAtZero": 113509,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-banner.png": {
        "signalAtZero": 220304,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-buttons.png": {
        "signalAtZero": 130341,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-cards.png": {
        "signalAtZero": 220433,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-inputs.png": {
        "signalAtZero": 262810,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-tape-chart.png": {
        "signalAtZero": 741420,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "dark-dark-toggles.png": {
        "signalAtZero": 131506,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-accordion-default.png": {
        "signalAtZero": 310280,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-alert-variants.png": {
        "signalAtZero": 384806,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-avatar-variants.png": {
        "signalAtZero": 172387,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-avatargroup-default.png": {
        "signalAtZero": 137585,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-badge-variants.png": {
        "signalAtZero": 117967,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-banner-variants.png": {
        "signalAtZero": 383727,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-breadcrumb-default.png": {
        "signalAtZero": 122887,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-button-sizes.png": {
        "signalAtZero": 149077,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-button-variants.png": {
        "signalAtZero": 136528,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-card-variants.png": {
        "signalAtZero": 260353,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-checkbox-states.png": {
        "signalAtZero": 138352,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-datalist-default.png": {
        "signalAtZero": 275084,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-dialog-open.png": {
        "signalAtZero": 276037,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-drawer-open.png": {
        "signalAtZero": 277021,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-emptystate-default.png": {
        "signalAtZero": 315665,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-input-states.png": {
        "signalAtZero": 596437,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-master-override-requireHold-splitflap.png": {
        "signalAtZero": 434428,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-master-override-variants.png": {
        "signalAtZero": 880263,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-meter-variants.png": {
        "signalAtZero": 302011,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-numberinput-states.png": {
        "signalAtZero": 273177,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-pagination-default.png": {
        "signalAtZero": 134013,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-progress-states.png": {
        "signalAtZero": 128533,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-segmentedcontrol-default.png": {
        "signalAtZero": 150458,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-select-states.png": {
        "signalAtZero": 263742,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-skeleton-variants.png": {
        "signalAtZero": 248461,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-slider-states.png": {
        "signalAtZero": 191981,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-stat-variants.png": {
        "signalAtZero": 233959,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-steps-default.png": {
        "signalAtZero": 185533,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-table-default.png": {
        "signalAtZero": 308965,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-table-empty.png": {
        "signalAtZero": 248441,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tabs-default.png": {
        "signalAtZero": 229373,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tag-variants.png": {
        "signalAtZero": 125440,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tape-chart-default.png": {
        "signalAtZero": 771525,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tape-chart-overlaps.png": {
        "signalAtZero": 806454,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tape-chart-stress.png": {
        "signalAtZero": 824532,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-textarea-states.png": {
        "signalAtZero": 951157,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-toggle-states.png": {
        "signalAtZero": 122472,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "light-tooltip-default.png": {
        "signalAtZero": 136698,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      },
      "telemetry-default.png": {
        "signalAtZero": 733261,
        "runAtZero": 4,
        "required": 40,
        "observed": true
      },
      "telemetry-game.png": {
        "signalAtZero": 654292,
        "runAtZero": 0,
        "required": 10,
        "observed": true
      }
    },
    "unobserved": [],
    "perThreshold": [
      {
        "threshold": 0,
        "N_run": 4,
        "N": 4,
        "Ntilde": 4,
        "S": 113509,
        "R": 113840,
        "separationState": "separated",
        "separation": 28377.25,
        "budgetInterval": {
          "lower": 8,
          "upper": 56754
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.005,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 113463,
        "R": 113840,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": 56731
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.01,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 113414,
        "R": 113840,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": 56707
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.02,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 49316,
        "R": 113840,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": 24658
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.05,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 44289,
        "R": 79091,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": 22144
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.1,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 40865,
        "R": 46900,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": 20432
        },
        "feasible": true,
        "infeasibleReason": null,
        "eligible": true
      },
      {
        "threshold": 0.15,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 39310,
        "R": 0,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": -1
        },
        "feasible": false,
        "infeasibleReason": "blind-to-defect",
        "eligible": false
      },
      {
        "threshold": 0.2,
        "N_run": 0,
        "N": 0,
        "Ntilde": 4,
        "S": 17967,
        "R": 0,
        "separationState": "unbounded",
        "separation": null,
        "budgetInterval": {
          "lower": 8,
          "upper": -1
        },
        "feasible": false,
        "infeasibleReason": "blind-to-defect",
        "eligible": false
      }
    ],
    "N0": 4,
    "N_run": 4,
    "N": 4,
    "Ntilde": 4,
    "S": 113509,
    "R": 113840,
    "separationState": "separated",
    "separation": 28377.25,
    "budgetInterval": {
      "lower": 8,
      "upper": 56754
    },
    "geometricMean": 674,
    "defectMargin": 113166,
    "driftP90": 7,
    "driftOutliers": [
      "dark-dark-banner.png",
      "dark-dark-cards.png",
      "light-button-variants.png",
      "light-master-override-variants.png"
    ],
    "driftAboveBudget": [
      {
        "snapshot": "light-button-variants.png",
        "count": 124577
      },
      {
        "snapshot": "light-master-override-variants.png",
        "count": 42005
      },
      {
        "snapshot": "dark-dark-banner.png",
        "count": 24486
      },
      {
        "snapshot": "dark-dark-cards.png",
        "count": 9583
      }
    ],
    "driftReview": "regeneration-required",
    "Sr": 0.8405872803666922,
    "Nr_run": 0.000004895050125313283,
    "Nr": 0.000004895050125313283,
    "maxArea": 1047200,
    "H_abs": 3.850910314955832,
    "H_ratio": 4.632765679378586,
    "formReview": "ratio-has-more-headroom"
  }
}
```

**It matches Architect's offline re-evaluation on every figure quoted above** —
`verdict "ok"`, `threshold 0`, `maxDiffPixels 674`, `N0 = 4`,
`defectMargin = 113166`, `driftP90 = 7`, the same four `driftAboveBudget`
snapshots at 124,577 / 42,005 / 24,486 / 9,583, and `R = 0` at `t = 0.15` and
`t = 0.2`. The pair was never written into the code, asserted in a test, or
tuned toward: item 1.4's tests pin `maxDiffPixels` as `round(sqrt(Ntilde x S))`
and explicitly `not.toBe(0)`, never `674`. Two independent derivations of the
same rule agreeing on the same rows is the strongest evidence this run can
produce short of milestone 3.

**Criterion 6 — every rejected sweep point carries a reason, and clause 0 is
unchanged.** `unobserved: []`; `observed` names all **49** snapshots with
`observed: true`, the same result the run's own analysis reported, because
clause 0 did not change in revision 3. The thinnest margin over clause 0's bar
is 113,499 px (`signalAtZero - required`), so nothing is near it. Of the eight
sweep points, **two are rejected** — `t = 0.15` and `t = 0.2`, both
`eligible: false`, `feasible: false`, `infeasibleReason: "blind-to-defect"`,
`budgetInterval {lower: 8, upper: -1}`, because `R = 0`: a 36/255 uniform shift
survives no pixel at those thresholds, so no emittable budget could fail on it.
The other six are `eligible: true` and are not rejected at all — they lose to
clause 1's **smallest**-eligible selection, which the ordered `perThreshold`
array shows directly.

**Three readings worth carrying into 2.4/2.5:**

1. **These are exactly the two points revision 2's `largest` would have
   taken.** `t = 0.2` is today's Playwright default and was the pre-revision-3
   emission. The corrected rule rejects it on a measurement — not on an
   argument — and the measurement is that the defect is invisible there.
2. **Clause 4 fires: `formReview: "ratio-has-more-headroom"`.**
   `H_ratio - H_abs = 4.6328 - 3.8509 = 0.782` decades, past the 0.3 boundary.
   Per architecture.md § clause 4 this **changes nothing that is emitted** —
   the form is `maxDiffPixels`, one key, and `maxDiffPixelRatio` is absent from
   the output — but it is a trigger to re-open the form question with a number
   attached, and it is 2.5's to read. The gap is driven by `Nr` resting near
   the `1 / maxArea` quantum (`Nr = 4.895e-6` against `1/1047200 = 9.55e-7`),
   which `evidence.Nr` and `evidence.maxArea` are reported for.
3. **`driftReview: "regeneration-required"`.** Four baselines drift above the
   emitted budget of 674 — `light-button-variants.png` at 124,577 chief among
   them. Recorded, not routed: item **2.4** triages it and item **3.3** is the
   regeneration.

**Reproducing `defect.md` § A at the emitted pair.** The same comparator
(`utils.getComparator("image/png")` out of the installed
`playwright-core/lib/coreBundle.js`), the same subject
(`light-button-variants.png`, 1232 x 113 = 139,216 px), the same uniform
brightening shifts, read once under today's live config and once under
`{threshold: 0, maxDiffPixels: 674}`:

| uniform delta | live {t:0.2, max:300} | count | emitted {t:0, max:674} |  count |
| ------------: | :-------------------- | ----: | :--------------------- | -----: |
|         1/255 | PASS                  |     0 | FAIL                   | 130114 |
|        20/255 | PASS                  |     0 | FAIL                   | 130114 |
|        36/255 | PASS                  |     0 | FAIL                   | 130114 |
|        52/255 | PASS                  |     0 | FAIL                   | 130114 |
|        53/255 | FAIL                  | 88321 | FAIL                   | 130114 |

**Every row FAILs at the emitted pair**, including the 36/255 shift that
`defect.md` § D records as the largest per-channel delta a prior run actually
produced. The `count` column is the filtered pixel count at that threshold —
130,114 at `t = 0` regardless of amplitude, against a budget of 674, a margin
of 193x. Under the live config the first four rows are the defect: a
whole-image change the suite calls "no difference". The `t = 0.2` column
reproduces `defect.md` § A row for row (0 / 0 / 0 / 0 / 88,321), which is the
check that this is the same measurement and not a new one.

**Artifacts on disk** (session scratchpad, not committed):
`measurement-2.3b.json`, `recommendation-2.3b.json`, `reproduce-defect-a.mjs`,
alongside the CI-downloaded `measurement.json` and the three artifact
directories.

**2026-08-27 (Implement, item 2.4) — the drift triage. A person looked at the
images; the verdict is _legitimate, regenerate all four_.**

**Both** of the rule's drift outputs name the **same four snapshots** — the
above-P90 outlier list (`driftP90 = 7`) and `evidence.driftAboveBudget` are
identical sets on this measurement, so there is one list to classify, not two:

| snapshot                             | drift @ `t=0` |      area | % of image | classification              |
| ------------------------------------ | ------------: | --------: | ---------: | --------------------------- |
| `light-button-variants.png`          |   **124,577** |   139,216 |  **89.5%** | real un-baselined UI change |
| `light-master-override-variants.png` |    **42,005** | 1,047,200 |       4.0% | real un-baselined UI change |
| `dark-dark-banner.png`               |    **24,486** |   227,328 |      10.8% | real un-baselined UI change |
| `dark-dark-cards.png`                |     **9,583** |   230,880 |       4.2% | real un-baselined UI change |

The remaining 45 snapshots are at or under the P90: 43 are **exactly 0**,
`light-master-override-requireHold-splitflap.png` is 7 and
`telemetry-default.png` is 4. Nothing sits between 7 and 9,583 — the
distribution is bimodal, which is itself the finding.

**What the diff images show** (baseline / current / diff composites built for
all four and read by a person; one line each, per the item's criterion):

- **`light-button-variants.png`** — the committed baseline has a grey scrim
  over the entire button row (an overlay/modal backdrop captured in the
  baseline); current code renders the same row bright and clean. A whole-image
  brightness change, which is why 89.5% of pixels move. **Real UI change.**
- **`light-master-override-variants.png`** — same dimming, plus its diagonal
  stripe pattern sits at a different phase between the two panels. **Real UI
  change.**
- **`dark-dark-banner.png`** — a "Confirm Action" dialog is present in **both**
  panels; only the content underneath differs, dimmed in the baseline and
  brighter in the current render. **Real UI change.**
- **`dark-dark-cards.png`** — identical story to `dark-dark-banner.png`: the
  dialog is in both, the underlying cards are dimmed in the baseline only.
  **Real UI change.**

**The decisive supporting measurement — why this is staleness and not
per-run animation flake.** `replica-a` and `replica-b` are two _different_
Linux runners inside the same run `33107801311`, and they agree to within
**4 px across all 49 snapshots and all 8 thresholds** (`telemetry-default.png`
at `t = 0`, the single non-zero `run` row in the whole 392-row pairing). If
these four snapshots carried a live overlay-timing race, the two replicas would
disagree on them; they do not disagree at all. Current output is deterministic,
so **regeneration will be stable** — and the distance being measured is between
current code and a baseline that captured a stale overlay state.

**User's verdict, verbatim: "Legitimate — regenerate all four."**

**Consequences carried forward, as the item requires:**

- All four names go into item **3.3** as **stated, deliberate baseline
  updates** — named in the commit body and the PR body so a reviewer meets
  them as a declaration, not a discovery.
- Everything classified as real UI change is carried into item **3.4**'s SC-2
  argument: `drift` is _not_ a noise term (revision 3 removed it from `N`), and
  this triage is why — three of these four counts are orders of magnitude above
  the 4 px the `run` pairing measures, and none of them is noise.
- `light-button-variants.png` is `defect.md`'s thesis reproduced against real
  committed baselines: 124,577 px of change at `t = 0` decaying to **245 px at
  `t = 0.2`**, under the live `maxDiffPixels: 300`. **The live suite reports
  this snapshot as passing today** — a whole-image change sitting on `main`
  that the visual job calls "no difference".

**2026-08-27 (Implement, item 2.5) — the verdict was read. Branch taken:
`ok`. Milestone 3 is unblocked.**

The rule emits `{"verdict": "ok", "threshold": 0, "maxDiffPixels": 674}` — the
`ok` branch, the only path into milestone 3. Recorded here in the shape the
item's `ok` branch requires:

| field                      | value                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **emitted pair**           | `threshold: 0`, `maxDiffPixels: 674`                                                                                                                     |
| `separationState` at `t*`  | `"separated"`                                                                                                                                            |
| separation ratio at `t*`   | `28377.25` (`S/N` = 113,509 / 4), against `separationFactor: 10`                                                                                         |
| `R(t*)`                    | `113840` — the defect's own reproduction at `t = 0`                                                                                                      |
| `defectMargin`             | `113166` (`R - maxDiffPixels` = 113,840 − 674)                                                                                                           |
| `budgetInterval` at `t*`   | `{lower: 8, upper: 56754}`; `geometricMean` = **674**                                                                                                    |
| `driftAboveBudget`         | 4 names — `light-button-variants` 124,577 / `light-master-override-variants` 42,005 / `dark-dark-banner` 24,486 / `dark-dark-cards` 9,583                |
| `evidence.excluded`        | `[]` — no snapshot was excluded from the signal set; all 49 contribute                                                                                   |
| `evidence.opts` (resolved) | `separationFactor 10`, `noiseHeadroom 2`, `signalMargin 2`, `defectAmplitude 36`, `driftPercentile 90`, `formReviewDecades 0.3`, `excludedFromSignal []` |

**Form diagnostic (clause 4).** `H_abs = 3.850910314955832`,
`H_ratio = 4.632765679378586`, difference **0.782 decades**, past the
0.3-decade boundary, so `formReview: "ratio-has-more-headroom"`.
`Nr = 4.895050125313283e-6` against the ratio-domain floor
`1 / maxArea = 1 / 1047200 = 9.549e-7` — i.e. the flag **rests on a term
sitting ~5x above the floor quantum**, which is why `Nr` and `maxArea` are
reported beside it. Per the item's own words this **does not change what this
run emits**: the form stays a single `maxDiffPixels` key and no
`maxDiffPixelRatio` is written anywhere. It is recorded as a **stated trigger
to re-open the form decision at Architect with a measurement in hand** — not
acted on here, and not a gap.

**Why `t = 0` and not a larger sweep point.** Six of eight points are
`eligible: true`; clause 1 takes the **smallest**. The two that are rejected —
`t = 0.15` and `t = 0.2` — are rejected on a measurement, not an argument:
`R = 0` at both, `infeasibleReason: "blind-to-defect"`, `budgetInterval
{lower: 8, upper: -1}`. A 36/255 uniform whole-image shift survives no pixel at
those thresholds, and `t = 0.2` is exactly today's inherited default.

**The two named, accepted risks that travel with this branch** — recorded up
front, per the item, so nobody meets them as a surprise:

1. **A selected `t = 0` has the least tolerance for a runner-image bump of any
   point in the sweep.** The only defence is the emitted budget (674) standing
   over a measured floor of **4** — a 168x margin, but a margin against
   _today's_ image. A font-metric change in a future `ubuntu-latest` could
   exceed it, worst case on `light-master-override-variants` at 1,047,200 px.
   This repo has the precedent: the 2026-08-11 ubuntu24 image bump broke Pulumi
   deploys with zero repo change. **Accepted, named risk, not a gap** — the
   alternative is a larger `t`, whose blindness is unbounded in area, and
   `defect.md` § A is what that costs. Detection is free (the visual job goes
   red) and recovery is a re-measure, which is what the instrument's
   `workflow_dispatch` is for once it is on `main`.
2. **`R` is a point check at one amplitude** (`defectAmplitude: 36`, the prior
   run's measured worst case). Harmless while the rule selects the smallest
   `t` — the emitted budget of 674 sits 168x below `R = 113,840` — but it
   becomes load-bearing if a future measurement makes `t = 0` ineligible,
   because one amplitude cannot describe the shape of a blind spot.
   **Recorded, not solved** (Architect's own words); see § Design gaps found.

**Also carried:** `driftReview: "regeneration-required"`, which item 2.4
triaged and item 3.3 discharges. No number was guessed anywhere; the pair
written in 3.2 is the rule's output byte for byte.

**2026-08-27 (Implement, item 3.1) — the drift guard, observed RED against the
unmodified config.** Written before the config change, TDD order, so its failure
is observed rather than assumed. `scripts/__tests__/visual-tolerance-guard.test.mjs`
names **no tolerance value** — its load-bearing assertion compares the config
against itself. Verbatim:

```
 ❯ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests | 3 failed) 7ms
     × declares `threshold` explicitly instead of inheriting Playwright's default 4ms
     ✓ keeps the budget an absolute pixel count, with no ratio anywhere 0ms
     ✓ lets no `toHaveScreenshot` call site override the suite-wide tolerance 0ms
     × carries both provenance lines, in the data model's grammar 1ms
     × keeps the live directives and their evidence line in agreement, key for key 0ms

 FAIL  … > declares `threshold` explicitly instead of inheriting Playwright's default
AssertionError: expected +0 to be 1 // Object.is equality
 ❯ scripts/__tests__/visual-tolerance-guard.test.mjs:68:46
     68|     expect(directives.occurrences.threshold).toBe(1);

 FAIL  … > carries both provenance lines, in the data model's grammar
AssertionError: apps/rialto-web/playwright.config.ts is missing the `// noise-floor:` provenance line: expected null not to be null

 FAIL  … > keeps the live directives and their evidence line in agreement, key for key
AssertionError: apps/rialto-web/playwright.config.ts is missing the `// noise-floor-values:` provenance line: expected null not to be null

 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

**Exactly the RED the item predicted**: assertion 1 reds (`threshold` absent —
`occurrences.threshold` is 0), assertion 4 reds (neither provenance line
exists), and assertion 5 reds as a consequence of 4. **Assertions 2 and 3 pass
today** — the live config already carries `maxDiffPixels: 300` with no ratio,
and all four `toHaveScreenshot` call sites in `visual.spec.ts` pass only
`timeout`. That split is the point: the guard reds on what the defect _is_, not
on everything.

**2026-08-27 (Implement, item 3.1b) — the defect-reproduction test, observed
RED against the unmodified config. RED is total: 49 of 49.**
`scripts/__tests__/visual-defect-reproduction.test.mjs` reads the live pair
through item 1.2's `readToleranceDirectives` and holds **no tolerance value of
its own** — the one number it names is the amplitude, `36`, which is
`defect.md` § D's measured worst case and is the thing under test. A directive
the config does not declare is **omitted** from the comparator options, so
Playwright's own default applies — reproducing the defect means reproducing the
defaults it hid behind. Verbatim tail:

```
 FAIL  scripts/__tests__/visual-defect-reproduction.test.mjs > the declared visual sensitivity can see defect.md § A's reproduction > telemetry-game.png
AssertionError: a uniform +36/255 shift on every pixel of telemetry-game.png is invisible to the tolerance declared in apps/rialto-web/playwright.config.ts: expected null not to be null
 ❯ scripts/__tests__/visual-defect-reproduction.test.mjs:92:11
     92|     ).not.toBeNull();
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[49/49]⎯

 Test Files  1 failed (1)
      Tests  49 failed | 1 passed (50)
   Duration  2.40s (transform 25ms, setup 0ms, import 184ms, tests 2.10s, environment 0ms)
```

Under the live config (`threshold` unset -> Playwright's 0.2,
`maxDiffPixels: 300`) a 36/255 whole-image shift returns `null` — "no
difference" — on **every one of the 49 baselines**. That is `defect.md` § A's
table run against the whole suite. The one passing case is the
`has baselines to test at all` sanity check (50 tests, 49 assertions): a
silently-empty baseline set would make every assertion vacuous, which is this
repo's own recorded failure mode of work that passes because it never ran.
**Measured cost 2.40s** for all 49 at one threshold — within the ~2.5s
architecture.md § Components 8 predicted, so the set is not trimmed.

**2026-08-27 (Implement, item 3.2) — the measured pair is written, with its
provenance, and both guards go green.** `apps/rialto-web/playwright.config.ts`
now carries exactly what item 2.5's verdict named — `threshold: 0`,
`maxDiffPixels: 674` — with no rounding, no reinterpretation and no "adjustment
for safety"; and one `maxDiffPixels` key only, no `maxDiffPixelRatio` anywhere
live. The two provenance lines sit in the same file in the § Data model
grammar, naming run `33107801311`'s real image and Playwright versions:

```ts
      // noise-floor: run 33107801311 · ubuntu24 20260823.283.1 · playwright 1.62.1
      // noise-floor-values: threshold=0 maxDiffPixels=674
      threshold: 0,
      maxDiffPixels: 674,
```

Both guards green, together with the `parseMaxDiffPixels` suite that proves the
shipped PR-comment publisher still reads this config as a number:

```
 ✓ scripts/__tests__/visual-tolerance-guard.test.mjs (5 tests) 3ms
 ✓ scripts/__tests__/visual-diff-report.test.mjs (33 tests) 6ms
 ✓ scripts/__tests__/visual-defect-reproduction.test.mjs (50 tests) 3825ms

 Test Files  3 passed (3)
      Tests  88 passed (88)
```

Direct check of the #4569 coupling, since the guard only asserts the _shape_:
`parseMaxDiffPixels(<config text>)` returns **`674`**, not `null`. No
`toHaveScreenshot` call site in `visual.spec.ts` was touched.

**Deviation, logged rather than silently taken.** The item says the existing
explanatory comment is unchanged. Its `maxDiffPixelRatio` half — the #4450
record of _why the form is absolute_ — is unchanged, verbatim. Its **last
sentence** ("300px absorbs the ±1px anti-aliasing churn … while staying far
below the pixel count any real layout shift produces") was replaced: it
justifies the number `300`, and leaving it beside `maxDiffPixels: 674` would
leave a documented falsehood in the one file this run exists to make honest.
The replacement states the same three facts from measurement instead (the
floor of 4, the defect's 113,840, and that neither value moves without a fresh
measurement). No design decision; no value changed by it.

**2026-08-27 (Implement, item 3.3) — all 49 baselines now come from
`visual-actuals-replica-a`, run `33107801311`. None was rendered locally.**

Every one of the 49 files in `apps/rialto-web/e2e/screenshots/` was written
from the `visual-actuals-replica-a` artifact and then verified byte for byte
against it: **49/49 byte-identical, 0 differing.** The artifact's own
`provenance.json` is `{"imageOs":"ubuntu24","imageVersion":"20260823.283.1",
"playwrightVersion":"1.62.1","chromiumBuild":"chromium-1234 (151.0.7922.34)"}`
— the same tuple the config's provenance line names. **No Playwright run was
executed on this macOS host at any point in this milestone**; the hazard
(macOS font metrics and glyph advances differ, and a macOS-rendered baseline
looks right locally and is wrong in CI) is avoided by construction, because the
bytes were produced by a Linux runner and only copied here. Nor did the
regeneration use the `rialto-web-visual-diffs` procedure, which exists only on
failure and carries only the snapshots that failed.

Shape, exactly as the criterion requires — 49 files, every filename unchanged,
only `M` lines:

```
 M apps/rialto-web/e2e/screenshots/dark-dark-banner.png
 M apps/rialto-web/e2e/screenshots/dark-dark-cards.png
 M apps/rialto-web/e2e/screenshots/light-button-variants.png
 M apps/rialto-web/e2e/screenshots/light-master-override-requireHold-splitflap.png
 M apps/rialto-web/e2e/screenshots/light-master-override-variants.png
 M apps/rialto-web/e2e/screenshots/telemetry-default.png
```

**Only 6 of 49 files changed bytes, and that is the expected result, not a
short copy.** The other 43 were already byte-identical to replica-a — which is
exactly what the `drift` pairing reported: 43 of 49 snapshots at **0** differing
pixels against the committed baseline. The 6 that moved are precisely the 6
non-zero `drift` rows. Four are `driftAboveBudget` — the baselines whose
staleness the 674 budget cannot absorb — and two sit below it and are carried
along because replica-a is now the single authoritative source for all 49:

| baseline                                          | drift @ `t=0` | above 674? | item 2.4's classification                                                  |
| ------------------------------------------------- | ------------: | :--------- | -------------------------------------------------------------------------- |
| `light-button-variants.png`                       |       124,577 | **yes**    | real UI change — baseline carries a grey scrim over the whole button row   |
| `light-master-override-variants.png`              |        42,005 | **yes**    | real UI change — same dimming, plus stripes at a different phase           |
| `dark-dark-banner.png`                            |        24,486 | **yes**    | real UI change — dialog in both panels, content beneath dimmed in baseline |
| `dark-dark-cards.png`                             |         9,583 | **yes**    | real UI change — identical story to `dark-dark-banner`                     |
| `light-master-override-requireHold-splitflap.png` |             7 | no         | within budget; advanced with the set                                       |
| `telemetry-default.png`                           |             4 | no         | the suite's entire run-to-run noise floor; advanced with the set           |

Every one of the four `driftAboveBudget` names is stated in the commit body and
the PR body, per the item: a baseline deliberately advanced to current `main`'s
rendering is a declaration, never something a reviewer discovers. 3.2 and 3.3
land in **one PR** — #4496 split a sensitivity change from the baselines it
invalidated and left `main` red for 41h14m.

**2026-08-27 (Implement, item 3.4) — all three reproductions, as counts, at the
written pair `{threshold: 0, maxDiffPixels: 674}`.** Every number below is
arithmetic over run **`33107801311`**'s own artifacts — the same 1,568-row set
item 2.3b produced. **No new push, no dispatch, no fresh capture.** Because
replica-a _is_ the baseline set item 3.3 just committed, the `signal` pairing is
literally "the perturbation against the new baselines", `run` is "a second real
runner against the new baselines", and `reproduction` is "the defect's own
amplitude against the new baselines".

**SC-1 — the subtle perturbation now fails, on all 49.** `evidence.excluded` is
`[]`, so the signal set is the full 49 with no exclusions to name.

| snapshot                                          |      area | SC-1 signal count | margin over 674 | SC-2 run count |
| ------------------------------------------------- | --------: | ----------------: | --------------: | -------------: |
| `dark-dark-alerts.png`                            |   378,880 |           371,245 |        +370,571 |              0 |
| `dark-dark-avatar.png`                            |   137,344 |           133,004 |        +132,330 |              0 |
| `dark-dark-badges.png`                            |   117,216 |           113,509 |        +112,835 |              0 |
| `dark-dark-banner.png`                            |   227,328 |           220,304 |        +219,630 |              0 |
| `dark-dark-buttons.png`                           |   134,976 |           130,341 |        +129,667 |              0 |
| `dark-dark-cards.png`                             |   230,880 |           220,433 |        +219,759 |              0 |
| `dark-dark-inputs.png`                            |   268,768 |           262,810 |        +262,136 |              0 |
| `dark-dark-tape-chart.png`                        |   756,576 |           741,420 |        +740,746 |              0 |
| `dark-dark-toggles.png`                           |   136,160 |           131,506 |        +130,832 |              0 |
| `light-accordion-default.png`                     |   317,856 |           310,280 |        +309,606 |              0 |
| `light-alert-variants.png`                        |   394,240 |           384,806 |        +384,132 |              0 |
| `light-avatar-variants.png`                       |   177,408 |           172,387 |        +171,713 |              0 |
| `light-avatargroup-default.png`                   |   141,680 |           137,585 |        +136,911 |              0 |
| `light-badge-variants.png`                        |   121,968 |           117,967 |        +117,293 |              0 |
| `light-banner-variants.png`                       |   394,240 |           383,727 |        +383,053 |              0 |
| `light-breadcrumb-default.png`                    |   126,896 |           122,887 |        +122,213 |              0 |
| `light-button-sizes.png`                          |   154,000 |           149,077 |        +148,403 |              0 |
| `light-button-variants.png`                       |   139,216 |           136,528 |        +135,854 |              0 |
| `light-card-variants.png`                         |   269,808 |           260,353 |        +259,679 |              0 |
| `light-checkbox-states.png`                       |   142,912 |           138,352 |        +137,678 |              0 |
| `light-datalist-default.png`                      |   282,128 |           275,084 |        +274,410 |              0 |
| `light-dialog-open.png`                           |   282,128 |           276,037 |        +275,363 |              0 |
| `light-drawer-open.png`                           |   283,360 |           277,021 |        +276,347 |              0 |
| `light-emptystate-default.png`                    |   322,784 |           315,665 |        +314,991 |              0 |
| `light-input-states.png`                          |   608,608 |           596,437 |        +595,763 |              0 |
| `light-master-override-requireHold-splitflap.png` |   445,984 |           434,428 |        +433,754 |              0 |
| `light-master-override-variants.png`              | 1,047,200 |           880,263 |        +879,589 |              0 |
| `light-meter-variants.png`                        |   309,232 |           302,011 |        +301,337 |              0 |
| `light-numberinput-states.png`                    |   280,896 |           273,177 |        +272,503 |              0 |
| `light-pagination-default.png`                    |   137,984 |           134,013 |        +133,339 |              0 |
| `light-progress-states.png`                       |   131,824 |           128,533 |        +127,859 |              0 |
| `light-segmentedcontrol-default.png`              |   155,232 |           150,458 |        +149,784 |              0 |
| `light-select-states.png`                         |   271,040 |           263,742 |        +263,068 |              0 |
| `light-skeleton-variants.png`                     |   255,024 |           248,461 |        +247,787 |              0 |
| `light-slider-states.png`                         |   195,888 |           191,981 |        +191,307 |              0 |
| `light-stat-variants.png`                         |   241,472 |           233,959 |        +233,285 |              0 |
| `light-steps-default.png`                         |   190,960 |           185,533 |        +184,859 |              0 |
| `light-table-default.png`                         |   316,624 |           308,965 |        +308,291 |              0 |
| `light-table-empty.png`                           |   255,024 |           248,441 |        +247,767 |              0 |
| `light-tabs-default.png`                          |   235,312 |           229,373 |        +228,699 |              0 |
| `light-tag-variants.png`                          |   129,360 |           125,440 |        +124,766 |              0 |
| `light-tape-chart-default.png`                    |   787,248 |           771,525 |        +770,851 |              0 |
| `light-tape-chart-overlaps.png`                   |   822,976 |           806,454 |        +805,780 |              0 |
| `light-tape-chart-stress.png`                     |   843,920 |           824,532 |        +823,858 |              0 |
| `light-textarea-states.png`                       |   991,760 |           951,157 |        +950,483 |              0 |
| `light-toggle-states.png`                         |   126,896 |           122,472 |        +121,798 |              0 |
| `light-tooltip-default.png`                       |   140,448 |           136,698 |        +136,024 |              0 |
| `telemetry-default.png`                           |   817,152 |           733,261 |        +732,587 |              4 |
| `telemetry-game.png`                              |   734,464 |           654,292 |        +653,618 |              0 |

**All 49 exceed the budget: `true`.** The **smallest margin** anywhere is
`dark-dark-badges.png` at **113,509 against 674 — +112,835, a 168x margin**;
the largest is `light-textarea-states.png` at 951,157. This is the direct
answer to the prior run's finding that an `opacity: 0.55` perturbation passed
all 49 snapshots under the live config.

**SC-2 — legitimate rendering noise still passes, on all 49.** `run` is
replica-a against replica-b: two **different** Linux runners inside the same
run. All 49 are at or under the budget: `true`. The **largest observed value
anywhere is 4**, on `telemetry-default.png` — and it is the _only_ non-zero row
in the entire pairing. Across all 392 `run` rows (49 snapshots x 8 thresholds)
the maximum is also **4**, so the result does not depend on the threshold the
rule picked. The budget is a single absolute number for all 49 by design, so
there is no per-image budget to state. Every snapshot item 2.4 classified as
real UI change contributes **0** here, which is the arithmetic form of that
classification: real drift is not noise, and `drift` is not a term in `N`.

**Third demonstration — `defect.md` § A's own table, re-run at the written
pair. Every row FAILs.** Same comparator
(`utils.getComparator("image/png")` from the installed `playwright-core`
1.62.1), same subject, same uniform brightening. Run first against the
**pre-regeneration** baseline so it can be checked against § A row for row:

| uniform delta | live {maxDiffPixels:300, threshold inherited 0.2} | count | written {threshold:0, maxDiffPixels:674} |  count |
| ------------: | :------------------------------------------------ | ----: | :--------------------------------------- | -----: |
|         1/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|         5/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        10/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        20/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        30/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        36/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        40/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        45/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        50/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        52/255 | PASS                                              |     0 | **FAIL**                                 | 130114 |
|        53/255 | FAIL                                              | 88321 | **FAIL**                                 | 130114 |
|        55/255 | FAIL                                              | 88323 | **FAIL**                                 | 130114 |
|        60/255 | FAIL                                              | 88323 | **FAIL**                                 | 130114 |
|        80/255 | FAIL                                              | 88323 | **FAIL**                                 | 130114 |

The left two columns reproduce `defect.md` § A **row for row** — `0` through
`52/255`, then `88,321` at 53 and `88,323` from 55 — which is the check that
this is the same measurement and not a new one. The right two columns are the
demonstration: **every row FAILs at the written pair**, including the four rows
(1, 20, 36, 52) that indict the live config, and including the `36/255` shift
`defect.md` § D records as the largest per-channel delta a prior run actually
produced. The count is `130,114` at `t = 0` regardless of amplitude — against a
budget of 674, a **193x** margin.

And the same five deltas against the baseline that actually **ships** after
item 3.3, so the demonstration is about the committed artifact and not a
historical one:

| uniform delta | live {maxDiffPixels:300, threshold inherited 0.2} | count | written {threshold:0, maxDiffPixels:674} |  count |
| ------------: | :------------------------------------------------ | ----: | :--------------------------------------- | -----: |
|         1/255 | PASS                                              |     0 | **FAIL**                                 | 136632 |
|        20/255 | PASS                                              |     0 | **FAIL**                                 | 136632 |
|        36/255 | PASS                                              |     0 | **FAIL**                                 | 136632 |
|        52/255 | PASS                                              |     0 | **FAIL**                                 | 136632 |
|        53/255 | FAIL                                              | 94942 | **FAIL**                                 | 136632 |

**This is also the demonstration that revision 2's emitted pair would have
failed.** `{threshold: 0.2, maxDiffPixels: 0}` reproduces the `PASS` column
exactly — the per-pixel gate discards the pixels before any budget is
consulted, so a budget of `0` changes nothing on rows 1 through 52. The
corrected rule's rejection of `t = 0.15` and `t = 0.2` on `R = 0` is what
removed that outcome. It is the same assertion item 3.1b now makes permanent in
`CI Gate`; this is it shown once, as evidence.

**2026-08-27 (Implement, milestone 3) — two tests elsewhere pinned the DEFECT
and had to be re-pinned. Both found by the gates, neither a design decision.**

Item 3.2's config change broke two assertions that were true only while the
defect was live. Logged rather than quietly edited, and re-pinned to the fixed
shape rather than deleted — the same treatment note 1.5 records for the
`S(t) = 0` sweep point:

1. **`apps/rialto-web/e2e/noise-floor-coverage.test.ts`** (item 2.1's coverage
   test) asserted `expect(production).not.toContain("noise-floor")` to prove the
   production config carries no perturbation branch. The provenance lines
   `architecture.md` § Data model **mandates** are literally
   `// noise-floor: …` and `// noise-floor-values: …`, so the two collided.
   Failure observed verbatim:
   `AssertionError: expected 'import { defineConfig, devices } from…' not to contain 'noise-floor'`.
   Re-pinned to what the assertion actually means: no `stylePath`, no
   `noise-floor-perturbation` reference, and **every** `noise-floor` mention on
   a comment line — a mention on a live line still reds. The perturbation
   config's own `stylePath: "./e2e/noise-floor-perturbation.css"` is caught by
   both remaining clauses, so the test keeps its teeth.
2. **`scripts/__tests__/visual-tolerance.test.mjs`**'s
   `"reports the live config as it stands today — no threshold, no ratio, one
budget"` pinned the defect in one assertion (`occurrences.threshold` is 0).
   Fixing the defect falsified it: `AssertionError: expected 1 to be +0`.
   Re-pinned to the fixed shape — one threshold, one budget, both readable, no
   ratio despite the prose mention — and deliberately **by shape, never by
   value**. Naming the numbers there would make it a second drift guard needing
   a hand edit on the very PR that legitimately re-tunes them, which is the
   trap `architecture.md` § `visual-tolerance-guard` rejects. Value drift stays
   item 3.1's job, checked against the config's own provenance line.

**The three gates, after both re-pins. All green.**

```
$ pnpm lint
 Tasks:    47 successful, 47 total
 Cached:    0 cached, 47 total
  Time:    34.37s

$ pnpm typecheck
 Tasks:    48 successful, 48 total
 Cached:    19 cached, 48 total
  Time:    20.817s

$ pnpm exec turbo run test --concurrency=4
 Tasks:    50 successful, 50 total
 Cached:    0 cached, 50 total
  Time:    2m25.595s
```

One flake seen and ruled out on the way there: `@mattbutlerengineering/rialto`'s
suite failed once under turbo's concurrency and passed standalone immediately
after — `Test Files 140 passed (140) / Tests 2176 passed (2176)` — then passed
again in the full run above. This repo has the failure class recorded (cold
turbo cache raising ~40-task concurrency past default vitest timeouts in
unrelated packages); nothing in this run's diff reaches that package.

**2026-08-27 (Implement, item 3.6) — the baseline-regeneration procedure is
corrected.** One bullet in `.claude/rules/gotchas.md` § CI, no other file
touched. It now names **`visual-actuals-replica-a`** from
`.github/workflows/visual-noise-floor.yml` as the preferred source —
unconditionally all 49 snapshots, `runs-on: ubuntu-latest` (the same label the
`Visual Regression (rialto-web)` job uses, verified in
`.github/workflows/rialto-web-e2e.yml:78`), at a known commit, shipping a
`provenance.json` so the regeneration is citable — reachable by
`workflow_dispatch` or a push to a disposable `measure/**` ref. It keeps
`rialto-web-visual-diffs` as the **on-failure fallback** and states why it is
only that: it exists solely when the visual job fails and carries only the
snapshots that failed, so a tightening that flips 40 of 49 would leave 9 stale.
The Linux-CI-runner-specific constraint and the never-commit-a-macOS-baseline
rule are unchanged and, if anything, stated harder. The procedure is only true
once it has been used once, which item 3.3 just did: 49/49 byte-identical to
the artifact.
