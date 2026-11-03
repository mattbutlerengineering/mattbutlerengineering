---
stage: ship
run: feature:tier-escalation-false-positives
date: 2026-11-02
outcome: released
released-at: 2026-10-22T21:09:34Z
assumptions:
  - "The code release happened before this Ship stage: #6701 (`b8af19905`, merged 2026-10-15T14:03:57Z) and the re-entry fix #7078 (`79b02e565`, merged 2026-10-22T21:09:34Z). The brief (Matt, 2026-11-02) says Ship records it and does not re-release. `released-at` uses #7078's merge time, because that is when the shipped state (Load-from-base step, T4 policy rule, corrected fixtures) was reached; #6701's earlier date is stated above and in the log."
  - "The 'deploy' is `.github/workflows/tier-classifier.yml` taking effect on `main`. There is no build, publish, tag, migration or environment config. No release action was run in this stage."
  - "This stage's only mutation is the run's artifact PR (verify, review, ship docs), which the brief authorizes Ship to merge with `gh pr merge --auto --squash --delete-branch` once `CI Gate` is green. This file does not claim that PR merged; the PR state is reported outside the artifact."
  - "`docs/launch-demo.json` was not checked for a `when: ship` hook: a classifier workflow change has no launch surface and the brief gives no launch instruction. No launch entry written."
  - "Pre-flight 'no secrets in the diff' is judged on the artifact PR (markdown docs plus the improvement-loop and queue-telemetry files that `git diff` shows against the local `origin/main` ref, which is older than the real tip). The shipped code diffs (#6701, #7078) were read in full by Review; it reported no secret."
---

# Release: Tier escalation counts only real review surface

## Pre-flight

- [x] Verification green (no unresolved failures). `verification.md` (2026-11-02) records all criteria pass, re-run on origin/main `6e9adc880`.
- [x] No secrets in diff; target config present. Nothing to configure: the workflow uses the repo's `GITHUB_TOKEN`. Review read the #6701/#7078 diffs and raised no secret finding.
- [x] Migrations/data changes: none. No schema, no data.
- [x] ADRs: none added by this run (`architecture.md` "ADRs: none"; `review.md` agrees), so no number to check.
- [x] Rollback plan concrete (below).
- [x] Review: no critical finding. One MAJOR is open and Owner-deferred (next section); 4 minors deferred. The Owner's decision is recorded in `autorun-brief.md` § "Review decision 2026-11-02".

### Known open finding at release (not fixed)

- **MAJOR, open, live on `main`:** PR-head code (`scripts/resolve-pr-metadata.mjs`, and the workflow file itself under `pull_request`) can steer `tier-classifier.yml` and lower its own PR's tier. #7078 closed only the module path. Matt deferred it on 2026-11-02 ("Separate fix run, defer here") to the maintenance run **`docs/fixes/tier-gate-pr-head-code`**, started as the next autorun after this one. It stays a live weakness on `main` until that run ships.
- **Four minors, deferred** (reasons in `review.md`):
  1. `**/generated*` and `**/registry.json` exclusions are nameable, so size escalation can be dodged.
  2. The 25 replay de-escalations are pinned by shape only; none was hand-checked as a true false positive.
  3. The policy-edit T4 rule has no live run (no merged PR has edited `scripts/tier-escalation.mjs` since #7078), and by the major finding it protects only against accidental edits.
  4. T4 coverage of merge-gate files is partial and overclaimed in docs (`docs/change-tiers.md:28` and the workflow comment); folds into the major's fix-forward.

## Rollback plan

Door: two-way — both changes are workflow and script edits on `main` with no migration or published artifact; a revert restores the previous classifier.

Blast radius: every PR's tier label and the merge gate that reads it. Reverting #6701 restores the old behaviour that raised the false-positive escalations (the cause of #6655); reverting #7078 alone removes the Load-from-base step and the T4 policy rule, so the classifier runs the PR-head policy module again. Nobody outside this repo is affected. A wrong call shows on the next PR's `Classify` step and its `tier:*` label.

Both commits are single-parent, so a plain revert needs no `-m`:

```
git rev-list --parents -n1 79b02e565   # 79b02e565e54d3db084950d72afe0e8cb1e091a4 e6559ac25b7d30a46427e53ee2f5fee352349427
git rev-list --parents -n1 b8af19905   # b8af19905719c93c0879680d42ea5435d3e0411d d29d4aaaaa86341bb50bf468894c1403d2cdc2e4

# newest first; each as its own PR to main
git revert 79b02e565   # undo #7078 (Load from base, T4 policy rule, fixtures)
git revert b8af19905   # undo #6701 (escalation module, workflow wiring, docs, tests)
```

Revert order matters: #7078 builds on #6701's files, so revert #7078 first. Reverting #6701 alone would conflict.

## Release log

1. #6701 `b8af19905` merged to `main` by the Owner, 2026-10-15T14:03:57Z → `tier-classifier.yml` runs the new escalation module; #6655 already closed 2026-10-15.
2. Re-entry from the 2026-10-18 verification routing: fix PR #7078 `79b02e565` merged to `main` by the Owner, 2026-10-22T21:09:34Z → Load tier policy from the base branch, T4 rule for `scripts/tier-escalation.mjs`, fixtures corrected to 1004 counted lines → T4.
3. This stage: no release command run. Confirmed both commits are single-parent with `git rev-list --parents -n1` (output in the rollback block).
4. Artifact PR (verify, review and ship docs, no product code): opened to `main` with auto-merge armed per the brief's release authorization. Its state is reported by the stage's final output, not asserted here.

## Post-release checks

- `verification.md` § live runs: of 911 successful `pull_request` runs of `tier-classifier.yml` since #7078, `Load tier policy from base branch`, `Classify` and `Apply tier label` are all `success` on 910. Named runs: 39871264740 (2026-10-22T23:21:45Z, `chore/loop-session-artifacts`, `Classified: tier:trivial (T1)`) and 41573767761 (PR #8170, same steps, `tier:trivial (T1)`).
- Re-confirmed this stage with `gh run view 41573767761 --json jobs,conclusion,createdAt`: `{"c":"success","t":"2026-11-03T03:42:12Z","steps":["Load tier policy from base branch=success","Classify=success","Apply tier label=success"]}`.
- `gh run list --workflow tier-classifier.yml --limit 3` showed the three most recent runs (41573767761, 41572940248, 41572427063) all `success`.
- Minimum signal for Operate: met. `verification.md` counts 885 distinct PRs classified since #6701.

## Outcome

Released. #6701 shipped on 2026-10-15 and #7078 on 2026-10-22, live as `main`'s workflow, with no release action in this stage. Hiccup: the first release (#6701) needed the re-entry fix #7078 after the 2026-10-18 verification, which this run's Verify re-ran fresh. The Owner-deferred MAJOR and the 4 minors above are unfixed. Operate follows.
