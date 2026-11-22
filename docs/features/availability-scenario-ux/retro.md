---
stage: operate
run: feature:availability-scenario-ux
date: 2026-11-22
users-observed: 0
signal-source: "none: no usage record exists. Nothing in the run directory, release.md or the tracker shows anyone using the shipped page. The only post-ship contact is the Owner's own 2026-11-11 rendered audit on mocked data (#8696), which the Owner's audit does not count as use."
assumptions:
  - "users-observed is 0, not 1. gen-ui-elements-2 counted the Owner as 1 because the Owner ran live batches against production. Here the only Owner contact found is #8696's audit, which says Auth0, the real API and production data were not exercised. A mocked audit is not use of the shipped page."
  - "release.md was `prepared` until a write-back on 2026-11-22 recorded `outcome: released` from the merged PR state (#8528 merged 2026-11-08T19:48:55Z, read with `gh pr view 8528`). Its Owner-only post-release checks were never run and this retro did not run them. No outcome below reads as verified in production."
  - "Post-ship defects that only the Owner's own audit reported (#8686, #8689) add 0 to the population, per the protocol's Operate population rule. They are listed as regressions, not feedback."
  - "The merged PRs and issues cited were read through `gh` on 2026-11-22. Nothing was run in a browser and no production page was opened."
---

# Retro: Availability, the everyday edits

## Outcomes vs. intent

Population: 0 observed. The run shipped a page for venue Managers; no Manager, host or other operator has a recorded use of it, and the Owner's only recorded look is a mocked-data audit. Every signal below is therefore `unobserved`, or a statement about the repository, never about use.

State of the release: #8528 merged to main on 2026-11-08 (state MERGED, label `tier:sensitive`, read with `gh pr view 8528`). Its release.md names Owner-only checks (Close… offers Tonight, Tomorrow and holidays; the quiet month view; Save in reach on a phone). They were not re-verified by the write-back or by this retro.

Surface drift since ship, from PR titles only (not opened in a browser): the availability surfaces this run changed were restructured within a week. #8810 made the Availability hub the landing page and #8800 moved the old page to `/availability/calendar`; #8831 gave regular hours their own address; #8839 and #8823 added close and pause from the hub. The release.md post-release URL (`/hospitality/availability` as a Manager) may no longer show the page the run verified. Not checked.

### Success sentence: a Manager does the catalogue's everyday availability jobs in fewer steps, on a phone without scrolling to find Save, with every confirmation saying exactly what changed

- What happened: the run's own evidence is agent stand-in: 12 of 12 criteria PASS on mocked e2e (370 passed with `--retries=0`), with no human walkthrough (verification.md Summary and Not verified). After ship, the Owner's 2026-11-11 audit measured the Close dialog on first paint at 17 controls, 1.73 desktop screens and 2.21 phone screens, with the primary armed to close tonight on open (#8689). The dialog was then reworked (#8757): date first, What collapsed, one notes disclosure. That rework raised three of this run's own step budgets: R4 5 to 6, R5 10 to 11, R6 4 to 5 (#8757 body; recorded in prd.md by #8760). So the "fewer steps" half was traded against "fewer controls" after ship.
- Signal strength: unobserved for use. The step counts are agent stand-in measurements, a pattern of one tool, not a person.

### Criterion 2: presets never create an overlap

- What happened: verification.md passes it on hand-picked cases. The Owner's audit then reproduced the opposite on a Lunch every day plus Dinner venue: adding the Brunch chip filled 11:00 PM to 3:00 AM and the form saved it (#8686, Evidence). The cause is the rule this criterion specified: a preset overlapping a service on the row's current days starts when the other services close. #8733 (merged 2026-11-12) made name chips keep their preset times, with only Late still following; #8745 added the named day fix and the real preview reason. Both closed #8686. The criterion as the PRD wrote it ("opens at or after the latest close of the services already running on those days") no longer describes the shipped behaviour.
- Signal strength: anecdote. One audit, one fixture venue, reproduced twice (#8686).

### Criterion 5 and 6: confirmations name the thing, the dialog says only true things

- What happened: the Owner's audit found the Repeats primary reading "Close every , Wed, Nov 11 - Invalid Date" when no weekday or end date was set, with the source in `close-text.ts` (#8689), the file this run's Review fixes created (breakdown.md Notes, E1/C2). Whether the empty-field path predates this run was not checked. Fixed by #8757 (`closeIncompleteText`). The same issue records that after Step 2 cancelled 14 bookings the toast said only "Closed on Sat, Nov 14"; #8757 now names the bookings.
- Signal strength: anecdote. One audit.

### Criteria 1, 3, 7, 8, 9, 10: day chips, Save in reach, venue dates, quiet calendar, Booking line, unclipped menu

- What happened: no post-ship defect or complaint on these was found in the searches below, and none can be read as "worked": nobody is recorded as having used them. Several of the surfaces were later reorganised (see surface drift above).
- Signal strength: unobserved.

## Post-release defect search

Commands run on 2026-11-22 with `--repo mattbutlerengineering/mattbutlerengineering`:

- `gh issue list --state all --search "availability-scenario-ux"`: 1 result, #7721 (created 2026-10-26, closed), which predates this run and is about a different run's Host closure path. Counted as 0.
- `gh issue list --state all --search "availability created:>=2026-11-08"`: 41 results, of which the ones that touch this run's surfaces are #8686 (service chip, bug), #8689 (Close dialog, bug), #8687 (Pause online booking dialog), #8690 (calm regular-week form), #8696 (the tracking issue of the 2026-11-11 audit). All five were filed 2026-11-11 by that audit, which the audit's own body (#8696) says used mocked venues and not production. #8581 (E2E Screenshots red, 2026-11-09) concerns #8539, not this run; verification.md already noted the Go to date Escape flake as pre-existing.
- Issues or PRs filed by anyone but the Owner's own audit about these surfaces: 0 found. A search that does not find them is not proof there are none; support, Sentry and production logs were not queried.
- Post-ship fix PRs for this run's defects: #8733 and #8745 (#8686), #8757 (#8689), #8760 (docs recording #8689's budget changes in this run's prd.md). All merged 2026-11-12.

## Open debt

Issues and notes this run itself created or deferred; never counted as feedback.

- No tracker issue was filed by this run (the issue search above finds none carrying its slug). The debt lives in review.md, verification.md and backlog seeds:
  - review.md deferred minors: chips sit after the When choices, not above; Pause dialog title stays "Pause online booking" if What is switched to Whole venue; a Tomorrow or holiday chip in Several-dates mode switches to One date instead of adding; the pinned footer's edge mirrors the dashboard padding in a second place; four `prefer-rialto-components` warnings on calendar cells (+4 over base 235). The chip placement and the Close dialog's chips and title were later changed by #8757, so the first three may be moot. Not re-checked.
  - verification.md Not verified: no Owner or operator walkthrough; Auth0, real API and production data not exercised; visual baselines for `/availability` and the Close dialog left to `visual-regen-trigger.yml` after merge (whether that baseline PR merged was not checked).
  - Backlog seeds already written by this run (lines 425 to 427 of `docs/backlog.md`): weekly "what changes" list, Copy to other days semantics, Tonight state on /availability.
- #8686 and #8689 were filed after merge by the Owner's own audit, citing this page, not this run's review.md or verification.md. By the protocol's rule on "created before the run's merge or cites review.md or verification.md" they are not the run's own debt, and by the population rule they are not feedback either. They are listed under Outcomes as regressions with 0 population weight.

## Run retrospective

- Keep: Review as an independent `reviewer` pass on the stacked diff `033586217..HEAD`. It found four majors, each with a concrete scenario, and all four were fixed with tests before ship (review.md Findings); the placement bug in major 1 was also hiding behind an adapted demo-week spec, which Review caught and reverted. Evidence is the file; whether the same bugs would have surfaced later is not known.
- Keep: the scenario-led audit (audit.md) as the source of the budgets. Eight scenario budgets with a named "before" count made Verify's table concrete (verification.md criterion 4).
- Change: Verify passed "Presets never create an overlap" on hand-picked pairs, and the Owner's audit found a case (Brunch beside every-day Lunch) that the PRD rule itself produced. A criterion phrased as "never" needs a table over every preset and every neighbour set, not examples. Evidence: verification.md §2 versus #8686.
- Change: the run's budgets counted steps per job and one page-level first-paint control count (prd.md criterion 4 note, 7 to 8). The Close dialog it reworked had no first-paint control budget, and the audit measured 17 controls (#8689). A rework that adds chips, a Starting at list and a legend to a dialog should budget that dialog's controls too.
- Change: the release stayed `prepared` for 14 days (2026-11-08 to 2026-11-22) and its Owner-only checks never ran. The run assumed Prepare-and-stop and a stacked merge (release.md assumptions). The check lives only in prose.
- Stop: nothing proposed.

## Environment

| Mistake                                                                                                                                        | Evidence                                                                                                            | Class      | Proposed carrier                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A "never creates an overlap" criterion passed on hand-picked cases; Brunch beside every-day Lunch saved at 11 PM                               | `verification.md` §2; #8686 Evidence; #8733                                                                         | mechanical | A table-driven case in `apps/hospitality/src/components/availability/quick-setup-placement.test.ts` over every `SERVICE_PRESET_IDS` entry and each neighbour set (Lunch, Dinner, both, every-day and weekday-only). Its current `placePreset` cases are individually named, not a matrix (file read). |
| The PRD's placement rule ("start at the latest close") was itself the defect                                                                   | `prd.md` criterion 2; #8686 Cause; breakdown.md Notes A2                                                            | judgement  | The PRD's own review: `architecture.md`'s A2 decision should have named the Brunch-beside-Lunch case. No rule in `AGENTS.md` or `docs/standards.json` was checked for a place to hold it.                                                                                                             |
| Close dialog toast and button text produced "Invalid Date" and "every ," on empty fields                                                       | #8689 Evidence and AC; `breakdown.md` Notes C2                                                                      | mechanical | The `close-text` tests extended over the full What by When matrix with empty fields, which #8689 already lists as an acceptance criterion; the tests this run added covered "every kind x target x start time" with filled fields (`verification.md` §5).                                             |
| The Close dialog's first paint went to 17 controls with no budget to catch it                                                                  | #8689 Evidence; `prd.md` criterion 4 (page budget only)                                                             | mechanical | `apps/hospitality/e2e/fold-budget.spec.ts` (run in this run's Verify, `verification.md` Full e2e): add the dialog's first-paint control count. The spec's current assertions were not read.                                                                                                           |
| Stacked PR #8528 ran no main CI (no CI Gate, unit, typecheck or lint) on its first push; the run substituted local results until retarget      | `release.md` Release log step 5; `.github/workflows/ci.yml` `pull_request: branches: [main]`                        | mechanical | The trigger in `ci.yml`: widen `pull_request` branches or dispatch CI on stacked heads (the `workflow_dispatch` trigger already exists). Not tested here. Before the retarget the branch had only dispatched CI runs (the first, on 6f15dbcb5 at 18:49Z, was cancelled; the next failed; the third passed). The `pull_request` `CI` run on the final head 0233cf7ab took about 31 minutes (19:17Z to 19:48Z) and `CI Gate` passed about a minute before the merge at 19:48:55Z, so the gap cost time and evidence, not an unchecked merge.                                                                                                                                             |
| A screenshot-only test and its `/tmp` helper stayed in `availability-everyday.spec.ts` until Ship; stray onboarding screenshots were committed | `release.md` Release log step 1 (`noopTestAssertions 19 to 20`); `review.md` minor (`a67ff07e8`, fixed `6c99497c5`) | mechanical | `scripts/check-ai-antipatterns.mjs` already caught the test (at Ship, not Implement); the carrier is running it at the Implement boundary, per the CLAUDE.md "Before Committing" audit, not a new rule. Nothing found that catches committed screenshots.                                             |
| `quick-setup-draft.ts` reached 943 lines and `close-draft.ts` 819 against the 800-line guideline; only Review noticed                          | `breakdown.md` Notes (flagged for Review); `review.md` minor                                                        | mechanical | No `max-lines` rule found in `eslint.config*` or `scripts/*.mjs` by `git grep` on origin/main; not exhaustively searched. If none exists, it is a lint rule, not prose.                                                                                                                               |
| A wrong-directory e2e launch ran 162 tests instead of 370 and was caught only because the count looked low                                     | `verification.md` Full e2e                                                                                          | mechanical | The run script (`/tmp/e2e-local.sh`) lives outside the repo; no repo carrier found.                                                                                                                                                                                                                   |

## Seeds for next ideas

- Add a table-driven `placePreset` test in `quick-setup-placement.test.ts` over every `SERVICE_PRESET_IDS` entry and each neighbour set (Lunch, Dinner, both; every-day and weekday-only): the preset keeps its hours or the row reports an overlap, never a silent 11 PM start; the current cases are hand-picked, and #8686 showed a Brunch at 11 PM that the PRD's own "start at the latest close" rule produced (from: feature:availability-scenario-ux)
- Give a PR stacked on a feature branch a `CI Gate` on its first push: `ci.yml` triggers `pull_request` only for `branches: [main]`, so #8528 (base `feat/availability-setup-hierarchy`) ran no unit, typecheck or lint job on CI until it was retargeted to `main`, and the release substituted local results meanwhile; widen the trigger or dispatch CI on stacked heads and pin it with a scripts test (from: feature:availability-scenario-ux)
- Add the Close dialog's first-paint control count (and the primary's initial armed state) to `apps/hospitality/e2e/fold-budget.spec.ts`, so a dialog that grows chips, lists and notes cannot reach 17 controls unseen as it did before #8689 (from: feature:availability-scenario-ux)

## Run complete

2026-11-22. The run merged on 2026-11-08 (#8528) with 12 of 12 criteria passing on mocked e2e and no human walkthrough. Its Owner-only post-release checks were not run. No one is recorded as having used the shipped page (0 observed), so adoption is `unobserved`. Two defects in its own surfaces (#8686, #8689) were found by the Owner's mocked audit on 2026-11-11 and fixed by 2026-11-12, and they changed three of this run's step budgets. Seeds above are the input to the next Idea-stage run.
