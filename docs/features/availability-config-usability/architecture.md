---
stage: architect
run: feature:availability-config-usability
date: 2026-11-03
assumptions:
  - "Data model (Owner said 'Architect decides'; the brief authorizes the #7738 change): a service's days and its per-weekday hours live on the existing ScheduleService row, as a weekdays column plus a versioned dayHours jsonb of hour sets. The three alternatives (UI-only on today's model, one row per weekday scope, a seven-entry per-weekday payload) lost; see Decisions. No live Owner confirmed this. ADR-031 records it as provisional and amends ADR-030."
  - "The live strip computes in the browser with the pure @mbe/availability engine over the draft, and makes no preview request. This departs from ux.md F-STRIP 4 and S12, which have the strip ask the venue's real engine through the preview endpoint after the 400 ms debounce. Reason: one producer of the rows serves the strip, the wizard, the calendar's Details and the error fallback, and it needs no API change. The preview endpoint was shown to answer for an unsaved week on an empty venue, so the server variant stays available if the Owner prefers it. Recommendation, not confirmed live."
  - "ux.md S12's loading and error states stay, but their cause is the tables read (useTables), not a preview request; the fallback note reads 'not checked against your tables', not 'against your bookings'. Copy change for Implement; flagged for the Owner."
  - "Change regular week with no end date still writes a new regular-week version (a new Schedule with isRegular, the old one end-dated), as the builder does today, because 'Starting' must keep earlier dates on the old hours. The PRD criterion 'no schedule or assignment was created' is read as: none per weekday, none the Manager sees, names or manages, and the Schedules tab does not appear. A literal reading needs row-level effective dates, which lost. Recommendation, not confirmed live; flagged for the Owner and for Verify."
  - "Migrated day-named schedules collapse by the migration emitting one regular schedule (so Backfill and the on-the-fly legacy read produce the new shape) plus a one-off, dry-run-first script for venues already backfilled. A schedule is collapsible only when it is undated, kind alternate, named exactly '<days> hours', and no use_schedule rule points at it. A Manager-made schedule with another name stays a schedule. Recommendation, not confirmed live."
  - "Request schema: the two new ScheduleService fields default to 'no scope' when absent, so stored rows, old History inverses and old clients parse. A save from an old client that omits them would erase a varied week; the venue's expectedVersion compare-and-set refuses any client that loaded before the varied week was saved. Chosen over making them required, which would break Undo of every pre-change History entry."
  - "Interaction unit (PRD assumption 5, left to Architect): one interaction is one Playwright Locator action (click, fill, check, uncheck, press) issued by the scenario and counted by a wrapper around the test's Page. A time picked from a combobox is two (open, choose). goto, expect and waitFor are not counted. The same wrapper counts both paths on one fixture. Agent stand-in evidence only; the Owner's timed walkthrough stays unclaimed."
  - "Onboarding wizard (ux.md flags it lossy): it keeps sending legacy one-window-per-day hours. A varied week survives per weekday (each day's earliest open to latest close); two services on one day still merge into one window with the gap between them, exactly as two uniform services do today. Accepted, not fixed here: creating the venue and then saving rows is a second call with its own failure window, and no PRD criterion needs it."
  - "History wording (ux.md F12): the audit row gets a new detail code regular_week_changed carrying startsOn and the changed weekdays, not the changed hours. ux.md's example line 'Dinner Fri closes 11:00 PM' therefore reads 'Fri' only unless Implement words hours from the inverse. Recommendation, not confirmed live."
  - "Superseded regular-week versions keep kind regular (today the builder rewrites them to alternate), so 'part of the regular week' is kind === 'regular' and the Schedules tab shows only schedules of another kind. Needed for ux.md W3 ('the Schedules tab does not appear'). Rows saved before this change keep kind alternate and still list."
  - "ADR status: the assignment asks for status provisional, but the repo's pre-commit ADR structural check (tools/cli/src/commands/adr-structural.ts, VALID_STATUSES) rejects any status other than active, superseded or deprecated, and --no-verify is forbidden. ADR-031 therefore carries status: active with provisional: true in its frontmatter, says 'Status: provisional' in its first paragraph, and its README index row reads provisional. Whether to extend VALID_STATUSES is a human call and was not made here."
  - "Standards: the factory and pipeline slice of docs/standards.json (adr0004-typed-ids-in-frontmatter, adr0032-one-way-mirror, stdlib-only) was read. None bears on a decision here (no run-artifact id, no work-order mirror, no root Python script), so no slug is cited."
  - "Facts about the code are as of branch feat/availability-config-usability at 2fd7ae4c9 (2026-11-03). The scratch test for decision (b) was written, run and deleted; it is quoted below and is not part of the tree."
---

# Architecture: One regular week that can differ by day

## Approach

A service row says which weekdays it runs on and may carry other hours for some of them; nothing else about the layer stack changes. `ScheduleService` gains `weekdays` (the days its base hours apply on; empty means every day its assignment covers) and `dayHours` (a versioned jsonb bundle of hour sets, each a set of weekdays with its own opening, last seating, closing, seating and booking types). One pure function in `@mbe/availability`, `hoursOn(row, weekday)`, is the only place that reads those two fields; `resolveDay`, `validateConfig`, `legacy-projection` and every other reader ask it. A row with both fields empty means what it means today, so every stored row, and every uniform quick-setup output, is unchanged.

The editor and the store speak the same shape. Quick setup's service rows, Change regular week and the Schedules editors all produce rows through one pure `encodeWeek` and read them back through `decodeWeek`, so the pre-fill rule in `ux.md` F-UW 5 (base hours are the hours most of a service's days share) is the engine's rule, not a UI copy of it. The regular week is therefore one schedule holding one row per service, however varied.

The live strip needs no endpoint. The engine is pure and already runs in the browser's dependency graph, so the strip, the wizard's local rows, the calendar's Details and the strip's fallback are one function, `weekSpans`, over `applyChanges(emptyConfig, draftChanges)`. The preview endpoint stays as it is for Change regular week's added/removed marks.

Migrated day-named schedules stop existing: the legacy migration emits one regular schedule with scoped rows, and a one-off script folds the day-named schedules of already-backfilled venues into it.

Four shapes lost (details under Decisions): the schedule-per-signature design that stays on today's model, one `ScheduleService` row per weekday scope, a seven-entry per-weekday payload that duplicates the base columns, and row-level effective dates.

## Components

### Service days and hour sets: `packages/availability/src/service-days.ts` (new, pure policy)

- Responsibility: the one rule for which hours a service row has on a weekday, and its inverse.
  - `hoursOn(row, weekday)`: the hour set claiming the weekday, else the base hours when `weekdays` is empty or includes it, else `null`.
  - `servicesOn(rows, venueServices, weekday)`: the live, running services, sorted by opening (what `liveServices` does today for a whole schedule).
  - `decodeWeek(rows, coveredDays)`: per venue service, a weekday → hours map.
  - `encodeWeek(week, coveredDays)`: the canonical rows. Per service the base is the hours most of its days share (a tie goes to the group holding the earliest Monday-first day); `weekdays` is empty exactly when the base days equal the covered days minus the sets' days; other hours become sets ordered by first Monday-first day. Same input, same rows: no churn on re-save.
  - `weekSpans(config, options)`: for seven consecutive service dates from `options.from`, each running service's first and last bookable minute (the engine's own `listSlots`, filtered to tables that fit the party when the venue has active tables), plus whether a service runs but no table fits. Config in, rows out; it takes no clock except the `now` it is given.
  - `regularWeekView(config)`: the config with only live kind-`regular` schedules' assignments and no date rules, so the calendar's saved week and the strip's draft week are the same kind of input.
- Collaborators: `@mbe/types` only. `weekdayIndexOf`, `listSlots` and `resolveDay` (same package).
- Invariant it owns: a weekday is claimed by at most one of a row's base and its sets. Enforced by `validateConfig`, which asks it.

### Layer resolution: `resolve-day.ts` (changed)

- Responsibility: unchanged. `servicesOf(scheduleId)` becomes `servicesOf(scheduleId, weekday)` and calls `servicesOn`. The explanation's `scheduleDetail` and `removalResult` take the same weekday. Nothing after the services are chosen (special hours, closures, Tonight) changes.
- Collaborators: `service-days.ts`.

### Configuration invariants: `validate-config.ts` (changed)

- Responsibility: the invariants the layers satisfy together. Per schedule, overlap is now checked per weekday over `servicesOn`; each hour set goes through the existing `hoursIssues`; a weekday claimed twice in one row is `weekday_clash`. `ConfigIssue` gains optional `weekday` and `otherPath` so the editor can say "Dinner overlaps Brunch on Saturday" without parsing prose.
- Failure modes: never throws; unchanged contract. Issue paths into a set read `scheduleServices[i].dayHours.sets[j].<field>`.

### Legacy projection, migration and collapse (changed, plus one new function)

- `legacy-projection.ts`: per weekday, hull of `servicesOn` for the covering undated assignment. Identical for rows with no scope; per-weekday for scoped rows.
- `legacy-migration.ts` (`buildLegacyConfig`): emits one regular schedule, one assignment over every open weekday, and one scoped row per service name, through `encodeWeek`. The "`<days> hours`" naming and `kind: "alternate"` output are deleted.
- `day-named-schedules.ts` (new): `collapseDayNamedSchedules(config)` returns the `AvailabilityConfigChanges` that fold collapsible schedules into the regular one, or `null` when none qualifies. It owns the name predicate (`weekdayRangeLabel(days) + " hours"`, moved here from `legacy-migration.ts`) and refuses a venue whose collapse would change any resolved weekday, which is how the property test pins it. It is the one rule; the script only applies its result.

### Availability store (reservations service, changed)

- `availability-config-rows.ts`: `scheduleServiceData` writes `weekdays` and `dayHours`; reads go through `ScheduleServiceSchema`, which defaults an absent field to "no scope".
- `availability-snapshot.ts`: `parseRows` already drops a row that fails its schema with a warning; an unknown `dayHours.version` therefore drops the row, and the venue serves what is left (ADR-030 decision 2). No new code beyond the schema.
- `availability-migration.ts` `writeAvailabilityConfig`: writes the two columns, so Backfill and the on-the-fly legacy read produce the new shape.
- `availability-change-detail.ts`: `configSavedDetail` returns `regular_week_changed` (`startsOn`, `weekdays`) when the save changes which hours a regular-week weekday resolves to, found by comparing `decodeWeek` of the regular schedule before and after; otherwise `config_saved` as today.
- `availability-preview.ts`: no contract change. Its `compareWith: "regularWeek"` base (undated assignments, no date rules) is left alone: it is Change regular week's "compare with" choice, a different question from the calendar's saved week.
- Collaborators: Prisma inside the venue's RLS scope, the engine.

### Collapse script: `services/reservations/src/scripts/collapse-day-named-schedules.ts` (new, detail)

- Responsibility: apply `collapseDayNamedSchedules` to venues that were backfilled in the old shape. Same shape as `backfill-availability.ts`: dry run by default, `--apply` writes, one transaction per venue in its own RLS context, one venue failing does not stop the rest, a JSON line per venue that carries the rows it replaced (the log is the backup), exit code 1 only when a venue errored. Safe to re-run: a collapsed venue has nothing left to collapse.
- Per venue, in one transaction: compare-and-set `Venue.availabilityVersion` (+1, so open drafts and old Undo entries get a 409 instead of overwriting); replace the regular schedule's rows with the encoded week; delete the folded schedules' assignments; archive the folded schedules (`ARCHIVED_ON_REMOVE`; History inverses may name them). The folded assignments are deleted rather than kept because `precedenceIssues` reads every assignment, archived schedule or not, and the regular week's assignment now covers the same weekdays at the same precedence: keeping them would make the next save fail with `precedence_tie`. No `AvailabilityChange` row is written, as for Backfill, so the "carried over" banner (`isCarriedOver`: rows and no change) stays for venues nobody has edited.
- Collaborators: the engine's `collapseDayNamedSchedules`, `readStoredConfig`, `getAllVenueIds`.

### Quick-setup draft and form (`apps/hospitality/.../quick-setup-draft.ts`, `QuickSetupForm.tsx`, changed)

- Responsibility: the form state and its translation to rows. `ServiceDraft` gains `days: number[] | null` (`null` follows the shared Days, `ux.md` F1 2) and `blocks` (`{ id, days, opens, lastSeating, closes, lastSeatingLinked }`). `draftToConfig` builds a weekday → hours map from the services and calls `encodeWeek`; `draftFromConfig` is `decodeWeek` plus the presentation (a service whose days equal the shared Days follows them). `validateDraft` keeps asking `validateConfig` about overlap and now maps an issue's path into a block (`QuickSetupIssue.blockId`) and its `weekday` into the message; `days_required` is per service when it has its own days. `draftToLegacyHours` stays `projectLegacyOperatingHours(draftToConfig(...))`.
- A uniform draft (every `days` null, no blocks) encodes to rows with `weekdays: []` and no sets: the same rows it writes today.
- Collaborators: `@mbe/availability` (`encodeWeek`, `decodeWeek`, `validateConfig`).

### Week builder and Change regular week (`schedule-changes.ts`, `ChangeRegularWeekDrawer.tsx`, changed)

- Responsibility: `buildRegularWeekChanges` takes services with their days and blocks, encodes them, and sets the new assignment's weekdays to the union of the days any service runs (`regularWeekdays` is deleted, so the days follow the editor: a closed weekday can be opened, and with no end a weekday no service runs on is closed from the start date). With an end date it still builds a dated alternate schedule over those days and the other days keep their hours. With no end it builds a new regular version named by the seeded `"Regular week"` (no Name field), end-dates the old assignments the day before, and keeps the superseded schedule's `kind: "regular"`. The drawer's save block drops `nameRequired` when there is no end. `DraftPreview` takes a focus date: the first date of the change on the weekday being edited.
- Collaborators: `@mbe/availability`, the preview hook.

### Regular-week weekday edits: day drawer scope and nudge (`draft-changes.ts`, `ScheduleNudge.tsx`, changed)

- Responsibility: `EditScope` kind `schedule`, for a day that resolves to the regular week, becomes `{ kind: "regularWeekday", weekday }`: decode the regular schedule, replace that weekday's services, encode, diff against the stored rows. In place, no start date (it was already in place for scope `schedule`), "Every regular Friday → N future dates" counts the weekday's future dates. The nudge builds the same changes instead of `buildNewScheduleChanges`, with the toast `ux.md` F2 3 gives it.

### Strip and calendar presentation (`apps/hospitality/.../RegularWeekStrip.tsx`, `regular-week-line.ts`, new; `AvailabilityGuestPreview.tsx`, `day-summary.ts`, changed)

- Responsibility: `RegularWeekStrip` (`ux.md` S12) renders `weekSpans(regularWeekView(applyChanges(emptyConfig, draftChanges)))`, recomputed on every draft change (a few `listSlots` calls over seven dates, no network). Party, tables and the "Updated" tag live here: party is a local `Select`; tables come from `useTables({ activeOnly: true })`; "Updated" diffs this render's spans with the last. When the tables read is pending the strip shows spans without the party check under a skeleton note; when it fails it shows the spans, the "Check again" button (refetch) and "These are the hours you typed, not checked against your tables" (`ux.md` S12 error state, cause moved). In the wizard there is no `venueId`, so it passes no tables: the `ux.md` F-ONB local mode, no Party.
- `regular-week-line.ts`: the calendar's one-line summary and Details rows (`ux.md` F-CAL) from `decodeWeek` and `weekSpans(regularWeekView(config))`. "later/earlier/different hours Fri–Sat" compares a set's closing with the base's. Shown to Hosts too: `GET …/availability/config` needs `requireAuth` only (`routes/availability-config.ts:95`).
- `AvailabilityGuestPreview.tsx:301-309` and `day-summary.ts:56-66` print first and last bookable time instead of opening and closing (`ux.md` Voice & terms). `lastSeatingAt` is already in the data they get.
- Schedules tab visibility, `ScheduleEditorDrawer` and `CompareServices`: the tab shows only while a live schedule has `kind !== "regular"`; New/Edit schedule use the quick-setup service rows; Compare services shows a row's base hours and "+ different hours" when `weekdays` or `dayHours.sets` is non-empty, and its edit link opens Edit schedule.

### Agent chat tools (`services/agent`, changed)

- `gen-agent-closure-tools.ts:105-130`: the special-hours payload seeds from the date's schedule rows (`config.scheduleServices.filter(row.scheduleId === scheduleId)`). On a varied week that would copy rows that do not run that day and the base hours on days that have other hours, and a confirmed special-hours rule would then offer guests the wrong times. It now seeds from `servicesOn` for that date's weekday. `@mbe/availability` becomes a workspace dependency of `@mbe/agent-service`: pure, no runtime dependencies, one function used.
- `gen-agent-availability-tools.ts:131` `serviceDayMinute`: earliest opening from `servicesOn` for the date, not from every row's base `opensAt`.
- The Tonight tools (`change_tonight`, undo) read the resolved day through the API and are unchanged.

### Requirement trace (PRD → component)

- Story 1, 2, 3 (own days, own hours, one pass): quick-setup draft and form; service days and hour sets (`encodeWeek`); store rows.
- Story 4 (live strip): strip and calendar presentation; `weekSpans`.
- Story 5 (change one weekday): week builder and Change regular week (in-place weekday edit lives in the day drawer scope); `encodeWeek`.
- Story 6 (calendar, day drawer, guest preview show one regular week): strip and calendar presentation; `resolve-day.ts`; day-drawer scope.
- Story 7 (migrated day-named): legacy migration; collapse script; `day-named-schedules.ts`; Schedules tab visibility.
- Story 8 (uniform no slower): quick-setup draft (uniform encodes to today's rows; the uniform path's controls are unchanged, every new one sits behind a closed disclosure).
- Story 9 (History and Undo): store (`regular_week_changed`, defaults on read, version bump in the collapse script).
- Story 10 (Tonight changes, Host): layer resolution (Tonight is applied after services are chosen, unchanged); agent tools; calendar line readable by Hosts.
- Story 11 (no slot outside availability): layer resolution; configuration invariants; property test (below).
- Criteria: varied week e2e, per-weekday result, one regular week, one-day Change regular week, strip live and honest, demo: quick-setup form, `weekSpans`, week builder. Uniform, varied and large no slower or faster: interaction counter (decision f). Interactions keep working: agent tools, store, History. Copy in three locales: Implement, through the existing i18n pipeline. No regression and the engine property: `slots.property.test.ts` gains a generator for scoped rows.

## Data model

```ts
// packages/types/src/schemas/availability-config.ts
const DayHoursSetSchema = z.object({
  weekdays: z.array(WeekdayIndexSchema).min(1),
  ...ServiceHoursFields, // opensAt, lastSeatingAt, closesAt, seating, bookingTypes
});
export const DayHoursSchema = z.object({
  version: z.literal(1),
  sets: z.array(DayHoursSetSchema),
});
export const ScheduleServiceSchema = z.object({
  id,
  scheduleId,
  venueServiceId,
  ...ServiceHoursFields, // the base hours
  /** Days the base hours apply on; [] = every day the assignment covers, less the days a set claims. */
  weekdays: z.array(WeekdayIndexSchema).default([]),
  dayHours: DayHoursSchema.default({ version: 1, sets: [] }),
});
```

```prisma
model ScheduleService {
  // existing fields …
  /// Days the base hours apply on; empty = every day the assignment covers (less the days a set claims).
  weekdays  Int[]  @default([])
  /// Versioned value bundle: other hours on some weekdays. {version:1, sets:[{weekdays, …hours}]}.
  dayHours  Json   @default("{\"version\":1,\"sets\":[]}") @map("day_hours")
  @@unique([scheduleId, venueServiceId])  // unchanged: a service is one row per schedule
}
```

`ScheduleAssignment` is unchanged. For the regular schedule its one assignment covers the union of the days any service runs (an undated assignment from quick setup, a dated one for a Change regular week version). A row's days that no assignment covers are inert.

Access patterns, with the consistency each needs:

- **Resolve one service day** (every booking path, the calendar, the preview): rows of the covering schedule, expanded for one weekday. Must be true when a save returns: the same transaction that bumps `availabilityVersion` writes the rows (unchanged, ADR-030 decision 4).
- **Resolve a week of spans** (strip, calendar Details): seven dates over one in-memory config. No store read beyond the config the page already holds.
- **Save a regular week** (quick setup, Change regular week): upserts plus removals under one `expectedVersion`. Must be atomic and refuses stale (unchanged).
- **Read one weekday's hours** (day drawer, agent seeding): `servicesOn`, in memory.
- **Fold a venue's day-named schedules** (script): one transaction per venue with a compare-and-set on the version. Settles per venue; no cross-venue consistency needed.

### Accepted behaviour changes

The old rule: a day's services are every row of the covering schedule, all with one set of hours. The new rule: `servicesOn`, per weekday. They agree on every input where both fields are empty, and differ only where listed. The comparison below was run over the input classes, not over the reproductions that motivated the change.

| Input                                                                                         | Old rule                                                                        | New rule                                                                                 | Verdict                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A row with `weekdays: []` and no sets: every stored row, every uniform quick-setup output     | all of the assignment's days, base hours                                        | same                                                                                     | Identical. A property test generates legacy configs and asserts `resolveDay` and `validateConfig` agree with the pre-change functions kept in the test as the oracle. |
| A row scoped to some days under a wider assignment                                            | cannot be stored                                                                | runs on those days only                                                                  | New capability.                                                                                                                                                       |
| A covered weekday on which no row runs                                                        | only an empty schedule; `isDayClosed` says "Closed"                             | same                                                                                     | Identical label and no slots.                                                                                                                                         |
| A row scoped to days no assignment covers                                                     | cannot be stored                                                                | inert; never resolves, not an issue                                                      | Accepted: a dated or other assignment may legitimately differ.                                                                                                        |
| Two rows whose times overlap                                                                  | `overlap` on every day                                                          | `overlap` only on a shared weekday, issue carries `weekday`                              | Accepted. Legacy rows run every day, so they are rejected exactly as before; the only newly accepted configs are the ones the feature needs.                          |
| A weekday in two sets, or in a set and an explicit base                                       | cannot be stored                                                                | `weekday_clash`, 422                                                                     | New invariant.                                                                                                                                                        |
| A migrated pair: regular Mon–Wed plus alternate "Thu–Fri hours" (disjoint days, precedence 0) | alternate wins its days                                                         | collapsed rows give the same services per weekday                                        | Identical resolution, property-tested over `collapseDayNamedSchedules`. The schedule, its name and its label go: those days read "Regular week".                      |
| An alternate whose days overlap the regular week's at higher precedence                       | alternate replaces the day wholesale (a regular-only service vanishes that day) | encoder scopes the regular-only service to the other days                                | Identical resolution. Refused when a `use_schedule` rule or a dated assignment points at the schedule.                                                                |
| Change regular week, no end: which days it covers                                             | the regular schedule's old days; a closed day cannot be opened                  | the union of the days the edited services run; an unrun weekday is closed from the start | Accepted, required by `ux.md` F-UW 4.                                                                                                                                 |
| A superseded regular version                                                                  | rewritten to `kind: "alternate"`, listed on the Schedules tab                   | keeps `kind: "regular"`, hidden there                                                    | Accepted.                                                                                                                                                             |
| Legacy projection of a scoped row                                                             | n/a                                                                             | per weekday                                                                              | New; unchanged for legacy rows.                                                                                                                                       |
| Agent special-hours seeding on a varied day                                                   | every row of the schedule, base hours                                           | rows running that weekday, that weekday's hours                                          | Fixes a wrong-times hazard; identical for legacy rows.                                                                                                                |
| Guest-facing lines in S4 and the calendar's day lines                                         | opening to closing                                                              | first to last bookable time                                                              | Accepted, from `ux.md` Voice & terms.                                                                                                                                 |
| Special hours, closures, Tonight changes, booking-type closures                               | applied after services are chosen                                               | same                                                                                     | Identical.                                                                                                                                                            |

### Migration and rollback

- **New migration folder:** `services/reservations/prisma/migrations/20261103120000_add_schedule_service_day_scope/migration.sql`, additive only:

  ```sql
  -- AlterTable
  ALTER TABLE "schedule_services" ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "day_hours" JSONB NOT NULL DEFAULT '{"version":1,"sets":[]}';
  ```

  Constant defaults, so no table rewrite and no long lock. `@@unique([scheduleId, venueServiceId])` stays, so nothing is dropped. RLS and grants are table-level and already cover the new columns.

- **Forward path, tested:** the CI Migration Dry-Run job applies every migration to a fresh Postgres with `prisma migrate deploy`; `scripts/check-destructive-migrations.js` passes (no `DROP`, `DELETE`, `TRUNCATE`); `scripts/prisma-enum-drift.mjs` is unaffected (no enum). A reservations integration test, on the harness `rls-isolation.integration.test.ts` uses, inserts a row in the old shape (the two columns omitted), reads it through `readStoredConfig` and expects "no scope"; writes a varied week through the store and reads it back byte-equal. `availability-migration.golden.test.ts` already requires the migrated rows to offer the same slots as the legacy oracle over 60 days for every seeded and fixture venue; it is the regression gate for the rewritten `buildLegacyConfig`. It is never run against a real database.
- **Data migration for already-backfilled venues:** none is needed for correctness: existing rows read as "no scope", which is what they meant. The day-named schedules are folded by the collapse script, above. Its tests: a pure property test (`collapseDayNamedSchedules` leaves `resolveDay` of every weekday unchanged, over generated migrated configs, and returns `null` for a config with a dated assignment, a `use_schedule` reference or another name); a unit test on the script with a mocked client (as `backfill-availability.test.ts`); one integration test against Docker Postgres. The script runs in dry-run mode by default and an operator applies it per environment, as with Backfill.
- **Order of release:** deploy, apply the migration, then Backfill (now emitting the collapsed shape). The brief records that the production Backfill has not run, so no production venue holds a day-named schedule; only an environment backfilled earlier (development, staging) needs the script.
- **The door:** two-way for the schema (a later migration may drop the two columns), one-way for data written after the first varied week is saved.
- **What a revert leaves behind:** the columns stay and the previous release ignores them. A venue that saved a varied week would then be read as base hours on every day its assignment covers: guests would be offered times on days the service does not run. No down-converter is built: it would be the old day-named expansion, written for a release that no real venue has used (the brief: no real operator, Backfill not run). Revert is therefore safe only before the first real venue saves a varied week; after that the fix is forward. For the collapse script the log is the rollback: it carries the replaced regular rows and the deleted assignments, and the archived schedules can be unarchived.
- **Stale clients:** an old client that omits the two fields parses as "no scope" and would erase a varied week on a schedule edit; `expectedVersion` refuses any client that loaded before the varied week was saved (assumption 6).

## Interfaces & contracts

### `hoursOn` / `servicesOn` / `encodeWeek` / `decodeWeek` / `weekSpans` (pure)

- Input: rows and a weekday (`hoursOn`, `servicesOn`); a weekday → hours map and the covered days (`encodeWeek`); a config, a start date, a party, tables, `now` (`weekSpans`).
- Output: hours or `null`; running services; canonical rows; seven day entries each with services `{ venueServiceId, firstAt, lastAt, noTableFits }`.
- Failure modes: none thrown. A row whose `dayHours` fails its schema is already gone before these run (the snapshot loader drops it with a warning, so the venue serves what is left). Rows violating `weekday_clash` resolve to the first set listed, which is why `validateConfig` refuses them at every save. `decodeWeek(encodeWeek(w, days), days)` equals `w` for every `w`; a property test pins it.

### `validateConfig` (changed)

- Input: any value. Output: `ConfigIssue[]`, new codes `weekday_clash`, new optional `weekday` and `otherPath`.
- Failure modes: unchanged; the store calls it before every commit and answers 422 `invalid-config` with the issue paths.

### `PUT …/availability/config` (changed payload)

- Input: `{ expectedVersion, changes: { upsert, remove }, scopeConflicts }`; `upsert.scheduleServices[]` rows now carry `weekdays` and `dayHours`, both optional on the wire.
- Output: `{ version, changeId }`. Failure: 422 `invalid-config` (new codes), 409 `version-conflict` with the changes since (also when a retry follows a lost success: the version has moved, the client refetches), 403 for a Host. Retrying a PUT is never silently applied twice.
- Timeout: the request's existing server limits; no new remote call.

### `POST …/availability/preview` (unchanged contract)

- Input and output as today. Read-only and safe to retry; 503 `preview-timeout` after 5 s. Change regular week's draft preview still uses it. The strip does not.
- Verified for decision (b): against an empty saved venue the endpoint answers an unsaved whole week. Existing tests, run on this tree: `pnpm exec vitest run src/services/availability-preview.test.ts src/routes/availability-config.test.ts` in `services/reservations`: `Test Files 2 passed (2)`, `Tests 45 passed (45)`. A scratch test (written, run, deleted) put `source: "empty"` state and a draft with Lunch 11:30–2:30 and Dinner 5:00–8:00 Mon–Fri through `planPreview`: for both `compareWith` values, day 0 (Monday) `added` held 20 seating times with `removed` 0, day 5 (Saturday) `added` 0, and `focusDay.services` listed both services. So the endpoint answers; `added` is the whole bookable list because the base is empty, with no per-service split and only for a venue with no saved hours (against a saved week it is a diff).

### The strip's tables read (cross-process)

- `useTables({ activeOnly: true })` is the one network read the strip makes. Timeout and retry: the hook's own; one retry is the "Check again" button. Failure: the spans still show, without the party check, with the fallback note; Save is never blocked. A retry is a read and is safe.

### Collapse script CLI

- Input: `--apply` (absent = dry run). Output: one JSON line per venue (outcome, replaced rows) and a summary. Exit 1 only when a venue errored. Failure modes: a venue whose compare-and-set misses (a Manager saved meanwhile) is reported `raced` and skipped; re-running is safe and idempotent.

### `AvailabilityChangeDetail` (changed)

- New code `regular_week_changed` with `startsOn` and `weekdays`; the schema is flat optional fields, so `weekdays: z.array(WeekdayIndexSchema).optional()` is added. A client that does not know the code falls back to the English `summary`, as for every code.

## Stack & dependencies

- No new library. Zod, Prisma and Vitest as the codebase has them.
- `@mbe/availability` becomes a dependency of `@mbe/agent-service` — pure, no runtime dependencies, one function crosses the seam (`servicesOn`); cheaper than a second copy of the rule.
- Postgres `INTEGER[]` and `JSONB` — both already used on this table (`booking_types`, `seating`, `rules`).
- `fast-check` for the new property tests — already used by `slots.property.test.ts`.
- Playwright, for the interaction counter — a wrapper over Locator actions in `apps/hospitality/e2e/helpers/`, no new package.
- No seam is introduced: `servicesOn` and `encodeWeek` have two callers each already (engine plus store, editor plus migration), and the collapse is a pure function with one applier.

## Decisions & alternatives

- **(a) Data model: service days and hour sets on `ScheduleService`** (`weekdays` plus versioned `dayHours`; ADR-031) over:
  - UI-only on today's model (a day-named schedule per distinct weekday signature, generated behind the editor) — the demo week needs five schedules and five assignments, regrouped and re-id'd on every edit; "one regular week" becomes a derived membership every reader must know; History inverses and `use_schedule` references name rows the editor keeps replacing; one weekday's change must create or delete schedules and assignments, which is the thing story 5 exists to avoid.
  - One `ScheduleService` row per weekday scope — it has to drop `@@unique([scheduleId, venueServiceId])` (a revert then cannot restore it once two rows exist), and Compare services, `scheduleServiceRows` and the agent all assume one row per service and schedule.
  - A per-weekday hours payload of seven entries — the base columns become dead or duplicated, "which is the truth" is ambiguous, and a uniform week stores seven copies; sets-by-weekday-group keeps the base columns as the truth and a uniform row identical to today's.
  - Row-level effective dates — overlap would need interval reasoning over date ranges and weekdays at once, every schedule editor would need dated rows, and it only buys the literal reading of one PRD criterion (see c, below).
  - Cites no standards slug: none of the factory/pipeline standards bears on it.
- **(b) Strip data: computed in the browser by the pure engine over `applyChanges(emptyConfig, draft)`** over:
  - Seven preview requests — seven times the cost, and `focusDay` gives configured times, not the bookable ones.
  - One request plus a per-date service breakdown on the preview result — a contract and OpenAPI change, the 5 s timeout and a failure state, and the wizard and the error fallback still need a local producer, so the rule would live in two components.
  - A new `week-preview` endpoint — a route, an RLS sweep fixture, an OpenAPI entry, for a result the client can already compute.
  - Keep the endpoint as the strip's source (`ux.md` F-STRIP 4) — it works (shown above) but the strip, the wizard rows, the calendar Details and the fallback would be three computations that must agree.
  - Cost of the choice: `ux.md`'s "asks the venue's real engine" now means the same engine, run locally; S12's loading and error states fire on the tables read, and the debounce goes (assumptions 2 and 3).
- **(c) Migrated day-named schedules: the migration emits one regular schedule, and a one-off script folds the already-backfilled ones** over:
  - Presentation only (the UI groups day-named schedules under "Regular week") — every reader re-derives the grouping, and the Schedules tab still holds them.
  - Fold on the Manager's first save — History shows a change nobody asked for, and venues nobody edits keep "Thu–Fri hours" in the calendar.
  - Fold with a Prisma SQL migration — grouping and re-encoding in SQL has no test harness and cannot be dry-run per venue.
  - **Superseded regular versions keep `kind: "regular"`** over a derived "ended schedule" rule — one stored fact, no date arithmetic in the Schedules tab.
  - **Change regular week with no end keeps a new regular-week version** over in-place row edits — in place cannot honor "Starting" without dating rows (a above) and would rewrite what past dates resolved to.
  - **The `Closes` / `Refs` call: `Closes #7738`.** The issue's two asks are a model that lets one regular schedule carry per-weekday hours (decision a) and collapsing the migrated day-named schedules (this decision); both are designed to completion in code. The one condition: Decompose must keep the migration shape change and the collapse script as items under `(tracker: #7738)`, and Implement checks them off before closing. The script's execution on an already-backfilled environment is an operator step, as Backfill is, and the brief records that no production venue holds day-named schedules. If either item is dropped, say `Refs #7738`.
- **(d) Onboarding wizard: keep the legacy one-window-per-day projection and show the new controls** over hiding the new controls (a varied week survives per weekday through the projection, so hiding them loses what the PRD asks for) and over creating the venue and then saving rows (a second call and a failure window nothing in the PRD requires). Lossy only where two services share a day, exactly as for uniform services today.
  - **Amended 2026-11-05:** the projection lost more than the gap between two services. A venue created with it read back as one service called "Service", its last seating 90 minutes before close (the legacy default, not the time typed), and the Availability page told the new Manager "Your hours were carried over". Launch now saves the hours step's draft as the regular week right after the venue exists, as its own resumable stage (`hours`, between `venue` and `floorPlan` in `launch-sequence.ts`; changes from `launch-hours.ts`). The failure window is the launch's own: the stage panel shows **Hours** failed and Retry re-reads the config and saves again, without creating a second venue. The venue is still created with the projection, so it has hours even if the save never lands.
- **(e) Consumers keep working:** by resolution rather than adaptation. Engine callers (widget listing, hold create and confirm, staff create and update, guest modify, the preview, the closure command, rebooking offers) already go through `resolveDay` and need no change. Direct row readers are named in Components: the snapshot loader, the row mapper, the migration writer, the audit detail, the agent closure tool and `serviceDayMinute`, `compare-changes.ts`, `conflict-review.ts`, `draft-changes.ts`, `CompareServices.tsx`, `quick-setup-draft.ts`, `schedule-changes.ts`, and the fixtures `api-mocks.ts`, `availability-draft-mock.ts`, `dinner-config.fixture.ts`, `resolved-day-fixtures.ts`, `rls-route-sweep.fixtures.ts`. History/Undo: inverses are whole rows, so they carry the two fields; an old inverse parses as "no scope". Tonight changes and booking-type closures apply after services are chosen. Over a "compat shim that flattens varied rows for old readers", which hides the field from the readers that need it.
- **(f) Interaction unit: one Playwright Locator action, counted by a wrapper on the Page** over a keystroke group or a field change (a judgment, not a count; two authors would disagree) and over counting DOM events (browser noise). One fixture set, one wrapper, both paths: the uniform bistro week, the demo week through quick setup, the demo week through quick setup then the Schedules tab (the Schedules tab's New schedule remains, so the "today" path runs on this branch), and the large multi-room setup.

### Trade-offs the Owner has not seen (recommendation each)

1. Data model: sets on the row. Recommend; the alternative with the strongest case is one row per weekday scope, which stays closer to a relational model and loses on the unique index and the readers.
2. Strip: local engine, no endpoint. Recommend; the cost is a departure from `ux.md` F-STRIP 4. The server variant works and is one extension away.
3. Change regular week with no end: a new regular version, not literal in-place. Recommend; the cost is the wording of one PRD criterion.
4. Collapse by migration shape plus script, not by presentation. Recommend; the cost is an operator step, on the venues that need it.

## ADRs

- [ADR-031](../../adr/ADR-031-regular-week-service-days-and-hour-sets.md) — service days and per-weekday hour sets on `ScheduleService` (decision a; with c's migration shape). Status provisional (frontmatter `status: active` plus `provisional: true`: the pre-commit ADR structural check accepts only `active`, `superseded` and `deprecated`, and `--no-verify` is not used; the README index row says `provisional`); it amends ADR-030's decision 2 and does not rewrite it. Hard to reverse once a venue saves a varied week, surprising without context (a service has base hours and sets, and a venue's regular week is one schedule), and a real trade-off among four shapes.
- No other decision met the bar: (b) and (f) are reversible within a release, (c)'s script is reversible from its log, (d) keeps today's behaviour.
