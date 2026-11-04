---
stage: ship
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
outcome: prepared
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8183
assumptions:
  - "Release authorization is PREPARE AND STOP (brief): Matt merges the gate change himself. No merge, no auto-merge, no labels, no deploy/tag/publish, no issue comments were done. Decided without live user input."
  - "Skill step 4 (launch brief): `docs/launch-demo.json` was not consulted for a `when: ship` hook; a CI-workflow fix has no launch surface. Nothing written."
  - "Skill step 6 (tracker close) does not apply: the brief says Tracker: none and `defect.md` has no `intake:`. The PR body carries no closing keyword."
  - "No ADR was added by this run (architecture.md: none), so the ADR-number/index pre-flight item is vacuous."
  - "Secrets scan was a regex grep over the added lines of `git diff origin/main` outside `docs/fixes` (AWS/GitHub/Slack/OpenAI token shapes, private-key headers, `password|secret = '<literal>'`); no tool-based scanner was run. The pre-push hooks ran unbypassed."
  - "The classifier workflow cannot be exercised live before merge (pull_request_target runs the base copy); only local suites ran. Stated in the PR's Merge notes."
---

# Release: tier gate executes only base-branch code (`maintenance:tier-gate-pr-head-code`)

## Pre-flight

- [x] Verification green: `verification.md` 14/14 criteria pass (final gate C9: 8 suites, 236/236); regression fails on `origin/main`; scanner RED on mutation.
- [x] Review: `review.md` re-run at `de3f15ff4` — no critical, no major unfixed; both prior majors closed; 5 minors deferred with reasons (listed in the PR body).
- [x] Rebased onto `origin/main` with no conflicts (23 commits replayed, `Successfully rebased`); new head `baac6053c`. The 8 suites re-run after the rebase: `Test Files  8 passed (8)`, `Tests  236 passed (236)`.
- [x] No secrets in diff: regex scan of added lines outside `docs/fixes` → no matches (exit 1). No new configuration is required in the target environment; the workflows use the existing `GITHUB_TOKEN`.
- [x] Migrations/data changes: none (`git diff origin/main --name-only` matches no `prisma`/`migrations`/`.sql` path). No config flip, no branch-protection change.
- [x] ADRs: none added by this run.
- [x] Rollback plan concrete (below).

## Rollback plan

Door: two-way — the change is workflows, a script, tests and docs; a revert of the squash commit restores the old state. No data, migration or published artifact.

Blast radius: every PR's tier label and auto-merge/merge-queue eligibility flow through these workflows. A wrong call mislabels or leaves PRs unlabelled (eligibility fails closed without a label); it is noticed by the next PR after merge.

Revert the whole change as one unit, never the workflow alone: the old workflow with the ten producers already on the default branch would check out `main`, diff `main` against `main`, and stamp an empty diff `tier:trivial` (architecture.md, Migration & rollback).

```
git fetch origin main
git switch -c revert/tier-gate-pr-head-code origin/main
git revert --no-edit <squash-merge-sha>      # single commit if squash-merged; the whole change
git push -u origin revert/tier-gate-pr-head-code
gh pr create --base main --head revert/tier-gate-pr-head-code \
  --title "revert: fix(ci): tier gate pull_request_target (#8183)" --body "Whole-change revert; see docs/fixes/tier-gate-pr-head-code/release.md"
# Matt applies tier:critical by hand (the revert touches the gate files, T4).
```

## Release log

1. `git fetch origin main && git rebase origin/main` → `Successfully rebased and updated refs/heads/fix/tier-gate-pr-head-code`; no conflicts; head `baac6053c`.
2. `pnpm exec vitest run --config scripts/vitest.config.mjs` over the 8 suites (wait-for-tier-label, tier-classifier-dispatch, tier-escalation, pull-request-target-no-head-execution, resolve-pr-metadata, merge-queue-tier-race, merge-queue-eligibility, tier-classifier-workflow) → `Test Files  8 passed (8)`, `Tests  236 passed (236)`.
3. `git push -u origin fix/tier-gate-pr-head-code` (pre-push hooks ran, not bypassed: regression ratchet "All patterns within baseline. No regressions detected.", regen check "All generated artifacts are up to date.") → new branch pushed.
4. `gh pr create` (non-draft, base `main`) → https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8183
5. `gh pr view 8183` → `state: OPEN`, `isDraft: false`, `autoMergeRequest: null`, `labels: []`, `mergeable: MERGEABLE`.
6. Stopped. Not merged; auto-merge not armed; no label applied.

## Post-release checks

Not performed — nothing has shipped. After Matt merges, on the first PR opened or updated after the merge:

- The `tier-classifier` run's event is `pull_request_target` (`gh run list --workflow tier-classifier.yml --limit 3 --json event,headSha,conclusion`).
- The expected `tier:*` label lands on that PR (and is the correct tier for its files).
- The run log shows no checkout of the PR head: the checkout step has no `ref:`, and the head is only fetched as `refs/pull/N/head` and diffed (`gh run view <id> --log`).
- For a fork PR, `refs/pull/N/head` fetches with the job token; a `workflow_dispatch` from a producer (no `--ref`) runs on the default branch.
- This PR (#8183) itself gets no automated `tier:*` label; Matt applies `tier:critical` by hand.

## Outcome

Prepared, not shipped: PR #8183 is open, non-draft, unmerged, auto-merge off, awaiting Matt's merge. Stage Ship stays pending until `outcome:` is `released`.
