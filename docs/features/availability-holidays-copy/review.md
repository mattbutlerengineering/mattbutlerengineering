---
stage: review
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "An independent `reviewer` subagent read `git diff origin/feat/availability-phone-tonight-v2..HEAD -- apps packages services .github` (65 files) against prd.md, ux.md and architecture.md, and ran targeted suites. Severities are the reviewer's. All four majors and the minors were fixed in 3de1529d5; none were deferred except n4, which is the same pattern as the other mutation hooks."
  - "Written before verification.md, so verification reflects the fixed tree."
---

# Review: Holiday decisions that stick, and Copy that says what it does

## Scope

- **The store:** the migration, the `holiday-decisions` routes and service, the RLS sweep fixtures, the types and the api-client.
- **The holidays UI:** the model, the hooks, the line, the panel, the nudge, the sheet props and the `open-as-usual.ts` cutover.
- **Copy:** the dialog, `copy-week-draft`, the drawer prefill and `lockedDays`.
- **The e2e spec**, plus the regression updates.

## Findings

### Major: concurrent PUTs of the same holiday decision returned 500

- **Scenario:** two Managers, or a double tap, set the same date at once. Prisma compiles `upsert({update:{}})` to SELECT then INSERT with no ON CONFLICT, so one request hits P2002 and the route answers 500. The line reads "Couldn't save." although the row exists.
- **Standard:** none.
- **Decision:** fixed in `3de1529d5`. `update: { decision }` compiles to a single `INSERT … ON CONFLICT DO UPDATE`.
  - An integration test fires 12 parallel sets and expects 12 successes, 1 row, one `createdAt` and the first author kept. It passed 5 of 5 runs on Postgres 15.
  - With `update: {}` restored it failed 1 of 3 runs: the race is real and timing-dependent.

### Major: a second Closed press while the first was saving was dropped or mis-attributed

- **Scenario:** press Closed on Thanksgiving, then on Christmas Day before the first save returns. The single unkeyed sheet kept Thanksgiving's form, so Christmas Day was never closed. With a step two, the toast and the tidy-up went to the wrong holiday.
- **Standard:** none.
- **Decision:** fixed in `3de1529d5`. Each press is its own keyed sheet request, and the line is saving (group disabled, spinner) until the sheet settles. While any line saves, other lines and Close these N are blocked. Covered by panel tests, and by a tab test in which the first closure stays pending.

### Major: Copy named a day under a whole-day closure as getting the hours

- **Scenario:** copying Friday to Saturday when Saturday is closed. The sentence and the toast said "Sat will use Friday's hours" and "Copied … to Sat, Oct 31", but the closure keeps it shut.
- **Standard:** none.
- **Decision:** fixed in `3de1529d5`. Such dates are left out and named ("Sat is closed on Oct 31. Reopen it to change its hours."). If all targets are closed, the primary is disabled with that reason.

### Major: Closed → Special hours… reopened the venue before the sheet; cancelling left it open

- **Scenario:** a Manager peeks at Special hours… on a closed Christmas Day and cancels. The venue is now bookable that day.
- **Standard:** none.
- **Decision:** fixed in `3de1529d5`. The sheet opens first, and the closure is reopened only after the hours save. Cancelling keeps the holiday Closed (test).

### Minor: fixed

- **n1:** Every week's "already the same" check let a higher-precedence named schedule decide. It now compares against the regular week only.
- **n2:** an inverted comment on `sameHoursAs`.
- **n3:** the PUT reply echoed the request's decision; it now returns the stored one.
- **n5:** a series skipped on the holiday counted as a decision.
- **n6:** tautological and wiring tests were made behavioural, and the integration cleanup now runs in `finally`.
- **n7:** fr-CA "Action de grâces" and "Dates spéciales", es-MX "Fechas especiales", and complete plural forms (`closeUsual_one` restored with real singular wording for the parity check, and `savedNotified_*` added).
- **n8:** the generated llms files are regenerated at Ship.

### Minor: deferred

- **n4:** after a decision saves, the line's status clears before the decisions refetch lands, so it can flash undecided for a moment. This is the same pattern as the repo's other mutation hooks (`createMutationHook` doesn't await invalidation). Changing it belongs in the shared hook, not this run.
- **Lint:** warnings went from 240 to 241, one `react-hooks` warning in existing patterns. No new file adds warnings over its base.

## Passes with no findings

Per the reviewer:

- **Auth and scoping:** the role comes from the membership; a Host gets 403 on writes and 200 on reads; cross-venue access is denied.
- **The migration:** additive; RLS policy, FORCE and grants match the prior tables; the cascade is proven; rollback drops the table.
- **Dates:** UTC-midnight DATE handling matches `closure-notice-store`; real-date validation; the 400-day cap is enforced server-side.
- **RFC 7807 errors**, and no PII in logs.
- **Copy's `replace` mode** adds per-date `skip` rows and never ends a series.
- **The Every week prefill** sends no `precedence_tie`.
- **This-week targets and disabled reasons.**
- **Holiday state precedence and the ordered transitions.**
- **The Host view.**
- **Accessibility:** group names, `aria-pressed`, focus on Retry.
- **`open-as-usual.ts`** has no remaining readers.
- **i18n parity and `Intl.ListFormat`.**

## Verdict

Ready for Ship once verification.md is green: no critical findings, four majors fixed, one minor deferred with a reason.
