---
stage: operate
run: feature:ui-quality-loop
date: 2026-11-07
users-observed: 0
signal-source: "Read 2026-11-07 on origin/main c4320513d (worktree operate-retros) and via gh: `gh pr view 5931` (merged 2026-09-30T23:15:22Z); `metrics/ui-quality-runs.jsonl` (30 rows, 2026-10-01..2026-11-05), `metrics/ui-quality-ledger.jsonl` (160 rows), `metrics/ui-quality-ratings.jsonl` (43 rows), `metrics/ui-quality-findings.json` (69 keys), `docs/ui-quality/calibration.json`; `gh issue list --label ui-quality --state all` (38), `--label ui-quality:p1 --state all` (4), `gh issue list --state all --search 'mbe-ui-quality dark'`; `gh pr list --search 'chore(ui-quality): ledger' --state all` (32 merged, 0 closed, 0 open) with `mergedBy` / `autoMergeRequest.enabledBy` on 25 of them; `git log origin/main -- docs/ui-quality scripts/ui-quality metrics/ui-quality-*`; `git log origin/ui-quality/ledger`; `gh run list --workflow apps-visual.yml`. Not available to this retro: RemoteTrigger `list_runs` / `get_run_log` (so no fire log was read), Sentry (nothing in this loop reports to it), no usage analytics exist for a nightly routine."
assumptions:
  - "Population count: 0. This is internal tooling with no end users. The population is people who used the loop's output, and no record shows one. Every ledger PR and every `ui-quality` issue is authored by `mattbutlerengineering` because the routine pushes with the Owner's token, so authorship is not evidence of Matt's hand. Of 25 ledger PRs checked, 20 were armed and merged by app/github-actions, 4 merged by app/github-actions unarmed, and 1 merged by `mattbutlerengineering`; one merge under the Owner's own login is not read as a record of use. Matt's only recorded contact with the loop is pre-release (the 12-pair sheet, `review.md` §Human taste observation, 2026-09-30). The 30 fires, 570 route audits and 38 issues are the sample, not the population."
  - "Two success criteria are read against `docs/ui-quality/calibration.json` as committed on main, not against the worktree `.claude/worktrees/ui-quality-loop` that `release.md` said was kept for labelling. That worktree no longer exists, and `docs/ui-quality/calibration/` is absent from main, so the labelled set was never committed. The retro records state, not a judgement that Matt did not label."
  - "Coverage is computed from the committed ledger on main (c4320513d) with the same definition as the PRD (reachable rows audited in the trailing 30 days, 4 redirect rows excluded from the denominator, `unreachable:*` reported separately). `scripts/ui-quality/coverage.mjs` was not run (the retro runs no scripts), so this figure is a re-derivation, labelled as such."
  - "P1 age is measured creation to close from `gh`, because `p1-age.mjs` lists only open issues. The 7-day bar in idea.md reads 'zero audit-filed P1 UI defects older than 7 days'; ages at close are used as the lower bound of how long each was open."
  - "`autorun-brief.md` has no `operate:` section ('Operate does not run'), so there is no brief-named minimum signal. This retro was run by the Owner's 2026-11-07 retro batch."
---

# Retro: A UI-quality loop that keeps every page at a professional bar (PR #5931)

## Outcomes vs. intent

Population is 0, so no outcome below reads as adopted or used. Where it says a
fire ran or an issue closed, that is the routine and the implement-queue acting,
not a person using the result.

### Success sentence, part 1 (idea.md / SC-1): the ledger shows 100% of routes audited within the trailing 30 days

- What happened: the loop is running and the ledger is current. On main, 135 of
  160 rows are `audited`, 21 are `unreachable:auth` (all hospitality, behind
  Auth0, which the sandbox cannot sign in to) and 4 are redirect rows. Every one
  of the 135 reachable rows has `last_audited_at` between 2026-10-22 and
  2026-11-05, so re-derived coverage is **135/135 = 100%**. The 21 are outside
  that denominator, so 13% of the non-redirect routes (21 of 156) are never
  audited by the loop. `metrics/ui-quality-runs.jsonl` has 30 fire rows over the
  36 days 2026-10-01..2026-11-05 (570 audits, `git_depth: full` on all 30, 2
  `unjudged`, 0 `dropped_tells`). Missing days: 10-09, 10-10, 10-24, 10-29,
  10-30, 10-31. The PRD's SC-1 is satisfied on its own definition.
- Signal strength: **measured** (ledger and runs file), with the auth blind spot
  stated. Not a person's observation.

### Success sentence, part 2 (SC-2): zero audit-filed P1 UI defects older than 7 days

- What happened: the loop filed 4 P1 issues, all `accessibility/axe-critical`
  on rialto-web (#5973, #6005, #6006, #6025, filed 2026-10-02..10-04), and
  none is open. They closed after 8.7, 7.7, 7.7 and 6.7 days, so **3 of 4
  outlived the 7-day bar** before they closed. No P1 has been filed since 10-04.
  `metrics/ui-quality-findings.json` still records all 4 as `state: open`
  although `gh` shows them `CLOSED` since 2026-10-10; that file is not
  reconciled with closed issues. 38 `ui-quality` issues were filed in all, 0 open
  now. The escalation path (`p1-age.mjs --escalate`) was never needed to
  fire: no `escalated_at` is set on any record.
- Signal strength: **measured** for the 4 P1s (n=4, thin).

### Success sentence, part 3 (SC-3): an automated taste rater scores every app ≥ 4/5 as "built by a professional team"

- What happened: the target is not met and cannot be called measured. The rater
  ran 43 times (hospitality 13, marketing 10, rialto-web 20), and **every one of
  the 43 records carries `calibration.status: "stale"`**. The latest scores are
  hospitality 0 (2026-11-05), marketing 1.25, rialto-web 0.83; the highest score
  ever recorded for any app is 5 (rialto-web). `docs/ui-quality/calibration.json`
  on main still has `labelled_at: null`, `labelled_by: null`, `pairs: 0`, and
  `metrics/ui-quality-calibrations.jsonl` has 0 rows. The 12-pair sheet was
  never labelled in the 38 days since release and the worktree that held it is
  gone. The fail-closed design held: no taste-derived finding was ever filed.
  Fire heartbeat, 2026-11-05: "calibration stale (unlabelled pair set)".
  Matt's 2026-09-30 remark, "In most cases, our ui doesn't look as good", is the
  only human taste signal and agrees in direction with the scores. It is an
  anecdote.
- Signal strength: **unobserved** for taste (the rater's output is untrusted by
  design); **measured** that the gate stayed closed (43 of 43).

### SC-4 (VR floor): hospitality and marketing have a Playwright visual spec with baselines

- What happened: the workflow exists and runs. `apps-visual.yml` runs on main
  every day; its recent `push` runs on 2026-11-06..07 are mostly success with 3
  failures in the last 10 (not diagnosed: this retro read run conclusions only).
  Baselines were committed at ship (marketing 12 PNGs, hospitality 38). I did not
  verify that any regression was caught by it. Whether anyone read a sticky diff
  comment is unobserved.
- Signal strength: **unobserved** (state only).

### SC-5 (no human in the loop): the routine runs unattended

- What happened: mostly yes, with two real gaps. 25 of 25 sampled ledger PRs
  were merged by app/github-actions or by auto-merge armed by it, with one
  merged under the Owner's login. 32 ledger PRs merged in all, 0 left open or
  closed unmerged, so review C1's feared 'unmerged rolling PR' did not happen
  because the PR is auto-merged. But the loop stopped for a human twice:
  - **Filing wedge (review N3, seen live).** `ui-quality: filing blocked by
unknown labelled issues` was opened as #7477 (2026-10-25, closed 10-27) and
    #7908 (2026-10-28, closed 10-31): 2 and 3 days with no filing. The unknown
    labelled issues (#7463, #7603, #7609) were not lost checkpoints but
    `not_planned`-closed or hand-labelled issues the ledger did not know.
    #7603 and #7609 (fixes, merged as #7608 and #7613 on 10-25) are the root
    cause fixes. Review had named the surface and its recovery, not this
    trigger.
  - **Routine-liveness `dark` false/true alarms.** Five `ci-fix: routine
mbe-ui-quality is dark` issues were opened and closed: #6191 (10-10),
    #6444 (10-12), #6526 (10-13), #7950 (10-30), #7969 (10-31), and **#8446 is
    open today (2026-11-07)**. #8446 says the last artifact was the 11-05
    ledger PR #8315, and the runs file and ledger branch (`3c7ace430`, 11-05)
    confirm no fire since 11-05. Whether the trigger is failing or the
    heartbeat signature is not being met after a quiet fire is not known from
    here (no `get_run_log` access). 10-10 matches the missing days 10-09, 10-10.
- Signal strength: **measured** for merges and filings; **pattern** (6 liveness
  alerts) for the dark signal, cause unobserved.

### SC-6 (convergence): the rubric is versioned and findings converge

- What happened: findings are being consumed and closed. 38 findings issues
  filed, 38 closed, and the fixes were taken by agents:
  `[Feature] Marketing ui-quality findings [1/5..5/5]` (#7385-#7389, 10-24),
  `[Feature] rialto-web A11y Iteration 8 [1/4..4/4]` (#8178-#8181, 11-03) and
  `fix(gen)` / `fix(chat)` commits. The ledger holds 65 open non-P1 records (31
  issue-carried, 34 `seed`), where the 34 seeds could never close until
  #8448 (merged 2026-11-07) added a close path. All 69 keys are rubric v1;
  `rubric_version` has not been bumped since release.
- Signal strength: **pattern** (consumption by the queue), not an outcome for a
  user.

### Cost found live: the fix-PR path the routine promises (open item at release)

- What happened: PR #7613 (2026-10-25, title: exclude declined findings from the
  fix-PR candidate) touched the candidate selection, so the path is at least
  being maintained; `findings-plan.mjs` still sets `fix_pr_candidate`. Neither
  `evidence.file` nor any routine-opened fix PR was checked in this retro.
- Signal strength: **unobserved**.

## Open debt

The run's own debt (Review deferrals and `release.md` open items). It counts
toward no outcome above.

- **SC-3 labels** (`release.md` §Open items, `verification.md` §Remaining before
  Review): the 12 pairs are still unlabelled. No GitHub issue was filed for it,
  so this is prose-only debt. It is the single largest open item: the whole
  taste face of the loop is dark until it is done.
- **Review n3** (`LC_ALL=C` for `state.mjs`'s git calls, prose-only in
  `release.md`): `grep LC_ALL scripts/ui-quality/state.mjs` finds nothing; still
  open.
- **Review n4** (adoption keyed on title format): accepted, never fixed; its
  consequence is the N3 wedge above.
- **Review n5** (infinite animations, no reduced-motion guard,
  `OfflineBanner.module.css`, `FloorPlanCanvas.module.css`): `grep reduced-motion`
  finds nothing in `OfflineBanner.module.css`; still open.
- **Product defects the loop surfaced** (`release.md`; prose-only, no issue
  found by search): marketing `/` 413 px at 375 px; marketing nav marks "Home"
  active everywhere; hospitality floor-plan canvas and `setup/hours` overflow at
  375 px; setup checklist "66.666…%"; `useScrollReveal` hides content under
  reduced motion. Searches on the issue tracker found no issue for any.
- **Rialto-web VR baselines red on main** (46/49 since 2026-09-23): the regen is
  now a dispatch (`visual-baseline-regen.yml`). Not re-checked in this retro.
- **The fix-PR path is unreachable** (`release.md`, `breakdown.md` §Design gaps
  found): no state change found; see Outcomes.
- **Review minors m3, m5-m9, N2/N5-derived:** m3 (ledger PR triggers both VR
  suites) was addressed in `apps-visual.yml` (path filters now list
  `scripts/ui-quality/*` explicitly and carry a review-m3 comment); the others
  have no issue.
- Issue-tracker state for the run's own issues: none were filed by the run
  itself. #6778 (`docs(claude-md): name .claude/rules/ui-quality.md`) is
  CLOSED and was filed after the merge, so it is not the run's debt.

## Run retrospective

- Keep: the fail-closed calibration gate. 43 of 43 ratings stayed `stale`
  and no untrusted taste finding was ever filed, which is exactly what
  `release.md` promised. Keep too the two-fire simulation Review demanded
  for C1: 32 of 32 ledger PRs merged and no pair of the 38 `ui-quality` finding
  issue titles is identical (only the two 'filing blocked' alerts share a title).
- Keep: Review's N1 catch. A live `fetchObservedArtifactsViaGhClient` probe
  found a GraphQL node limit that would have blinded the fleet-wide liveness
  monitor, which every fake-`pr.list` test missed. (Not rechecked here; this is
  `review.md`'s own record.)
- Change: a human-only step that the whole value chain waits on (SC-3 labelling)
  was left as a prose bullet in `release.md`. 38 days later it is undone, the
  worktree is deleted and the retro has no issue to point at. File it as an
  issue at Ship, or keep the run in a `pending` state until it is done.
- Change: a run that creates a recurring routine needs its own Operate check on
  day 2 and day 5, not at retro time. The first false-`dark` (#6191, 10-10), the
  3-day filing wedge and the current gap since 11-05 (#8446) were each found by
  other pipelines, not by this run.
- Change: the run shipped `fix_pr_candidate` plumbing that Verify and Review both
  flagged as unreachable; either wire `evidence.file` or remove the branch rather
  than ship a path that cannot run.
- Stop: shipping a product-defects list as prose in `release.md`. Five defects
  were found by the loop and none has an issue; the loop's own findings channel
  (labelled issues) is where they belong.

## Environment

| Mistake                                                                                                                                                                             | Evidence                                                        | Class      | Proposed carrier                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fire read state from `main` but wrote it only to an unmerged rolling PR, so dedupe, the calibration gate and liveness would fail open.                                              | `review.md` §Critical C1                                        | mechanical | The existing `scripts/__tests__/ui-quality-state-two-fire.test.mjs` (added in response); it runs with the `scripts` suite. Add the single-branch/shallow-clone arm that N4 asked for.                                                 |
| Liveness query exceeded GitHub's GraphQL node limit; every unit test injected a fake `pr.list`.                                                                                     | `review.md` §Re-review N1                                       | mechanical | `.github/workflows/routine-liveness.yml` runs the real query daily. It does not run on PRs touching `routine-liveness.mjs`, so a path-filtered dry-run arm there is the carrier.                                                      |
| A single `ui-quality`-labelled issue the ledger does not know wedges filing; recovery was undocumented. It happened twice live (#7477, #7908).                                      | `review.md` §Re-review N3; this retro §SC-5                     | mechanical | `scripts/__tests__/ui-quality-findings.test.mjs` with a case per issue state (`not_planned`-closed, hand-labelled). The fix landed only after the wedges (#7608, #7613).                                                              |
| Visual baselines would record an error, an empty section or a redirect as correct (marketing empty sections, live JSON, hospitality `admin` redirect and date-filtered empty grid). | `review.md` §Major M2, M3, M5; `verification.md` §Open findings | mechanical | `scripts/__tests__/ui-quality-visual-specs.test.mjs` (exists): extend it to require a `toHaveURL` assertion per row and to fail on any unmocked same-origin `*.json` fetch.                                                           |
| Visual tolerances were measured before the harness they gate, then marketing's re-measure came back at 23,679 px.                                                                   | `review.md` §Major M4, §Re-review N5                            | mechanical | `.github/workflows/visual-noise-floor.yml` plus the provenance pin in the VR config guard test: pin the harness commit in the provenance line and fail when the spec changes after it.                                                |
| Marketing and hospitality publishers pushed to one diff-image ref.                                                                                                                  | `review.md` §Major M1                                           | mechanical | `scripts/__tests__/publish-visual-diffs.test.mjs` (named in the review): assert `suite` is part of `buildRefName`.                                                                                                                    |
| Verification ran with an unlabelled `calibration.json`, so two placeholder tests failed by design.                                                                                  | `verification.md` §SC-7                                         | judgement  | Not a defect; the SC-3 labelling is the fix. Without an issue it was forgotten. Carrier: `docs/standards.json` if present; none was found for 'a human-only step gets an issue', so this is a `CLAUDE.md` / `AGENTS.md` line at best. |
| Merged over a red advisory check that the brief said it was not authorised to merge over.                                                                                           | `release.md` §Judgement call                                    | judgement  | `.github/workflows/ci.yml` `CI Gate` does not require it (`strict: false`); making `Visual Regression (rialto-web)` green on main is the carrier.                                                                                     |
| `state.mjs` parses git's English error text; no `LC_ALL=C`.                                                                                                                         | `release.md` §Open items (review n3)                            | mechanical | `scripts/__tests__/ui-quality-state.test.mjs`: spawn with a non-English locale. Still open on main (grep).                                                                                                                            |
| Routine's fix-PR branch and `evidence.file` contract disagreed between PRD, Architect and Implement.                                                                                | `breakdown.md` §Design gaps found (2026-09-30); `review.md` m1  | judgement  | A `docs/features/ui-quality-loop/architecture.md` interface line naming the field both detectors emit; no checker holds it.                                                                                                           |
| Daily `routine-liveness` raises a `dark` issue for a routine that ran but filed nothing, and again today.                                                                           | #6191, #6444, #6526, #7950, #7969, #8446                        | mechanical | `scripts/routine-manifest.mjs` heartbeat signature (landed in #6215); the current #8446 shows the signature is not met since 11-05.                                                                                                   |

No hook or CI job checks the ui-quality tests as a unit: the `scripts` suite
runs them, but `.husky/pre-push` has no `ui-quality` reference (grep) and
`ci.yml` has no ui-quality-specific job. They ride the general `scripts` test
run, so this is a guardrail by coverage rather than by name. The loop's
live-state invariants (calibration status, ledger-vs-issues reconciliation) are
checked by nothing outside the routine's own fire.

## Idea seeds

- Label the 12 calibration pairs and commit the labelled `calibration.json` and fold PNGs so `calibrate` can produce a trusted taste score; measure the agreement against the 0.8 pass mark and how many of the 43 stale ratings flip to a finding (from: feature:ui-quality-loop)
- Find out why `mbe-ui-quality` has not fired since 2026-11-05 (#8446 open) and what the ledger branch lacks after 3c7ace430: read `list_runs`/`get_run_log` for `trig_01DYzgRBp66dxwQ828y9x1jV` and count missed days (6 of 36 so far) (from: feature:ui-quality-loop)
- Make `metrics/ui-quality-findings.json` reconcile issue state: 4 closed P1 issues (#5973, #6005, #6006, #6025) are still `state: open` after 28 days; measure open-record vs open-issue drift per fire (from: feature:ui-quality-loop)
- Add a P1 age report that counts closed issues too, since `p1-age.mjs` sees only open ones and 3 of 4 P1s outlived 7 days; measure P1 time-to-close and decide whether the SLA needs an escalation that fires before close (from: feature:ui-quality-loop)
- Cover the 21 `unreachable:auth` hospitality routes (13% of non-redirect routes) with an authenticated capture or a fixture session, and measure how many findings those routes hold that the loop cannot see (from: feature:ui-quality-loop)
- File the five product defects the loop surfaced (marketing `/` 413 px overflow, nav "Home" always active, hospitality 375 px overflow, "66.666…%", `useScrollReveal` under reduced motion) as `ui-quality` issues, and add a `bugs/horizontal-overflow` tell; measure how many are still reproducible on main (from: feature:ui-quality-loop)
- Run the routine's `n3` fix (`LC_ALL=C` in `state.mjs createGit`) with a non-English-locale test, and add a ui-quality job or pre-push step so these tests run under a name (from: feature:ui-quality-loop)
- Either populate `evidence.file` from capture or delete the fix-PR branch from the routine prompt; measure fix PRs the routine opened since 2026-10-01 (from: feature:ui-quality-loop)
- Decide whether `apps-visual` has ever caught a regression: count PRs where the sticky diff comment appeared and what happened next, and fix the 3 of 10 recent main `push` failures if they are real (from: feature:ui-quality-loop)

## Run complete

Closed 2026-11-07. PR #5931 merged 2026-09-30 and the loop has run 30 times
since, so the coverage bet (SC-1: 135/135 reachable routes audited in 30 days) is
measured. The taste bet is not: the rater has never been calibrated, all 43
ratings are stale and the labelling step the run left to the Owner is
unfinished. No person is recorded using the output, so `users-observed` is 0.
The loop is currently silent (no fire since 2026-11-05, #8446 open), which is
the first thing to look at. The seeds above are the input to the next Idea-stage
run.
