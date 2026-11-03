---
stage: verify
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
assumptions:
  - "Baseline for 'origin/main code': origin/main was fetched at verify time and is 49b87bdf5. The branch merge-base is ab4a3b2bc. `git diff ab4a3b2bc origin/main` over .github/workflows, scripts/ and docs/change-tiers.md is empty, so origin/main's gate files are byte-identical to the defect's baseline. The regression ran against `git worktree add --detach /tmp/verify-tg-main origin/main`."
  - "Regression method (verify skill names no method): the branch's three changed test files were copied into the origin/main worktree and run there unchanged, with node_modules symlinked from the run worktree. This tests exactly the new assertions against old code. The temp worktree was removed afterwards (`git worktree list` shows none left)."
  - "Reproduction harness: the defect's /tmp/repro-tier-gate.sh predates the new design and cannot run it, so a new throwaway harness /tmp/verify-tg-repro.mjs (not committed) runs the real extracted step bodies of the old and the new workflow in a throwaway bare-origin repo. `gh` is replaced by a stub that returns the honest API answer for PR 7 (base `main`). The stub stands in for the GitHub API only."
  - "pnpm lint / pnpm typecheck were run twice: once cached (turbo FULL TURBO, no source change in their inputs) and once with `--force` so the result is real."
  - "Verdict scope: this verifies the repo state and local behaviour only. Live GitHub behaviour is listed under Not verified."
---

# Verification: tier gate executes base code only; PR head is data

## Summary

All 9 criteria PASS locally, with no failures. The regression is demonstrated both ways:

- The new trust-seam, dispatch, T4 and arming-workflow tests **fail 22 of 180 against origin/main's gate files and pass 180/180 on the branch**.
- The defect's forged-`base_ref` reproduction lands **T1 on origin/main's workflow and T4 on the branch's workflow**.

Live `pull_request_target` behaviour on GitHub, fork `refs/pull/N/head` fetch and the fix PR's own classification are not verifiable locally (see Not verified).

## Criteria & evidence

### C1. No step under `pull_request_target` checks out or executes PR-head files (defect target state; architecture invariant 1)

- Check: grep the three `pull_request_target` workflows for `ref:`/`repository:` on checkout and for `git checkout|switch|merge|worktree`, then run the real step bodies in a throwaway repo whose PR ref carries a forged resolver.
- Evidence:

  ```
  .github/workflows/tier-classifier.yml:22:  pull_request_target:
  .github/workflows/auto-merge.yml:10:  pull_request_target:
  .github/workflows/merge-queue.yml:10:  pull_request_target:
  --- ref/repository in checkouts   (grep -n -E "^\s+(ref|repository):" on the three files)
  (none)
  --- git checkout/merge/switch/worktree in tier-classifier
  18:# Do not add `ref:`/`repository:` to the checkout or any `git checkout`,      <- comment only
  114:          base_sha=$(git merge-base "origin/${PR_BASE_REF}" "$HEAD_SHA")        <- merge-base, read-only
  ```

  The harness run (full output under C2) shows `HEAD on disk: main d4f4d47 | forged resolver on disk: 0` for the branch workflow.

- Result: PASS

### C2. `base_ref` comes from base-side code (defect reproduction: forged `base_ref` → T1)

- Check: `/tmp/verify-tg-repro.mjs` builds a bare origin with `main` (real resolver/policy), `shadow` (adds `services/users/src/auth/session.ts` and a neutered policy) and `feat` = `shadow` + `docs/note.md` + a **forged `scripts/resolve-pr-metadata.mjs` that prints `base_ref=shadow`**, with `refs/pull/7/head` = `feat`. It extracts the real step bodies of each workflow (origin/main's, then the branch's) and runs them in order. The old workflow starts from a checkout of the PR head, the new one from a checkout of `main`.
- Evidence:

  ```
  ##### origin/main workflow (PR head checked out, resolver runs from the PR)
  checkout: git checkout -q 92044449de34b5189a5edd2aa024048430d5205c
  HEAD on disk: HEAD 9204444 | forged resolver on disk: 2
  [Resolve PR metadata] base_ref=shadow head_sha=9204444 (exit 0)
  [Compute base SHA and diff] exit 0
     changed files: docs/note.md, scripts/resolve-pr-metadata.mjs
  [Load tier policy from base branch] exit 0
  [Classify] exit 0
     Classified: tier:trivial (T1)
       - `docs/note.md` -> T1: markdown only

  ##### branch workflow (base-only checkout; PR head fetched as data)
  checkout: git checkout -q main
  HEAD on disk: main d4f4d47 | forged resolver on disk: 0
  [Resolve PR metadata] base_ref=main head_sha=9204444 (exit 0)
  [Fetch PR head as data] exit 0 From /private/tmp/verify-tg-repro/origin
   * branch            refs/pull/7/head -> FETCH_HEAD
  [Compute base SHA and diff] exit 0
     changed files: docs/note.md, scripts/resolve-pr-metadata.mjs, scripts/tier-escalation.mjs, services/users/src/auth/session.ts
  [Load tier policy from base branch] exit 0
  [Classify] exit 0
     Classified: tier:critical (T4)
       - `docs/note.md` -> T1: markdown only
       - `scripts/resolve-pr-metadata.mjs` -> T4: merge-gate script edit (resolves the PR metadata the classifier trusts)
  ```

  The forged resolver ran under the old design (`base_ref=shadow`, T1) and never ran under the new one (`base_ref=main`, forged file absent from disk, real 4-file diff, T4).

- Result: PASS

### C3. Permissions not broader than on origin/main

- Check: diff of the top-level `permissions:` block against origin/main for the three workflows, and a scan of the branch diff for added permission scopes.
- Evidence:
  ```
  tier-classifier: top-level permissions identical
  auto-merge: top-level permissions identical
  merge-queue: top-level permissions identical
  ```
  `git diff ab4a3b2bc HEAD` on the three files adds no `contents|pull-requests|issues|actions|checks|statuses|id-token|packages:` line. The checkout also gains `persist-credentials: false`.
- Result: PASS

### C4. No PR-derived string interpolated into a `run:` body

- Check: the structural test `(e) no ${{ }} inside any run: body` (see C9), plus an awk scan of `run:` bodies in the three workflows.
- Evidence:
  ```
  tier-classifier.yml  ${{ in run bodies: (no output)
  -- auto-merge ${{ in run bodies   (no output)
  -- merge-queue ${{ in run bodies  (no output)
  ```
- Result: PASS

### C5. Fail closed on resolver/fetch error

- Check: behavioural tests that run the real step bodies against failing fixtures.
- Evidence (branch run):
  ```
  ✓ fails when the fetched tip is not the resolved head_sha
  ✓ fails when the PR ref cannot be fetched
  ✓ fails when the head shares no ancestor with origin/<base_ref>
  ✓ fails closed when the base branch has no policy module
  ```
  The steps use `set -euo pipefail`. A failed step means no Classify and no label, and `merge-queue-eligibility` already fails closed without a label.
- Result: PASS

### C6. Dispatch pinned to the default branch

- Check: the guard step body run for a non-default ref, the default ref and a non-dispatch event; a repo-wide grep for `--ref` on classifier dispatches.
- Evidence:
  ```
  ✓ fails a dispatch run from a non-default ref
  ✓ passes a dispatch run from the default branch
  ✓ passes a non-dispatch event regardless of ref
  ✓ only runs for workflow_dispatch
  ✓ every workflow dispatches tier-classifier from the default branch > no `gh workflow run tier-classifier.yml` line passes --ref
  $ git grep -n "tier-classifier.yml --ref" .github/workflows      (no output)
  $ git grep -n -E "only triggers on .pull_request" .github/workflows   (no output)
  ```
  Ten producer workflows were edited (diff stat above).
- Result: PASS

### C7. Arming workflows off PR-head execution (`auto-merge.yml`, `merge-queue.yml`)

- Check: `merge-queue-eligibility.test.mjs` new describes for both files (`pull_request_target`, no `pull_request:`, header rule, no bare `"pull_request"` literal), plus the checkout `ref:` grep from C1.
- Evidence (branch run, `merge-queue-eligibility.test.mjs (92 tests)`): all green. The same six new assertions fail against origin/main (see Regression). `merge-queue-tier-race.test.mjs (9 tests)` also green.
- Result: PASS

### C8. T4 rules for the four gate files, and docs no longer overclaim

- Check: `runClassifier` T4 cases and near-miss cases; read `docs/change-tiers.md` T4 section and the workflow comments.
- Evidence:

  ```
  ✓ tier-classifier path rules: merge-gate files are T4 (9)
    ✓ scripts/resolve-pr-metadata.mjs lands T4
  (plus scripts/merge-queue-eligibility.mjs, .github/workflows/auto-merge.yml, .github/workflows/merge-queue.yml; 5 near-miss cases pass)
  ```

  The harness in C2 independently shows `scripts/resolve-pr-metadata.mjs -> T4: merge-gate script edit (resolves the PR metadata the classifier trusts)`.

  `docs/change-tiers.md` T4 list now names `auto-merge.yml`, `merge-queue.yml`, `scripts/resolve-pr-metadata.mjs` and `scripts/merge-queue-eligibility.mjs`. The old "a PR cannot edit the policy" claim is kept only with its real basis: "`tier-classifier` runs on `pull_request_target`, so the workflow file and every step run from the base side; the PR head is fetched as git objects and diffed, never checked out or executed … That execution context, not a path rule, is why a PR cannot edit the policy (or the resolver, or the workflow) to lower its own tier; the edit itself lands T4."

  `git grep -n -i "PR-head checkout" .github/workflows/tier-classifier.yml` matches nothing. The remaining `PR head` matches are the new base-only wording.

- Result: PASS

### C9. Final gate (breakdown last item): seven suites, eslint, prettier, actionlint, lint, typecheck

- Check: run in the run worktree on the branch head.
- Evidence:

  ```
  ✓ scripts/__tests__/resolve-pr-metadata.test.mjs (2 tests)
  ✓ scripts/__tests__/tier-escalation.test.mjs (16 tests)
  ✓ scripts/__tests__/wait-for-tier-label.test.mjs (6 tests)
  ✓ scripts/__tests__/tier-classifier-dispatch.test.mjs (16 tests)
  ✓ scripts/__tests__/merge-queue-tier-race.test.mjs (9 tests)
  ✓ scripts/__tests__/merge-queue-eligibility.test.mjs (92 tests)
  ✓ scripts/__tests__/tier-classifier-workflow.test.mjs (72 tests)
   Test Files  7 passed (7)
        Tests  213 passed (213)

  eslint (changed .mjs): eslint-clean
  prettier --check (changed files + run docs): All matched files use Prettier code style!
  pnpm lint --force:      Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total  (0 errors; warnings only, in packages unrelated to this change)
  pnpm typecheck --force: Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total
  ```

  actionlint on the 13 touched workflows reports only two shellcheck style notes (SC2001, SC2129), both in an untouched step of `production-feedback.yml`:

  ```
  .github/workflows/production-feedback.yml:37:9: shellcheck reported issue in this script: SC2001:style:48:12 ...
  .github/workflows/production-feedback.yml:37:9: shellcheck reported issue in this script: SC2129:style:41:1 ...
  ```

  The same two notes appear on origin/main's copy of that file (`actionlint` run on `git show origin/main:...` reports both). actionlint exits 1 because of them. The notes are not caused by this change, so the criterion passes.

- Result: PASS

## Regression: fails on origin/main, passes on the branch

The test files `tier-classifier-workflow.test.mjs`, `tier-classifier-dispatch.test.mjs` and `merge-queue-eligibility.test.mjs` come from the branch. They ran in a detached worktree of origin/main (49b87bdf5), so the workflow and script bytes were the old ones:

```
Test Files  3 failed (3)
     Tests  22 failed | 158 passed (180)
 × tier-classifier-dispatch  triggers on pull_request_target (base-side workflow file), same types
 × tier-classifier-dispatch  no `gh workflow run tier-classifier.yml` line passes --ref
 × trust seam: (a) triggers on pull_request_target and workflow_dispatch, never pull_request
 × trust seam: (b) the checkout has no ref/repository and precedes the resolver
 × diffs the fetched head against the base: real file list, working tree untouched
 × fails when the fetched tip is not the resolved head_sha
 × fails when the PR ref cannot be fetched
 × fails when the head shares no ancestor with origin/<base_ref>
 × Pin dispatch to the default branch: fails a dispatch run from a non-default ref / passes a dispatch run from the default branch / passes a non-dispatch event regardless of ref / only runs for workflow_dispatch
 × merge-gate files: scripts/resolve-pr-metadata.mjs lands T4
 × merge-gate files: scripts/merge-queue-eligibility.mjs lands T4
 × merge-gate files: .github/workflows/auto-merge.yml lands T4
 × merge-gate files: .github/workflows/merge-queue.yml lands T4
 × auto-merge.yml and merge-queue.yml (each): triggers on pull_request_target and never on pull_request / carries a header comment stating the never-check-out-the-PR-head rule / compares the event name to pull_request_target, never the bare pull_request literal   (6 tests)
```

The same three files on the branch: 72 + 16 + 92 = 180 tests, all pass (C9). The behavioural tests fail on old code because the named steps do not exist there.

Trust-seam invariants (c) no checkout/merge/switch/worktree, (d) `base_ref` only from `steps.pr.outputs.base_ref`, (e) no `${{ }}` in `run:` bodies are **not** red on origin/main. Old code also satisfied them, so they pass on both sides. They are guards, not the regression. The exposure on old code is (a) and (b), plus the resolver running from the PR head, which C2 shows end to end.

## Failures

none.

## Not verified

- **Live `pull_request_target` behaviour on GitHub.** The workflow file actually taken for a PR whose base is not the default branch, the token's permissions and the label landing. No dispatch, push or PR was allowed, and the local harness replaces GitHub with a bare repo and a `gh` stub. Check the label on the first PR after merge.
- **Fork PRs fetching `refs/pull/N/head`.** Git fetch of that ref was exercised against a local bare origin only. That the job token can fetch it for a fork PR is documented GitHub behaviour, not exercised.
- **The fix PR's own classification.** The expected outcome is no automated `tier:*` label, which Matt applies by hand as `tier:critical` (architecture.md § Migration, [INFERENCE] from the trigger rules). It cannot be observed before the PR exists.
- **`workflow_dispatch` from a non-default ref on GitHub.** Only the guard step body was run, with a faked `github.ref`. The residual risk of a writer dispatching a modified copy from their own branch is accepted in architecture.md.
- **Branch protection state** (`CI Gate` only, no required reviews). Out of scope and carried unverified from the origin review.
- **A PR retargeted to a non-default base branch the attacker controls.** Then `base_ref` honestly resolves to that branch, and the policy and diff are read from it. The attacker's own branch is the merge target, not `main`. Not exercised.
