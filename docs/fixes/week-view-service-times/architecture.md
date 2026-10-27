---
stage: architect
run: maintenance:week-view-service-times
date: 2026-10-26
assumptions:
  - "Field shape follows the issue text and the existing focusDay precedent: expose `lastSeatingAt` too, so the summary services shape and `PreviewResultSchema.focusDay.services` stay one shape. Additive, so droppable at Implement if payload size argues otherwise."
  - "No ADR: an additive field on one response schema is reversible and unsurprising (fails the ADR test's first two legs). ADR-031 stays reserved and unused."
---

# Architecture: per-service names and times in the days summary

Maintenance scale — a note, not a book. Builds on #7742 (closure bands)
and ADR-030 (layered rows, pure engine).

## Decision

Add an optional `services` array to `AvailabilityDaySummarySchema`
(`packages/types/src/schemas/availability-config-api.ts`):

```ts
services: z.array(
  z.object({
    venueServiceId: z.string(),
    name: z.string(),
    opensAt: z.number().int(),
    lastSeatingAt: z.number().int(),
    closesAt: z.number().int(),
  })
),
```

This is exactly the shape `PreviewResultSchema.focusDay` already extends
the summary with; extract it as `DaySummaryServiceSchema` and reuse it in
both places so the two cannot drift. Minutes stay venue-local minutes
from midnight, as everywhere else in the engine (ADR-029/030).

`summarizeDay` (`services/reservations/src/services/availability-config-checks.ts:92`)
populates it from `day.services` plus the config's service names — the
same name lookup the preview's focusDay mapper already does; share that
mapper rather than duplicating it.

Client: `presentDay` (`apps/hospitality/src/components/availability/day-summary.ts`)
gains the per-service lines when `detailed` is true (week view), each
`{name} {opensAt}–{closesAt}` with times through
`useVenueFormat`-backed formatting and i18n catalog keys (en-US source,
es-MX + fr-CA parity, en-GB only where wording differs). The count line
stays for month view; accessible details speak the services in order.
Cell layout follows the closure-band precedent in `AvailabilityCalendar`.

## Alternatives rejected

- **Client-side resolution from full config** — duplicates the engine
  per visible day; ruled out in `defect.md`.
- **Per-day preview calls** — N requests, draft semantics.
- **Names-only (no times)** — fails the ux.md line this run exists for.

## Constraints for Implement

- TDD: schema test, resolver test, and component test each written RED
  first.
- `@mbe/types` is a published-shape package: rebuild consumers
  (`pnpm build --filter @mbe/types...`) before dependent tests; llms
  regen needs `@mbe/cli` built first.
- Week view only: `detailed` already gates on `view === "week"`; month
  and agenda snapshots must not change (visual baselines are
  Linux-runner-specific — never commit macOS screenshots).
- Localization: `mbe-local/no-literal-ui-strings` is an error; new keys
  need es-MX and fr-CA values in the same PR
  (`pnpm check:i18n-catalogs`).
- Gate: `bash scripts/conductor-gate.sh` green before each stage ends.
