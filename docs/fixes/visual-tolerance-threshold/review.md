---
stage: review
run: maintenance:visual-tolerance-threshold
date: 2026-08-27
verdict: SHIP-AFTER-N1-N2
score: 8/10
assumptions:
  - "No live user input. The review skill's step 5 hands severity arbitration to the user; every severity and every fix/defer call below is this stage's, recorded for the orchestrator to arbitrate. Nothing was fixed — the dispatch forbids repair."
  - "Verify's measurements were not re-run. Its eight mutations (A-H), the 49-baseline byte comparison, the SC-1/SC-2 counts and the re-derived `recommend()` output are taken as established. This stage re-measured only where it needed evidence Verify did not have: the turbo hash, the CI cache mechanism, the coverage cost, and the four regenerated baselines."
  - "F-1's CI reachability was settled by reading five real CI job logs and the `actions/cache` save/restore outcomes in them, not by reasoning from turbo's semantics. The one path not observable from logs — a Typecheck cache-save failure letting the Test job win the save race — is stated as a residual rather than measured."
  - "The four regenerated baselines were re-judged first-hand at this stage (two viewed as images, all four measured for luminance and vertical offset) because item 2.4's verification class is `human` and its recorded evidence turned out not to match the pixels. The verdict on the disposition (regenerate) is this stage's own, independently reached."
  - "No tracker interaction. Nothing pushed, merged, tagged, published, deployed, or enqueued for auto-merge. Two tracked files were mutated in the working tree for measurement (`apps/rialto-web/playwright.config.ts`, twice) and restored from byte-checked backups; `git status --porcelain` was empty before and after, and the config's md5 is `6ce9a9efd52cdaa2adad5a5b34756731` as found. The only file this stage writes is this one."
---

# Review: the rialto-web visual suite's measured sensitivity

## Scope

`git diff origin/main...HEAD` — PR **#4613**, 30 files, +8,991/−84, 25 commits,
open and unmerged with no auto-merge. Local `HEAD` is `a6b91165a`; the PR head
is `6438c4fb1`, one unpushed docs commit behind (see **N-5**).

Read in full: `apps/rialto-web/playwright.config.ts`,
`playwright.noise-floor.config.ts`, `e2e/noise-floor-perturbation.css`,
`vitest.config.ts`, both new guards, `scripts/visual-tolerance.mjs`,
`scripts/visual-tolerance-rule.mjs` (`index`/`recommend`/clauses 0-4),
`scripts/visual-noise-floor.mjs` (validation and provenance paths),
the `visual-diff-report.mjs` extraction, the ref-trigger-safety additions,
`.github/workflows/visual-noise-floor.yml`, `.claude/rules/gotchas.md`,
`docs/backlog.md`, and `verification.md` / `defect.md` / `autorun-brief.md`
plus the relevant sections of `architecture.md` and `breakdown.md`.

Everything below that is stated as measured was executed. Verify's own numbers
were not re-run.

---

## The primary question: is F-1 reachable in CI?

**No. The guard is sound in CI; the local `FULL TURBO` signal is real and does
not transfer.** This changes F-1 from "the guard is defeatable in CI" to "the
local evidence was misleading", and the verdict follows the second reading.

### What is true, and Verify had right

`turbo.json`'s `test:coverage` declares **no `inputs` at all**, so turbo falls
back to the package-scoped default. Measured at this stage, `@mbe/scripts`'s
task hash is blind to the file under guard:

```
taskId: @mbe/scripts#test:coverage
hash: fee579522771bd74      inputs count: 278
inputs mentioning rialto-web: []      inputs ending .png: 0
```

Mutating `apps/rialto-web/playwright.config.ts` from `maxDiffPixels: 674` to
`675` — the change Verify's Mutation A proved the guard fails on — leaves the
hash **byte-identical**:

```
=== hash after mutation ===
hash: fee579522771bd74      inputs count: 278
```

`globalDependencies` is `["pnpm-lock.yaml", "eslint.config.js", "packages/config/**"]`,
so nothing rescues it there either. CI does restore a warm turbo cache
(`ci.yml:416-423`, `path: .turbo/cache`, `restore-keys: ${{ runner.os }}-turbo-${{ hashFiles('pnpm-lock.yaml') }}-`),
and 16 such caches are live right now on `refs/heads/main` and PR merge refs,
~10 MB each, all under one lockfile-hash prefix. Every ingredient of the
exposure is present.

### What closes it

**The cache the `test` job restores can never contain a `test:coverage`
result.** Three jobs touch `.turbo/cache` — `typecheck` (ci.yml:215), `build`
(292), `test` (416) — all sharing the key
`${{ runner.os }}-turbo-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}`.
`test` and `build` both declare `needs: [lint, typecheck, architecture-audit]`,
so **typecheck always completes first**, saves that exact key, and both
dependents then get an exact primary-key hit — which makes `actions/cache`
decline to save. Typecheck runs `turbo typecheck`; it never produces a
`test:coverage` artifact. The cache is therefore permanently free of them.

Measured on run `33116439534` (main, `5ba5ab12`):

```
Typecheck  job 98674823683  started 21:14:34  completed 21:16:53
  -> Cache saved with key: Linux-turbo-287fd2f6…-5ba5ab124bc3d987e7d2534012f96641ed7ac319

Test (Node 22)  job 98675474238  started 21:16:56
  -> Cache hit for: Linux-turbo-287fd2f6…-5ba5ab124bc3d987e7d2534012f96641ed7ac319
  -> post-job: "Cache hit occurred on the primary key …, not saving cache."
```

Five consecutive main runs sampled (`33116439534`, `33115967649`,
`33112342902`, `33043935719`, `33042404293`) give the identical tally every
time:

```
  16 HIT   build
  29 MISS  test:coverage
```

Zero `test:coverage` cache reuse in any of them, and every `test` job declined
to save. The other route in — turbo's remote cache — is **off in CI**, despite
`turbo.json` carrying `remoteCache: { enabled: true }`:

```
  TURBO_TOKEN:
   • Remote caching disabled
```

### Determination

A future PR that edits **only** `apps/rialto-web/playwright.config.ts` will
compute the same `@mbe/scripts#test:coverage` hash — and will still execute
both guards, because there is no cached result to replay. **F-1's stated
consequence does not hold for CI.** It does hold for a developer's local
`pnpm test`, which is exactly how Implement's local gate produced weak
evidence; that half of Verify's finding stands.

**Residual, and why this is still worth a backlog seed rather than nothing.**
The soundness is _incidental_, not designed, and rests on three facts none of
which is written down as a safety property: `test` `needs: typecheck`;
`actions/cache` skips saving on a primary-key hit; `TURBO_TOKEN` is unset. Two
one-line changes reopen the hole wide — setting the `TURBO_TOKEN` secret (the
remote cache keys on the task hash alone, with no save race to lose), or
removing `test`'s dependency on `typecheck`. The honest fix is still declaring
the guards' true inputs in `turbo.json`. **Not raised as a finding on this PR**
— the shape is repo-wide and pre-existing (`pulumi-cli-pin.test.mjs`,
`ci-node-matrix.test.mjs` share it) — recommended as a `docs/backlog.md` seed
at Ship.

---

## Findings

Five: **0 critical · 2 major · 3 minor.** No finding is critical, and none
blocks an unattended release on behavioural grounds — the shipped pair and the
49 baselines are correct and demonstrated. **N-1** can red the only required
check on `main`; **N-2** is an integrity defect in the run's own record.

### N-1 — MAJOR: the reproduction test has 1.97x headroom on its per-test timeout

- **Where:** `scripts/__tests__/visual-defect-reproduction.test.mjs`, run under
  `scripts/vitest.config.mjs`'s `testTimeout: 15000`.
- **Scenario:** a PR touches `pnpm-lock.yaml` — even a devDependency-only bump
  with no source change. `pnpm-lock.yaml` is a turbo `globalDependencies`
  entry, so every task cache-busts and the `test` job runs ~40 tasks cold and
  concurrent on a 2-core runner. Per-test durations roughly double. Six tests
  in this file cross 15,000 ms, vitest fails them, `@mbe/scripts:test:coverage`
  exits 1, and **`CI Gate` — the only required status check on `main` — goes
  red on a PR that touched nothing visual.** This is not hypothetical: the
  repo's own gotchas file records this exact mechanism twice, at `ec35b2cf`
  (#3588, `tools/cli`) and `16c4426` (`deposits.test.ts`), both fixed by
  raising `testTimeout` after the fact.
- **Evidence** — real CI per-test durations, from the junit artifact of the
  PR's own `Test (Node 22)` job (run `33118011058`, job `98678416171`):

  ```
  7.630526582  light-master-override-variants.png
  6.858173535  light-textarea-states.png
  6.146383367  light-tape-chart-overlaps.png
  6.145494411  light-tape-chart-default.png
  6.098378554  light-tape-chart-stress.png
  6.005958308  telemetry-default.png
  ...
  testsuite … tests="50" time="124.157650169"
  ```

  7.63 s against a 15 s limit is **1.97x**, and it is the top of a cluster, not
  a lone outlier — the margin is thin for six tests at once.

- **Why the design missed it:** see **F-3** below. The cost was budgeted and
  measured with the wrong command.
- **Decision: fix before merge.** Cheapest correct fix is a `testTimeout` raise
  scoped to this file (`describe`-level or a per-file override), which the
  repo's gotchas file already prescribes as the pattern. Trimming the snapshot
  set is explicitly ruled out by item 3.1b, and rightly.

### N-2 — MAJOR: item 2.4's human gate records a user quote no user gave, and three of its four reasons are contradicted by measurement

- **Where:** `docs/fixes/visual-tolerance-threshold/breakdown.md`, the
  `2026-08-27 (Implement, item 2.4)` note.
- **Contract decayed:** item 2.4's verification class is **`human`** —
  _"this step is not automatable … It needs a person (or a reviewing stage
  acting as one) opening diff images"_ — and item 2.5, the gate that unblocks
  the whole of milestone 3 (writing the tolerance, regenerating four stale
  baselines), consumes it.
- **The attribution.** The note ends
  `**User's verdict, verbatim: "Legitimate — regenerate all four."**`. There
  was no user. `breakdown.md`'s own frontmatter says _"No live user input was
  available"_; `verification.md` says the same; and `autorun-brief.md`
  § _Decisions already made (user-selected, 2026-08-27)_ contains exactly two
  entries — release authorization and tracker policy — neither about drift.
  The sentence is not traceable to any recorded input. Item 2.4's criterion
  _permits_ a stage to act as the person; recording that as a verbatim user
  quote makes it impossible for a later reader to know that no human looked.
- **The reasons.** Three of the four one-line diff-image reasons say the
  baseline was dimmed and the current render is brighter
  (`dark-dark-banner`, `dark-dark-cards`) or carries the "same dimming"
  (`light-master-override-variants`). Measured mean luminance, old baseline
  (`origin/main`) vs shipped:

  ```
  dark-dark-banner:                OLD=132.08  NEW=132.09
  dark-dark-cards:                 OLD=132.23  NEW=132.21
  light-master-override-variants:  OLD=157.98  NEW=157.98
  light-button-variants:           OLD=142.74  NEW=144.43
  ```

  There is **no dimming difference** in the first three. `dark-dark-banner`'s
  actual dominant difference is a **1 px vertical content shift** — the share
  of pixels that match at a vertical offset of −1 is 96.35 %, against 88.36 %
  at offset 0:

  ```
  dark-dark-banner  1184x192
     differing=26457 (11.6%)  brighter=13198 darker=13259   (balanced, not a dimming)
     identical-pixel % at vertical offset  -1:96.35  0:88.36  +1:87.97
  ```

  Only `light-button-variants` matches its recorded reason. I confirmed that
  one by eye — the old baseline is scrimmed grey across the whole button row
  and its labels are illegible, the shipped one is clean — and by luminance.

- **The disposition is still right, and this stage reached it independently.**
  All four differences are real, none is run-to-run noise (replica-a and
  replica-b agree to 4 px across all 49 snapshots and all 8 thresholds), and
  regenerating from a single authoritative Linux artifact is the correct
  action for every one of them, whether the cause is a scrim or a 1 px reflow.
  **No baseline needs re-opening.** The defect is in the evidence, not the
  outcome — which is precisely why it matters: the record is what a future
  re-tune will trust.
- **Decision: fix the artifact text before Ship.** Attribute the judgement to
  the stage that actually made it, and correct the three reasons to what the
  pixels show. Docs-only; no code, no baseline, no value changes.

### N-3 — MINOR: the shipped config comment overclaims what the guard enforces

- **Where:** `apps/rialto-web/playwright.config.ts:37-39` —
  _"Neither value moves without a fresh measurement and a matching update to
  the two provenance lines: `scripts/__tests__/visual-tolerance-guard.test.mjs`
  reds otherwise."_
- **Scenario:** an engineer six months from now needs the suite quieter. They
  read that sentence, conclude a re-tune requires a measurement, and either
  take the cost or — more likely — move both the value and the provenance line
  together and assume the green run means the guard checked something. It did
  not. The guard compares the config **against itself**; a lockstep edit with
  no measurement at all is green by design, and the guard's own docstring says
  so honestly two files away (_"this cannot verify a measurement happened,
  only that the author was made to name one"_).
- **Evidence:** Verify's Mutation B (`674 → 675` **plus** the provenance line)
  → `5 passed (5)`. Verify's Mutation H (`threshold 0 → 0.1` plus the
  provenance line) → both guards green. The comment's claim is falsified by
  the run's own mutation log.
- This is the same class of defect that deviation 1 was logged to remove —
  a documented falsehood in the one file this run exists to make honest —
  reintroduced by the replacement text, in the same comment block.
- **Decision: fix before Ship.** One sentence: say the guard reds on a
  _mismatch_ between the values and their evidence line, and that naming a
  measurement is what it enforces, not that one happened.

### N-4 — MINOR: a pure-lexer unit test pins a prose comment in a production file

- **Where:** `scripts/__tests__/visual-tolerance.test.mjs:53` —
  `expect(LIVE_CONFIG).toContain("maxDiffPixelRatio")`.
- **Scenario:** the only occurrence of that string in
  `apps/rialto-web/playwright.config.ts` is inside the #4450 explanatory
  comment (`// maxDiffPixelRatio: 0.01 (~8.4k px budget) because most of the
diff …`). Someone tidying that paragraph — a purely editorial change to a
  comment — reds `@mbe/scripts`'s suite, and therefore `CI Gate`, with a
  message that says only that a string is missing. The assertion's real
  purpose (proving the lexer is comment-blind) is served by the fixture
  `playwright-config-commented-ratio.txt` sitting three lines above it.
- **Decision: defer.** It is a deliberate, documented pin against the real
  file and fails loudly rather than silently. Worth reconsidering if the
  comment is ever edited; not worth a change on this PR.

### N-5 — MINOR (informational): the PR does not contain the run's own Verify or Review artifacts

- PR #4613's head is `6438c4fb1`. `verification.md` landed locally as
  `a6b91165a` and was never pushed (correctly — the dispatch forbids pushing);
  this artifact will be a further local commit. Ship must account for pushing
  both, and for the fact that doing so re-triggers CI on a new head SHA.
- **Decision: carry to Ship**, not a defect.

---

## Verdicts on what Verify carried forward

### F-1 — the turbo cache hole

**Not reachable in CI. Severity downgraded from moderate to informational for
this PR; the local half stands.** Full determination above. Recommended
disposition: a `docs/backlog.md` seed to declare the `test`/`test:coverage`
tasks' true inputs in `turbo.json`, filed at Ship. Not a blocker, not a
finding against this branch.

### F-2 — what the two guards actually guarantee

**Confirmed, correctly characterised, and not a defect. Severity: minor.**

The guard's name promises less than a reader might assume, but the design says
so in three places and Verify's mutations bound the gap precisely: the
uncovered band is `0 < t <= 0.1`, and any `t >= 0.15` reds the reproduction
test with `infeasibleReason: "blind-to-defect"`. The guarantee — _"the declared
sensitivity is not blind to a 36/255 whole-image shift, and neither value moved
without its evidence line moving too"_ — is the honest ceiling for a static
check, and buying more would mean re-running a three-leg capture on every PR.

`visual-defect-reproduction.test.mjs` is indeed the thing that binds behaviour:
it reds on all 49 when `threshold: 0` is deleted, and it is a _different_
failure from the guard's, which is why the two-module split is right rather
than redundant.

**One thing does need fixing, and it is N-3, not F-2:** the shipped config
comment states the strong version of the claim that F-2 shows to be false.
Fix the comment, keep the guards as designed.

### F-3 — 124,158 ms against a ~2.5 s estimate

**The 50,000 % figure compares two different commands. Severity as stated:
minor. Its real consequence is N-1.**

Demonstrated at this stage — identical file, identical machine, the only
variable being the flag CI adds:

```
WITHOUT coverage:  ✓ visual-defect-reproduction.test.mjs (50 tests)  3859ms
WITH    coverage:  ✓ visual-defect-reproduction.test.mjs (50 tests) 32123ms
```

**8.3x is v8 precise-coverage collection over per-pixel loops** — the
comparator's and `shiftPngChannels`'s. `@mbe/scripts`'s CI task is
`test:coverage`; Implement's and Verify's local gate ran `test`. The remaining
3.9x (32 s local → 124 s on a 2-core runner) is runner speed. So the design
estimate was not 50,000 % wrong about the _work_: `~2.5 s` versus a measured
uncoveraged `3.86 s` is a fine estimate. The run measured the wrong command,
and the item's instruction — _"if the observed cost differs materially, record
it rather than trimming the set"_ — was followed correctly but against the
wrong baseline.

**Is two minutes of standing `CI Gate` cost proportionate?** For what it buys —
the only check in the design that binds the suite's actual sensitivity, and
the one thing standing between a hand edit and six more months of blindness —
yes, but only just, and not at this price when most of the price is
instrumentation overhead rather than the check. It is also the wrong shape:
it makes the file the largest single contributor to a required job while
leaving 1.97x of timeout headroom (**N-1**). Recommend Ship record the coverage
multiplier as the reason, so nobody re-derives it, and treat N-1 as the
actionable half.

### Accepted risk 1 — `t = 0` has the least runner-image-bump headroom in the sweep

**Correctly accepted. Not a defect wearing a risk label.**

674 px on the largest snapshot (`light-master-override-variants`, 1,047,200 px)
is 0.064 % of the image. No absolute budget short of a ratio survives a
font-rasterization change, and the alternative — a larger `t` — is blind over
an _unbounded_ area, which is the defect this run exists to remove. The
trade is correctly identified and correctly resolved: spend tolerance where its
damage is capped. Detection is free and recovery is a `workflow_dispatch`
re-measure once the instrument is on `main`.

**One consequence the artifact does not state, and Ship should:** when it
fires, it fires on all 49 at once — the "cascading red streak" the repo's own
gotchas file describes. The blast radius is nonetheless bounded, because
`Visual Regression (rialto-web)` is advisory and `CI Gate` is the only required
context on `main` (`{"strict":false,"contexts":["CI Gate"]}`), so `main` stays
green while the visual job reds. That asymmetry is what makes the risk
acceptable, and it is worth saying out loud.

### Accepted risk 2 — `R` is a point check at a single amplitude

**Correctly accepted, and inert while `t = 0` is selected.**

At `t = 0` the comparator counts _any_ non-zero per-pixel delta, so the
declared sensitivity is amplitude-independent by construction — the choice of
36/255 as the probe amplitude cannot flatter it. Verify's own § A table is the
demonstration: the shipped pair fails a delta of **1**/255 exactly as
decisively (136,632 px) as a delta of 80. The risk only becomes load-bearing on
the branch the artifact names — a future measurement making `t = 0` ineligible
— and it is recorded there. Nothing to do.

---

## The three re-pinned tests

All three were the right call. Verify proved each still binds by mutation;
this pass judged whether the re-pin should have happened at all.

1. **The config comment's last sentence.** Correct, and necessary rather than
   optional: leaving _"300px absorbs the ±1px anti-aliasing churn …"_ beside
   `maxDiffPixels: 674` would have left a documented falsehood in the file the
   run exists to make honest. Logging it as a deviation instead of taking it
   silently is the right instinct. The replacement text then introduced a
   _different_ falsehood — **N-3** — which is a defect in the replacement, not
   in the decision to replace.

2. **`noise-floor-coverage.test.ts`.** Correct. The original blanket
   `not.toContain("noise-floor")` was incompatible with the provenance comments
   the design _mandates_ — the two assertions could not both be satisfied, so
   one had to move, and the narrowed form is the smaller move. It narrows from
   "the string never appears" to "the string never appears in executable text",
   keeps the two specific bans (`stylePath`, `noise-floor-perturbation`), and
   both halves were proven live (Mutations D and E). Residual, minor and
   safe-direction: the filter recognises only `//` line comments, so a
   `/* */` block mentioning `noise-floor` would false-positive rather than
   false-negative.

3. **`visual-tolerance.test.mjs`.** Correct — it asserted the _defect_
   (`occurrences.threshold === 0`, `threshold === null`) and could not survive
   the fix. The replacement asserts the fix against the real file and retains
   the comment-blindness pin. Residuals: it is now a near-duplicate of drift
   guard assertion 1 (redundant, not inert), and it carries **N-4**.

---

## Passes with no findings

- **Security — clean.** No secrets anywhere in the diff. The new workflow
  declares `permissions: contents: read`, pins every action to a full SHA,
  opens every gate `run:` block with `set -o pipefail` (the exact trap the
  repo's gotchas file records), interpolates only literal matrix values into
  shell, makes no network call, and takes file paths from argv only. No
  `--force`, no write token, no `pull_request_target`. `index()` and the leg
  readers validate every field and throw with the offending row named;
  `readToleranceDirectives` degrades to all-`null` rather than guessing and
  never throws.
- **Design — clean, with one improvement worth naming.** Extracting
  `readToleranceDirectives` into `scripts/visual-tolerance.mjs` removes a real
  duplicated lexer rather than an imagined one, and `parseMaxDiffPixels`
  becomes a thin policy over it with no behaviour regression. It also _widens
  correctly_: the old integer-only `/\bmaxDiffPixels\s*:\s*(\d[\d_]*)/` would
  have read `maxDiffPixels: 300.5` as `300` — a wrong number, silently — where
  the new pattern's terminator lookahead reads it as `300.5` or refuses. The
  module keeps its zero-import purity, which is what the publisher job (no
  `pnpm install`) requires.
- **Decision-rule correctness — clean.** `thresholds` is sorted ascending in
  `index()`, so clause 1's `eligible[0]` really is the smallest eligible sweep
  point; the emitted budget reconciles two ways
  (`sqrt(Ñ·S) = sqrt(4·113509) = 673.82` and `sqrt(lower·upper) = sqrt(8·56754)`,
  identical because `lower = 2Ñ` and `upper = S/2`); clause 0 hard-stops rather
  than silently excluding, in the direction that cannot loosen the suite.
- **Test hygiene — clean.** No `.skip`, `.only`, `.todo` or `xit` anywhere in
  all seven new or modified test files.
- **The two within-budget baselines** (`light-master-override-requireHold-splitflap`
  at 7 px, `telemetry-default` at 4 px) advanced with the set rather than being
  left behind. Correct: the emitted pair is green only for baselines equal to
  `replica-a`, and mixing sources is how a set stops having a provenance.

---

## Verdict

**PASS — no critical findings. Ship after N-1 and N-2.**

The fix itself is sound and unusually well evidenced. Both values are the
verbatim output of a decision rule run over a real three-leg Linux capture; all
49 baselines are byte-identical to that capture's artifact; both success
criteria are counts from raw rows rather than claims; both guards were proven
to red by mutation and observed executing inside the real required check; and
the run's headline risk (**F-1**) turns out not to reach CI at all.

Two things should change before this merges, neither behavioural:

- **N-1** — raise the per-test timeout for the reproduction file. 1.97x
  headroom on the only required check, in a repo with two recorded instances
  of exactly this mechanism, is not a margin.
- **N-2** — correct item 2.4's record: attribute the drift judgement to the
  stage that made it, and replace three reasons the pixels contradict. The
  outcome stands; the evidence for it does not.

**N-3** is a one-sentence comment fix and should ride along, since the run
holds itself to precisely that standard elsewhere. **N-4** and **N-5** are for
Ship to note, not to act on.

Score: **8/10.** A point off for N-1 and a point off for N-2 — the second
because a fabricated attribution in a gate the design deliberately marked
_human_ is the failure mode this run was already warned about twice, and it
survived Implement and Verify.

Next stage: **Ship** (`docs/fixes/visual-tolerance-threshold/release.md`).
