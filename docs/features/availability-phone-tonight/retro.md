---
stage: operate
run: feature:availability-phone-tonight
date: 2026-11-22
users-observed: 0
signal-source: "none: release.md post-release checks were never run, verification.md records no Owner or operator walkthrough, and no issue or PR searched on 2026-11-22 reports use of the phone lines or the Today line"
assumptions:
  - "users-observed is 0, not 1. idea.md counts 'Owner anecdote: 1' as the evidence that motivated the run (a direction, not a use of the shipped thing). Nothing since ship records the Owner or anyone opening the changed page. Every outcome below is therefore `unobserved` or agent stand-in; none reads as adopted or used."
  - "The release is read as 'let it breathe' satisfied only for state, not for use: it merged 2026-11-08T20:35:38Z (14 days ago) but the page has since moved under the availability hub, so a retro now records what the code is in, not how it landed."
  - "The Owner-only post-release checks in release.md were not re-verified here (no browser run on production; the write-back says the same). Nothing below claims they passed."
  - "Issues searched with `gh issue list --search` and `gh pr list --search` (terms below). Search lags (CLAUDE.md gotchas), so zero hits is 'none found', not proof of none."
---

# Retro: Availability on a phone, and what's on tonight

## Outcomes vs. intent

Population: 0 observed. The success sentence ("On a phone, a Manager changes one service's hours without scrolling past the others, and anyone opening Availability sees today's hours and what's in force tonight without leaving the page") is about what a person does on a phone and on the page. With no one observed, no outcome below is "landing"; each records state.

### Success sentence, and PRD 1-10 (phone service lines, Today line)

- What happened: shipped. PR #8538 merged 2026-11-08T20:35:38Z as `b709512c6` (`gh pr view 8538`). The code is still in `main` on 2026-11-22: `apps/hospitality/src/components/availability/TodayLine.tsx` and `useTodayLine.ts` exist, and `AvailabilityHubPage.tsx` and `AvailabilityPage.tsx` both reference `TodayLine` (grep on the fresh checkout). The Availability hub landing (#8810) and the regular-hours address (#8831) came after, so where a Manager now sees the line differs from the demo in idea.md; not re-measured.
- The measured claims are from Verify, not from use: on `705a720e4`, 10 of 10 PRD criteria pass, full e2e 547 of 547, P2 week panel 719.1 px against 2,472.7 px before, T1 0 clicks, T2 1 click (verification.md §Criteria 4, "agent stand-in counts"). Those are fixture measurements at 375x812 in Chromium on mocked APIs. The rebase onto main (#8538) was re-verified only as "1720/1720 availability tests, typecheck, `pnpm regen --check`" in the PR body; the 547 e2e number was not re-run on the rebased head by anything I read.
- Signal strength: unobserved (use). Agent stand-in (layout and counts).

### "Anyone opening Availability sees what's in force tonight"

- What happened: no one is recorded opening it. release.md §Post-release checks lists three Owner checks (header reads "Today · <date> · <hours>"; "Change tonight" opens the Timeline's Tonight panel; the phone week form shows one line per service). It says "Not run", and the 2026-11-22 write-back says they were not re-verified. They remain open.
- Signal strength: unobserved.

### Post-release defects

Searched on 2026-11-22 with `--repo mattbutlerengineering/mattbutlerengineering`:

- `gh issue list --state all --search "availability today line OR phone service lines OR tonight=open"`: 30 results; none names the Today line, phone service lines or the `?tonight=open` link as broken. The nearest are the availability-hub arch follow-ups #9314 and #9317 (open, created 2026-11-21), which are structural, not defects in this feature, and #8797 (closed), five e2e specs failing on every branch from 2026-11-12, whose body suspects the runner clock and "not traced"; no link to this run is stated in what I read.
- `gh issue list --state all --search "\"Today line\" OR TodayLine OR useTodayLine OR \"service lines\""`: 20 results; none about this feature's components.
- `gh issue list --state all --search "availability-phone-tonight"`: 12 results, none created after 2026-11-08 that cites this run.
- `gh pr list --state all --search "TodayLine OR \"Today line\" OR QuickSetupForm OR \"phone\" availability"`: 20 results. The only ones that touch the same surface after ship are #8773 (calm the regular-week form on desktop, merged 2026-11-12) and #8539 (below). Neither names a defect in the phone lines or Today line.
- #8539 (merged 2026-11-08T21:36:25Z, one hour after #8538): the Availability full-page visual baselines (#8532) were taller than the viewport because hidden "Regular week and quick-setup status lines" resolved against the initial containing block. The fix is `.authLayout { position: relative }`. It was found by the baseline regen, not by a user. Whether this run's new status lines contributed is not stated in the PR and I did not trace it, so I do not count it as this run's defect or as feedback.

Count: 0 post-release defects reported by anyone other than the run's own audits. Defects found only by the Owner's own audits add 0 to the population. Absence of reports with 0 users is not evidence the feature works for people.

## Open debt

The run's own deferrals and carry-forwards; never counted as feedback and counted toward nothing.

- Human walkthrough never run (verification.md §Not verified, summary line): "no Owner or operator has walked the changed page"; and no real touch device or on-screen keyboard (M1's keyboard-dismiss behaviour is "inferred from the DOM").
- Post-release checks in release.md (three Owner-only checks above): open.
- Lint warnings rose 239 to 240: one `react-hooks/set-state-in-effect` in `TimelineTonight` (review.md §Minor: deferred).
- `AvailabilityPage.tsx` at 866 lines, over the 800 limit before this run (review.md §Minor: deferred). Already seeded.
- Seeded at idea/PRD time and in the backlog from this run (docs/backlog.md lines 428-430): page uses the calendar date, not the service day, for today; "Starting at" vs "Close early at"; split `AvailabilityPage.tsx`.
- Visual baselines: `/availability` changes by design (verification.md §Not verified). #8559 and #8532 (baseline regens, merged) exist; I did not check which snapshots they cover.
- The label-in-name quirk (review.md §Found by e2e): Chrome computes "Lunch , 11:30 AM..." with a space before the comma; kept as is.

## Run retrospective

- Keep: the Verify budgets as measured numbers in the PRD (P1, P2, T1, T2 with "before" from the base commit). They caught a real miss mid-run: P2 failed at 1,553 px until the Guest preview became one row, and the first Today block failed three calendar first-screen guards, so the design moved into the header's description slot (breakdown.md Notes A5; review.md). Evidence: verification.md §Failures.
- Keep: the independent review pass. It found one major (a forced-open phone line collapsing as its problem was fixed, M1) that the author's own tests had not, and it was fixed with an e2e that types at 375 px (review.md).
- Keep: the stated "rule that a PR waiting on the Owner does not block new work" with the risk named in idea.md. The three-deep stack worked until the base merged (below).
- Change: a stacked release plan must say what happens when the base is squash-merged. release.md's assumption says "GitHub retargets each as its base merges". The retarget did happen (#8533's `baseRefName` now reads `main`), but #8528 was squash-merged at 2026-11-08T19:48:55Z, so #8533's 16 commits sat on a pre-squash base, and per #8538's body it "conflicted in 26 files". A force-push to the branch was blocked (#8533's closing comment), so the fix was a new branch: `git rebase --onto origin/main 6f15dbcb5`, replaying only this feature's commits "with no conflicts" (#8538 body), then a new PR. The replacement merged 42 minutes after the old PR closed (closed 19:53:41Z, merged 20:35:38Z). The release was recoverable and no data was at risk; the cost was one superseded PR, a duplicated CI cycle, and a release.md that named a PR which never merged. Pattern vs anecdote: one observed occurrence in this run; I did not check the other three stacked runs, so this is an anecdote about one run.
- Change: the Ship rollback plan named `git revert <sha>` for "#8533". After the swap, the named PR is wrong; the plan was not revised (release.md still says #8533 14 days later except for the write-back). A reader following it on 2026-11-22 would look for a merge commit that does not exist.
- Change: `prepared` sat 14 days after its named PR closed (closed 2026-11-08T19:53:41Z; write-back PR #9397 merged 2026-11-22T16:10:18Z). The only thing that caught it was this Operate soft gate.
- Change: no human saw the page. The Owner delegated and Verify said so honestly, but "Owner-only checks" stayed open across the whole life of the release. The three checks are about a minute of looking; with 0 observed they are the whole outcome.
- Stop: nothing proposed. The 4-item breakdown with two parallel streams (breakdown.md) was not shown to be a drag.

## Environment

The run's own mistake record: verification.md §Failures, review.md findings, breakdown.md Notes, plus the stacked-release problem from #8533/#8538.

| Mistake                                                                                                                                                           | Evidence                                                                                                                                  | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stacked PR #8533 conflicted in 26 files after its base squash-merged; a force-push was blocked, so the 16 commits moved to a new PR                               | #8538 body; #8533 closing comment; `release.md` assumptions ("GitHub retargets each as its base merges")                                  | judgement  | A `.claude/rules/gotchas.md` CI-section entry for human review: after a stack base squash-merges, replay with `git rebase --onto origin/main <old-base-sha>` onto a new branch and open a replacement PR. (It is a judgement because no check can know a squash is coming.) Proposed only; not written here.                                  |
| `release.md` stayed `prepared` and named a closed PR for 14 days                                                                                                  | `release.md` frontmatter write-back; #8533 `closedAt` 2026-11-08T19:53:41Z; #9397                                                         | mechanical | A scheduled check that reads each `release.md` with `outcome: prepared`, queries its `pending-merge:` PR through the forge CLI, and files an issue when the PR is closed or merged. Grep of `scripts/`, `.github/` and `docs/routines/` for `pending-merge` found no carrier today.                                                           |
| Two fixes after the rebase were commits named "unexport unused TodayLine path and format phone-ton..." and "budget the Close dialog chunk under its new tonig..." | #8538 commit list (`5071b63cd`, `f5361dbff`); `release.md` pre-flight records the ratchet and `regen --check`, not the knip or size lanes | mechanical | `/local-ci-precheck` already has a knip lane and a size lane (`.claude/skills/local-ci-precheck/SKILL.md` steps 3 and 7). Not shown that they were skipped; the commit subjects point at them. The carrier exists; run it at Ship (the `Pipeline Stage Hooks` table in CLAUDE.md already requires it). Not re-measured whether the lanes ran. |
| A forced-open phone line collapsed as its problem was fixed (M1)                                                                                                  | `review.md` §Major                                                                                                                        | judgement  | None new: the independent reviewer caught it. The unit and e2e tests added for the fix are the guard.                                                                                                                                                                                                                                         |
| Phone service-line headers failed axe label-in-name; the first Today block failed three calendar first-screen guards; P2 failed at 1,553 px                       | `verification.md` §Failures; `review.md` §Found by e2e                                                                                    | mechanical | Already caught by the existing e2e (axe, fold-budget, interaction-counter specs). Working as designed; no new carrier.                                                                                                                                                                                                                        |
| Verification of the rebased head was "1720/1720 availability tests, typecheck, regen --check", not the 547-test e2e the release.md cites                          | `release.md` pre-flight (547/547 on the unrebased head) vs #8538 body                                                                     | mechanical | CI re-runs it on the replacement PR; I did not read #8538's CI result. Carrier: `CI Gate` plus the advisory E2E job (gotchas: E2E is advisory). No new carrier proposed.                                                                                                                                                                      |

## Knowledge-base harvest

Skipped. I did not run `kb.py harvest` in this session (the run's session transcripts are not available in this worktree and the plugin's cache path was not exercised). Zero findings is not claimed.

## Idea seeds

Seeds below are not yet in `docs/backlog.md` as of `origin/main` (grepped for `stack`, `retarget`, `force-push`, `pending-merge`, `prepared`, `walkthrough`). Three seeds from this run already exist there (lines 428-430) and are not repeated. This run did not edit `docs/backlog.md`; the caller appends.

- Add a scheduled check that finds a `release.md` with `outcome: prepared` whose `pending-merge:` PR is closed or merged and files an issue naming the run, because #8533 closed on 2026-11-08 and the write-back landed 14 days later in #9397 (from: feature:availability-phone-tonight)
- Give Ship's stacked-release plan a step for the base squash-merging, with the `git rebase --onto origin/main <old-base-sha>` command and a note to update `pending-merge:` and the rollback plan when the PR is replaced, because #8533's release.md assumed "GitHub retargets" and #8538 needed a replacement branch (from: feature:availability-phone-tonight)
- Walk /availability on a real phone once and record it in a file: the week form as one line per service, "Change tonight" opening the Timeline's Tonight panel, and the Today line reading hours and what's in force, because release.md's three Owner-only checks have never run and users-observed is 0 (from: feature:availability-phone-tonight)

## Run complete

2026-11-22. Shipped as #8538 on 2026-11-08 (the named #8533 was superseded). Population is 0 observed: no outcome here counts as landed or used, only as state and agent stand-in measurement. The Owner-only checks were not re-verified. The stacked-release recovery, the 14-day `prepared` gap and the missing walkthrough are carried as seeds above.
