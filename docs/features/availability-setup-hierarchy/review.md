---
stage: review
run: feature:availability-setup-hierarchy
date: 2026-11-08
assumptions:
  - "Scope is the 2026-11-08 amendment (Milestone 3). The 2026-11-07 Venue Setup hub work merged to main as nine PRs (#8483-#8489, #8493, #8499), each with its own reviewer pass at merge; it is not re-reviewed here and no run-level review.md existed for it."
  - "Review ran independently: a fresh `reviewer` subagent given the diff, architecture.md, ux.md, prd.md and breakdown.md, not the implementer's conclusions. Findings were re-read against the code before being written down here."
  - "Severity was set by the reviewer and kept; the Owner delegated the run, so no live arbitration. Every major was fixed rather than deferred."
---

# Review: Availability setup hierarchy — amendment (calm, consistent Availability)

## Scope

`git diff a885014ff..HEAD -- apps/hospitality packages/rialto .changeset` on `feat/availability-setup-hierarchy`: commits `387e7fdbb` (onboarding copy) through `b8e2511ee` (seed correction), excluding docs and regenerated `llms*.txt`. Main files: `pages/AvailabilityPage.tsx`, `components/availability/{RegularWeekPanel, SchedulesTab, AvailabilityHeaderActions, AvailabilityToolbar, AvailabilityScheduleControls, ChangeRegularWeekDrawer, use-regular-week-edit, ScheduleEditorDrawer, CloseStepOne, service-hours, QuickSetupForm, QuickSetupServiceRow, QuickSetupCard, quick-setup-field-helpers, DraftPreview, AddDateRow, availability-entry}`, `venue-setup/{setup-tree, useSetupNodeText}`, `pages/SetupPage.tsx`, `components/PageHeader.*`, `venue-onboarding/LaunchStep.tsx`, three catalogs, `packages/rialto/src/components/Calendar/Calendar.tsx`, and the e2e specs and helpers.

## Findings

### Major: R1 — the week panel showed a stale regular week after any save that was not its own

- Scenario: edit Dinner's close on the panel → Starting later… → Start today → Save. The drawer closed and `SchedulesTab` remounted the panel before the refetch landed, so the panel kept the pre-save week while the calendar showed the new one; the next panel Save returned 409 into conflict review. Undo, Compare services, Add/Delete schedule and a colleague's save had the same effect, because the panel re-seeded only after its own save.
- Standard: none
- Decision: fixed in `7b72d91a2`. The panel re-seeds whenever the form is clean, no conflict review is open and the version moved; a drawer save is handed over as `resetAtVersion`; the premature remount is gone. Tests: clean re-seed on version bump, dirty form keeps edits, `resetAtVersion`, and the panel's own 409 → conflict review → Reapply path.

### Major: R2 — settling survived a venue switch

- Scenario: save on venue A (result version 12), switch to venue B (version 3) before A's refetch lands → B's panel stays "settling": no Save, no Discard, no leave guard, edits dropped when B later reaches 12.
- Standard: none
- Decision: fixed in `7b72d91a2` (panel keyed by venue). The test fails without the key (red confirmed).

### Major: R3 — settling had no exit when the refetch failed

- Scenario: the save lands, its refetch fails → `config.data` keeps the old version, the panel waits forever with Save and Discard gone, and later edits are lost on the next remount.
- Standard: none
- Decision: fixed in `7b72d91a2` (`refreshError` ends settling and shows the failure; test added).

### Major: R4 — the Add a schedule… seed leaked services' own days before Starting

- Scenario: regular week Lunch Mon–Fri + Brunch Sat–Sun → Add a schedule… opens with Lunch's and Brunch's own days already set; remove Brunch → a dateless "Lunch Mon–Fri" schedule saves and outranks the regular week on those days — the case the seed's own comment said could not happen (`ScheduleEditorDrawer.tsx:86-88` on main).
- Standard: none
- Decision: fixed in `7b72d91a2` (every service shows no days before Starting; the raw draft keeps them for after) and corrected in `b8e2511ee`: the first fix also required a start date for every seeded schedule, which removed a supported case (an undated named week on days the Manager picks, catalogue C13) and failed two `availability-dead-ends` e2e specs. Untouched days still never leak; days the Manager picks save undated as before. Tests: both subset fixtures, removal of Brunch, own days returning after Starting, and C13.

### Minor: R5 — `?action=addSchedule` (and `closeSection`) armed behind the empty-venue quick setup

- Scenario: hub link on an empty venue → the editor popped open unprompted after quick setup saved.
- Standard: none
- Decision: fixed in `7b72d91a2` (entry spent on an empty venue; test).

### Minor: R6 — History → open day from a dirty Schedules layer leaked the day target

- Scenario: "Keep editing" on the discard dialog left `target.date` set; the next visit to Calendar opened that day's drawer.
- Standard: none
- Decision: fixed in `7b72d91a2` (the day rides the tab move; test).

### Minor: R7 — quick-setup save focus lost when arriving on `?tab=calendar`

- Scenario: the "Regular week" heading is absent on Calendar, so focus stayed on `body`.
- Standard: none
- Decision: fixed in `7b72d91a2` (falls back to the calendar; test).

### Minor: R8 — `?action=addSchedule` forced the Schedules layer (unlogged deviation)

- Scenario: architecture says `chosenTab = entry.tab ?? null`; the code overrode it.
- Standard: none
- Decision: fixed in `7b72d91a2` (override dropped; the action arms only on Schedules; `?tab=calendar&action=addSchedule` tested).

### Minor: R9 — AddDateRow "Same as {weekday}" rows missed the service time rule

- Scenario: "Same as Tuesday" printed open–close without last seating, unlike every other service description (PRD 16).
- Standard: none
- Decision: fixed in `7b72d91a2` (`namedServiceHoursText`; test).

### Minor: R10 — dead `ChangeRegularWeekDrawer.onOpenSchedules` path and a caption that sent the Manager to the screen they were on

- Scenario: nothing passed the prop; the panel said "Edit it on Schedules." while on Schedules.
- Standard: none
- Decision: fixed in `7b72d91a2` (path and key removed; caption reworded "…It is listed under Other schedules." in three locales).

### Minor: R11 — unused `today` on `RegularWeekEditInput`; R12 (nit) — version override by spreading state

- Scenario: dead input on the hook and both callers; `useScheduleSave.save` already takes `expectedVersion`.
- Standard: none
- Decision: fixed in `7b72d91a2`.

### Minor: test gaps the reviewer listed

- Panel re-seed, panel conflict path, venue switch and refetch failure during settling, seed with subset days, empty-venue entry, focus with `?tab=calendar`, History "Keep editing", Repeats To-follows-From, Calendar `min === today` / `max < min` / invalid `min`.
- Decision: fixed — each now has a test (see `7b72d91a2`).

## Passes with no findings

- Security: clean. The only new input surface is `?action=`, a Zod literal; invalid values are dropped, the parameter is removed from the URL after it is read, and it acts only for a Manager with a loaded, non-empty config. Nothing is echoed or stored.
- ADR compliance: clean against ADR-029 to ADR-032. The diff touches no engine, row, plan or section-closure contract; Rialto's `Calendar` change is additive behaviour inside the component.
- Complexity: clean after R10-R12; no `lean:` markers added. One module-shape note, not a finding: `AvailabilityPage.tsx` is ~840 lines after becoming the one frame for three layers; splitting the layer bodies out is a `deepen` candidate.
- Domain passes: none selected (`QuickSetupBlock.tsx` matched the lockfile word "lock" only by substring; not a manifest or lockfile). No `docs/standards.json` in the repo.
- Also observed during Implement and fixed before review (found by the e2e scenario suite, not the reviewer): the Close dialog's To picker opened on today's month and allowed days before From; moving From past To left an inverted range; duplicate field ids stripped the drawer's accessible names; a phone density regression on the Calendar layer (`0b601e488`, `11ba4c3d8`, `1e4f47517`, `70b01c3ee`).

## Verdict

Ready for Ship: no critical findings; all four majors and all minors fixed and covered by tests; every pass ran (correctness, design, security, complexity, ADR compliance; domain passes not selected by the diff). Not covered by this review: the 2026-11-07 hub PRs (reviewed at their own merge), and anything only a real Auth0 session or production data would show (the e2e suite runs on mocked APIs with a fake OIDC session; see verification.md).
