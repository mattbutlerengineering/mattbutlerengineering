---
stage: operate
run: feature:availability-setup-hierarchy
date: 2026-11-22
users-observed: 0
signal-source: "none: no analytics, support inbox or live Owner use of the shipped page was found in this session; release.md's Owner-only post-release checks were not re-verified, and the only post-ship signals are the Owner's own rendered audit of 2026-11-11 (#8696, run on a mocked venue) and CI"
assumptions:
  - "release.md reads `outcome: released` on origin/main (frontmatter `released-at: 2026-11-08`, `write-back: 2026-11-22`), so the Operate soft gate is satisfied. The write-back was made from the merged state of #8511 (gh pr view: MERGED 2026-11-08T19:13:24Z, merge commit 0687154baaf4cc1fab0eb6be2f49d8118e04e3a6, closingIssuesReferences empty), not from any live check."
  - "users-observed is 0, not 1. The Owner's 2026-11-11 audit (#8696) ran on a mocked venue with a fake OIDC session by its own text ('Auth0, the real API and production data were not exercised'), so it is the builder's tooling, not use of the shipped page in production. Per the protocol, post-ship defects reported only by the Owner's own audits add 0 to the population."
  - "The 41-row `gh issue list --search 'availability created:>=2026-11-08'` result is a loose keyword match. Only the rows named below were read; the rest (metrics, rialto, marketing, CI housekeeping) were judged unrelated from their titles and were not opened."
  - "The knowledge-base harvest hook (CLAUDE.md, Pipeline Stage Hooks, `operate` row) was not run in this session. Skipped: this retro was written by one of four parallel Operate agents for a stack of runs that shipped together, and the harvest is a repo-wide, session-transcript pass that belongs to the Owner's own session. No gotchas.md entries are proposed."
  - "The run's work reached main twice: nine PRs on 2026-11-07/08 (#8483-#8489, #8493, #8499) and the amendment as #8511 on 2026-11-08, per release.md assumptions. This retro covers both; Verify and Review covered only the amendment."
---

# Retro: Availability setup hierarchy (calm, consistent Availability)

## Outcomes vs. intent

Population: zero people observed. Nothing below reads as landing, adopted or used. "What happened" records the state of the shipped work and of main, not use.

### Success sentence (idea.md, amended): "A Manager who finishes onboarding opens `/availability` and recognises the same first screen with their own hours, and can add a second schedule or a special date without help, while every control that exists today is still reachable."

- What happened: verification.md, on commit `b8e2511ee`, records 21 of 24 PRD criteria PASS, 0 FAIL and 3 NOT RUN (criteria 2, 3, 9), all on mocked APIs with a fake OIDC session. The amendment's own bar (criteria 14-18, 23) passed there. #8511 merged 2026-11-08. Since then main has moved: `apps/hospitality/src/main.tsx` on origin/main mounts an `AvailabilityHubPage` as the index of `/availability` ("The hub is the index; today's page is mounted at `calendar`"), `/setup/hours` redirects to the hub, and #8810 ("the Availability hub is the landing page", merged 2026-11-13) and #8902 ("Availability map, Venue Setup moved under the Availability hub", merged 2026-11-15) belong to a later availability-hub run. So the literal first screen this success sentence describes is no longer what `/availability` opens on in current main. `RegularWeekPanel.tsx` and `SchedulesTab.tsx` still exist on main. Where a Manager now reaches the week form (an editor route `hours` exists in `main.tsx`) was not walked in this session.
- Signal strength: unobserved. No Manager was observed on the live page, and the page the sentence describes was superseded within five days.

### PRD criteria 1-4, 9 (the acceptance bar for the 2026-11-07 hub work) and criteria 14-18, 23 (the amendment's)

- What happened: criteria 1, 4-8, 10-24 PASS in verification.md; criteria 2 (the "before" editor count), 3 (the `7c051456f` interaction baseline and the Owner's hand-timed 5-minute setup) and 9 (the hub demo as one script) are NOT RUN. Breakdown item 10 stays unchecked. The reason recorded is that a worktree at `7c051456f` could not run (`does not provide an export named decodeWeek`).
- Signal strength: measured on mocks only (interaction counts from `e2e/helpers/interaction-counter.ts`), not on a real venue.

### Owner-only post-release checks from release.md

- What happened: not re-verified. release.md lists three (a Manager sees Schedules with the regular week and 7 controls outside it; Calendar and Special dates one click away; a Host sees Calendar, Special dates and a ⋯). The write-back says so explicitly. This retro does not claim they passed. They also describe a page that main has since changed (see above), so a check run today would test the hub, not this run's first layer.
- Signal strength: unobserved.

### Visual baselines

- What happened: release.md expected four advisory visual failures (`availability@1280x720`, `availability@375x812`, `setup@1280x720`, `setup@375x812`) and a `visual-baseline-regen.yml` PR after merge. Whether that PR was opened and merged was not checked.
- Signal strength: unobserved.

## Post-release defects

All three groups below are the Owner's or automation's own findings, so they add 0 to the population.

- **Defects in this run's surface, found by the Owner's 2026-11-11 audit (#8696, tracking; closed):**
  - #8688 (closed 2026-11-13): "every regular-week save leaves the old week under Other schedules". Its evidence names `RegularWeekPanel` pinning `fixedStart: today`, the panel this run built. After three saves it shows three rows under Other schedules.
  - #8686 (closed): "a service chip can place Brunch at 11 PM and save it". Its evidence says `availability-scenarios` S3 passes because it asserts the weekdays, not the hours, and cites this run's `prd.md` criterion 18 budget. verification.md's S3 row records only the interaction count (5 against a budget of 6).
  - Signal strength: anecdote (one audit, mocked venue, one person's tooling). Two defects in the first post-ship walk of the same surface is a small sample, not a rate.
- **Advisory CI failures on availability specs, not this run's feedback:** #8581 (closed 2026-11-09; the failing spec is the same "Escape on Go to date puts focus back on the menu button" test that release.md seeded as a pre-existing race; its first failing commit is #8539, a sibling run's PR) and #8797 (closed 2026-11-12; five availability e2e tests red on every branch, suspected runner-clock dependence, "not traced"). Whether the underlying race was fixed was not checked.
- **A false alarm:** #8534 (filed 2026-11-08T19:21Z, after the merge) reported `tools/route-contract` failing typecheck on `DateRuleRow.sectionId` and blamed #8487. It was closed not-planned: the drain routine found it not reproducible after a fresh install and read `section: never` as a stale generated Prisma client.
- Counts: 2 defects in this run's surface (#8686, #8688), both closed; 0 reported by anyone other than the Owner's own audit; 0 open that name this run.

## Open debt

The run's own items, never counted as feedback.

- `docs/backlog.md` already carries the Go to date Escape race seeded by this run's Ship (line "Fix the pre-existing race in availability-regular-week.spec.ts", from: feature:availability-setup-hierarchy). Not re-seeded.
- The run's child issues #8472-#8482 and #8522 (created before the merge; all closed) are its own.
- NOT RUN in verification.md: criteria 2, 3, 9, breakdown item 10, `visual.spec.ts`, and Auth0/real API/production data. Nothing since has run them.
- The "from today" default on a regular-week edit reverses availability-config-usability `ux.md:200` and is flagged for the Owner in verification.md criterion 17; no Owner answer was found in this session.
- review.md's module-shape note: `AvailabilityPage.tsx` at about 840 lines is a `deepen` candidate. A sibling run's seed (phone-tonight) already covers splitting it.
- The 2026-11-07 hub PRs (#8483-#8489, #8493, #8499) were never run-level reviewed (review.md assumptions).

## Run retrospective

- Keep: the interaction-counted scenario suite (S1-S10) as the way to turn "overwhelming" into numbers. It found two real product bugs during Verify (the Close dialog's To picker month, the inverted range), fixed rather than budgeted away (verification.md §Criterion 18, review.md §Passes).
- Keep: the independent reviewer. It found four majors (R1-R4: stale panel, venue-switch settling, settling with no exit, seed leaking days) that unit tests had not, and each fix landed with a red-first test. R4's first fix over-blocked a supported case (C13) and was corrected in `b8e2511ee`, which e2e caught.
- Change: S1-S10 measure steps, not what is saved. S3 passed while the saved Brunch time could be wrong (#8686). A scenario should end by asserting the request body, not only the count.
- Change: Verify cannot measure a "before" number if the old commit will not run. Criteria 2 and 3 named `7c051456f` as the baseline and the worktree could not build it, leaving three criteria and one breakdown item NOT RUN. A baseline that must come from an old commit should be recorded before the change lands.
- Change: the run asked for a page that, five days after merge, a later run replaced as the landing. The idea's own "run churn" unknown anticipated churn inside the run, not from the next one. With one Owner and no operator, a first layer designed for Managers was never put in front of one before the hub redesign began.
- Stop: nothing proposed. The Ship "prepare and stop" shape was correct (no release authorization), but its cost shows: release.md sat at `prepared` for 14 days after #8511 merged, until today's write-back.

## Environment

| Mistake                                                                                               | Evidence                                                                                                              | Class      | Proposed carrier                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario S3 passed on interaction count while Brunch could save at 11 PM to 3 AM                      | #8686 body ("S3 passes because it asserts the weekdays, not the hours"); verification.md §Criterion 18 table row S3   | mechanical | `apps/hospitality/e2e/availability-scenarios.spec.ts`: each S1-S10 test asserts the saved request body, beside the interaction counter.                                                        |
| Every regular-week save left a leftover row under Other schedules; unit and mocked e2e did not see it | #8688 body (found through the real `applyChanges` and `serveSharedConfig`); verification.md frontmatter (mocked APIs) | mechanical | The e2e `serveSharedConfig` helper the audit used: a spec that saves the regular week three times through it and asserts zero rows under Other schedules.                                      |
| "Before" baselines for criteria 2, 3 and item 10 could not be produced                                | verification.md §Criterion 2 and §Not verified                                                                        | judgement  | `availability-interaction-baselines.spec.ts`: record the old-commit counts as constants at PRD time, so Verify compares to a number, not a worktree.                                           |
| Four review majors (R1-R4) were state-machine gaps found by a reader, not by a test                   | review.md §R1-R4                                                                                                      | judgement  | The existing `reviewer` pass, which caught them. No new carrier: the pass worked as designed.                                                                                                  |
| release.md stayed `prepared` for 14 days after the merge                                              | release.md `write-back:` (2026-11-22) against `mergedAt` 2026-11-08T19:13:24Z                                         | mechanical | Already seeded in `docs/backlog.md` ("Make Ship's post-merge record land", from: maintenance:api-client-route-contract). Not re-seeded.                                                        |
| A release-log push through `\| grep` never ran and the remote stayed at the old SHA until re-run      | release.md §Release log step 7                                                                                        | judgement  | `.claude/rules/gotchas.md`, Shell (zsh) section, currently names only `$status`; the pipe-masks-exit-code lesson lives in user memory, not in the repo rules.                                  |
| The success sentence described a screen that the next run replaced                                    | `main.tsx` on origin/main; #8810, #8902                                                                               | judgement  | The Idea-stage "work in flight" check. It found no work in flight on 2026-11-07, and the hub redesign began after the run's release. No carrier fits a future decision; recorded as a finding. |

## Idea seeds

- Make the availability scenario specs assert the saved request body, not only the interaction count: S3 passed at 5 of 6 steps while a Brunch chip could save at 11:00 PM to 3:00 AM (#8686); measure how many of S1-S10 in `availability-scenarios.spec.ts` assert only the count today.
- Re-measure whether a Manager who finishes onboarding recognises where they land: the onboarding hours step and launch review still say "Change it any time in Availability → Schedules" (`en-US.json` lines 86 and 158 on origin/main) while `/availability` now opens on the hub; run the three release.md post-release checks against the deployed site, rewritten for the hub, with a person and record the outcome in a file.
- Record "before" numbers for a comparison criterion as committed constants at PRD time, not as a worktree at an old commit: criteria 2 and 3 of this run stayed NOT RUN because `7c051456f` would not build; count how many `verification.md` files on main carry a NOT RUN for a baseline that could not be rebuilt.

## Run complete

2026-11-22. Population: 0. The run's work is merged and its own checks passed on mocks, but no Manager has been observed on it, its Owner-only post-release checks were not re-verified, and main's `/availability` has since become the hub, so the success sentence's first screen no longer describes the landing page. Two defects in the shipped surface (#8686, #8688) were found by the Owner's own audit and closed. Seeds above are the input to the next Idea-stage run.
