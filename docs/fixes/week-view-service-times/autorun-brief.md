# Autorun brief — week-view-service-times

Collected once, 2026-10-26, from the Conductor's dispatch for issue #7749.
This file is the only source of interview answers for every stage of this
run. It is **not** a run artifact: it never counts toward orientation or
active-run discovery.

stop-after: decompose

## Run identity

- **Scale:** maintenance run.
- **Slug:** `week-view-service-times`.
- **Run directory:** `docs/fixes/week-view-service-times/`.
- **Run ref:** `maintenance:week-view-service-times`.
- **Brief variant:** condition brief — a UI capability gap split out of
  #7727 (S2, ux.md Week view), not a regression.
- **Origin / tracker intake:** GitHub issue #7749, quoted verbatim below.
  Record `intake: #7749` in `defect.md` frontmatter.

## Issue #7749, verbatim

> Split from #7727 (S2, ux.md Week view: `Fri Oct 30  Lunch 11:30–2:30 ·
Dinner 5–10`).
>
> The Availability days summary (`AvailabilityDaySummary`,
> `GET .../availability/days`) carries only `serviceCount`, `label`,
> `closures` (from/to minutes) and `bookingOpen`. It has no service names
> or open/last-seating/close times, so the Week view can only say "1
> service". The client cannot derive them from data the page already
> loads for a range without resolving every day from the full config.
>
> Needs: extend the days summary with per-service `{ name, opensAt,
closesAt }` (schema in
> `packages/types/src/schemas/availability-config-api.ts`, resolver in
> the reservations service), then render bars/times in
> `AvailabilityCalendar` when `view === "week"`. Closures already render
> as bands (#7742).

## What and why

The Availability calendar's Week view can only say "1 service" per day.
Managers scanning a week need the ux.md Week-view line — service names
and hours (`Lunch 11:30–2:30 · Dinner 5–10`). The data exists server-side
(`ResolvedDay.services` carries `opensAt`, `lastSeatingAt`, `closesAt`;
config carries names) but the days-summary API drops it.

## Scope

**In scope**

- Extend `AvailabilityDaySummarySchema` with per-service
  `{ venueServiceId, name, opensAt, closesAt }`.
- Populate it in the reservations-service resolver (`summarizeDay` in
  `services/reservations/src/services/availability-config-checks.ts`).
- Render service bars/times in `AvailabilityCalendar` when
  `view === "week"`, with localized times via `useVenueFormat` and new
  catalog keys in all required locales.

**Out of scope**

- Closure bands (already shipped, #7742).
- Month view and phone agenda changes beyond what the shared
  presentation helper forces.
- Any slots/preview computation change.

## Success criteria

1. `GET .../availability/days` returns per-service name and times for
   each open day, schema-validated.
2. Week view renders each day's services with localized times; month
   view behaviour unchanged.
3. TDD per repo mandate; `pnpm lint`, `pnpm typecheck`, `pnpm test`
   green (gate: `bash scripts/conductor-gate.sh`).

## Constraints and already-decided

- **Re-entry:** capture confirms against the code; the dispatch expects
  `re-entry: architect` (the run must produce `breakdown.md` and stop at
  the blueprint gate).
- **Reserved ids:** ADR-031, WO-0072–WO-0076. No other new PRD/ADR/WO
  ids may be minted; if the block runs out, stop and say so.
- **Tracker:** intake only (#7749). No new issues are filed — this
  environment carries no GitHub credential; breakdown items carry WO ids,
  not `(tracker: #N)` refs.
- **Release authorization: none needed.** The run stops after Decompose;
  nothing ships from this invocation.
- **Environment:** work only in this Conductor worktree on branch
  `conductor/b20261027-7749`; never push; no `gh`. Keep `pr-body.md` at
  the worktree root current and uncommitted.
- Never edit `.claude-plugin/plugin.json`'s version, `.github/factory.json`
  or `docs/factory/`.

## Operate

operate: skip — the run stops at Decompose; the implementing run owns
any retro.

## Standing instructions for every stage agent

- Answer interview questions from this brief. Where the brief is silent
  and the stage skill offers a named default, take the default and log it
  under `assumptions:`. Where there is no skill-supplied default — and
  for every evidentiary question — stop and surface. Never guess.
- Never fabricate verification evidence.
- The artifacts are the only state between stages.

## Pre-flight record (2026-10-26)

The protocol's open-pull-requests pre-flight and in-flight-work check
**could not run**: this session has no GitHub credential and no `gh`
permission. Not a clean result — the Conductor holds the PR list and
dispatched this item knowingly. Local run-directory sweep found no
existing run for #7749 (32 `docs/fixes/*` dirs checked, none matching).
