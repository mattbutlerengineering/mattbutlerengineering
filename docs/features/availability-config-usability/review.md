---
stage: review
run: feature:availability-config-usability
date: 2026-11-04
assumptions:
  - "Scope is `git diff origin/main...HEAD` at ee161350c: 183 files, +16864/-1409. Five read-only reviewer subagents covered (a) packages/types and packages/availability, (b) services/reservations with the migration and collapse script, (c) services/agent with its Dockerfile and dependency, (d) apps/hospitality/src, (e) e2e, helpers and fixtures. Every finding below was re-read in the code by this stage before it was written down; the hunches that could not be traced are listed as suspicions, not findings."
  - "Nothing was built, run or tested in this stage (the reviewers were read-only; this stage ran only grep, eslint over changed files, and `git` read commands). Finding scenarios are traced by reading, not executed. [INFERENCE] marks any reachability claim that depends on stored data this stage did not see."
  - "Lint comparison method: `pnpm --filter @mbe/hospitality lint` was not re-run on origin/main in a detached worktree (none was created, so nothing under /tmp needed removing). Instead eslint (this branch's config) was run over the 88 changed non-deleted hospitality .ts/.tsx files, and over the origin/main content of the same files via `lintText`. Result: 6 warnings on each side, but one is new (see Minor 8); one other changed file lost a warning. Lint in packages/ and services/ was not compared."
  - "Severity calls: the stale-client erasure (Major 1) is ranked major although architecture assumption 6 accepted the risk, because the accepted mitigation (the version compare-and-set) does not cover the scenario traced below; the PRD says nobody real uses availability yet, which is why it is not critical. All 31 ADRs are reported by adr_status.py with standing `unrecognized` and a raw status of active/superseded; ADR-004 and ADR-006 (superseded) were skipped, the rest treated as live. ADR-031 reads as plain `active` to the tool (its `provisional: true` is invisible), so no violation was downgraded for it; none was found."
  - "docs/standards.json holds four statements, all `advisory` and in the factory/pipeline/eval domains (adr0004-typed-ids-in-frontmatter, adr0032-one-way-mirror, eval-honesty, stdlib-only). The diff is product code, and the artifacts' frontmatter holds no typed id, so no finding cites a slug and none triggers the enforced-standard fix rule."
  - "Dispositions: autorun has no live Owner, so every critical or major is `route to Implement` with a concrete fix, and a minor is either `route to Implement` or `deferred: <reason>`. The orchestrator runs the fix loop and re-dispatches Review."
  - "Re-review (final pass), at HEAD 3349496dd: scope is the first pass's diff plus `git diff 074ce4ac0..HEAD -- ':!docs'` (36 files, +946/-227; 13 fix-loop commits 716319fd1..b46a22fcd). Read-only again: this stage ran `git show`, `git diff`, `git grep`, `adr_status.py` and `gates.py`; it built, ran and tested nothing, so each fix is confirmed by reading the code and its RED/GREEN test, and by Verify's own run at b46a22fcd (typecheck of 45 packages, lint, the unit suites and the e2e specs, as `verification.md` reports them), not by this stage. Typecheck passing across every package is the evidence that no typed PUT/preview caller omits the two fields; a caller that builds a body outside the types (e2e `page.route` fulfilments, which only answer GETs here) is not validated by it."
  - "Severity calls in the re-review: Major 3's documented residual gap (a duplicate whose services' own days together cover all seven days still saves as an all-week winner) is ranked minor, not major: it needs a source schedule whose services each carry own days, the days are visible on every service row, the overlap line names the schedules it overlaps, it is the same 'used on the days its services run' rule a New schedule follows, Undo restores, and it is no longer reachable from a plain rule-only schedule (the original Major 3). No Owner is available to arbitrate; the call is mine and the scenario is in New 2."
  - "Deferral counts: every minor is `route to Implement` or `deferred: <reason>`. This pass routes nothing further: the three new findings are comment, documentation-staleness or reuse items with no failure scenario for a user, so each is deferred with its reason. Nothing is blocked on an Owner."
---

# Review: One regular week that can differ by day

## Scope

- The run's diff, `git diff origin/main...HEAD` at `ee161350c` (the Verify stage commit): 183 files, 16,864 insertions, 1,409 deletions. Areas: `packages/types`, `packages/availability`, `services/reservations` (code, Prisma migration `20261103120000_add_schedule_service_day_scope`, collapse script), `services/agent` (tool, Dockerfile, manifest), `apps/hospitality` (src, i18n, e2e), `docs/adr` (ADR-031, ADR-030's `amended_by`), the run's artifacts, the lockfile.
- Predecessor `verification.md` exists (22 PASS, 2 NOT RUN, one open pre-existing flake), so no soft-gate inversion.
- Read in full: `prd.md`, `ux.md` (the strip, F-UW, F12 sections), `architecture.md`, `ADR-031`, `breakdown.md` Notes (every deviation), `verification.md`, the brief; the review skill, `TEMPLATE.md`, the five references, the lean cut-list, the protocol's ADR test, `standards.json`.
- Not examined (see Verdict): any running system, CI-only jobs, the real service behind a browser, an apply of the collapse script, native-speaker wording, performance (p95), the interaction counts as a human would time them.

## Repo-rule checks (commands run)

```
console.log / console.debug / console.info in added production lines
  $ git diff -U0 origin/main...HEAD -- '*.ts' '*.tsx' ':!*.test.*' ':!apps/hospitality/e2e' ':!*fixture*' ':!*mock*' | grep -nE '^\+[^+].*console\.(log|debug|info)'
  (no output)        # control: the same diff without the filter matches 3 lines, all in docs/*.md prose

`any` in added lines (production, then tests and e2e)
  $ git diff -U0 origin/main...HEAD -- '*.ts' '*.tsx' ':!*.test.*' | grep -nE '^\+[^+].*(: any\b|as any\b|<any>|any\[\])'
  (no output)
  $ ... -- '*.test.ts' '*.test.tsx' apps/hospitality/e2e | grep -nE (same pattern)
  (no output)

inline style / Tailwind in added .tsx lines
  $ git diff -U0 origin/main...HEAD -- '*.tsx' | grep -nE '^\+[^+].*(style=\{|className="[^"]*\b(flex|p-[0-9]|m-[0-9]|text-(sm|xs|lg)|bg-[a-z]+-[0-9]))'
  (no output)

`lean:` markers added anywhere in the diff
  $ git diff -U0 origin/main...HEAD | grep -nE '^\+[^+].*lean:'
  (no output)        # so no marker lacks a ceiling or trigger; but see Minor 11 for a ceiling stated in prose with no trigger

Files over 800 lines among added/modified files (all were already over 800 on origin/main; none crossed the line in this diff)
  834 (origin/main 832) packages/types/src/schemas/availability-config-api.ts      <- the only non-generated production source
  1633 (1515) services/agent/src/routes/gen-agent-closure-tools.test.ts            test, +118
  1357 (1352) apps/hospitality/src/components/availability/AvailabilityDayEditor.test.tsx
  1182 (1177) apps/hospitality/src/pages/VenueOnboardingPage.test.tsx
  1105 (1102) apps/hospitality/src/pages/AvailabilityPage.test.tsx
   958 (870)  services/reservations/src/services/availability-config.test.ts       test, +88
  1386 (1384) apps/hospitality/e2e/api-mocks.ts
  2277 (2275) services/reservations/src/routes/rls-route-sweep.fixtures.ts
  plus generated llms*.txt, the three i18n catalogs (3.2k-3.3k lines each, +55) and pnpm-lock.yaml.
  Largest new production source: quick-setup-draft.ts at 738 lines (apps/hospitality), under the limit.

New lint warnings against origin/main (eslint over the 88 changed hospitality files, head vs origin/main content)
  files 88, head warnings+errors 6, base 6
  +1 src/components/availability/ScheduleEditorDrawer.tsx (head 1, base 0) @eslint-react/exhaustive-deps@130   -> Minor 8
```

## Findings

### Major 1: an old client that omits the two new fields erases a varied week, and the version compare-and-set does not stop it

- Where: `packages/types/src/schemas/availability-config-api.ts:38` (the PUT body's `upsert.scheduleServices` reuses `ScheduleServiceSchema`), `packages/types/src/schemas/availability-config.ts:155-158` (`weekdays` and `dayHours` have `.default`), `architecture.md` assumption 6 and `ADR-031` Consequences.
- Scenario: Manager A, on the new build, saves a varied week; `availabilityVersion` becomes N. Manager B has a tab running the pre-deploy bundle; it refetches the config on focus and holds version N. B edits one hour on a row that carries a set. The old client builds a fresh row without the two keys (origin/main `draft-changes.ts` `scheduleServiceRows` builds `{ ...hoursOf(s), id, scheduleId, venueServiceId }` and does not spread the stored row), PUTs with `expectedVersion: N`, the schema defaults the fields to "no scope", `diffConfig` sees an update, the compare-and-set matches, and Friday's later close is gone with no error. The architecture claims the version "refuses any client that loaded before the varied week was saved"; this client loaded after. Undo can restore it, because the inverse records the old row, but nothing tells B or A.
- Standard: none (ADR-030 decision 2 is respected; the contract that fails is `architecture.md` assumption 6).
- Fix: give the PUT body its own row schema where `weekdays` and `dayHours` are required (the old client then gets a 422 problem+json with the paths), and keep the defaulting schema only for stored rows and History inverses (which is what the architecture needs the default for). Pin it with a route test that an omitted field is a 422. If the Owner prefers to accept the risk, correct the architecture/ADR wording to say the compare-and-set does not cover a client on an older bundle.
- Decision: route to Implement.
- Final status: **fixed at 716319fd1.** The PUT body and the preview draft take `ScheduleServiceRequestSchema` (`availability-config-api.ts:35`, `weekdays` and `dayHours` via `removeDefault()`), and `ScheduleServiceSchema` keeps its defaults. Confirmed: the schema's `.extend` overrides only those two keys; the route tests (`availability-config.test.ts`) reproduce the scenario (a row without the fields at the current version) and assert 400, the field named in `detail`, and `svc.save` never called, plus an `it.each` for each field alone. Stored rows and History inverses still default: `readInverse` (`availability-changes.ts:176`) and the snapshot reader (`availability-snapshot.ts:305`) parse with `ScheduleServiceSchema`, not the request schema; `git grep` finds `ScheduleServiceRequestSchema` only in `availability-config-api.ts`. Every producer of PUT/preview rows is typed (`AvailabilityConfigChanges` is `z.infer`, now with the fields required): `draft-changes.ts:236` sets both fields on every row it builds, `compare-changes.ts:150` forwards stored rows, `schedule-changes.ts` rows come from `draftToConfig`/`encodeWeek`, the RLS sweep's `sweepConfigChanges` fixture carries both fields (`rls-route-sweep.fixtures.ts:1455`); `@mbe/api-client` `saveConfig` takes the typed body; the agent service sends no config PUT (it only reads `scheduleServices`). The strip and Change regular week preview build their drafts from those same builders. New failure mode: the refusal is a generic 400 for an old bundle (the page shows its save-failed path); that is the intended trade, recorded in the Notes and in ADR-031. Two doc slips remain (New 1).

### Major 2: Change regular week and Edit schedule overwrite every hour set's seating and booking types with the base row's

- Where: `apps/hospitality/src/components/availability/schedule-changes.ts:289` (`buildRegularWeekChanges`) and `:379` (`scheduleRowChanges`), with `quick-setup-draft.ts` `clockTimes` (reads only the three times).
- Scenario: a stored regular-week row has a set on Fri-Sat with `seating: { fixed: [...] }` or `bookingTypes: ["phone"]`, different from the base. `ADR-031` and `DayHoursSetSchema` carry those fields per set, so such a row is valid, and it is reachable from `collapseDayNamedSchedules` (a Manager-made schedule named exactly "Sat-Sun hours" that had its own seating) or from the API [INFERENCE: this stage did not find a UI path that writes a set with different seating]. The Manager opens Change regular week, changes any other time, saves: `draftToConfig` re-stamps default seating on every day, then lines 288-289 copy the base row's `seating` and `bookingTypes` onto the base and onto every set. The Friday set silently becomes the base's seating and booking types. A set that then equals the base reads as "These match the other days" and is removed on save.
- Standard: none.
- Fix: carry `seating` and `bookingTypes` per set through the draft's `HoursBlock` (or re-apply the stored set's two fields by weekday set), and add a test with a set whose seating differs. The Notes document that a service keeps its row's seating; they do not document flattening a set's.
- Decision: route to Implement.
- Final status: **fixed at 799e11c04.** `DraftTimes.kept` is set by `clockTimes` (`quick-setup-draft.ts:622`) from the base row and from each set, `addBlock` copies the service's `kept`, and `draftToConfig` resolves `block.kept ?? keptOf` for a block and `service.kept ?? keptOf[venueServiceId]` for the base. The two builders pass `keptOf` from the schedule's stored base rows. RED tests (`schedule-changes.test.ts`, "an hour set's own seating and booking types") build a stored row whose Fri-Sat set has fixed seating and phone-only booking, then run Change regular week with only a base time changed and Edit schedule with a rename, and assert the set's two fields and the base's survive: that is the review's scenario. Rename: a renamed service gets a new `venueServiceId`, so `keptOf` misses, but the draft's own `kept` (carried from the stored base row) is what the base takes, so seating survives. Leak: `emptyService` has no `kept`; a service added in the form takes `keptOf` only when its name matches a stored service, as before, else quick setup's defaults; `kept` is stripped from the drawer's dirty comparison (`weekKey` test update) so it cannot make a draft look edited. No new failure mode found.

### Major 3: Duplicate schedule is saveable as an all-week, undated, winning schedule when the source is used only by a date rule

- Where: `apps/hospitality/src/components/availability/ScheduleEditorDrawer.tsx:73-76` (`seedDraft` passes the source id), `:140-141` (`weekdays = coveredDays(draft)`), `quick-setup-draft.ts:593-604, 621` (`scheduleDays(config, id, true)` returns all seven days for a schedule with no assignment), `schedule-changes.ts` `buildNewScheduleChanges` (an assignment with the chosen `winner`; default `"new"`).
- Scenario: a schedule "Holiday hours" is used only by a `use_schedule` date rule (no assignment). The Manager clicks Duplicate; the seeded draft covers all seven days; the name is prefilled "Copy of Holiday hours"; one Save writes an undated assignment on all seven weekdays that outranks the regular week. From that save the copy replaces the regular week every day. Before this change a copy started with no weekdays and could not be saved until the Manager chose days (origin/main: `useState<number[]>([])`). The overlap chooser does not stop it, since the new schedule is the winner by default.
- Standard: none.
- Fix: seed Duplicate with no assigned days (`days: []`, or `scheduleDays(..., false)`) so the Manager must pick where it is used, as before; add a test that a duplicate of a rule-only schedule needs days before Save enables. Traced by reading; not executed.
- Decision: route to Implement.
- Final status: **fixed at cdba16575**, with a documented residual that this stage ranks as New 2 (minor, deferred). `seedDraft` empties `days` in duplicate mode, so a copy of a rule-only schedule needs days before Save enables; the new test duplicates a rule-only schedule, asserts Save disabled, then asserts one `[1,2,3,4,5]` assignment after the Manager picks Weekdays. The existing duplicate test was updated to pick days first.

### Minor 1: Edit schedule silently drops a service whose own days are all outside the schedule's days, and deletes its stored row

- Where: `schedule-changes.ts:357-394` with `service-days.ts:134` (`encodeWeek` skips days not in `coveredDays`); `quick-setup-draft.ts` `validateDraft` accepts it; breakdown Notes line "ceiling: the form does not stop the Manager choosing them".
- Scenario: Edit a Mon-Fri schedule, give service "Late" its own days of Sat only. `validateDraft` passes, `encodeWeek` emits no row for it, `removed` (`:387`) deletes the stored row, Save succeeds. The Notes document that days outside are not stored; they do not say the row is deleted, and the ceiling names no trigger. Mitigation: History/Undo restores it.
- Fix: offer only the schedule's days in the own-days picker in edit mode, or add a `days_outside_use` issue.
- Decision: route to Implement.
- Final status: **fixed at b36b46c44.** `validateDraft(draft, { within })` raises `days_outside_use` (catalogs in en-US, es-MX, fr-CA) for a service whose own days are all outside the schedule's days; Edit schedule passes `scheduleDays(config, id, true)`; New and Duplicate pass none. The test covers outside-only (flagged) and partly outside (kept, not flagged). A service with some own days outside still loses just those days, as the Notes say; only the whole-row deletion was the finding. The Notes entry's ceiling-with-no-trigger no longer applies, since the case is refused rather than documented.

### Minor 2: the collapse script's `replaced` log is not a complete backup

- Where: `services/reservations/src/scripts/collapse-day-named-schedules.ts:46-61` (`replacedBy` lists only rows the diff updates or removes), `architecture.md` ("the log is the backup").
- Scenario: a service only the folded schedules ran gets a new row from `collapseDayNamedSchedules` (`diff.create`). That row is not in the log, so a rollback from the log leaves it behind. The normal save path records it in the inverse's `remove` ids.
- Fix: add `created: { scheduleServices: ids }` to `ReplacedRows` and the log line, and say in `reference.md` that rollback is manual.
- Decision: route to Implement.
- Final status: **fixed at f6d8d06e8.** The log line carries `created: { schedules, scheduleServices, assignments }` ids (`createdBy(diff)`), the type `CreatedRows` is exported, and `reference.md` says rollback is manual (restore the replaced rows, delete the created ones). The collapse test asserts the created service row's id is in the log entry.

### Minor 3: the collapse script exits 0 when venues were skipped, and its `refused` test compares issue counts

- Where: `collapse-day-named-schedules.ts:148` (`process.exitCode = summary.errors.length > 0 ? 1 : 0`), `:95` (`issues.length > validateConfig(config).length`).
- Scenario: two venues `raced`; the summary says so but the exit code is 0, so a wrapper reads "all done". Separately, a collapse that fixes one stored issue and adds a different one has an equal count and is not refused.
- Fix: print the `raced` count as a warning (or exit non-zero), and compare issue code and path sets. The architecture lists "exit code 1 only when a venue errored" as designed, so the first part is a judgment call.
- Decision: deferred for the exit code (designed behaviour, documented; an Owner step run by hand), route to Implement for the issue-set comparison.
- Final status: issue-set half **fixed at bbd436732**; exit-code half **still deferred**: same reason as above (designed, documented, an Owner step run by hand). `introducedIssues` (`collapse-day-named-schedules.ts`) keys by code, path and weekday and refuses on any issue not in the stored config's set; the unit test swaps one issue for another at equal count (refused) and shows a pure removal is not refused. It fails safe: a stored issue whose row index moves counts as new and the venue is refused, never wrongly collapsed. The `lean:` marker (`:92-93`) names its ceiling ("paths are row indexes, so a stored issue whose row moves counts as new and the venue is refused") and its trigger ("upgrade to a row-id key if that refuses real venues"), so it passes the marker rule.

### Minor 4: `encodeWeek` is not canonical when `bookingTypes` or `fixed` seating come in another order

- Where: `packages/availability/src/service-days.ts:118-121` (`hoursKey` stringifies arrays unsorted), `architecture.md` ("same input, same rows: no churn on re-save").
- Scenario: Monday `bookingTypes: ["online","phone"]`, Tuesday `["phone","online"]`, all else equal: two groups, so the encoder emits a base plus a spurious one-day set. The editor probably keeps a stable order, so impact is low.
- Fix: sort `bookingTypes` and a copy of `fixed` inside `hoursKey`; a property test over permutations.
- Decision: route to Implement.
- Final status: **fixed at af3e6c66e.** `hoursKey` sorts `bookingTypes` and a copy of `fixed`; the test over permutations encodes days equal but for order to one group with no spurious set. The sort copies, so the inputs are not mutated.

### Minor 5: the "varied week is faster than today" guard cannot fail

- Where: `apps/hospitality/e2e/availability-interaction-guards.spec.ts:102` (`expect(quickSetup.count()).toBeLessThan(counter.count())`).
- Scenario: the second path runs the whole uniform bistro week (5 actions), two clicks, a fill, the entire demo week again and a Save, so it exceeds the first path by construction, whatever the UI does. PRD criterion "Varied week faster than today" is evidenced only by that, and "today's path" in it is not today's (it re-enters the whole demo week in the Schedules drawer). The two body assertions in the same test (sets `[[5,6]]`, weekdays `[2,3,4,0]`) are real.
- Fix: compare against a constant measured once, as the other two guards do, or relabel the test a sanity check and say the criterion rests on the Owner's timed walkthrough.
- Decision: route to Implement.
- Final status: **fixed at 8cdbf9577.** The guard asserts `quickSetup.count() < DEMO_WEEK_VIA_SCHEDULES_COUNT` (26, measured once, local); Verify mutated the constant to 18 and watched it fail. Residual, not a finding: the measured quick-setup count is 18, so the guard has 7 actions of headroom and still passes a regression that adds up to 7 actions; the other two guards pin exact counts. The PRD criterion still rests on stand-in counts, not on the Owner's timed walkthrough (not run).

### Minor 6: the interaction counter undercounts actions it does not wrap

- Where: `apps/hospitality/e2e/helpers/interaction-counter.ts:12-18`.
- Scenario: `dblclick`, `selectOption`, `setChecked`, `tap`, `pressSequentially`, `dragTo`, `page.keyboard.*` and `page.mouse.*` count 0. A later UI change that swaps a counted action for one of these lowers the count and still passes the `<=` guards. No current scenario uses them.
- Fix: add them to the set or state the limit in the header comment (decision (f) names only the five).
- Decision: deferred: no scenario uses them, and decision (f) fixes the unit; revisit when a scenario needs another action.
- Final status: **still deferred: no scenario uses the uncounted actions and decision (f) fixes the unit.** `interaction-counter.ts` is unchanged in the fix loop.

### Minor 7: the calendar's regular-week line and its Details can disagree after a dated Change regular week

- Where: `apps/hospitality/src/components/availability/regular-week-line.ts:42-48` (`find(isRegular)`, the future week) vs `RegularWeekLine.tsx:44-58` (`weekSpans(regularWeekView(config))` from this Monday, the week in force).
- Scenario: Change regular week "from Dec 1" with Friday closing later. Until Dec 1 the line reads "Dinner Mon-Sun, later Fri" while Details shows no later Friday.
- Fix: build the line from the schedule that resolves today, or label it "from Dec 1".
- Decision: route to Implement.
- Final status: **fixed at e3cf023be.** `regularWeekLine(config, today)` reads the live regular schedule whose assignment is in force today (highest precedence of those covering `today`), falling back to the one marked regular, as `regularWeekView` does for Details. The test leaves a future-dated week and asserts the line still reads the week in force. A hand-rolled copy of the in-force pick is New 3.

### Minor 8: one new lint warning, and its disable comment names the wrong rule

- Where: `apps/hospitality/src/components/availability/ScheduleEditorDrawer.tsx:130` (`@eslint-react/exhaustive-deps`: missing dependency `seedDraft`); the comment on line 129 is `eslint-disable-next-line react-hooks/exhaustive-deps`, which is not the rule that fires.
- Fix: name the real rule, or lift `seedDraft` out of the render so the dependency list is honest.
- Decision: route to Implement.
- Final status: **fixed at 82c9bcac2.** The disable comment names both rules that fire (`react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps`), as `VenueSwitcher.tsx` does. Verify's lint run reports the file clean; not re-run here.

### Minor 9: accessibility details in the new service row

- Where: `QuickSetupServiceRow.tsx:197` (`aria-expanded={service.blocks.length > 0}` on a button whose click always adds another block, never collapses), `QuickSetupForm.tsx:107-112` (`setAnnouncement` with the same string twice gives no DOM change, so the second is not announced), `removeService` moves no focus (focus falls to `body`), while `removeHours` does.
- Fix: drop `aria-expanded` from the add button, alternate or key the announcement, move focus on remove.
- Decision: route to Implement.
- Final status: **fixed at 1f14dd763.** `aria-expanded` is gone from the add-hours button (the test asserts the attribute is absent); focus after Remove service goes to the previous service's name (the next one's for the first) through `focusAfterChangeRef`; the Remove button renders only when `removable`, so a neighbour exists whenever it can be clicked. The announcement alternates a trailing no-break space on the existing `role="status"` region, which is the `.visuallyHidden` clip/1px pattern (`QuickSetupForm.module.css:66`): the region is not visible to sighted users, and the NBSP is inside that already-hidden node, so it is not a hidden-text trick aimed at sighted users and no keyword-stuffing. What is not shown: whether NVDA, JAWS or VoiceOver announce a text change that differs only by a trailing no-break space. The test proves the DOM text changes (`textContent` differs), not that speech is produced. `announce("")` on remove flips between empty and NBSP: a whitespace-only change, which is meant to say nothing. It is a known, common technique and the weakest evidence in this fix loop; no screen reader was run. Listed in the Verdict.

### Minor 10: `reapplyWeek` merges by whole service

- Where: `apps/hospitality/src/components/availability/change-week-draft.ts:85-103`.
- Scenario: the Manager adds a block to service X while a colleague changed X's close; `{...mine}` discards the colleague's close (the review panel names X as changed). Kept blocks are not passed through `keepDays`, so a block can keep a day outside coverage that `encodeWeek` drops.
- Fix: merge at block level, or run kept blocks through `keepDays`.
- Decision: deferred: the lost-race path is rare, the review panel names the service, and Undo restores. Revisit with Minor 1's fix, which touches the same days rule.
- Final status: **still deferred: same reason.** `change-week-draft.ts` is untouched; the "revisit with Minor 1's fix" trigger fired and Minor 1 was fixed in `validateDraft` without touching it, so the days half stays open on the same terms (rare lost-race path, the panel names the service, Undo restores). Major 2's `kept` travels with the whole service in `{...mine}`, so it adds no new loss.

### Minor 11: lean cut-list over the diff

1. `packages/availability/src/index.ts:1` - dead export: `weekdayRangeLabel` is exported from the package index; the only non-test user is `collapseDayNamedSchedules` in its own file. A repo search of `apps`, `services` and `packages/*/src` found no importer of the index export. Keep it local to `day-named-schedules.ts`.
2. reuse: the Monday-first order `[1,2,3,4,5,6,0]` is declared in `packages/availability/src/service-days.ts:116` (`WEEK_ORDER`, exported), `apps/hospitality/.../schedule-changes.ts:34` (`MONDAY_FIRST`) and `ScheduleFormParts.tsx:22` (pre-existing); `SAMPLE_MONDAY = "2026-10-26"` is declared in both `AvailabilityQuickSetup.tsx:19` and `quick-setup-field-helpers.ts:10`. The covered-days union is hand-rolled in `regular-week-line.ts:42-46` rather than `scheduleDays`.
3. Ceiling with no trigger in prose: the Notes entry for Edit schedule ("ceiling: the form does not stop the Manager choosing them", Minor 1) states a ceiling and no trigger, though the diff carries no `lean:` marker.
   - Net: small. No `speculative` structure found: `servicesOn` and `encodeWeek` each have two or more callers, `collapseDayNamedSchedules` one pure function with one applier.
   - Hand to `deepen`: `quick-setup-draft.ts` (738 lines) mixes draft state, validation, the stored model and the legacy wizard; `replacedBy` (script) and `inverseOf` (store) duplicate the "touched rows" pick; `kind === "regular"` (regularWeekView) and `isRegular` (validateConfig, collapse, drawers) are two notions of "the regular week" that agree only because a superseded version keeps `kind: "regular"`.

- Decision: deferred: no behaviour change; fold item 1 and 2 into the Minor 1/8 fix if Implement is in these files anyway.
- Final status: **still deferred: no behaviour change.** Item 3 is moot (Minor 1 is fixed, the Notes ceiling is gone). Items 1 and 2 were not folded in; the fix loop did not touch `packages/availability/src/index.ts` or the `MONDAY_FIRST`/`SAMPLE_MONDAY` declarations. New 3 adds one reuse item.

### Minor 12: ADR-031's provisional status is invisible to the shipped tool

- Where: `docs/adr/ADR-031-*.md` frontmatter (`status: active`, `provisional: true`), `docs/adr/README.md` (index reads `provisional`).
- Scenario: `adr_status.py` reports ADR-031 with raw status `active` and standing `unrecognized` (as it does for all 31 ADRs); `provisional: true` is not read. A later review will treat a violation of ADR-031 at full severity although the ADR was written without an Owner answer. The workaround is documented (architecture assumption 11) because `tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES` rejects `provisional`, and `--no-verify` is forbidden; the ADR does not edit ADR-030's Decision (only `amended_by: ADR-031`), so the "never rewrite" rule holds.
- Fix: a human call: extend `VALID_STATUSES`, or confirm/supersede the ADR before Ship so the question closes.
- Decision: deferred: the architecture records it as an Owner decision and no code path depends on it; Ship should confirm or supersede ADR-031 first.
- Final status: **still deferred: an Owner call.** ADR-031 is still `active` with `provisional: true`; the fix loop edited its Consequences bullet (own ADR, same run, no Decision section touched, no supersession owed). Ship should confirm or supersede it first.

### Minor 13: `@mbe/availability` is `workspace:^` in the agent and `workspace:*` elsewhere

- Where: `services/agent/package.json` (`workspace:^`) vs `services/reservations/package.json` and `apps/hospitality/package.json` (`workspace:*`).
- Scenario: none today (workspace links resolve either way, `pnpm install --frozen-lockfile` passes per Notes); the agent's manifest already mixes `^` and `*`, and the Notes say `^` follows the repo's `save-workspace-protocol` default. A spec mismatch for the same package across manifests is what the dependencies pass flags.
- Fix: align to one spec in the next manifest edit.
- Decision: deferred: cosmetic, and the agent manifest's own convention is mixed.
- Final status: **still deferred: cosmetic.** No manifest changed in the fix loop (`git diff 074ce4ac0..HEAD --stat` lists no `package.json` or lockfile).

### Minor 14: the agent tool's comment overstates what `serviceDayMinute` reads

- Where: `services/agent/src/routes/gen-agent-availability-tools.ts:130-139`.
- Scenario: the comment says "the services running on `date`'s weekday", but `servicesOn` runs over every schedule's rows (as before this change, per the Notes) and over archived venue services. With a holiday schedule opening at 09:00 and the regular Saturday at 10:00, "09:30" at 00:30 Saturday is read as 09:30 same day rather than minute 2010. This is the pre-existing behaviour, not made worse (it now also filters by weekday), and `specialServices` in `gen-agent-closure-tools.ts` does filter archived services.
- Fix: correct the comment, or restrict to the covering schedule and live services as `specialServices` does.
- Decision: route to Implement for the comment; the behaviour change is deferred as pre-existing and out of this run's scope.
- Final status: comment half **fixed at b46a22fcd** (the comment names every schedule's rows and archived venue services, and says it is pre-existing); behaviour half **still deferred: pre-existing, out of this run's scope.**

### Minor 15: process findings (code is not affected unless noted)

- RED-first slips, logged by Implement in Notes: Milestone 3 tests were written with the code, and Milestone 4 items 1-3 and Milestone 5 items 1 and 3 reproduced RED afterwards. No defect hides behind it that this review found, but "tests green" for those items is weaker evidence than RED-then-GREEN. Decision: deferred: logged, not repairable after the fact.
- The e2e evidence is a synthetic OIDC session with `auth.setup.ts` skipped and the API mocked by the specs, local only; the demo-week calendar, drawer and preview answers come from `e2e/helpers/engine-days-mock.ts`, which runs the same pure engine the UI uses. The literals in `availability-demo-week.spec.ts:33-52` are hand-written and keep the test from being circular for the demo week; an engine bug that is wrong the same way in the strip and the mock on another week would not be caught. `summarize`/`dayLabel` there mirror the service's `summarizeDay` and can drift. Decision: deferred: stated in `verification.md`; the CI run (E11) is the remaining evidence.
- The es-MX and fr-CA wording was never reviewed by a native speaker (the `_many` strings repeat the `_other` wording; `pnpm check:i18n-catalogs` checks keys, placeholders and plural-form presence only). Decision: deferred: reason is that review needs a native speaker; Owner action before Ship.
- The Go-to-date Escape flake ("Escape on Go to date puts focus back on the menu button") is pre-existing and open (4/60 failed on this branch in Verify's re-run, 1/60 in the fix loop; 2/60 on origin/main in the fix loop, not re-measured here); its cause is [INFERENCE]. `GoToDateDialog.tsx` and `AvailabilityToolbar.tsx` are unchanged against the merge base. Decision: deferred: pre-existing, not introduced by this run; needs its own fix.
- Minor e2e notes: `availability-draft.spec.ts:532` uses `waitForTimeout(700)` before a negative assertion (the only one this diff adds); `availability-interaction-baselines.spec.ts` and the guards spec pin the same two constants twice. Decision: deferred: no failure scenario.
- Final status of Minor 15: **all five bullets still deferred, same reasons.** The Verify run at 3349496dd re-measured the flake at 1/60 failed on this branch; its cause is still unknown. The e2e evidence is still local, synthetic-OIDC and mocked. No wording was reviewed by a native speaker; the new `days_outside_use` string in es-MX and fr-CA joins that gap.

### Suspicions (not findings; what would settle each)

- `apps/hospitality/.../draft-changes.ts:300-320` (`regularWeekdayRows`): rows for an archived venue service, or scoped only to uncovered days, are absent from the edited set and so removed by a weekday edit. Harmful only if an archived service can be restored with its rows; settle by checking the un-archive path.
- `services/reservations/src/services/availability-change-detail.ts`: `startsOn` for `regular_week_changed` may be later than the true effect date when a future-dated assignment adds a weekday another assignment already served. History label only; settle with a test of a future-dated plus an existing assignment.
- `packages/availability/src/week-spans.ts:70-77`: slots are grouped by `venueServiceId`; a service with two non-overlapping rows on one day would show `firstAt` to `lastAt` across the gap, while `collapseDayNamedSchedules` refuses that shape. Settle by checking whether `validateConfig` or the editor can produce two same-service rows on one weekday.
- `services/agent` `buildChange` uses the calendar `todayIn(timeZone)`, not the service day (ADR-029) for the weekday it passes; pre-existing (the test asserts `serviceDate: TODAY`), settle by tracing how the API assigns `serviceDate` after midnight.
- `day-summary.ts:61-67` and `AvailabilityGuestPreview.tsx:307` print the opening to the last seating, not first to last bookable time, so fixed seating at 18:00 with opening 17:00 reads 5:00 PM on the calendar and 6:00 PM on the strip. This is documented in the Notes (the data carries no first seating), so it is a known deviation, not a finding.

## Domain passes

- **Migrations** (selected: `migrations/20261103120000_add_schedule_service_day_scope/migration.sql`, `schema.prisma`): ran, clean for the SQL. Additive: one `ALTER TABLE` adds `weekdays INTEGER[] DEFAULT ARRAY[]::INTEGER[]` and `day_hours JSONB NOT NULL DEFAULT '{"version":1,"sets":[]}'`; constant defaults, no rewrite; no `DROP`, `TRUNCATE`, `DELETE`, rename or cascade; `@@unique([scheduleId, venueServiceId])` kept; the schema file and the SQL agree (`weekdays Int[] @default([])`, `dayHours Json @default(...) @map("day_hours")`; the Notes record `prisma migrate diff` printing "No difference detected"); RLS and grants are table-level (ADR-026) and cover the new columns. Code agrees with the migration: every writer (`availability-config-rows.ts`, `availability-migration.ts`) writes both columns, every reader parses through `ScheduleServiceSchema`.
  - The one-way data door: schema two-way, data one-way once a venue saves a varied week. A revert leaves the columns and an older release reads that row's base hours on every day its assignment covers, so guests are offered times on days the service does not run. The architecture states this and builds no down-converter. Not a finding: it is documented and no real venue has saved a varied week (the brief says no operator, Backfill not run).
  - Rolling deploy window: migration then code is the stated order; if new UI pods write a varied week while an old API pod still serves, that pod reads base hours. Suspicion only, bounded by the same "no real venue" fact; the release runbook should order migrate, then every API pod, then the UI.
  - The backfill and collapse apply are Owner steps: the collapse script is dry-run by default, `--apply` explicit, one transaction per venue in its own RLS context (`setVenueContext`, `getAllVenueIds` through `app_cross_venue_venues()`), version compare-and-set (`updateMany` where `availabilityVersion` matches), and one venue's error does not stop the rest. Its gaps are Minor 2 and 3. The pipeline did not apply it anywhere.
- **Dependencies** (selected: `services/agent/package.json`, `pnpm-lock.yaml`, `services/reservations/package.json`): ran, clean except Minor 13.

  ```
  Dependency: @mbe/availability (new workspace dependency of @mbe/agent-service) none -> workspace:^
  Verdict: safe
  Consumers: services/agent/src/routes/gen-agent-availability-tools.ts and gen-agent-closure-tools.ts (servicesOn, weekdayIndexOf); already used by services/reservations and apps/hospitality
  Breaking changes: none (a workspace package, no version range to read)
  Build / tests: Verify ran agent 53 files / 1028 tests, `pnpm install --frozen-lockfile` passes per Notes; not re-run in Review
  Workspace alignment: mismatch (agent workspace:^, reservations and hospitality workspace:*) - Minor 13
  Duplicate runtime copies: none (the lockfile adds 3 lines, one `link:../../packages/availability` importer entry; @mbe/availability depends only on @mbe/types)
  Coverage-tooling risk: n/a
  ```

  Dockerfile path: `services/agent/Dockerfile` copies `packages/availability` (package.json, tsconfig, src) in the builder and (package.json, dist) in the runtime stage, builds `@mbe/types`, then `@mbe/auth`, then `@mbe/availability`; availability's tsconfig matches types'; its `exports` carries the `production` condition the agent's `node --conditions production` uses; `.dockerignore` does not exclude `src` or `tsconfig.json`; `services/reservations/Dockerfile` does the same; `.github/workflows/deploy-services.yml` already lists `packages/availability/**`; `ci.yml` builds the agent Dockerfile from the repo root. The image was not built in this stage (Verify did not build it either; see Verdict).

- **Payments**: not selected. No changed path matches its words (`payment`, `stripe`, `checkout`, `billing`, `invoice`, `charge`, `refund`, `deposit`, `payout`, `subscription`, `webhook`); no file imports a payment SDK.

## Passes with no findings

- **Security: clean.** The new wire boundaries parse through Zod (`DayHoursSchema` with `version: z.literal(1)`, `WeekdayIndexSchema` on every weekday, `weekday_clash` at `validateConfig`, 422 problem+json for invalid configs, 409 for a stale version, 403 for a Host); an unknown `dayHours.version` drops the row (ADR-030 decision 2); the collapse script runs per venue inside its RLS context with the compare-and-set; no secret, token or credential in the added lines; `e2e/.auth` has no tracked files; error messages carry paths, not internals. Major 1 is a data-integrity gap at the same boundary, ranked under Correctness.
- **ADR compliance: no violations.** Live ADRs checked against the diff: ADR-001 (no Tailwind or inline style), ADR-002/008 (RFC 7807 for the new 422 and 409 paths, no route contract changed), ADR-007 (no new route or version), ADR-010/020 (routes unchanged, `requireAuth` on the config read, Manager role on the save), ADR-015 (workspace dependency follows the monorepo pattern), ADR-014 (Dockerfile and deploy filters match the reservations image), ADR-017 (agent tool reads the engine through `servicesOn`), ADR-026 (venue-scoped transaction in the script), ADR-028 (Rialto-only; the app catalog is used directly, es-MX and fr-CA carry `_one`/`_many`/`_other`), ADR-029 (`hoursOn` never reads `closesAt`, so a service closing past midnight stays on its own weekday; `weekSpans` reports `lastAt` as minutes past the service day's midnight), ADR-030 (decisions 1, 2 and 4 kept; its Decision section untouched, only `amended_by` added), ADR-031 (the model, the `hoursOn` rule, the one-row-per-service unique index). Out of scope for the diff: ADR-003, 005, 009, 011, 012, 013, 016, 018, 019, 021, 022, 023, 024, 025, 027. ADR-004 and ADR-006 are superseded and skipped.
- **Design: clean except Minor 12.** Every deviation the Notes record (`weekSpans` in `week-spans.ts` to avoid an import cycle, `newId` factory on `collapseDayNamedSchedules`, the extra null cases, the script routed through the store's own `applyChanges`/`diffConfig`/`writeConfigDiff`, the `refused` outcome, `configSavedDetail` taking both configs, the guest-line wording, the local strip departing from ux.md F-STRIP 4) is documented and consistent with `architecture.md`'s contracts. The undocumented-decision test (hard to reverse, surprising, a real trade-off): none found beyond ADR-031. The first-save-records-`regular_week_changed` behaviour and the opening-to-last-seating guest lines are in the Notes.
- **Correctness items checked and sound**: History inverse parsing (`readInverse` parses rows through `ScheduleServiceSchema`; old inverses default to no scope, an unparsable row makes the entry `not_revertable`, not a 500); the day editor's `regularWeekday` scope (offered only for a day on the live `isRegular` schedule, none for a superseded version; `scopeDates` counts only dates resolving to it; conflict review compares per weekday through `hoursOn` over `scheduleDays`); `collapseDayNamedSchedules` returns `null` for no regular schedule, not exactly one undated regular assignment, a `use_schedule` reference, a name mismatch, a dated folded assignment, a precedence tie, a service twice on one weekday, and a third assignment between the two precedences, and the property test pins that it never changes what any weekday resolves to; past-midnight closes in `hoursOn` and `weekSpans`; the uniform-week paths (`slots.property.test.ts` keeps the pre-change `resolveDay` and `validateConfig` as an oracle over 500 runs each; `legacy-projection` and the fixtures add only the empty defaults).

## Re-review (final pass)

### Scope and passes over the fix-loop diff

- `git diff 074ce4ac0..HEAD -- ':!docs'`: 36 files, +946/-227; roughly half is regenerated `llms*.txt`. Production source changed in `packages/types`, `packages/availability` (`service-days.ts`), `services/reservations` (collapse script), `services/agent` (a comment) and `apps/hospitality/src` (`quick-setup-draft.ts`, `schedule-changes.ts`, `regular-week-line.ts`, the editor drawer, the quick-setup form and row, three catalogs). Docs changed: ADR-031's Consequences bullet, `breakdown.md`, `verification.md`.
- **Correctness:** clean for the fix-loop diff beyond New 1-3. Traced: `keptOf` is keyed by `venueServiceId` and the draft's own `kept` wins, so a rename keeps seating and a new service takes defaults; `kept` is excluded from the dirty comparison; `inForce` tie-break on equal precedence picks the sort's first element (undefined order), and Details has the same shape of tie, which `validateConfig` already flags; `removeService` computes the neighbour from the pre-removal list, and the Remove button is rendered only with two or more services; `encodeWeek` sorting copies its inputs.
- **Design:** matches `architecture.md` except where the Notes record the deviation: assumption 6 (defaults on the request too) is replaced by `ScheduleServiceRequestSchema`, and ADR-031's Consequences bullet was updated to say so. `architecture.md:203` still states the old behaviour (New 1). No decision in the diff passes the ADR test without an ADR: the request/stored schema split is the ADR-031 Consequences edit. No Decision section of an existing ADR was edited.
- **Security:** the change tightens a boundary (the PUT body and preview draft now reject rows without the two fields) and adds no input path; the collapse script's refusal got stricter, not looser; no secret, no console call, no `any`, no inline style in the added lines (the same repo-rule greps were not re-run, this stage read the diff).
- **Complexity (lean cut-list):** one `lean:` marker added (`introducedIssues`); it names ceiling and trigger. No dead export, speculative structure or tag-less cut was added; New 3 is the one reuse item. `CreatedRows`/`createdBy` mirror `ReplacedRows`/`replacedBy`, each with one caller, so they are not a cut.
- **ADR compliance:** `adr_status.py` lists 31 ADRs, all `unrecognized` standing; ADR-004 and ADR-006 superseded and skipped, the rest live. No violation: ADR-001 (CSS Modules only, no inline style), ADR-002/008 (the 400 is the standard problem body), ADR-028 (new string in all three catalogs), ADR-030 (decision 2 intact), ADR-031 (the PUT contract now matches its Consequences).
- **Domain passes:** **Migrations**: not selected (no changed path under `prisma/`, `migrations/` or `schema.prisma` since 074ce4ac0). **Dependencies**: not selected (no `package.json` or lockfile changed). **Payments**: not selected.
- Standards: `docs/standards.json` unchanged by the run; no finding cites a slug.

### New findings (introduced by, or surfaced in, the fix loop)

#### New 1 (minor): the request schema's comment says 422, the route answers 400; `architecture.md` still describes the old behaviour

- Where: `packages/types/src/schemas/availability-config-api.ts:33` ("It gets a 422 instead"); `docs/features/availability-config-usability/architecture.md:203` and assumption 6.
- Scenario: a maintainer reads the comment, writes a client or test expecting 422 `invalid-config`, and gets 400 (the route test, the Notes and ADR-031 all say 400). `architecture.md:203` still says the version refuses a stale client and that absent fields parse as no scope, which the Notes record as superseded.
- Fix: change "422" to "400 validation problem" in the comment; add one line to `architecture.md` pointing at the Notes.
- Decision: deferred: comment and artifact wording only, no behaviour wrong; the breakdown Notes and ADR-031 already state the 400. Fix at the next touch of the file.

#### New 2 (minor): a duplicate whose services' own days together cover all seven still saves as an all-week winner

- Where: `ScheduleEditorDrawer.tsx:73-81` (`seedDraft` empties only the shared `days`), `:140` (`coveredDays(draft)` is the union of shared and own days), `schedule-changes.ts` `buildNewScheduleChanges` (winner defaults to `"new"`). This is the residual the Notes name.
- Scenario: an alternate schedule "Event hours" has Lunch with own days Mon-Thu and Dinner with own days Fri-Sun. Duplicate it, accept the prefilled name, Save: no shared days are needed (every service has its own), `coveredDays` is all seven, and one undated assignment on all seven days outranks the regular week. From that save the copy replaces the regular week every day. Compared with the original Major 3 it needs a schedule built with per-service days, and the Manager sees the days on each service row and the overlap line naming the schedules it overlaps; Undo restores it.
- Why minor: the copy does what its visible rows say, under the same rule a New schedule follows (it runs where its services run); there is no data loss, no silent surface (the overlap list is shown) and the plain rule-only case is closed.
- Fix, if wanted: in duplicate mode also clear each service's own `days` (the copy then needs the Manager to pick days, as origin/main did), or require an explicit winner choice when the copy would outrank the regular week on all seven days.
- Decision: deferred: reason above, and the Notes record the ceiling; a human should decide whether a copy should inherit own days.
- Final status (2026-11-05): **fixed**, after a browser repro showed the demo week's **Duplicate Regular week → Save** (two clicks, name prefilled) writing an undated assignment on all seven days at precedence 1, after which Change regular week reaches no date. A new or copied schedule with no end date that runs on every day the regular week still does is now refused (`replacesRegularWeek` in `schedule-changes.ts`, block code `replacesRegularWeek`): "With no end date, this replaces your regular week. Add an end date, or use Change regular week…". Copies keep their services' own days; days that leave the regular week some of its own, or any end date, still save.

#### New 3 (minor): `regular-week-line.ts` hand-rolls the "assignment in force" pick

- Where: `regular-week-line.ts:41-62` (`inForce`) beside `regularWeekView` in `@mbe/availability` (used by Details and the strip), and `scheduleDays`/`overlappingSchedules`.
- Scenario: none today (the two agree on the tested shapes); `kind === "regular"` plus a precedence sort is a third notion of "the week in force", so a change to the engine's precedence or tie rule would move Details and leave the line behind. Cut-list: reuse; evidence is the three call sites above.
- Fix: expose the resolved regular schedule id from `regularWeekView` and read it in the line.
- Decision: deferred: no failure scenario; fold into the Minor 11 reuse items. Hand to `deepen` in one line: the notions of "the regular week" (`kind`, `isRegular`, in-force) have three owners.

### Final status of every first-pass finding

| Finding             | Final status                                                                          |
| ------------------- | ------------------------------------------------------------------------------------- |
| Major 1             | fixed at 716319fd1                                                                    |
| Major 2             | fixed at 799e11c04                                                                    |
| Major 3             | fixed at cdba16575; residual ranked New 2 (minor, deferred)                           |
| Minor 1             | fixed at b36b46c44                                                                    |
| Minor 2             | fixed at f6d8d06e8                                                                    |
| Minor 3             | issue-set half fixed at bbd436732; exit-code half still deferred (designed behaviour) |
| Minor 4             | fixed at af3e6c66e                                                                    |
| Minor 5             | fixed at 8cdbf9577 (loose bound noted)                                                |
| Minor 6             | still deferred: no scenario uses the uncounted actions                                |
| Minor 7             | fixed at e3cf023be                                                                    |
| Minor 8             | fixed at 82c9bcac2                                                                    |
| Minor 9             | fixed at 1f14dd763 (no screen reader run)                                             |
| Minor 10            | still deferred: rare lost-race path, panel names the service, Undo restores           |
| Minor 11            | still deferred: no behaviour change; New 3 added                                      |
| Minor 12            | still deferred: Owner call on ADR-031                                                 |
| Minor 13            | still deferred: cosmetic                                                              |
| Minor 14            | comment half fixed at b46a22fcd; behaviour half still deferred (pre-existing)         |
| Minor 15            | still deferred: five process items, same reasons                                      |
| New 1, New 2, New 3 | new minors, all deferred with reasons above                                           |

## CI fix loop review (2026-11-04)

Scope: `git diff origin/feat/availability-config-usability..HEAD -- ':!docs'` at `d3013ffb7` (commits `a369a207d`..`004c8881a`, 12 non-doc files, +49/-40; the 13th file is `breakdown.md`). Read: the diff, `breakdown.md`'s CI fix loop section and its Notes, `verification.md`'s re-verification section, `packages/availability/src/index.ts`, the changed files' neighbours, `check-chunk-coverage.mjs`, the RLS job in `ci.yml`, and `adr_status.py` (31 ADRs, same set as the first pass; no ADR is touched by this diff). Read-only: this pass ran `git`, `grep`, `adr_status.py` and `gates.py`; it built and tested nothing, and relies on Verify's runs at `004c8881a` (E13) for the executions.

### Five passes over the CI fix diff

- **Correctness: clean.** The type move is behaviour-free (type-only declaration, `import type` at every site). `toClock` and the two CI-list lines change no runtime path in the product.
  - Type move: `ResolvedService` left `resolve-day.ts` for `types.ts`; `index.ts` removes it from the `./resolve-day.js` export group and adds it to the `./types.js` group, so the package's public export list is unchanged (same name, still a type). The package's `exports` map has only `"."`, so no consumer can deep-import `resolve-day.js`. The two app consumers (`online-seatings.ts:1`, `removal-diff.ts:6`) import it from `@mbe/availability`; no file in `apps`, `services` or `packages` imports `ResolvedService` from `resolve-day`. Remaining in-package importers (`service-days.ts`, `slots.ts`, `resolve-day.ts`) were all repointed; `ScheduleService` is dropped from `resolve-day.ts`'s import and re-imported in `types.ts`. Verify's `@mbe/availability` build and typecheck, plus agent, hospitality and types suites, pass at `004c8881a`. Cycle gone: `types.ts` imports only `@mbe/types`.
  - `toClock`: un-exporting leaves no dead code. `quick-setup-draft.ts` still calls it at lines 131, 134 and 617-619; `CompareServices.tsx` and `ServicesEditor.tsx` use the separate `toClock` in `clock-minutes.js`, not this one, so no consumer lost an import.
  - `ci.yml`: the two lines (`src/services/availability-day-scope.integration.test.ts`, `src/scripts/collapse-day-named-schedules.integration.test.ts`) use the list's exact format (leading path, trailing ` \`, before the `--reporter` line). The job's `run:` lines are `pnpm --filter @mbe/reservations-service exec vitest run <the 17 files> --reporter=...`, after `db:migrate:deploy` as `rls_owner` and `Build workspace dependencies`, and the next step runs `assert-vitest-ran.mjs` on the JSON report, so the new files run with `DATABASE_URL` set and a skip would fail the job. Verify's local replica of that recipe passed both files. The vitest config's `exclude` (`src/**/*.test.ts`) applies to coverage, not to a named-file run.
  - Regenerated `llms.txt`/`llms-full.txt` (4 files): the hunks are `export function toClock` becoming `function toClock` (priority `high` to `medium`) and `ResolvedService` moving to its new source file's block with identical text. Regenerated content only; no hand edit.
- **Design: one decayed contract, Minor 16.** The engine's own size budget is gone. See Minor 16. The cycle fix itself matches the existing pattern (a leaf vocabulary module, as `week-spans.ts` did in Milestone 1); it needs no ADR, since it records no choice that the protocol's ADR test covers.
- **Security: clean.** No input path, secret or boundary changed; the CI edit only adds two files to a job that already has the same DB credentials.
- **Complexity: clean.** The diff removes an export, a budget entry, and a duplicate declaration location; it adds one budget entry and no `lean:` marker. No dead export is left.
- **ADR compliance: no violation.** The 31 ADRs are unchanged and no ADR governs size budgets or the CI job list.

### Domain passes

- **Dependencies** (selected: `apps/hospitality/package.json`): ran, clean. The change is in the `size-limit` array only; no `dependencies`, `devDependencies`, override or lockfile line changed, so there is no bump, no new package and no duplicate copy to check. The one new budget entry is covered by Minor 16 and by the ranked check below.

  ```
  Dependency: none added, removed or moved (size-limit budgets only)
  Verdict: safe
  Consumers: n/a
  Breaking changes: n/a
  Build / tests: pass at 004c8881a per verification.md (`pnpm size:check` exit 0); not re-run in this pass
  Workspace alignment: aligned
  Duplicate runtime copies: none
  Coverage-tooling risk: n/a
  ```

- **`.github/workflows/ci.yml`**: not in the domain table (`references/domain-reviewers.md` selects on payments, migrations and dependency manifests only), so no domain pass was selected for it; it was read under Correctness above. Payments and Migrations: not selected (no path matches).

### New findings

No new critical or major finding.

### Minor 16: the engine's bytes lost their own budget and fall under an unbudgeted allowlist glob

- **Where:** `apps/hospitality/package.json:68-72` (the removed `resolve-day-*.js` entry, 2.7 kB; the added `schedule-changes-*.js` entry, 3 kB) and `apps/hospitality/scripts/check-chunk-coverage.mjs` (`"dist/assets/dist-*.js"` in `UNBUDGETED_CHUNK_ALLOWLIST`).
- **Is it a decayed contract?** Yes, in part. The `resolve-day-*.js` budget was removed because rollup no longer emits that chunk (Notes: it folds into `dist-*`, with or without the cycle fix), so the entry matched nothing and `size-limit` failed on a missing file; removing it was right. But the guarantee it carried (growth in the availability engine's bytes is visible to `size:check`) went with it, and nothing replaced it. The engine now sits in a `dist-*` chunk (in the local build `dist-D45m9kac.js`, 21.2 kB raw / 7.4 kB gzip, the one containing `weekday_clash`, `scheduleServiceId` and the service-resolution code; two sibling `dist-*` chunks hold other workspace code). Those chunks match no `size-limit` glob. The budget they fall under now is none: `dist/assets/dist-*.js` is on the check's allowlist, whose own contract says an allowlisted chunk carries no budget, and `check-chunk-coverage` passes them. They are also not inside `index-*.js`'s 500 kB budget, since they are separate chunks.
- **Scenario (ranked minor):** a later change adds a layer or a large lookup table to `resolveDay` (the first pass's engine grew by the day-scope work, and each layer adds a module). The `dist-*` chunk grows by, say, 6 kB; no budget trips, `check-chunk-coverage` stays green because the glob is allowlisted, and the availability page and the timeline's Tonight panel download the larger chunk on first load. Ranked minor, not major: nothing is wrong today, the 500 kB entry budget and the vendor budgets still bound the total app, and the run's own 3 kB-to-6.8 kB `schedule-changes` chunk shows the tooling does catch a new named chunk.
- **Should a budget for `dist-*` be tightened?** Not as a plain glob. `size-limit` sums every file a glob matches, so `dist-*.js` would budget three unrelated workspace chunks as one number, and the hashed `dist-*` names are rollup's choice from the source directory, the exact instability that made the `resolve-day` entry vanish. The coverage check also requires a budgeted glob to be removed from the allowlist (its "disjoint" test), so promoting needs both edits. The sound fix is a `manualChunks` group for `@mbe/availability` named `availability-engine` with its own budget (about 8 kB brotlied, from the measured 7.4 kB gzip plus margin), which restores the contract with a stable name.
- **Disposition: deferred.** Reason: it changes the app's chunking, which moves bytes between first-load chunks and needs its own measure of `index-*.js` and the vendor budgets; the CI fix loop's scope was to make `size:check` green, and a chunk-split belongs in its own change with a size comparison. Trigger: the next run that touches `packages/availability/src/resolve-day.ts` or `layer-detail.ts` adds the group and the budget then. The measured chunk size above came from a local `dist/` built at 05:59, not rebuilt by this pass, so treat it as `[INFERENCE]` for the current head.

### Minor 17: the RLS suite-list comment still counts the suites wrongly

- **Where:** `.github/workflows/ci.yml` comment above the `Run RLS integration suites against the owner role` step ("All SEVEN `DATABASE_URL`-gated suites"; "5 files pass in a few seconds") against a list that now names 17 files.
- **Scenario:** a future maintainer reading the comment concludes the list is complete at seven, or that the 15s `hookTimeout` margin was measured for the whole list. No behaviour changes; the coverage test, not the comment, pins the list. The count was already stale before this fix (15 files at the previous head), so this fix did not introduce it.
- **Disposition: deferred.** Reason: comment-only, pre-existing, and it touches the CI file the Ship stage pushes; fold it into the next edit to that list.

### What this section did not examine

Any execution (Verify's runs are relied on, not repeated); the real CI run on the new head `d3013ffb7`/`004c8881a` (not yet observed: Ship pushes it); the Visual Regression (hospitality) job and its baselines; the rest of `ci.yml`; the size of the engine chunk at the current head (the local `dist/` was inspected as built, not rebuilt).

## Verdict

**Update after the CI fix loop (2026-11-04, `d3013ffb7`):** no critical or major finding is open, and the CI fix diff introduced none. It adds two minors, both deferred with reasons: Minor 16 (the engine's size budget was removed with no replacement; its chunk now falls under the unbudgeted `dist-*` allowlist entry) and Minor 17 (a stale suite-count comment in `ci.yml`). This is still a read-only review and not an unqualified pass: the real CI on the new head is not yet observed (Ship pushes, so the three fixed jobs, Build, Lint and Test (rest), are green only on Verify's local replica, E13); the Visual Regression (hospitality) baseline is an Owner step (`workflow_dispatch` of `visual-noise-floor.yml`) and remains open; and the re-verification relied on is Verify's 38 PASS, 2 NOT RUN, 0 FAIL at `004c8881a`. Not examined by this pass: execution of any kind, CI-only jobs, the rest of `ci.yml`, the Visual Regression job, the current-head engine chunk size, and everything the list below names. Ready to ship from the review's side, fail-closed on those open items.

Earlier verdict (3349496dd), still in force for everything the CI fix loop did not touch:

**No critical or major finding is open, and none was introduced by the fix loop: Majors 1, 2 and 3 are fixed (716319fd1, 799e11c04, cdba16575). That is a read-only review (this stage executed nothing, and relies on Verify's 37 PASS, 2 NOT RUN, 0 FAIL at 3349496dd for the runs), so it is not an unqualified pass. Ready to ship from the review's side, with the open items below named.**

- Open, none blocking: 6 original minors still deferred (6, 10, 11, 12, 13, 15), the deferred halves of Minors 3 (exit code) and 14 (behaviour), and 3 new minors (New 1 comment/doc wording, New 2 the duplicate-with-own-days residual, New 3 a hand-rolled in-force pick): 11 deferral entries, each with a reason above. The nine routed minors (1, 2, 4, 5, 7, 8, 9 and the routed halves of 3 and 14) are all fixed; none is left routed.
- Before Ship, by a human: confirm or supersede ADR-031 (Minor 12, still `provisional`); decide whether New 2 matters to the Owner; the timed five-minute walkthrough.
- Not examined, so nothing here reads as a pass over them: any code path by execution (every fix is confirmed by reading and by Verify's runs, not by this stage); CI-only jobs (Migration Dry-Run on postgres:16-alpine, the agent Docker build, visual-regression, Lighthouse, mutation testing, `pnpm regen --check`, `size:check`); the real Auth0 login (E11); a full-stack browser run against the real service (every e2e is mocked and local); a native-speaker review of the es-MX and fr-CA wording, including the new `days_outside_use` string; the Go-to-date Escape flake's cause (pre-existing, 1/60 in Verify's re-run, unfixed); whether NVDA, JAWS or VoiceOver announce the no-break-space repeat (Minor 9); the Owner's timed walkthrough; an apply of the collapse script or the backfill on any database; lint and typecheck by this stage; and the suspicions listed in the first pass, which were not re-settled.
