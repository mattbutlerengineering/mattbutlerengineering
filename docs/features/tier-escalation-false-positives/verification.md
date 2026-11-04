---
stage: verify
run: feature:tier-escalation-false-positives
date: 2026-11-02
assumptions:
  - "Re-run on current origin/main (`6e9adc880`, the run branch's code). The PRD's criterion 1 is graded as the Owner amended it on 2026-10-18: #6610 classifying T4 (1004 counted lines: 988 code + 16 in `services/reservations/CLAUDE.md`) is correct, and `CLAUDE.md`/`AGENTS.md` stay counted. prd.md's checkbox text still says 'T3'; the amendment lives in autorun-brief.md § Verify decisions 2026-10-18."
  - "The 2026-10-18 verification.md (local branch `docs/tier-escalation-close`) was used only as the criteria list and check-method template. All evidence below comes from commands run on 2026-11-02."
  - "Real-PR replays extract the Classify heredoc from `.github/workflows/tier-classifier.yml` as `scripts/__tests__/tier-classifier-workflow.test.mjs` does (first `node - <<'NODE'` to closing `NODE`), substituting temp paths for `/tmp/changed-files.txt` and `/tmp/numstat.txt`, and substituting the `/tmp/tier-policy/tier-escalation.mjs` import for the worktree's `scripts/tier-escalation.mjs`. The worktree is origin/main, so this is the same bytes the Load step would `git show` from the base branch. Inputs: each PR's real title, body and fork flag (`gh api repos/.../pulls/N`) and per-file additions (`gh api --paginate .../pulls/N/files`) as the `git diff --numstat` stand-in."
  - "The post-#6701 count is of PRs with a `**Classified as` github-actions comment, which the workflow's last step posts only after Classify succeeds. Run records alone do not name the PR (`pull_requests` is empty on 1270 of 1271 successful pull_request runs), so the count joins runs to PR comments. Comments were read repo-wide with `issues/comments?since=2026-10-15T14:03:57Z`. A count only: no true/false-positive judging (Operate's job)."
  - "Workflow runs were listed with one `created=START..END` query per UTC day, 2026-10-15..2026-11-03. A single paginated query is capped at 1000 results by the API and silently dropped everything before 2026-10-25."
  - 'Typecheck counted as not applicable and not run. `@mbe/scripts` defines no typecheck script (2026-10-18 recorded `Command "scripts" not found`); I did not re-run it. The full `pnpm --dir scripts test` and a full-repo lint/typecheck were not run (see Not verified).'
---

# Verification: Tier escalation counts only real review surface

## Summary

All 6 PRD criteria PASS (criterion 1 under the Owner's 2026-10-18 amendment). The 4 breakdown-only acceptance items PASS, and the 3 #7078 checks PASS. Nothing FAILs.

Two criteria failed on 2026-10-18 and now pass:

- **Criterion 1 (#6610):** the Owner amended it. The real #6610 file list classifies T4 (1004 counted), and the corrected fixtures pin that.
- **Criterion 4 (replay):** its only failing part was the #6610 non-change, now accepted.

The fail-closed / `ERR_MODULE_NOT_FOUND` finding is also resolved. #7078 (`79b02e565`, merged 2026-10-22T21:09:34Z) loads the policy from the base branch. The classifier ran on 911 successful runs after the merge, with 0 Classify failures.

Things recorded rather than graded:

- The replay CLI died once with a transient `HTTP 401` and passed on the second attempt.
- `Resolve PR metadata` still runs PR-head code that feeds the tier (for Review).
- `workflow_dispatch` runs on branches cut before #7078 still run the old YAML.

## What changed since 2026-10-18, and why

- **#7078 `79b02e565`** changed 4 files: `tier-classifier.yml` (+20/-), `docs/change-tiers.md` (+1), `tier-classifier-workflow.test.mjs` (+141), `tier-escalation.test.mjs` (+17).
  - New `Load tier policy from base branch` step, before Classify: `git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs" > /tmp/tier-policy/tier-escalation.mjs`. Classify imports that copy.
  - New T4 path rule: `scripts/tier-escalation.mjs` → `tier-escalation policy edit (merge-gate policy)`.
  - The #6610 fixtures now carry the real shape (988 + 16 = 1004) and assert T4.
- Why: the 2026-10-18 Verify found the workflow imported the policy module from the PR-head checkout, with no path rule on that file. A PR could therefore rewrite the policy and lower its own tier. It also found `ERR_MODULE_NOT_FOUND` on branches cut before #6701. The Owner's decisions 3-5 ordered the fix, and #7078 delivered it.
- No other commit has touched `tier-classifier.yml` or `scripts/tier-escalation.mjs` since `79b02e565`: `git log --oneline 79b02e565..HEAD -- .github/workflows/tier-classifier.yml scripts/tier-escalation.mjs` printed nothing.

## Criteria & evidence

### 1. (as amended) #6610's file list classifies T4; #6591's stays T4; #6541's body no longer escalates on "credentials or CI/artifact access"

- Check: ran the real Classify heredoc from the workflow on each PR's real title, body, fork flag and per-file additions (see assumptions): `node /tmp/vte/run.mjs 6610 6591 6541`.
- Evidence:
  ```
  ### PR #6610 (files=33, additions total=2198)
  Classified: tier:critical (T4)
    - `llms-full.txt` -> T1: auto-generated llms.txt
    - `services/reservations/src/middleware/require-manage-token.ts` -> T3: service route or middleware
    - escalate one tier: 1004 review-surface lines added (generated files excluded)

  ### PR #6591 (files=55, additions total=2777)
  Classified: tier:critical (T4)
    - `.changeset/rialto-locale-context.md` -> T1: markdown only
    - `apps/hospitality/src/App.tsx` -> T2: app code
    - `package.json` -> T3: root deps or lockfile
    - escalate one tier: 1495 review-surface lines added (generated files excluded)

  ### PR #6541 (files=19, additions total=1332)
  Classified: tier:standard (T2)
    - `apps/hospitality/src/components/DashboardLayout.module.css` -> T2: app code
  ```
  #6541's body still carries the sentence (`jq -r .body | grep -n`): `45:`E2E_AUTH0_*` credentials or CI/artifact access, so the fold-budget guard`
  The 16 lines that tip #6610 over 1000 (`jq` on its files): `16	services/reservations/CLAUDE.md`.
- Evidence (pins in the tests now match the real shape):
  ```
  ✓ ... tier-escalation.test.mjs > countReviewSurfaceAdditions / decideSizeEscalation > #6610: 988 code + 16 CLAUDE.md lines = 1004 counted, generated excluded -> escalates
  ✓ ... tier-classifier-workflow.test.mjs > ... > #6610 shape: 988 code + 16 CLAUDE.md lines = 1004 counted escalates T3 to T4
  ```
- Result: **PASS** (as amended)
  - #6610 → T4 at 1004 counted lines, the accepted verdict.
  - #6591 → T4.
  - #6541 → T2, with no keyword escalation.

### 2. "we leaked the Stripe key and must rotate it" still escalates to T4

- Check: ran the sentence as the PR body (title `fix: thing`) through the real Classify step with a T3, a T2 and a T1 path, and called the module directly (`node /tmp/vte/leak.mjs`).
- Evidence:
  ```
  ### leak sentence, file=services/payments/src/routes/charge.ts
  Classified: tier:critical (T4)
    - `services/payments/src/routes/charge.ts` -> T3: service route or middleware
    - escalate to T4: title/body mentions secrets or incident (sensitive path already matched)
  ### leak sentence, file=apps/hospitality/src/App.tsx
  Classified: tier:sensitive (T3)
    - escalate one tier: title/body mentions secrets or incident
  ### leak sentence, file=docs/runbook.md
  Classified: tier:standard (T2)
    - escalate one tier: title/body mentions secrets or incident
  module: pathTier=2 {"action":"bump","reason":"escalate one tier: title/body mentions secrets or incident"}
  module: pathTier=3 {"action":"hardset-T4","reason":"escalate to T4: title/body mentions secrets or incident (sensitive path already matched)"}
  ```
- Result: **PASS**, under the reading recorded on 2026-10-18 and carried over unchanged. The sentence always escalates, and it lands T4 with a T3/T4 path. It does not reach T4 on a non-sensitive PR, which matches the breakdown's wording ("escalation that lands T4") and the pre-#6701 behaviour.

### 3. Both decisions live in `scripts/tier-escalation.mjs`, unit-tested, and the workflow calls the module instead of inline logic

- Check: read the workflow (`cat -n .github/workflows/tier-classifier.yml`) and ran the tests.
- Evidence (workflow):
  ```
  156:          const escalation = await import(pathToFileURL('/tmp/tier-policy/tier-escalation.mjs').href);
  238:          const kw = escalation.decideKeywordEscalation({ title, bodyProse, pathTier });
  277:          const size = escalation.decideSizeEscalation({ files: additions, highestTier: highest });
  ```
  Evidence (tests):
  ```
  ✓ ... tier-classifier delegates escalation to scripts/tier-escalation.mjs (#6655) > the workflow loads the module instead of inlining the policy
  ✓ ... tier-escalation.test.mjs > decideKeywordEscalation > #6541: descriptive credential mention does not escalate
  ```
- Result: **PASS**

### 4. Replay table over the last 300 PRs; every tier change intended or fixed; each changed case pinned by a test

- Check, part 1: the implementation PR's table. #6701's body says: `18 changed, all de-escalations, none newly escalated. Compares per-rule verdicts (path rules live in the workflow so full tiers are not recomputed).` That is a 2026-10-14 snapshot.
- Check, part 2: ran the replay CLI now, read-only, with `gh` (`node scripts/tier-escalation.mjs replay --limit 300`).
  - First attempt: exit 1 after 14m32s with a transient credential failure. `gh api graphql` and `gh auth` worked again right afterwards (`{"data":{"viewer":{"login":"mattbutlerengineering"}}}`), so it was not a code fault.
    ```
    replay failed (missing gh credential or network?): Command failed: gh pr view 7861 --json files
    HTTP 401: Requires authentication (https://api.github.com/graphql)
    ```
  - Second attempt: exit 0 after 17m13s.
    ```
    | #8166 | tier:critical | escalates -> - | 1007/43 | - -> - |
    | #8148 | tier:critical | escalates -> - | 1249/44 | - -> - |
    | #7996 | tier:critical | escalates -> escalates | 3624/2780 | escalates -> - |
    | #7713 | tier:critical | - -> - | 901/72 | escalates -> - |
    ... (25 rows in total)
    25 changed of 300 PRs replayed
    ```
    The 300 PRs are roughly #7713..#8166, so #6610 is out of window. All 25 rows are de-escalations (`escalates -> -`) or unchanged size with a keyword de-escalation (#7996). None is newly escalated.
- Check, part 3: pins.
  - The 2026-10-18 failure was #6610 "unchanged and unreconciled". The Owner accepted that verdict, and #7078 corrected the fixture to the real shape (criterion 1).
  - Other changed shapes (generated-file churn, descriptive keyword prose) are pinned by shape, not by PR number: `grep -n "6610\|6541\|6591"` finds the number only for #6610, #6541 and #6591.
- Result: **PASS** under the amendment.
  - Caveat: only 3 PRs are pinned by number; the rest by shape. This is the same coverage the 2026-10-18 run accepted as "met by shape".
  - A fresh replay table is not in the PR description (it did not exist before this stage), so it is recorded here.

### 5. `docs/change-tiers.md` states that generated files don't count toward size escalation

- Check: `grep -n "tier-escalation\|T4\b" docs/change-tiers.md` plus the doc-agreement test.
- Evidence:
  ```
  87:- Diff is > 1000 review-surface lines added (size correlates with risk). Generated files and pipeline run artifacts do not count toward the 1000 (#6655, #6610): `**/llms.txt`, `**/llms-full.txt`, `pnpm-lock.yaml`, `**/registry.json`, ... Other markdown still counts. The list is `EXCLUDED_FROM_SIZE` in `scripts/tier-escalation.mjs` (a test keeps this paragraph in agreement).
  ✓ ... tier-escalation.test.mjs > docs/change-tiers.md agrees with the module > names every excluded-from-size pattern
  ```
  Line 28 is the new T4 rule from #7078: `Any change to `scripts/tier-escalation.mjs`, the escalation policy `tier-classifier` applies. The workflow loads that module from the PR's **base** branch, never from the PR head, so a PR cannot edit the policy to lower its own tier; the edit itself lands T4.`
- Result: **PASS**

### 6. Named suites stay green; lint passes for affected files

- Check: from the worktree root, `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/tier-escalation.test.mjs scripts/__tests__/tier-classifier-workflow.test.mjs scripts/__tests__/tier-classifier-dispatch.test.mjs scripts/__tests__/merge-queue-tier-race.test.mjs --reporter=verbose`, then `pnpm exec eslint scripts/tier-escalation.mjs scripts/__tests__/tier-escalation.test.mjs scripts/__tests__/tier-classifier-workflow.test.mjs`.
- Evidence:
  ```
   Test Files  4 passed (4)
        Tests  93 passed (93)
   Duration  73.29s
  exit=0
  ```
  Lint: no output, `lint-exit=0`.
- Result: **PASS** for tests and lint. Typecheck is not applicable (see assumptions).

### Breakdown AC: a thrown module error fails the step (fail-closed)

- Check: the workflow tests, plus every real Classify failure since #6701, with job logs read via `gh api .../actions/jobs/<id>/logs`.
- Evidence (tests):
  ```
  ✓ ... > fails closed (non-zero exit, no tier output) if the module cannot load
  ✓ ... > tier-classifier loads the escalation policy from the BASE branch > fails closed when the base branch has no policy module
  ```
- Evidence (live): of 166 failed runs since #6701, 160 have zero jobs and 6 failed in `Classify`.
  - All 6 are `ERR_MODULE_NOT_FOUND` (`Cannot find module '.../scripts/tier-escalation.mjs'`).
  - All 6 are dated 2026-10-15 or 2026-10-16, before #7078. Run ids: 38748399778, 38834995295, 38835986220, 38836482273, 38837058353, 38838096887.
  - After 2026-10-22T21:09:34Z there are 0 Classify failures. The 99 failures after that time are all zero-job runs.
- Result: **PASS**. The module-load failure mode is gone, because the base branch always has the module; see the #7078 section.

### Breakdown AC: replay CLI fails loud without a credential and prints "0 changed" explicitly

- Evidence:
  ```
  ✓ ... tier-escalation.test.mjs > replay > prints an explicit 0 changed line
  ✓ ... tier-escalation.test.mjs > replay > fails loud (non-zero, message) when the API is unavailable
  ✓ ... tier-escalation.test.mjs > replay > reports a PR whose size verdict changes
  ```
  The live 401 above also failed loud: exit 1 with `replay failed (missing gh credential or network?)`.
- Result: **PASS**

### Breakdown AC: #5956 hyphen and code-span guards preserved; keyword plus sensitive path → hardset-T4

- Evidence:
  ```
  ✓ ... decideKeywordEscalation > hyphenated identifiers and code spans never count (#5956)
  ✓ ... decideKeywordEscalation > keyword plus sensitive path hard-sets T4, even for descriptive prose
  ```
- Result: **PASS**

### Breakdown AC: adapter swap and docs items

- The workflow test, dispatch test and `merge-queue-tier-race` test are green (criterion 6). The doc-agreement test is green (criterion 5).
- Result: **PASS**

## #7078 checks (Owner decisions 3-5 of 2026-10-18)

### A. The workflow loads the policy from the base branch, not the PR head

- Check: read the workflow and ran its tests.
- Evidence (workflow, lines 78-90, 154-156):
  ```
  - name: Load tier policy from base branch
    env:
      PR_BASE_REF: ${{ steps.pr.outputs.base_ref }}
    run: |
      set -euo pipefail
      mkdir -p /tmp/tier-policy
      git show "origin/${PR_BASE_REF}:scripts/tier-escalation.mjs" > /tmp/tier-policy/tier-escalation.mjs
  ...
  // Base-branch copy written by "Load tier policy from base branch";
  // never the PR-head checkout's scripts/tier-escalation.mjs.
  const escalation = await import(pathToFileURL('/tmp/tier-policy/tier-escalation.mjs').href);
  ```
  Evidence (tests):
  ```
  ✓ ... > tier-classifier loads the escalation policy from the BASE branch > writes the base-ref policy, not the PR head's edit
  ✓ ... > fails closed when the base branch has no policy module
  ✓ ... > Classify imports the base-ref copy, never the PR-head checkout's module
  ✓ ... > the load step runs after PR metadata resolves and before Classify
  ```
- Result: **PASS**

### B. A policy edit lands T4

- Check: workflow line 114, `{ tier: T4, when: (f) => f === 'scripts/tier-escalation.mjs', why: 'tier-escalation policy edit (merge-gate policy)' }`. I ran a one-file PR (`scripts/tier-escalation.mjs`, +3/-1, empty body) through the real Classify step.
- Evidence:
  ```
  ### policy edit only (scripts/tier-escalation.mjs, 3 lines)
  Classified: tier:critical (T4)
    - `scripts/tier-escalation.mjs` -> T4: tier-escalation policy edit (merge-gate policy)
  ### workflow edit only
  Classified: tier:critical (T4)
    - `.github/workflows/tier-classifier.yml` -> T4: merge-gate workflow edit
  ✓ ... > a PR editing scripts/tier-escalation.mjs lands T4
  ```
  No merged PR has edited the policy since #7078 (`git log 79b02e565..HEAD -- scripts/tier-escalation.mjs` is empty), so there is no live T4-by-policy-edit run to cite. The check is by the real Classify step plus the test.
- Result: **PASS**

### C. Real `tier-classifier.yml` runs after 2026-10-22T21:09:34Z

- Check: all runs listed day by day (`gh api repos/.../actions/workflows/tier-classifier.yml/runs?created=A..B`) and each successful run's steps read via `.../actions/runs/<id>/jobs`.
- Evidence (1291 runs after the merge):
  ```
  821 pull_request success
   90 workflow_dispatch success
  276 pull_request action_required
   99 pull_request failure
    4 pull_request cancelled
    1 workflow_dispatch cancelled
  ```
  The step table for the 911 successful runs shows `Load tier policy from base branch`, `Classify` and `Apply tier label` all `success` on 910 of them.
  ```
  910 success success success
    1 (no Load step) success success
  ```
  The one exception is run 39855311249 (2026-10-22T21:12:14Z, `workflow_dispatch` on `automation/visual-baseline-regen/hospitality`). Dispatched runs take the workflow from the dispatched ref, and that ref predates #7078, so it ran the old YAML. The Load step is absent, and `Classify` and `Apply tier label` still succeeded.
  - Runs checked by log:
    - Run 39871264740 (2026-10-22T23:21:45Z, `chore/loop-session-artifacts`): `Load tier policy from base branch=success, Classify=success, Apply tier label=success`, and `Classified: tier:trivial (T1)`.
    - Run 41573767761 (PR #8170, `metrics/progress-tracker-2026-11-03`): same steps, `Classified: tier:trivial (T1)`.
  - `ERR_MODULE_NOT_FOUND`: 0 recurrences after the merge (the only 6 are from 2026-10-15..16).
  - Tier labels applied by post-#7078 classifier comments (last comment per PR, 531 PRs): `186 tier:standard · 178 tier:trivial · 130 tier:sensitive · 37 tier:critical`.
- Result: **PASS**

## Operate's minimum signal (count only)

Source: classifier comments (`**Classified as \`tier:...\``) created by github-actions on PRs since #6701 merged (2026-10-15T14:03:57Z), 1414 comments read via `gh api --paginate "repos/.../issues/comments?since=2026-10-15T14:03:57Z"`.

```
1414 classifier comments on 885 distinct PRs since 2026-10-15T14:03:57Z
last label per PR: tier:trivial 329 · tier:standard 310 · tier:sensitive 197 · tier:critical 49
since #7078 (2026-10-22T21:09:34Z): 911 comments on 531 distinct PRs
  last label per PR: tier:standard 186 · tier:trivial 178 · tier:sensitive 130 · tier:critical 37
```

Run totals since #6701 from the day-by-day listing: 1890 runs, 2026-10-15T14:06:06Z to 2026-11-03T03:42:12Z, and 1271 successful `pull_request` plus 137 `workflow_dispatch` runs. No true/false-positive judging was done.

## Observation for Review (not graded, not fixed)

PR #7078's body says: "Not in scope: the `Resolve PR metadata` step also runs `scripts/resolve-pr-metadata.mjs` from the PR-head checkout. This PR does not change that."

- Confirmed in the workflow: line 64 is `run: node scripts/resolve-pr-metadata.mjs --pr "$PR_NUMBER" >> "$GITHUB_OUTPUT"`, after the PR-head checkout (line 53).
- The script's output feeds the tier:
  - `title`, `body` and `is_fork` go into Classify (lines 95-97).
  - `base_ref` goes into the diff step (line 69) and the base-branch Load step (line 86).
  - `formatPrMetadataOutputs` emits `title`, `body`, `head_sha`, `base_ref` and `is_fork`.
- No path rule matches `scripts/resolve-pr-metadata.mjs`. The `scripts/check-` T3 rule does not, so an edit to it classifies by default T2, or by whatever else the PR touches.
- So **a PR-head copy of that script can affect the tier**: it can forge the keyword inputs, `is_fork`, and the `base_ref` used for the diff and for the policy load.
- I did not build an exploit; this is read from code, an `[INFERENCE]` about reachability. For Review to decide.

## Failures

None.

## Not verified

- The full `pnpm --dir scripts test` and the full-repo `pnpm lint && pnpm typecheck && pnpm test` were not run. I ran the four named suites (93 tests) and eslint on the three touched scripts files. #6701 and #7078 touch only `scripts/`, `.github/` and `docs/`, and `@mbe/scripts` has no typecheck script (not re-checked now).
- Real-PR replays use REST per-file additions as the `git diff --numstat` input, as before. On the runner the two can differ for a PR whose base has moved, and binary files give `-` in numstat. Neither case was exercised.
- A live run proving T4 on a policy-file edit: none exists on `main`. See #7078 check B.
- Classification counts come from classifier comments joined by PR. Run records do not name PRs, so the 885 and 531 figures are PR counts, not run counts, and they include PRs that were reclassified several times.
- The pre-#6701 baseline numbers and the post-ship true/false-positive hand-check from 2026-10-18 were not repeated. That judging is Operate's job.
- The fresh replay's 25 changed rows are not pinned one-by-one by tests. Pins are by shape, as accepted in 2026-10-18.
