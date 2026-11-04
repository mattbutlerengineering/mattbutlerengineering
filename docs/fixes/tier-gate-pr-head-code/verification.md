---
stage: verify
run: maintenance:tier-gate-pr-head-code
date: 2026-11-02
head: ba9d4f7acd98a26390c8fdf2d54a193f5cc386c8
assumptions:
  - "Re-run after the review fix loop. The earlier verification (c49bc07e6) graded head 0d51ed231 and is replaced; every criterion and every number below was produced on head ba9d4f7ac (Milestone 4 included). Prior evidence is kept only where it was re-run."
  - "Baseline for 'origin/main code': origin/main was re-fetched at verify time and is 49b87bdf5 (merge-base with the branch ab4a3b2bc, unchanged since the first verify). The regression ran in `git worktree add --detach /tmp/verify2-tg-main origin/main`, with node_modules and scripts/node_modules symlinked from the run worktree. The worktree was removed with `git worktree remove --force` afterwards; `git worktree list` no longer shows it."
  - "Regression method (verify skill names none): the branch's four changed/new test files were copied unchanged into the origin/main worktree and run there. This tests the new assertions against the old gate files. Failures on old code include tests that fail because the old workflow lacks the named steps and the new test harness inputs (`/tmp/numstat.txt`, `/tmp/tier-policy/`); they say 'the new design is absent', not 'each failing assertion is an independent exploit'. The exploit evidence is the reproductions."
  - "Reproduction harness: /tmp/verify2-tg-repro.mjs (not committed; extends the earlier /tmp/verify-tg-repro.mjs). It extracts the real `run:` bodies of origin/main's and the branch's tier-classifier.yml and runs them against a throwaway bare-origin repo. `gh` is a stub returning the honest API answer for the PR (base `main`); it stands in for the GitHub API only. Scenario A is defect.md's forged-base_ref; scenario B (new) is the rename out of auth."
  - "C14 RED method (the standing instruction allows a temp mutated copy outside the repo): the scanner test and the real .github/workflows were copied to /tmp/verify2-scan, four workflows were mutated there with js-yaml (one extra step each), and the suite was run there. Nothing in the run worktree was mutated, so there was nothing to revert; `git status --porcelain` was empty afterwards. The temp dir was deleted."
  - "'Eight suites' = resolve-pr-metadata, tier-escalation, wait-for-tier-label, tier-classifier-dispatch, merge-queue-tier-race, merge-queue-eligibility, tier-classifier-workflow, pull-request-target-no-head-execution."
  - "actionlint scope: the three workflows named in the assignment plus dependabot-auto-merge.yml (the fourth pull_request_target workflow). The ten producer workflows were not re-run this pass; their only Milestone-4 change is a comment (`pull_request(_target)`), and the earlier pass found only two pre-existing SC2001/SC2129 notes in an untouched step of production-feedback.yml."
  - "`pnpm lint --force` and `pnpm typecheck --force` were run once each, uncached."
  - "Verdict scope: repo state and local behaviour only. Live GitHub behaviour is under Not verified."
---

# Verification: tier gate executes base code only; PR head is data (head ba9d4f7ac)

## Summary

All 14 criteria PASS locally on head `ba9d4f7ac`. No failures.

- The eight suites pass: **236 / 236** (was 213 across seven suites before the review fixes).
- Regression: the four changed/new test files **fail 42 of 185 against origin/main's gate files and pass 185/185 on the branch** (the new scanner suite cannot even load on origin/main, because `auto-merge.yml` is not a `pull_request_target` workflow there).
- Reproductions with the real step bodies:
  - forged `base_ref`: **T1 on origin/main's workflow, T4 on the branch's**.
  - rename out of `services/users/src/auth/` into `docs/`: **T1 on origin/main's workflow, T4 on the branch's**.
- The new `pull-request-target-no-head-execution` scanner goes **RED on all four `pull_request_target` workflows** when a head-executing step is added to a temp copy, and is green on the real files.

Live `pull_request_target` behaviour, fork `refs/pull/N/head` fetch, the fix PR's own classification, real dispatch and branch protection are not verifiable locally (Not verified).

## Criteria & evidence

### C1. No step under `pull_request_target` checks out or executes PR-head files (architecture invariant 1)

- Check: grep the three workflows for `ref:`/`repository:` and `git checkout|switch|merge|worktree`; run the real step bodies in a throwaway repo whose PR ref carries a forged resolver (C2); the scanner suite (C14) over every `pull_request_target` workflow.
- Evidence:

  ```
  .github/workflows/tier-classifier.yml:22:  pull_request_target:
  .github/workflows/auto-merge.yml:10:  pull_request_target:
  .github/workflows/merge-queue.yml:10:  pull_request_target:
  $ grep -n -E "^\s+(ref|repository):" tier-classifier.yml auto-merge.yml merge-queue.yml
  (no output, exit 1)
  $ grep -n -E "^\s+(run:.*)?git (checkout|switch|merge|worktree)" tier-classifier.yml
  (no output, exit 1)
  ```

  Harness: `HEAD on disk: main e0fc1bb | forged resolver on disk: 0` for the branch workflow.

- Result: PASS

### C2. `base_ref` comes from base-side code (defect reproduction: forged `base_ref` → T1)

- Check: `/tmp/verify2-tg-repro.mjs` scenario A. Bare origin with `main` (real resolver/policy), `shadow` (adds `services/users/src/auth/session.ts` and a neutered policy) and `feat` = `shadow` + `docs/note.md` + a forged `scripts/resolve-pr-metadata.mjs` printing `base_ref=shadow`; `refs/pull/7/head` = `feat`. The real step bodies of origin/main's workflow (PR head checked out) and the branch's (base checkout, head fetched as data) run in order.
- Evidence:

  ```
  ##### origin/main workflow (PR head checked out, resolver runs from the PR)
  checkout: git checkout -q 0ac9128ae580c53640837c5368df38296b10130f
  HEAD on disk: HEAD 0ac9128 | forged resolver on disk: 2
  [Resolve PR metadata] base_ref=shadow head_sha=0ac9128 (exit 0)
     changed files: docs/note.md, scripts/resolve-pr-metadata.mjs
  [Classify] exit 0
     Classified: tier:trivial (T1)
       - `docs/note.md` -> T1: markdown only

  ##### branch workflow (base-only checkout; PR head fetched as data)
  checkout: git checkout -q main
  HEAD on disk: main e0fc1bb | forged resolver on disk: 0
  [Resolve PR metadata] base_ref=main head_sha=0ac9128 (exit 0)
  [Fetch PR head as data] exit 0 ... * branch  refs/pull/7/head -> FETCH_HEAD
     changed files: docs/note.md, scripts/resolve-pr-metadata.mjs, scripts/tier-escalation.mjs, services/users/src/auth/session.ts
  [Classify] exit 0
     Classified: tier:critical (T4)
       - `docs/note.md` -> T1: markdown only
       - `scripts/resolve-pr-metadata.mjs` -> T4: merge-gate script edit (resolves the PR metadata the classifier trusts)
  ```

- Result: PASS

### C3. Permissions not broader than on origin/main

- Evidence:
  ```
  tier-classifier: top-level permissions identical
  auto-merge: top-level permissions identical
  merge-queue: top-level permissions identical
  $ git diff <merge-base> HEAD -- .github/workflows | grep -E '^\+\s+(contents|pull-requests|issues|actions|checks|statuses|id-token|packages):'
  (no output, exit 1)
  ```
- Result: PASS

### C4. No PR-derived string interpolated into a `run:` body

- Check: awk scan of `run:` bodies of the three workflows for `${{`, plus trust-seam test (e) in `tier-classifier-workflow.test.mjs`.
- Evidence: awk over tier-classifier.yml, auto-merge.yml, merge-queue.yml prints nothing. The test suite is green (C9).
- Result: PASS

### C5. Fail closed on resolver/fetch error

- Evidence (branch run, `tier-classifier-workflow.test.mjs`):
  ```
  ✓ fails closed when the base branch has no policy module
  ✓ fails when the fetched tip is not the resolved head_sha
  ✓ fails when the PR ref cannot be fetched
  ✓ fails when the head shares no ancestor with origin/<base_ref>
  ```
  A failed step means no Classify and no label; `merge-queue-eligibility` fails closed without a label.
- Result: PASS

### C6. Dispatch pinned to the default branch

- Evidence:
  ```
  ✓ fails a dispatch run from a non-default ref
  ✓ passes a dispatch run from the default branch
  ✓ passes a non-dispatch event regardless of ref
  ✓ only runs for workflow_dispatch
  $ git grep -n "tier-classifier.yml --ref" .github/workflows      (no output)
  $ git grep -n -E "only triggers on .pull_request" .github/workflows   (no output)
  ```
  `tier-classifier-dispatch.test.mjs (16 tests)` green.
- Result: PASS

### C7. Arming workflows off PR-head execution

- Evidence: `merge-queue-eligibility.test.mjs (92 tests)` and `merge-queue-tier-race.test.mjs (9 tests)` green; the six `runs base code only (pull_request_target)` assertions (trigger, header rule, no bare `"pull_request"` literal; both files) fail on origin/main (Regression). `git grep -n "'pull_request'\|\"pull_request\"" auto-merge.yml merge-queue.yml` prints nothing.
- Result: PASS

### C8. T4 rules for the four gate files; docs don't overclaim

- Evidence: `tier-classifier path rules: merge-gate files are T4` green for `scripts/resolve-pr-metadata.mjs`, `scripts/merge-queue-eligibility.mjs`, `auto-merge.yml`, `merge-queue.yml`, plus near-miss cases. `docs/change-tiers.md:27-29` lists the four paths and states the real basis ("`tier-classifier` runs on `pull_request_target`, so the workflow file and every step run from the base side …"). `git grep -n -i "PR-head checkout" .github/workflows/tier-classifier.yml` prints nothing.
- Result: PASS

### C9. Final gate

- Check: on head ba9d4f7ac in the run worktree.
- Evidence:

  ```
  ✓ scripts/__tests__/wait-for-tier-label.test.mjs (6 tests)
  ✓ scripts/__tests__/tier-classifier-dispatch.test.mjs (16 tests)
  ✓ scripts/__tests__/tier-escalation.test.mjs (16 tests)
  ✓ scripts/__tests__/pull-request-target-no-head-execution.test.mjs (18 tests)
  ✓ scripts/__tests__/resolve-pr-metadata.test.mjs (2 tests)
  ✓ scripts/__tests__/merge-queue-tier-race.test.mjs (9 tests)
  ✓ scripts/__tests__/merge-queue-eligibility.test.mjs (92 tests)
  ✓ scripts/__tests__/tier-classifier-workflow.test.mjs (77 tests)
   Test Files  8 passed (8)
        Tests  236 passed (236)

  eslint (4 changed/new test files): exit 0, no output
  prettier --check (all changed .mjs/.md/.yml vs merge-base): All matched files use Prettier code style!
  actionlint tier-classifier.yml auto-merge.yml merge-queue.yml: exit 0, no output
  actionlint dependabot-auto-merge.yml: exit 0, no output
  pnpm lint --force:      Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total
                          (0 errors; 232+182+165+108+2 warnings in hospitality/rialto/rialto-web/gen/auth, none in touched files)
  pnpm typecheck --force: Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total
  ```

- Result: PASS

### C10. Renames count old and new paths

- Check: behavioural test (real `git mv` in a fixture, real fetch and diff step bodies, real Classify) plus the scenario-B reproduction.
- Evidence:

  ```
  ✓ a rename out of an auth path counts the old path (not T1)      [expects tier >= 3 and reasons to contain services/users/src/auth/m.ts]

  ##### scenario B: rename services/users/src/auth/session.ts -> docs/session.md
  origin/main workflow:
     changed files: docs/session.md
     Classified: tier:trivial (T1)
       - `docs/session.md` -> T1: markdown only
  branch workflow:
     changed files: docs/session.md, services/users/src/auth/session.ts
     Classified: tier:critical (T4)
       - `docs/session.md` -> T1: markdown only
       - `services/users/src/auth/session.ts` -> T4: auth-critical code path
  ```

- Result: PASS

### C11. Non-ASCII, tab, quote and backslash paths match their T-rules (raw, `-z`)

- Evidence (`changed-file list covers every touched path, unquoted`):
  ```
  ✓ a non-ASCII path matches its rule instead of arriving C-quoted   [infrastructure/pulumi/é.ts -> tier 4, reason "pulumi infra change"]
  ✓ tab, quote and backslash names are raw and classify by their rule [services/users/src/auth/a<TAB>b"c\d.ts -> tier 4]
  ```
  Both fail on origin/main (Regression), there because the `Fetch PR head as data` step they run does not exist. The behavioural failure on the pre-fix branch workflow was recorded in breakdown.md Milestone 4 (`expected 2 to be 4`: default T2, the quoted path missed every `^` rule); that run was not repeated here. `tier-classifier.yml` uses `git diff --no-renames --no-ext-diff --no-textconv -z`.
- Result: PASS

### C12. A control-character filename cannot inject `$GITHUB_OUTPUT` or comment lines; the label stays correct

- Check: a file named `services/users/src/auth/x\ntier=1\nlabel=tier:trivial` through the real fetch, diff and Classify bodies.
- Evidence:
  ```
  ✓ a newline in a path cannot inject $GITHUB_OUTPUT lines
    expect(tier).toBe(4)
    expect(lines).toHaveLength(3)                         [output has exactly three lines]
    expect(lines.map(l => l.split("=")[0])).toEqual(["tier","label","reasons"])
  ```
  Classify's `show()` escapes `[\x00-\x1f\x7f]` to `\xNN` before any path reaches reasons (the source of both `$GITHUB_OUTPUT` and the comment body); rules match the raw path, so the label is the auth-path tier (T4), not the injected `tier:trivial`. Fails on origin/main (Regression, missing step); the pre-fix branch RED (`expected 2 to be 4`) is from breakdown.md Milestone 4, not re-run.
- Result: PASS

### C13. Size rule counts correctly under `--no-renames`

- Evidence:
  ```
  ✓ size rule: --no-renames counts a moved file as additions on the new path
    numstat (NUL records) == ["0\t20\tservices/users/src/auth/m.ts", "20\t0\tdocs/m.md"]
  ```
  The test fails on origin/main (Regression, missing step). The pre-fix branch RED (`expected [ Array(1) ] to deeply equal [ …(2) ]`, a single `services/… => docs/m.md` record) is from breakdown.md Milestone 4, not re-run; the scenario-B reproduction shows the old `--name-only` output losing the old path. The `-z` numstat parse in Classify takes `path` after the second TAB per record.
- Result: PASS

### C14. `pull-request-target-no-head-execution` flags PR-head execution in any `pull_request_target` workflow

- Check: the suite parses every `pull_request_target` workflow (discovered by trigger, currently `auto-merge`, `dependabot-auto-merge`, `merge-queue`, `tier-classifier`) and scans every step. GREEN on the real files (18 tests). RED: temp copy at /tmp/verify2-scan (outside the repo) with one step appended to each of the four workflows.
- Evidence (mutated copy):

  ```
   × auto-merge.yml has no head-executing step
   × dependabot-auto-merge.yml has no head-executing step
   × merge-queue.yml has no head-executing step
   × tier-classifier.yml has no head-executing step
   × passes the unmutated copy                              (consequence: its base file is the mutated auto-merge.yml)
   × allows data-only git use and base-checkout node scripts (same cause)
  +   "evaluate[3] evil: gh pr checkout",                          (auto-merge.yml)
  +   "auto-merge[5] evil: package-manager run",                   (dependabot-auto-merge.yml, `pnpm install`)
  +   "auto-merge[2] evil: actions/checkout sets with.ref",        (merge-queue.yml)
  +   "classify[10] evil: git switches/merges PR objects into the working tree",   (tier-classifier.yml)
   Test Files  1 failed (1)
        Tests  6 failed | 12 passed (18)
  ```

  Mutations: `gh pr checkout "$PR_NUMBER"`, `actions/checkout` with `ref: refs/pull/1/head`, `git fetch … && git switch --detach FETCH_HEAD`, `pnpm install --frozen-lockfile`. The suite also holds 11 in-memory mutation cases (green on the real files). Without the scan, the previous text-pin tests stayed green on such a step (Milestone 4 record). On origin/main the suite fails to load (`TypeError: Cannot read properties of undefined (reading 'text')`): `auto-merge.yml` is not `pull_request_target` there. Run worktree status after the mutation run: clean.

- Result: PASS

## Regression: fails on origin/main, passes on the branch

`tier-classifier-workflow`, `tier-classifier-dispatch`, `merge-queue-eligibility` and `pull-request-target-no-head-execution` test files from the branch ran in `git worktree add --detach /tmp/verify2-tg-main origin/main` (49b87bdf5):

```
 Test Files  4 failed (4)
      Tests  42 failed | 143 passed (185)

 ❯ tier-classifier-dispatch.test.mjs (16 tests | 2 failed)
     × triggers on pull_request_target (base-side workflow file), same types
     × no `gh workflow run tier-classifier.yml` line passes --ref
 ❯ pull-request-target-no-head-execution.test.mjs (0 test)      TypeError: Cannot read properties of undefined (reading 'text')
 ❯ merge-queue-eligibility.test.mjs (92 tests | 6 failed)
     × auto-merge.yml / merge-queue.yml: triggers on pull_request_target and never on pull_request / carries a header comment ... / compares the event name to pull_request_target ...   (3 each)
 ❯ tier-classifier-workflow.test.mjs (77 tests | 34 failed)
     × trust seam: base-only execution (a), (b)
     × trust seam: PR head is fetched as data and diffed (4: diff, tip mismatch, unfetchable ref, no ancestor)
     × changed-file list covers every touched path, unquoted (5: rename, non-ASCII, tab/quote/backslash, newline, size rule)
     × Pin dispatch to the default branch (4)
     × merge-gate files are T4 (4 + 1 near-miss)
     × 14 further tests that read the new harness inputs (/tmp/numstat.txt, /tmp/tier-policy): keyword escalation (1), hyphenated identifiers (6), ACMM output (4), delegated escalation (2), base-branch policy (1)
```

The same four files on the branch: 16 + 18 + 92 + 77 = 203 tests plus the other four suites, 236 / 236 pass (C9).

Of the 42, 28 are the behaviours this fix adds (trust seam, dispatch, T4 rules, arming workflows, the five Milestone-4 path/size cases, scanner load). The other 14 fail because the new harness feeds the classifier through `/tmp/numstat.txt` and `/tmp/tier-policy/`, which origin/main's step layout does not produce. They are failures of "old step layout vs new tests", not independent exposures. The exposures are the two reproductions (C2 and C10).

Trust-seam invariants (c) no checkout/merge/switch/worktree, (d) `base_ref` only from `steps.pr.outputs.base_ref`, (e) no `${{ }}` in `run:` bodies are not red on origin/main. They guard against regression and are not themselves the regression.

## Failures

none.

## Not verified

- **Live `pull_request_target` behaviour on GitHub.** The workflow file actually taken for a PR whose base is not the default branch, the token's permissions and the label landing. No dispatch, push or PR was allowed; the harness replaces GitHub with a bare repo and a `gh` stub. Check the label on the first PR after merge.
- **Fork PRs fetching `refs/pull/N/head`.** Exercised against a local bare origin only. That the job token can fetch it for a fork PR is documented GitHub behaviour, not run.
- **The fix PR's own classification.** Expected: no automated `tier:*` label; Matt applies `tier:critical` by hand (architecture.md § Migration, [INFERENCE] from the trigger rules). Cannot be observed before the PR exists.
- **`workflow_dispatch` from a non-default ref on GitHub.** Only the guard step body was run, with a faked `github.ref`. The residual risk of a writer dispatching a modified copy from their own branch is accepted in architecture.md.
- **Branch protection state** (`CI Gate` only, no required reviews). Out of scope, carried unverified from the origin review.
- **A PR retargeted to a non-default base branch the attacker controls.** `base_ref` then honestly resolves to that branch. Not exercised.
- **Git behaviour differences across runner git versions** for `-z --no-renames` output. Local git only.
- **Producer workflows' actionlint** was not re-run this pass (see assumptions).
