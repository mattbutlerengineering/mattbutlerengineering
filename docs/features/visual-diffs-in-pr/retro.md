---
stage: operate
run: feature:visual-diffs-in-pr
date: 2026-08-26
assumptions:
  - "Autorun: no live user input at this stage either. Every outcome reading, grade and seed below is this stage's judgment, recorded for the user to arbitrate."
  - "The skill's 'let it breathe' step was deliberately not taken. It exists so a retro written an hour after shipping reflects outcomes rather than hopes — but this run's authorization was fixed at brief time as prepare-and-stop, so no merge and no production usage will accumulate at this stage however long it waits, and the user explicitly asked to close the run out. Every outcome below is therefore labelled as demonstration evidence from PR #4569, never as usage."
  - "PR #4569's current state was not re-checked. The caller's standing instruction forbids GitHub interaction, so its state is quoted as `release.md` recorded it on 2026-08-25 — open, MERGEABLE/CLEAN, unmerged — and is not verified as of this date."
  - "The close-out brief reports F1 as found independently by two reviewers. No artifact in this run records a second reviewer: `review.md` is a single artifact in a single voice carrying one reproduction. F1 is credited below to the Review stage as `review.md` records it, and the second finding is noted as orchestrator-reported rather than restated as fact."
  - "The Ship stage's stall is recorded under _What the process cost_ but is NOT appended as a backlog seed: `docs/backlog.md` already carries 'Give pipeline stage agents a liveness contract' (from: feature:tape-chart-overlaps), and the protocol forbids rewriting existing lines, so a second near-identical seed would only dilute the first."
---

# Retro: Visual regression diffs inline in the pull request

The run that answered _"can we update our PRs to include images of the visual
regressions so that they are part of the review?"_ — driven start to finish by
autorun, one fresh subagent per stage, artifacts as the only state between
them. It ended at **PR [#4569](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4569)**,
open and green and deliberately unmerged under prepare-and-stop authorization.

## Outcomes vs. intent

### The success sentence — _"a reviewer, human or agent, can decide whether a visual failure is a real regression or baseline drift without leaving the pull request"_

- **What happened:** it does, and it was watched doing it. On PR #4569 a
  perturbed `visual` job (run `32903163602`) produced one sticky comment
  reading `🖼 Visual regression — 8 of 49 changed`, with six baseline / actual /
  diff image rows and an explicit overflow line for the other two. All 18
  embedded URLs returned `200 image/png` with the token environment scrubbed;
  one GET was opened and confirmed to be a genuine Playwright diff PNG of the
  right dimensions. A re-run updated the same comment in place, and a
  subsequent passing run deleted it. All eight PRD success criteria are
  discharged on live evidence.
- **Signal strength: measured, on a perturbation the run built for itself.**
  This is not a reviewer triaging a real regression. Nobody has used the
  feature in anger, because the release was withheld by design. The correct
  reading is "the mechanism works end to end", not "it changed how a review
  goes".

### The population the feature was actually built for — the autonomous review layer

- **What happened:** SC-2 was demonstrated exactly as it was written — the
  comment reproduced with every `<img>` collapsed still carries the
  changed-of-total, and every changed snapshot by name with its pixel count
  against the 300 budget, **including the two the display cap excluded from
  images**. An agent reading `gh pr view 4569 --comments` gets the whole
  verdict without fetching a byte.
- **Signal strength: measured once, never consumed.** No agent has read one of
  these comments. `/implement-queue`'s `reviewer` gate, `/ci-monitor` and the
  auto-merge train are all unchanged by this run; nothing was wired to look for
  the comment. The capability exists; the consumption does not.

### The risk that killed it in the brief's own estimation — unbounded ref growth

- **What happened:** designed against, not deferred. The retention rule is a
  pure, unit-tested planner; it was dry-run against this repository's two real
  refs and returned two _distinct_ correct verdicts (`too-recent`,
  `newest-on-open-pr`). A live sandbox run before that reached all seven
  clauses — and found the epoch bug (below).
- **Signal strength: measured for the rule, zero for the job.** The scheduled
  sweep has never executed, and cannot until the workflow is on `main`, because
  GitHub schedules workflows only from the default branch. This is the one
  component of the run sitting squarely in the repo's documented
  shipped-but-never-executed class, and `release.md` step 5 carries it forward
  as an explicit post-merge obligation rather than an assumption.

### The ceiling the PRD accepted deliberately

- **What happened:** nothing, by design — and that is the honest outcome.
  `Visual Regression (rialto-web)` is advisory; #4496 merged with it red while
  `CI Gate`, the only required check, was green. SC-7 confirms this run did not
  change that: the perturbed head was `MERGEABLE`/`UNSTABLE` with `visual`
  FAILURE and `CI Gate` SUCCESS. The feature makes the failure legible, not
  blocking.
- **Signal strength: n/a — untested by construction.** Whether a legible red
  changes anyone's merge decision is the bet this run made and did not measure.
  It is measurable later: the next time a visual failure lands on a real PR,
  the question is whether the comment got read before the merge.

## Run retrospective

### Keep

- **Executing beats reading, and it is not close.** Three separate defects were
  found only by running code, and not one was reachable by reading it, by lint,
  by typecheck, or by any unit test that existed at the time:
  1. **The epoch bug** (Implement, item 4.2). `ageHours` guarded with
     `Number.isFinite(new Date(x).getTime())` — and `new Date(null)` is the
     UNIX epoch: finite, and ~57 years old. A ref whose commit date could not
     be resolved therefore read as maximally ancient and was **deleted**,
     precisely inverted from the fail-safe direction the retention rule
     promises, and the one direction that can break SC-3 by deleting images out
     from under a live comment. It surfaced only because the sweep was run
     against a **sandbox remote** seeded with seven refs — the real repository
     had zero refs and so proved nothing.
  2. **F1, the `run_attempt` defect** (Review). The ref name carried
     `GITHUB_RUN_ID` but not `GITHUB_RUN_ATTEMPT`, so a re-run pushed a
     different orphan commit at an existing ref: non-fast-forward, `--force`
     correctly forbidden, publisher dies, comment frozen showing attempt 1.
     It defeated **SC-4**, whose own demonstration step is _"re-run the visual
     job"_. Review reproduced the rejection in a scratch bare repo — and
     separately proved the commit SHAs cannot be made to collide — rather than
     asserting it from the docs. The fix was confirmed against the live path:
     two attempts, two refs, two commits, one comment.
     _(The close-out brief reports this was found independently by two
     reviewers; the artifacts record one. See frontmatter.)_
  3. **D1** (Ship, during the live demonstration). GitHub evaluates a
     `pull_request` `paths:` filter against the PR's **cumulative**
     `base...head` diff, not against the push. When the perturbation and its
     revert cancelled out, `Rialto Web E2E` stopped triggering entirely, and
     the stale failure comment stood on a PR with no failure. A real, unfixed
     product gap, found only because the path was walked.
- **Decompose refusing to design around a gap.** Two contract-level omissions
  surfaced during decomposition — `renderComment` had no input for the pixel
  budget (hardcoding `300` would have created a second source of truth for the
  number the comment asserts, in a run whose motivating incident is a tolerance
  change nobody noticed), and the comment-delete path had no staleness guard
  (an older passing run could delete a newer failing run's comment). Both were
  **routed back to Architect** rather than resolved in the breakdown; Architect
  closed both, and — this is the part worth keeping — the route-back record
  stayed in `breakdown.md § Design gaps found` instead of being deleted once
  resolved. A resolved gap is the evidence that the route-back happened.
- **Verify declining six of eight criteria.** `verification.md` closed 2 PASS /
  **6 CANNOT VERIFY LOCALLY** / 0 FAIL, and said plainly that passing unit
  tests are not evidence for any of the six. That refusal is what made Ship's
  demonstration mandatory instead of optional — and every one of the three
  defects above, plus D2, came out of work that a more agreeable Verify would
  have inferred away.
- **Falsifiability by mutation as a routine step.** Verify proved the epoch
  regression test, the trigger-hygiene guard and the thinness greps all
  genuinely go red by sabotaging the code and re-running, then restoring
  byte-identically. It found one guard that did **not** bind (the display cap),
  which is exactly the yield you hope for.
- **Ship treating the demonstration as the work.** Item 3.5 was not a
  formality: it cost five pushes, four CI runs and two perturbations, and it
  produced D1 and D2. The run's largest risk was "it may simply never fire",
  and that risk was retired by firing it.

### Change

- **Name the sandbox-remote step.** The single highest-yield technique in this
  run — build a throwaway bare repo / remote and run the real `main()` against
  it — was improvised twice (Implement for the sweep, Review for F1) and is
  written down nowhere as a step. It should be a standing expectation for any
  work item whose code shells out to `git` or an API, not a habit that happened
  to be present in two subagents.
- **The artifacts record findings, not their provenance.** There is no field
  anywhere for _who found this_ or _how many times it was found independently_.
  A finding confirmed twice by two reviewers reads identically to one found
  once — which is precisely the discrepancy this retro had to flag in its own
  frontmatter.
- **Prose-to-code ratio is worth a look.** 3,518 lines of pipeline artifacts
  against 1,555 lines of shipped module code (plus 2,663 lines of test and 909
  of fixture). The protocol says a feature architecture note _"may be a
  paragraph"_; `architecture.md` is 43 KB and `breakdown.md` is 50 KB. Most of
  that length is load-bearing evidence rather than padding — the measured
  tables, the mutation transcripts, the route-back records — but for a feature
  run it is at the top of the range, and the next run should decide the depth
  deliberately rather than by default.

### Stop

- **Stop treating `pnpm test` at default concurrency as a local gate on this
  host.** Three stages ran it and three different packages tipped over —
  Implement saw `@mattbutlerengineering/rialto` and `@mbe/marketing`, Verify
  saw `@mbe/service-bootstrap` — none of them touched by this branch, all of
  them green in isolation and at `--concurrency=4`. A gate whose failing member
  drifts run to run is not reporting on the change under test; reading it as if
  it were costs a diagnosis every time. `--concurrency=4` is the reliable form
  until the packages carry the `testTimeout: 15000` the gotchas file already
  prescribes for this class (seeded below).

### What the process cost

- **The Ship subagent stalled** on the 600-second watchdog after completing its
  work but mid-PR-body-update, and had to be finished inline by the
  orchestrator. No work was lost, but "the stage agent died and a human-shaped
  actor finished it" is not a stage boundary the artifacts can show — a stalled
  agent that has already done its work is indistinguishable from one that has
  not. `docs/backlog.md` already carries a seed for this from
  `feature:tape-chart-overlaps`; this run is its second instance.
- **Two perturbations instead of one.** The first (`opacity: 0.55` on 8
  sections) failed to fail, costing a full diagnostic cycle — which turned out
  to be the most interesting finding of the stage (D2, below).

### A measurement correction worth keeping

The brief sized the target suite at **24 baselines**. Idea measured it and
found **49** — 38 light sections, 9 dark, 2 telemetry-HUD shots, and 49
committed PNGs. 24 was the number of baselines regenerated by #4561, not the
size of the suite. The correction propagated: the display cap was sized against
49, and the live comment read `8 of 49`. This is what the Idea stage is for —
the brief was written by the same orchestrator that ran the pipeline, and the
stage still checked it.

### D2 — the finding that was out of scope and matters most

The first perturbation changed **71,140 of 139,216 pixels** in
`light-button-variants` and still **passed all 49 snapshots**. Playwright's
per-pixel `threshold` gates before `maxDiffPixels` is ever consulted, and the
largest per-channel delta anywhere was 36/255 = 0.14 — under the default
`threshold` of 0.2. The comparator counted zero differing pixels.

That is a fact about the `rialto-web` visual suite, not about this feature: a
change altering 51% of a snapshot can pass. #4496 tuned `maxDiffPixels` from a
ratio to an absolute 300 and reasoned entirely about the budget; the threshold
sitting in front of it went unexamined. Changing either alters what CI
considers pass/fail, which `prd.md` puts explicitly out of scope — so it was
recorded, not taken, and it is seeded below.

## Idea seeds

Appended to `docs/backlog.md` at run close, per ADR-0029.

- Fix D1 — a PR that backs out its whole filtered surface after a failing
  visual run keeps a stale failure comment forever.
- `scripts/**` is outside every ESLint gate, for two independent reasons.
- `.github/workflows/preview-deploy.yml` carries the same author-blind
  sticky-comment gap that F4 fixed here.
- Revisit the `rialto-web` visual tolerance in light of D2 — `threshold` gates
  before `maxDiffPixels`.
- Apply the prescribed `testTimeout: 15000` to the packages that tip over at
  default concurrency locally.
- Promote the feature to the `packages/rialto` Storybook visual suite — named,
  not taken, in this run's scope.

## Run complete

Closed **2026-08-26**. The run shipped nothing to production and was never
meant to: PR #4569 is prepared, demonstrated end to end across four live CI
runs, and left unmerged for the user, with three review findings (F5, F8, F10)
and two verification findings recorded as deliberate deferrals in `release.md`.
The one obligation that outlives this retro is `release.md` step 5 — the first
scheduled run of `visual-diff-ref-sweep.yml`, which cannot execute until the
branch is on `main`, and whose per-ref verdicts must be read from the **step
log**, not the job summary.

The seeds above are the input to the next Idea-stage run.
