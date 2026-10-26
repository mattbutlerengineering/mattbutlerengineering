---
id: ADR-029
title: A Reservation's Date Is Its Service Day
status: active
date: 2026-10-25
---

# ADR-029: A Reservation's Date Is Its Service Day

Carries forward the decision drafted as ADR-027 on the unmerged `feature/venue-hours-services` branch. That number was taken on main, so this ADR renumbers it. Accepted without a separate Owner question (it came with the architecture review). If Phase 1 implementation disproves it, supersede it with a new ADR.

## Context

Venue availability (`docs/features/venue-availability/`) lets a service run past midnight (Friday 10:00 PM–1:00 AM). A seating can then start on a later calendar date than the day its service opened. Reservations and holds carry both `date` (a date-only column) and `startTime` (an instant). Once seatings can cross midnight, the two stop agreeing: a 00:30 Saturday seating from Friday's late service has a Saturday `startTime`. Rows are written with whichever meaning we choose, so the choice is hard to reverse.

## Decision

A reservation's (and a hold's) `date` is its **service day**: the venue-local calendar date on which the service it was booked into opened. It is not the calendar date of `startTime`. The 00:30 Saturday seating above is stored with `date` = Friday.

- `startTime` and `endTime` stay the exact instants.
- Conflict checks stay exact to the instant.
- The availability engine (`@mbe/availability`, ADR-030) is the only code that assigns a seating to a service day.

## Consequences

- No schema change. The widget's existing payload already has this meaning.
- A slot belongs to exactly one service day and is never offered on two.
- Conflict and pacing queries read service days D−1 through D+1, because a neighbouring service day's seating can overlap this day's instants.
- It is surprising: for after-midnight seatings, `date` differs from the date part of `startTime`. Code that derives a day from an instant must use the venue timezone, and must not use that to decide a service day.
- The staff timeline and briefing bucket by `date`, so Friday's 00:30 seating appears on Friday's timeline, past its midnight edge.

## Alternatives Considered

- **Store the calendar date of `startTime` and derive the service day when needed.** Every consumer that groups by service would have to re-derive the service day from the hours in force _when it was booked_. Hours can change after booking, so that derivation is not stable.
- **Add a separate `serviceDate` column.** It keeps both meanings explicit, but costs a migration and a backfill across reservations and holds for a distinction the existing column can already carry.
