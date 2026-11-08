---
stage: verify
run: feature:availability-holidays-copy
date: 2026-11-08
commit: 3de1529d5
assumptions:
  - "App e2e runs locally on mocked APIs with a fake OIDC session (no E2E Auth0 credentials here); CI re-runs it with the real session. The service's Postgres suites ran on a real Postgres 15 (Docker at first, then embedded-postgres after OrbStack's daemon hung), with the CI role setup and the full migration chain."
  - "The Owner delegated; no Owner walkthrough was run."
---

# Verification: Holiday decisions that stick, and Copy that says what it does

## Summary

On `3de1529d5`: 12 of 12 PRD criteria pass, 0 FAIL, and 0 automated checks NOT RUN. One human check was not run: no Owner or operator walkthrough.

- App e2e: 557 of 557 with `--retries=0`.
- The service's real-Postgres suites: 157 of 157, including RLS isolation, the cascade and a 12-way concurrent write.

Verdict: holiday decisions are made once and seen by everyone, and Copy never writes a never-ending rule and says what it changes.

```
apps/hospitality vitest:  Test Files 425 passed (425)  Tests 6026 passed (6026)
apps/hospitality typecheck: 0 errors; services/reservations tsc: 0 errors
eslint src/ e2e/: 0 errors, 241 warnings (base 240; review.md)
check-ai-antipatterns: within baseline; check-i18n-catalogs: PASS
services/reservations (Postgres 15, CI role setup, migrate deploy):
  rls-route-sweep.integration 147, holiday-decision.integration 7 (incl. 12 parallel sets, 5/5 runs),
  venue-delete-availability-cascade.integration 3 — 157 passed
services/reservations unit (holiday-decision, holiday-decisions route): 21 passed
packages/types 502 passed, packages/api-client 398 passed (slice A run)
e2e (availability-*, onboarding, venue-setup-hub, a11y, fold-budget, locale-sweep, timeline*; --retries=0) on 3de1529d5: 557 passed (27.4m)
```

## Criteria & evidence

### 1. One decision per holiday: PASS

- **Unit:** `holiday-decisions.test.ts` covers the 365-day horizon, the year boundary and every state. `UpcomingHolidays.test.tsx` covers month groups, the first 5 plus "Show 8 more holidays this year", and each choice's calls.
- **e2e:** H3, where Special hours… opens the sheet on Dec 31 and saving writes one one-day special_hours rule with no repeat.

### 2. The usual closures in one tap: PASS

e2e H1: "Close these 3" posts one batch of three venue closures (Nov 26, Dec 25, Jan 1), with the toast and no decision call. It takes 2 interactions, against 6 before and a budget of ≤ 3.

### 3. Saved to the venue: PASS

- **Service:** the route and service tests, and the RLS integration on Postgres 15: idempotent set and clear, a Host can't write, cross-venue access is denied, and venue delete cascades.
- **e2e H2:** two browser contexts share one venue. Context A marks Christmas Eve open as usual. Context B sees "Decided (1)" with 0 interactions, and the calendar nudge moves on to Christmas Day.

### 4. Guests unaffected: PASS

By construction. The decision lives in its own table, outside the availability config, so the engine, the config, preview and guest booking never read it. There is no diff to `packages/availability`, `DateRuleSchema` or the config path.

### 5. Decided holidays stay findable: PASS

- **Unit:** the Decided group with Change, and transition order for every pair: Closed → Open as usual reopens first, then marks; a mark → Closed closes first, then clears; Closed → Special hours… reopens only after the hours save.
- **e2e:** Decided → Change → Closed posts the closure first, then a DELETE for the mark (3 interactions).

### 6. Copy says which: PASS

- **Unit:** `CopyDayAction.test.tsx` and `copy-week-draft.test.ts`.
- **e2e K2:** one one-day special_hours rule per date (Nov 11 and Nov 12), with no repeat.
- **e2e K1:** "Every week…" opens Change regular week prefilled with Starting Nov 9, and its PUT carries no dateRules.

No path in the dialog builds a `repeat`.

### 7. Copy says what changes: PASS

- **The live sentence** names the days, the hours and the dates.
- **The muted line** reads "Every week… changes your regular week from Nov 9."
- **The toast** reads "Copied Tuesday's hours to Wed, Nov 11 and Thu, Nov 12", with no count of future dates in any string.
- **Closed targets** are named, not claimed.

### 8. Already the same: PASS

- **Unit:** `sameHoursAs` covers services, times and last seating.
- **e2e:**
  - With Wed and Fri chosen, "Fri already has these hours." shows and "Copy to Wed" stays enabled.
  - With only Fri chosen, both buttons are disabled with "These days already have Tuesday's hours.".
  - Nothing is saved.

### 9. Scenario budgets: PASS

| # | Job | Before (round-3 tree) | After | Budget |
|---|---|---|---|---|
| H1 | Close Thanksgiving, Christmas Day, New Year's Day | 6 | 2 | ≤ 3 |
| H2 | Christmas Eve open as usual | 2 | 2 | ≤ 3 |
| H2b | The second Manager | re-decide on each device | 0 | 0 |
| H3 | Special hours on New Year's Eve | 5 | 5 | ≤ 5 |
| K1 | Tuesday to Wed and Thu, every week | 6 (silently wrote a never-ending rule) | 7 | ≤ 7 (amended) |
| K2 | Just this week | 8 | 6 | ≤ 8 |

These are agent stand-in counts.

### 10. Honest failure: PASS

- **Unit:** a 404 or 405 from `set` reads "Couldn't save." with Retry, and the line stays undecided.
- **e2e:** the first PUT answers 404, Retry is focused, the line stays undecided, and Retry then succeeds.

### 11. Locales: PASS

`check-i18n-catalogs` passes (keys, placeholders, plural forms). Unit key parity passes, and `locale-sweep.spec.ts` passes.

### 12. No regressions: PASS

- App e2e: 557/557.
- Service suites: green.
- Changed expectations: the dead-ends and draft Copy specs use a week with a differing day, because Copy now refuses to copy hours a day already has (listed in breakdown Notes).

## Failures

None open. Found and fixed during Implement and Review:
- K1 over budget with a radio, fixed by making the choice the action;
- the gate failures: 2 type errors, the antipattern ratchet, lint and the parity check;
- review majors M1–M4 and minors.

## Not verified

- **No Owner or operator walkthrough.**
- **Auth0, the real API and production data** (app e2e is mocked; CI uses the real session).
- **The deploy window:** a web build reaching users before the service with the new route gets 404/405 on save. That reads "Couldn't save." (tested), but it wasn't exercised against a real older server. Deploy order is DB migration → service → web.
- **Visual baselines** change on `/availability` Special dates and the Copy dialog by design.
- **Local machine:** OrbStack's Docker daemon hung during the run, and a container named `hdpg` may need `docker rm -f hdpg`.
