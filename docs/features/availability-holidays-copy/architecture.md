---
stage: architect
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "REVISED (Main, 2026-11-08). The first design stored the decision as a new `DateRule` kind, `open_as_usual`. Rejected: it put a non-availability fact into the availability config, so (a) every tab loaded before the deploy, including Host stations that keep Timeline open all night and parse the config for Tonight, fails to load the config once one row exists (`packages/api-client/src/client.ts:183` validates the response with the bundled Zod schema); (b) a server rollback with rows present breaks Prisma reads of all date rules (the enum). Both are user-visible outages."
  - "Decision store: a separate, additive table `venue_holiday_decisions` with its own three endpoints. The availability config, `DateRuleSchema`, the `DateRuleKind` enum, the engine and the booking path are not touched, so guests resolve identically by construction (PRD 4) and an old client or an old server never meets the new fact: an old client never calls the endpoints, a rolled-back server leaves an unused table."
  - "CORRECTION to prd.md and idea.md, which say 'no SQL migration'. The new table needs one `CREATE TABLE` migration, with the row-level-security policy and grants every venue table in this service carries (ADR-026). No existing table, column, enum or row changes."
  - "Stacked run on feat/availability-phone-tonight-v2 (PR #8538). Nothing in flight touches holidays, copy or special dates (idea.md)."
  - "Door: two-way. Reverting the app and the service leaves an unused table that nothing reads; the table can be dropped later by a migration."
---

# Architecture: Holiday decisions that stick, and Copy that says what it does

Three parts: **A** the venue holiday-decision store (table, endpoints, types, api-client), **B** holiday decisions in the app, **C** Copy. A's public contract is small and fixed here, so B and C build against it in parallel.

## Shared contract

Everything the slices share. Nothing outside this list crosses a slice boundary.

```ts
// packages/types/src/schemas/holiday-decisions.ts  (slice A, new; exported from the package index)
export const HolidayDecisionKindSchema = z.enum(["open_as_usual"]);
export type HolidayDecisionKind = z.infer<typeof HolidayDecisionKindSchema>;
export const HolidayDecisionSchema = z.object({
  serviceDate: ServiceDateSchema,                  // "YYYY-MM-DD"
  decision: HolidayDecisionKindSchema,
  createdAt: z.string(),                           // ISO instant
});
export type HolidayDecision = z.infer<typeof HolidayDecisionSchema>;
export const HOLIDAY_DECISIONS_MAX_RANGE = 400;    // days, from..to inclusive
export const HolidayDecisionsQuerySchema = z.object({ from: ServiceDateSchema, to: ServiceDateSchema });
export const SetHolidayDecisionBodySchema = z.object({ decision: HolidayDecisionKindSchema });

// packages/types/src/endpoints/holiday-decisions.ts  (slice A, new)
export const holidayDecisionEndpoints = { list, set, clear };   // defineEndpoint, see § A2

// packages/api-client/src/availability.ts  (slice A; methods on the existing availability client)
listHolidayDecisions(venueId: string, range: { from: string; to: string }): Promise<HolidayDecision[]>;
setHolidayDecision(venueId: string, serviceDate: string, decision: HolidayDecisionKind): Promise<HolidayDecision>;
clearHolidayDecision(venueId: string, serviceDate: string): Promise<void>;

// apps/hospitality/src/hooks/useHolidayDecisions.ts  (slice B, new)
export const HOLIDAY_DECISIONS_QUERY_KEY = "holidayDecisions" as const;
export const useHolidayDecisions: (params: { venueId: string | null; from: string; to: string }) => QueryResult<HolidayDecision[] | null>;
export const useSetHolidayDecision;     // mutation { venueId, serviceDate, decision }
export const useClearHolidayDecision;   // mutation { venueId, serviceDate }

// apps/hospitality/src/components/availability/holiday-decisions.ts  (slice B, new, pure)
export type HolidayState =                // NOT the wire `HolidayDecision`; this is what a line shows
  | { readonly kind: "undecided" }
  | { readonly kind: "closed"; readonly ruleId: string }
  | { readonly kind: "openAsUsual" }
  | { readonly kind: "specialHours"; readonly ruleId: string }
  | { readonly kind: "other" };           // a rule this flow does not own covers the date
export interface DecidedHoliday extends Holiday { readonly state: HolidayState }
export function holidayStates(
  country: HolidayCountry, today: string,
  config: AvailabilityConfig, decisions: readonly HolidayDecision[]
): DecidedHoliday[];

// apps/hospitality/src/components/availability/copy-week-draft.ts  (slice C, new, pure)
export function sameHoursAs(source: ResolvedDay, target: ResolvedDay): boolean;
export function thisWeekTargets(input: { date: string; weekdays: readonly number[]; today: string }): { dates: string[]; past: number[] };
export function copyWeekDraft(config: AvailabilityConfig, source: ResolvedDay, date: string, weekdays: readonly number[], makeId: () => string): QuickSetupDraft;

// ChangeRegularWeekDrawer / useRegularWeekEdit  (slice C): one additive prop
readonly initialStartsOn?: string;        // Starting prefilled; counts as dirty
```

(The wire type is `HolidayDecision` and the line's state is `HolidayState`; the first draft's `HolidayDecision` union, `decisionChanges` and `holidayDecisions` are gone.)

## A. The holiday-decision store

### A1. Table

New Prisma model in `services/reservations/prisma/schema.prisma`, next to `AvailabilityChange` (`:732`):

```prisma
/// A Manager's answer for one holiday that does not change the hours: today, "open as usual".
/// Not availability config: nothing in the engine reads it. One row per venue per service date.
model VenueHolidayDecision {
  id              String   @id @default(cuid())
  venueId         String   @map("venue_id")
  venue           Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  serviceDate     DateTime @map("service_date") @db.Date
  /// `open_as_usual`. A string, validated by `HolidayDecisionKindSchema` at the boundary.
  decision        String
  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  @@unique([venueId, serviceDate])
  @@map("venue_holiday_decisions")
}
```

- **`decision` is a string, not an enum.** Every other availability table uses Postgres enums, and that is exactly what made the first design's rollback unsafe: an old Prisma client throws when it reads a value its enum does not list. A string column cannot do that, a new value later needs no migration, and the reader parses each row with `HolidayDecisionKindSchema.safeParse` and skips (and logs) a value it does not know, like `parseConfigRows` does for rules. With one value today the column is deliberately minimal: it is the only thing that keeps the table's meaning explicit and lets a second answer be added without reshaping it.
- **`serviceDate`** is a `@db.Date` like `DateRule.startsOn` (`:677`); the service converts with `toDbDate` (`availability-config.ts:493`) and `toISOString().slice(0, 10)`, the way `availability-snapshot.ts:123` does.
- **`createdByUserId`** is nullable, with no FK, as `AvailabilityChange.actorId` has none: a removed user must not break the row.
- **Uniqueness** is the DB's: `@@unique([venueId, serviceDate])`, which also serves the range read (leading `venue_id`). No second index.
- **FK** `onDelete: Cascade`, as the availability tables have since `20261106013402_cascade_venue_delete_availability_config` (the original SQL said RESTRICT, that migration made it CASCADE).

**Migration** `services/reservations/prisma/migrations/<ts>_add_venue_holiday_decision/migration.sql` (timestamp folder per repo convention, after `20261107120000_add_date_rule_section`), one `CREATE TABLE` plus its unique index and FK, from `prisma migrate diff` unedited, then hand-written exactly as `20261025000000_add_venue_availability` does (`:287-359`):

```sql
ALTER TABLE "venue_holiday_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "venue_holiday_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY venue_holiday_decision_isolation ON "venue_holiday_decisions"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "venue_holiday_decisions" TO app_reservations;
```

(UPDATE is granted although the upsert's update branch is empty, so a later second answer needs no migration.) RLS, the policy and the grant are not optional: ADR-026 requires them of every table with `venue_id` (that migration's header), and `rls-route-sweep.integration.test.ts` fails a route with no fixture. The Prisma client must be regenerated; the new model type has no effect on any existing query.

### A2. Endpoints

Defined in `packages/types/src/endpoints/holiday-decisions.ts` with `defineEndpoint` (the pattern of `availabilityConfigEndpoints`, `endpoints/availability-config.ts`), under the same prefix `AVAILABILITY_CONFIG_PREFIX = "/api/v1/venues"` and the same `:id` venue param (not `:venueId`: every route in that prefix uses `:id`, `VenueParamsSchema`). Routes in a new `services/reservations/src/routes/holiday-decisions.ts`, registered beside the others at `app.ts:317-320` with `fastify.register(holidayDecisionRoutes, { prefix: AVAILABILITY_CONFIG_PREFIX })`, using `registerEndpoint` (`@mbe/service-bootstrap`), `requireAuth` and `venueScoped`, exactly as the small `routes/availability-changes.ts` does.

| | Path | Access | Request | Success | Errors (RFC 7807, `createProblemDetails`) |
|---|---|---|---|---|---|
| `list` | `GET /api/v1/venues/:id/availability/holiday-decisions?from&to` | any venue member (Host included): `venueScoped(VENUE_FROM_ID)`, as `getConfig` | `HolidayDecisionsQuerySchema`; `from ≤ to`, at most `HOLIDAY_DECISIONS_MAX_RANGE` days | 200 `{ data: HolidayDecision[] }`, by date | 400 bad or too long range, 401, 403 not a member, 404 venue |
| `set` | `PUT …/holiday-decisions/:serviceDate` | Manager: `venueScoped({ ...VENUE_FROM_ID, access: "manager" })`, as `putConfig` | body `{ decision: "open_as_usual" }`; `:serviceDate` is `ServiceDateSchema` | 200 `{ data: HolidayDecision }` | 400 bad date or body, 401, 403 not a Manager, 404 venue |
| `clear` | `DELETE …/holiday-decisions/:serviceDate` | Manager, as `set` | none | 204, no body (`body: null`, as `define.test.ts:43`) | 400, 401, 403, 404 venue |

- **`set` is an idempotent upsert** on `(venueId, serviceDate)` with an empty update: a repeat returns the existing row unchanged (its original `createdByUserId` and `createdAt`), never a 409.
- **`clear` is idempotent**: `deleteMany` by the pair; a missing row is still 204.
- **Authorization** is the existing ADR-020 decision inside `venueScoped`, not new code (`routes/venue-scope.ts`); the Host's read is what lets the Host see decided holidays read-only (ux.md F1) and what lets Timeline-style stations load the panel without a Manager token.
- **Service:** `services/reservations/src/services/holiday-decision.ts` (`holidayDecisionService`: `list`, `set`, `clear`), added to `defaultDomainServices` in `domain-services.ts` and resolved in the route through `fastify.services` (`routes/domain-services-adoption.test.ts` fails a route that imports the singleton). It runs inside the request's venue context, so RLS applies; the service returns `null` for an unknown venue (404), as `availabilityChangesService.list` does.
- **Rate limits:** none per route. The sibling availability routes set none (`availability-config.ts`, `availability-changes.ts`) and rely on the app's global limiter (`holds.ts:150` shows the per-route `config.rateLimit` form for the public hold route, which is not a model here); a Manager-only write of one small row needs nothing tighter.
- **OpenAPI:** `registerEndpoint`'s `docs` block (`summary`, `operationId`: `listHolidayDecisions`, `setHolidayDecision`, `clearHolidayDecision`, `description`, `tags: ["Availability"]`, `security: [{ bearerAuth: [] }]`), as the siblings.
- **Not recorded as an availability change.** A decision does not bump `availabilityVersion`, writes no `availability_changes` row, so it does not appear in History and cannot conflict with a config save. The Undo the old UI offered is a `clear` call from the toast.
- **A date is not checked against the holiday calendar.** The calendar lives in the app (`holidays.ts`); the server stores any `serviceDate` a Manager names. The table can only grow by Manager writes.

### A3. api-client and React Query (app side, slice A for the client, slice B for the hooks)

- `packages/api-client/src/availability.ts`: three methods on the existing availability client, written like `listDays` and `reopenClosure` (`this.client.call(holidayDecisionEndpoints.list, { params: { id: venueId }, query })`; `set` and `clear` take `params: { id, serviceDate }`; `clear` returns nothing). The response is validated with the endpoint's schema (`client.ts:183`): `HolidayDecisionSchema` accepts only `open_as_usual`, so a future second value would need the client to ship first, which is the usual order.
- `apps/hospitality/src/hooks/useHolidayDecisions.ts`: `createQueryHook` (key `"holidayDecisions"`, `getEnabled` on a venue id, as `useAvailabilityDays`) and two `createMutationHook`s, both with `invalidateKeys: [HOLIDAY_DECISIONS_QUERY_KEY]`. They do **not** use `trackOwnSave` (that hook holds config reloads for the config's own version; a decision does not touch the config version) and do not invalidate the config or days keys, because nothing the engine resolves changed. Both `UpcomingHolidays` and the calendar nudge read the **same** query (`from = today`, `to = today + 365`), so React Query dedupes: opening Special dates after the Calendar costs no second request.
- **Old or rolled-back server.** A new app against a server that does not have the routes gets 404 (route unknown) or 405 from the `PUT`/`DELETE`, and the `GET` the same. The app treats any non-2xx from `set` or `clear` as `Couldn't save.` with Retry (PRD 10); it never shows the holiday as decided. A failed `GET` shows the panel's error state (B4), not "undecided" lines. Deploy order: DB migration, then the service, then the web app.

### A4. Consumers of `DateRule.kind`

None. `DateRuleSchema`, the `DateRuleKind` enum, `resolveDay`, closure-overlap, `slots.ts`, `validateConfig`, the config-plan, the row writer and reader, the closures route, booking availability and every `kind` switch in the app are unchanged; there is no new kind to learn. The one consumer that changes meaning is the app's holiday code:

| Consumer | Today | Now | Action |
|---|---|---|---|
| `holidays.ts` `isPlanned` (`:131-142`), `upcomingHolidays` (`:149-157`) | any other rule = planned | replaced by `holidayStates` (B1), which also reads the decisions list | **Handle**: delete both |
| `UpcomingHolidays.tsx`, `NextHolidayNudge.tsx`, `open-as-usual.ts` | localStorage marks (`open-as-usual.ts:2`) | read `useHolidayDecisions` | **Handle** (B) |
| everything else listed in the first draft's table (engine, server config path, Special dates list and filters, day drawer, calendar summary) | | not touched | Ignore |

Because nothing in the config changes, PRD 4 (guests unaffected) holds by construction. Slice A still records it as a test: the engine and snapshot code do not import the new table (a source-level guard is not needed; the table is only read by `holidayDecisionService`), and the booking-path tests are untouched.

## B. Holiday decisions in the app

### B1. Pure model: `components/availability/holiday-decisions.ts` (new)

`holidayStates(country, today, config, decisions)` returns every holiday from `today` (inclusive) to `today + 365 days`, in date order, each with its `HolidayState`. It replaces `upcomingHolidays` and the private `isPlanned` in `holidays.ts`, and widens the horizon from `HOLIDAY_HORIZON_DAYS = 120` to 365 (PRD 1: 12 months). Its two inputs are the two sources of truth: the **config's date rules** (a closure or special hours the Manager made) and the **decisions list** (`useHolidayDecisions`). Classifying a date `D`, skipping `tonight` and `skip` rules, and considering only rules that cover `D` (the same range, `repeat` and `seriesId` test `isPlanned` has now):

1. `closed`: a `closure` rule with `targetKind: "venue"`, no `window`, no `repeat`, no `seriesId`, `startsOn === endsOn === D`. → `ruleId`.
2. else `specialHours`: a `special_hours` rule with `targetKind: "venue"`, no `repeat`, no `seriesId`, `startsOn === endsOn === D`. → `ruleId`.
3. else `other`: any other rule covers `D` (a range or repeating rule, a service, booking or section closure, `use_schedule`, a one-date edit of a series, a Copy rule). The line says "Has special dates".
4. else `openAsUsual`: `decisions` has `D`.
5. else `undecided`.

**A covering rule wins over an open mark.** The mark is "no change to the hours"; it does not reopen a day another rule shuts, so the line never claims "Open as usual" on a day a repeating closure still closes, and a mark left behind under a later closure or special hours is simply outranked (B2 also removes it). `USUALLY_CLOSED`, `holidaysWithin`, `holidaysIn` and `holidayCountry` stay in `holidays.ts`.

The calendar nudge (`NextHolidayNudge`) becomes `holidayStates(...).find(h => h.state.kind === "undecided" && h.date <= today + 30)`; `other` and every decision count as decided for everyone, because they come from the venue's own data. While the decisions query is loading or has failed, the nudge renders nothing: it never nags about a holiday it cannot yet know is decided.

### B2. The three choices and what each saves

Every transition is a composition of four existing or new calls: `set`/`clear` (the decision endpoints), the closure path (`AddSpecialDatesSheet` → `POST …/closures`), the reopen command (`ReopenClosureDialog`), and the config `PUT` (`useSaveAvailabilityConfig`, removing a rule). Each is ordered so **a failure part-way leaves the holiday undecided, never wrongly decided**.

| To | From undecided | From `openAsUsual` | From `specialHours` (one-date rule this flow owns) | From `closed` (one-date closure this flow owns) |
|---|---|---|---|---|
| **Open as usual** | `set` | (no-op) | config `PUT` removing the rule, **then** `set` | `ReopenClosureDialog`, **then** `set` |
| **Closed** | sheet (B3) | sheet, **then** `clear` | sheet (a closure outranks it); then a config `PUT` removing the old special hours, best-effort | (no-op) |
| **Special hours…** | sheet with an `hours` row | sheet, **then** `clear` | (the Change opens the rule's own edit, unchanged) | `ReopenClosureDialog`, **then** the sheet |

- **To Open as usual** removes what was there first, then writes the mark. If the removal fails, nothing changed; if the removal succeeded and `set` fails, the day has usual hours and no decision: undecided, with `Couldn't save.` and Retry. (A removed special-hours rule leaves the day on its regular hours, which is the "open as usual" the Manager wanted; the stranded-bookings check on that `PUT` can refuse, in which case the line says so and nothing changed.)
- **To Closed or Special hours** writes the new rule first, then `clear`s the mark. If the sheet is cancelled at step two, the mark is untouched. If `clear` fails after the rule saved, the rule outranks the mark (B1), so the line is right; the failed `clear` is retried silently on the next Change, and is harmless until then.
- **The two commands for a closure are two requests, not one**, because they are different commands: closing runs through `POST …/closures` (step two for affected bookings, closure notices) and reopening through the reopen command (it can notify guests the closure had cancelled). The config `PUT` can neither add a closure over bookings (`stranded-bookings` 409, `availability-config.ts:290`) nor send those notices, so it is not used to bypass them.
- **PRD 5 ("changing it removes the old decision in the same save")** therefore holds as: one user action, ordered calls, no intermediate wrong state. It is not one HTTP request.

`ReopenClosureDialog` gains one optional prop `onReopened?: () => void`, called once after a successful reopen; `SpecialDatesTab` uses it to continue the chain. Existing callers pass nothing.

### B3. 'Closed' and 'Close these N' reuse the closure path

ux.md says "the existing closure path, including its step two, the Close dialog's flow opened prefilled". The Close dialog (`CloseDialog` → `CloseStepOne` → `CloseStepTwo`) is a one-rule form with a step-one screen the Manager would then have to confirm, which costs a tap. `AddSpecialDatesSheet` is the existing **multi-date** closure save, with the same impact preview (`usePreviewClosureImpacts`), the same `CloseStepTwo` and the same `useCreateClosures` request: one POST, one `Idempotency-Key`, one transaction for all rows, "so a booking is never cancelled for one date while another fails" (its own doc comment). It already takes `initialRows` of closed holidays (that is today's "Plan all"). Two additive props let it serve this flow:

- `autoNext?: boolean`: with valid initial rows, run `next()` once on mount. With nothing affected, `next()` already saves immediately (`found.some(groups) ? setStep(2) : save(found)`); otherwise the sheet shows its step two. The drawer stays closed until step two or a failure, so a Manager who has nothing to decide never sees a flash of the form.
- `savedTitle?: string`: replaces the count-based toast (`availabilitySpecial.add.saved`) with ux.md's "Closed on Thanksgiving, Thu, Nov 26" / "Closed on Thanksgiving, Christmas Day and New Year's Day", built with `Intl.ListFormat`.

This is a deviation from ux.md's wording only: the user sees the same step two and the same toast, minus step one. It keeps one closure implementation. `Close these N` calls it with the `undecided` holidays among `USUALLY_CLOSED` (two or more; with one left the header action is gone and that line's Closed is the action).

### B4. UI components

- `UpcomingHolidays.tsx` (rewritten): props gain `state`, `timezone`, `onStale`, and the callbacks `onClose(rows, title)`, `onSpecialHours(row)`, `onReopen(rule, then)` and `onOpenDay(date)`; `SpecialDatesTab` owns the sheet and the reopen dialog it already hosts (`adding`, `reopening` state) and passes these. Renders the header line + `Close these N`, month `h3` groups of at most the first 5 undecided plus "Show N more", and the folded `Decided (n)` group, in the structure of ux.md F1.
- **Loading and failure of the decisions list.** While `useHolidayDecisions` loads, the panel shows a skeleton of its own height; if it fails, an `Alert` with the error and a Retry (`refetch`), and **no lines**: a holiday is never drawn undecided because the list could not be read. (The closed, special-hours and `other` states come from the config, which the tab already has; only `openAsUsual` needs the list, but showing a half-known panel is the failure the old localStorage design had.)
- `HolidayLine.tsx` (new): one holiday: name, date, a `role="group"` of three buttons (`aria-pressed` on the current decision while changing), or the decision text and **Change**. Phone: two rows, 44 px targets (CSS module, `--rialto-*` tokens).
- `use-holiday-decision.ts` (new): per-date state `idle | saving | failed` and `decide(holiday, to)`, composing the calls in B2 through `useSetHolidayDecision`, `useClearHolidayDecision` and `useSaveAvailabilityConfig().mutateAsync` (a per-date failure, so not `useScheduleSave`, whose one failure list serves a whole form). Any non-2xx, including the 404 or 405 of an older server, sets `failed`: `Couldn't save.` + Retry in place, focus on Retry, the line not shown as decided. A config 409 `version-conflict` calls `onStale()`. Undo on the Open-as-usual toast calls `clear` (and for a removed special-hours rule, no Undo: that removal has its own History entry in the config's audit trail).
- Host: `isManager` is false, so each line shows the decision or "Not decided", with no buttons (ux.md). The `GET` is open to any member, so the Host's panel is real data. `UpcomingHolidays` is Manager-gated in `SpecialDatesTab` today (`:432`); a read-only mode for the Host is added, since the PRD makes the Host see decided holidays.
- `other` → Change calls `onOpenDay(date)`. `SpecialDatesTab` gets an optional `onOpenDay` prop; `AvailabilityPage` passes the callback it already gives History (`AvailabilityPage.tsx:798-806`: switch to the Calendar tab and open the day).

### B5. Deletions (clean cutover)

- Delete `open-as-usual.ts` (`readOpenAsUsual`, `writeOpenAsUsual`) and its readers' use of it (`UpcomingHolidays.tsx:7`, `NextHolidayNudge.tsx:8`). No migration of existing marks (PRD out of scope): they stop being read; the key `mbe-availability-open-as-usual:<venue>` is left in browsers.
- In `holidays.ts`: delete `isPlanned`, `upcomingHolidays` and `HOLIDAY_HORIZON_DAYS = 120`; the horizon constant lives in `holiday-decisions.ts`. Delete the catalog keys no longer used: `availabilitySpecial.holidays.planAll*`, `plan`, `planName`, `openAsUsualName`.
- `AvailabilityPage.regularWeek.test.tsx:188` seeds the localStorage key to hide the holiday nudge; it now seeds the decisions endpoint (or the hook) with `2026-11-26`.

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

Slice A (decision store: migration, schema, routes, types, api-client):
- `services/reservations/prisma/schema.prisma`, `…/migrations/<ts>_add_venue_holiday_decision/migration.sql`
- `services/reservations/src/routes/holiday-decisions.ts` (+test), `src/services/holiday-decision.ts` (+test), `src/services/domain-services.ts` (the seam), `src/app.ts` (one `register` line)
- `services/reservations/src/routes/rls-route-sweep.fixtures.ts` (three fixtures), the RLS isolation test coverage the sweep requires, `services/reservations/docs/reference.md` (the three routes)
- `packages/types/src/schemas/holiday-decisions.ts`, `src/endpoints/holiday-decisions.ts`, the package indexes, a schema test
- `packages/api-client/src/availability.ts` (+`availability-config.test.ts` or a sibling test)

Slice B (holidays):
- `holiday-decisions.ts` (+test), `holidays.ts` (delete `isPlanned`, `upcomingHolidays`), `holidays.test.ts`
- `hooks/useHolidayDecisions.ts` (+test)
- `UpcomingHolidays.tsx` (+test), `HolidayLine.tsx` (+module.css), `use-holiday-decision.ts` (+test), `NextHolidayNudge.tsx`
- `open-as-usual.ts` (delete)
- `SpecialDatesTab.tsx` (+`.module.css`, tests), `AddSpecialDatesSheet.tsx` (`autoNext`, `savedTitle`), `ReopenClosureDialog.tsx` (`onReopened`)
- `AvailabilityPage.tsx` (the `onOpenDay` line only; ≤ 3 lines on an 866-line file), `AvailabilityPage.regularWeek.test.tsx`
- catalogs `availabilitySpecial.holidays.*` ×3

Slice C (copy): `copy-week-draft.ts` (+test), `copy-day.ts` (+test), `CopyDayAction.tsx`, `ChangeRegularWeekDrawer.tsx`, `use-regular-week-edit.ts`, `AvailabilityDayDrawer.tsx` (one prop), `ScheduleFormParts.tsx` or the week form's day picker (`lockedDays`), catalogs `availabilitySchedules.copy.*` ×3, `AvailabilityDayDrawer.draft.test.tsx`, `ScheduleSaveUndo.test.tsx`, `use-reload-hold.test.tsx` where they click "Copy to N dates".

Slice D (e2e): `e2e/availability-holidays-copy.spec.ts`, `e2e/helpers/shared-config-mock.ts` (now also serves the three decision routes); deliberate updates to any spec that counts the Special dates first paint or opens the Copy dialog (`availability-dead-ends.spec.ts:164-216, 366`, `availability-draft.spec.ts:110, 234, 254`, `availability-setup-hierarchy.spec.ts:223`).

Not touched, by design: `packages/types/src/schemas/availability-config.ts`, `packages/availability/**`, every other file under `services/reservations/src/services` and `routes`.

Shared by B and C: the three catalogs only, each under its own namespace.

## E. Tests

**A: store (slice A).**
- `packages/types`: schema parse and reject cases (a bad date, a decision other than `open_as_usual`, `to < from`, a range over 400 days); the endpoint definitions satisfy `defineEndpoint`'s one-2xx rule.
- `services/reservations` route tests in the style of `availability-changes.test.ts`:
  - `set` then `list` returns the row;
  - `set` twice returns the same row and `createdAt`;
  - `clear` twice is 204 both times;
  - the range read is by date and excludes outside rows;
  - a Host can `list` (200) and gets 403 on `set` and `clear`;
  - a non-member gets 403 on all three, and an unknown venue 404;
  - bad date or body is 400, problem-details shaped.
- Integration with RLS: another venue's row is not visible or writable; `rls-route-sweep.integration.test.ts` passes with the three new fixtures; the venue-delete cascade removes the rows.
- The reader skips a row whose `decision` it does not parse, without failing the list.
- Migration applies on a database with existing data and leaves every existing table untouched; the table's RLS, policy and grant exist.
- **PRD 4 trivially:** no existing availability file changed, and the availability suites run unchanged.

**B (slice B), component.**
- `holiday-decisions.test.ts`: every precedence row in § B1 (closed over a mark; `other` over a mark; special hours over a mark; ranges, repeating, section and service closures are `other`; a one-date edit of a series; `skip` and `tonight` ignored), the 365-day horizon and the year boundary.
- `UpcomingHolidays.test.tsx`:
  - three choices per line; the header action's visibility rules (two or more undecided of `USUALLY_CLOSED`);
  - the Decided group and Change;
  - every transition in B2's table makes its calls in that order, and a failure at each step leaves the line undecided with Retry;
  - a 404 and a 405 from `set` read as `Couldn't save.`;
  - the loading skeleton and the failed-list state show no lines;
  - Host read-only.
- `NextHolidayNudge` counts a decision and `other` as decided and renders nothing while the list loads or fails.

**C (slice C), component.** `copy-week-draft.test.ts`: `sameHoursAs` (services, times, last seating, order, different seating only), `thisWeekTargets` (week boundaries, past days, the source weekday, Sunday), `copyWeekDraft` (the chosen weekdays take the day's services; a missing service loses the weekday; a new service is added; the result round-trips through `draftToConfig` to the same week). `CopyDayAction.test.tsx`: this-week saves one rule per date with no `repeat` and no `endsOn` beyond the date; every-week opens the drawer with the prefilled draft and Starting; all-same disables the primary with the reason; the toast names dates, never a count; no From/Until.

**E2E (slice D).** On the e2e fixtures with today pinned to Sun, Nov 8, 2026 (`helpers/scenario-fixtures.ts`), annotated with interaction counts through `countInteractions`: H1, H2, H3, K1, K2 as PRD 9's table.
- **Mocks.** The config routes are mocked per page today (`mockApi`). `helpers/shared-config-mock.ts` serves `GET`/`PUT …/availability/config` and the three `…/holiday-decisions` routes for several pages from one in-memory object (Playwright route handlers run in the test process).
- **H2's two contexts.** Two `browser.newContext({ storageState })` pages (the `realtime-collaboration.spec.ts:94-107` pattern) share that store. Page A decides Christmas Eve (assert the `PUT …/holiday-decisions/2026-12-24` body `{decision:"open_as_usual"}`; count ≤ 3); page B loads Special dates and sees Christmas Eve under Decided with 0 decisions made, and the calendar nudge does not name it.
- **K1.** Copy Tuesday to Wed and Thu every week: the drawer opens prefilled; Save; assert the PUT has `scheduleServices`/`assignments` and **no** `dateRules` upsert. Copy onto matching days: no PUT at all.
- **H-failure.** The mock answers the decision `PUT` 404 once (an older server): the line says `Couldn't save.` with Retry and is not decided.
- **H1.** `Close these 3`: one `POST …/closures` with three items; no decision call.
- The existing a11y, fold-budget and locale specs run unchanged except where the Special dates first paint changes the count: updated deliberately, listed in the breakdown notes.

## F. Risks

- **A new fact needs its own plumbing.** Three routes, a service, a table, RLS and grants, an api-client method set and three query hooks, instead of one enum value. That is the price of keeping availability config pure; the first design's outages (old tabs, rollback) are gone: an old tab never calls the routes and never parses the new type, and a rolled-back server just has an unused table.
- **RLS and grants are easy to forget.** A table without `FORCE ROW LEVEL SECURITY`, the policy and the grant either leaks across venues or fails every write for `app_reservations`. Slice A's integration tests and the route sweep are the guard; the migration is reviewed against `20261025000000_add_venue_availability` `:287-359`.
- **New app, old server (deploy window).** `GET` 404 shows the panel's error state with Retry; `set`/`clear` 404 or 405 read `Couldn't save.`. Nothing is shown as decided. Order: DB, service, web.
- **Decisions are not live.** There is no push for them (the config has its own reload hold and SSE-style refresh; this store has none). A second Manager sees a decision on the next load or refetch (React Query's focus refetch and Special dates' mount), not instantly. PRD 3 asks only that they see it as decided, which this meets; a live push is seeded.
- **A decision and the config are not one transaction.** Two requests in B2's chains can leave the day in a state between them; every such state is undecided or outranked (B1), never wrongly decided; a failed trailing `clear` is silent and retried.
- **Duplicates cannot happen** (DB unique index); two Managers setting the same date both get 200 and the same row.
- **Closure round trips** are two requests (B2); the reopen dialog's confirmation is a real cost to a Manager changing a closed holiday that cancelled bookings, and the honest one.
- **Scope conflicts in "Just this week".** The new dialog has no keep/replace choice. `dateRule()` writes a one-date rule per target; a target that already has its own one-off hours is either equal (dropped by the comparison) or replaced by the new rule, which is what the Manager asked for by copying onto it. Slice C verifies `dateRule`'s behavior on a date that already has a one-date `special_hours` rule and keeps the saved result free of overlapping rules (the server's `resolveScopeConflicts`, `mode: "keep"`, would otherwise add a `skip`). If `dateRule` does not replace, `buildDraftChanges`'s `leaveOut` is the existing parameter for it; decide there, not here.
- **Equal hours except seating or booking types** are treated as different (C3): Copy then writes a rule that changes only those. Intended; PRD 8 names services, times and last seating.
- **File sizes.** `SpecialDatesTab.tsx` is 644 lines: it gains pass-through props and the reopen chain (≤ 40 lines); new logic is in new files. `AvailabilityPage.tsx` is 866 on the base, already over 800; this run adds ≤ 3 lines and does not split it (seeded). `UpcomingHolidays.tsx` (119 lines) grows but is split into `HolidayLine.tsx` and `use-holiday-decision.ts`.
- **First-paint count.** Special dates now renders three buttons per holiday line, a "Decided" group and one more request: `availability-setup-hierarchy.spec.ts` and the fold-budget spec pin counts; update them deliberately.
- **Old localStorage marks** are ignored (PRD out of scope); those holidays reappear once, undecided.
- **`createdByUserId`** is stored for a later "who decided" line; nothing reads it now.
