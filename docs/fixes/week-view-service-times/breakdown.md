---
stage: decompose
run: maintenance:week-view-service-times
date: 2026-10-26
assumptions:
  - "Work items carry WO ids from this item's reserved block (WO-0072–WO-0076); WO-0076 unused. No tracker issues are filed (no GitHub credential here); items therefore carry no (tracker: #N) refs. Intake #7749 closes at Ship per protocol, by whoever drives the implementing stages."
---

# Breakdown: per-service names and times in the Week view

Progress lives in the checkboxes. Names follow `architecture.md`.
Minutes are venue-local minutes from midnight throughout.

## Milestone 1: API carries the data

- [x] **WO-0072 — Extract `DaySummaryServiceSchema` and add `services` to the day summary** — in `packages/types/src/schemas/availability-config-api.ts`, extract the focusDay per-service object (`venueServiceId`, `name`, `opensAt`, `lastSeatingAt`, `closesAt`) as `DaySummaryServiceSchema`, add `services: z.array(DaySummaryServiceSchema)` to `AvailabilityDaySummarySchema`, and re-point `PreviewResultSchema.focusDay` at the shared schema.
  - Accept: a RED-first schema test pins the new field and the focusDay reuse; `pnpm --dir packages/types test` and `typecheck` green; llms regen clean (build `@mbe/cli` first).
  - Blocked by: —
- [x] **WO-0073 — Populate `services` in `summarizeDay`** — in `services/reservations/src/services/availability-config-checks.ts`, map `day.services` plus config service names into the new field, sharing the preview focusDay's name-lookup mapper. A closed day returns `[]`.
  - Accept: RED-first resolver tests cover a two-service day (ordered by `opensAt`), a closed day, and a special-hours day; route test asserts `GET .../availability/days` validates against the extended schema; service `test` + `typecheck` green.
  - Blocked by: WO-0072

## Milestone 2: Week view renders it

- [ ] **WO-0074 — Render per-service lines in the week cell** — extend `presentDay` (`apps/hospitality/src/components/availability/day-summary.ts`) to emit service lines (`{name} {opensAt}–{closesAt}`) when `detailed` is true, format times through `useVenueFormat`, add catalog keys (en-US + es-MX + fr-CA; en-GB only if wording differs), and render them in `AvailabilityCalendar`'s week cells following the closure-band layout. Accessible details speak the services in order.
  - Accept: RED-first tests on `presentDay` (service lines in week mode, count-only in month mode, loading day unchanged) and on `AvailabilityCalendar` week view; `pnpm check:i18n-catalogs` green; month view and phone agenda assertions unchanged.
  - Blocked by: WO-0073
- [ ] **WO-0075 — Run the repo gates over the whole change** — `bash scripts/conductor-gate.sh` (install + affected lint/typecheck/test), llms/dep-graph regen check, and the `/local-ci-precheck` steps before any push.
  - Accept: all gates green on the final head; outcomes recorded in the PR body per the pipeline-stage-hooks mandate.
  - Blocked by: WO-0072, WO-0073, WO-0074

## Notes

- Reserved block: ADR-031 unused (no ADR-worthy decision; see
  `architecture.md` assumptions). WO-0076 unused.
- Stop-after gate: this run stops here per `autorun-brief.md`
  (`stop-after: decompose`); Implement onward belongs to the next
  dispatch after the blueprint gate.
