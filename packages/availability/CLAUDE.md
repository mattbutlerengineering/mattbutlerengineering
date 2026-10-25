# @mbe/availability

Pure availability engine — no IO, no DB, no clock. Given an availability
snapshot and a request, it decides what is bookable and why (ADR-030). The
current time always comes in as an argument.

## Structure

```
src/
├── index.ts            # Barrel export
├── types.ts            # ServiceDate, Weekday, WEEKDAYS, MINUTES_PER_DAY
├── civil-date.ts       # addDays, weekdayOf — "YYYY-MM-DD" arithmetic via Date.UTC
└── instant.ts          # serviceDayInstant, localDateTimeOf — the only wall-clock ↔ instant crossing
```

## Gotchas

- Never construct a `Date` from a `ServiceDate` with the local-time
  constructor — the process time zone leaks in. Go through `civil-date.ts`.
- `serviceDayInstant` takes minutes past the service day's midnight and
  accepts values ≥ 1440 for services that run past midnight (ADR-029). A
  spring-forward gap returns `null`; a fall-back repeat resolves to its first
  occurrence.

## Commands

```bash
pnpm --dir packages/availability test
pnpm --dir packages/availability typecheck
```
