---
stage: verify
run: maintenance:key-gated-workflows-visible-skip
date: 2026-09-23
verified-sha: 4e88834ebf2a6f1c0598857dd9e4e2ed306d64e7
ci-run: 35898464853
assumptions:
  - "Soft gate: this is a maintenance run with re-entry: implement, so defect.md's work items are the breakdown. All six are checked `[x]`, so the gate passes without a route-back."
  - "Criteria list = the autorun brief's four success criteria plus defect.md's per-item Accept lines not already covered by them (no prd.md exists for a maintenance run)."
  - "Only scheduled-issue-completion.yml was dispatched on the branch, as the stage brief authorized. claude.yml is comment-triggered and runs from the default branch, so its live proof is post-merge only (steps below)."
---

# Verification: key-gated agent workflows skip visibly instead of passing silently

## Summary

**8 PASS, 0 FAIL, 3 not provable pre-merge** (claude.yml live behaviour, the
keyed path in both workflows, and CI Gate on the PR, which Ship opens). The
regression tests fail against origin/main's workflows (4/5 and 6/7) and pass
against the branch. A real `workflow_dispatch` of
`scheduled-issue-completion.yml` on the branch (run **35898464853**) shows
`Preflight` = **success** and `Advance the issue queue` = **skipped**. Before
the fix, 60 consecutive runs of that job reported success. Verdict: the defect
is fixed for everything that can be proven before merge. Next stage: Review.

## Criteria & evidence

### C1. With no key, the agent job in both workflows is SKIPPED by a job-level `if:` on a preflight output, and no step reaches `exit 0` after deciding not to run (brief)

**C1a: scheduled-issue-completion.yml, live on CI**

- Check: pushed the branch (remote SHA matches local HEAD, see Gates), ran
  `gh workflow run scheduled-issue-completion.yml --ref fix/key-gated-workflows-visible-skip`,
  waited with `gh run watch 35898464853 --exit-status` (exit 0), then read the
  jobs.
- Evidence:
  ```
  $ gh run view 35898464853 --json conclusion,headSha,event
  {"conclusion":"success","event":"workflow_dispatch","headSha":"4e88834ebf2a6f1c0598857dd9e4e2ed306d64e7"}
  $ gh run view 35898464853 --json jobs --jq '.jobs[] | {name, conclusion}'
  {"conclusion":"success","name":"Preflight (is the agent runnable?)"}
  {"conclusion":"skipped","name":"Advance the issue queue"}
  $ gh run view 35898464853 --json jobs --jq '.jobs[] | {name, steps: [.steps[] | {name, conclusion}]}'
  {"name":"Preflight (is the agent runnable?)","steps":[{"conclusion":"success","name":"Set up job"},{"conclusion":"success","name":"Check for an agent credential"},{"conclusion":"success","name":"Complete job"}]}
  {"name":"Advance the issue queue","steps":[]}
  ```
  Preflight job log (`gh api .../actions/jobs/107308252468/logs`), which shows
  the secret resolving empty and the output being set:
  ```
    ANTHROPIC_API_KEY:
  Set output 'has_key'
  ```
  The routine job ran **zero steps**, so no in-step `exit 0` could have run.
  Compare the pre-fix run 35685360619 recorded in defect.md: job
  `Advance the issue queue` → `success`, step `Run agent` → `success`, after
  `##[warning]ANTHROPIC_API_KEY is not configured — skipping the agent run.`
  The run-level conclusion stays `success` because preflight succeeds. defect.md
  § Ruled out already records that this is expected and matches docs-audit.
- Result: **PASS**

**C1b: both workflows, structurally (tests)**

- Check: `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/claude-workflow.test.mjs scripts/__tests__/scheduled-issue-completion-workflow.test.mjs scripts/__tests__/docs-audit-workflow.test.mjs`
- Evidence:
  ```
   ✓ scripts/__tests__/claude-workflow.test.mjs (7 tests) 3ms
   ✓ scripts/__tests__/docs-audit-workflow.test.mjs (6 tests) 3ms
   ✓ scripts/__tests__/scheduled-issue-completion-workflow.test.mjs (5 tests) 3ms

   Test Files  3 passed (3)
        Tests  18 passed (18)
  ```
  The branch diff removes the in-step guard from scheduled-issue-completion.yml
  (`- if [ -z "${ANTHROPIC_API_KEY:-}" ]; then ... - exit 0`) and replaces
  claude.yml's `*) ...; exit 0;;` with `echo "authorized=false" >> "$GITHUB_OUTPUT"`.
  `dispatch` now carries
  `if: needs.preflight.outputs.authorized == 'true' && needs.preflight.outputs.has_key == 'true'`.
- Result: **PASS** (claude.yml live proof is post-merge, see Not verified)

### C2. With a key present, behaviour is unchanged apart from claude.yml's CLI invocation now resolving (brief)

- Check: reviewed `git diff origin/main...HEAD -- .github/workflows/` for the
  keyed path. The keyed path can't be run, because CI has no key by design.
- Evidence (diff facts, keyed path):
  - scheduled-issue-completion.yml: `routine` gains `needs: preflight` and the
    job-level `if:`. The `Run agent` step loses only the key-check block and
    gains `set -euo pipefail`. The `node tools/cli/dist/index.js agent run ...`
    call and the `outcome=success` / `outcome=failure` + `exit 1` branches are
    byte-identical to origin/main.
  - claude.yml: `dispatch` keeps checkout, install, extract, acknowledge and
    report. It adds `- name: Build CLI` / `run: pnpm build --filter @mbe/cli...`
    and replaces `pnpm exec mbe agent run` with
    `node tools/cli/dist/index.js agent run "$(cat /tmp/agent-task.txt)" --max-budget 1.50 --adapter auto`.
  - Intended keyed-path change (defect.md work item 3): claude.yml's agent
    failure branch now does `exit 1` after `outcome=failure`, so a failed agent
    run is a red job instead of a green one. The brief's "unchanged" allows
    this because defect.md lists it as an Accept condition. Review should
    confirm the decision.
  - Test `still invokes the built CLI entrypoint when a credential exists`
    passes on the branch (C1b output).
- Result: **PASS** (structural; not exercised live, see Not verified)

### C3. A test fails if an agent step regains an in-step `exit 0` skip or loses the preflight gate (brief). This is the regression centerpiece.

- Check: reverted each workflow to origin/main
  (`git show origin/main:<path> > <path>`), ran its test, then restored it
  with `git checkout -- <path>`.
- Evidence:
  ```
  === scheduled-issue-completion reverted to origin/main ===
       × declares a preflight job that publishes whether the credential exists 3ms
       × skips the routine job on a missing credential rather than passing it 1ms
       × keeps the old silent-skip out of the step — an exit 0 there reads as a pass 0ms
       × says in the run summary that the routine did not run, so a skip is legible 0ms
       ✓ still invokes the built CLI entrypoint when a credential exists 0ms
   Test Files  1 failed (1)
        Tests  4 failed | 1 passed (5)
  === claude reverted to origin/main ===
       × declares a preflight job that owns the mention filter and the collaborator check 3ms
       × skips the dispatch job unless the author is authorized AND a credential exists 1ms
       × keeps every silent skip out of the dispatch steps — an exit 0 there reads as a pass 0ms
       × builds the CLI and invokes its entrypoint, since `pnpm exec mbe` never resolves 3ms
       × fails the agent step when the agent run fails, so a failure is not a green job 1ms
       × answers an authorized, keyless mention with one comment naming #3585 — and only then 0ms
       ✓ never interpolates untrusted comment text into a shell script 0ms
   Test Files  1 failed (1)
        Tests  6 failed | 1 passed (7)
  === after restore ===
  (end status)
  ```
  The two tests that still pass pin properties origin/main already had (the
  built-CLI call in scheduled-issue-completion, and env-only handling of
  untrusted text in claude.yml). `git status --short` printed nothing after the
  restore, so the tree was clean.
- Result: **PASS**

### C4. Repo gates green: scripts vitest, prettier, actionlint (brief). CI Gate on the PR is left to Ship.

- Check: full scripts suite, `actionlint` on both workflows, and `prettier --check` on every touched file.
- Evidence:
  ```
  $ pnpm exec vitest run --config scripts/vitest.config.mjs
   Test Files  205 passed (205)
        Tests  3922 passed (3922)
  $ actionlint .github/workflows/claude.yml .github/workflows/scheduled-issue-completion.yml
  actionlint exit=0
  $ pnpm exec prettier --check .github/workflows/claude.yml .github/workflows/scheduled-issue-completion.yml scripts/__tests__/claude-workflow.test.mjs scripts/__tests__/scheduled-issue-completion-workflow.test.mjs .claude/rules/gotchas.md docs/fixes/key-gated-workflows-visible-skip/
  All matched files use Prettier code style!
  prettier exit=0
  ```
  The pre-push hook passed on push: `All patterns within baseline. No regressions detected.` and `All generated artifacts are up to date.`
- Result: **PASS** (local). CI Gate: not yet run, because no PR exists. See Not verified.

### C5. The skip is legible: the run summary says the routine didn't run and names #3585 (defect.md work item 1)

- Check: test assertion plus the preflight step's source on the dispatched SHA.
- Evidence: test `says in the run summary that the routine did not run, so a skip is legible` passes (C1b). It fails on origin/main (C3). Preflight job log for run 35898464853 shows the executed script with `echo "### Routine skipped"` and ``echo "\`ANTHROPIC_API_KEY\` is not configured, so the issue-queue routine"``, and the step concluded `success`.
- Result: **PASS**. The rendered step-summary text itself was not fetched, because `gh` has no summary endpoint. The log shows the script that writes it.

### C6. claude.yml: a keyless authorized mention gets one skip comment naming #3585, and a non-collaborator gets none (defect.md work item 4)

- Check: test `answers an authorized, keyless mention with one comment naming #3585 — and only then`.
- Evidence: passes on the branch (C1b) and fails on origin/main (C3). The step is gated by
  `if: steps.auth.outputs.authorized == 'true' && steps.check.outputs.has_key != 'true'`.
- Result: **PASS** (structural; live proof post-merge)

### C7. claude.yml: untrusted comment text reaches the shell only through env vars (defect.md work item 4)

- Check: test `never interpolates untrusted comment text into a shell script`.
- Evidence: passes on the branch (C1b). `COMMENT_BODY` stays in `dispatch.env`, and `COMMENT_AUTHOR` is only in `preflight.env`.
- Result: **PASS**

### C8. Docs: nothing in the repo still describes either workflow as skipping in-step or using `pnpm exec mbe` (defect.md work item 5)

- Check: diff of `.claude/rules/gotchas.md` (1 line), plus prettier (C4).
- Evidence: `git diff --stat origin/main...HEAD` → `.claude/rules/gotchas.md | 2 +-`. The only files changed are the two workflows, the two new tests, gotchas.md, and this run dir:
  ```
   .claude/rules/gotchas.md                           |   2 +-
   .github/workflows/claude.yml                       |  89 ++++++++-
   .github/workflows/scheduled-issue-completion.yml   |  57 ++++--
   .../autorun-brief.md                               |  44 +++++
   .../key-gated-workflows-visible-skip/defect.md     | 208 +++++++++++++++++++++
   scripts/__tests__/claude-workflow.test.mjs         | 115 ++++++++++++
   .../scheduled-issue-completion-workflow.test.mjs   |  75 ++++++++
  ```
- Result: **PASS**. The stale `docs/ai-tooling-audit.md:115,181` "claude.yml MISSING" lines are out of scope (recorded in defect.md Notes). They make no claim about skip behaviour.

## Gates

| Gate                                                      | Result                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 workflow tests                                          | 18/18 passed                                                       |
| Full scripts vitest                                       | 205 files / 3922 tests passed                                      |
| actionlint (both workflows)                               | exit 0, no findings                                                |
| prettier --check (touched files)                          | clean                                                              |
| Regression revert (both workflows)                        | 4/5 and 6/7 fail on origin/main, tree clean after restore          |
| Push                                                      | pre-push hook passed. `git ls-remote` = `4e88834eb…` = local HEAD. |
| CI dispatch, scheduled-issue-completion (run 35898464853) | preflight=success, routine=skipped                                 |

## Failures

None.

## Not verified

- **claude.yml live behaviour: post-merge proof required.** It is
  comment-triggered, and `issue_comment` workflows run from the default
  branch, so it can't be dispatched on this branch and wasn't triggered here.
  Proof steps after merge:
  1. As a collaborator (write+), comment `@claude say hi` on any open issue.
  2. `gh run list --workflow claude.yml --limit 3 --json databaseId,event,conclusion`
     to get the run id `<id>`.
  3. `gh run view <id> --json jobs --jq '.jobs[] | {name, conclusion}'`.
     Expect `Preflight (authorized, and is the agent runnable?)` = `success`
     and `dispatch` = `skipped`.
  4. On the issue, expect exactly one bot comment starting
     `Skipped: no agent credential in CI (#3585).`, and no "Working on it" or
     "Agent run finished" comment.
  5. Optional negative check: a non-collaborator `@claude` mention should give
     `dispatch` = `skipped` and **no** comment.
- **Keyed path in both workflows: not testable.** CI has no
  `ANTHROPIC_API_KEY` by design (#3585, Option A). With a key, the agent run,
  the claude.yml `Build CLI` step and `node tools/cli/dist/index.js` resolving
  in CI, and the new `exit 1` on agent failure are all proven structurally
  only (tests + actionlint + diff review), never executed. The CLI entrypoint
  is proven to work in general: scheduled-issue-completion.yml has used the
  same `node tools/cli/dist/index.js agent run` call on origin/main.
- **CI Gate on the PR:** no PR exists yet (Ship opens it, per the
  prepare-and-stop authorization). The branch push started no `pull_request`
  CI. `gh run list --branch fix/key-gated-workflows-visible-skip` shows only
  run 35898464853.
- **Rendered `$GITHUB_STEP_SUMMARY` text:** inferred from the executed script
  in the job log, not read from the rendered summary.
