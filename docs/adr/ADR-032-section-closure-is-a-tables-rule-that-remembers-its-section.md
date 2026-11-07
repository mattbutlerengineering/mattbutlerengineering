---
id: ADR-032
title: A Section Closure Is a Tables Rule That Remembers Its Section
status: active
provisional: true
amends: ADR-030
date: 2026-11-07
---

# ADR-032: A Section Closure Is a Tables Rule That Remembers Its Section

> **Amends [ADR-030](ADR-030-availability-layered-rows-pure-engine.md)**: adds one nullable column to `DateRule` and one expansion step before the engine runs. ADR-030's Decision section is unchanged; this ADR states what is added. **Status: provisional** (the frontmatter says `status: active` with `provisional: true` because the repo's ADR structural check accepts only `active`, `superseded` and `deprecated`; `tools/cli/src/commands/adr-structural.ts` `VALID_STATUSES`). Written by the Architect stage of `docs/features/availability-setup-hierarchy/` without a live Owner answer (the Owner said "Architect decides" in the run brief). Confirm or supersede it.

## Context

A Manager must be able to close one named floor-plan section (the Bar) for a date, see "Bar closed" on the calendar, and have the guest-facing result be that the section's tables are unbookable that day. Today a `DateRule` can target `venue`, `service`, `booking` or `tables` (`DateRuleTable` join rows); only Tonight creates `tables` rules, and the schema comment says `sectionId (P3) is deliberately absent`. The engine blocks a table when a `tables` closure band lists its id (`packages/availability/src/slots.ts` `blockedTables`).

A section's membership changes after a closure is saved: a table is moved into or out of the Bar (`PUT /floor-plan-sections/:id/tables`, `Table.sectionId`), a section is deleted. A closure that must stay true for weeks needs to follow that.

## Decision

1. **`DateRule` gains a nullable `sectionId`** (FK to `floor_plan_sections`, `ON DELETE SET NULL`, indexed). `targetKind` stays `tables`. A closure with `sectionId` set means "this section's tables"; its `DateRuleTable` rows are not written.
2. **Membership is expanded once, before the engine, by one pure function.** `expandSectionRules(rules, membership)` in `@mbe/availability` returns the rules with `tableIds` set to the section's current table ids for every rule that has a `sectionId`. The engine is unchanged and never sees a section: it still reads `targetKind: "tables"` and `tableIds`. The server calls it where it builds the engine's config from rows (`availability-snapshot.ts` `dateRuleCandidate`); the client calls it for draft previews from its table list.
3. **The section id travels as a passthrough field.** `ResolvedClosure` and the day summary's closure rows carry an optional `sectionId` so a surface can name the section; nothing in the engine reads it.
4. **Deleting a section keeps live closures true.** Before `floorPlanSectionService.delete` removes a section, in the same transaction, every live rule (`deletedAt` null, not ended) that names it gets `DateRuleTable` rows for the section's current tables and a null `sectionId`. It degrades to a plain `tables` closure ("Tables blocked") and does not silently reopen.

## Consequences

- **Additive migration.** One nullable column, one index, one FK; no default needed, nothing dropped, no backfill (no existing rule has a section). The legacy migration and the backfill emit rules with `sectionId` null, which is the correct shape. The schema door is two-way; the data door is one-way once a Manager saves a section closure: a release without the column reads that row as a `tables` rule with no `DateRuleTable` rows, which blocks nothing.
- **Membership is live.** A table moved into the Bar after the closure is saved becomes unbookable for that date; one moved out becomes bookable. Reservations already assigned are not moved (as with any closure; the closure plan counts affected bookings only when the closure is written).
- **The engine and its property test are untouched.** The new behaviour is covered at the expansion function and at the repository seam.
- **Cross-venue integrity is the service's job.** The FK cannot say the section is in the same venue; the config plan's reference check rejects a `sectionId` that is not one of the venue's sections, as it does for `tableIds`.
- **Not solved here:** section-level service hours, seating limits and per-section pacing (Phase 3) still need a real section target in the engine. This column is the label and the live membership, not a Phase 3 model.

## Alternatives Considered

- **UI-only: expand the section to `tableIds` when the Manager saves.** No migration, but the closure silently diverges from the floor plan the first time a table moves, which is a wrong guest-facing outcome on the exact thing the Manager believes is closed. Naming the section on the calendar would mean guessing from a set of table ids.
- **A fifth engine target `section`.** Honest in the type, but `slots.ts`, `resolve-day.ts`, `closure-overlap.ts`, `validate-config.ts`, the day summary, the closure band copy and the property test's generators all change, and the engine needs table-to-section membership as an input. That is Phase 3's model for a one-date closure.
- **`ON DELETE CASCADE` or `RESTRICT` on the FK.** Cascade hard-deletes a rule that History's inverse refers to; restrict makes deleting a section or archiving a plan fail on past closures too. `SET NULL` plus the delete-time materialisation keeps both.
