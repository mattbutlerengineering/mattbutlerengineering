---
stage: operate
run: feature:availability-holidays-copy
date: 2026-11-22
users-observed: 0
signal-source: "none: no analytics, support inbox or operator contact is recorded for this run; verification.md records no Owner or operator walkthrough, and the post-ship issues found (#8691, #8692, #8696) are the Owner's own rendered audit on fixtures, not use"
assumptions:
  - "users-observed is 0. Nothing read in this session shows a person using the shipped holiday lines or Copy dialog. The Owner's audit of 2026-11-11 (#8691, #8692) drove the UI on a dev server with a fake session and e2e mocks, which is a test of the interface, not use; per the protocol it adds 0."
  - "release.md was `prepared` until 2026-11-22, when a write-back PR (#9397) set `outcome: released` from the merged state of #8541 (merged 2026-11-09T02:00:41Z, read with gh pr view). The Owner-only post-release checks in release.md (Special dates one line per holiday, a second device sees Decided, Copy offers Copy to... and Every week...) were NOT re-verified by that write-back and were not re-verified here. This retro does not claim they passed."
  - "The run's own artifacts were read from origin/main at 6df1ce742 (fetched this session; ls-remote agrees)."
  - "Counts come from gh and python reads made in this session; no deployed page, Sentry or production data was queried."
---

# Retro: Holiday decisions that stick, and Copy that says what it does

## Outcomes vs. intent

Population: 0 observed. Every outcome below therefore records the state the work is in, never that it landed or was used. The only signal that exists is automated tests, one post-merge CI failure and the Owner's own fixture audit.

### Success sentence (idea.md): "A Manager decides the year's holidays once, in a few taps, and every colleague sees the same decisions. Copying a day's hours says exactly what will change and never leaves 'Special hours' on normal days."

- What happened: shipped in #8541 (merged 2026-11-09T02:00:41Z, 89 files changed, +8856/-990, `closingIssuesReferences` empty). verification.md records 12 of 12 criteria PASS on mocked APIs, with "no Owner or operator walkthrough" and "Auth0, the real API and production data" under Not verified. No evidence in this session that any Manager has made a holiday decision in production or copied hours with the new dialog. The "second Manager sees the same decision" claim rests on one two-browser-context e2e (H2) against an in-memory mock (`shared-config-mock.ts`, breakdown D1), not on a real second device.
- Signal strength: unobserved.

### PRD 1, 2, 5 (one decision per holiday, usual closures in one tap, Decided group) and 10 (honest failure)

- What happened: built and covered by component and e2e tests (verification.md criteria 1, 2, 5, 10). The surface did not stay as shipped: #8772 (merged 2026-11-12) put the venue's own dates first and folded holidays into one "Plan holidays" line, and #8956 (merged 2026-11-16) changed the Add special dates sheet's Special hours path to hand off to the day editor. Both are later runs' work. `UpcomingHolidays.tsx`, `HolidayLine.tsx` and `use-holiday-decision.ts` still exist on main.
- Signal strength: unobserved (tests only).

### PRD 3 (saved to the venue) and 4 (guests unaffected)

- What happened: the table `venue_holiday_decisions` and its three routes exist in `services/reservations/src` on main. Verification ran them against a real Postgres 15 (157 passed, including RLS isolation, cascade and a 12-way concurrent set). Criterion 4 is "by construction": the decision is in its own table, outside the availability config. Whether any production venue has a row was not queried.
- Signal strength: unobserved.

### PRD 6, 7, 8 (Copy says which, says what changes, already the same)

- What happened: the dialog shipped as `CopyDayAction.tsx` with `copy-week-draft.ts`. #8825 (merged 2026-11-13, availability-hub A0.3) renamed the button to "Copy hours…" and pinned K1 = 7 and K2 = 6 with ten characterization tests; its body says no dialog, draft builder or save path changed. So the run's Copy behaviour survives under a new name.
- Signal strength: unobserved.

### PRD 9 (scenario budgets) and the budget amendments

- What happened: measured on fixtures only (verification.md: "agent stand-in counts"). Three budgets were changed after the PRD was written: K1 to <= 7, H1 to <= 4 and H3 to before + 1 (prd.md criterion 9). verification.md's table still lists H1 and H3 against the original <= 3 and <= 5 budgets and shows H1 = 2, H3 = 5, while prd.md records H1 = 4 and H3 = before + 1 from the #8692 counting. The two artifacts disagree on the same counter; this was not reconciled here. #8775 also noted spec titles for H2 and H3 that did not match what they assert; the titles were fixed (closed 2026-11-15).
- Signal strength: unobserved (stand-in counts, two artifacts that disagree).

### PRD 11 (locales: en-US, es-MX, fr-CA)

- What happened, measured here by flattening the three catalogs on main: `availabilitySpecial.holidays.*` has 70 keys in each of en-US, es-MX and fr-CA with none missing. `availabilitySchedules.copy.*` has 18 keys in en-US and 21 in each of es-MX and fr-CA (extra plural forms), none missing. So the locale files are complete by key. Strings identical to en-US: es-MX 4 (`holidays.group`, which is a format string, plus `name.boxingDay`, `name.juneteenth`, `name.memorialDay`); fr-CA 3 (`holidays.group`, `name.juneteenth`, `name.memorialDay`); none in the copy namespace. I did not judge whether those are correct as-is.
- Native-speaker review: none recorded. `grep -i native` over `docs/features/availability-holidays-copy/` returns nothing. The only translation scrutiny recorded is review.md n7, where the `reviewer` subagent corrected fr-CA "Action de grâces" and "Dates spéciales", es-MX "Fechas especiales" and plural forms; a subagent is not a native-speaker read. verification.md criterion 11 rests on `check-i18n-catalogs` (keys, placeholders, plural forms), unit key parity and `locale-sweep.spec.ts`, none of which judges wording. The backlog already holds a seed for the native-speaker read of the es-MX and fr-CA availability strings (from: feature:availability-config-usability), so no new seed is added.
- Signal strength: unobserved for wording; measured for key parity.

## Post-release defects

Searched with `gh issue list` and `gh pr list` (repo mattbutlerengineering/mattbutlerengineering, `holiday`, `open as usual`, `Copy to other days`, `availability-holidays-copy`, created after 2026-11-09).

- Defects in this run's own work found after merge: 1. #8581 (opened 2026-11-09T12:06Z, closed 15:08Z by #8583): E2E Screenshots failed on 7 consecutive main commits; one of the two failing specs was this run's H2. Cause per #8583: the second Manager's page booted on the real clock and then pinned it to Dec 1, 2026, so a short-lived CI Auth0 token looked weeks expired and the app showed Sign In. Test-only fix, no product code. Not feedback; a verification gap (see Environment).
- Defect issues from users: 0 found. No issue or PR in the search reports a Manager hitting a holiday-decision or Copy problem.
- Issues that name this run: #8691, #8692, #8696 (tracking), all 2026-11-11 and closed, are the Owner's rendered audit "at dabfb6c1e ... Dev server with a fake OIDC session". They propose reversing parts of this run (#8692: "Moving holidays below the venue's dates and adding a confirmation reverses part of that"; #8691: one copy action with a choice inside). They add 0 to the population. #8775 (2026-11-12) is review follow-ups for #8772, naming this run's spec titles; created after the run's merge but not from this run's review.md, and also 0.
- #9315 (architecture review, 2026-11-20) lists `use-holiday-decision.ts` among five writers that bypass `useScheduleSave` with hand-rolled refusal handling. That is design debt from this run's choice, found by a later audit, 0 to the population.

## Open debt

Issues this run itself filed or deferred. None were filed as GitHub issues for this run in what I searched; its debt lives in review.md and backlog seeds.

- review.md n4: after a decision saves, the line's status clears before the decisions refetch lands, so it can flash undecided briefly. Deferred from Review; belongs in the shared `createMutationHook`. Not re-checked here.
- verification.md Not verified: no Owner or operator walkthrough; Auth0, real API and production data; the deploy window with an older server (404/405 path tested, not exercised against a real older server); visual baselines changed by design.
- release.md Post-release checks: the two Manager checks on /hospitality/availability are not re-verified (see assumptions).
- Backlog seeds already filed from this run: fold old repeating Copy rules into the regular week; the availability-close.spec.ts timeout.
- Not migrated by design (idea.md, prd.md out of scope): "Open as usual" marks already in browsers reappear once, undecided.

## Run retrospective

- Keep: the Decompose stage's correction of the PRD. prd.md assumed "No SQL migration"; breakdown.md Notes (2026-11-08) records that architecture.md corrected this to one `CREATE TABLE` migration with RLS and grants, and that the first design (a new `open_as_usual` DateRule kind) was replaced by a separate table because it would make old tabs fail to parse the config and make a server rollback fail every date-rule read. That is the design choice that kept the release rollback two-way (release.md Rollback plan).
- Keep: the independent Review. review.md found four majors that tests had not, each fixed with a test: the same-date concurrent PUT 500 (reproduced 1 of 3 runs without the fix), a second Closed press dropped, Copy naming a closed day as getting the hours, and Closed to Special hours reopening the venue before the sheet.
- Change: Verify marked 12 of 12 PASS on a locally faked session while stating that CI re-runs with the real one; the CI run then failed H2 on the same day (#8581, 7 consecutive red main commits). A criterion that depends on the CI session should stay open until that run is seen, or the local fake should reproduce the CI token lifetime. #8583 reports the failure reproduces locally with `expires_at = now + 1h`.
- Change: budgets were amended in prd.md after the fact in three places while verification.md kept the original table. Update one place or cross-reference.
- Change: this run, like its three siblings, shipped Prepared and stopped (release.md: "No release authorization"), then was written back 13 days later. The UI was reshaped by #8772, #8825 and #8956 in between, so a retro now judges a surface that differs from what Verify tested.
- Stop: nothing proposed.

## Environment

| Mistake                                                                                                                                                       | Evidence                                               | Class      | Proposed carrier                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-date concurrent set returned 500: `upsert({ update: {} })` compiles to SELECT then INSERT, so one request hits P2002                                     | `review.md` major 1; `breakdown.md` Notes A2           | mechanical | The antipattern ratchet (`check-ai-antipatterns`), with a pattern for `update: {}` outside `prisma/seed.ts` and tests. Whether it accepts custom patterns was not checked. `services/users/src/services/user.ts:90` still has `update: {}` in a production path.           |
| Second Manager's e2e context booted on the real clock then pinned it; a short-lived CI token made the page sign out; main red 7 commits                       | `#8581`, `#8583` body; `verification.md` assumptions   | mechanical | `apps/hospitality/e2e/helpers/scenario-fixtures.ts` (the helper that already pins clocks): make context creation pin the clock and re-date the stored session before first load, and give the local fake session a short-lived token so the CI failure reproduces locally. |
| A second Closed press was dropped or mis-attributed while the first saved                                                                                     | `review.md` major 2                                    | judgement  | The `reviewer` agent already caught it. No new carrier proposed.                                                                                                                                                                                                           |
| Copy named a day under a whole-day closure as getting the hours                                                                                               | `review.md` major 3                                    | judgement  | Same: caught by `reviewer`.                                                                                                                                                                                                                                                |
| Closed to Special hours reopened the venue before the sheet, so Cancel left it bookable                                                                       | `review.md` major 4                                    | judgement  | Same: caught by `reviewer`.                                                                                                                                                                                                                                                |
| PRD said "No SQL migration"; a migration was needed                                                                                                           | `prd.md` assumptions; `breakdown.md` Notes (Decompose) | judgement  | The Architect/Decompose stages caught it; no carrier proposed.                                                                                                                                                                                                             |
| PRD budgets amended after the fact and verification.md's table kept the originals; spec titles for H2 and H3 did not match their assertions (fixed via #8775) | `prd.md` criterion 9; `verification.md` §9; `#8775`    | judgement  | None existing for budget tables across artifacts. Noted, not proposed.                                                                                                                                                                                                     |
| Locale wording has no deterministic check; criterion 11 passed on keys, placeholders and plurals                                                              | `verification.md` §11; `review.md` n7                  | judgement  | The existing backlog seed for a native-speaker read (from: feature:availability-config-usability).                                                                                                                                                                         |
| Run's release sat `prepared` for 13 days while three later runs reshaped its UI                                                                               | `release.md` frontmatter; #8772, #8825, #8956          | judgement  | The Ship `prepared` outcome and its write-back (#9397) already exist; nothing new.                                                                                                                                                                                         |

## Knowledge-base harvest

Not run: this retro was written by a docs-only subagent without the harvest tool or access to the session transcripts. Skipped, not zero findings. No `gotchas.md` entry is proposed.

## Seeds for next ideas

- Make the e2e second-context helper pin the clock and re-date the stored session before the page's first load, and make the local fake session's token short-lived like CI's (`expires_at = now + 1h`), so a failure like #8581 (H2 signed out on a real-clock boot) fails locally; measure by reverting #8583's fix and watching the spec fail locally (from: feature:availability-holidays-copy)
- Check whether `services/users/src/services/user.ts:90` (`findOrCreate`, `upsert` with `update: {}`) can still race to a unique violation as the holiday-decision set did, and if so add `update: {}` outside seeds and tests to the antipattern ratchet; measure with 12 parallel calls on Postgres (from: feature:availability-holidays-copy)
- Run `availability-holidays-copy.spec.ts` H3 and record its result: #8956 retargeted it to the day editor and its note says "e2e retargeted, not run", and H2 and H3 titles still disagree with their assertions (#8775) (from: feature:availability-holidays-copy)
- Count rows in `venue_holiday_decisions` per venue and Copy saves by kind once real Managers exist, and put that count in the next retro's `users-observed`; the table has been live since 2026-11-09 and nothing in the repo reads it (from: feature:availability-holidays-copy)

## Run complete

2026-11-22. #8541 is merged and its release outcome is `released` by write-back; the Owner-only post-release checks were not re-verified. Zero users observed: nothing here shows the holiday lines or Copy dialog used. One post-merge defect in the run's own e2e (#8581, fixed in #8583), 0 user-reported defects found, and the surface has since been reshaped by later runs (#8772, #8825, #8956). Locale files are complete by key; no native-speaker review is recorded. Seeds above are the input to the next Idea-stage run.
