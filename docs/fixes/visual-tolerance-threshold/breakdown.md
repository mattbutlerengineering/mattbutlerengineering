---
stage: decompose
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
assumptions:
  - "No live user input was available. The skill's review-the-cut step was not run: milestone boundaries, item sizing, and the per-item verification class (local / CI dispatch / human) are this stage's, drafted from architecture.md, defect.md and autorun-brief.md. No design decision was taken here — three gaps were found and routed back rather than closed."
  - "No tracker interaction anywhere in this breakdown — no item carries a `(tracker: #N)` reference, no export step is offered, and PR #4569 is untouched. Directed by autorun-brief.md § Decisions already made."
  - "PR #4569 merged at 2026-08-26T04:30:41Z — measured this stage against a freshly fetched `origin/main` (`a4d0830b6`), which carries `scripts/visual-diff-report.mjs` byte-identical to this branch. architecture.md § Decisions calls that run 'unmerged' and accepts a cross-run merge-order cost on that basis; the cost is now moot. Item 1.1 takes the consequence as the recommended default — the run re-bases onto a branch cut from current `origin/main` rather than continuing on `feat/visual-diffs-in-pr`, which is 27 ahead / 19 behind and would open a PR showing 29 files and 10,215 insertions of already-merged code."
  - "SC-1 and SC-2 are discharged offline from the single dispatch's own artifacts — the `signal` pairing (perturbed vs replica-a) for SC-1, the `run` pairing (replica-b vs replica-a) for SC-2 — because replica-a IS the regenerated baseline set, so those two pairings already are exactly 'the perturbation against the new baselines' and 'a second real runner against the new baselines'. Taken as the recommended default over a second dispatch (three more paid runner legs) or a temporary perturbation commit (the shape the prior run had to revert). The prepared PR's own live `Visual Regression (rialto-web)` job is carried as additional live SC-2 evidence, per architecture.md § Blast-radius ordering."
  - "Item 3.6 (correcting `.claude/rules/gotchas.md`'s baseline-regeneration bullet) is included as a direct consequence of architecture.md § Decisions naming replica-a as the baseline source in preference to the documented `rialto-web-visual-diffs` procedure — not as a drive-by improvement. It is one bullet."
  - "No item writes a tolerance value and no item regenerates a baseline before item 2.3 holds a real run id. That ordering is structural, not advisory: milestone 1 cannot produce a number, milestone 2 produces it, and milestone 3 cannot start without it."
---

# Breakdown: giving the rialto-web visual suite a measured sensitivity

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

> Source: [`architecture.md`](./architecture.md) in this directory. This is a
> work breakdown, not a design pass: every mechanism named below is
> Architect's. Three gaps found while cutting the work are recorded in
> **Design gaps found** and routed back — none is designed around here, and
> two of them sit on the critical path as explicit blocking edges.

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
  file is not a measurement.
- **The rule may return `verdict: "no-separation"`.** That is a designed hard
  stop, not a fallback, and item 2.5 is where it goes: the run stops writing
  values and routes back to Architect with `comparator: "ssim-cie94"` named as
  the designed next move. No item below assumes the measurement cooperates.

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
  causes, both recorded in `docs/backlog.md`). Worth knowing so nobody reads a
  green `pnpm lint` as coverage of the new modules — **not this run's job to
  fix**, and no item below touches it.
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
  Ship prepares and stops. See Design gap 3 — that constraint collides with
  item 2.3's dispatch precondition.

**Verification class** is stated on every item, because the three are not
interchangeable:

| Class     | Meaning                                                                     |
| --------- | --------------------------------------------------------------------------- |
| **local** | provable at a terminal on this machine; no runner, no network               |
| **CI**    | requires a real GitHub Actions run; cannot be faked or asserted from a diff |
| **human** | requires a person looking at something and forming a judgement              |

## Milestone 1: the instrument's pure core computes, at a terminal

**Demonstrable at the boundary:** given four directories of PNGs, you can
produce the full 1,176-row measurement set and a `Recommendation` verdict from
a shell prompt, with no runner and no network — proven on synthetic fixtures.
Still zero tolerance values written; still nothing known about this suite's
real noise.

- [ ] **1.1 Cut the run's branch from current `origin/main` and record the
      #4569 ordering** — the run's Capture and Architect commits currently sit
      on `feat/visual-diffs-in-pr`, which is **27 ahead / 19 behind**
      `origin/main`. `architecture.md` § Decisions was written on the belief
      that PR #4569 is unmerged; measured this stage, it merged
      **2026-08-26T04:30:41Z**, and `origin/main` (`a4d0830b6`) already carries
      `scripts/visual-diff-report.mjs` byte-identical to this branch. The
      accepted cross-run merge-order cost is therefore moot — but only if the
      run stops building on the stale branch.
  - Accept: a branch cut from `origin/main` at or after `a4d0830b6` carries
    `defect.md`, `architecture.md` and this file, and nothing else;
    `git diff --stat origin/main...HEAD` on it lists **only**
    `docs/fixes/visual-tolerance-threshold/*` (on `feat/visual-diffs-in-pr`
    the same command lists 29 files / 10,215 insertions, almost all of it
    already-merged #4569 code); `git show origin/main:scripts/visual-diff-report.mjs`
    contains `parseMaxDiffPixels` and a private `stripComments`, which is the
    precondition item 1.2 depends on; the measured merge date and the
    superseded architecture claim are noted in **Notes** below so Review and
    Ship do not re-derive them.
  - Blocked by: —
  - Verification: **local**

- [ ] **1.2 `scripts/visual-tolerance.mjs` — `readToleranceDirectives()`, and
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
  - Blocked by: 1.1 (the file it refactors exists only on a `main`-based branch)
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
    plus the merged provenance tuple. Row count is
    `names × pairings × thresholds`. Sweep defaults to
    `[0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2]`. Dimensions are read from
    the PNG header with `Buffer` arithmetic; **no new runtime or dev
    dependency appears in any `package.json`** (`git diff` on the item proves
    it) — adding `pixelmatch` directly would measure a lookalike. Every
    failure is hard and names the snapshot: a name present in one directory
    and absent from another; a dimension mismatch within a pair; an unreadable
    or non-PNG file; provenance tuples that disagree between legs. **No input
    is ever skipped and nothing degrades to a default** — a skipped snapshot
    would lower every max and percentile, biasing the answer toward _less_
    sensitivity, which is the direction of the original defect. When
    `GITHUB_STEP_SUMMARY` is set it also writes the markdown table there;
    otherwise it writes only the JSON. Tests build tiny synthetic PNGs
    in-process (a known-count diff at `threshold: 0`, an identical pair
    ⇒ count 0, and one test per failure mode asserting the thrown message
    names the offending snapshot).
  - Blocked by: —
  - Verification: **local**

- [ ] **1.4 `scripts/visual-tolerance-rule.mjs` — `recommend()`** —
      component (5). Pure arithmetic over the measurement rows, and the owner
      of saying _no pair is justified_.
  - Accept: `scripts/__tests__/visual-tolerance-rule.test.mjs` written first
    and observed failing. The module has **zero import statements** — in
    particular it never reaches `playwright-core` or item 1.3, and neither
    does its test; it declares the `Measurement` row shape it needs and the
    analyzer produces rows to that shape. `recommend(measurements, opts)`
    implements `architecture.md` § `recommend` exactly: `N_run(t)` = max over
    snapshots of the `run` pairing; `N_drift(t)` = **P90**, not max, over the
    `drift` pairing; `N(t) = max(N_run, N_drift)`; `S(t)` = **min** over the
    signal set. Clause 1 selects the **largest** sweep point satisfying
    `S(t) ≥ 10 × N(t)`. Clause 2 returns `verdict: "no-separation"` carrying
    the best achievable ratio and the snapshots driving it, and **never a
    guessed number** — a dedicated test asserts no numeric `threshold`,
    `maxDiffPixels` or `maxDiffPixelRatio` is present on that return. Clause 3
    computes `B = round(sqrt(N(t) × S(t)))` clamped to `[2 × N(t), S(t) / 2]`,
    with explicit cases for `N(t) = 0` (lower clamp 0, `N_drift` keeping the
    budget off the floor) and for the boundary at exactly `10 ×`. Clause 4 is
    **blocked on Design gap 2** and is not implemented until that is closed.
    `evidence` carries `N_run`, `N_drift`, `S`, the separation ratio, the
    correlation, and the above-P90 `drift` outlier list **by name** (item 2.4
    consumes it). An empty or partial measurement set throws; the rule never
    extrapolates across a missing sweep point.
  - Blocked by: **Design gap 1** (which snapshots constitute the signal set,
    and how that set reaches the rule — `S(t)` is undefined without it) and
    **Design gap 2** (clause 4's decision boundary). Not blocked by 1.3.
  - Verification: **local**

## Milestone 2: a real Linux measurement exists, and someone has read it

**Demonstrable at the boundary:** a GitHub run id, three artifacts of 49 real
Linux PNGs each, a step-summary table, and a `Recommendation` JSON whose
verdict and evidence are quoted into this file — numbers that did not exist
anywhere before this milestone, taken on the machine class the production job
actually runs on.

- [ ] **2.1 `apps/rialto-web/playwright.noise-floor.config.ts` +
      `apps/rialto-web/e2e/noise-floor-perturbation.css`** — component (3),
      the known-regression signal. A second config that spreads the production
      config and adds `expect.toHaveScreenshot.stylePath` pointing at a CSS
      file that reapplies the prior run's `opacity: 0.55` to harness sections
      by `[data-testid=…]`.
  - Accept: `pnpm --dir apps/rialto-web exec playwright test --config
playwright.noise-floor.config.ts --list` enumerates the **same 49 tests**
    as the production config (a spread that silences tests, the trap
    `playwright.csp.config.ts` documents with its `testIgnore: []`, would show
    up here); `pnpm typecheck` passes; the item's `git diff --name-only`
    contains **no path under `apps/rialto-web/src/**`** — the whole point of
    `stylePath` over the prior run's direct edit of `VisualTest.module.css` is
    that no perturbation is ever one bad `git add` away from being committed;
    the production `playwright.config.ts` gains **no env-var branch** (`git
diff` on that file is empty for this item).
  - Blocked by: **Design gap 1** (the CSS's section coverage and the rule's
    signal set are the same decision seen twice).
  - Verification: **local**

- [ ] **2.2 `.github/workflows/visual-noise-floor.yml`** — component (2), the
      capture instrument. Four jobs in one run: three tolerance-blind capture
      legs plus an analyze job.
  - Accept: `on:` contains **`workflow_dispatch` only** — no `push`, no
    `pull_request`, no `schedule`; `permissions: contents: read`. Three
    capture jobs, each `runs-on: ubuntu-latest` (the same label the production
    `visual` job uses — a different label measures a different machine) and
    each `timeout-minutes: 30`, invoking Playwright with
    `--update-snapshots=all` so the leg never compares: `replica-a` and
    `replica-b` on the production config, `perturbed` on 2.1's config. Each
    uploads `apps/rialto-web/e2e/screenshots/` plus a `provenance.json`
    recording `ImageOS`, `ImageVersion`, the Playwright version and the
    resolved Chromium build, as `visual-actuals-replica-a` /
    `-replica-b` / `-perturbed`. The analyze job declares `needs:` **all
    three** (so a failed leg means no analysis rather than a two-leg
    difference), does its **own clean checkout** — the capture legs overwrite
    the committed baselines in their own workspaces, so `committed` must come
    from a pristine tree — downloads the three artifacts, runs
    `scripts/visual-noise-floor.mjs` then `scripts/visual-tolerance-rule.mjs`,
    uploads the measurement JSON and the `Recommendation` JSON, and writes the
    markdown table to `$GITHUB_STEP_SUMMARY`. Every third-party action is
    pinned by full commit SHA from the list in Standing rules. Every `run:`
    block whose exit code is the point opens `set -o pipefail`. **The workflow
    cannot change what any required check concludes:**
    `git grep -n "visual-noise-floor" .github/` returns only this file itself,
    it appears in no `needs:` of `ci.yml`, it writes no ref, and
    `gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks`
    still returns `{"strict": false, "contexts": ["CI Gate"]}` after the item.
  - Blocked by: 1.3, 1.4 (the analyze job calls both), 2.1 (the perturbed leg
    needs a config to point at)
  - Verification: **local** for every criterion above — the file's shape,
    its non-reachability from `CI Gate`, and the branch-protection read are
    all checkable without running anything. Whether it _works_ is 2.3.

- [ ] **2.3 Dispatch the instrument and read its output** — the item that
      turns a workflow file into a measurement. **This is a separate item from
      2.2 on purpose:** the repo's recorded failure class is work that shipped,
      merged and closed COMPLETED having never once executed — including a
      dispatch-only validation workflow with zero runs, which is the same
      shape as this one.
  - Accept, in order:
    1. **Dispatchability is confirmed empirically before three runner legs are
       spent.** `gh workflow run visual-noise-floor.yml --ref <branch>` either
       creates a run or returns an error; the outcome is recorded verbatim in
       **Notes**. GitHub documents that a `workflow_dispatch` workflow triggers
       only when its file is present on the **default branch** — see **Design
       gap 3**, which is the single precondition most likely to make this item
       undispatchable under this run's release authorization.
    2. A **run id exists** and is recorded here.
    3. All four jobs conclude `success`.
    4. Each of the three artifacts contains exactly **49 PNGs**
       (`unzip -l <artifact>.zip | grep -c '\.png$'` = 49) — a leg that passes
       while writing fewer would have failed the analyzer's name-set check by
       name, and either outcome is recorded.
    5. The three `provenance.json` tuples **agree**; the recorded
       `ImageOS`/`ImageVersion`, Playwright version and Chromium build are
       quoted into **Notes**. (Legs may never be combined across dispatches —
       a re-dispatch is a new sample, and the runner image may have moved.)
    6. The step-summary table renders and is non-empty; the measurement JSON
       and the `Recommendation` JSON are downloaded, and the **verdict and
       full `evidence` block are pasted verbatim into Notes**. Reading is part
       of the item — a downloaded artifact nobody opened does not discharge it.
  - Blocked by: 2.2, and **Design gap 3**
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
  - Accept: every snapshot named in `evidence.outliers` is classified as
    **real un-baselined UI change** or **rendering noise**, each with a
    one-line reason referencing the diff image actually looked at; the
    classification is written into **Notes**; if any outlier is real UI change,
    that fact is carried into item 3.3 (those baselines are being deliberately
    updated to current `main`'s rendering, which is correct but must be stated,
    not discovered by a reviewer) and into item 3.4's SC-2 argument.
  - Blocked by: 2.3
  - Verification: **human.** Stated plainly: this step is **not automatable**,
    and no acceptance criterion below silently assumes it was. It needs a
    person (or a reviewing stage acting as one) opening diff images.

- [ ] **2.5 Read the verdict and take the branch it dictates** — the decision
      gate. Two outcomes, both designed.
  - Accept, whichever applies:
    - **`verdict` names a `(threshold, budget)` pair** → the pair, the
      separation ratio, and the correlation outcome are recorded in **Notes**,
      and milestone 3 is unblocked. This is the only path on which any item in
      milestone 3 may start.
    - **`verdict: "no-separation"`** → **hard stop.** Milestone 3 does not
      start, no tolerance value is written, no baseline is regenerated. The
      best achievable ratio and the snapshots driving it are recorded in
      **Notes**, and the run routes back to **Architect** with
      `comparator: "ssim-cie94"` named as the designed next move together with
      the two costs `architecture.md` § Decisions already records against it
      (absent from `types/test.d.ts`, so a typed config needs a cast; and it
      hardcodes `maxColorDeltaE94: 1` and ignores `threshold` entirely, which
      makes the whole `t` sweep meaningless). This branch is **not** a
      fallback to a guessed number, and no item below may proceed by picking
      one.
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

**Every item in this milestone is blocked by 2.5 returning a pair.**

- [ ] **3.1 `scripts/__tests__/visual-tolerance-guard.test.mjs`, authored RED**
      — component (7), the drift guard. Written **before** the config change,
      TDD order, so its failure against today's config is observed rather than
      assumed.
  - Accept: the file implements `architecture.md` § `visual-tolerance-guard`'s
    five assertions and **holds no copy of any tolerance value** — a reviewer
    can grep it for a numeric literal and find none:
    (1) `threshold` is present in `apps/rialto-web/playwright.config.ts` as an
    explicit numeric literal; (2) at least one budget directive is live and
    every live directive is a readable numeric literal; (3) **no
    `toHaveScreenshot` call site in `apps/rialto-web/e2e/visual.spec.ts` passes
    `threshold`, `maxDiffPixels` or `maxDiffPixelRatio`** — today all four pass
    only `timeout`, and this is module (1)'s single-point-of-control invariant;
    (4) the two provenance lines exist and parse; (5) `noise-floor-values`
    equals the live directives key for key — the guard's second operand travels
    with the first, so a legitimate re-tune that updates both stays green and a
    silent one reds naming both sides. It reads the config's text through
    item 1.2's `readToleranceDirectives`, never `import()` (the config's
    `defineConfig` is unresolvable where `parseMaxDiffPixels`'s caller runs, and
    one reading strategy for one file is enough). The item is complete when
    the test is **observed failing** on assertions 1 and 4 against the
    unmodified config, and that output is recorded in **Notes**. It goes green
    in 3.2 — the two items land in the same PR, guard first in the diff.
  - Blocked by: 1.2, 2.5
  - Verification: **local**

- [ ] **3.2 Write the measured tolerance into
      `apps/rialto-web/playwright.config.ts` with its provenance** —
      component (1). The one place this suite's sensitivity is declared, for
      all 49 snapshots, together with the machine-readable record of the
      measurement that justifies it.
  - Accept: `expect.toHaveScreenshot` carries the `threshold` and the budget
    key(s) that item 2.5's verdict named — **and nothing else**; no value is
    rounded, reinterpreted, or "adjusted for safety" relative to the rule's
    output, and any deviation would be a new decision, which this stage has no
    authority to take. The two provenance lines from
    `architecture.md` § Data model sit in the same file, in exactly that form,
    naming the real run id from 2.3 and the real `ImageOS`/`ImageVersion` and
    Playwright version. `scripts/__tests__/visual-tolerance-guard.test.mjs`
    goes **green**, all five assertions. No `toHaveScreenshot` call site in
    `visual.spec.ts` is touched. `pnpm exec turbo run test --concurrency=4`
    passes, which includes both the guard and
    `scripts/__tests__/visual-diff-report.test.mjs`.
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
  - Accept, at the `(threshold, budget)` written in 3.2, using item 1.3's
    analyzer over item 2.3's artifacts:
    - **SC-1 — the subtle perturbation now fails.** For **every** snapshot in
      the signal set, `count(signal, t*)` exceeds the enforced per-image
      budget; the per-snapshot table is recorded in **Notes** and the smallest
      margin is stated explicitly. This is the direct answer to the prior run's
      `opacity: 0.55` perturbation passing all 49.
    - **SC-2 — legitimate rendering noise still passes.** For **every** one of
      the 49 snapshots, `count(run, t*)` is at or under the enforced per-image
      budget; the largest observed value and its snapshot are named. Where the
      budget form is a ratio, "enforced per-image budget" means the per-image
      value, not a single number.
    - Both numbers are traceable to the run id from 2.3; neither is recomputed
      from a fresh capture, and no new dispatch is required.
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
    between 2.3's dispatch and this PR, the captured baselines are invalidated
    — detection is free (this job goes red) and the recovery is a **re-dispatch
    at the new base commit**, never a force-through and never a locally
    regenerated baseline.
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

Three. None is designed around here; each is routed back with the item it
blocks. Gaps 1 and 2 sit on the critical path.

### Gap 1 — the signal set is never defined, and `S(t)` is undefined without it

`architecture.md` § `recommend` defines
`S(t) = min over PERTURBED snapshots of count(pairing = signal, t)` and argues
for the minimum on the grounds that "averaging over sections that changed a lot
would hide the one that barely did". That argument only holds over the
snapshots that were **actually perturbed**. But:

- the `Measurement` row (§ Data model) carries no flag distinguishing a
  perturbed snapshot from an unperturbed one — `pairing: "signal"` is present
  on all of them;
- `recommend(measurements, opts)` never enumerates `opts`, so no input carries
  the set either;
- the set is provably **not** all 49: the perturbation CSS is keyed on
  `[data-testid=…]` on the `/visual-test` harness, while
  `telemetry-game.png` and `telemetry-default.png` are captured on a different
  route through a `[data-feed-state]` locator, so those two can never be
  perturbed by it. Any unperturbed snapshot in the min collapses `S(t)` to
  noise level and forces a spurious `no-separation` — the designed hard stop,
  reached for the wrong reason;
- the same decision appears a second time as "which harness sections does
  `noise-floor-perturbation.css` target" — the prior run perturbed 8 sections;
  `architecture.md` § Components (3) says only "the harness sections".

**Blocks:** 1.4 (`S(t)` cannot be computed) and 2.1 (the CSS's coverage).
**Routed to:** Architect. Decompose does not pick the set, does not add a row
field, and does not extend `opts`.

### Gap 2 — clause 4's budget form has three outcomes and no decision boundary

`architecture.md` § `recommend` clause 4 is explicitly the clause meant to end
the #4450 → #4496 flip-flop by reading the answer off the data. As written it
is not executable:

- it says "regress `count` on `area` across the 49 snapshots at the selected
  `t`, on the `drift` pairing", then branches on **area-correlated**,
  **area-independent**, or **both regimes present** — with no stated statistic
  and no cutoff (no r², no slope test, no threshold of any kind);
- "**both regimes present**" has no operational meaning for a single
  regression over a single set — it is a third state the § Data model access
  pattern that feeds it does not produce (access pattern 4 asks only "**whether**
  count correlates with image area", a binary);
- the branch is load-bearing: it decides between `maxDiffPixels`,
  `maxDiffPixelRatio`, and both-with-`Math.min`, and the `min()` branch has
  never executed in this repo's history.

**Blocks:** clause 4 of item 1.4, and therefore the budget form written in 3.2.
**Routed to:** Architect. Decompose does not invent a correlation cutoff.

### Gap 3 — the dispatch precondition collides with the run's release authorization

`architecture.md` § Components (2) makes the instrument `workflow_dispatch`-only
and § Hand-off requires it to be dispatched before any tolerance value is
written. GitHub documents that the `workflow_dispatch` event triggers a run
only when the workflow file is present on the repository's **default branch**.
This run's authorization is _prepare and stop_ — no merge, of anything.

If the documented constraint holds for this repo, item 2.3 cannot be
dispatched from the run's own branch, and the run cannot reach milestone 3 at
all. The resolutions are all outside Decompose's authority: land
`visual-noise-floor.yml` on `main` ahead of the run's PR (a one-file,
dispatch-only, `CI Gate`-neutral change — but still a merge), or have Architect
revisit the trigger.

Two measurements taken this stage, neither decisive on their own:
`visual-diff-ref-sweep.yml` appears in
`GET /actions/workflows` and has a successful run, but that run's event is
`schedule` on `main` and the file **is** on `main` now (#4569 merged), so it
does not demonstrate branch-only dispatch either way. Item 2.3's first
acceptance criterion therefore turns the uncertainty into a measured step
rather than an assumption — attempt the dispatch and record the outcome
verbatim before spending three runner legs.

**Blocks:** 2.3, and transitively all of milestone 3.
**Routed to:** Architect (trigger design) **and** the release-authorization
holder (a narrow, explicit exception). Decompose does not choose between them
and does not work around the trigger.

## Coverage

Every component in `architecture.md` § Components, and both success criteria
from the brief, mapped to the item that owns them.

| Architecture component                                                                            | Owned by                  |
| ------------------------------------------------------------------------------------------------- | ------------------------- |
| (1) Tolerance declaration — `apps/rialto-web/playwright.config.ts`                                | 3.2                       |
| (2) Noise-floor capture — `.github/workflows/visual-noise-floor.yml`                              | 2.2 (authored), 2.3 (run) |
| (3) Perturbation config — `playwright.noise-floor.config.ts` + `e2e/noise-floor-perturbation.css` | 2.1                       |
| (4) Comparison analyzer — `scripts/visual-noise-floor.mjs`                                        | 1.3                       |
| (5) Decision rule — `scripts/visual-tolerance-rule.mjs`                                           | 1.4                       |
| (6) Config-text reader — `scripts/visual-tolerance.mjs`                                           | 1.2                       |
| (7) Drift guard — `scripts/__tests__/visual-tolerance-guard.test.mjs`                             | 3.1                       |
| Not a module: baseline supply (replica-a artifact)                                                | 3.3                       |

| Success criterion                                  | Owned by                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| SC-1 — the subtle perturbation now **fails**       | 3.4 (counts), guaranteed arithmetically by 1.4's upper clamp `B ≤ S(t)/2`                               |
| SC-2 — legitimate rendering noise still **passes** | 3.4 (counts), 3.5 (live, a third runner), guaranteed arithmetically by 1.4's lower clamp `B ≥ 2 × N(t)` |

No ADR item: `architecture.md` § ADRs records that no decision met the bar, and
that the durable part of the closest candidate lives in
`scripts/visual-tolerance-rule.mjs` as executable, unit-tested code rather than
in a document.

## Notes

_Deviations discovered during Implement get logged here, dated. The items above
also route specific evidence here: 2.3's run id, provenance tuple and verdict;
2.4's outlier classification; 2.5's branch; 3.1's observed RED output; 3.4's
per-snapshot SC-1/SC-2 tables._

**2026-08-27 (Decompose).** `architecture.md` § Decisions & alternatives states
that PR #4569 is unmerged and accepts a cross-run merge-order cost on that
basis. Measured this stage against a freshly fetched `origin/main`: **#4569
merged 2026-08-26T04:30:41Z**, `origin/main` is `a4d0830b6`, and
`scripts/visual-diff-report.mjs` there is byte-identical to this branch's copy.
The accepted cost is moot and item 1.2's refactor has no cross-run hazard left
— provided item 1.1 re-bases the run first. The branch this run has been built
on so far (`feat/visual-diffs-in-pr`) is 27 ahead / 19 behind `origin/main`, and
a PR from it would show 29 files and 10,215 insertions of already-merged code.
