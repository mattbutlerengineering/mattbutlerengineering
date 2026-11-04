---
stage: verify
run: feature:availability-config-usability
date: 2026-11-04
assumptions:
  - "Fresh pass: every check below was run by this stage at HEAD b46a22fcdd36b38c73697fde94e7ab47e3c89908 (node v22.22.3). Nothing is carried from the 6092bd7af or 8b550f8bc passes. The code under test changed since those passes (the Review fix loop, commits 716319fd1 to b46a22fcd in packages/types, packages/availability, services/reservations, services/agent (a comment) and apps/hospitality), so the whole list was re-run."
  - "E2E harness substitution: Auth0 E2E credentials do not exist locally, so every Playwright run used the throwaway harness /tmp/acu-e2e/run-e2e.sh: a synthetic OIDC session written to the gitignored e2e/.auth/user.json, CI's non-secret VITE_* env, and `--project chromium --no-deps` (the real auth.setup.ts skipped). Every e2e line below is labelled: local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). The API is mocked by the specs' own fixtures, so none of it touches the real reservations service. Nothing was listening on :3002 before any run."
  - "Postgres image: one fresh throwaway container `acu-pg-test`, image postgres:15 (sha256:572491f762282374c71da12903261f2a2bce92affe5843241e45703c08b6866a), POSTGRES_USER/PASSWORD/DB test, host port 55439 (5432 belongs to another stack), with CI's rls-integration recipe: `CREATE ROLE rls_owner LOGIN PASSWORD 'rls_owner_ci_pw' CREATEDB CREATEROLE; CREATE DATABASE rls_scratch OWNER rls_owner;`, then `db:migrate:deploy` as rls_owner. CI's Migration Dry-Run job uses postgres:16-alpine; this run did not, so that job's image is not exercised here. The container was removed (`docker rm -f acu-pg-test`; `docker ps -a` lists no container of that name). No other container was touched."
  - "'Default workers' for the e2e runs is the repo's playwright.config.ts value (workers: 1). The flake repeat run used `--workers=4 --retries=0`, the command of the fix loop's two-tree measurement."
  - "Interaction counts and screenshots came from throwaway specs placed in apps/hospitality/e2e (a copy of availability-interaction-guards.spec.ts with a console.log of each count; a screenshot spec writing to /tmp/acu-e2e/shots-final/). Both were deleted before the commit. The guard's mutated-bound proof edited the DEMO_WEEK_VIA_SCHEDULES_COUNT constant to 18 and restored it with `git checkout -- <that file>` inside the worktree; porcelain was empty afterwards."
  - "Locale parity is judged by `pnpm check:i18n-catalogs`, the repo's real key-parity check (the breakdown's `locales.test.ts` does not compare catalogs)."
  - "Criteria list: the 13 PRD success criteria; 11 grouped breakdown Accept sets (E1 to E11) as in the earlier passes, plus E12 (CLI checks and the drift lane); the 2 Verify fix-loop items; and the 12 Review fix-loop items (3 majors, 9 minors), each with its own Accept. Anything not run is NOT RUN, with a reason, in its criterion and in Not verified."
  - "The first `pack --check` attempt passed absolute directories to `mbe pack`, which writes the absolute path into the `<codebase path=...>` attribute; that reported `packages/types/llms.txt is out of sync` only because of my invocation. I ran `pack` once on that directory to see the diff (the single changed line was that attribute), reverted both files with `git checkout --` in the worktree, and re-ran all 22 directories with the repo-relative path CI's `pnpm regen` uses. Only the second run is evidence; it is not a drift."
  - "The Spanish and French `closedDays_many` wording was judged by the fix loop's reasoning, not by a native speaker; `check:i18n-catalogs` checks keys, placeholders and plural-form presence only."
---

# Verification: One regular week that can differ by day

## Summary

Fresh, full verification at HEAD b46a22fcd, after the Review fix loop. 39 criteria: **37 PASS, 2 NOT RUN, 0 FAIL**, and one known pre-existing open risk. This is not an unqualified pass.

- **NOT RUN (2):** the PRD's Owner-only human-timed five-minute walkthrough (PRD 12: an Owner post-release check, never claimed by an agent) and **E11**, the real Auth0 `auth.setup.ts` e2e login (CI only; no Auth0 E2E creds exist locally).
- **Known pre-existing open risk (not a FAIL of this run, not a pass of the test):** the e2e `Escape on Go to date puts focus back on the menu button` still fails intermittently under `--workers=4 --retries=0`. This stage's run at HEAD: 59 passed, 1 failed of 60 (desktop, fr-CA, `expect(locator).toBeHidden() failed`). The fix loop's two-tree numbers (8b550f8bc Notes): this branch 59/60, origin/main 58/60. `GoToDateDialog.tsx` and the test are unchanged by this run. Its cause is unknown and unfixed; it was not re-measured on origin/main here. E9 is a PASS only for the question "did this run introduce it?".
- **Unknown (not examined):** CI-only jobs (Migration Dry-Run on postgres:16-alpine, the `services/agent` Docker build, visual-regression workflows, Lighthouse, mutation testing, `pnpm regen --check --git-only`, `pnpm size:check`), a full-stack browser run against the real service (every e2e mocks the API), an Owner apply of the collapse script on a real database, the es-MX and fr-CA wording of `closedDays_many` beyond key parity, a screen-reader or keyboard pass, dark mode, and browsers other than Chromium.
- **Evidence basis:** every PASS rests on output this stage produced at HEAD. Every e2e line is a local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). The interaction counts are agent stand-in evidence (counts of Playwright actions), not human time.

## Criteria & evidence

### PRD 1. Varied week in quick setup

- Check: the demo-week e2e (lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, brunch Sat–Sun, from an empty venue, entirely in quick setup; its steps use only quick-setup controls and the strip, no Schedules tab) ran inside the full availability run below.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  $ run-e2e.sh <the 14 e2e/availability-*.spec.ts> e2e/locale-sweep.spec.ts      (default workers: 1; 3002 free before)
    284 passed (14.1m)
  e2e/availability-demo-week.spec.ts:63  The demo week (PRD: the demo runs as written) › a Manager enters a varied week in quick setup, watches the strip, and the saved week reads the same everywhere
  ```
  The line reporter prints one summary line, not each test, so the demo-week test's pass is inside the 284, with 0 failed.
- Result: PASS

### PRD 2. Per-weekday result

- Check: engine, route and component tests by name, plus the demo-week e2e (calendar, day drawer, guest preview per weekday).
- Evidence:
  ```
  $ vitest run --reporter=verbose (selected, @mbe/availability)
  week-spans.test.ts > weekSpans > gives Friday and Saturday later last times than Thursday, and no dinner on Monday
  service-days.test.ts > resolveDay with day scope > resolves a row with no scope exactly as before on every weekday
  service-days.test.ts > resolveDay with day scope > runs a row scoped to Mon–Fri under a wider assignment on those days only
  service-days.test.ts > resolveDay with day scope > gives a set's hours on the days it claims with the base elsewhere
  Test Files  5 passed (5) / Tests  19 passed | 57 skipped (76)
  $ pnpm --filter @mbe/availability test      Test Files  20 passed (20) / Tests  340 passed (340)
  ```
  Limit: the e2e's calendar, drawer and preview answers come from `e2e/helpers/engine-days-mock.ts`, which runs the same pure engine over the config the test saved. The real service's day builders were exercised by the reservations suite on Postgres, not by a browser against the real service.
- Result: PASS

### PRD 3. One regular week

- Check: component tests on a migrated-venue fixture and the migrated-venue e2e.
- Evidence:
  ```
  $ pnpm --filter @mbe/hospitality test      Test Files  383 passed (383) / Tests  5238 passed (5238)
  AvailabilityPage.regularWeek.test.tsx > AvailabilityPage on a migrated venue > reads a collapsed venue as one regular week, with no day-named schedule and no Schedules tab   (in the 5238; file listed in the selected run: 18 passed | 71 skipped, 5 files)
  e2e/availability-migrated-venue.spec.ts:68  A migrated venue › reads as one regular week, with no day-named schedule and no Schedules tab   (in the 284 passed, 0 failed)
  e2e/availability-migrated-venue.spec.ts:81  A migrated venue › a venue not yet collapsed still has its Schedules tab
  ```
- Result: PASS

### PRD 4. Change regular week, one day

- Check: `availability-one-weekday.spec.ts` (demo week, then one weekday's hours changed; the other six unchanged, the Schedules tab absent, History names the weekday) in the 284-pass run, plus the builder unit tests and the drawer tests by name.
- Evidence:
  ```
  e2e/availability-one-weekday.spec.ts:18  Change one weekday of the regular week › Lunch closes earlier on Wednesday only   (in 284 passed)
  ChangeRegularWeekDrawer.test.tsx > on a varied week > needs only a start date to save with no end, and asks for no name
  ChangeRegularWeekDrawer.test.tsx > on a varied week > pre-fills each service's base hours as the hours most of its days share
  AvailabilityHistoryDrawer.test.tsx > words a Friday-only regular-week change with Fri and the start date, and shows the summary of an unknown code
  ```
- Result: PASS

### PRD 5. Strip is live and honest

- Check: `RegularWeekStrip.test.tsx` by name; the demo-week e2e (Friday's last slot moves before any save, same URL; strip equals guest preview after save; Monday no dinner); the strip read off the browser at HEAD in the visual check (E10).
- Evidence:
  ```
  RegularWeekStrip.test.tsx > RegularWeekStrip > moves Friday's last time as the close is edited, with no request but the tables read
  RegularWeekStrip.test.tsx > RegularWeekStrip > shows no dinner on Monday for the demo week
  RegularWeekStrip.test.tsx > RegularWeekStrip > lists the seven weekdays Monday first with each service's first and last time
  strip at 1280x720 and 375x812 (inner text read from the browser):
   MONDAY   "Lunch 11:30 AM – 1:45 PM" / "Not offered: Dinner, Brunch"
   THURSDAY "Lunch 11:30 AM – 1:45 PM" / "Dinner 5:00 PM – 9:15 PM"
   FRIDAY   "Lunch 11:30 AM – 1:45 PM" / "Dinner 5:00 PM – 11:15 PM"
   SATURDAY "Brunch 10:00 AM – 1:15 PM" / "Dinner 5:00 PM – 11:15 PM"
  ```
- Result: PASS

### PRD 6. Uniform week no slower

- Check: the guard spec counted by a throwaway copy with a console.log (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally); `availability-quick-setup.spec.ts` ran inside the 284.
- Evidence:
  ```
  COUNT uniform bistro = 5 bound 5        (UNIFORM_BISTRO_BASELINE = 5; assertion toBeLessThanOrEqual)
  6 passed (27.7s)      (the throwaway copy plus the committed guard spec, 3 tests each)
  ```
  Agent stand-in evidence: the count is Playwright actions, not human time.
- Result: PASS

### PRD 7. Varied week faster than today

- Check: same run; quick setup alone against quick setup plus the Schedules tab's New schedule, one wrapper, one spec.
- Evidence:
  ```
  COUNT demo quick-setup=18 via-schedules=26 bound=26      (18 < 26)
  ```
  Agent stand-in evidence only (stated in the spec header).
- Result: PASS

### PRD 8. Large setup no slower

- Check: same run, the four-service large fixture.
- Evidence:
  ```
  COUNT large multi-service = 13 bound 13      (LARGE_SETUP_BASELINE = 13; toBeLessThanOrEqual)
  ```
  A guard, not a re-timed 15-minute bar.
- Result: PASS

### PRD 9. Interactions keep working

- Check: History/Undo, Tonight and the agent's availability chat tools, each on a varied week, by name.
- Evidence:
  ```
  availability-config-api.test.ts > parses an old History inverse row (without the two fields) as no scope
  availability-changes.test.ts > availability history routes > POST /changes/:changeId/revert > reverts and returns the new version and the revert's change id
  tonight-command.test.ts > Tonight on a varied week > judges a Host's pause against the weekday's own hours: Sunday's online-only Dinner is the close
  tonight-command.test.ts > Tonight on a varied week > lets a Host pause online on the weekday that still takes phone bookings
  tonight-command.test.ts > Tonight on a varied week > is gone the next service day, leaving the varied week's schedule untouched
  gen-agent-availability-tools.test.ts > change_tonight_availability > on a varied week > reads the same times on the day Brunch runs as that day's own hours
  gen-agent-closure-tools.test.ts > set_special_hours > on a varied week > seeds a Friday from the rows that run Friday, with Friday's hours
  $ pnpm --filter @mbe/agent-service test      Test Files  53 passed (53) / Tests  1028 passed (1028)
  ```
  The e2e `availability-tonight-decisions.spec.ts` is in the 284 passed.
- Result: PASS

### PRD 10. Copy in three locales

- Check: `pnpm check:i18n-catalogs`, plus the locale e2e files in the 284 run.
- Evidence:
  ```
  $ pnpm check:i18n-catalogs
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  284 passed (14.1m)      (includes availability-locale.spec.ts and locale-sweep.spec.ts)
  ```
  Wording correctness beyond key parity is not claimed (see Not verified).
- Result: PASS

### PRD 11. No regression

- Check: every existing availability suite, the property tests, and every `e2e/availability-*.spec.ts`.
- Evidence:
  ```
  @mbe/types:        Test Files  29 passed (29)   Tests  494 passed (494)
  @mbe/availability: Test Files  20 passed (20)   Tests  340 passed (340)
  @mbe/agent-service: Test Files 53 passed (53)   Tests  1028 passed (1028)
  @mbe/hospitality:  Test Files  383 passed (383)  Tests  5238 passed (5238)
  services/reservations (DATABASE_URL set, fresh Postgres): Test Files  234 passed (234)   Tests  3965 passed (3965)
  $ node scripts/assert-vitest-ran.mjs /tmp/acu-e2e/res-final.json
  Suites ran for real: 3965/3965 tests passed, 0 skipped.
  slots.property.test.ts > engine correctness (property) > never lists a slot outside the resolved day
  slots.property.test.ts > engine correctness (property) > never lists an available slot that judge rejects
  slots.property.test.ts > engine correctness (property) > never accepts an online start the listing does not offer
  slots.property.test.ts > engine correctness (property) > judges every instant inside a closure as hard
  slots.property.test.ts > legacy configs agree with the pre-change functions (oracle) > resolves the same schedule and services on every date
  slots.property.test.ts > legacy configs agree with the pre-change functions (oracle) > reports the same schedule-service issues, in the same order
  day-named-schedules.test.ts > collapseDayNamedSchedules (property) > never changes what any weekday resolves to
  service-days.test.ts > encodeWeek and decodeWeek > round-trips: decodeWeek(encodeWeek(w, days), days) equals w, and re-encoding returns identical rows
  e2e: 284 passed (14.1m)      (14 availability-*.spec.ts + locale-sweep.spec.ts, default workers)
  ```
  Reservations integration files, read from the JSON report: `19 integration files, 286 tests: 286 passed, 0 not passed; pending 0, failed 0, todo 0` (rls-route-sweep 144, rls-venue-resolution 30, rls-isolation 20, closure-notice-refund 15, events 12, closure-reopen-date 12, lapsed-guest-cron.rls 12, rls-app-reservations 7, rls-owner-enforcement 7, series-edit-carry 5, availability-undo-order 4, closure-impact 4, availability-conflict 3, venue-share-lock 3, availability-day-scope 2, availability-snapshot 2, jobs/integration 2, collapse-day-named-schedules.integration 1, availability-conflict-series 1). The earlier pass counted 18 files at one point and 19 at another; this run counts 19 from the report.
- Result: PASS

### PRD 12. Owner-only, never claimed by an agent: human-timed five-minute walkthrough

- Check: none run. It is an Owner post-release check; no stage claims it.
- Evidence: not run.
- Result: NOT RUN (Owner-only, by design)

### PRD 13. The demo runs as written

- Check: `availability-demo-week.spec.ts` follows the PRD's demo step by step; the strip read at HEAD in the visual check (E10).
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  284 passed (14.1m)      (e2e/availability-demo-week.spec.ts:63 in it)
  strip after the demo week was entered: Monday "Lunch 11:30 AM – 1:45 PM / Not offered: Dinner, Brunch"; Friday and Saturday dinner "5:00 PM – 11:15 PM"; Thursday and Sunday dinner "5:00 PM – 9:15 PM"
  ```
  A scripted e2e on mocked API responses, not a person.
- Result: PASS

### E1. Engine: day scope, validation, encode/decode, projection, week spans, property tests (Milestone 1)

- Check: `pnpm --filter @mbe/types test`, `pnpm --filter @mbe/availability test`.
- Evidence:
  ```
  @mbe/types:        Test Files  29 passed (29)   Tests  494 passed (494)
  @mbe/availability: Test Files  20 passed (20)   Tests  340 passed (340)
  service-days.test.ts > encodeWeek and decodeWeek > encodes the demo week to one row per service with the later close as one set
  service-days.test.ts > encodeWeek and decodeWeek > round-trips: decodeWeek(encodeWeek(w, days), days) equals w, and re-encoding returns identical rows
  validate-config.test.ts > validateConfig per weekday > reports a weekday in two sets as weekday_clash at the later set
  validate-config.test.ts > validateConfig per weekday > reports a weekday in a set and in an explicit base as weekday_clash
  legacy-projection.test.ts > projectLegacyOperatingHours with day scope > projects the demo week per weekday: Monday has no dinner window
  legacy-projection.test.ts > projectLegacyOperatingHours with day scope > projects a config of unscoped rows identically to the pre-change function
  week-spans.test.ts > weekSpans > gives Friday and Saturday later last times than Thursday, and no dinner on Monday
  ```
- Result: PASS

### E2. Prisma migration add_schedule_service_day_scope

- Check: `node scripts/check-destructive-migrations.js`; `db:migrate:deploy` as `rls_owner` on the fresh container (twice); the columns; `rls-force-coverage`; `prisma-enum-drift.mjs`.
- Evidence:
  ```
  $ node scripts/check-destructive-migrations.js
  Checking 1 new migration file(s) for destructive operations...
  PASS: No unapproved destructive migrations found.        (DESTR_EXIT=0)
  $ pnpm --filter @mbe/reservations-service db:migrate:deploy
    └─ 20261103120000_add_schedule_service_day_scope/
      └─ migration.sql
  All migrations have been successfully applied.           (DEPLOY_EXIT=0)
  (second deploy) No pending migrations to apply.
  select count(*) from _prisma_migrations -> 44
  weekdays  | integer[] | ARRAY[]::integer[]
  day_hours | jsonb     | not null | '{"sets": [], "version": 1}'::jsonb
  rls-force-coverage.test.ts: 22 passed (in the reservations run)
  $ node scripts/prisma-enum-drift.mjs   (ENUM_EXIT=0, no output)
  ```
- Result: PASS

### E3. Reservations store, save path, audit detail and the Postgres integration tests (Milestone 2)

- Check: the full `services/reservations` suite against the fresh Postgres, with `DATABASE_URL` set and the JSON reporter, then `scripts/assert-vitest-ran.mjs`; the day-scope integration tests by name.
- Evidence:
  ```
   Test Files  234 passed (234)
        Tests  3965 passed (3965)
  Suites ran for real: 3965/3965 tests passed, 0 skipped.
  19 integration files, 286 tests: 286 ran and passed, 0 skipped (pending 0, failed 0, todo 0).
  availability-day-scope.integration.test.ts > schedule service day scope (real Postgres) > reads a row inserted without the two columns as no scope
  availability-day-scope.integration.test.ts > schedule service day scope (real Postgres) > writes a varied week through the store and reads it back byte-equal
  availability-config.test.ts (routes): 37 passed;  services/availability-config.test.ts: 32 passed;  tonight-command.test.ts: 37 passed
  ```
  Integration tests ran for real: 286 ran, 0 skipped.
- Result: PASS

### E4. Legacy migration emits one regular week; collapse function and script (Milestone 3)

- Check: golden, backfill, collapse unit and integration, from the same reservations run; the collapse property test from the engine run.
- Evidence:
  ```
  availability-migration.golden.test.ts: 22 passed
  backfill-availability.test.ts: 2 passed
  collapse-day-named-schedules.test.ts: 8 passed
  collapse-day-named-schedules.integration.test.ts > collapse-day-named-schedules (real Postgres) > keeps every weekday's hours, archives the folded schedule and stays carried over   (1 passed)
  day-named-schedules.test.ts > collapseDayNamedSchedules (property) > never changes what any weekday resolves to
  ```
  The collapse script was exercised only against the mocked client and the throwaway database; an apply on a real database is an Owner step (see Not verified).
- Result: PASS

### E5. Quick-setup draft, form, strip in quick setup and wizard, guest-facing lines (Milestone 4, unit level)

- Check: the full `apps/hospitality` unit suite, plus named tests.
- Evidence:
  ```
  Test Files  383 passed (383)   Tests  5238 passed (5238)
  quick-setup-draft.test.ts > with days and blocks > encodes the demo week to the rows of the demo-week fixture
  quick-setup-draft.test.ts > with days and blocks > round-trips through draftFromConfig
  quick-setup-draft.test.ts > with days and blocks > projects a varied week to each weekday's earliest open and latest close
  RegularWeekStrip.test.tsx (3 named tests above, PRD 5)
  ```
- Result: PASS

### E6. Change regular week, day drawer scope and nudge, Schedules tab, New/Edit schedule rows, Compare, History line, migrated test (Milestone 5, unit level)

- Check: the same hospitality suite; named tests; e2e dead-ends and draft specs in the 284 run.
- Evidence:
  ```
  ChangeRegularWeekDrawer.test.tsx > on a varied week > the Applies to line and the impact count follow the days the services run
  ChangeRegularWeekDrawer.test.tsx > on a varied week > a period still needs a name, in the period's words
  regular-week-line.test.ts > regularWeekLine > says Dinner closes later on Fri and Sat
  regular-week-line.test.ts > regularWeekLine > reads the demo week as each service's days, Monday first
  AvailabilityHistoryDrawer.test.tsx > words a Friday-only regular-week change with Fri and the start date, and shows the summary of an unknown code
  Test Files  383 passed (383)   Tests  5238 passed (5238)
  284 passed (14.1m)      (availability-dead-ends, availability-draft, availability-regular-week, availability-phone specs inside)
  ```
- Result: PASS

### E7. Interaction counter wrapper (Milestone 1)

- Check: `e2e/availability-interaction-baselines.spec.ts` in the 284 run (the wrapper's own tests), and the guard run above.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  284 passed (14.1m)      (availability-interaction-baselines.spec.ts in it; 0 failed)
  COUNT uniform bistro = 5 bound 5 / COUNT large = 13 bound 13 / quick-setup=18 via-schedules=26
  ```
  Not run on its own, so the three wrapper-test names are not quoted.
- Result: PASS

### E8. Install, lint, typecheck

- Check: `pnpm install --frozen-lockfile`; `pnpm typecheck --force`; `pnpm lint --force` (node v22.22.3).
- Evidence:
  ```
  $ pnpm install --frozen-lockfile
  services/reservations postinstall: ✔ Generated Prisma Client (v7.10.1) ...
  Done in 3.4s      (INSTALL_EXIT=0, taken from PIPESTATUS)
  $ pnpm typecheck --force     Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   (TC_EXIT=0)
  $ pnpm lint --force          Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   (LINT_EXIT=0)
    @mbe/hospitality:lint: ✖ 230 problems (0 errors, 230 warnings)
    @mattbutlerengineering/rialto:lint: ✖ 182 problems (0 errors, 182 warnings); @mbe/gen 108; @mbe/rialto-web 165; @mbe/auth 2 (all 0 errors)
  ```
  Lint is green with warnings only. Hospitality's count fell from 232 (earlier pass) to 230; whether the remaining 230 predate this run was not examined.
- Result: PASS

### E9. Flake check: did this run introduce or worsen the "Escape on Go to date puts focus back on the menu button" flake?

- Check: (1) the fix loop's two-tree numbers (8b550f8bc Notes, breakdown.md line 253), (2) this stage's re-run of the same command at HEAD, (3) whether the 284-pass default-workers run saw it.
- Evidence (1), quoted from the breakdown Notes (not re-measured here): `This branch: 59 passed, 1 failed (desktop, fr-CA; expect(dialog).toBeHidden() Received: visible ...). origin/main (106eaaf9c ...): 58 passed, 2 failed (both desktop, en-US, same assertion shape).`
- Evidence (2), this stage, HEAD, nothing on :3002 beforehand (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  $ run-e2e.sh e2e/availability-regular-week.spec.ts --grep "Escape on Go to date" --repeat-each=15 --workers=4 --retries=0
    1) [chromium] › e2e/availability-regular-week.spec.ts:366:5 › navigation and day-drawer controls (#7981) › Escape on Go to date puts focus back on the menu button (desktop, fr-CA)
       Error: expect(locator).toBeHidden() failed
    1 failed
    59 passed (1.1m)
  ```
- Evidence (3): the default-workers run (workers: 1) of the same spec file inside the 284 had 0 failed.
- Reading: the failure shape is the same as in the fix loop's runs (desktop, `toBeHidden`), at 1 of 60 here against 1 of 60 (branch) and 2 of 60 (origin/main) there; the earlier Verify pass saw 4 of 60 on this branch. These counts cannot rank the trees; the dialog, toolbar and test are the merge base's. The cause is uninvestigated and [INFERENCE] only.
- Result: PASS for the rescoped question (this run neither introduced nor worsened it). **Not a pass of the test:** it remains a pre-existing open risk (OPEN).

### E10. Visual check of the real surface

- Check: Playwright screenshots through the harness's session and mocked API, saved to `/tmp/acu-e2e/shots-final/` (outside the repo) at 1280x720 and 375x812 after the Review fix loop (including Minor 9's a11y changes): `NNNxNNN-01-quick-setup-viewport`, `-02-quick-setup-full`, `-03-strip`, `-04-different-hours-block`, `-05-service-row-dinner`, `-06-after-remove-service` (12 PNG). I opened each of `1280x720-02, -03, -05, -06` and `375x812-01, -02, -03, -05`.
- Evidence (text read from the DOM at the same time, then what I saw):
  ```
  strip (both widths) MONDAY "Lunch 11:30 AM – 1:45 PM" / "Not offered: Dinner, Brunch"; FRIDAY "Lunch ..." / "Dinner 5:00 PM – 11:15 PM"; SATURDAY "Brunch 10:00 AM – 1:15 PM" / "Dinner 5:00 PM – 11:15 PM"; SUNDAY "Brunch ..." / "Dinner 5:00 PM – 9:15 PM"
  ADD aria-expanded=null count=3        (the "Different hours on some days" buttons carry no aria-expanded)
  LIVE ["Service 3 added ","Monday, Tuesday, Wednesday, Thursday, Friday updated"]
  FOCUS after remove: INPUT  Dinner      (removing service 3 puts focus in the previous service's name input, not on body)
  ```
  What I saw:
  - 1280x720: the form fills the left column; the "Guest preview" panel (title, "First and last time a guest can book.", a Party select showing 2, then one block per weekday, Monday first) sits on the right. Each row has a small "Updated" tag where its times changed (Monday to Friday; Saturday and Sunday untagged). Text is legible, with no clipping or overlap. After the remove, the Dinner name field shows a visible gold focus ring (`6-after-remove-service`).
  - 375x812: one column; the strip sits below the form (as designed); rows are legible and nothing runs off the card.
  - Service row (Dinner): "Different days for this service", "Use the shared days", "Different hours on some days" and "Remove service 3" render as small grey captions without a border, still reading as captions rather than buttons; the "Dinner runs on" shortcut buttons (Weekdays, Weekends, Every day) and the weekday checkboxes have visible state. "Dinner: different hours" shows Fri and Sat ticked, Opens 5:00 PM, Last seating 11:15 PM, Closes 12:00 AM, "Closes 12:00 AM the next day" and "Remove these hours".
  - Observation (Playwright, not the UI): the app scrolls inside its own container, so my `fullPage` and element screenshots (`-02`, `-04`, `-05`, `-06` at 375) are cropped or contain blank bands; they were readable only in part. The `-01` viewport shot and the DOM text were the reliable sources.
  - Carried over, not re-looked at: the earlier pass's non-blocking observations O1 (low-affordance caption buttons; still true in these shots, above), O2 to O4 (clipped Ending placeholder, a Details row misalignment at 375, toast over the header) were not re-checked in this pass.
  - Could not check: a screen reader or keyboard pass, contrast measurement, dark mode, many-service strips, a tables-loaded party check, `prefers-reduced-motion`, other browser engines.
- Result: PASS

### E11. Real Auth0 `auth.setup.ts` e2e login

- Check: none run locally: E2E_AUTH0_* creds exist only in CI.
- Evidence: not run. All e2e evidence above used the synthetic OIDC session, which skips `auth.setup.ts`, so the real login path is a limitation of this verification, not a pass.
- Result: NOT RUN (CI-only)

### E12. CLI checks and the drift lane

- Check: `pnpm --filter @mbe/cli build && ... start check-adr && ... start check-deps`; `pnpm graph`, `pnpm generate:dep-graph`, `git diff --exit-code` on the two generated files; `mbe pack <dir> --check` for each of the 22 tracked `llms.txt` directories.
- Evidence:
  ```
  @mbe/cli build (tsc): BUILD=0
  Checking codebase against 1 active ADRs...
  ✅ No architectural violations detected.        (ADR=0)
  ✅ All external dependencies are consistent across the monorepo.   (DEPS=0)
  Generated dependency graph with 30 packages → docs/architecture/dependency-graph.md     (GRAPH=0)
  Generated dependency graph: 30 nodes, 93 edges → infrastructure/worker/dep-graph.json   (GEN=0)
  $ git diff --exit-code docs/architecture/dependency-graph.md infrastructure/worker/dep-graph.json
  DIFF_EXIT=0
  $ pnpm --filter @mbe/cli start pack <dir> --check     for apps/gen, apps/hospitality, apps/marketing, apps/rialto-web, infrastructure/pulumi, ., packages/{agent-core,api-client,auth,config,database,gh-client,rialto-catalog,rialto,sentry,service-bootstrap,types,ui-quality-capture}, services/{agent,reservations,users}, tools/cli
  22 of 22: exit 0, "<dir>/llms.txt is in sync."
  ```
  No drift. (The first attempt with absolute paths is explained in the assumptions; it is not evidence.)
- Result: PASS

### Verify fix loop: es-MX and fr-CA plural forms for closedDays

- Check: `pnpm check:i18n-catalogs` at HEAD.
- Evidence:
  ```
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  ```
  Correctness of the Spanish and French strings beyond plural-form presence is not claimed.
- Result: PASS

### Verify fix loop: Go to date Escape flake classified

- Check: the classification and both-tree evidence are recorded in the breakdown Notes (breakdown.md line 253: this branch 59/60, origin/main 58/60); the test body is unchanged since the merge base; this stage's run is in E9.
- Evidence (this stage, HEAD):
  ```
  $ git diff --stat origin/main...HEAD -- apps/hospitality/src/components/availability/GoToDateDialog.tsx apps/hospitality/src/components/availability/AvailabilityToolbar.tsx
  (no output: both files identical to the merge base)
  $ git diff 106eaaf9c HEAD -U0 -- apps/hospitality/e2e/availability-regular-week.spec.ts | grep '^@@'
  hunks at lines 92, 98, 115, 121, 139, 216, 258, 284 and 605; the Escape test starts at line 366, so none touches it
  breakdown.md:253  "Go to date Escape flake, classified PRE-EXISTING (surgical scope: the test is unchanged)."
  ```
  The classification is recorded; the flake itself is not fixed and is not claimed fixed.
- Result: PASS (the Accept is the classification, not a fix)

### Review major 1: a stale client erases a varied week

- Check: the route test, the schema tests, and the full suites.
- Evidence:
  ```
  $ vitest run availability-config.test.ts -t "stale client"   (services/reservations)
   ✓ availability config routes > PUT /config > refuses a row that omits the two fields, so a stale client cannot erase a varied week
   Tests  1 passed | 36 skipped (37)
  $ vitest run availability-config-api.test.ts -t "PUT body row|old History inverse"   (packages/types)
   ✓ regular_week_changed detail and day scope on the wire > parses an old History inverse row (without the two fields) as no scope
   ✓ regular_week_changed detail and day scope on the wire > requires both new fields on a PUT body row, naming the missing one
   Tests  2 passed | 40 skipped (42)
  ```
  The Accept's "store is never called" and "400 naming the field" are what the route test's name states; I did not open the assertions line by line. Stored rows still parse (the old-inverse test above; the reservations full run, 3965 passed, reads rows without the fields in the integration test).
- Result: PASS

### Review major 2: per-set seating and booking types flattened

- Check: the set-seating preservation tests, by name.
- Evidence:
  ```
  $ vitest run schedule-changes.test.ts -t "own seating and booking types"   (apps/hospitality)
   ✓ an hour set's own seating and booking types > Change regular week keeps the set's seating and booking types when only the base hours change
   ✓ an hour set's own seating and booking types > Edit schedule keeps the set's seating and booking types through a rename
   Tests  2 passed | 28 skipped (30)
  ```
- Result: PASS

### Review major 3: duplicating a schedule makes an all-week winner

- Check: the duplicate-schedule seeding test, by name.
- Evidence:
  ```
  $ vitest run ScheduleDrawers.test.tsx -t "only a Use schedule rule runs"   (apps/hospitality)
   ✓ schedule drawers > Schedules tab > a copy of a schedule only a Use schedule rule runs needs days before it can save (it would otherwise win every day)
   Tests  1 passed | 23 skipped (24)
  ```
  The test name covers "needs days before it can save"; the "regular week unchanged on every day" leg and "no undated all-week assignment written" leg were not separately confirmed by me beyond the test passing.
- Result: PASS

### Review minor 1: Edit schedule drops a service whose own days are outside the schedule's days

- Check: the named test.
- Evidence:
  ```
   ✓ quick setup draft > flags a service whose own days all fall outside the days the schedule is used on
   Tests  1 passed | 38 skipped (39)
  ```
  The Accept's alternative (`validateDraft` refuses with an issue) is the leg this test names; the drawer's Save wiring (b36b46c44) is covered by the hospitality suite passing, not by a separate named test here.
- Result: PASS

### Review minor 2: the collapse script's `replaced` log omits created rows

- Check: the named test; `reference.md`.
- Evidence:
  ```
   ✓ collapseVenue > logs the ids of the rows a collapse creates, so the log can be rolled back from
  services/reservations/docs/reference.md:670: ... Every `would_collapse` / `collapsed` line carries the rows it replaced and the ids of the rows it created (`created`): keep the log, it is the backup. Rollback is manual: restore the replaced rows, delete the created ones (archived schedules can be unarchived).
  ```
- Result: PASS

### Review minor 3: the collapse script's `refused` check compares issue sets

- Check: the named tests.
- Evidence:
  ```
   ✓ introducedIssues > reports an issue the collapse adds even when it also fixes one (equal counts)
   ✓ introducedIssues > reports nothing when the collapse only keeps or removes issues
   Tests  3 passed | 5 skipped (8)      (with the minor 2 test)
  ```
- Result: PASS

### Review minor 4: `encodeWeek` is canonical over `bookingTypes` and `fixed` seating order

- Check: the named test.
- Evidence:
  ```
   ✓ encodeWeek canonical form > groups days whose bookingTypes or fixed seating differ only in order
   Tests  1 passed | 23 skipped (24)
  ```
- Result: PASS

### Review minor 5: the "varied week faster than today" guard can fail

- Check: the guard compares against the constant `DEMO_WEEK_VIA_SCHEDULES_COUNT = 26`; I ran the spec with the constant mutated to 18, watched it fail, restored it and re-ran.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  mutated (DEMO_WEEK_VIA_SCHEDULES_COUNT = 18):
    Error: expect(received).toBeLessThan(expected)
    Expected: < 18
    Received:   18
    > 103 |     expect(quickSetup.count()).toBeLessThan(DEMO_WEEK_VIA_SCHEDULES_COUNT);
    1 failed / 2 passed (22.6s)
  restored (git checkout -- the constant's file; porcelain empty):
    3 passed (14.6s)
  ```
  This is a fresh re-run of the proof, not a citation of 8cdbf9577.
- Result: PASS

### Review minor 7: the calendar's regular-week line agrees with Details after a dated Change regular week

- Check: the named test.
- Evidence:
  ```
   ✓ regularWeekLine > reads the week in force today, not a dated Change regular week that starts later
   Tests  1 passed | 5 skipped (6)
  ```
  The line's agreement with Details in a browser was not looked at.
- Result: PASS

### Review minor 8: the lint warning at `ScheduleEditorDrawer.tsx:130`

- Check: `eslint` on the file; the root `lint --force` above.
- Evidence:
  ```
  $ pnpm exec eslint src/components/availability/ScheduleEditorDrawer.tsx     (apps/hospitality)
  (no output)   ESLINT_EXIT=0
  @mbe/hospitality:lint: ✖ 230 problems (0 errors, 230 warnings)      (232 before the fix loop)
  ```
  The RED half of the Accept (the warning as it was) was not re-created; the earlier count of 232 against today's 230 is consistent with two warnings gone.
- Result: PASS

### Review minor 9: accessibility in the new service row

- Check: the three component tests by name, and the same behaviours read from the browser (E10).
- Evidence:
  ```
   ✓ QuickSetupForm removing a service > moves focus to the previous service's name instead of dropping it to the page
   ✓ QuickSetupForm different hours on some days > does not mark the add button expanded: a click adds another block, it never collapses
   ✓ QuickSetupForm different hours on some days > changes the live region's DOM when the same announcement repeats
   Tests  3 passed | 11 skipped (14)
  browser: ADD aria-expanded=null; FOCUS after remove: INPUT  Dinner
  ```
- Result: PASS

### Review minor 14: the agent tool's comment states what `serviceDayMinute` reads

- Check: read the comment at `services/agent/src/routes/gen-agent-availability-tools.ts` and ran the agent suite.
- Evidence:
  ```
  132:  // Every schedule's rows that run on `date`'s weekday, each with that weekday's hours, over all
  133:  // venue services (archived ones too): not only the schedule that covers `date`. Pre-existing; a
  134:  // holiday schedule opening earlier than the regular day moves the cutoff for every date.
  @mbe/agent-service: Test Files  53 passed (53) / Tests  1028 passed (1028)
  ```
- Result: PASS

## Failures

none. No criterion failed at HEAD, and the drift lane showed no drift.

Open and not failing this run (routes to the Owner or a later run, not to Implement): the **Go to date Escape flake** (E9): `Escape on Go to date puts focus back on the menu button (desktop)` fails intermittently under `--workers=4 --retries=0` (1 of 60 here; 1 of 60 on this branch and 2 of 60 on origin/main in the fix loop). Cause unknown and uninvestigated.

Non-blocking observation for Review: the service-row caption buttons ("Different days for this service", "Use the shared days", "Different hours on some days", "Remove service N") read as low-contrast captions without a border (earlier O1; still visible in the HEAD shots).

## Not verified

- **Owner-only human-timed five-minute walkthrough** (PRD 12): not run, by design.
- **Real Auth0 e2e login (`auth.setup.ts`)** (E11): CI-only; not run.
- **A full-stack browser run**: every e2e mocks the API; the calendar, day drawer and guest preview in the demo e2e come from `engine-days-mock.ts` running the same pure engine as the service, so PRD 2's e2e leg is not independent of the engine. The service's own builders were exercised by the reservations suite, not by a browser.
- **CI-only jobs**: the Migration Dry-Run job (postgres:16-alpine; this run used postgres:15), the `services/agent` Docker build, visual-regression workflows, Lighthouse, mutation testing, `pnpm regen --check --git-only` and `pnpm size:check`. None was run here.
- **Collapse script apply on a real database**: the Owner's step; only the mocked-client unit tests and the throwaway Postgres were used.
- **Whether the 230 hospitality lint warnings predate this run**: not examined. **Whether the Go to date Escape flake exists on `origin/main`**: shown only by the fix loop's run (2 of 60), not re-measured here; its cause was not investigated.
- **Correctness of the es-MX and fr-CA `closedDays_many` wording** beyond key, placeholder and plural-form presence: no native-speaker review.
- **Route-test internals for Review major 1 and 3**: I ran the named tests and quoted their titles; I did not read every assertion against the Accept's sub-claims.
- **Visual**: accessibility with a screen reader or keyboard, dark mode, other browsers, many-service strips, tables-loaded party checks; some full-page and element screenshots at 375 px were cropped by the app's inner scroll container (E10).
- **Interaction counts** are counts of Playwright actions on one fixture (agent stand-in evidence), not human time.
