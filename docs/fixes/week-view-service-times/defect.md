---
stage: capture
run: maintenance:week-view-service-times
date: 2026-10-26
re-entry: architect
intake: "#7749"
assumptions:
  - "The open-PR pre-flight and in-flight-work check could not run (no GitHub credential in this Conductor worktree). Recorded as could-not-run, not clean. Local sweep: no existing docs/fixes/* or docs/features/* run covers #7749."
---

# Condition: the Week view cannot name services or show their hours

<!-- Condition brief (capability gap split from #7727). Filename stays defect.md. -->

## Condition

**Degraded:** the Availability calendar's Week view renders at most
"1 service" / "2 services" per day. The ux.md Week-view spec (#7727 S2)
calls for `Fri Oct 30  Lunch 11:30–2:30 · Dinner 5–10` — service names
with open and close times.

**Target state that ends the run:** `GET .../availability/days` carries
per-service `{ name, opensAt, closesAt }`, and `AvailabilityCalendar`
renders service names and localized times when `view === "week"`.

## Evidence (measured in this worktree at `6af871b9e`, 2026-10-26)

- `AvailabilityDaySummarySchema`
  (`packages/types/src/schemas/availability-config-api.ts:216`) carries
  `serviceDate`, `label`, `scheduleId`, `serviceCount`, `closures`,
  `bookingOpen` — no service names or times.
- The resolver already has the data and throws it away: `summarizeDay`
  (`services/reservations/src/services/availability-config-checks.ts:92`)
  maps `day.services.length` to `serviceCount` and drops the rest.
  Resolved services carry `venueServiceId`, `opensAt`, `lastSeatingAt`,
  `closesAt` (per `packages/availability` engine fixtures), and config
  carries each service's name. Precedent: `PreviewResultSchema.focusDay`
  (`availability-config-api.ts:367`) already extends the same summary
  with `{ venueServiceId, name, opensAt, lastSeatingAt, ... }` for one
  day.
- The client presentation seam exists: `presentDay`
  (`apps/hospitality/src/components/availability/day-summary.ts:18`)
  takes a `detailed` flag that `AvailabilityCalendar.tsx:242` sets to
  `view === "week"`; today it can only print a count
  (`availability.calendar.services`).
- Closure bands already render (#7742), so the cell layout has a bands
  precedent to follow.

## Root-cause hypothesis

Not a defect in flow — a deliberate thin summary. The days endpoint was
designed as a calendar-cell summary (label + count + closures) before
the Week view's richer line was specced in #7727; the per-service detail
was only ever exposed for a single focus day via the preview result.

## Blast radius

- **Who:** Availability page users (Managers) in `apps/hospitality`,
  Week view only; month view and phone agenda keep current behaviour.
- **API:** additive field on one response schema; consumers that ignore
  it are unaffected. Response grows by a few small objects per day
  (ranges are capped at the existing from/to query bounds).
- **Scale:** small — one schema, one resolver function, one component
  family plus i18n catalogs.

## Ruled out

- **Client-side derivation from the full config:** the issue itself
  rules it out — the page loads range summaries, not per-day resolution,
  and resolving every visible day client-side duplicates the engine.
- **Reusing `PreviewResultSchema.focusDay` for the range:** the preview
  endpoint computes drafts for one focus day; calling it per day of a
  week is N requests and draft semantics the calendar does not want.

## Re-entry depth

**`re-entry: architect`** — confirmed against the code, not just the
dispatch. Real design choices remain: which per-service fields the
summary exposes (`lastSeatingAt` in or out; alignment with the focusDay
shape), whether the preview's `focusDay.services` shape and the new
summary field unify into one schema, and how the week cell lays out
names and times within rialto and a11y rules. Work items are therefore
drafted in `breakdown.md`, not here.
