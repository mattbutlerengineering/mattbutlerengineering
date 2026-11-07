---
stage: operate
run: maintenance:key-gated-workflows-visible-skip
date: 2026-11-07
users-observed: 0
signal-source: "read 2026-11-07: `gh pr view 5704 --json state,mergedAt,mergeCommit,mergedBy` (MERGED 2026-09-23T19:15:38Z, squash 25adee224, merged by the Owner account); `gh run list --workflow scheduled-issue-completion.yml --limit 400 --json databaseId,event,conclusion,createdAt` filtered to createdAt > the merge, then `gh run view <id> --json jobs` for each of the 90 runs; `gh run list --workflow claude.yml --limit 400 --json databaseId,createdAt,event,conclusion` (the 400-run cap reaches back only to 2026-11-05T02:27Z, so claude.yml history is 3 days, not 6 weeks); `gh run view 37366286924` and `42385749887` for the two non-success runs; `git -C $W log origin/main -- <both workflows and both tests>`; `gh issue view 3585`; `gh search issues` on the slug, `claude.yml preflight` and `scheduled-issue-completion` (created after 2026-09-23). Sentry not queried: no CI workflow reports there and the change has no runtime surface. No person is observed using either workflow: the only runs are the cron and bot-event runs below."
assumptions:
  - "Population is 0. The Owner merged the PR, and merging is the Ship step, not use of the shipped behaviour. The cron's 90 runs are a sample of the workflow, not people. No `@claude` mention by a person appears in the 400 claude.yml runs checked."
  - "The brief's four success criteria and `release.md` § Release steps 3-4 (the post-merge proofs it handed to Operate) are the minimum signal. The brief has no `operate:` section, so no further minimum is claimed."
  - "`release.md` lacks the `outcome:` field and says `released: false` / PREPARED. `gh pr view 5704` shows MERGED 2026-09-23T19:15:38Z, so the run is treated as shipped. The release text was written before the merge and is stale on this point only."
  - "Run-level conclusion is what `gh run list` reports. The visible skip is read from job conclusions via `gh run view --json jobs`, since the defect's target is the job, not the run (defect.md § Ruled out)."
  - "Leg: `claude.yml` live behaviour is `unobserved` because no `@claude` comment reached a run since 2026-11-05. Older runs fell outside the 400-run window and were not paged further."
---

# Retro: key-gated agent workflows skip visibly instead of passing green

## Minimum signal (autorun brief § Success criteria, `release.md` § Release steps)

PR #5704 merged 2026-09-23T19:15:38Z as squash `25adee224`. It is 45 days past merge. `release.md` records "prepared, not shipped"; the merge happened after it was written, so there is nothing left to resolve.

### Success criterion 1, scheduled-issue-completion: the agent job is SKIPPED, not SUCCESS

Measured from 2026-09-23T19:15:38Z to 2026-11-07, `gh run view <id> --json jobs` over every run (90):

| Job | Conclusion | Runs |
|---|---|---|
| `Preflight (is the agent runnable?)` | success | 89 |
| `Preflight (is the agent runnable?)` | cancelled | 1 (run 37366286924, schedule, 2026-10-05T19:53Z) |
| `Advance the issue queue` | skipped | 90 |

Before the fix, `defect.md` recorded 60 consecutive green `Advance the issue queue` runs that did nothing. After it, 0 of 90 report that job as success. The skip is visible in the job list, as the brief intended. Run-level conclusion is `success` in 89 and `failure` in 1; that is by design (defect.md § Ruled out), so `gh run list` alone still reads green for the skipped runs.

The one failed run (37366286924) is a cancelled preflight job (no steps ran, routine skipped). It is a runner or superseded-run cancellation, not the gate logic: no later failure repeats it. `gh run view --log-failed` gave no error text. The cause was not established.

- Signal strength: measured (CI run history, 90 runs). It is a fact about the workflow, not about people.

### Success criterion 2, claude.yml: a keyless authorized `@claude` gets `dispatch` skipped plus one skip comment

`gh run list --workflow claude.yml --limit 400` returned 400 runs, 2026-11-05T02:27Z to 2026-11-07T21:36Z. By event and run conclusion: 395 `issue_comment` skipped, 3 `pull_request_review_comment` skipped, 1 `pull_request_review` skipped, 1 `pull_request_review` cancelled (run 42385749887, 2026-11-07T15:18Z, no jobs, a PR titled "fix(audit): record auth-gated and failed site-audit checks (gen zone)"). Every run was skipped at the run level, meaning the `preflight` job's `@claude` mention filter was false for all of them. None passed the mention filter, so neither `Explain the skip` nor `dispatch` has run on `main`.

The post-merge proof in `release.md` step 3 (a collaborator comments `@claude say hi`, then read `preflight` = success, `dispatch` = skipped, and one `Skipped: no agent credential in CI (#3585).` comment) was not done. The optional pre-merge probe (review L4) was not done either. The behaviour rests on `verification.md` (structural tests, 6 of 7 failing against origin/main) and the live dispatch of the other workflow.

- Signal strength: unobserved. The 3-day window cannot show how a real mention behaves, and the cancelled run has no jobs to read.

### Success criterion 3, a test fails if an in-step `exit 0` skip returns or the gate is lost

Both tests are on `main` and were migrated by #6393 (`4e0754c94`, `d39ae9d80`, 2026-10-12) onto `scripts/lib/workflow.mjs`'s parsed workflow. `claude-workflow.test.mjs:71-75,102-104` still pins both `&&` conditions as whole expressions (the M1 fix). They run in CI: `scripts/package.json` `test` is part of the `Test (Node 22, rest)` leg, since `rest` is defined by exclusion of three packages (`ci.yml:~584`). Since the merge, no commit touched the two workflows other than dependency bumps (`a5bec2833`, `9eb8964cc`), so the tests never failed on a real edit.

- Signal strength: unobserved. There is no real catch since merge, and the guard has not been tested by a change to these workflows.

### Criterion 4, #3585 stays open for the default-adapter question

`gh issue view 3585` → CLOSED, closedAt 2026-09-23T19:15:48Z, ten seconds after the merge. The brief and `release.md` said it must not be closed by this run ("Refs", not "Closes"). The close at 19:15:48Z is probably the Owner closing the decision; no source in this retro shows who or why, and it is not a defect of the run. The default-adapter question it was to keep open has no issue now.

- Signal strength: measured (issue state).

## Outcomes vs. intent

The population is 0, so every outcome is `unobserved` as a use signal. Each records state. The measured legs above describe the workflow, not users.

### Key-gated workflow jobs report SKIPPED instead of SUCCESS when no credential exists

- What happened: merged and live on `main`. Scheduled runs show the agent job `skipped` 90 of 90 since merge and `claude.yml` is deployed. No person was affected: the readers of run lists are the scheduled-workflow-health sensor and the Owner, neither a counted user. Whether the Owner or the sensor relies on the change is not recorded anywhere I read.
- Signal strength: unobserved (as use); the workflow behaviour itself is measured above

### `claude.yml` is no longer a broken `pnpm exec mbe` call that posts "finished: failure"

- What happened: the file on `main` builds the CLI and calls `node tools/cli/dist/index.js agent run`. With a key it was never run: CI has no key by design, so the keyed `Build CLI` step, the `exit 1` on agent failure and the CLI resolving in CI are structural only, exactly as `verification.md` § Not verified said.
- Signal strength: unobserved

### A non-collaborator's `@claude` does not reach the agent or make the bot reply

- What happened: pinned by `claude-workflow.test.mjs` (whole-line `&&` conditions). No non-collaborator mention is in the 400 runs. The review noted a silent failure if the collaborator lookup errors (L2); that line is unchanged on `main`.
- Signal strength: unobserved

## Defect recurrence

Did the defect recur since release? No, on the evidence available. The defect was "a key-gated job reports success while doing nothing". 0 of 90 scheduled runs show `Advance the issue queue` as success, and the in-step `exit 0` skip is gone from `main`. For `claude.yml` the answer is unknown, not no: its agent path has not run, so a recurrence there could not have appeared. Because nothing recurred, there is no missed regression test, review finding or design constraint to turn into a preventive seed. The unrun `claude.yml` path is carried as a seed to measure instead.

## Open debt

Issues this run itself filed. `gh search issues` on the slug, `claude.yml preflight` and `scheduled-issue-completion` (created after 2026-09-23) found none that cite this run's `review.md` or `verification.md` or were filed by it.

- No issue exists for Review's deferred lows L1-L8. They sit as prose in `review.md` and `release.md` ("Deferred review lows (L1-L8) are recorded in `review.md`"). Current state on `main`, read 2026-11-07:
  - L1 (preflight inherits `contents: write` + `pull-requests: write` + `issues: write`, `claude.yml:23-26`): still in place.
  - L2 (`2>/dev/null || echo "none"` turns a lookup error into "not a collaborator", `claude.yml:65`): still in place.
  - L3 (fork-PR review mention turns preflight red), L5 (Build CLI failure reported as "cancelled"), L6 (injection scan narrow), L7 (concurrency drops a pending run): not re-read in the file; no issue is open for any of them.
  - L4 (pre-merge probe) is moot now that the PR is merged.
  - L8 (stale `docs/acmm/SKELETON-AUDIT.md:24`, `docs/ai-tooling-audit.md:115,181`): not re-checked.
- #3585 (the run's origin): CLOSED 2026-09-23T19:15:48Z. Not debt. Noted above because the brief expected it to stay open.

Count toward nothing.

## Run retrospective

- Keep: Verify dispatched the workflow it could (`scheduled-issue-completion.yml` on the branch, run 35898464853) and reverted both workflows to `origin/main` to show 4 of 5 and 6 of 7 tests failing. That proves the tests detect the defect, not just that the new file passes.
- Keep: Review found that the gate tests accepted `||` for `&&` (M1), which is an authorization bypass, and mutated each condition to confirm the fix. The pin is still in the test on `main`.
- Keep: defect.md § Ruled out stated up front that the run-level conclusion stays `success`. Operate's data agrees, and nobody had to be surprised by green runs.
- Change: the brief declared the post-merge proof "Operate should record" but nothing triggers it. The Owner has to comment `@claude say hi`. Operate arrived 45 days later with no such run, so the primary behaviour (the skip comment) is still unobserved. A proof that needs a human action should say who does it and name a date, or it is skipped.
- Change: record the Owner's merge, and the decision to close #3585 at merge, in `release.md` or a follow-up. The brief said not to close #3585; it was closed ten seconds after the merge, and the default-adapter question has no open issue.
- Stop: nothing worth stopping. The run was proportional to a two-file CI change.

## Environment

One row per mistake the run recorded. Sources: `review.md` § Findings, `verification.md` § Failures ("None") and `defect.md` § Notes. `breakdown.md` does not exist (maintenance run).

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| The gate tests matched each condition with two independent regexes, so `&&` → `||` (an authorization bypass) passed 7 of 7 | `review.md` M1 | mechanical | `scripts/__tests__/claude-workflow.test.mjs:71-75,102-104` (pins the whole expression, on `main`; run in CI by `Test (Node 22, rest)`). Closed. |
| `preflight` inherits workflow-level `contents: write` | `review.md` L1 | mechanical | No existing carrier checks per-job least privilege on these workflows. A parsed-workflow test assertion in `claude-workflow.test.mjs` that `preflight` declares its own `permissions` would carry it. Open, no issue. |
| The collaborator lookup turns an API error into "not a collaborator", so the skip is silent | `review.md` L2 | judgement | None exists. `claude.yml:65` is unchanged on `main`. Needs a decision on whether an API error should fail the job. |
| `verification.md` said claude.yml's live proof was post-merge only; `pull_request_review(_comment)` runs the merge ref | `review.md` L4 | judgement | None. The Operate data shows the post-merge proof was not done, so a pre-merge probe was the only available one. |
| `actionlint` was run by hand at Implement, Verify and Ship; no CI job or hook runs it | `defect.md` § Notes (actionlint at `/opt/homebrew/bin/actionlint`), `verification.md` C4; `grep -rln actionlint .github .husky scripts package.json` returned nothing, 2026-11-07 | mechanical | Finding: the check command runs under no hook and no CI job. Carrier would be a step in the `Lint` job of `.github/workflows/ci.yml` or `.husky/pre-push`. |
| Stale `claude.yml` claims in `docs/acmm/SKELETON-AUDIT.md:24` and `docs/ai-tooling-audit.md:115,181` | `review.md` L8, `defect.md` § Notes | mechanical | `scripts/check-instruction-budget.mjs` and the docs-audit workflow do not check it as far as read; not verified. No carrier proposed. |

## Idea seeds

- Run the `@claude` post-merge proof the release left open (as a collaborator, comment `@claude say hi` on one open issue) and read `gh run view <id> --json jobs`: expect `preflight` success, `dispatch` skipped, one `Skipped: no agent credential in CI (#3585).` comment. Record the outcome, because no `claude.yml` run has passed the mention filter since 2026-11-05 (from: maintenance:key-gated-workflows-visible-skip)
- Make `claude.yml`'s collaborator lookup tell "API said not a collaborator" from "API call failed", and fail the job on the latter, so a collaborator is never left with a silent skip (review L2); add a case to `claude-workflow.test.mjs` (from: maintenance:key-gated-workflows-visible-skip)
- Give `claude.yml`'s `preflight` its own `permissions: { issues: write, pull-requests: write }` and a test that it does (review L1); verify with one live `@claude` mention that the collaborator lookup still authorizes (from: maintenance:key-gated-workflows-visible-skip)
- Run `actionlint` over `.github/workflows/` in CI or the pre-push hook; it is used by hand in every pipeline stage and runs under neither. Measure how many workflow-file PRs since 2026-09-23 had an actionlint finding by running it over their heads (from: maintenance:key-gated-workflows-visible-skip)
- Count the Owner's use of the visible skip: whether anyone reads the `skipped` agent job or the `$GITHUB_STEP_SUMMARY` note (e.g. a `scheduled-workflow-health` read, or a human opening a run), so the 90-of-90 skip becomes a signal about use and not only about the workflow (from: maintenance:key-gated-workflows-visible-skip)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. #3585 (closed at merge) held the default-adapter question; no open issue carries it now.
