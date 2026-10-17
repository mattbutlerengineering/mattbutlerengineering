---
stage: verify
run: maintenance:ship-pr-hold-labels
date: 2026-10-17
assumptions:
  - "No prd.md or breakdown.md exists in a maintenance run with `re-entry: implement`; the criteria list is defect.md's six work items with their `Accept:` lines, plus the stage dispatch's six verification points. All work items were checked, so the soft gate cleared."
  - "The regression evidence is a re-read trace of the skill text, as defect.md § Reproduction prescribes: the skill is markdown an agent follows, so no executable failing test exists. The trace is backed by a read-only dry walk of steps 1-3 against real PRs."
  - "The positive hold case was read against PR #6870 (merged, carries `needs-review`), not by labelling a live PR, so that verification wrote nothing to GitHub."
---

# Verification: /ship-pr honours hold labels

## Summary

8 of 8 criteria PASS, 0 FAIL. The skill at `79da06e4c` now stops with
`held — <label>` before any review dispatch when the PR or its linked issue
carries a profile `hold_labels` label. It also re-reads holds after review and
before both merge commands. All three folded minors meet their acceptance
wording, every fact the skill references is true today, and all four drift
checks exit 0. CI Gate on PR #7014 was `pending` at 14:55Z. One observation
falls outside the acceptance criteria and is listed under § Observations.

Local HEAD = `origin/fix/ship-pr-hold-labels` =
`79da06e4c0181f483e2430d2eb704fb9d792c066` = PR #7014 `headRefOid`.

## Criteria & evidence

### 1. Major 1: hold-label stop in step 1, before any review (work item 1)

- Check: read `.claude/skills/ship-pr/SKILL.md` step 1. Confirm it points at
  `hold_labels` rather than restating it, that it stops before step 4's review
  dispatch, and that the Output block covers `held — <label>`.
- Evidence (SKILL.md `:38-43`, `:131`):
  ```
  38  Then check holds. The linked issue is the one a `Closes #M` / `Fixes #M`
  39  line in the PR body names (none → only the PR's own labels count); read its
  40  labels with `gh issue view <M> --json labels`. If the PR or that issue
  41  carries any label in the profile's `hold_labels` (`.claude/implement-queue.md`
  42  frontmatter), stop here and report `held — <label>`: no review is
  43  dispatched and nothing is merged.
  131 Action:   <armed --auto | merged directly | held — <label> | held for human merge — gate path | stopped at <step> — <reason>>
  ```
  The step-1 `gh pr view` now requests `body` (`:34`, `state,isDraft,labels,headRefOid,body`),
  which the linked-issue lookup needs. The protocol preamble `:30-31` reads
  "Stop at the first step that doesn't clear — never fall through to the
  merge step". Review dispatch is first named in step 4 (`:72-78`), so a
  step-1 stop precedes it. `grep -c needs-review SKILL.md` gives 0, so the
  list is not restated.
- Result: PASS

### 2. Major 1: re-check holds before both merge commands (work item 2)

- Check: list every merge command in the skill, then confirm a label re-read
  precedes each of them.
- Evidence:
  ```
  $ grep -n 'gh pr merge\|minus `--auto`' .claude/skills/ship-pr/SKILL.md
  112:   gh pr merge <N> --auto --squash --delete-branch
  116:   with the same command minus `--auto` — this path, too, runs only after
  ```
  SKILL.md `:98-107`, `:115-117`:
  ```
  98  5. **Merge.** On an all-pass verdict (or a fast-path skip), first re-read
  99     holds, since a label can land while review runs:
  100    `gh pr view <N> --json labels` (plus the linked issue's, as in step 1).
  101    Two things hold the PR for a human merge, and either one means the merge
  102    command below is not run:
  104    - a label in the profile's `hold_labels` on the PR or its issue — report
  105      `held — <label>`;
  106    - a changed file matching a gate path (`GATE_PATHS` in `@mbe/agent-core`)
  107      — report `held for human merge — gate path`.
  115 If GitHub reports the PR `CLEAN` and refuses `--auto`, merge directly
  116 with the same command minus `--auto` — this path, too, runs only after
  117 the hold re-read above cleared.
  ```
  Trace: there are only two merge invocations (`:112` `--auto`, `:115-117`
  direct). Both sit after the re-read at `:98-100`, and the text says
  explicitly that the `CLEAN` path depends on that re-read clearing. A hold
  added during step 4 is caught at `:100` before either merge. Step 5 names
  both hold kinds (`:104-107`), so the work item's "names both gate paths and
  hold labels" is met.
- Result: PASS

### 3. Minor 4: step 4's restated pre-check replaced by a pointer (work item 3)

- Check: compare step 4 before and after the change.
- Evidence, before (`origin/main` `:63-69`, from `git diff origin/main`):
  ```
  -   and the labels from step 1. The profile holds gate-path PRs (`GATE_PATHS`)
  -   for a human merge (ADR-0087), so a gate-path match or a `needs-review`
  -   label is checked **before** the fast path is consulted, not after (found
  ```
  After (`:72-78`):
  ```
  72  4. **Review.** Follow `.claude/implement-queue.md` § fast-path and §
  73     reviewers as written: whether review can be skipped is decided there and
  74     by `qualifiesForLowRiskFastPath`, not re-decided here. Dispatch the
  ...
  77     unless the fast path applies. A gate-path PR is still reviewed; step 5
  78     holds it.
  ```
  `GATE_PATHS` appears once, at `:106` in step 5, so the gate-path hold is
  stated once.
- Result: PASS

### 4. Minor 1: queue-only review inputs mapped for a single PR (work item 4)

- Check: confirm step 4 gives a source for acceptance criteria, code on disk,
  and verdict handling. Confirm "retry/hold policy" no longer appears without
  qualification and that "stop" and "retry" no longer contradict.
- Evidence, before: `-   and report it per that section's retry/hold policy, do not proceed to`.
  After (`:80-96`):
  ```
  80  § reviewers assumes a queue worker. For a single PR, take its inputs
  83  - **Acceptance criteria** — from the PR body plus the issue step 1
  84    found. Only when both lack them, pass `acceptanceCriteria: []` and say
  85    so in the `ReviewInput`'s `taskDescription`.
  86  - **Code on disk** — there is no `.claude/worktrees/agent-<taskId>/`.
  87    Create a throwaway worktree of the PR head
  92  - **Verdict handling** — a `flag` (reviewer) or `block` (specialist)
  93    verdict stops this invocation: report it with the reviewer's output.
  94    There is no retry and no worker dispatch (the section's retry policy
  95    re-dispatches a worker, which `/ship-pr` does not have). Do not
  96    proceed to step 5.
  ```
  The `grep` for `retry/hold policy` gives 0 hits. Retry is now explicitly
  excluded, with the reason, so the old contradiction is gone.
- Result: PASS

### 5. Minor 3: step 2's dist wording (work item 5)

- Check: compare step 2 before and after, then confirm the claim against
  `scripts/ci-gate-status.mjs`.
- Evidence, before (`origin/main` `:44-45`):
  ```
  Exit 0 → the dist both `classifyCiGateStatus` support code and
  `reviewersForDiff` depend on is proven fresh (or was rebuilt). Exit 1 →
  ```
  After (`:51-53`):
  ```
  This governs only the dist-backed classifiers, `reviewersForDiff` and
  `qualifiesForLowRiskFastPath`; step 3's `scripts/ci-gate-status.mjs`
  imports only Node built-ins and does not depend on it.
  ```
  Fact check:
  ```
  $ grep -n -E '^\s*import |require\(' scripts/ci-gate-status.mjs
  84:import { execFileSync } from "node:child_process";
  85:import { fileURLToPath } from "node:url";
  $ grep -c 'agent-core' scripts/ci-gate-status.mjs
  0
  ```
- Result: PASS

### 6. Every referenced fact in the skill holds today

- Check: confirm the profile key, the section anchors, the agent-core
  exports, and the throwaway-worktree commands, the last run for real against
  PR #7014 in scratch.
- Evidence:
  ```
  $ sed -n '1,7p' .claude/implement-queue.md
  ---
  merge: auto
  max_workers: 3
  required_check: CI Gate
  hold_labels: [needs-review]
  priority: [security, ci-fix, feature, audit]
  ---
  $ grep -n -E '^#+ ' .claude/implement-queue.md | grep -i -E 'fast-path|reviewers|merge-command|ci-status|tier hold'
  112:## ci-status
  140:## fast-path
  168:## reviewers
  230:## merge-command
  246:### No tier hold
  262:What still holds a PR: a `flag` verdict (Reviewer), a `block` verdict (specialized reviewer), a reviewer that errored again after one re-dispatch, a changed gate-path file, a `needs-review` label, or red CI Gate.
  $ grep -n 'export function qualifiesForLowRiskFastPath' packages/agent-core/src/pr-risk-classifier.ts
  135:export function qualifiesForLowRiskFastPath(files: readonly string[]): boolean {
  $ sed -n '325,335p' packages/agent-core/src/index.ts   (excerpt)
  export {
    isLowRiskPR,
    reviewersForDiff,
    qualifiesForLowRiskFastPath,
    GATE_PATHS,
    matchesGatePath,
  } from "./pr-risk-classifier.js";
  ```
  Throwaway worktree, run for real:
  ```
  $ git fetch origin pull/7014/head
   * branch                refs/pull/7014/head -> FETCH_HEAD
  exit=0
  79da06e4c0181f483e2430d2eb704fb9d792c066          (FETCH_HEAD)
  headRefOid=79da06e4c0181f483e2430d2eb704fb9d792c066
  $ git worktree add --detach <scratchpad>/verify-pr7014-head 79da06e4c0181f483e2430d2eb704fb9d792c066
  Preparing worktree (detached HEAD 79da06e4c)
  HEAD is now at 79da06e4c fix(ship-pr): stop on hold labels before review and merge
  exit=0
  $ git worktree remove --force <scratchpad>/verify-pr7014-head
  exit=0
  git worktree list | grep -c verify-pr7014-head → 0; path gone
  ```
- Result: PASS

### 7. Read-only dry walk of steps 1-3 against a real PR

- Check: run the step-1 label read and hold intersection on PR #7014 (no
  hold) and on PR #6870 (merged, carries `needs-review`, the positive case).
  Also run the linked-issue label read, the step-2 freshness check, and the
  step-3 classification. No reviewers were dispatched and nothing was merged
  or labelled.
- Evidence:
  ```
  $ gh pr view 7014 --json state,isDraft,labels,headRefOid,body   (jq: labels + Closes/Fixes scan)
  {"closes":[],"headRefOid":"79da06e4c0181f483e2430d2eb704fb9d792c066","isDraft":false,"labels":["tier:trivial"],"state":"OPEN"}
  hold_labels from profile: needs-review
  PR 7014 hold intersection: []                         → step 1 clears
  $ gh pr view 6870 --json state,isDraft,labels,headRefOid,body   (jq)
  {"closes":[],"held":["needs-review"],"isDraft":false,"labels":["tier:standard","needs-review"],"state":"MERGED"}
                                                        → step 1 would report `held — needs-review`
  $ gh issue view 6781 --json labels                    (the linked-issue read's command shape)
  ["needs-human"]
  $ node scripts/agent-core-build-freshness.mjs check
  {"trusted":true,"state":"fresh","reason":"dist is newer than or equal to every src file",...,"rebuildAttempted":false,"rebuildSucceeded":null}
  exit=0
  $ node scripts/ci-gate-status.mjs check --pr 7014
  {"state":"pending","reason":"CI is running but CI Gate has not reported yet"}
  exit=0
  ```
  Neither PR's body has a `Closes`/`Fixes #M` line, so the linked-issue read
  was exercised on its own against issue #6781.
- Result: PASS

### 8. Drift checks and PR #7014 CI Gate (work item 6)

- Check: run the four drift checks in the worktree, then classify CI Gate on
  PR #7014.
- Evidence:
  ```
  $ node scripts/check-skill-references.mjs
  PASS: Every /slash-command named in an instruction file resolves to a skill or is declared with a reason.
  PASS: No repo-local skill shares a plugin skill's name without a declared reason.
  exit=0
  $ node scripts/check-claude-md-table-drift.mjs
  PASS: CLAUDE.md tables (CLI commands, skills, subagents) match the repo tree.
  exit=0
  $ node scripts/detect-instruction-rot.mjs
  ✓ No instruction rot detected.
  exit=0
  $ pnpm exec prettier --check .claude/skills/ship-pr/SKILL.md docs/fixes/ship-pr-hold-labels/
  All matched files use Prettier code style!
  exit=0
  $ node scripts/ci-gate-status.mjs check --pr 7014        (14:55Z)
  {"state":"pending","reason":"CI Gate is still IN_PROGRESS"}
  ```
  CI Gate is `pending`, which is recorded here and not a failure. Merging
  still needs `green` per the brief.
- Result: PASS

## Observations (outside the acceptance criteria)

- **`gh pr ready` runs before the hold check.** In step 1 (`:35-36` then
  `:38`), a draft PR invoked with `--ready` is flipped to ready-for-review
  before the hold labels are read. A held draft therefore still gets one
  GitHub write before the stop. No review and no merge follow, so criterion 1
  holds. Moving the hold check above `gh pr ready` would make the stop write
  nothing. This is a judgment for Review or the Owner, not a Verify failure.
- The step-5 re-read uses `gh pr view <N> --json labels` only. It does not
  re-read `headRefOid`, so a push during review is left to CI Gate and
  § merge-command. This was out of scope for this run.

## Failures

None.

## Not verified

- **No end-to-end `/ship-pr` run.** No reviewer was dispatched and nothing
  was merged (stage instruction). The review-and-merge half of the skill
  still has never run end to end. That is review Minor 5, kept as a
  follow-up.
- **A hold added mid-review** was verified by trace only (criterion 2). No
  label was applied to a live PR during a real review.
- **The linked-issue hold path** was exercised as separate reads only (PR
  body scan plus `gh issue view`). No live PR with a held `Closes #M` issue
  was found or created.
- **GraphQL limitation (recorded, not a failure).** Step 1's `gh pr view`
  and `gh issue view`, and step 5's re-read, are GraphQL-backed `gh`
  subcommands. In Claude Code Remote sessions they return `HTTP 403: GitHub
GraphQL is not available` (`.claude/rules/gotchas.md` § Claude Code
  Remote, #5958). This verification ran in a local session, where they
  worked. A cloud `/ship-pr` would need the `gh api` REST or
  `mcp__github__*` equivalents, and the skill does not name those.

## Re-check after Review fix (2026-10-17)

Review fixed one finding in `.claude/skills/ship-pr/SKILL.md` (commit
`67c9178d1`): step 1 now checks holds before `gh pr ready`, and the
linked-issue scan covers every GitHub closing keyword and every linked issue.
Criteria 1, 2 and 4 still hold on the new text (the hold stop still precedes
step 4's review dispatch and both merge commands; step 5's re-read and step 4's
acceptance-criteria source now name "linked issues" in the plural). The drift
checks were re-run on that commit:

```
$ node scripts/check-skill-references.mjs
PASS: Every /slash-command named in an instruction file resolves to a skill or is declared with a reason.
PASS: No repo-local skill shares a plugin skill's name without a declared reason.
exit=0
$ node scripts/check-claude-md-table-drift.mjs
PASS: CLAUDE.md tables (CLI commands, skills, subagents) match the repo tree.
exit=0
$ node scripts/detect-instruction-rot.mjs
✓ No instruction rot detected.
exit=0
$ pnpm exec prettier --check .claude/skills/ship-pr/SKILL.md
All matched files use Prettier code style!
exit=0
```

The frontmatter `description` is unchanged, so the `CLAUDE.md` `/ship-pr` row
still matches.
