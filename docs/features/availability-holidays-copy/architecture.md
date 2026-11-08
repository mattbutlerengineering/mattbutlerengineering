---
stage: architect
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "One new date-rule kind, `open_as_usual`, with no payload, saved through the existing PUT config (`changes.upsert.dateRules`, Manager). Guests resolve identically because the engine already selects layers by kind (`ofKind`) and `open_as_usual` selects none."
  - "CORRECTION to prd.md and idea.md, which say 'no SQL migration: date_rules.kind is a string column'. It is not: `DateRule.kind` is the Postgres enum `DateRuleKind` (`services/reservations/prisma/schema.prisma:538-544, 666`; created at `migrations/20261025000000_add_venue_availability/migration.sql:17`). One additive migration is required: `ALTER TYPE \"DateRuleKind\" ADD VALUE IF NOT EXISTS 'open_as_usual'`, the precedent being `20260620000000_add_partial_refunded_deposit_status` and `20260923000000_add_uncollectable_deposit_status`. No table, column or data change."
  - "Stacked run on feat/availability-phone-tonight-v2 (PR #8538). Nothing in flight touches holidays, copy or special dates (idea.md)."
  - "Door: two-way for the app and the engine (reverting restores the localStorage mark and the old Copy). One-way for the enum value (Postgres cannot drop an enum value); it is inert, so leaving it is harmless. Rollback of the server after rows exist needs one statement, see Risks."
---

# Architecture: Holiday decisions that stick, and Copy that says what it does

Three parts: **A** the `open_as_usual` kind across types, engine and server; **B** holiday decisions in the app; **C** Copy. A's public contract is small and fixed here, so B and C build against it in parallel.

## Shared contract

Everything the slices share. Nothing outside this list crosses a slice boundary.

```ts
// packages/types/src/schemas/availability-config.ts  (slice A)
// DateRuleSchema gains one member; DateRule / the inferred type follow. No new export is needed.
DateRuleBase.extend({
  kind: z.literal("open_as_usual"),
  targetKind: z.literal("venue"),     // a venue fact; pinned so no other target can be written
})
// DateRule["kind"] now also includes "open_as_usual".
export type OpenAsUsualRule = Extract<DateRule, { kind: "open_as_usual" }>;   // new, exported

// apps/hospitality/src/components/availability/holiday-decisions.ts  (slice B, new, pure)
export type HolidayDecision =
  | { readonly kind: "undecided" }
  | { readonly kind: "closed"; readonly ruleId: string }
  | { readonly kind: "openAsUsual"; readonly ruleIds: readonly string[] }
  | { readonly kind: "specialHours"; readonly ruleId: string }
  | { readonly kind: "other" };            // a rule this flow does not own covers the date
export interface DecidedHoliday extends Holiday { readonly decision: HolidayDecision }
export function holidayDecisions(country: HolidayCountry, today: string, config: AvailabilityConfig): DecidedHoliday[];
export function openAsUsualRule(date: string, id: string): OpenAsUsualRule;
export function decisionChanges(from: HolidayDecision, to: "openAsUsual", date: string, makeId: () => string): AvailabilityConfigChanges;

// apps/hospitality/src/components/availability/copy-week-draft.ts  (slice C, new, pure)
export function sameHoursAs(source: ResolvedDay, target: ResolvedDay): boolean;
export function thisWeekTargets(input: { date: string; weekdays: readonly number[]; today: string }): { dates: string[]; past: number[] };
export function copyWeekDraft(config: AvailabilityConfig, source: ResolvedDay, date: string, weekdays: readonly number[], makeId: () => string): QuickSetupDraft;

// ChangeRegularWeekDrawer / useRegularWeekEdit  (slice C): one additive prop
readonly initialStartsOn?: string;        // Starting prefilled; counts as dirty
```

The wire shape of the kind: `{ id, kind: "open_as_usual", targetKind: "venue", startsOn: D, endsOn: D }`. No `payload`, `repeat`, `window`, `seriesId`, `venueServiceId`, `bookingTypes`, `tableIds` or `sectionId`. Defaults of `DateRuleBase` mean the row stores `payload = {}`.

## A. The Open-as-usual record

### A1. Decisions

| Question | Decision | Evidence |
|---|---|---|
| Name | `open_as_usual` (snake_case like `special_hours`, `use_schedule`) | `availability-config.ts:193-206` |
| Payload | **None.** A `payload` of `{version:1}` would carry nothing: `closure` and `skip` have none either, and the writer already stores `{}` for a kind without one. | `availability-config-rows.ts:110` (`"payload" in r ? r.payload : {}`) |
| Holiday id | **Not carried.** The rule says "this date is open as usual"; the app names the holiday from `holidaysIn(country, year)`. A closure doesn't carry one either, and a holiday's decision is by date everywhere else (`isPlanned`). The unused `holiday_key` and `source: holiday` columns (`schema.prisma:553-557, 690-691`) are not read or written by any TypeScript; using them would widen Zod, the row writer and the row reader for no behavior. | `holidays.ts:131-142` |
| Target | `targetKind: "venue"`, pinned in the Zod member. | |
| Dates | One date: `startsOn === endsOn === D`, no repeat. The app writes only that shape. The server does not refuse other shapes: the kind is inert for resolution, so an odd row cannot affect a guest. `holidayDecisions` reads only the single-date shape; a range or repeating row is simply not a decision (the holiday reads `undecided`, or `other` if some other rule covers it). | |
| Uniqueness | Not enforced (no DB constraint, no `validateConfig` check). The app writes at most one per date, derives the decision tolerating duplicates (`ruleIds[]`) and removes all of a date's rows on change. Two Managers deciding at once either hit the version compare-and-set (409, line shows Retry) or leave a duplicate that reads the same. | `availability-config.ts` `save` (compare-and-set on `expectedVersion`) |
| Save path | The existing `PUT /venues/:id/availability/config` with `changes.upsert.dateRules` (and `changes.remove.dateRules` to replace). `access: "manager"` (owner, manager or admin); a Host gets 403, matching the read-only Host line in ux.md. | `routes/availability-config.ts:106-130` (`venueScoped({ ...VENUE_FROM_ID, access: "manager" })`) |
| Not via the closures route | `POST …/closures` accepts only `closure` and `special_hours`; any other kind is refused 422. Left as is. | `closure-command.ts:79, 474` |
| Shown in the Special dates list | **No.** It is a decision, not a closure or special hours. `isSpecialDate` is a positive list (`closure` \| `special_hours`), so it is excluded by construction, in every filter (Closures, Special hours, Repeating, Past, All). | `special-dates.ts:13-14, 29-41` |
| Where it is shown | Only as "Open as usual" under Upcoming holidays → Decided (ux.md F1), derived by `holidayDecisions`. | |

### A2. Guests resolve identically (PRD 4)

`resolveLayers` reads `ofKind(rules, "use_schedule" | "special_hours" | "skip" | "closure" | "tonight")` (`resolve-day.ts:231-237, 292-310`); no layer is built from any other kind, and `activeRules` only filters by date, `seriesId` and `repeat` (`date-rules.ts:15-33`). So an `open_as_usual` rule adds no layer, changes no service and no closure band; `resolveDay` output, including `explanation`, is deep-equal with and without it. Booking, preview, the calendar summary and the stranded check all resolve through `resolveDay` (`slots.ts:216-222`, `availability-config.ts:290`), so they follow. Slice A proves this with a test rather than relying on reading (see Tests).

It does **not** reopen a day another rule closes: it is "no decision to change the hours", not an override. `holidayDecisions` therefore reports `other` (not `openAsUsual`) when any other rule covers the date, so the line never claims "Open as usual" on a day a repeating closure still shuts.

### A3. Consumers of `DateRule.kind`

How each learns the new kind. TypeScript is the check for "must handle"; none of the sites below is an exhaustive switch over `DateRule["kind"]` (a grep for `satisfies never`, `assertNever` and `: never` near `kind` finds none in these trees), so **no consumer is flagged by exhaustiveness**; the only compile-time effect is Prisma's enum type (row 20).

| # | Consumer (file:line) | Today | With `open_as_usual` | Action |
|---|---|---|---|---|
| 1 | `packages/types` `DateRuleSchema` (`availability-config.ts:193`) | union of 5 | add 1 member | **Handle** (the change) |
| 2 | `availability-config-api.ts:54, 376, 387, 392, 649, 671, 682` (config state, `changes.upsert.dateRules`, closure bodies) | reference `DateRuleSchema` | the new member parses everywhere the schema is used | Ignore (inherits) |
| 3 | `resolve-day.ts` layers (`:231-310`) | `ofKind` per kind | selects none | Ignore; **test** deep-equal |
| 4 | `date-rules.ts` `covers`/`activeRules` (`:16-33`) | by date, series, repeat | single date row covers D | Ignore |
| 5 | `closure-overlap.ts` (`:32, :122`) | `isClosure`, `kind !== "closure"` | never a closure | Ignore |
| 6 | `slots.ts` `plannedDay` (`:218-220`) | drops `closure`, `tonight` | rule stays, inert | Ignore |
| 7 | `day-named-schedules.ts:73` | reads `use_schedule` only | | Ignore |
| 8 | `validate-config.ts` (`:249, 294, 344-376`) | checks special-hours services, end ≥ start, window, booking types, section | an `open_as_usual` row passes: venue target, no window, no types, no section | Ignore |
| 9 | `layer-detail.ts` `Layer` kinds | schedule, use_schedule, special_hours, skip, closure, tonight | no layer | Ignore |
| 10 | `availability-config-rows.ts` writer (`:99-118`) and reader (`availability-snapshot.ts:190-218`) | `kind: r.kind`, `payload` `{}`, special cases for `use_schedule`/`tonight` | writes the enum value; reads `kind` through `DateRuleSchema.safeParse` | **Handle** via the enum (row 20) |
| 11 | `availability-snapshot.ts:155-164` `failClosedRule` | an unreadable row becomes a venue closure | unchanged; an `open_as_usual` row parses | Ignore |
| 12 | `availability-config-plan.ts` `HOURS_RULE_KINDS`, `isHoursRule` (`:44, :76`), `resolveScopeConflicts` (`:192-218`) | scope conflicts only for `special_hours`, `use_schedule` | not an hours rule: never produces or takes a `skip` | Ignore |
| 13 | `availability-config-plan.ts:366-369` reference checks | `use_schedule`, `special_hours` ids | none to check | Ignore |
| 14 | `availability-config-checks.ts:99-101` `dayLabel` ("Special hours") | `explanation.some(kind === special_hours)` | no layer, label unchanged | Ignore |
| 15 | `availability-change-detail.ts` `configSavedDetail` | counts added/changed/removed rows; `regular_week_changed` only if the week changed | a decision save reads as `config_saved`, 1 row added | Ignore |
| 16 | `closure-command.ts:79, 474, 864`, `closure-alongside.ts:53, 130`, `closure-impact*.ts`, `closure-command-plan.ts` | closures route kinds `closure` \| `special_hours`; alongside replaces closures only | route refuses `open_as_usual` (422). It cannot be a replaced "alongside" row | Ignore; **test** the 422 |
| 17 | `tonight-command.ts:96`, `tonight.ts` | `tonight` only | | Ignore |
| 18 | `availability-migration.ts:189`, `legacy-migration.ts:284` | build `special_hours` from legacy | | Ignore |
| 19 | `routes/availability-config.ts` PUT (`:106-130`) | `access: "manager"` | same gate | Ignore; **test** a Host is 403 |
| 20 | `prisma/schema.prisma:538-544, 666` + migration | enum `DateRuleKind` | needs the value | **Handle**: schema + migration + `prisma generate` (the generated client types `kind` as the enum, so `kind: r.kind` in row 10 fails `tsc` until it is regenerated) |
| 21 | `rls-route-sweep.fixtures.ts`, other tests | build rules | | Ignore |
| 22 | `apps/hospitality` `special-dates.ts` (`:13-14, 29-41`, `matches`) | closure \| special_hours | excluded | Ignore (no code change) |
| 23 | `SpecialDatesTab.tsx:323` (`rules.filter(kind === closure \|\| special_hours)`) , `:460-482` row actions | by kind | not listed | Ignore |
| 24 | `AvailabilityDayDrawer.tsx:109, 146`, `layer-text.ts`, `LayerRuleActions.tsx:182-199` | by **layer** kind; rule lookup by layer id | no layer, so nothing lists it | Ignore |
| 25 | `AvailabilityCalendar` cell summary | from `GET …/days` (`summarizeDay`) | no change | Ignore |
| 26 | `add-dates-draft.ts:73` `hasOwnHours`, `scope-dates.ts:75-109`, `selection-actions.ts:21`, `schedule-changes.ts:60` | `special_hours`, `use_schedule`, `skip` | not counted as "own changes" | Ignore |
| 27 | `holidays.ts:131-142` `isPlanned` (`kind !== "tonight" && !== "skip"`) | any other rule = planned | `open_as_usual` counts as planned, which is what a decision means | **Handle**: replaced by `holidayDecisions` (slice B) |
| 28 | `UpcomingHolidays.tsx`, `NextHolidayNudge.tsx`, `open-as-usual.ts` | localStorage marks | replaced | **Handle**: B |
| 29 | `OnlinePausedBanner.tsx:55`, `TonightControl.tsx:176`, `SchedulesTab.tsx:70`, `SeriesEditDialog.tsx:128`, `ScheduleLayerActions.tsx` | `closure`, `tonight`, `use_schedule`, `skip` | | Ignore |
| 30 | `services/reservations/docs/reference.md`, `packages/availability/CLAUDE.md` | list kinds and layer order | | **Handle**: one line each |

### A4. Saving, and the deploy window

- **Row writer/reader:** no code change beyond the enum (rows 10, 20).
- **Migration** `services/reservations/prisma/migrations/<ts>_add_open_as_usual_date_rule_kind/migration.sql`: `ALTER TYPE "DateRuleKind" ADD VALUE IF NOT EXISTS 'open_as_usual';`, with the "non-destructive, appends only" header comment the two precedents carry. Schema: add `open_as_usual` to `enum DateRuleKind` and to the model's doc comment (`schema.prisma:538, 657`).
- **Order:** migrate DB → deploy the service → deploy the web app. The app must not write the kind before the service accepts it.
- **Older server during a deploy window** (new app, old server): the PUT body fails Zod validation, a 400. `useScheduleSave`'s `reject` falls through to `describeApiError(error).detail` (`use-schedule-save.ts:40-54`); the holiday line does the same with its own state (below): `Couldn't save. Retry`, focus on Retry, never shown as decided (PRD 10). A 400 is not `invalid-config` (422), so it is not mistaken for a validation issue.
- **Older app, new server** (a tab open across the deploy): `packages/api-client/src/client.ts:183` validates the success body with the Zod schema from the bundle the tab loaded. After any `open_as_usual` row exists, an old tab's `GET …/availability/config` fails to parse and the Availability page shows its load error until the tab reloads. Accepted: it is loud, recoverable by a reload, and needs a Manager to have decided a holiday during the window. `apps/hospitality` is a static Worker, so the window is the cache lifetime of an open tab.
- **Rollback of the server with rows in the DB:** the older Prisma client throws when it reads an enum value it does not know. `readStoredConfig` filters `deletedAt: null` (`availability-config-rows.ts:48-52`), so soft-deleting the rows first makes the rollback safe: `UPDATE date_rules SET deleted_at = now() WHERE kind = 'open_as_usual'`. The migration comment says so.

## B. Holiday decisions in the app

### B1. Pure model: `components/availability/holiday-decisions.ts` (new)

`holidayDecisions(country, today, config)` returns every holiday from `today` (inclusive) to `today + 365 days`, in date order, each with its `HolidayDecision`. It replaces `upcomingHolidays` and the private `isPlanned` in `holidays.ts`, and widens the horizon from `HOLIDAY_HORIZON_DAYS = 120` to 365 (PRD 1: 12 months). Classifying a date `D` from `config.dateRules`, skipping `tonight` and `skip` rules, and considering only rules that cover `D` (the same range, `repeat` and `seriesId` test `isPlanned` has now):

1. `closed`: a `closure` rule with `targetKind: "venue"`, no `window`, no `repeat`, no `seriesId`, `startsOn === endsOn === D`. → `ruleId`.
2. else `specialHours`: a `special_hours` rule with `targetKind: "venue"`, no `repeat`, no `seriesId`, `startsOn === endsOn === D`. → `ruleId`.
3. else `other`: any other rule covers `D` (a range or repeating rule, a service, booking or section closure, `use_schedule`, a one-date edit of a series, a Copy rule). This keeps the line honest: "Has special dates".
4. else `openAsUsual`: one or more single-date `open_as_usual` rows on `D`. → all their ids.
5. else `undecided`.

The order encodes: a closure or special hours the Manager made on that date is that holiday's decision (and a stale `open_as_usual` under it is ignored); another rule's shadow is `other`; `open_as_usual` is only the answer when nothing else says anything (A2). Also exported from this file: `openAsUsualRule(date, id)` (the `OpenAsUsualRule` shape above) and `decisionChanges(from, "openAsUsual", date, makeId)`, which returns `{ upsert: { dateRules: [openAsUsualRule] }, remove: { dateRules: <ids of from's specialHours rule or openAsUsual rows> } }`, so replacing special hours or an earlier `open_as_usual` with `open_as_usual` is **one PUT**, remove and upsert together. `USUALLY_CLOSED` stays in `holidays.ts` (it is data about holidays), `holidaysWithin` stays (CloseStepOne), `holidaysIn`, `holidayCountry` stay.

The calendar nudge (`NextHolidayNudge`) becomes `holidayDecisions(...).find(h => h.decision.kind === "undecided" && h.date <= today + 30)`; `other` and every decision count as decided for everyone, because they come from the venue's config.

### B2. The three choices and what each saves

Every transition is one of these; ux.md F1 names the user-visible behavior.

| To | From undecided | From `openAsUsual` / `specialHours` | From `closed` |
|---|---|---|---|
| **Open as usual** | PUT `decisionChanges` (one request) | the same PUT; its `remove` takes the old rule(s) away in the same save (PRD 5) | `ReopenClosureDialog` (the existing reopen command, with its guest-notice consequences), then the PUT |
| **Closed** | `AddSpecialDatesSheet` with one closed row, auto-advanced (B3) | the sheet, then (best-effort) a PUT removing the old `open_as_usual` / `special_hours` rule; if the prune fails nothing is wrong, because `closed` outranks both in B1 and the next Change prunes again | (already closed: no-op) |
| **Special hours…** | `AddSpecialDatesSheet` with one `hours` row (today's `onPlan([holiday])`) | the sheet; the old `open_as_usual` row is ignored by B1 and pruned best-effort | `ReopenClosureDialog`, then the sheet |

Where two requests are needed it is because the first is a **different command**: closing runs through `POST …/closures` (step two for affected bookings, closure notices), reopening through the reopen command (it can notify guests a closure had cancelled). `PUT …/config` can neither add a closure over bookings (it answers `stranded-bookings` 409, `availability-config.ts:290`) nor send those notices, so it must not be used to bypass them. **This deviates from prd.md 5 and ux.md ("removes the old decision in the same save") for `closed` as the old or new decision only.** For every other transition the replace is one PUT. If the reopen succeeds and the second step fails or is cancelled, the holiday is genuinely undecided (nothing is closed, nothing is decided); the line shows it as undecided, with the failure text and Retry where the failure is ours.

`ReopenClosureDialog` gains one optional prop `onReopened?: () => void`, called once after a successful reopen; `SpecialDatesTab` uses it to continue the chain (the PUT or the sheet). Existing callers pass nothing.

### B3. 'Closed' and 'Close these N' reuse the closure path

ux.md says "the existing closure path, including its step two, the Close dialog's flow opened prefilled". The Close dialog (`CloseDialog` → `CloseStepOne` → `CloseStepTwo`) is a one-rule form with a step-one screen the Manager would then have to confirm, which costs a tap. `AddSpecialDatesSheet` is the existing **multi-date** closure save, with the same impact preview (`usePreviewClosureImpacts`), the same `CloseStepTwo` and the same `useCreateClosures` request: one POST, one `Idempotency-Key`, one transaction for all rows, "so a booking is never cancelled for one date while another fails" (its own doc comment). It already takes `initialRows` of closed holidays (that is today's "Plan all"). Two additive props let it serve this flow:

- `autoNext?: boolean`: with valid initial rows, run `next()` once on mount. With nothing affected, `next()` already saves immediately (`found.some(groups) ? setStep(2) : save(found)`); otherwise the sheet shows its step two. The drawer stays closed until step two or a failure, so a Manager who has nothing to decide never sees a flash of the form.
- `savedTitle?: string`: replaces the count-based toast (`availabilitySpecial.add.saved`) with ux.md's "Closed on Thanksgiving, Thu, Nov 26" / "Closed on Thanksgiving, Christmas Day and New Year's Day", built with `Intl.ListFormat`.

This is a deviation from ux.md's wording only: the user sees the same step two and the same toast, minus step one. It keeps one closure implementation. `Close these N` calls it with the `undecided` holidays among `USUALLY_CLOSED` (two or more; with one left the header action is gone and that line's Closed is the action).

### B4. UI components

- `UpcomingHolidays.tsx` (rewritten): props gain `state`, `timezone`, `onStale`, and the callbacks `onClose(rows, title)`, `onSpecialHours(row)`, `onReopen(rule, then)` and `onOpenDay(date)`; `SpecialDatesTab` owns the sheet and the reopen dialog it already hosts (`adding`, `reopening` state) and passes these. Renders the header line + `Close these N`, month `h3` groups of at most the first 5 undecided plus "Show N more", and the folded `Decided (n)` group, in the structure of ux.md F1.
- `HolidayLine.tsx` (new): one holiday: name, date, a `role="group"` of three buttons (`aria-pressed` on the current decision while changing), or the decision text and **Change**. Phone: two rows, 44 px targets (CSS module, `--rialto-*` tokens).
- `use-holiday-decision.ts` (new): per-date state `idle | saving | failed` and `decide(holiday, to)`. For Open as usual it calls `useSaveAvailabilityConfig().mutateAsync({ venueId, body: { expectedVersion: state.version, changes, scopeConflicts: "keep" } })` directly (not `useScheduleSave`: that hook holds one failure list for a whole form; a list of lines needs a failure per date). A 409 `version-conflict` calls `onStale()`; any error leaves the line `failed` with `Couldn't save.` + Retry and does not change the decision shown. Offers Undo through `useAvailabilityUndo` as the old `keepUsualHours` did (`UpcomingHolidays.tsx:50-58`).
- Host: `isManager` is false, so each line shows the decision or "Not decided", with no buttons (ux.md). `UpcomingHolidays` is already Manager-gated in `SpecialDatesTab` (`:432`); a read-only mode for the Host is added, since the PRD makes the Host see decided holidays.
- `other` → Change calls `onOpenDay(date)`. `SpecialDatesTab` gets an optional `onOpenDay` prop; `AvailabilityPage` passes the callback it already gives History (`AvailabilityPage.tsx:798-806`: switch to the Calendar tab and open the day).

### B5. Deletions (clean cutover)

- Delete `open-as-usual.ts` (`readOpenAsUsual`, `writeOpenAsUsual`) and its only readers' use of it (`UpcomingHolidays.tsx:7`, `NextHolidayNudge.tsx:8`). No migration of existing marks (PRD out of scope): they simply stop being read; the key `mbe-availability-open-as-usual:<venue>` is left in browsers.
- In `holidays.ts`: delete `isPlanned`, `upcomingHolidays` and `HOLIDAY_HORIZON_DAYS = 120`; the new horizon constant lives in `holiday-decisions.ts`. Delete the catalog keys no longer used: `availabilitySpecial.holidays.planAll*`, `plan`, `planName`, `openAsUsualName`, and `availability.holidayNudge` wording only if changed (it is not: the nudge line is unchanged).
- `AvailabilityPage.regularWeek.test.tsx:188` seeds the localStorage key to hide the holiday nudge; it now seeds a config with an `open_as_usual` rule.

## C. Copy

### C1. "Just this week": one-off special hours, one per date

`thisWeekTargets({ date, weekdays, today })`: the chosen weekdays within the Monday-to-Sunday week of `date` (use `addDays` and `weekdayIndexOf`, as `copyDayDates` does), minus the copied date's own weekday (it is the source), minus dates before `today` (returned in `past` so the dialog can say "(past)"). Then each target is compared (C3) and equal ones are dropped. The save is the existing builder, unchanged:

```ts
buildDraftChanges({
  config: state.config,
  scope: { kind: "dates", dates: targets },                    // one single-date special_hours rule per date
  services: seedServices(state.config, day, { kind: "date", date }),   // the copied day's resolved hours
  makeId: () => crypto.randomUUID(),
  today,
})
```

`scope.kind === "dates"` maps each date through `dateRule(config, d, payload, makeId)` (`draft-changes.ts`), so: no repeat, no end-date hunting, `startsOn === endsOn`. Saved with `useScheduleSave` as today, scope-conflict mode `"keep"` (no longer a user choice: the one-off rule on a date that already has its own hours is left out by `hasOwnHours`-style reasoning inside `dateRule`; see Risks, and `OwnChangesChoice` is removed from this dialog). Toast: `availabilitySchedules.copy.copied` with weekday names and dates, via `Intl.ListFormat`.

### C2. "Every week": Change regular week, prefilled

The existing nudge, `ScheduleNudge` ("Make these {{weekday}}'s regular hours", `availabilitySchedules.nudge.make`), does the in-place version of the same job: `buildDraftChanges({ scope: { kind: "regularWeekday", weekday }, services: seedServices(config, day, { kind: "date", date }) })`, saved immediately. Copy reuses its two building blocks, not its save:

- **Prefill** `copyWeekDraft(config, source, date, weekdays, makeId)`: starting from `config`, apply for each chosen weekday `w` the `buildDraftChanges` `regularWeekday` change (`regularWeekdayRows`, `draft-changes.ts:296-340`: the chosen weekday takes the copied day's services and hours, a service the copied day lacks loses that weekday, a service the week never ran is added) through `applyChanges` (exported from `@mbe/availability`, `index.ts:3`), then `draftFromConfig(next, makeId)` (`quick-setup-draft.ts:452`) turns the result into the `QuickSetupDraft` the form edits, with different-hours blocks where a service's hours differ by day. This reuses the nudge's weekday logic wholesale, so Copy and the nudge can never disagree about what "copy Tuesday to Wednesday" does to the week.
- **Open** the existing `ChangeRegularWeekDrawer` with `initialDraft` (the prop the Schedules tab's "Starting later…" already uses, `SchedulesTab.tsx:111, 276-285`), mounted from `CopyDayAction` itself, because the day drawer has no Schedules tab. The Copy dialog closes when the drawer opens (ux.md). The drawer keeps its own preview, conflict review, Save and Undo.
- **Starting** needs one additive prop: `ChangeRegularWeekDrawer`/`useRegularWeekEdit` take `initialStartsOn?: string` and initialise `pickedStart` with it (`use-regular-week-edit.ts:63-66`; today it starts `null`, and `fixedStart` is the wrong tool: it pins the start and removes the end date). `dirty` already counts a non-null start (`:109-110`), so the discard guard works. Value: the later of the copied date's week start (Monday) and `today` (ux.md).

"Every week" does not apply the "already the same" skip to the week as a whole: it skips the weekdays whose regular hours already equal the copied day's (so the prefilled draft changes only the others) and disables the primary action when every chosen weekday does (PRD 8, ux.md).

### C3. "Already the same": a pure comparison over the resolved day

`sameHoursAs(source, target)`: two `ResolvedDay`s are the same when their `services` are equal as ordered lists after sorting by `opensAt`, comparing `venueServiceId`, `opensAt`, `lastSeatingAt`, `closesAt` for each. (Not `seating` or `bookingTypes`: PRD 8 names services, times and last seating, and the copy carries seating and booking types from the source, so a day that differs only there is a legitimate change the Manager did not ask to skip; this is recorded in Risks.) The target days are resolved in the app with `resolveDay({ timezone, config: state.config }, date)`, as `SpecialHoursEditDrawer.tsx:36` and `UseScheduleDialog.tsx:50` already do, using the date's own resolution, so a date with its own special hours that already equals the source is "already the same" too, and one that a whole-day closure shuts is **not** (its `services` are unchanged but `closedAllDay` from `closed-all-day.ts` marks it different, so Copy offers it rather than silently skipping a closed date). `CopyDayAction` already has `day` for the copied date; it needs `timezone`: one more prop passed from `editing.timezone` at `AvailabilityDayDrawer.tsx:366`.

For "Every week" the comparison is against the **regular week's** weekday, resolved with `{ ...config, dateRules: [] }` over the next date for that weekday (the same trick `regularServices` uses, `add-dates-draft.ts:163-171`).

### C4. Files in Copy

- `copy-day.ts`: delete `CopyTarget.from/until`, `copyDayDates`, `buildCopyDayChanges` (the repeating special-hours rule) and `SCOPE_HORIZON_DAYS` import; keep `singleDateChangeCount` and `NUDGE_THRESHOLD` (`ScheduleNudge`'s). Add nothing here; new code goes to `copy-week-draft.ts` so `copy-day.ts` stays about the nudge.
- `copy-week-draft.ts` (new, pure): `sameHoursAs`, `thisWeekTargets`, `copyWeekDraft`.
- `CopyDayAction.tsx` (rewrite): DayPicker chips (the copied weekday selected-disabled), a "How often" radio group (`availabilitySchedules.copy.*` keys from ux.md), the live consequence line, the already-same line, and the two primary actions; **delete** the From and Until `DatePicker`s, the `from/until/mode` state, `OwnChangesChoice`, the `impact` line and the `availabilitySchedules.copy.from|until|save_*|saved_*` keys. ux.md says "the same DayPicker chips and shortcuts as the week form"; `WeekdayToggles` in `ScheduleFormParts` is what the current dialog uses, and the shortcuts (Weekdays, Weekends, Fri–Sat, Every day) are `quick-setup-draft.ts:73-76`; C reuses whichever component the week form actually renders (find `DayPicker` in `QuickSetupForm`) and adds the "disabled selected" state to it as a prop (`lockedDays`), rather than a second picker.
- `ChangeRegularWeekDrawer.tsx`, `use-regular-week-edit.ts`: `initialStartsOn`.
- `AvailabilityDayDrawer.tsx:366-375`: one prop, `timezone`.
- Catalogs: add `availabilitySchedules.copy.*` per ux.md; remove replaced keys.

## D. Files

Slice A (kind): `packages/types/src/schemas/availability-config.ts`, `services/reservations/prisma/schema.prisma`, `services/reservations/prisma/migrations/<ts>_add_open_as_usual_date_rule_kind/migration.sql`, `services/reservations/docs/reference.md`, `packages/availability/CLAUDE.md`, tests (D1).

Slice B (holidays): `holiday-decisions.ts` (+test), `holidays.ts` (delete `isPlanned`, `upcomingHolidays`), `holidays.test.ts`, `UpcomingHolidays.tsx` (+test), `HolidayLine.tsx` (+module.css), `use-holiday-decision.ts` (+test), `NextHolidayNudge.tsx`, `open-as-usual.ts` (delete), `SpecialDatesTab.tsx` and `.test.tsx`, `SpecialDatesTab.module.css`, `AddSpecialDatesSheet.tsx` (`autoNext`, `savedTitle`), `ReopenClosureDialog.tsx` (`onReopened`), `AvailabilityPage.tsx` (pass `onOpenDay`; ≤ 3 lines on an 866-line file, as the previous run), `AvailabilityPage.regularWeek.test.tsx`, catalogs `availabilitySpecial.holidays.*` ×3.

Slice C (copy): `copy-week-draft.ts` (+test), `copy-day.ts` (+test), `CopyDayAction.tsx`, `ChangeRegularWeekDrawer.tsx`, `use-regular-week-edit.ts`, `AvailabilityDayDrawer.tsx` (one prop), `ScheduleFormParts.tsx` or the week form's day picker (`lockedDays`), catalogs `availabilitySchedules.copy.*` ×3, `AvailabilityDayDrawer.draft.test.tsx`, `ScheduleSaveUndo.test.tsx`, `use-reload-hold.test.tsx` where they click "Copy to N dates".

Slice D (e2e): `e2e/availability-holidays-copy.spec.ts`, `e2e/helpers/shared-config-mock.ts`; deliberate updates to any spec that counts the Special dates first paint or opens the Copy dialog (`availability-dead-ends.spec.ts:164-216, 366`, `availability-draft.spec.ts:110, 234, 254`, `availability-setup-hierarchy.spec.ts:223`).

Shared by B and C: the three catalogs only, each under its own namespace (the previous run's rule).

## E. Tests

**D1. Engine and server (slice A).**
- `packages/availability`: `resolveDay` with a venue `open_as_usual` rule on a date deep-equals `resolveDay` without it, for a plain day, a special-hours day and a closed-by-closure day, including `explanation`; `activeRules` returns it (it is a rule) and `ofKind` for every other kind excludes it; `validateConfig` accepts it. The booking judge's verdict (`judge`/`strandReason`) is identical with and without it for a slot on that date (PRD 4: same hours, booking and preview).
- `packages/types`: `DateRuleSchema` parses `{kind:"open_as_usual", targetKind:"venue", …}`; rejects `targetKind: "service"`; the config-state and changes schemas accept it.
- `services/reservations`: PUT config upsert then GET returns the row (integration, the pattern of `availability-config.test.ts`); the write goes through `dateRuleData` to the enum (`availability-config-rows.test.ts`); remove + upsert in one PUT replaces a `special_hours` row; a Host gets 403; a stale `expectedVersion` gets 409; `POST …/closures` with the kind gets 422 (`closure-command.ts:474`); the calendar summary label is unchanged; `rls-route-sweep` still passes.
- Migration: applies on a database that has rows of every old kind.

**B (slice B), component.** `holiday-decisions.test.ts`: every row of B1's order (closed over a stale `open_as_usual`; `other` over `open_as_usual`; range, repeating, section and service closures are `other`; one-date edit of a series; `skip` and `tonight` ignored; duplicates), the 365-day horizon and the year boundary. `UpcomingHolidays.test.tsx`: three choices per line, the header action's visibility rules (two or more undecided of `USUALLY_CLOSED`), the Decided group and Change, the failure state with Retry and focus, Host read-only, the PUT body for Open as usual and for replacing special hours (one request, both `upsert` and `remove`), the closed path calling the sheet with `autoNext`. `NextHolidayNudge` counts `openAsUsual` and `other` as decided.

**C (slice C), component.** `copy-week-draft.test.ts`: `sameHoursAs` (services, times, last seating, order, different seating only), `thisWeekTargets` (week boundaries, past days, the source weekday, Sunday), `copyWeekDraft` (the chosen weekdays take the day's services; a missing service loses the weekday; a new service is added; the result round-trips through `draftToConfig` to the same week). `CopyDayAction.test.tsx`: this-week saves one rule per date with no `repeat` and no `endsOn` beyond the date; every-week opens the drawer with the prefilled draft and Starting; all-same disables the primary with the reason; the toast names dates, never a count; no From/Until.

**E2E (slice D).** On the e2e fixtures with today pinned to Sun, Nov 8, 2026 (`helpers/scenario-fixtures.ts`), annotated with interaction counts through `countInteractions` like the previous specs: H1, H2, H3, K1, K2 as PRD 9's table.
- **H2's two contexts.** Playwright route handlers run in the test process, so two `browser.newContext({ storageState })` pages (the `realtime-collaboration.spec.ts:94-107` pattern) can share one in-memory config store: `helpers/shared-config-mock.ts` serves `GET`/`PUT …/availability/config` for both from one object, applies upserts and removes, and bumps `version`. Page A decides Christmas Eve (assert the PUT body, count ≤ 3); page B loads Special dates, sees Christmas Eve under Decided with `0` decisions made, and the calendar nudge does not name it.
- **K1.** Copy Tuesday to Wed and Thu every week: the drawer opens prefilled; Save; assert the PUT has `scheduleServices`/`assignments` and **no** `dateRules` upsert (PRD 9: "no special-hours rule created"). Copy onto matching days: no PUT at all.
- **H-failure.** The shared mock answers the PUT 400 once: the line says `Couldn't save.` with Retry and is not decided.
- The existing a11y, fold-budget and locale specs run unchanged except where the Special dates first paint changes the count: updated deliberately, listed in the breakdown notes.

## F. Risks

- **The enum, not a string.** PRD and idea say there is no migration; there is. It is one additive statement with two precedents, but it makes the deploy order (DB → service → web) load-bearing and leaves the Prisma client to regenerate before `tsc`. Mitigation: slice A lands first as its own commit; B and C branch from it.
- **Closure round trips.** A change to or from Closed is two requests, not one (B2). A mid-chain failure leaves the holiday undecided, never wrongly decided. The reopen dialog's confirmation is a real cost to the Manager for a closed holiday with cancelled bookings; it is the honest one.
- **Stale rows.** A decision made on top of an older `open_as_usual` or `special_hours` row from another path leaves it in place when the prune fails. B1's precedence makes them harmless; they do not appear in Special dates (`open_as_usual`) or are shadowed (`special_hours`).
- **Concurrent Managers** can both write an `open_as_usual` for the same date: one wins the version compare-and-set; a duplicate that does get in reads as one decision and is removed together.
- **Old tabs.** A tab loaded before the deploy fails to parse a config containing the kind until reloaded (A4). Accepted.
- **Scope conflicts in "Just this week".** The new dialog has no keep/replace choice. `dateRule()` writes a one-date rule per target; a target that already has its own one-off hours is either equal (dropped by the comparison) or replaced by the new rule, which is what the Manager asked for by copying onto it. Slice C verifies `dateRule`'s behavior on a date that already has a one-date `special_hours` rule and keeps the saved result free of overlapping rules (the server's `resolveScopeConflicts`, `mode: "keep"`, would otherwise add a `skip`). If `dateRule` does not replace, `buildDraftChanges`'s `leaveOut` is the existing parameter for it; decide there, not here.
- **Equal hours except seating or booking types** are treated as different (C3): Copy then writes a rule that changes only those. Intended; PRD 8 names services, times and last seating.
- **File sizes.** `SpecialDatesTab.tsx` is 644 lines: it gains the pass-through props and the reopen chain (≤ 40 lines); the new logic is in new files. `AvailabilityPage.tsx` is 866 on the base, already over the 800 limit; this run adds ≤ 3 lines and does not split it (seeded, as in the previous run). `UpcomingHolidays.tsx` (119 lines) grows but is split into `HolidayLine.tsx` and `use-holiday-decision.ts`.
- **First-paint count.** Special dates now renders three buttons per holiday line and a "Decided" group: `availability-setup-hierarchy.spec.ts` and the fold-budget spec pin counts; update them deliberately.
- **`holiday_key` and `source: holiday`** stay unused. A later "which holiday is this" need (a different country, a renamed holiday) would use them; not now.
