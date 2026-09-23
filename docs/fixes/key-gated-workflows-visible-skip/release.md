---
stage: ship
run: maintenance:key-gated-workflows-visible-skip
date: 2026-09-23
release-mode: prepare-and-stop
released: false
pr: 5704
pr-url: https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5704
code-sha: 067cad409503a3128291389e9a8e2e07525f1d45
ci-gate: "success — CI run 35900040290, CI Gate job 107319671248 (completed 2026-09-23T18:21:05Z), commit status `CI Gate: success` on 067cad409"
assumptions:
  - "Release authorization is prepare-and-stop (autorun brief). This stage opened the PR and nothing else: no merge, no auto-merge, no deploy, no tag, no workflow dispatch, no run approval."
  - "Branch is 1 commit behind origin/main (148887889, rialto Popover, #5702) with no conflict (`git merge-tree` clean) and no overlap with the touched paths. `main` is not `strict` (gotchas § CI), so the branch was NOT updated; the PR reported mergeStateStatus CLEAN."
  - "#3585 is referenced with `Refs`, never `Closes`/`Fixes`: it stays open for the default-adapter question. defect.md records it as `origin`, not `intake`, so Ship closes no tracker issue."
  - "The optional pre-merge probe (review L4) was NOT run: it needs a human collaborator's review comment, which this unattended stage cannot supply. It is listed below as an optional step for Matt."
  - "Committing this release.md pushes a docs-only commit to the PR, which starts a fresh CI run on the new head. The CI Gate conclusion recorded here is for the code SHA 067cad409; the post-push head's CI is noted in the Release log as observed at write time."
---

# Release: key-gated agent workflows skip visibly instead of passing green (#3585 Option C)

**Status: PREPARED, NOT EXECUTED.** PR #5704 is open, green, and unmerged.
Nothing has reached `main`. Merging is Matt's step (below).

## Pre-flight

- [x] **Verification green.** `verification.md`: 8 PASS / 0 FAIL / 3 not
      provable pre-merge. `review.md`: verdict `ready-to-ship`,
      `unfixed-critical: 0`. The one medium (M1) is fixed in 3ce70799e.
- [x] **Branch vs main**, re-measured at Ship:
  ```
  $ git fetch origin main
     198563827..148887889  main       -> origin/main
  $ git rev-list --left-right --count origin/main...HEAD
  1	6
  $ git merge-tree --write-tree origin/main HEAD >/dev/null && echo "merge-tree: clean"
  merge-tree: clean
  $ git log --oneline 198563827..origin/main
  148887889 fix(rialto): trap focus and set aria-modal on Popover (#5702)
  $ git ls-remote origin refs/heads/fix/key-gated-workflows-visible-skip
  067cad409503a3128291389e9a8e2e07525f1d45	refs/heads/fix/key-gated-workflows-visible-skip
  ```
  The branch is 1 behind (an unrelated rialto change under `packages/rialto/`) and 6 ahead, with no conflict.
- [x] **Workflow tests + actionlint**, re-run at Ship:
  ```
  $ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/claude-workflow.test.mjs scripts/__tests__/scheduled-issue-completion-workflow.test.mjs
   ✓ scripts/__tests__/claude-workflow.test.mjs (7 tests) 9ms
   Test Files  2 passed (2)
        Tests  12 passed (12)
  $ actionlint .github/workflows/claude.yml .github/workflows/scheduled-issue-completion.yml
  actionlint exit=0
  ```
- [x] **No duplicate PR** before opening:
  ```
  $ gh pr list --state open --json number,title,headRefName
  [{"headRefName":"chore/acmm-daily-audit-2026-09-23","number":5703,"title":"chore(acmm): daily audit 2026-09-23"},
   {"headRefName":"fix/5627-spend-claude-cli","number":5699,"title":"fix(metrics): stop refiling #5627 now that #3585 chose local claude-cli spend"}]
  ```
  Neither PR touches claude.yml or scheduled-issue-completion.yml.
- [x] **No secrets in diff; target config present.** A grep of
      `git diff origin/main...HEAD` for `sk_live|AKIA|BEGIN .*PRIVATE` gave exit 1
      (no match). The Gitleaks Secret Scan passed on the PR. No new secret is
      required: the change exists because CI has no `ANTHROPIC_API_KEY` by design.
- [x] **Migrations/data changes:** none. The diff is two workflow files, two
      test files, one gotchas line, and this run dir.
- [x] **Rollback plan concrete** (below).

## Rollback plan

Neither workflow deploys anything, and no secret, state, or data changes, so
rollback is a plain revert of the squash commit:

```
# after merge, find the squash commit
gh pr view 5704 --json mergeCommit --jq .mergeCommit.oid
# revert it on a branch and PR it (main is protected by CI Gate)
git fetch origin main && git switch -c revert/key-gated-workflows-visible-skip origin/main
git revert --no-edit <squash-sha>
git push -u origin revert/key-gated-workflows-visible-skip
gh pr create --base main --title "revert: key-gated agent jobs visible skip (#5704)" --body "Reverts #5704. Refs #3585."
```

The effect of a revert is that scheduled-issue-completion goes back to
reporting a green in-step skip, and claude.yml goes back to `pnpm exec mbe`
with no gate. Both are inert without a key, so a revert is safe at any time.

## Release log

1. `gh pr create --base main --head fix/key-gated-workflows-visible-skip --title "fix(ci): skip key-gated agent jobs visibly instead of green (#3585 Option C)" --body-file <scratchpad>/keygate-pr-body-ship.md`
   → `https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5704`.
   The body says `Refs #3585` (no `Closes`/`Fixes`), links the run artifacts,
   and includes the test plan with the post-merge proof steps.
2. `tier-classifier` applied **`tier:standard`** (T2: reviewer agent plus 1
   human review per `docs/change-tiers.md`). Auto-merge was not armed, per the
   authorization.
3. CI on head `067cad409` started as a normal `pull_request` event (run
   **35900040290**), not gate-missing, so no `workflow_dispatch` was needed or
   made. Polled `gh pr checks 5704` / `gh run view` for about 16 minutes:
   ```
   11:20:24 {"c":"","gate":[],"open":["Integrity"],"s":"in_progress"}
   11:20:55 {"c":"","gate":[""],"open":["Integrity","CI Gate"],"s":"in_progress"}
   11:21:27 {"c":"success","gate":["success"],"open":[],"s":"completed"}
   $ gh run view 35900040290 --json jobs --jq '.jobs[] | select(.name=="CI Gate") | {name,conclusion,completedAt,databaseId}'
   {"completedAt":"2026-09-23T18:21:05Z","conclusion":"success","databaseId":107319671248,"name":"CI Gate"}
   $ gh api .../commits/067cad409.../statuses --jq '.[] | {context,state}'
   {"context":"CI Gate","state":"success"}
   $ gh pr checks 5704 | grep -vE '\s(pass|skipping)\s'   # any non-pass, non-skip check?
   (no output; exit 1)
   $ gh pr view 5704 --json mergeStateStatus
   {"mergeStateStatus":"CLEAN"}
   ```
   **Advisory checks:** none red. Visual Regression, Hospitality E2E and
   codecov did not appear in this PR's check list (Build chain ran, but no
   visual or E2E surface was touched). Skipped by design: `Accessibility AI
Attribution`, `Docs Formatting`, and the Dependabot `auto-merge`.
4. Committed this `release.md` by explicit path and pushed. That starts a new
   CI run on the new head (docs-only change). Its result is not part of this
   record. Matt should confirm `CI Gate` on the PR head before merging (step 1
   below).

## Release steps for Matt (not executed)

1. **Confirm the gate on the current head, then merge.**
   ```
   gh pr checks 5704 | grep -E '^CI Gate\s'      # expect: pass
   gh pr merge 5704 --squash --delete-branch
   ```
   `tier:standard` asks for 1 human review. That is you.
2. **Optional pre-merge probe (review L4).** On PR #5704, leave a **review
   comment** (a Files-changed line comment or a review body) containing
   `@claude say hi`. `pull_request_review(_comment)` runs the PR merge ref's
   claude.yml, so this exercises the new file before merge. Expect
   `Preflight (authorized, and is the agent runnable?)` = `success`,
   `dispatch` = `skipped`, and one comment
   `Skipped: no agent credential in CI (#3585).` This was not probed at
   Review. It rests on GitHub's documented event semantics.
3. **Post-merge proof, claude.yml.** `issue_comment` runs from the default
   branch, so this proof only works after merge.
   1. As a collaborator (write+), comment `@claude say hi` on any open issue.
   2. `gh run list --workflow claude.yml --limit 3 --json databaseId,event,conclusion` to get `<id>`.
   3. `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'`: expect
      `Preflight (authorized, and is the agent runnable?)` = `success` and
      `dispatch` = `skipped`.
   4. On the issue, expect **exactly one** bot comment starting
      `Skipped: no agent credential in CI (#3585).`, and **no** "Working on it"
      or "Agent run finished" comment.
   5. Optional negative check: a non-collaborator `@claude` should give `dispatch` =
      `skipped` and **no** comment.
4. **Watch the next scheduled-issue-completion cron run** (`0 0,12 * * *`
   UTC; the first after merge is 00:00Z or 12:00Z, whichever comes next):
   ```
   gh run list --workflow scheduled-issue-completion.yml --limit 1 --json databaseId,event,conclusion,createdAt
   gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'
   ```
   Expect `Preflight (is the agent runnable?)` = `success` and
   `Advance the issue queue` = **`skipped`**. This breaks the streak of 60+
   consecutive "success" runs recorded in defect.md. The run-level conclusion
   stays `success` by design (defect.md § Ruled out).
5. Do not close #3585. It stays open for the default-adapter question.

## Post-release checks

None performed. The release was prepared, not executed. The checks to run
are steps 3 and 4 above. Operate should record their outcome.

## Outcome

**Prepared, not shipped.** PR #5704 is open against `main`. CI Gate succeeded
(run 35900040290) on code SHA 067cad409, the PR is mergeStateStatus
`CLEAN`, and no check is red. Blockers: none on the automation side. It waits
on Matt's review and merge (`tier:standard`). Deferred review lows (L1–L8) are
recorded in `review.md` and are not blockers.
