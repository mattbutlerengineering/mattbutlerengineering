---
stage: decompose
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
revision: 2
assumptions:
  - "No live user input was available. The skill's review-the-cut step could not run: milestone boundaries, item sizing, and the per-item verification class (local / CI / human) are this stage's, drafted from architecture.md (revision 2), defect.md and autorun-brief.md. No design decision was taken here."
  - "Second Decompose pass, against architecture.md revision 2 (commit bba244036). Revision 1's cut is preserved wherever the revision did not move it — the milestone structure, the verification classes and the measurement-gated ordering are unchanged. All three design gaps routed back by pass 1 are closed by the revision; the Design gaps section is now a closed record, not a blocker list, and no item carries a `Blocked by: Design gap N` edge."
  - "No tracker interaction anywhere in this breakdown — no item carries a `(tracker: #N)` reference, no export step is offered, and PR #4569 is untouched. Directed by autorun-brief.md § Decisions already made."
  - "Item 1.1 is discharged, measured this stage: the run is on `fix/visual-tolerance-threshold`, 0 behind / 6 ahead of `origin/main` (`a4d0830b6`), 7 files, 2,392 insertions, **all of it markdown under `docs/`** — zero code. (The dispatch brief quotes 5 ahead / 1,985 insertions; the difference is commit `bba244036`, architecture.md revision 2, landed after that measurement.) It is checked off rather than deleted so the evidence stays attached to the item that asserted it."
  - "Item 1.4 is SPLIT into 1.4 (clause 0 + clauses 1-3, the four-verdict contract) and 1.5 (clause 4's form diagnostic). Sizing decision, not design: revision 2 grew the single item by clause 0, `observed(s)`, a six-field `opts` table, a fourth verdict and a two-branch diagnostic over a second unit. Both are pure, both are locally verifiable, and milestone 1's boundary is only reached when both are done. Recommended default taken; no other item is renumbered, so architecture.md § Hand-off's references to 1.4, 2.1, 2.2, 2.3 and 3.2 still resolve."
  - '`apps/rialto-web/vitest.config.ts` declares `include: ["src/**/*.test.{ts,tsx}", "e2e/workflow-coverage.test.ts"]` — an explicit path list, not an `e2e/` glob (deliberately: `e2e/a11y.test.ts` is a Playwright-authored `*.test.ts` that breaks under vitest). Measured this stage. So `apps/rialto-web/e2e/noise-floor-coverage.test.ts` does NOT run under `pnpm --dir apps/rialto-web test` unless that include list is extended, and `scripts/check-orphaned-tests.mjs` would not catch the omission (it checks directory reachability, not per-package globs — its own docblock records that limitation). Recommended default taken: wiring the file into the include list is part of item 2.1''s acceptance, not a follow-up. This is mechanics, not design — architecture.md § Components 3 already states the requirement ("run by `pnpm --dir apps/rialto-web test`").'
  - "SC-1 and SC-2 are discharged offline from the single dispatch's own artifacts — the `signal` pairing (perturbed vs replica-a) for SC-1, the `run` pairing (replica-b vs replica-a) for SC-2 — because replica-a IS the regenerated baseline set, so those two pairings already are exactly 'the perturbation against the new baselines' and 'a second real runner against the new baselines'. Carried unchanged from pass 1, taken as the recommended default over a second dispatch (three more paid runner legs) or a temporary perturbation commit (the shape the prior run had to revert). The prepared PR's own live `Visual Regression (rialto-web)` job is carried as additional live SC-2 evidence, per architecture.md § Blast-radius ordering."
  - "Item 3.6 (correcting `.claude/rules/gotchas.md`'s baseline-regeneration bullet) is included as a direct consequence of architecture.md § Decisions naming replica-a as the baseline source in preference to the documented `rialto-web-visual-diffs` procedure — not as a drive-by improvement. It is one bullet."
  - "No item writes a tolerance value and no item regenerates a baseline before item 2.3 holds a real run id. That ordering is structural, not advisory: milestone 1 cannot produce a number, milestone 2 produces it, and milestone 3 cannot start without it."
  - "One micro-ambiguity recorded, not routed and not designed around: clause 4's `H_ratio` floor is written `1 / maxArea` and `maxArea` is not defined in architecture.md. Recorded under § Design gaps as an interpretation, with the narrow condition under which it could matter. It cannot change what the run emits — `formReview` is reported, never acted on automatically."
---

# Breakdown: giving the rialto-web visual suite a measured sensitivity

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

> Source: [`architecture.md`](./architecture.md) **revision 2** (commit
> `bba244036`) in this directory. This is a work breakdown, not a design pass:
> every mechanism named below is Architect's.
>
> **Second pass.** Pass 1 cut the work against revision 1 and routed three
> design gaps back rather than designing around them. Revision 2 closes all
> three — the signal set, clause 4's decision boundary, and the dispatch
> precondition. **No item below is blocked by a design gap**; § Design gaps
> found is now a record of what was routed and where it landed.

## The shape of this run, and why it is unusual

This run **does not know its own answer yet**. `architecture.md` deliberately
picks no tolerance values; it specifies an instrument
(`visual-noise-floor.yml` + `scripts/visual-noise-floor.mjs`), an executable
decision rule (`scripts/visual-tolerance-rule.mjs`), and a drift guard — and
the numbers come out of running those on real Linux CI.

So the dependency graph has an edge most breakdowns do not have:

```
milestone 1  (pure modules, no numbers)
      │
      ▼
milestone 2  ──►  A REAL MEASUREMENT EXISTS   ◄── the hard boundary
      │            (a run id, three artifacts, a verdict)
      ▼
milestone 3  (values written, baselines regenerated, guard green)
```

**Nothing in milestone 3 can be written before item 2.3 has a run id.** A
breakdown that lands the config change before the measurement reproduces #4496
inside its own fix (architecture.md § Hand-off), so the ordering is expressed
as blocking edges on every milestone-3 item, not as advice.

Two further consequences of that shape, both made structural below:

- **Authoring the workflow (2.2) and running it (2.3) are different items.**
  This repo has a documented failure class of work that shipped, merged and
  closed COMPLETED having never once executed — four instances in one day, the
  `pulumi-r2-checksum-validation.yml` harness among them, and that harness is
  the precedent `architecture.md` cites for this workflow's shape. A workflow
  file is not a measurement. Item 2.3 is discharged only by a real run id, real
  artifacts, and the verdict pasted into **Notes** — reading the result is part
  of the item.
- **The rule has three hard stops, not one.** Revision 1 had `no-separation`
  alone; revision 2 adds `signal-not-observed` (clause 0 — the instrument
  failed, not the suite) and keeps a throw on a malformed measurement set.
  Item 2.5 is where all of them go, and its branch list names each. No item
  below assumes the measurement cooperates, and no item may proceed by picking
  a number the rule declined to emit.

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
  Ship prepares and stops. Revision 2 removes the collision this rule used to
  have with item 2.3: the measurement is now reached by **pushing a disposable
  `measure/**` ref**, which is a branch write, not a merge — the run already
  pushes its own branch (item 3.5 opens a PR). See § Design gaps found → gap 3.

**Verification class** is stated on every item, because the three are not
interchangeable:

| Class     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| **local** | provable at a terminal on this machine; no runner, no network               |
| **CI**    | requires a real GitHub Actions run; cannot be faked or asserted from a diff |
| **human** | requires a person looking at something and forming a judgement              |

## Milestone 1: the instrument's pure core computes, at a terminal

**Demonstrable at the boundary:** given four directories of PNGs, you can
produce the full 1,176-row measurement set and a `Recommendation` verdict —
including its form diagnostic — from a shell prompt, with no runner and no
network, proven on synthetic fixtures. Still zero tolerance values written;
still nothing known about this suite's real noise.

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
    ahead**; `git diff --stat origin/main...HEAD` lists **7 files, 2,392
    insertions, all markdown under `docs/`** — zero code, versus the 29 files /
    10,215 insertions of already-merged code the old base carried. Run 1's
    stranded `docs/features/visual-diffs-in-pr/retro.md`, its `review.md`
    second-review-pass section, and six `docs/backlog.md` seeds came along in
    the replay. `git show origin/main:scripts/visual-diff-report.mjs` contains
    both `parseMaxDiffPixels` and a private `stripComments` — the precondition
    item 1.2 depends on. Recorded in **Notes**.
  - Blocked by: —
  - Verification: **local**

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
    **present-but-unreadable** (count ≥ 1 with a `null` value — an identifier
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

- [ ] **1.3 `scripts/visual-noise-floor.mjs` — `measure()`** — component (4).
      The only place outside Playwright that invokes the comparator: it calls
      `utils.getComparator("image/png")` from the installed
      `playwright-core@1.62.1` with `{ threshold: t, maxDiffPixels: 0 }` and
      reads the count out of the returned `errorMessage` (`null` ⇒ 0).
  - Accept: `scripts/__tests__/visual-noise-floor.test.mjs` written first and
    observed failing. `measure({ replicaA, replicaB, perturbed, committed,
thresholds })` returns the `Measurement[]` row set of
    `architecture.md` § Data model verbatim — `snapshot`, `width`, `height`,
    `area`, `pairing` ∈ `run|drift|signal`, `threshold`, `count`, `ratio` —
    plus the merged provenance tuple. **The row shape is unchanged by revision
    2**: there is still no `perturbed` flag, because signal-set membership is a
    derived predicate over rows, not a stored field. Row count is
    `names × pairings × thresholds`. Sweep defaults to
    `[0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2]`; `t = 0` is load-bearing
    downstream (clause 0's `observed(s)` is evaluated there), so a caller that
    omits it produces a set the rule rejects rather than one it silently
    skips a clause on. Dimensions are read from the PNG header with `Buffer`
    arithmetic; **no new runtime or dev dependency appears in any
    `package.json`** (`git diff` on the item proves it) — adding `pixelmatch`
    directly would measure a lookalike. Every failure is hard and names the
    snapshot: a name present in one directory and absent from another; a
    dimension mismatch within a pair; an unreadable or non-PNG file;
    provenance tuples that disagree between legs. **No input is ever skipped
    and nothing degrades to a default** — a skipped snapshot would lower every
    max and percentile, biasing the answer toward _less_ sensitivity, which is
    the direction of the original defect. When `GITHUB_STEP_SUMMARY` is set it
    also writes the markdown table there; otherwise it writes only the JSON.
    Tests build tiny synthetic PNGs in-process (a known-count diff at
    `threshold: 0`, an identical pair ⇒ count 0, and one test per failure mode
    asserting the thrown message names the offending snapshot).
  - Blocked by: —
  - Verification: **local**

- [ ] **1.4 `scripts/visual-tolerance-rule.mjs` — `recommend()`, clauses 0-3
      and the four-verdict contract** — component (5). Pure arithmetic over
      the measurement rows, and the owner of saying _no pair is justified_.
      **Re-cut against revision 2:** clauses 1-3 stand verbatim from pass 1;
      clause 0, `observed(s)`, the `opts` table and the fourth verdict are new.
  - Accept: `scripts/__tests__/visual-tolerance-rule.test.mjs` written first
    and observed failing. The module has **zero import statements** — in
    particular it never reaches `playwright-core` or item 1.3, and neither
    does its test; it declares the `Measurement` row shape it needs and the
    analyzer produces rows to that shape.
    - **`opts` is enumerated and fully defaulted**, matching
      `architecture.md` § `recommend`'s table exactly: `separationFactor` 10,
      `noiseHeadroom` 2, `signalMargin` 2, `driftPercentile` 90,
      `formReviewDecades` 0.3, `excludedFromSignal` `[]`. The **resolved** set
      is echoed into `evidence.opts`, so a `Recommendation` is self-describing
      and no caller has to be consulted to read one.
    - **`signalSet` = all 49 snapshots minus `opts.excludedFromSignal`** — a
      derived predicate, never a stored field and never a hand-maintained
      list. Each `excludedFromSignal` entry is a `{ snapshot, reason }` pair;
      an entry without a reason is rejected. Exclusions are echoed verbatim
      into `evidence.excluded`, and an **excluded snapshot still contributes
      to `N_run` and `N_drift`** — dropping it from those terms would
      understate `N` and produce a budget that reds on a legitimate run. A
      dedicated test asserts exactly that: excluding a snapshot changes `S`
      and leaves `N` unchanged.
    - **Clause 0, evaluated before anything else.**
      `observed(s) ⟺ count(signal, s, 0) ≥ separationFactor × max(count(run, s, 0), 1)`
      at the strictest sweep point. If any snapshot in `signalSet` fails it,
      return `verdict: "signal-not-observed"` **naming every failing snapshot
      and writing no numbers** — a dedicated test asserts no numeric
      `threshold`, `maxDiffPixels` or `maxDiffPixelRatio` appears on that
      return. Exclusion is never automatic: a test asserts that a snapshot
      failing `observed` is reported, not silently dropped from the `min`,
      because dropping it can only _raise_ `S`, which raises the budget, which
      loosens the suite — the defect's own direction.
    - `N_run(t)` = max over snapshots of the `run` pairing; `N_drift(t)` =
      **P90**, not max, over the `drift` pairing; `N(t) = max(N_run, N_drift)`;
      `S(t)` = **min** over `signalSet` of the `signal` pairing.
    - **Clause 1** selects the **largest** sweep point satisfying
      `S(t) ≥ separationFactor × N(t)`; a test covers the boundary at exactly
      `10 ×`.
    - **Clause 2** returns `verdict: "no-separation"` carrying the best
      achievable ratio, the snapshots driving it, and
      `evidence.ratioDomainSeparation = Sr(t) / Nr(t)` at the best `t` — the
      datum that tells item 2.5 whether the route back to Architect is a form
      question or a comparator question — and **never a guessed number**
      (same dedicated assertion as clause 0's).
    - **Clause 3** computes `B = round(sqrt(N(t) × S(t)))` clamped to
      `[2 × N(t), S(t) / 2]` (i.e. `[noiseHeadroom × N(t), S(t) / signalMargin]`),
      with an explicit case for `N(t) = 0` (lower clamp 0, `N_drift` keeping
      the budget off the floor).
    - **Verdicts are exhaustive and named:** `"ok"`, `"signal-not-observed"`,
      `"no-separation"`, and a throw on a malformed set. An empty or partial
      measurement set throws — including a set with no `t = 0` rows, which
      makes clause 0 unevaluable; the rule never extrapolates across a missing
      sweep point and never skips a clause it cannot evaluate.
    - `evidence` carries `opts` as resolved, `N_run`, `N_drift`, `N`, `S`, the
      separation ratio, the per-snapshot `observed(s)` result, `excluded`, and
      the above-P90 `drift` outlier list **by name** (item 2.4 consumes it).
      `H_abs` / `H_ratio` / `formReview` arrive in 1.5.
  - Blocked by: — (not blocked by 1.3; the rule is the policy and never
    imports the analyzer)
  - Verification: **local**

- [ ] **1.5 `recommend()`'s clause 4 — the budget form and its headroom
      diagnostic** — the clause meant to end the #4450 → #4496 flip-flop.
      Revision 2 replaces revision 1's undecidable correlation branch with a
      **decision** (the form is fixed) and a **diagnostic** (a named statistic
      against an explicit boundary), which are different things.
  - Accept: tests written first and observed failing.
    - **The emitted form is `maxDiffPixels`. One key, always.**
      `maxDiffPixelRatio` is **never** emitted, on any verdict — a dedicated
      test asserts the key is absent from every return shape. The both-keys
      `Math.min(...)` form is retired and is not implemented.
    - `Sr`, `Nr_run`, `Nr_drift`, `Nr` are the identical aggregates taken over
      the `ratio` column instead of `count` — no new stored field, since
      `ratio` was always a column (§ Data model access pattern 5).
    - `H_abs = log10((S(t) / signalMargin) / max(noiseHeadroom × N(t), 1))` and
      `H_ratio = log10((Sr(t) / signalMargin) / max(noiseHeadroom × Nr(t), 1 / maxArea))`,
      both computed at the selected `t`. See § Design gaps found → _recorded,
      not routed_ for the `maxArea` reading.
    - **Both branches implemented and exhaustive**, with a test each:
      `H_ratio − H_abs > formReviewDecades` (0.3) ⇒
      `evidence.formReview = "ratio-has-more-headroom"` carrying both numbers;
      otherwise `evidence.formReview = "absolute-confirmed"`. A test asserts
      the **emitted form does not change** on the first branch — it is a
      stated trigger to re-open the form decision at Architect with a
      measurement in hand, not a reversal.
    - `evidence` gains `H_abs`, `H_ratio` and `formReview`. The module still
      has zero import statements.
  - Blocked by: 1.4
  - Verification: **local**

## Milestone 2: a real Linux measurement exists, and someone has read it

**Demonstrable at the boundary:** a GitHub run id, three artifacts of 49 real
Linux PNGs each, a step-summary table, and a `Recommendation` JSON whose
verdict and evidence are quoted into this file — numbers that did not exist
anywhere before this milestone, taken on the machine class the production job
actually runs on.

- [ ] **2.1 `apps/rialto-web/playwright.noise-floor.config.ts` +
      `apps/rialto-web/e2e/noise-floor-perturbation.css` +
      `apps/rialto-web/e2e/noise-floor-coverage.test.ts`** — component (3),
      the known-regression signal **and its coverage of the snapshot set**.
      One TDD unit: revision 2 makes coverage a test rather than a comment, on
      the precedent of the neighbouring `workflow-coverage.test.ts` (#3955 —
      six real specs sat in this exact directory never running in CI).
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
      wraps the nine dark sections in `<div data-theme="dark"
data-testid="dark-mode-section">`, so those nine composite two stacked
      opacities (~0.30 effective). That makes the perturbation _stronger_ on
      those nine and never weaker, and `S` is a **minimum**, so the rule's
      answer is driven by the least-perturbed members. Refining it would
      silently under-perturb any future subject that nests a testid — the
      dangerous direction. Architecture records this as known and harmless;
      Implement records it, does not engineer around it.
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
      observed executing it (test count rises). `scripts/check-orphaned-tests.mjs`
      would **not** have caught the omission: it checks directory
      reachability, not per-package globs. A coverage test that never runs is
      the #3955 failure this item exists to prevent, reintroduced one level up.
    - `pnpm --dir apps/rialto-web exec playwright test --config
playwright.noise-floor.config.ts e2e/visual.spec.ts --list` enumerates the
      **same 49 tests** as the same command against `playwright.config.ts`
      (a spread that silences tests — the trap `playwright.csp.config.ts`
      documents with its `testIgnore: []` — would show up here).
    - `pnpm typecheck` passes; the item's `git diff --name-only` contains
      **no path under `apps/rialto-web/src/**`** — the whole point of
      `stylePath` over the prior run's direct edit of `VisualTest.module.css`
      is that no perturbation is ever one bad `git add` away from being
      committed; the production `playwright.config.ts` gains **no env-var
      branch** (`git diff` on that file is empty for this item).
  - Blocked by: —
  - Verification: **local**

- [ ] **2.2 `.github/workflows/visual-noise-floor.yml`** — component (2), the
      capture instrument. Four jobs in one run: three tolerance-blind capture
      legs plus an analyze job. **Re-cut against revision 2:** the trigger and
      the concurrency block are new, and the trigger's safety is asserted by
      tests rather than argued in a comment.
  - Accept:
    - **`on:` contains exactly two triggers — `workflow_dispatch` and
      `push: branches: ["measure/**"]`.** No `pull_request`, no `schedule`, no
      other push branch. `permissions: contents: read`.
    - `concurrency: { group: visual-noise-floor-${{ github.ref }},
cancel-in-progress: false }` — a half-finished measurement is worse than
      none.
    - **Two trigger-safety assertions, both running under `pnpm test`, both
      measurable rather than argued:**
      1. `findTriggerViolations` returns `[]` for this workflow — satisfied
         automatically by the existing repo-wide scan in
         `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs`, which
         reads every file in `.github/workflows/` and also asserts none is
         unreadable. Confirm both go green with the new file present
         (`measure/**` cannot match the `visual-diffs/pr-…/run-…` namespace
         that guard protects, so a future loosening to `branches: ["**"]`
         would red `pnpm test`).
      2. **No workflow in `.github/workflows/` fires for the ref
         `measure/visual-noise-floor-1`** — a new assertion, using the same
         normaliser. Measured independently this stage and true today: every
         `push:` trigger in the repo is filtered to `branches: [main]`
         (13 workflows, `storybook.yml` in list form), and there is no
         `create:` trigger anywhere, so creating the branch fires nothing
         either. Note that `visual-diff-ref-trigger-safety.test.mjs` exports
         only `parseOnSection` and `findTriggerViolations` — its glob matcher
         is module-private, so the assertion either lives in that file or the
         matcher is exported; either satisfies this criterion, and the choice
         is Implement's.
    - Three capture jobs, each `runs-on: ubuntu-latest` (the same label the
      production `visual` job uses — a different label measures a different
      machine) and each `timeout-minutes: 30`, invoking Playwright with
      `--update-snapshots=all` so the leg never compares: `replica-a` and
      `replica-b` on the production config, `perturbed` on 2.1's config.
      **replica-b is a second runner, not a repeat on the first** — host-to-host
      variance is part of the noise being measured.
    - Each uploads `apps/rialto-web/e2e/screenshots/` plus a `provenance.json`
      recording `ImageOS`, `ImageVersion`, the Playwright version and the
      resolved Chromium build, as `visual-actuals-replica-a` / `-replica-b` /
      `-perturbed`.
    - The analyze job declares `needs:` **all three** (so a failed leg means no
      analysis rather than a two-leg difference), does its **own clean
      checkout** — the capture legs overwrite the committed baselines in their
      own workspaces, so `committed` must come from a pristine tree —
      downloads the three artifacts, runs `scripts/visual-noise-floor.mjs`
      then `scripts/visual-tolerance-rule.mjs`, uploads the measurement JSON
      and the `Recommendation` JSON, and writes the markdown table to
      `$GITHUB_STEP_SUMMARY`.
    - Every third-party action is pinned by full commit SHA from the list in
      Standing rules. Every `run:` block whose exit code is the point opens
      `set -o pipefail`.
    - **The workflow cannot change what any required check concludes:**
      `git grep -n "visual-noise-floor" .github/` returns only this file
      itself, it appears in no `needs:` of `ci.yml`, it writes no ref, and
      `gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks`
      still returns `{"strict": false, "contexts": ["CI Gate"]}` after the item.
  - Blocked by: 1.3, 1.4, 1.5 (the analyze job calls both modules), 2.1 (the
    perturbed leg needs a config to point at)
  - Verification: **local** for every criterion above — the file's shape, both
    trigger-safety assertions, its non-reachability from `CI Gate`, and the
    branch-protection read are all checkable without running anything. Whether
    it _works_ is 2.3.

- [ ] **2.3 Take the measurement: push `measure/visual-noise-floor-<n>` and
      read the run's output** — the item that turns a workflow file into a
      measurement. **This is a separate item from 2.2 on purpose:** the repo's
      recorded failure class is work that shipped, merged and closed COMPLETED
      having never once executed — including a dispatch-only validation
      workflow with zero runs, which is the same shape as this one.
      **Re-cut against revision 2:** the dispatch precondition that pass 1
      routed back as design gap 3 is gone. The measurement is taken by pushing
      a disposable ref, which is a branch write, not a merge.
  - Accept, in order:
    1. **The measurement is taken by ref push, not by dispatch.**
       `git push origin HEAD:measure/visual-noise-floor-<n>` from
       `fix/visual-tolerance-threshold` dispatches the instrument at that
       exact tree. `gh workflow run visual-noise-floor.yml` is recorded as the
       **post-merge path only** and is **not** attempted first: while the file
       is off `main` the workflow registry reports it `state: "deleted"` and
       the dispatch endpoint addresses that same registry, so the attempt is a
       404, not a fallback. (The requirement is the **file's** presence on the
       default branch, not the ref's identity — this repo has
       `workflow_dispatch` runs on non-`main` refs today.)
    2. A **run id exists** and is recorded here.
    3. All four jobs conclude `success`.
    4. Each of the three artifacts contains exactly **49 PNGs**
       (`unzip -l <artifact>.zip | grep -c '\.png$'` = 49) — a leg that passes
       while writing fewer would have failed the analyzer's name-set check by
       name, and either outcome is recorded.
    5. The three `provenance.json` tuples **agree**; the recorded
       `ImageOS`/`ImageVersion`, Playwright version and Chromium build are
       quoted into **Notes**. (Legs may never be combined across runs — a
       re-push is a new sample, and the runner image may have moved. The
       recorded `ImageVersion` enforces that mechanically.)
    6. The step-summary table renders and is non-empty; the measurement JSON
       and the `Recommendation` JSON are downloaded, and the **verdict and
       full `evidence` block are pasted verbatim into Notes**. Reading is part
       of the item — a downloaded artifact nobody opened does not discharge it.
    7. The `measure/visual-noise-floor-<n>` ref is **deleted** once its
       artifacts are downloaded; it is disposable by design. Deleting it does
       not invalidate the run or its artifacts, and the run id recorded in (2)
       remains the citable provenance.
  - Blocked by: 2.2
  - Verification: **CI** — irreducibly. There is no local substitute:
    `defect.md` § Why architect records that this measurement cannot be taken
    on macOS, which is the whole reason the instrument exists.

- [ ] **2.4 Triage the `drift` outlier list — a human looks at diff images** —
      `N_drift` is contaminated by construction: the defect is that sub-20% UI
      changes have been landing without going red for ~6 months, so part of
      the replica-a-vs-committed distance is **real un-baselined UI change**,
      not noise. The rule mitigates by taking P90 and emitting the above-P90
      snapshots **by name**; classifying each name is a judgement the rule
      explicitly does not make.
  - Accept: every snapshot named in the rule's above-P90 `drift` outlier list
    is classified as **real un-baselined UI change** or **rendering noise**,
    each with a one-line reason referencing the diff image actually looked at;
    the classification is written into **Notes**; if any outlier is real UI
    change, that fact is carried into item 3.3 (those baselines are being
    deliberately updated to current `main`'s rendering, which is correct but
    must be stated, not discovered by a reviewer) and into item 3.4's SC-2
    argument.
  - Blocked by: 2.3
  - Verification: **human.** Stated plainly: this step is **not automatable**,
    and no acceptance criterion below silently assumes it was. It needs a
    person (or a reviewing stage acting as one) opening diff images.

- [ ] **2.5 Read the verdict and take the branch it dictates** — the decision
      gate. **Three outcomes, all designed**, and revision 2 added the third.
  - Accept, whichever applies:
    - **`verdict: "ok"` — a `(threshold, maxDiffPixels)` pair** → the pair, the
      separation ratio, the resolved `evidence.opts`, `evidence.excluded`, and
      the form diagnostic (`H_abs`, `H_ratio`, `formReview`) are recorded in
      **Notes**, and milestone 3 is unblocked. This is the only path on which
      any item in milestone 3 may start. If `formReview` is
      `"ratio-has-more-headroom"`, that is recorded as a **stated trigger to
      re-open the form decision at Architect with a measurement in hand** — it
      does **not** change what this run emits, which stays a single
      `maxDiffPixels` key.
    - **`verdict: "signal-not-observed"`** → **hard stop, and a different one
      from `no-separation`: it says the instrument failed, not that the suite
      cannot be tuned.** Milestone 3 does not start. The named snapshots are
      recorded in **Notes**. **This is a plausible first-run outcome, not an
      exotic one:** clause 0 can fire on a genuinely-perturbed but very
      low-contrast snapshot, `light-table-empty` (1232×207, mostly flat) and
      `light-skeleton-variants` being the likeliest candidates named by
      Architect. Recovery, in order: (a) look at the diff image for each named
      snapshot; (b) either fix the perturbation, or record an explicit
      `opts.excludedFromSignal` entry with a reason — which echoes into
      `evidence.excluded` and therefore into the provenance record, so it can
      never happen quietly, and which still leaves that snapshot contributing
      to `N_run` and `N_drift`; then (c) **re-run the pure rule offline
      against the artifacts already on disk. Do NOT re-dispatch** — the
      capture legs are unaffected, and a re-push would be a new sample under a
      possibly-moved runner image.
    - **`verdict: "no-separation"`** → **hard stop.** Milestone 3 does not
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
      whole `t` sweep meaningless). Recorded, never auto-taken.
    - **In no branch is a number guessed.** No item below may proceed by
      picking one.
  - Blocked by: 2.3, 2.4 (an outlier list read as noise when it is real change
    moves `N_drift`, and `N_drift` is half of `N(t)`)
  - Verification: **human** — reading a verdict and stopping a run is a
    judgement, even when the verdict itself is arithmetic.

## Milestone 3: the sensitivity is declared, evidenced, guarded, and demonstrated

**Demonstrable at the boundary:** one PR that changes the tolerance **and** its
49 baselines together, whose own `Visual Regression (rialto-web)` job is green;
a guard in `CI Gate` that reds if either value ever moves again without its
evidence; and both success criteria shown as counts, not claims. Nothing is
merged.

**Every item in this milestone is blocked by 2.5 returning `verdict: "ok"`.**

- [ ] **3.1 `scripts/__tests__/visual-tolerance-guard.test.mjs`, authored RED**
      — component (7), the drift guard. Written **before** the config change,
      TDD order, so its failure against today's config is observed rather than
      assumed. **Re-cut against revision 2:** assertion 2 tightened with
      clause 4's fiat.
  - Accept: the file implements `architecture.md` § `visual-tolerance-guard`'s
    five assertions and **holds no copy of any tolerance value** — a reviewer
    can grep it for a numeric literal and find none:
    1. `threshold` is present in `apps/rialto-web/playwright.config.ts` as an
       explicit numeric literal. (The defect is precisely that it was never set
       and inherited 0.2 by omission for ~6 months.)
    2. **`maxDiffPixels` is live as a readable numeric literal, and
       `maxDiffPixelRatio` is absent** — tightened from pass 1's "at least one
       budget directive is live", now that clause 4 fixes the form. It still
       names no number: it asserts a **shape**, and the shape has two live
       consumers — `parseMaxDiffPixels` (which returns `null` the moment a
       ratio appears, `scripts/visual-diff-report.mjs:265`) and the measured
       #4450 → #4496 incident. This reds on a change of _form_ (an
       Architect-level decision) and stays green on a change of _value_ (the
       expected re-tune lifecycle).
    3. **No `toHaveScreenshot` call site in `apps/rialto-web/e2e/visual.spec.ts`
       passes `threshold`, `maxDiffPixels` or `maxDiffPixelRatio`** — today all
       four pass only `timeout`, and this is module (1)'s
       single-point-of-control invariant.
    4. The two provenance lines exist and parse, in exactly the § Data model
       grammar. **Revision 2 dropped the optional ` maxDiffPixelRatio=<r>`
       tail**, so the grammar the guard accepts has no expression for a value
       the rule never emits.
    5. `noise-floor-values` equals the live directives key for key — the
       guard's second operand travels with the first, so a legitimate re-tune
       that updates both stays green and a silent one reds naming both sides.
       It reads the config's text through item 1.2's `readToleranceDirectives`,
       never `import()` (the config's `defineConfig` is unresolvable where
       `parseMaxDiffPixels`'s caller runs, and one reading strategy for one file
       is enough). The item is complete when the test is **observed failing**
       against the unmodified config — at minimum on assertion 1 (`threshold`
       absent) and assertion 4 (no provenance lines); note assertion 2 already
       passes today, since the live config carries `maxDiffPixels: 300` and no
       ratio — and that verbatim output is recorded in **Notes**. It goes green in
       3.2; the two items land in the same PR, guard first in the diff.
  - Blocked by: 1.2, 2.5
  - Verification: **local**

- [ ] **3.2 Write the measured tolerance into
      `apps/rialto-web/playwright.config.ts` with its provenance** —
      component (1). The one place this suite's sensitivity is declared, for
      all 49 snapshots, together with the machine-readable record of the
      measurement that justifies it. **Re-cut against revision 2:** the budget
      is a single `maxDiffPixels` key **by design**, not "the key(s) the
      verdict named".
  - Accept: `expect.toHaveScreenshot` carries the `threshold` and the single
    `maxDiffPixels` value item 2.5's verdict named — **and nothing else**. No
    `maxDiffPixelRatio` appears anywhere in the file, live or emitted (the
    existing explanatory comment that _mentions_ it in prose is unchanged and
    is why `readToleranceDirectives` is comment-aware). No value is rounded,
    reinterpreted, or "adjusted for safety" relative to the rule's output; any
    deviation would be a new decision, which this stage has no authority to
    take. The two provenance lines from `architecture.md` § Data model sit in
    the same file, in exactly that form, naming the real run id from 2.3 and
    the real `ImageOS`/`ImageVersion` and Playwright version.
    `scripts/__tests__/visual-tolerance-guard.test.mjs` goes **green**, all
    five assertions including the tightened 2. No `toHaveScreenshot` call site
    in `visual.spec.ts` is touched. `pnpm exec turbo run test --concurrency=4`
    passes, which includes both the guard and
    `scripts/__tests__/visual-diff-report.test.mjs` — the latter is the proof
    that `parseMaxDiffPixels`, live on `main` since #4569 merged, still returns
    a number rather than `null` for this config.
  - Blocked by: 3.1
  - Verification: **local**

- [ ] **3.3 Regenerate all 49 baselines from the `visual-actuals-replica-a`
      artifact** — the "not a module" of `architecture.md` § Components:
      regeneration needs no code, because replica-a **is** 49 fresh Linux PNGs
      at the dispatched commit, produced by the same runner label as the
      production job.
  - Accept: all 49 files in `apps/rialto-web/e2e/screenshots/` come from the
    `visual-actuals-replica-a` artifact of the run id recorded in 2.3 — **not**
    from a local run (macOS font metrics and glyph advances differ; a
    macOS-rendered baseline must never be committed) and **not** from the
    documented `rialto-web-visual-diffs` procedure, which exists only on
    failure and carries only the snapshots that failed, so a tightening that
    flips 40 of 49 would leave 9 stale. The file count stays exactly 49 and
    every filename is unchanged (`git status --short` shows only `M` lines
    under that directory, never `A` or `D`). Files are staged by explicit
    path. **The hazard this item exists to avoid:** #4496 merged with its own
    visual check red because it split a sensitivity change from the baselines
    it invalidated, and left `main` red for **41h14m** until #4561 landed 24
    regenerated baselines — so 3.2 and 3.3 land in **one PR**, never two, and
    that PR's own visual job is green before anything else happens (3.5).
  - Blocked by: 2.3 (the artifact), 2.4 (an outlier classified as real UI
    change is being deliberately baselined and must be stated), 3.2 (the
    values these baselines are measured against)
  - Verification: **local** (the copy and its provenance), with the live
    confirmation deferred to 3.5.

- [ ] **3.4 Demonstrate both success criteria as counts** — the brief requires
      both halves to be _demonstrated, not asserted_. Both are computable
      offline from the artifacts already in hand, because replica-a **is** the
      new baseline set: the `signal` pairing is exactly "the perturbation
      against the new baselines" and the `run` pairing is exactly "a second
      real runner against the new baselines".
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
    - Both numbers are traceable to the run id from 2.3; neither is recomputed
      from a fresh capture, and no new push or dispatch is required.
  - Blocked by: 3.2, 3.3
  - Verification: **local** (arithmetic over CI-produced artifacts), with 3.5
    supplying the independent live confirmation of SC-2.

- [ ] **3.5 Open the single PR and confirm its own visual job is green — and
      stop** — `architecture.md` § Blast-radius ordering is a design
      constraint, and this is the item that satisfies it.
  - Accept: exactly **one** PR carries the tolerance change (3.2), the guard
    (3.1) and all 49 regenerated baselines (3.3) — a PR carrying one without
    the others is a PR that could not have been produced by the designed path.
    Its own `Visual Regression (rialto-web)` job concludes **success**; that
    conclusion is a **third** real Linux runner agreeing with 3.4's SC-2
    arithmetic, and it is recorded. `CI Gate` is green, including the new
    guard. **Nothing is merged, tagged, published or deployed** — release
    authorization is NONE; the PR is prepared and left. Residual hazard the
    design accepts and this item watches for: if `main` lands a real UI change
    between 2.3's capture and this PR, the captured baselines are invalidated
    — detection is free (this job goes red) and the recovery is a **re-push of
    a fresh `measure/**` ref at the new base commit**, never a force-through
    and never a locally regenerated baseline.
  - Blocked by: 3.4
  - Verification: **CI** for the visual job's conclusion; **local** for the
    single-PR shape.

- [ ] **3.6 Correct the baseline-regeneration procedure in
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
around them; `architecture.md` revision 2 (commit `bba244036`) closes all
three, and **every `Blocked by: Design gap N` edge in pass 1's cut is
released**. What follows is the record of what was found and how it was closed
— verified against the revision this stage, not taken on the hand-off's word.

### Gap 1 — the signal set was never defined, so `S(t)` was undefined — CLOSED

Pass 1 found that `S(t) = min over PERTURBED snapshots` had no way to know
which snapshots those were: the `Measurement` row carried no flag, `opts` was
never enumerated, and the set was provably not all 49 (the CSS was keyed on
`[data-testid=…]` on the harness, while the 2 telemetry snapshots are captured
through a `[data-feed-state]` locator on a different route).

**Closed by dissolving the premise, not carving out the exception.** The
perturbation CSS is now `[data-testid], [data-feed-state] { opacity: 0.55 }` —
both of `visual.spec.ts`'s subject-locator forms, so the set is **all 49 by
construction**. Membership is derivable three ways rather than listed: (a) the
two selectors are exhaustive over the spec (verified this stage against
`visual.spec.ts:66/89/135/143`, `Section.tsx:18` and `Telemetry.tsx:58` — 38
light + 9 dark + 2 telemetry = 49, and 49 baseline PNGs are committed); (b)
`noise-floor-coverage.test.ts` **fails closed** on any third locator form
(item 2.1); (c) the rule verifies per snapshot that the perturbation was
observed, `observed(s) ⟺ count(signal, s, 0) ≥ 10 × max(count(run, s, 0), 1)`
(item 1.4). An unobserved snapshot is a hard stop,
`verdict: "signal-not-observed"` — never a silent exclusion, because exclusion
only ever _raises_ `S`, which loosens the suite. Explicit exclusions carry a
reason, echo into `evidence.excluded`, and still contribute to `N_run` and
`N_drift`.
**Landed in:** 1.4 (clause 0, `signalSet`, `excludedFromSignal`), 2.1 (the CSS
and its coverage test), 2.5 (the `signal-not-observed` branch), 3.4 (SC-1's
scope).

### Gap 2 — clause 4 had three outcomes and no decision boundary — CLOSED

Pass 1 found clause 4 unexecutable: a regression with no stated statistic, no
cutoff, and a third branch ("both regimes present") that a single fit cannot
produce.

**Closed by separating the decision from the diagnostic.** The budget form is
fixed by fiat to a single `maxDiffPixels` key, for three stated reasons — the
measured in-repo failure of the ratio form (#4450 → #4496, recorded in the live
config's own comment), a near-constant image width across the set (1184 / 1216
/ 1232 px, 4.05% spread, so a ratio is an absolute budget scaled by section
height), and `parseMaxDiffPixels` being live on `main` since #4569 merged, so a
ratio would degrade a shipped PR comment **today**. The regression is demoted
to a reported diagnostic with a named statistic (feasible-interval headroom in
decades, `H_abs` / `H_ratio`) against an explicit **0.3-decade** boundary, both
branches defined, and the emitted form unchanged on either. The `min()`
both-keys form is retired.
**Landed in:** 1.5 (the whole clause), 3.1 assertion 2 (tightened to the fixed
shape), 3.2 (a single key), 2.5 (`formReview` recorded, and routed back to
Architect rather than acted on).

### Gap 3 — the dispatch precondition collided with release authorization — CLOSED

Pass 1 found the instrument `workflow_dispatch`-only, a `workflow_dispatch`
workflow undispatchable while its file is off the default branch, and this run
authorized to prepare and stop — so item 2.3 was unreachable.

**Closed without a merge and without blocking on authorization.** The trigger
is now `workflow_dispatch` **plus** `push: branches: ["measure/**"]`, and the
measurement is taken by pushing a disposable `measure/visual-noise-floor-<n>`
ref at the run branch's head — a branch write, which the run already performs.
`workflow_dispatch` remains the post-merge re-measure path. **Re-measured
independently this stage:** every `push:` trigger in `.github/workflows/` is
filtered to `branches: [main]` (13 workflows; `storybook.yml` uses the list
form), and no `create:` trigger exists anywhere, so nothing in the repo fires
for a `measure/**` ref; and `measure/**` cannot match the
`visual-diffs/pr-…/run-…` namespace `visual-diff-ref-trigger-safety.test.mjs`
protects, so `findTriggerViolations` returns `[]` for the new trigger.
**Landed in:** 2.2 (the trigger and both safety assertions), 2.3 (the push
path, with `gh workflow run` recorded as post-merge only), Standing rules (the
release-authorization bullet no longer names a collision).

### Recorded, not routed: `maxArea` in clause 4's `H_ratio` floor

`architecture.md` § `recommend` clause 4 writes
`H_ratio = log10((Sr(t) / signalMargin) / max(noiseHeadroom × Nr(t), 1 / maxArea))`
and does not define `maxArea`. The only reading that makes the floor mean "one
pixel in the largest image" is the largest `area` in the measurement set, and
Implement takes it — but this is recorded rather than silently absorbed,
because it is not free: baseline areas span 117,216 → 1,047,200 px, so a
min-vs-max reading moves the floor by up to ~0.95 decades. It matters in
exactly one narrow case — `Nr(t) = 0` at the selected `t`, i.e. the ratio-domain
noise floor measured exactly zero — where `H_ratio` is inflated and could trip
the 0.3-decade `formReview` flag on a floor artifact rather than a measurement.
**Blast radius is zero for what this run emits:** `formReview` is reported,
never acted on automatically, and the form stays `maxDiffPixels` on either
branch. Item 2.5 records `Nr(t)` alongside `formReview` so a reviewer can see
when the flag rests on the floor. Not routed back: it cannot change a value,
and the alternative — stopping the run to have a floor constant named — costs
more than the ambiguity does.

## Coverage

Every component in `architecture.md` § Components, and both success criteria
from the brief, mapped to the item that owns them.

| Architecture component                                                                                            | Owned by                                    |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| (1) Tolerance declaration — `apps/rialto-web/playwright.config.ts`                                                | 3.2                                         |
| (2) Noise-floor capture — `.github/workflows/visual-noise-floor.yml`                                              | 2.2 (authored), 2.3 (run)                   |
| (3) Perturbation config — `playwright.noise-floor.config.ts` + `e2e/noise-floor-perturbation.css` + coverage test | 2.1                                         |
| (4) Comparison analyzer — `scripts/visual-noise-floor.mjs`                                                        | 1.3                                         |
| (5) Decision rule — `scripts/visual-tolerance-rule.mjs`                                                           | 1.4 (clauses 0-3, verdicts), 1.5 (clause 4) |
| (6) Config-text reader — `scripts/visual-tolerance.mjs`                                                           | 1.2                                         |
| (7) Drift guard — `scripts/__tests__/visual-tolerance-guard.test.mjs`                                             | 3.1 (RED), 3.2 (green)                      |
| Not a module: baseline supply (replica-a artifact)                                                                | 3.3                                         |

| Success criterion                                  | Owned by                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 — the subtle perturbation now **fails**       | 2.1 (the signal), 3.4 (counts), guaranteed arithmetically by 1.4's upper clamp `B ≤ S(t)/signalMargin`                                  |
| SC-2 — legitimate rendering noise still **passes** | 2.2 (replicas a/b), 3.4 (counts), 3.5 (live, a third runner), guaranteed arithmetically by 1.4's lower clamp `B ≥ noiseHeadroom × N(t)` |

Where the three non-`ok` outcomes land: `signal-not-observed` and
`no-separation` are both branches of **2.5**, which is the only item authorized
to stop the run; the clause-0 low-contrast case (`light-table-empty`,
`light-skeleton-variants`) is named inside 2.5's `signal-not-observed` branch
with its recovery, and its designed human override
(`opts.excludedFromSignal` with a reason) is implemented in **1.4** and
surfaced in **3.4**'s SC-1 scope. A malformed measurement set throws in **1.4**.

No ADR item: `architecture.md` § ADRs records that no decision met the bar —
re-checked in revision 2, where the revision-1 candidate (the both-keys
`min()` form) disappeared entirely and its replacement (fixing the form by
fiat) is one config line and one guard assertion to reverse. The durable part
lives in `scripts/visual-tolerance-rule.mjs` as executable, unit-tested code
and in the config's provenance comment.

## Notes

_Deviations discovered during Implement get logged here, dated. The items above
also route specific evidence here: 1.1's branch measurement; 2.3's run id,
provenance tuple and verdict; 2.4's outlier classification; 2.5's branch and
form diagnostic; 3.1's observed RED output; 3.4's per-snapshot SC-1/SC-2
tables._

**2026-08-27 (Decompose, pass 1).** `architecture.md` revision 1 stated that
PR #4569 is unmerged and accepted a cross-run merge-order cost on that basis.
Measured: **#4569 merged 2026-08-26T04:30:41Z** (squash `8bd4f675`),
`origin/main` is `a4d0830b6`, and `scripts/visual-diff-report.mjs` there is
byte-identical to this branch's copy.

**2026-08-27 (Decompose, pass 2) — item 1.1 discharged.** The run was re-based
onto `fix/visual-tolerance-threshold`, cut from `origin/main` @ `a4d0830b6`.
Measured: `git rev-list --left-right --count origin/main...HEAD` = **0 behind /
6 ahead**; `git diff --stat origin/main...HEAD` = **7 files, 2,392 insertions**,
every one of them markdown under `docs/` — **zero code**. (The sixth commit,
`bba244036`, is `architecture.md` revision 2; a measurement taken before it
reports 5 ahead / 1,985 insertions.) Run 1's stranded
`docs/features/visual-diffs-in-pr/retro.md`, its `review.md` second-review-pass
section, and six `docs/backlog.md` seeds came along in the replay.
`git show origin/main:scripts/visual-diff-report.mjs` contains both
`parseMaxDiffPixels` and a private `stripComments`, so item 1.2's precondition
holds. **The #4569 coupling inverted rather than vanished** —
`parseMaxDiffPixels` is live on `main`, so emitting a `maxDiffPixelRatio` would
degrade a shipped PR comment today; that is reason 3 of clause 4's fiat, and
any framing of it as a merge-order hazard is stale.

**2026-08-27 (Decompose, pass 2) — measurements taken while re-cutting.**
Recorded so Implement and Review do not re-derive them:

- `apps/rialto-web/vitest.config.ts` `include` is an explicit path list
  (`["src/**/*.test.{ts,tsx}", "e2e/workflow-coverage.test.ts"]`), not an
  `e2e/` glob — deliberately, because `e2e/a11y.test.ts` is a
  Playwright-authored `*.test.ts` that breaks under vitest. Item 2.1 must add
  `e2e/noise-floor-coverage.test.ts` to that list or the coverage test never
  runs, and `scripts/check-orphaned-tests.mjs` will not catch it (directory
  reachability, not per-package globs — its own docblock records the limit).
- Every `push:` trigger in `.github/workflows/` is filtered to
  `branches: [main]` — 13 workflows, `storybook.yml` in list form — and there
  is no `create:` trigger anywhere in the directory. So a
  `measure/visual-noise-floor-<n>` push fires nothing today, independently
  confirming architecture.md § Components 2.
- `scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs` scans **every**
  file in `.github/workflows/` and asserts (a) zero `findTriggerViolations`
  and (b) zero unreadable files. Adding `visual-noise-floor.yml` puts it under
  that scan automatically. The file exports only `parseOnSection` and
  `findTriggerViolations`; `filterValues` and `globToRegExp` are
  module-private.
- `visual.spec.ts` builds a screenshot subject in exactly two ways —
  `page.getByTestId(id)` (lines 66, 89) and `page.locator("[data-feed-state]")`
  (lines 135, 143) — confirming the perturbation CSS's two selectors are
  exhaustive. 49 baseline PNGs are committed.
- `apps/rialto-web/playwright.config.ts` today carries `maxDiffPixels: 300`,
  no `threshold`, and no live `maxDiffPixelRatio` (only a prose mention inside
  the explanatory comment) — so guard assertion 2 passes today and assertions
  1 and 4 are the RED item 3.1 must observe.
