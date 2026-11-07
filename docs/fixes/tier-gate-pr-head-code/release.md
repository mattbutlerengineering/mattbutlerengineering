---
stage: ship
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
outcome: released
pending-merge: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/8183
released-at: 2026-11-04
assumptions:
  - "Release authorization is PREPARE AND STOP (brief): Matt merges the gate change himself. No merge, no auto-merge, no labels, no deploy/tag/publish, no issue comments were done. Decided without live user input."
  - "Skill step 4 (launch brief): `docs/launch-demo.json` was not consulted for a `when: ship` hook; a CI-workflow fix has no launch surface. Nothing written."
  - "Skill step 6 (tracker close) does not apply: the brief says Tracker: none and `defect.md` has no `intake:`. The PR body carries no closing keyword."
  - "No ADR was added by this run (architecture.md: none), so the ADR-number/index pre-flight item is vacuous."
  - "Secrets scan was a regex grep over the added lines of `git diff origin/main` outside `docs/fixes` (AWS/GitHub/Slack/OpenAI token shapes, private-key headers, `password|secret = '<literal>'`); no tool-based scanner was run. The pre-push hooks ran unbypassed."
  - "The classifier workflow cannot be exercised live before merge (pull_request_target runs the base copy); only local suites ran. Stated in the PR's Merge notes."
  - "Write-back pass (resumed 2026-11-03): release authorization is unchanged. Matt merged #8183 himself; this pass did no merge, deploy, publish, tag, workflow dispatch, label change or issue/PR comment. GitHub was read-only apart from pushing the write-back branch and opening its docs-only PR. Authorized by the brief's Resume section, not live."
  - "Write-back route not answered live (brief, Resume 2026-11-03): it lands the way #8206 landed venue-availability's. Branch `docs/tier-gate-pr-head-code-ship-writeback`, cut from `origin/main` @ `106eaaf9c`, worktree `.claude/worktrees/tier-gate-pr-head-code-writeback`; one docs-only PR that Matt merges. `fix/tier-gate-pr-head-code` is not reused (squash-merged)."
  - "`released-at: 2026-11-04` is the UTC calendar date of `mergedAt` 2026-11-04T03:46:25Z (the protocol's merge date, YYYY-MM-DD). The local date of the pass is 2026-11-03; the UTC date was chosen because `mergedAt` is reported in UTC. `date:` stays 2026-11-02, the date of the prepare pass."
  - 'Skill step 4 (launch brief), observed on 2026-11-04: `docs/launch-demo.json` is ABSENT on origin/main (`git cat-file -e origin/main:docs/launch-demo.json` → `fatal: path ''docs/launch-demo.json'' does not exist in ''origin/main''`; `git ls-tree` finds no launch-demo path). Nothing written. This replaces the 2026-11-02 "was not consulted" entry above with an observation; that entry is kept because the assumptions record is append-only.'
  - "Protocol sections named by the assignment (The Ship outcome, Commit at the stage boundary, Fail-closed roll-up) do not exist in the pinned 0.12.2 `pipeline-protocol.md`; they were read from the installed 0.24.0 protocol. The 0.12.2 `ship` skill and TEMPLATE.md define the artifact's shape; 0.24.0's TEMPLATE adds the `outcome:`, `pending-merge:` and `released-at:` fields, used here."
  - "Post-release checks used the first pull requests opened or updated after mergedAt 2026-11-04T03:46:25Z. Check (e)'s fork half had no sample and is NOT OBSERVED; it is not counted as a pass."
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
- [x] Re-confirmed 2026-11-04, before the write-back: `review.md` has no unfixed critical. Quoted: "**No residual path executes PR-head content. No critical finding.**" (Verdict, line 76) and "No critical and no major finding is unfixed." (line 125). That same verdict says "Six minors remain, all deferred with reasons"; the "5 minors" in the Review line above is the prepare pass's count and is left as written (the review file lists six minor headings).
- [x] Re-confirmed 2026-11-04: the squash commit exists on origin/main (Release log 8) and `docs/launch-demo.json` is absent (Release log 9).

## Rollback plan

Door: two-way — the change is workflows, a script, tests and docs; a revert of the squash commit restores the old state. No data, migration or published artifact.

Blast radius: every PR's tier label and auto-merge/merge-queue eligibility flow through these workflows. A wrong call mislabels or leaves PRs unlabelled (eligibility fails closed without a label); it is noticed by the next PR after merge.

Revert the whole change as one unit, never the workflow alone: the old workflow with the ten producers already on the default branch would check out `main`, diff `main` against `main`, and stamp an empty diff `tier:trivial` (architecture.md, Migration & rollback).

```
git fetch origin main
git switch -c revert/tier-gate-pr-head-code origin/main
git revert --no-edit be5751245d91dc40fb0335c1d8ccc0e16d9d2ccb      # single squash commit on origin/main; the whole change
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
6. Stopped. Not merged; auto-merge not armed; no label applied. (Prepare pass, 2026-11-02.)

Write-back pass, 2026-11-04 (the pull request merged):

7. `gh pr view 8183 --json state,mergedAt,mergedBy,mergeCommit` → `{"mergeCommit":{"oid":"be5751245d91dc40fb0335c1d8ccc0e16d9d2ccb"},"mergedAt":"2026-11-04T03:46:25Z","mergedBy":{"id":"U_kgDODhKTJw","is_bot":false,"login":"mattbutlerengineering","name":""},"state":"MERGED"}`. Merged by Matt, so the release step is the write-back: `outcome: released`, `released-at: 2026-11-04`, `pending-merge:` unchanged.
8. `git fetch origin main && git log -1 --format='%H %s' be5751245` → `be5751245d91dc40fb0335c1d8ccc0e16d9d2ccb fix(ci): tier gate executes only base-branch code (pull_request_target, base-side resolver, no-renames -z diff) (#8183)`; `git merge-base --is-ancestor be5751245 origin/main` → true. One squash commit on origin/main; the rollback plan below names it.
9. `git cat-file -e origin/main:docs/launch-demo.json` → `fatal: path 'docs/launch-demo.json' does not exist in 'origin/main'`. The file is absent, so skill step 4 does nothing and writes nothing.
10. Post-release checks (a)–(e), run read-only; evidence and verdicts under "Post-release checks". Fork half of (e): NOT OBSERVED.
11. `pnpm exec prettier --write` then `--check` on this file; committed on `docs/tier-gate-pr-head-code-ship-writeback` as its own commit; pushed; one docs-only PR opened for Matt to merge. This pass does not merge it.

## Post-release checks

Read-only `gh`/`git` against GitHub on 2026-11-04 (about 05:28Z). Sample: the pull requests opened or updated after `mergedAt` 2026-11-04T03:46:25Z. No workflow was dispatched and no label or comment was written by this pass.

**(a) The post-merge classifier runs are `pull_request_target`.**

```
gh run list --workflow tier-classifier.yml --limit 20 --json databaseId,event,headBranch,conclusion,createdAt,displayTitle --jq '.[] | [.databaseId,.event,.headBranch,.conclusion,.createdAt,.displayTitle]|@tsv'
41777401682  pull_request_target  feat/issue-8204-shipped-features-freshness    success  2026-11-04T05:08:25Z
41776173410  pull_request_target  docs/dependabot-auto-merge-retro             success  2026-11-04T04:56:18Z
41775829626  workflow_dispatch    main                                         success  2026-11-04T04:52:45Z
41774874670  pull_request_target  chaos/synthetic-bug-1793649868182            success  2026-11-04T04:43:05Z
41774249020  pull_request_target  feat/issue-8199-gen-narrow-escape-e2e        success  2026-11-04T04:36:39Z
41769503846  pull_request_target  worktree-agent-a0bdac23c4a9aae72             success  2026-11-04T03:49:53Z
41769305880  pull_request_target  cursor/fix-nav-and-narrow-layouts-f9aa       success  2026-11-04T03:47:52Z
41769299045  pull_request_target  worktree-agent-a0ec9e0a22dbb48c1             success  2026-11-04T03:47:48Z
41769107333  pull_request         cursor/fix-nav-and-narrow-layouts-f9aa       success  2026-11-04T03:45:54Z   (before the merge)
```

Verdict: PASS. All 8 runs after 03:46:25Z concluded `success`: 7 are `pull_request_target`, 1 is a `workflow_dispatch` (the production-feedback producer, see (e)). The last run on the old `pull_request` trigger is 41769107333 at 03:45:54Z, 31 seconds before the merge; none follows it. The earliest rows (older than 03:45Z) are the old trigger and are not part of the sample.

**(b) A `tier:*` label landed and is the right tier.**

```
gh api repos/mattbutlerengineering/mattbutlerengineering/issues/8227/timeline --paginate --jq '.[] | select(.event=="labeled" or .event=="commented") | …'
labeled     2026-11-04T04:37:00Z  github-actions[bot]  agent-authored
labeled     2026-11-04T04:37:12Z  github-actions[bot]  tier:standard
commented   2026-11-04T04:37:13Z  github-actions[bot]  **Classified as `tier:standard`** by tier-classifier. unmatched paths default to T2: apps/gen/e2e/playground-layout.spec.ts
gh pr view 8227 --json createdAt,labels,files
{"createdAt":"2026-11-04T04:36:35Z","files":["apps/gen/e2e/playground-layout.spec.ts"],"labels":["tier:standard","agent-authored","needs-review"]}
```

Second sample, #8228 (the production-feedback PR, created 04:52:41Z): `files: ["metrics/production-health/2026-11-04.jsonl"]`; `tier:trivial` applied by `github-actions[bot]` at 04:53:05Z.

Verdict: PASS. #8227 changes one file, `apps/gen/e2e/playground-layout.spec.ts`. In `.github/workflows/tier-classifier.yml` no rule matches it: the T2 `apps/<x>/src/` rule needs `src/`, and the T1 `test-only` rule matches `\.test\.[tj]sx?$`, not `.spec.ts`. The workflow's fallback is `highest === 0` → T2 with the reason quoted above, so `tier:standard` is what the written rules produce. `docs/change-tiers.md` lists "test-only additions" as T1 in prose; the executable rule is narrower (`.test.*` only), so T2 is the stricter reading and the label matches the code. Whether `.spec.ts` should count as test-only is a policy question outside this run, not a defect in the shipped change. #8228's `tier:trivial` matches the `metrics/` T1 rule.

**(c) The PR head is never checked out.**

```
gh run view 41774249020 --log     # run for #8227, 2026-11-04T04:36:39Z
Checkout (base only)  Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
Checkout (base only)  with:
Checkout (base only)    fetch-depth: 0
Checkout (base only)    persist-credentials: false
Checkout (base only)    repository: mattbutlerengineering/mattbutlerengineering
Checkout (base only)    token: ***
Checkout (base only)    allow-unsafe-pr-checkout: false
Checkout (base only)  git checkout --progress --force -B main refs/remotes/origin/main
Checkout (base only)  Switched to a new branch 'main'
Fetch PR head as data   git fetch --no-tags origin "refs/pull/${PR_NUMBER}/head"
Fetch PR head as data    * branch                refs/pull/8227/head -> FETCH_HEAD
(Resolve diff step)     base_sha=$(git merge-base "origin/${PR_BASE_REF}" "$HEAD_SHA")
(Resolve diff step)     git diff --no-renames --no-ext-diff --no-textconv -z --name-only "$base_sha" "$HEAD_SHA" > /tmp/changed-files.txt
Load tier policy from base branch   git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs" > /tmp/tier-policy/tier-escalation.mjs
```

Verdict: PASS. The checkout's `with:` block has no `ref:` (the `repository:` line is the default base repo that actions/checkout echoes from its own defaults; the workflow's checkout step sets only `fetch-depth` and `persist-credentials`). The only `git checkout` is of `refs/remotes/origin/main`. The head is reached once, by `git fetch … refs/pull/8227/head`, and only diffed; the policy module is read from the base branch. The base `origin/main` in that run was `23d6c5522`, which contains the merge commit `be5751245` (`git merge-base --is-ancestor be5751245 23d6c5522` → true), so the run executed the shipped workflow.

**(d) #8183's own `tier:critical` label was applied by a human.**

```
gh api repos/mattbutlerengineering/mattbutlerengineering/issues/8183/timeline --paginate --jq '.[] | select(.event=="labeled" or .event=="unlabeled") | …'
labeled  2026-11-04T03:47:06Z  mattbutlerengineering  User  tier:critical
```

Verdict: PASS. The only label event is `labeled tier:critical` by `mattbutlerengineering`, `type: User`, not `github-actions[bot]`, 41 seconds after the merge.

**(e) A fork PR, and a producer `workflow_dispatch` without `--ref`.**

Producer half, OBSERVED:

```
git show origin/main:.github/workflows/production-feedback.yml | grep -n "gh workflow run"
165:        run: gh workflow run ci.yml --ref automation/production-feedback
177:        run: gh workflow run tier-classifier.yml -f pr="$PR_NUMBER"
gh api repos/…/actions/runs/41775829626 --jq '{actor:.actor.login,event,head_branch,path}'
{"actor":"github-actions[bot]","event":"workflow_dispatch","head_branch":"main","path":".github/workflows/tier-classifier.yml"}
gh run view 41775829626 --log   →   PR_NUMBER: 8228
```

Run 41775829626 (04:52:45Z, `success`, job `classify` `success`) is the production-feedback producer's `tier-classifier` dispatch for #8228, sent without `--ref`; it ran on `main` (`headSha 30a28963f`) and #8228 got `tier:trivial` at 04:53:05Z. The producer's only `--ref` is the `ci.yml` dispatch. Verdict for the producer half: PASS.

Fork half, NOT OBSERVED:

```
gh pr list --state all --search "created:>=2026-11-04T03:46:25Z" --limit 50 --json number,createdAt,isCrossRepository,headRefName,author
8230  2026-11-04T05:08:21Z  false  feat/issue-8204-shipped-features-freshness
8229  2026-11-04T04:56:14Z  false  docs/dependabot-auto-merge-retro
8228  2026-11-04T04:52:41Z  false  automation/production-feedback
8227  2026-11-04T04:36:35Z  false  feat/issue-8199-gen-narrow-escape-e2e
8226  2026-11-04T04:20:15Z  false  revert-broken-main-59a9cfab5cde807ea4c410eb3156fb3d5aeb554f
8224  2026-11-04T03:52:43Z  false  changeset-release/main
```

Every PR since the merge has `isCrossRepository: false`. No fork PR exists in the window, so the check that `refs/pull/N/head` fetches with the job token for a fork head is NOT OBSERVED. It is not counted as a pass; it needs the first fork PR.

**Unobserved:** (e), fork half: no fork PR since the merge. Everything else above was observed. No unqualified "all checks pass" is claimed: (a), (b), (c), (d) and the producer half of (e) pass on the samples quoted; the fork half stays open.

## Outcome

Released 2026-11-04 via #8183, merged by Matt (`mattbutlerengineering`, `mergedAt` 2026-11-04T03:46:25Z, squash commit `be5751245d91dc40fb0335c1d8ccc0e16d9d2ccb` on origin/main). `outcome: released`, `released-at: 2026-11-04`, `pending-merge:` kept as the record of what was waited on.

Observed after the merge: all 8 `tier-classifier` runs since 03:46:25Z succeeded, 7 on `pull_request_target` and 1 producer `workflow_dispatch` on `main`; `tier:standard` landed on #8227 and `tier:trivial` on #8228, each matching the workflow's rules; a post-merge run log shows a base-only checkout with no `ref:`, with the head fetched as `refs/pull/8227/head` and diffed; #8183's `tier:critical` was applied by a human.

NOT OBSERVED: the fork-PR half of check (e) (no fork PR since the merge). It is open, not passed.

Hiccups: none in the release itself. Process notes: the assignment's protocol sections were absent from the pinned 0.12.2 protocol and were read from 0.24.0 (see `assumptions:`); the 5 vs 6 deferred-minor count noted under Pre-flight was already in the record. Operate is `skip` (brief), so the run stays active after this stage.
