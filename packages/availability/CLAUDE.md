# @mbe/availability

Pure availability engine — no IO, no DB, no clock. Given an availability
snapshot and a request, it decides what is bookable and why (ADR-030). The
current time always comes in as an argument.

## Structure

```
src/
├── index.ts            # Barrel export
├── types.ts            # ServiceDate, Weekday, WEEKDAYS, MINUTES_PER_DAY
├── civil-date.ts       # addDays, weekdayOf, weekdayIndexOf (0 = Sunday, as stored) — via Date.UTC
├── resolve-day.ts      # resolveDay — the schedule and services in force on one service day
├── instant.ts          # serviceDayInstant, localDateTimeOf — the only wall-clock ↔ instant crossing
└── validate-config.ts  # validateConfig — cross-row invariants over the @mbe/types config schemas
```

## Gotchas

- Never construct a `Date` from a `ServiceDate` with the local-time
  constructor — the process time zone leaks in. Go through `civil-date.ts`.
- Config shape lives in `@mbe/types` (`schemas/availability-config.ts`) and is
  structural only. Invariants spanning fields or rows go in `validateConfig`,
  which returns path-addressed issues and never throws.
- `resolveDay` picks the covering assignment with the highest precedence; a
  date no assignment covers is closed (there is no fallback to the regular
  schedule). A service belongs to the day it opens on, so a past-midnight
  service never appears on the next calendar date.
- `serviceDayInstant` takes minutes past the service day's midnight and
  accepts values ≥ 1440 for services that run past midnight (ADR-029). A
  spring-forward gap returns `null`; a fall-back repeat resolves to its first
  occurrence.

## Commands

```bash
pnpm --dir packages/availability test
pnpm --dir packages/availability typecheck
```
