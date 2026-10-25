---
id: ADR-030
title: Venue Availability as Layered Rows with Typed Payloads, Resolved by One Pure Engine
status: active
date: 2026-10-25
---

# ADR-030: Venue Availability as Layered Rows with Typed Payloads, Resolved by One Pure Engine

## Context

Venue availability (`docs/features/venue-availability/`, five phases) grows from one open/close window per weekday into a stack of layers:

- schedules (templates) and their services;
- weekday assignments with date ranges;
- special hours, closures (whole venue, one service, or one booking type; one date, a range, repeating, or open-ended), skips, and Tonight changes that expire;
- later: holidays, areas and holdback, pacing and turn times, policies, events and private spaces.

The PRD requires that new rule types not force another schema rewrite. Two earlier shapes are the cautionary examples:

- today's untyped `operatingHours`/`settings` JSON, which is read by casting;
- the prior-art branch's single versioned JSON document, with at most 100 overrides edited under one per-venue lock.

That document could not hold stable service ids, ranges, recurrence, booking-type closures, authorship or expiry.

Today, availability rules are also enforced in only one of seven booking paths. Slot listing reads hours. Hold create, confirm, staff create and update, guest modify, and the agent's tools do not.

## Decision

1. **Layers are rows.** `Schedule`, `VenueService`, `ScheduleService`, `ScheduleAssignment` and `DateRule` (plus `DateRuleTable`, and later `ServiceArea`, `Policy` and `Event`) are venue-scoped tables under ADR-026 RLS. Each has a stable id, an author and a lifespan.
2. **References are foreign-key columns, and value bundles are versioned jsonb.** A field that points at another row (a service, section, table, schedule, policy or event) is a column or a join row. A field that is only a bundle of values (seating times, turn times, pacing, a time window, the Tonight payload) is jsonb with a `version` and a zod schema in `@mbe/types`. Every jsonb field is parsed on read, never cast. An unknown version resolves as closed, with a warning.
3. **One pure engine, `@mbe/availability`, resolves the stack.** It takes an in-memory snapshot and returns the resolved service day, the slots, a bookability verdict (ok, soft limit, or hard), and the explanation of each layer. Every booking path, the live preview, the calendar and closure rebooking offers all call it. It has no database, framework or clock dependency.
4. **Each venue has a single version counter.** `Venue.availabilityVersion` is compared and set on every configuration write. A stale write gets a 409 that names the change that won. Every change writes an `AvailabilityChange` audit row with its inverse, for history and undo.

## Consequences

- A new value rule in Phases 3–5 (for example a pacing variant) is a new payload version and an engine resolver, not a migration. A new kind of reference (areas, policies, events) is a migration, which is deliberate: those deserve foreign keys.
- The preview cannot disagree with enforcement, because both run the same function.
- Correctness is testable with property tests over generated configurations, with no database.
- Slot computation moves out of `services/reservations/src/services/availability.ts` and `slot-rules.ts` into the package. The reservations service keeps the snapshot loader and the adapters.
- Group-level shared calendars and inheritance (out of scope) will need a group-scoped table or copy-on-apply later. Venue-scoped RLS tables do not express inheritance by themselves.

## Alternatives Considered

- **One versioned JSON document per venue** (the prior art). The simplest to start with, but it can't express ranges, recurrence, booking-type closures, stable ids or expiry without a rewrite. It also serialises every edit through one lock.
- **A column for every rule.** The strongest database typing, but every Phase 3–5 rule becomes a migration, and the tables multiply.
- **Keep the rules in the service, loading data per date.** That leaves seven call sites to keep in agreement, and it cannot meet the preview's p95 ≤1s over 30 days.
