---
stage: operate
run: feature:ship-pr
date: 2026-11-07
users-observed: 0
signal-source: "Read 2026-11-07 against origin/main c4320513d. (1) archive prompt search for 'ship-pr' across all projects (interactive prompts only; subagent and SDK prompts are absent): 2 hits, neither a `/ship-pr <N>` invocation. (2) `git -C $W log origin/main --grep=ship-pr` and `git grep -n -i ship-pr origin/main -- docs/features docs/fixes docs/factory metrics`: no record of a ship-pr run summary. (3) `gh pr view 8211 --json author,mergedBy,autoMergeRequest,reviews,comments`. (4) `gh issue list/search` and `gh pr list --search 'ship-pr in:title,body'`. (5) `git -C $W log origin/main -- .claude/skills/ship-pr CLAUDE.md`. Sentry: not queried, since a markdown skill raises no Sentry events. No usage instrumentation exists for the skill: no log, metric or ledger row is written when it runs."
assumptions:
  - "The population is people. The skill's callers are the Owner and pipeline sessions. A session invocation is a sample, not a person, and the Owner counts only if a record shows him invoking it. No record does, so users-observed is 0."
  - "The archive covers only prompts typed into the interactive editor on this machine. A `/ship-pr` typed elsewhere, or run inside a subagent, would not appear, so 0 is a lower bound on what was recorded, not proof that none happened."
  - "PR #8211's commit body says its N5 PR 'lands through /ship-pr'. That is a recorded intent, not a recorded run. The PR has no ship-pr summary, no reviewer comment and 0 reviews. It is merged by the Owner's account, which is also how every agent merge in this repo appears. It is reported as an anecdote and not counted."
  - "Ship's `release.md` has no `outcome:` field (it predates it). It records the three merges (#6667, #6675, #6794) and I confirmed with `gh` that all three are MERGED, so the soft gate passes."
  - "Open debt is limited to what the run itself deferred (review.md Majors/Minors and release.md Follow-ups). `docs/backlog.md` has no ship-pr seeds, and `gh` finds no issue citing this run's review.md or verification.md."
---

# Retro: /ship-pr project skill

## Outcomes vs. intent

Intent (`idea.md`): any open PR can be carried from green CI to an armed merge with the same gates as a queue PR, in one command. Population: 0 people observed using it (see frontmatter).

### Any open PR is carried from green CI to an armed merge, in one command

- What happened: state only. `.claude/skills/ship-pr/SKILL.md` is on `main` and its CLAUDE.md row became `docs/claude-reference.md:38`. The skill was last changed by #7014 (hold labels, 2026-10-17), and #8466 (2026-11-07) now routes its step 2 through `scripts/fast-path-decision.mjs`. No invocation by a person is recorded. The one possible use is #8211, whose commit body says the PR "lands through /ship-pr"; nothing else corroborates that it did. `release.md` itself recorded this half as "not demonstrated", and nothing since has changed that. The first real run on a green PR, which Review's Minor 5 asked Operate to collect, is still not on record.
- Signal strength: unobserved (one anecdote about #8211, not counted)

### The skill adds no gate logic of its own (PRD criterion 1)

- What happened: held as designed, and the bet is paying off. The skill's step 2 is now a one-line call to `scripts/fast-path-decision.mjs check --pr <N>`, which `#8466` built after `docs/fixes/fast-path-decision/defect.md` named this run's review.md § Minor 2 as part of its intake. The gate decision now lives in one script that both the profile and the skill call. This is state of the code, not use of the skill.
- Signal strength: measured (`git grep` on origin/main for the script call in SKILL.md and the defect.md intake line)

### A reviewer FLAG, a non-green CI state or a hold never arms auto-merge (PRD criteria 3 and 4)

- What happened: the text now reads that way. Review found that the `needs-review` hold was dropped by the skill's own steps (Major 1). #7014 (`maintenance:ship-pr-hold-labels`) fixed it 2026-10-17, the same day the Owner reversed the deferral, and step 1 now stops with `held — <label>` for labels on the PR or a linked issue. No run has exercised the stop.
- Signal strength: unobserved

### Drift checks pass (PRD criterion 7) and the skill resolves

- What happened: the checks were green at Ship. Since then CLAUDE.md was cut from 49 KB to about 8 KB (#7546, #7572), and the `/ship-pr` row moved to `docs/claude-reference.md`. I did not re-run the checks (read-only retro), so I make no claim that they are still green today. The row is present in `docs/claude-reference.md:38`.
- Signal strength: unobserved for today; measured at Ship (`release.md` § Post-release checks)

### Did the sibling defect escape this run's pipeline?

`docs/fixes/ship-pr-hold-labels/` fixed Major 1 of this run's own `review.md`. It is a defect that **Review caught, not one that escaped to a user**: it was recorded before any invocation, and the retro on that run is written separately. What this run's pipeline did miss is that Verify's dry walk-through (WO-0019) picked a PR with no `needs-review` label. It found the `qualifiesForLowRiskFastPath` defect for gate paths and `needs-review` in step 4, fixed step 4 only, and never asked what the skill does with the same label at the merge step. The same class of input (a hold) was tested for one step and not for the other. The gap was closed by Review, three days later, after merge.

## Open debt

The run's own deferrals (review.md and release.md Follow-ups), counted toward nothing. No tracker issue was filed for them: release.md says "proposed backlog lines in text only", and `docs/backlog.md` has no ship-pr lines. State read from `origin/main`:

- Major 1, `needs-review` hold: **fixed** by #7014 (merged 2026-10-17), with Minors 1, 3 and 4 folded in.
- Minor 2, the classifier call recipe: **fixed** by #8466 (merged 2026-11-07), in `scripts/fast-path-decision.mjs`.
- Minor 5, first real green-PR run as evidence: **open**, and this retro could not collect it (population 0).
- Minor 6, stale `gate-unattributed` sentence at `.claude/implement-queue.md:134` ("not-yet-implemented" ci.yml fix, which landed in #4025): **open**. The sentence is still on `origin/main`.
- Release follow-up, `local-ci-precheck` parallel lanes race on `packages/rialto/dist`: **open**. `.claude/skills/local-ci-precheck/SKILL.md` still says steps 2-5 run in parallel. No issue exists. #7014's release.md also had to run the lanes sequentially to avoid it.
- Issue #6639 (the run's seed): closed 2026-10-15.

## Run retrospective

- Keep: the autorun brief's measured problem (#6591 sat green with no carrier) and its "no second implementation of the gate" constraint. They are why the skill is 143 lines of pointers and why #8466 could replace its prose with a script call. The read-only dry walk-through (WO-0019) also earned its keep: running the real scripts against a real PR found a defect that a reading of the skill had not.
- Change: Verify should walk every hold, not one. A criterion of "a hold stops the merge" needs one fixture per hold type (draft, `needs-review`, gate path, linked-issue label), as the localization retro seeded for lint rules. The dry run used a PR with only `tier:standard`.
- Change: a skill with no invocation record cannot be retro'd. This retro answers "what is the state" and cannot answer "does it work". The first run's reviewer dispatch, CLEAN-direct merge and `[Merge Without Review]` stop remain unobserved four weeks after release. Ship asked Operate to collect that evidence, and Operate has nothing to read.
- Change: Ship recorded eight follow-ups only as text in release.md. Two of them (Minor 6, the precheck race) are still open with no owner. This repeats the seed already in `docs/backlog.md` ("Make Review deferrals trackable").
- Stop: nothing. The stages ran proportionately for a one-file markdown change. The soft-gated Review after merge was the right call, since it found Major 1.

## Environment

| Mistake                                                                                                                                                       | Evidence                                         | Class      | Proposed carrier                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 4 delegated to `qualifiesForLowRiskFastPath`, which returned true for a PR that matched gate paths and carried `needs-review`; step 5 held only in prose | `verification.md` § Skill defect found and fixed | mechanical | `scripts/fast-path-decision.mjs` (#8466) folds the label, gate-path and freshness checks into one decision. Verified present; the remaining gap is a test asserting `needs-review` yields `fastPath: false`, which belongs in that script's own tests |
| Skill's own steps dropped the `needs-review` hold, so a PASS could arm or merge a held PR                                                                     | `review.md` § Major 1                            | judgement  | A hold list is read by an agent from prose. The existing carrier is the step-1 text added by #7014. Nothing mechanical can read a skill's steps; a test that runs the skill against a held fixture PR does not exist                                  |
| Gate-path and fast-path steps gave the agent no callable form for the functions                                                                               | `review.md` § Minor 2                            | mechanical | `scripts/fast-path-decision.mjs` (#8466); done                                                                                                                                                                                                        |
| Step 2 wrongly said `classifyCiGateStatus` depends on the agent-core dist                                                                                     | `review.md` § Minor 3                            | judgement  | Fixed in #7014 by rewording. No checker can compare a skill's claim to the code it describes                                                                                                                                                          |
| Step 4 restated the profile's gate-path and `needs-review` rules in prose, a copy that can drift                                                              | `review.md` § Minor 4                            | mechanical | Resolved by #8466: the skill points to the script rather than restating                                                                                                                                                                               |
| Step 4 handed the agent queue-only inputs (AC, worktree, retry) an ad-hoc PR lacks                                                                            | `review.md` § Minor 1                            | judgement  | #7014 folded it in. No checker exists, and the 1st real run is the only test                                                                                                                                                                          |
| `.claude/implement-queue.md:134` calls an already-landed fix unimplemented                                                                                    | `review.md` § Minor 6                            | judgement  | `detect-instruction-rot.mjs` (`ci.yml:380`) runs but does not compare two instruction files for contradiction. Left to a reader via `/claude-md-improver`                                                                                             |
| Parallel lanes in `local-ci-precheck` race on `packages/rialto/dist` (ENOENT `useThemeState.d.ts`)                                                            | `release.md` § Pre-flight                        | mechanical | `.claude/skills/local-ci-precheck/SKILL.md` step order: build shared deps once before fanning out. No hook or CI job runs the skill, so the race only hurts the human                                                                                 |
| ~20 `scripts` suites fail to load in a bare worktree                                                                                                          | `verification.md` § WO-0018                      | mechanical | I did not verify whether any CI job runs the `scripts` suite. No carrier tells a bare worktree to build first, so the 20 failures are unattributed                                                                                                    |

Finding: the gates this run depends on, `scripts/check-skill-references.mjs` and `scripts/check-claude-md-table-drift.mjs`, are referenced in no `.github/workflows/*.yml` and no `.husky/*` hook. `git grep` of `.github`, `.husky` and `package.json` finds only the `check:claude-md-table-drift` package script, and `check-skill-references.mjs` appears nowhere there. They ran because the skill told the author to run them. Of the three instruction checks named in `verification.md` § WO-0018, only `detect-instruction-rot.mjs` runs in CI (`ci.yml:380`). A change that adds a skill or a CLAUDE.md row can merge without either check having run.

## Idea seeds

- Wire `scripts/check-skill-references.mjs` and `scripts/check-claude-md-table-drift.mjs` into a CI job or the pre-push hook, since neither runs anywhere today; measure how many of the last 30 merged PRs touching `.claude/skills/**` or CLAUDE.md would have failed either check (from: feature:ship-pr)
- Record every `/ship-pr` run: one line per invocation (PR, CI classification, reviewers, verdicts, merge action, stop reason) appended to a log such as `metrics/` or the PR itself, so the next retro counts runs, and sessions that stop at `held` or `[Merge Without Review]` are visible; measure invocations per week against PRs merged by hand (from: feature:ship-pr)
- Run `/ship-pr` once on a real green PR and record the reviewer dispatch, the `--auto` or CLEAN-direct merge and the `[Merge Without Review]` stop as end-to-end evidence (review Minor 5), and run it once each on a `needs-review` PR and a draft PR to confirm the holds stop it (from: feature:ship-pr)
- Confirm whether PR #8211 landed through `/ship-pr`, by finding the N5 session's transcript or its summary, and count how many of the PRs merged since 2026-10-17 with `tier:trivial` or `tier:standard` and 0 reviews were carried by it versus merged by hand (from: feature:ship-pr)
- Correct `.claude/implement-queue.md:134` ("not-yet-implemented" `ci.yml` commit-status fix, landed in #4025, confirmed 2026-08-24); measure with a grep for the sentence (from: feature:ship-pr)
- Make `local-ci-precheck` build shared deps once before its parallel lanes, or run lint and typecheck sequentially, then rerun it five times and count ENOENT failures on `packages/rialto/dist` (from: feature:ship-pr)
- Test `scripts/fast-path-decision.mjs` with one failing fixture per hold shape (`needs-review` label, gate-path file, stale dist, linked-issue hold label) and count how many of the four have a case today (from: feature:ship-pr)

## Run complete

Closed 2026-11-07. The skill is on `main` and has been changed by two later runs (#7014, #8466), but no person's use of it is on record, so the bet "any open PR, one command" is unobserved, not proven. The seeds above are the input to the next Idea-stage run.
