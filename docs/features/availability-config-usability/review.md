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

### Major 2: Change regular week and Edit schedule overwrite every hour set's seating and booking types with the base row's

- Where: `apps/hospitality/src/components/availability/schedule-changes.ts:289` (`buildRegularWeekChanges`) and `:379` (`scheduleRowChanges`), with `quick-setup-draft.ts` `clockTimes` (reads only the three times).
- Scenario: a stored regular-week row has a set on Fri-Sat with `seating: { fixed: [...] }` or `bookingTypes: ["phone"]`, different from the base. `ADR-031` and `DayHoursSetSchema` carry those fields per set, so such a row is valid, and it is reachable from `collapseDayNamedSchedules` (a Manager-made schedule named exactly "Sat-Sun hours" that had its own seating) or from the API [INFERENCE: this stage did not find a UI path that writes a set with different seating]. The Manager opens Change regular week, changes any other time, saves: `draftToConfig` re-stamps default seating on every day, then lines 288-289 copy the base row's `seating` and `bookingTypes` onto the base and onto every set. The Friday set silently becomes the base's seating and booking types. A set that then equals the base reads as "These match the other days" and is removed on save.
- Standard: none.
- Fix: carry `seating` and `bookingTypes` per set through the draft's `HoursBlock` (or re-apply the stored set's two fields by weekday set), and add a test with a set whose seating differs. The Notes document that a service keeps its row's seating; they do not document flattening a set's.
- Decision: route to Implement.

### Major 3: Duplicate schedule is saveable as an all-week, undated, winning schedule when the source is used only by a date rule

- Where: `apps/hospitality/src/components/availability/ScheduleEditorDrawer.tsx:73-76` (`seedDraft` passes the source id), `:140-141` (`weekdays = coveredDays(draft)`), `quick-setup-draft.ts:593-604, 621` (`scheduleDays(config, id, true)` returns all seven days for a schedule with no assignment), `schedule-changes.ts` `buildNewScheduleChanges` (an assignment with the chosen `winner`; default `"new"`).
- Scenario: a schedule "Holiday hours" is used only by a `use_schedule` date rule (no assignment). The Manager clicks Duplicate; the seeded draft covers all seven days; the name is prefilled "Copy of Holiday hours"; one Save writes an undated assignment on all seven weekdays that outranks the regular week. From that save the copy replaces the regular week every day. Before this change a copy started with no weekdays and could not be saved until the Manager chose days (origin/main: `useState<number[]>([])`). The overlap chooser does not stop it, since the new schedule is the winner by default.
- Standard: none.
- Fix: seed Duplicate with no assigned days (`days: []`, or `scheduleDays(..., false)`) so the Manager must pick where it is used, as before; add a test that a duplicate of a rule-only schedule needs days before Save enables. Traced by reading; not executed.
- Decision: route to Implement.

### Minor 1: Edit schedule silently drops a service whose own days are all outside the schedule's days, and deletes its stored row

- Where: `schedule-changes.ts:357-394` with `service-days.ts:134` (`encodeWeek` skips days not in `coveredDays`); `quick-setup-draft.ts` `validateDraft` accepts it; breakdown Notes line "ceiling: the form does not stop the Manager choosing them".
- Scenario: Edit a Mon-Fri schedule, give service "Late" its own days of Sat only. `validateDraft` passes, `encodeWeek` emits no row for it, `removed` (`:387`) deletes the stored row, Save succeeds. The Notes document that days outside are not stored; they do not say the row is deleted, and the ceiling names no trigger. Mitigation: History/Undo restores it.
- Fix: offer only the schedule's days in the own-days picker in edit mode, or add a `days_outside_use` issue.
- Decision: route to Implement.

### Minor 2: the collapse script's `replaced` log is not a complete backup

- Where: `services/reservations/src/scripts/collapse-day-named-schedules.ts:46-61` (`replacedBy` lists only rows the diff updates or removes), `architecture.md` ("the log is the backup").
- Scenario: a service only the folded schedules ran gets a new row from `collapseDayNamedSchedules` (`diff.create`). That row is not in the log, so a rollback from the log leaves it behind. The normal save path records it in the inverse's `remove` ids.
- Fix: add `created: { scheduleServices: ids }` to `ReplacedRows` and the log line, and say in `reference.md` that rollback is manual.
- Decision: route to Implement.

### Minor 3: the collapse script exits 0 when venues were skipped, and its `refused` test compares issue counts

- Where: `collapse-day-named-schedules.ts:148` (`process.exitCode = summary.errors.length > 0 ? 1 : 0`), `:95` (`issues.length > validateConfig(config).length`).
- Scenario: two venues `raced`; the summary says so but the exit code is 0, so a wrapper reads "all done". Separately, a collapse that fixes one stored issue and adds a different one has an equal count and is not refused.
- Fix: print the `raced` count as a warning (or exit non-zero), and compare issue code and path sets. The architecture lists "exit code 1 only when a venue errored" as designed, so the first part is a judgment call.
- Decision: deferred for the exit code (designed behaviour, documented; an Owner step run by hand), route to Implement for the issue-set comparison.

### Minor 4: `encodeWeek` is not canonical when `bookingTypes` or `fixed` seating come in another order

- Where: `packages/availability/src/service-days.ts:118-121` (`hoursKey` stringifies arrays unsorted), `architecture.md` ("same input, same rows: no churn on re-save").
- Scenario: Monday `bookingTypes: ["online","phone"]`, Tuesday `["phone","online"]`, all else equal: two groups, so the encoder emits a base plus a spurious one-day set. The editor probably keeps a stable order, so impact is low.
- Fix: sort `bookingTypes` and a copy of `fixed` inside `hoursKey`; a property test over permutations.
- Decision: route to Implement.

### Minor 5: the "varied week is faster than today" guard cannot fail

- Where: `apps/hospitality/e2e/availability-interaction-guards.spec.ts:102` (`expect(quickSetup.count()).toBeLessThan(counter.count())`).
- Scenario: the second path runs the whole uniform bistro week (5 actions), two clicks, a fill, the entire demo week again and a Save, so it exceeds the first path by construction, whatever the UI does. PRD criterion "Varied week faster than today" is evidenced only by that, and "today's path" in it is not today's (it re-enters the whole demo week in the Schedules drawer). The two body assertions in the same test (sets `[[5,6]]`, weekdays `[2,3,4,0]`) are real.
- Fix: compare against a constant measured once, as the other two guards do, or relabel the test a sanity check and say the criterion rests on the Owner's timed walkthrough.
- Decision: route to Implement.

### Minor 6: the interaction counter undercounts actions it does not wrap

- Where: `apps/hospitality/e2e/helpers/interaction-counter.ts:12-18`.
- Scenario: `dblclick`, `selectOption`, `setChecked`, `tap`, `pressSequentially`, `dragTo`, `page.keyboard.*` and `page.mouse.*` count 0. A later UI change that swaps a counted action for one of these lowers the count and still passes the `<=` guards. No current scenario uses them.
- Fix: add them to the set or state the limit in the header comment (decision (f) names only the five).
- Decision: deferred: no scenario uses them, and decision (f) fixes the unit; revisit when a scenario needs another action.

### Minor 7: the calendar's regular-week line and its Details can disagree after a dated Change regular week

- Where: `apps/hospitality/src/components/availability/regular-week-line.ts:42-48` (`find(isRegular)`, the future week) vs `RegularWeekLine.tsx:44-58` (`weekSpans(regularWeekView(config))` from this Monday, the week in force).
- Scenario: Change regular week "from Dec 1" with Friday closing later. Until Dec 1 the line reads "Dinner Mon-Sun, later Fri" while Details shows no later Friday.
- Fix: build the line from the schedule that resolves today, or label it "from Dec 1".
- Decision: route to Implement.

### Minor 8: one new lint warning, and its disable comment names the wrong rule

- Where: `apps/hospitality/src/components/availability/ScheduleEditorDrawer.tsx:130` (`@eslint-react/exhaustive-deps`: missing dependency `seedDraft`); the comment on line 129 is `eslint-disable-next-line react-hooks/exhaustive-deps`, which is not the rule that fires.
- Fix: name the real rule, or lift `seedDraft` out of the render so the dependency list is honest.
- Decision: route to Implement.

### Minor 9: accessibility details in the new service row

- Where: `QuickSetupServiceRow.tsx:197` (`aria-expanded={service.blocks.length > 0}` on a button whose click always adds another block, never collapses), `QuickSetupForm.tsx:107-112` (`setAnnouncement` with the same string twice gives no DOM change, so the second is not announced), `removeService` moves no focus (focus falls to `body`), while `removeHours` does.
- Fix: drop `aria-expanded` from the add button, alternate or key the announcement, move focus on remove.
- Decision: route to Implement.

### Minor 10: `reapplyWeek` merges by whole service

- Where: `apps/hospitality/src/components/availability/change-week-draft.ts:85-103`.
- Scenario: the Manager adds a block to service X while a colleague changed X's close; `{...mine}` discards the colleague's close (the review panel names X as changed). Kept blocks are not passed through `keepDays`, so a block can keep a day outside coverage that `encodeWeek` drops.
- Fix: merge at block level, or run kept blocks through `keepDays`.
- Decision: deferred: the lost-race path is rare, the review panel names the service, and Undo restores. Revisit with Minor 1's fix, which touches the same days rule.

### Minor 11: lean cut-list over the diff

1. `packages/availability/src/index.ts:1` - dead export: `weekdayRangeLabel` is exported from the package index; the only non-test user is `collapseDayNamedSchedules` in its own file. A repo search of `apps`, `services` and `packages/*/src` found no importer of the index export. Keep it local to `day-named-schedules.ts`.
2. reuse: the Monday-first order `[1,2,3,4,5,6,0]` is declared in `packages/availability/src/service-days.ts:116` (`WEEK_ORDER`, exported), `apps/hospitality/.../schedule-changes.ts:34` (`MONDAY_FIRST`) and `ScheduleFormParts.tsx:22` (pre-existing); `SAMPLE_MONDAY = "2026-10-26"` is declared in both `AvailabilityQuickSetup.tsx:19` and `quick-setup-field-helpers.ts:10`. The covered-days union is hand-rolled in `regular-week-line.ts:42-46` rather than `scheduleDays`.
3. Ceiling with no trigger in prose: the Notes entry for Edit schedule ("ceiling: the form does not stop the Manager choosing them", Minor 1) states a ceiling and no trigger, though the diff carries no `lean:` marker.
   - Net: small. No `speculative` structure found: `servicesOn` and `encodeWeek` each have two or more callers, `collapseDayNamedSchedules` one pure function with one applier.
   - Hand to `deepen`: `quick-setup-draft.ts` (738 lines) mixes draft state, validation, the stored model and the legacy wizard; `replacedBy` (script) and `inverseOf` (store) duplicate the "touched rows" pick; `kind === "regular"` (regularWeekView) and `isRegular` (validateConfig, collapse, drawers) are two notions of "the regular week" that agree only because a superseded version keeps `kind: "regular"`.

- Decision: deferred: no behaviour change; fold item 1 and 2 into the Minor 1/8 fix if Implement is in these files anyway.

### Minor 12: ADR-031's provisional status is invisible to the shipped tool

- Where: `docs/adr/ADR-031-*.md` frontmatter (`status: active`, `provisional: true`), `docs/adr/README.md` (index reads `provisional`).
- Scenario: `adr_status.py` reports ADR-031 with raw status `active` and standing `unrecognized` (as it does for all 31 ADRs); `provisional: true` is not read. A later review will treat a violation of ADR-031 at full severity although the ADR was written without an Owner answer. The workaround is documented (architecture assumption 11) because `tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES` rejects `provisional`, and `--no-verify` is forbidden; the ADR does not edit ADR-030's Decision (only `amended_by: ADR-031`), so the "never rewrite" rule holds.
- Fix: a human call: extend `VALID_STATUSES`, or confirm/supersede the ADR before Ship so the question closes.
- Decision: deferred: the architecture records it as an Owner decision and no code path depends on it; Ship should confirm or supersede ADR-031 first.

### Minor 13: `@mbe/availability` is `workspace:^` in the agent and `workspace:*` elsewhere

- Where: `services/agent/package.json` (`workspace:^`) vs `services/reservations/package.json` and `apps/hospitality/package.json` (`workspace:*`).
- Scenario: none today (workspace links resolve either way, `pnpm install --frozen-lockfile` passes per Notes); the agent's manifest already mixes `^` and `*`, and the Notes say `^` follows the repo's `save-workspace-protocol` default. A spec mismatch for the same package across manifests is what the dependencies pass flags.
- Fix: align to one spec in the next manifest edit.
- Decision: deferred: cosmetic, and the agent manifest's own convention is mixed.

### Minor 14: the agent tool's comment overstates what `serviceDayMinute` reads

- Where: `services/agent/src/routes/gen-agent-availability-tools.ts:130-139`.
- Scenario: the comment says "the services running on `date`'s weekday", but `servicesOn` runs over every schedule's rows (as before this change, per the Notes) and over archived venue services. With a holiday schedule opening at 09:00 and the regular Saturday at 10:00, "09:30" at 00:30 Saturday is read as 09:30 same day rather than minute 2010. This is the pre-existing behaviour, not made worse (it now also filters by weekday), and `specialServices` in `gen-agent-closure-tools.ts` does filter archived services.
- Fix: correct the comment, or restrict to the covering schedule and live services as `specialServices` does.
- Decision: route to Implement for the comment; the behaviour change is deferred as pre-existing and out of this run's scope.

### Minor 15: process findings (code is not affected unless noted)

- RED-first slips, logged by Implement in Notes: Milestone 3 tests were written with the code, and Milestone 4 items 1-3 and Milestone 5 items 1 and 3 reproduced RED afterwards. No defect hides behind it that this review found, but "tests green" for those items is weaker evidence than RED-then-GREEN. Decision: deferred: logged, not repairable after the fact.
- The e2e evidence is a synthetic OIDC session with `auth.setup.ts` skipped and the API mocked by the specs, local only; the demo-week calendar, drawer and preview answers come from `e2e/helpers/engine-days-mock.ts`, which runs the same pure engine the UI uses. The literals in `availability-demo-week.spec.ts:33-52` are hand-written and keep the test from being circular for the demo week; an engine bug that is wrong the same way in the strip and the mock on another week would not be caught. `summarize`/`dayLabel` there mirror the service's `summarizeDay` and can drift. Decision: deferred: stated in `verification.md`; the CI run (E11) is the remaining evidence.
- The es-MX and fr-CA wording was never reviewed by a native speaker (the `_many` strings repeat the `_other` wording; `pnpm check:i18n-catalogs` checks keys, placeholders and plural-form presence only). Decision: deferred: reason is that review needs a native speaker; Owner action before Ship.
- The Go-to-date Escape flake ("Escape on Go to date puts focus back on the menu button") is pre-existing and open (4/60 failed on this branch in Verify's re-run, 1/60 in the fix loop; 2/60 on origin/main in the fix loop, not re-measured here); its cause is [INFERENCE]. `GoToDateDialog.tsx` and `AvailabilityToolbar.tsx` are unchanged against the merge base. Decision: deferred: pre-existing, not introduced by this run; needs its own fix.
- Minor e2e notes: `availability-draft.spec.ts:532` uses `waitForTimeout(700)` before a negative assertion (the only one this diff adds); `availability-interaction-baselines.spec.ts` and the guards spec pin the same two constants twice. Decision: deferred: no failure scenario.

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

## Verdict

**Not ready to ship: 3 majors and 15 minors, all routed or deferred as listed; re-dispatch Review after the Implement fix loop.**

- Blocks: Major 1 (a stale client erases a varied week past the compare-and-set), Major 2 (hour sets' seating and booking types flattened by Change regular week and Edit schedule), Major 3 (Duplicate of a rule-only schedule saves as an all-week winner). Each is `route to Implement` with the fix named. Minors 1, 2, 4, 5, 7, 8, 9 and the issue-set half of 3 and the comment half of 14 are also routed; the rest are deferred with a reason.
- Passes run: correctness, design, security, complexity, ADR compliance, and the Migrations and Dependencies domain passes; Payments was not selected. The repo-rule commands ran with output above.
- Not examined, so nothing here reads as a pass over them: any code path by execution (the three majors are traced by reading, not reproduced); CI-only jobs; the real Auth0 e2e login (E11); a full-stack browser run against the real service; the agent Docker image build; lint outside `apps/hospitality` (no new-warning comparison for `packages/` or `services/`); an apply of the collapse script or the backfill on any database; the Owner's timed five-minute walkthrough (never claimed by an agent); the correctness of the es-MX and fr-CA wording beyond key parity; the Go-to-date flake's cause; performance (no p95 measured); the suspicions listed above; and whether ADR-031 is confirmed by the Owner.
