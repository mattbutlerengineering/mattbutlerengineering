---
id: ADR-031
title: A Service Row Carries Its Own Days and Per-Weekday Hour Sets
status: active
provisional: true
amends: ADR-030
date: 2026-11-03
---

# ADR-031: A Service Row Carries Its Own Days and Per-Weekday Hour Sets

> **Amends [ADR-030](ADR-030-availability-layered-rows-pure-engine.md)**: adds a second versioned value bundle to `ScheduleService` and changes what a schedule's rows mean per weekday. ADR-030's Decision section is unchanged; this ADR states what is added. **Status: provisional** (the frontmatter says `status: active` with `provisional: true` because the repo's ADR structural check accepts only `active`, `superseded` and `deprecated`). Written by the Architect stage of `docs/features/availability-config-usability/` without a live Owner answer (the Owner said "Architect decides" and authorized the #7738 change in the run brief). Confirm or supersede it.

## Context

ADR-030 stores a schedule's services as `ScheduleService` rows with one set of hours, and `ScheduleAssignment` maps weekdays to a whole schedule. A venue whose weekdays differ (lunch Mon–Fri, brunch Sat–Sun, a later close Fri–Sat) therefore needs one schedule per distinct set of hours, each assigned its days. The legacy migration already produces those ("Thu–Fri hours", #7739), and quick setup cannot express them (#7738). The Manager sees schedules and assignments to fix a week they thought they had set.

Venue availability shipped on 2026-10-26, no real venue uses it, and the production Backfill has not run, so changing the model now costs the least. After the first venue saves a varied week it is hard to undo: rows that mean something different to the previous release.

## Decision

1. **A service row says which weekdays it runs on and may have other hours on some of them.** `ScheduleService` gains `weekdays` (an integer array, empty by default) and `dayHours` (a versioned jsonb bundle `{ version: 1, sets: [{ weekdays, opensAt, lastSeatingAt, closesAt, seating, bookingTypes }] }`, empty by default). This follows ADR-030 decision 2: a value bundle is jsonb with a version and a Zod schema in `@mbe/types`, parsed on read, and an unknown version drops the row, which resolves as closed with a warning.
2. **The meaning is one pure function.** `hoursOn(row, weekday)` in `@mbe/availability` returns the hour set that claims the weekday, else the base hours when `weekdays` is empty or includes it, else nothing. `resolveDay`, `validateConfig`, `legacy-projection` and every reader ask it. A row with both fields empty means what it means today.
3. **A regular week is one schedule with one row per service.** Its assignment covers the union of the days any service runs. The legacy migration emits that shape, not a schedule per signature, and a one-off script folds already-backfilled day-named schedules into it. A schedule is part of the regular week when its `kind` is `regular`.
4. **`@@unique([scheduleId, venueServiceId])` stays.** A service is still one row per schedule.

## Consequences

- **Additive migration.** One migration adds two columns with constant defaults; nothing is dropped, so the schema door is two-way. The data door is one-way once a venue saves a varied week: the previous release would read that row's base hours on every day its assignment covers.
- **Validation moves per weekday.** Overlap is checked among the rows that run on the same weekday; a weekday claimed twice in one row is a new issue code. Legacy rows run every day, so they are rejected exactly as before.
- **One shared encoder.** The editor, the migration and the collapse script all use `encodeWeek` and `decodeWeek`, so the pre-fill rule (the hours most of a service's days share are its base) has one owner.
- **Readers of `scheduleServices` that skipped the engine must change.** The agent chat's special-hours seeding is one: without the change it would copy the wrong hours onto a varied day.
- **Old History inverses** (and stored rows) parse the two fields as absent, which is what those rows meant. The PUT config body and the preview draft require both fields on every schedule-service row: a client that omits them (one built before day scope) is refused with a 400 validation problem, because the venue's `expectedVersion` compare-and-set cannot stop a client that loaded after a varied week was saved.
- **A future per-weekday rule** (pacing per day, say) is a new field inside a set or a new payload version, not another migration.
- **Not solved here:** hour sets carry no dates, so a change that takes effect from a date is still a new regular-week version (a new schedule) and the old one is end-dated. Dated rows would remove that and were not worth their cost.

## Alternatives Considered

- **Stay on today's model and generate day-named schedules and assignments behind the editor.** No migration, but the demo week needs five schedules, each edit regroups and re-ids them, "one regular week" becomes a membership every reader derives, and a one-weekday change creates or deletes schedules.
- **One `ScheduleService` row per weekday scope.** Normalized, but it drops the unique index on `(scheduleId, venueServiceId)`, which a revert cannot restore once two rows exist, and every reader that assumes one row per service and schedule breaks.
- **A seven-entry per-weekday payload.** It duplicates the base columns or makes them dead, makes a uniform week store seven copies, and leaves two places that say what Friday is.
- **Row-level effective dates.** It would let "Starting" edit rows in place, but overlap checks would have to reason about date ranges and weekdays together and every schedule editor would need dated rows.
