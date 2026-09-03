---
stage: operate
run: maintenance:visual-tolerance-threshold
date: 2026-09-03
---

# Retro: the rialto-web visual suite's measured sensitivity

Written six days after the change went live — `release.md` said it had not, and
finding out otherwise is itself one of this retro's findings.

## Outcomes vs. intent

`defect.md`'s expected state, verbatim: "A change a reviewer would call a visual
regression makes the suite go red; ordinary cross-platform/anti-aliasing
rendering noise does not."

Two halves, and the evidence for them is very different in strength.

### Half 1 — noise does not make it red

- **What happened:** `threshold: 0` was the risky half. Nothing in the repo had
  ever run the comparator with per-pixel filtering fully off, and the failure
  mode would have been a flaky visual job reddening unrelated PRs. It did not
  happen. Since the merge at `2026-08-28T19:49:43Z`:

  ```
  92 rialto-web-e2e runs, 91 success, 1 failure
  ```

  The single non-success is run `33422099585` on branch
  `revert-broken-main-a4473b0f9…`, and it executed **zero jobs**
  (`/actions/runs/33422099585/jobs` → `total_count: 0`) — a workflow startup
  failure on a revert branch during the docs-only prettier incident, not a
  comparison result. The comparator itself is **91 for 91**.

  Sampled three of those runs at the job level rather than trusting the run
  rollup, because a green rollup over a skipped job would prove nothing: runs
  `33676716327`, `33623520252` and `33573551168` each show
  `success  Visual Regression (rialto-web)` as a real executed job.

- **Signal strength: measured.** 92 runs over six days, with the job confirmed
  to have actually run.

### Half 2 — a real regression makes it red

- **What happened:** unobserved in production. No visual failure has occurred
  since the merge, so the suite has caught nothing — which is exactly what a
  correctly-quiet detector and a still-blind one both look like.

  This is not a criticism of the change; the sensitivity is proven, just not
  _there_. `verification.md` § 3.4 proved it through Playwright's own comparator
  — a 1/255 uniform shift moved from "0 pixels differ" to 136,632 px — and that
  reproduction is pinned by `scripts/__tests__/visual-defect-reproduction.test.mjs`
  (50 tests) inside the required `Test (Node 22)` job. So the guarantee is
  carried by a test that runs on every PR, not by a production observation.

- **Signal strength: measured absence, which is weaker than it looks.** Worth
  stating plainly: this run fixed a detector that was asserting something untrue
  while green, and six days on, the fixed detector is also green and has also
  caught nothing. The difference is that the claim is now backed by a
  reproduction that fails when the config regresses. That distinction is the
  whole value of the run, and it is invisible from the CI dashboard.

### The out-of-scope suite is live, and still carries the gap

`defect.md` named `packages/rialto/playwright.visual.config.ts`
(`maxDiffPixelRatio: 0.01`, `threshold` unset) and deliberately did not take it.
The only visual baseline regeneration in the window came from precisely that
suite: **#4913**, merged `2026-09-02T11:13:50Z`, regenerating
`packages/rialto/src/test/visual/__screenshots__/data-display-table--default.png`.

Read carefully, this does not contradict the defect. The Storybook suite caught
a Table change because a component edit alters shapes and edges, which produces
large per-pixel deltas that clear the default `threshold: 0.2`. The blind spot
this run measured is narrower and nastier: **uniform, low-amplitude shifts** — a
token or theme colour change up to 52/255 — which pass through `0.2` untouched
and reach the budget as a count of zero. So the untaken suite is demonstrably
active, demonstrably able to catch _some_ classes, and demonstrably still unable
to catch the one this run exists to name.

## Run retrospective

- **Keep: measuring the tolerance instead of choosing it.** Both shipped values
  are the verbatim output of `scripts/visual-tolerance-rule.mjs` over a real CI
  run (`33107801311`), with 168× headroom on each side of the noise floor. Six
  days of zero flake is what a measured number buys over a picked one.
- **Keep: proving the fix at the comparator, not at the suite.** The
  reproduction needs no browser and no dev server, which is why it could run 50
  cases in the required test job and why the guarantee survives after the run
  closed.
- **Keep: naming the out-of-scope sibling instead of silently leaving it.**
  `packages/rialto`'s config was named in `defect.md` and is still the top seed
  from this run — six days later that note is the only reason the gap is
  traceable at all.
- **Change: prepare-and-stop needs a way back into the artifact.** Ship was
  authorized to prepare and stop, and did so correctly. A human then merged
  #4613 the next day, and no stage owns writing that back — so the release
  artifact claimed NOT RELEASED for six days while the change was live on
  `main`. `docs/backlog.md` was updated on the merge day; the run directory was
  not. The two disagreed and nothing noticed.
- **Stop: reading a workflow-run conclusion as evidence a job ran.** The one
  non-green run in the window had `total_count: 0` jobs. Had it been counted as
  a visual failure, this retro would have reported a false-positive rate off a
  run that never compared a single pixel.

## Idea seeds

Appended to `docs/backlog.md`:

- Give `packages/rialto/playwright.visual.config.ts` the same measured pair —
  it is the identical `threshold`-unset gap, it is live and regenerating
  baselines (#4913), and it is the one suite this run named and did not take.
- Make prepare-and-stop runs reconcilable: something must write the merge back
  into `release.md`, or Operate must re-derive release state from the PR rather
  than trusting the artifact.

Already seeded by earlier stages and still open:

- Declare the real inputs of `test` and `test:coverage` in `turbo.json`
  (`review.md` § F-1) — `test:coverage` declares none, so `@mbe/scripts`'s hash
  is identical before and after a mutation that breaks either visual guard.

## Run complete

Closed 2026-09-03. The change is live on `main` at
`apps/rialto-web/playwright.config.ts:47-48`, has run 91 times without a false
positive, and its sensitivity is pinned by a reproduction test rather than by
this document.
