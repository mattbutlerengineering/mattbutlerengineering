---
stage: operate
run: feature:tier-escalation-false-positives
date: 2026-11-02
users-observed: 1
signal-source: "49 PRs, #8101..#8175, each given a tier by a real tier-classifier.yml run after #6701 merged (2026-10-15T14:03:57Z) and after #7078; classifier comments and tier labels read with gh. Distinct authors: 1 human account (mattbutlerengineering, 36 PRs, the only reviewer), plus 2 bots (github-actions, 9 PRs; dependabot, 4 PRs). The count is of humans, not PRs."
assumptions:
  - "Window chosen by the Operate agent, since the brief fixes only the minimum (at least 20 PRs after #6701, every escalation hand-checked, 0 valid). Window: every PR numbered #8100..#8175 that has a github-actions `**Classified as` comment, which is 49 PRs, 82 comments, 2026-11-02T07:07:28Z to 2026-11-03T03:42:29Z. Reason: it is contiguous, it is the most recent data available, and it sits wholly after #7078 (2026-10-22T21:09:34Z), so it measures the shipped classifier as it behaves now. 27 numbers in that range have no classifier comment (issues, or PRs without a verdict; not investigated) and are not counted. The last classification per PR is the verdict; earlier comments on the same PR are noted where they differ."
  - "This run's own artifact PR (#8176) is excluded. The protocol says a run's own debt is never feedback, and a retro about the classifier must not grade the PR that carries it."
  - "`users-observed: 1` counts the one human account. The Owner (Matt) is the only reviewer and the only consumer of tier labels (prd.md Actors). The 36 PRs under that login are mostly agent-authored, so the account is the human, not the author count. The brief said 'counts PRs and humans honestly'; both numbers are in `signal-source`, and the integer follows the stage's own meaning (people observed)."
  - "Hand-check standard: prd.md and idea.md intent. A size escalation is a true positive (TP) when the counted lines are genuine review surface that the PRD does not exclude (generated files and docs/features, docs/fixes run artifacts are excluded; tests, i18n, CLAUDE.md and other docs count). It is a false positive (FP) when generated or non-review lines tipped it over 1000. Per-PR counts are recomputed from `gh pr view --json files` with the module's exclusion list and agree with the classifier comment's own line count in every case."
  - "A PR 'escalated' means its classifier comment carries an `escalate` reason. Dependabot #8148 and #8166 are `tier:critical` through the path rule `infrastructure/pulumi/package.json -> T4`, which is not an escalation, so they are not in the hand-check table. They appear under the optional sample."
  - "Run ids are those listed for each PR's final head sha by `gh api repos/.../actions/workflows/tier-classifier.yml/runs?head_sha=<sha>`. Earlier pushes on a PR have their own, earlier comments and runs, which this retro cites by comment time only."
  - "The optional replay-de-escalation sample is 4 of the 25 rows, because verification.md printed only those 4 (#8166, #8148, #7996, #7713). The remaining 21 rows were not re-derived; that would need another ~17-minute replay. The sample does not change the population line."
  - "The 5 de-escalated PRs in the window (below) are counted from the classifier comment showing no `escalate` line plus a recomputed counted total of 1000 or fewer. What the old rule would have done is `[INFERENCE]` from its logic (any total over 1000 added lines bumps one tier); no old-rule run exists for these PRs."
  - "Backlog seeds are appended to `docs/backlog.md` because the operate skill (step 7) directs it. Append only; no existing line was touched."
---

# Retro: Tier escalation counts only real review surface

## Population and window

- Window: #8100..#8175, 49 PRs with a classifier verdict. Final labels: `tier:sensitive` 18, `tier:trivial` 16, `tier:standard` 9, `tier:critical` 6. States: 47 merged, 1 closed (#8148 dependabot), 1 open (#8167, held for a defect its reviewer found, unrelated to its tier).
- Authors: `mattbutlerengineering` 36, `app/github-actions` 9, `app/dependabot` 4.
- Source: classifier comments (`**Classified as ...**` by github-actions) and the applied `tier:*` label, joined to the PR. Run records alone do not name the PR (`pull_requests` is empty on nearly every `pull_request` run, verification.md), so each PR's runs were found by its head sha.
- The 9 github-actions-authored PRs have a failed `pull_request` run (a zero-job failure for a bot-authored PR) and a successful `workflow_dispatch` run that classified them, for example #8143: pull_request run 41464219331 `failure`, workflow_dispatch run 41464224219 `success`. The `workflow_dispatch` runs are the real classification.
- Everything below was read from gh output on 2026-11-02/03. No label, comment or workflow was changed.

## Escalations in the window, hand-checked

Six PRs carry an escalation reason, all of them the size rule (`escalate one tier: N review-surface lines added (generated files excluded)`). No keyword escalation fired. No PR in the window mentions secret, credential, leak, rotate or incident in its title or body, so the keyword rule was neither exercised nor shown wrong.

| PR                                       | Run (final head) | Tier before -> after      | Counted lines (gen excluded) | What the counted lines are                | Verdict                |
| ---------------------------------------- | ---------------- | ------------------------- | ---------------------------- | ----------------------------------------- | ---------------------- |
| #8118 guest preview and stranded list    | 41423954866      | T2 -> T3 `tier:sensitive` | 1283 of 1373 (90 generated)  | 914 tests, 338 source, 18 i18n, 13 css    | TP by rule, test-heavy |
| #8130 Step 2 real guest message          | 41440939745      | T3 -> T4 `tier:critical`  | 2102 of 3030 (926 generated) | 1333 tests, 709 source, 60 i18n           | TP                     |
| #8138 word change summaries, clock times | 41451623002      | T3 -> T4 `tier:critical`  | 1368 of 2068 (700 generated) | 772 tests, 427 source, 169 i18n           | TP                     |
| #8142 refusal that wrote nothing         | 41459373272      | T3 -> T4 `tier:critical`  | 1140 of 1456 (316 generated) | 917 tests (one 699-line file), 223 source | TP by rule, test-heavy |
| #8159 reopen one date of a range closure | 41524042096      | T3 -> T4 `tier:critical`  | 1287 of 1623 (336 generated) | 999 tests, 262 source, 26 i18n            | TP by rule, test-heavy |
| #8167 Remove and Edit in Why this day    | 41525961034      | T2 -> T3 `tier:sensitive` | 1140 of 1354 (212 generated) | 577 source, 533 tests, 30 i18n            | TP                     |

Reasons, one line each:

- #8118: 1283 counted lines is over the 1000 line; none of the 90 generated lines was needed to cross it. 914 of the counted lines are tests, which the PRD keeps counting.
- #8130: 2102 counted lines, 709 of them source across a web app and a service; a real large change. The comment text was the same at all three of its classifications (1307, 2081, 2102 counted), so it escalated from the first push.
- #8138: 1368 counted lines with 427 source and 169 i18n; the 700 generated lines were correctly left out and it still clears 1000 by a wide margin.
- #8142: 1140 counted lines, but 699 of them are one test file. It is over the line by the rule; whether the line should treat tests this way is a question for the rule's owner, not an escalation bug.
- #8159: 1287 counted lines; tests are 999 of them. Same note as #8142. The PR first classified T3 (no escalation, comment at 2026-11-02T20:23:09Z) and escalated after a later push added lines (20:59:31Z).
- #8167: 1140 counted lines, over half of them source; a genuine escalation. The PR is still open for an unrelated reviewer-flagged defect.

**Result: 6 escalations, 6 true positives, 0 false positives.** Three of the six (#8118, #8142, #8159) are true positives only under the rule as written: tests are 71% to 91% of their counted lines. The PRD does not exclude tests, so they are not false positives against it. Whether a test-dominated PR deserves a T4 hold is a different question, and this retro cannot answer it from the data: no reviewer cost was measured (see Idea seeds).

### The rule working in the other direction: PRs it did not escalate

Five PRs have more than 1000 total added lines but 1000 or fewer counted lines, and carry no escalation reason. Totals and exclusions recomputed from `gh pr view --json files`:

| PR    | Total | Excluded (generated, mostly `llms-full.txt`) | Counted | Final tier       |
| ----- | ----- | -------------------------------------------- | ------- | ---------------- |
| #8101 | 1185  | 446                                          | 739     | `tier:standard`  |
| #8119 | 1080  | 214                                          | 866     | `tier:sensitive` |
| #8126 | 1276  | 284                                          | 992     | `tier:sensitive` |
| #8135 | 1005  | 230                                          | 775     | `tier:sensitive` |
| #8141 | 1354  | 394                                          | 960     | `tier:sensitive` |

`[INFERENCE]` under the old rule each would have gone up one tier: #8101 to T3 and the other four to T4. These are the generated-churn cases the PRD wants fixed. Two sit close to the line (#8126 at 992, #8141 at 960), so a small test-only push would have flipped them: a threshold edge, not an error.

Two dependabot PRs, #8148 (1249 total, 44 counted) and #8166 (1007 total, 43 counted), are over 1000 on `pnpm-lock.yaml` alone and have no size escalation. They are `tier:critical` anyway through the pulumi path rule, so the size fix changed nothing for their label.

### Optional sample: replay de-escalations from verification.md (not part of the population line)

4 of the 25 replay rows checked by recomputation; 0 of the 4 are false de-escalations.

- #8166: 1007 total, 964 of it `pnpm-lock.yaml`, 43 counted. Correctly no size escalation. Stays T4 by path.
- #8148: 1249 total, 1205 `pnpm-lock.yaml`, 44 counted. Correct, stays T4 by path.
- #7713: 901 total, 829 `pnpm-lock.yaml`, 72 counted. No escalation now is right. A weak check: 901 total is under 1000 yet the replay row shows the old rule escalating, and I did not work out why from additions alone.
- #7996: 3624 total, 844 generated, 2780 counted, still escalates on size. Its body's only security-word mention I found is "...not run locally (needs CI e2e credentials)", a descriptive mention with no incident cue, so the keyword de-escalation is right (I did not confirm that is the sentence the old rule fired on).

The other 21 rows are unchecked. review.md's second minor stays open for them.

## Outcomes vs. intent

The idea's one-sentence success: no PR is escalated a tier by generated lines or a descriptive mention of a security word, while every genuinely large or incident-signalling PR keeps its escalation.

### Criterion 1 (as amended by the Owner 2026-10-18): #6610 -> T4, #6591 stays T4, #6541 no keyword escalation

- What happened: verified by real Classify runs in verification.md (#6610 T4 at 1004 counted, #6591 T4, #6541 T2). In the live window, all six size escalations are over 1000 counted lines, and none rests on a generated line.
- Signal strength: measured (6 of 6 hand-checked; window of 49 PRs).

### Criterion 2: "we leaked the Stripe key and must rotate it" still escalates

- What happened: passed in verification.md by direct run. No PR in the window had incident wording, so the live false-negative side is unobserved, not confirmed.
- Signal strength: measured for the test, unobserved in production. The "genuinely incident-signalling PRs keep their escalation" half of the success sentence has 0 live cases. That is an absence of data, not a result.

### Criterion 3: both decisions live in `scripts/tier-escalation.mjs`, unit-tested, and the workflow calls the module

- What happened: 910 of 911 post-#7078 successful runs ran Load, Classify and Apply (the one exception is a `workflow_dispatch` run on a branch cut before #7078). All 49 window PRs classified without a module error; the 6 `ERR_MODULE_NOT_FOUND` failures are from 2026-10-15/16 only (verification.md).
- Signal strength: measured.

### Criterion 4: 300-PR replay table, every change intended, each pinned

- What happened: the fresh replay found 25 of 300 changed, all de-escalations; 4 sampled here are right. Pins are by shape except #6610, #6541 and #6591 by number.
- Signal strength: pattern for the sample (4 of 25), measured for the table's shape.

### Criterion 5: `docs/change-tiers.md` says generated files don't count

- What happened: it does, with a doc-agreement test. No complaint observed.
- Signal strength: measured (test), anecdote on use.

### Criterion 6: named suites green, lint passes

- What happened: 93 tests in 4 suites passed and lint exited 0 (verification.md).
- Signal strength: measured.

### Overall

- What happened: the classifier now behaves as the PRD asks for the size rule. In 49 PRs it made 6 size escalations, all true under the rule, and it left 5 PRs below the line that the old rule would (per its logic) have raised. It produced 0 observable false positives. The bet is mostly confirmed on size. The keyword rule is unobserved in this window.
- What this retro cannot say: whether Matt's review queue got shorter. Nothing here measures review time, wait time or label overrides; the counts are of classifier verdicts, not of work saved. `[INFERENCE]` the 5 de-escalated PRs saved a human hold each; no run shows who reviewed them or when.

## Run retrospective

- Keep: the hand-check forced by the brief. It turned "885 PRs classified" (a count of verdicts) into "6 escalations, all true", which is the claim the run actually made. Keep: the shape-based pins plus a number-keyed pin for the three named PRs; they are what let Verify re-run cheaply.
- Keep: Verify's re-run from the old verification as a template only, with fresh evidence. It caught nothing stale because it carried nothing over.
- Change: the original fixture claimed "#6610 shape stays T3"; the real shape (988 code + 16 `CLAUDE.md` lines) is T4, and it took Verify on 2026-10-18 to find it. A fixture claiming a real PR's shape should be built from that PR's real `gh` data.
- Change: the 2026-10-18 close-out (Verify, no push) sat on a local branch, 673 commits behind, until 2026-11-02. A 15-day gap meant the Operate window could only be chosen from data after #7078 anyway.
- Stop: nothing. The run is small and each artifact was used.

## Environment

| Mistake                                                                                                                                                                                                            | Evidence                                                                                    | Class      | Proposed carrier                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #6701 shipped a workflow that imported the policy module from the PR-head checkout, so a PR could rewrite its own tier policy, and no path rule covered the module                                                 | verification.md (2026-10-18, as recorded in the brief's "Verify decisions"); fixed by #7078 | mechanical | `scripts/__tests__/tier-classifier-workflow.test.mjs` (already extended by #7078 to pin base-ref load and the T4 module rule)                                                                                     |
| Same class, left open: `scripts/resolve-pr-metadata.mjs` and the workflow file still run PR-head code that feeds the tier; docs say a PR "cannot edit the policy to lower its own tier"                            | review.md Major and Minor 4                                                                 | mechanical | the same workflow test, extended to assert no step under the PR-head checkout executes a repo script before Classify; delivered by `docs/fixes/tier-gate-pr-head-code`                                            |
| The #6610 fixture asserted T3 for a shape that was T4                                                                                                                                                              | brief "Verify decisions" item 4; verification.md criterion 1                                | mechanical | a replay-backed fixture check: `scripts/tier-escalation.mjs replay` already reads real PR files, so a test (or the replay in a scheduled job) can pin named PRs from real data instead of hand-written file lists |
| The replay CLI failed once mid-run (about 14 minutes in) on a transient HTTP 401 and had to restart from zero                                                                                                      | verification.md criterion 4, part 2                                                         | mechanical | `scripts/tier-escalation.mjs replay`: retry per PR or resume; it fails loud already, which is right, but a 17-minute run that restarts at zero is a cost                                                          |
| Size and keyword verdicts cannot be joined to the workflow run that made them; `pull_requests` is empty on nearly every run, so Verify and this retro had to find runs by head sha and read verdicts from comments | verification.md assumption on the post-#6701 count; this retro's window method              | mechanical | `tier-classifier.yml`'s last step (it already posts the comment): add the run id or a machine-readable reason to the comment or to a label, so the hand-check is one query                                        |
| The 2026-10-18 stage output was committed locally and never pushed, and nothing flagged it for 15 days                                                                                                             | brief "Resume 2026-11-02"                                                                   | judgement  | the autorun artifact-committed gate checks `git status` only; a pushed-or-PR-open check would be a protocol change, out of this repo's reach, so it is reported here, not seeded                                  |
| Original session had no `gh`, so its open-PR pre-flight did not run                                                                                                                                                | brief "Pre-flight record"                                                                   | judgement  | none: it was reported as not-run rather than clean, which is the right handling                                                                                                                                   |

## Open debt (counted toward nothing)

- **Owner-deferred MAJOR, still open and live on `main`:** PR-head code (`scripts/resolve-pr-metadata.mjs`, and the workflow file itself under `pull_request`) can steer `tier-classifier.yml` and lower its own PR's tier. Deferred on 2026-11-02 ("Separate fix run, defer here") to the planned maintenance run `docs/fixes/tier-gate-pr-head-code`, which does not exist yet.
- **review.md's 4 deferred minors:**
  1. `**/generated*` and `**/registry.json` exclusions are nameable, so size escalation can be dodged. Not exercised in the window: no PR's generated lines were anything but `llms-full.txt` or `pnpm-lock.yaml`.
  2. The 25 replay de-escalations are pinned by shape only; 4 hand-checked above, 21 not.
  3. The policy-edit T4 rule has no live run (no merged PR has edited `scripts/tier-escalation.mjs` since #7078).
  4. T4 coverage of merge-gate files is partial and overclaimed in `docs/change-tiers.md:28` and the workflow comment; folds into the major's fix.
- None of the above is counted as feedback or as an observed user.

## Idea seeds

Appended to `docs/backlog.md` (the operate skill directs it):

- Decide whether test-dominated PRs should count in full toward the 1000-line size escalation, by measuring it: 3 of the 6 size escalations in #8100..#8175 had 71-91% test lines in their counted total (#8118, #8142, #8159), and #8142's total included one 699-line test file. Pull the reviewer's wait or time-to-label on those against source-heavy escalations before touching the rule.
- Make tier verdicts joinable to the run that made them: put the run id and a machine-readable escalation reason in the `tier-classifier` comment or a label. The hand-check had to join 49 PRs to runs by head sha because `pull_requests` is empty on nearly every run.
- Re-check the keyword rule's false-negative side when a real incident-wording PR lands: 0 of 49 PRs in #8100..#8175 had security wording, so "genuinely incident-signalling PRs keep their escalation" has no live case yet. The first such PR is the test.

## What to measure next

- Rerun this hand-check on the next 20 or more escalations after `docs/fixes/tier-gate-pr-head-code` ships, since that fix changes what feeds the tier.
- Track near-line PRs (counted 900 to 1100): 2 of the 5 de-escalated PRs were within 40 lines of the threshold.
- Count keyword escalations per window. The window held 0, so the rule's live precision is unknown.

## Run complete

2026-11-02. The population line is 1 human reviewer, 49 PRs. The Owner-deferred MAJOR and 4 minors above stay open as the run's own debt; the seeds above are the input to the next Idea-stage run.
