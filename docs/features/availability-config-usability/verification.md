---
stage: verify
run: feature:availability-config-usability
date: 2026-11-04
assumptions:
  - "E2E harness substitution: Auth0 E2E credentials do not exist locally, so every Playwright run used the throwaway harness /tmp/acu-e2e/run-e2e.sh: a synthetic OIDC session written to the gitignored e2e/.auth/user.json, CI's non-secret VITE_* env, and `--project chromium --no-deps` (the real auth.setup.ts skipped). Every e2e line below is labelled: local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). The API is mocked by the specs' own fixtures, so none of it touches the real reservations service."
  - "Postgres recipe: one fresh throwaway container `acu-pg-test` (postgres:15 with a `rls_owner` role and `rls_scratch` database, the CI rls-integration job's recipe in .github/workflows/ci.yml) on host port 55439, because 5432 is another stack's. The migration dry-run job in CI uses postgres:16-alpine; this run used postgres:15 for the whole Postgres evidence. The container was removed at the end (`docker rm -f acu-pg-test`)."
  - "'Default worker count' for the flake check is the repo's playwright.config.ts value, `workers: 1`. The parallel case was added by this stage as `--workers=4 --retries=0` over all 14 availability specs, because a single spec file always runs in one worker."
  - "Interaction counts and screenshots were produced by throwaway specs placed in apps/hospitality/e2e for the run and deleted before the commit (counts: a copy of availability-interaction-guards.spec.ts with a console.log of each count; screenshots: Playwright page.screenshot into /tmp/acu-e2e/shots/, outside the repo). The tree was clean after each run."
  - "Locale parity is judged by `pnpm check:i18n-catalogs` (scripts/check-i18n-catalogs.mjs), the repo's actual key-parity check. The breakdown named `locales.test.ts`, which tests locale resolution and does not compare catalogs."
  - "`pnpm lint` and `pnpm typecheck` were run twice: once as the plain root command (turbo replayed 12 and 19 cached tasks) and once with `--force` (0 cached). The `--force` numbers are the evidence."
  - "Criteria list: the 13 PRD success criteria plus 11 grouped breakdown Accept sets (E1 to E11) that no PRD criterion covers, grouped by milestone and by the checks the assignment lists. Anything not run is NOT RUN, with a reason, in the criterion and in Not verified."
---

# Verification: One regular week that can differ by day

## Summary

24 criteria: 20 PASS, 2 FAIL, 2 NOT RUN. This is not a pass.

- **FAIL (2):** the PRD criterion **Copy in three locales**, because `pnpm check:i18n-catalogs` fails on two keys this run added (`availabilitySchedules.regularWeek.closedDays_many` is missing in es-MX and fr-CA); and **E9 Flake check**, because "Escape on Go to date puts focus back on the menu button (desktop, en-US)" failed once in a 4-worker run with retries off. Both route back to Implement.
- **NOT RUN (2):** the PRD's Owner-only human-timed five-minute walkthrough (Owner post-release check, never claimed by an agent), and **E11**, the real Auth0 `auth.setup.ts` e2e login, which runs only in CI because no Auth0 E2E creds exist locally.
- **Unknown beyond those two:** CI-only jobs, a full-stack browser run against the real service, and an Owner apply of the collapse script were not examined (see Not verified).
- Everything else passed on fresh runs in this stage. Every e2e pass is local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally), with API calls mocked.

## Criteria & evidence

### PRD 1. Varied week in quick setup

- Check: ran `availability-demo-week.spec.ts` through the harness (the demo week from an empty venue, entirely in quick setup; the spec has no Schedules-tab step; `grep` of its assertions shows only quick-setup controls and the strip).
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  [chromium] › e2e/availability-demo-week.spec.ts:63:3 › The demo week (PRD: the demo runs as written) › a Manager enters a varied week in quick setup, watches the strip, and the saved week reads the same everywhere
  ...
  158 passed (9.8m)      <- all 14 availability-*.spec.ts, default workers
  ```
- Result: PASS

### PRD 2. Per-weekday result

- Check: the same demo-week e2e (calendar cells, day drawer and guest preview per weekday), plus engine and route tests.
- Evidence:
  ```
  availability-demo-week.spec.ts: 1 passed (in the 158 passed above)
  week-spans.test.ts | weekSpans gives Friday and Saturday later last times than Thursday, and no dinner on Monday
  service-days.test.ts | resolveDay with day scope resolves a row with no scope exactly as before on every weekday
  availability-config.test.ts | availability config routes PUT /config ... (varied week save)
  @mbe/availability: Test Files 20 passed (20); Tests 339 passed (339)
  ```
  Limit: the e2e's calendar, drawer and preview answers come from `e2e/helpers/engine-days-mock.ts`, which runs the same pure engine over the config the test saved. The real service's builders sit behind Prisma and were exercised by the reservations suite, not by the browser.
- Result: PASS

### PRD 3. One regular week

- Check: component test on a migrated-venue fixture, plus the migrated-venue e2e.
- Evidence:
  ```
  AvailabilityPage.regularWeek.test.tsx | AvailabilityPage on a migrated venue > reads a collapsed venue as one regular week, with no day-named schedule and no Schedules tab
  AvailabilityScheduleControls.test.tsx | Schedules tab > is absent when every schedule is a regular week, superseded versions included
  [chromium] › e2e/availability-migrated-venue.spec.ts:68:3 › A migrated venue › reads as one regular week, with no day-named schedule and no Schedules tab
  [chromium] › e2e/availability-migrated-venue.spec.ts:81:3 › A migrated venue › a venue not yet collapsed still has its Schedules tab
  apps/hospitality: <testsuites tests="5230" failures="0" errors="0">, 383 test suites, 0 suites with skipped>0
  ```
- Result: PASS

### PRD 4. Change regular week, one day

- Check: `availability-one-weekday.spec.ts` (the demo week, then Lunch closes earlier on Wednesday only) and the builder unit test.
- Evidence:
  ```
  [chromium] › e2e/availability-one-weekday.spec.ts:18:3 › Change one weekday of the regular week › Lunch closes earlier on Wednesday only   (in 158 passed)
  buildRegularWeekChanges test | Change regular week by weekday > a no-end change of one weekday's hours leaves the other six unchanged and names no schedule
  ```
  The spec asserts the other six weekdays equal their earlier text, the Schedules tab has count 0, and History reads "Changed regular week from <date>: Wed". It also observed the save upserts two schedules, both kind "regular" named "Regular week" (the new regular version and the end-dated superseded one); no schedule the Manager names, no assignment shown.
- Result: PASS

### PRD 5. Strip is live and honest

- Check: demo-week e2e (Friday's close moves the strip's Friday last slot before save, same URL, no preview request; Monday no dinner; strip equals the guest preview) and `RegularWeekStrip.test.tsx`.
- Evidence:
  ```
  RegularWeekStrip.test.tsx | moves Friday's last time as the close is edited, with no request but the tables read
  RegularWeekStrip.test.tsx | shows no dinner on Monday for the demo week
  RegularWeekStrip.test.tsx | shows the typed hours when the tables read fails, with Check again
  e2e demo week asserts (lines 117-148): Friday "Dinner 5:00 PM – 9:15 PM" -> "Dinner 5:00 PM – 11:15 PM"; Saturday likewise; Thursday unchanged;
    expect(page).toHaveURL(/\/availability$/); expect(watched).toEqual(GUEST_LINES); expect(asked).toEqual([]); expect(state.savedBody()).toBeNull()
  ```
  Screenshot, 1280x720 tall viewport: the strip reads "MONDAY ... Lunch 11:30 AM – 1:45 PM / Not offered: Dinner, Brunch", "FRIDAY ... Dinner 5:00 PM – 11:15 PM", "SATURDAY Brunch 10:00 AM – 1:15 PM / Dinner 5:00 PM – 11:15 PM", "SUNDAY ... Dinner 5:00 PM – 9:15 PM".
- Result: PASS

### PRD 6. Uniform week no slower

- Check: measured count of the uniform bistro week through the interaction wrapper (throwaway copy of the guards spec with the count printed) and `availability-quick-setup.spec.ts`.
- Evidence (local run, synthetic OIDC session; agent stand-in evidence only):
  ```
  COUNT bistro=5 baseline=5
  3 passed (14.6s)
  availability-quick-setup.spec.ts: 3 tests passed in the 158 (a Manager sets the bistro week from an empty venue ...; a service shorter than the lead seats at its opening ...; invalid input sends nothing ...)
  ```
- Result: PASS

### PRD 7. Varied week faster than today

- Check: same measured run, the demo week counted on one fixture through quick setup alone and through quick setup then the Schedules tab's New schedule.
- Evidence (agent stand-in evidence only; the Owner's human-timed walkthrough is not claimed):
  ```
  COUNT varied quickSetup=18 schedulesTabPath=26
  ```
  The spec also asserts both saves carry the same Dinner row (base Tue–Thu and Sun, a set on Fri–Sat).
- Result: PASS

### PRD 8. Large setup no slower

- Check: measured count of the four-service large fixture through the wrapper.
- Evidence (agent stand-in evidence only):
  ```
  COUNT large=13 baseline=13
  ```
  A guard (13 <= 13), not a re-timed 15-minute bar.
- Result: PASS

### PRD 9. Interactions keep working

- Check: History/Undo, Tonight and the agent's availability chat tools each have a test on a varied week; all run fresh in `services/reservations` and `services/agent`.
- Evidence:
  ```
  availability-config-api.test.ts | regular_week_changed detail and day scope on the wire parses an old History inverse (rows without the two fields) with no scope
  availability-changes.test.ts | availability history routes POST /changes/:changeId/revert reverts and returns the new version and the revert's change id
  tonight-command.test.ts | Tonight on a varied week judges a Host's pause against the weekday's own hours: Sunday's online-only Dinner is the close
  tonight-command.test.ts | Tonight on a varied week lets a Host pause online on the weekday that still takes phone bookings
  gen-agent-availability-tools.test.ts | availability chat tools change_tonight_availability on a varied week reads the same times on the day Brunch runs as that day's own hours
  services/reservations: Test Files 234 passed (234); Tests 3960 passed (3960)
  services/agent (@mbe/agent-service): Test Files 53 passed (53); Tests 1028 passed (1028)
  availability-tonight-decisions.spec.ts: 3 passed (in the 158)
  ```
- Result: PASS

### PRD 10. Copy in three locales

- Check: `pnpm check:i18n-catalogs` (the repo's key-parity check), the hospitality `locales.test.ts` (inside the 5230), and `availability-locale.spec.ts` in es-MX and fr-CA.
- Evidence:
  ```
  > node scripts/check-i18n-catalogs.mjs
  FAIL: i18n catalog parity — 2 issue(s) found:
    apps/hospitality/src/i18n/catalogs/es-MX.json — availabilitySchedules.regularWeek.closedDays_many: missing plural form
    apps/hospitality/src/i18n/catalogs/fr-CA.json — availabilitySchedules.regularWeek.closedDays_many: missing plural form
   ELIFECYCLE  Command failed with exit code 1.
  ```
  The key is this run's: `closedDays_one`/`closedDays_other` were added in commit 5004271e7 ("Change regular week edits services, days and different hours"; 0 occurrences of `closedDays` in `origin/main`'s en-US catalog). es-MX and fr-CA need a `_many` form for those locales' plural rules, as other keys there carry (for example es-MX `minutes_many`). Passing, for the record: `availability-locale.spec.ts` (the strip and a different-hours block read in es-MX; in fr-CA) and hospitality `locales.test.ts`. The breakdown's Locale parity sweep note ran a throwaway script instead of this check, so the miss was not seen.
- Result: FAIL

### PRD 11. No regression

- Check: every existing availability suite, fresh: engine incl. property tests, types, reservations on real Postgres, agent, the hospitality unit suite, all 14 `availability-*.spec.ts`, root lint and typecheck.
- Evidence:
  ```
  @mbe/availability   Test Files 20 passed (20)  Tests 339 passed (339)
  slots.property.test.ts (6 tests): never lists a slot outside the resolved day; never lists an available slot that judge rejects; never accepts an online start the listing does not offer; legacy configs agree with the pre-change functions (oracle)
  @mbe/types          Test Files 29 passed (29)  Tests 494 passed (494)
  @mbe/agent-service  Test Files 53 passed (53)  Tests 1028 passed (1028)
  apps/hospitality    <testsuites tests="5230" failures="0" errors="0">; 383 suites
  e2e availability-*.spec.ts (14 files, default workers=1)   158 passed (9.8m)
  ```
  Per-spec counts in that run: close 8, dead-ends 20, demo-week 1, draft 36, interaction-baselines 2, interaction-guards 3, locale 2, migrated-venue 2, one-weekday 1, phone 35, quick-setup 3, regular-week 31, step-two-refusals 11, tonight-decisions 3 (sum 158). A 15th spec the wrapper item names, `e2e/interaction-counter.spec.ts`, ran too: `3 passed (1.9s)`.
  The suite is green at the repo's default config. A flake appeared under parallel load (E9): the test passes alone and at default workers.
- Result: PASS (with the E9 flake finding recorded as FAIL below)

### PRD 12. Owner-only, never claimed by an agent: human-timed five-minute walkthrough

- Check: none run. The walkthrough is the Owner's post-release check; no stage claims it.
- Evidence: not run. The interaction counts (PRD 6 to 8) are agent stand-in counts of Playwright actions, not time, and not a person.
- Result: NOT RUN (Owner-only)

### PRD 13. The demo runs as written

- Check: the scripted e2e that follows the demo step by step (empty venue, Manager, lunch Mon–Fri, dinner Tue–Sun, later close Fri–Sat, strip beside the form, Monday no dinner, save).
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  [chromium] › e2e/availability-demo-week.spec.ts:63:3 › The demo week (PRD: the demo runs as written) › a Manager enters a varied week in quick setup, watches the strip, and the saved week reads the same everywhere
  158 passed (9.8m)
  ```
  I also looked at the real surface in screenshots (see E10): the strip sits to the right of the form at 1280x720 and Monday shows no dinner. No person followed the demo; this is the scripted-e2e route the criterion allows.
- Result: PASS

### E1. Engine: day scope, validation, encode/decode, projection, week spans, property tests (Milestone 1)

- Check: `pnpm --filter @mbe/availability test`, `pnpm --filter @mbe/types test`.
- Evidence:
  ```
  @mbe/availability: Test Files 20 passed (20)  Tests 339 passed (339)
  @mbe/types:        Test Files 29 passed (29)  Tests 494 passed (494)
  service-days.test.ts | encodeWeek and decodeWeek round-trips: decodeWeek(encodeWeek(w, days), days) equals w, and re-encoding returns identical rows
  service-days.test.ts | encodeWeek and decodeWeek encodes the demo week to one row per service with the later close as one set
  validate-config.test.ts | validateConfig per weekday reports a weekday in two sets as weekday_clash at the later set
  legacy-projection.test.ts | projectLegacyOperatingHours with day scope projects the demo week per weekday: Monday has no dinner window
  week-spans.test.ts | weekSpans gives noTableFits, not a missing service, when no active table fits the party
  availability-config.test.ts | ScheduleServiceSchema day scope rejects a dayHours version other than 1
  ```
- Result: PASS

### E2. Prisma migration add_schedule_service_day_scope

- Check: `node scripts/check-destructive-migrations.js`; `prisma migrate deploy` on the fresh container; the columns; `rls-force-coverage`; `prisma-enum-drift.mjs`; the unique constraint.
- Evidence:
  ```
  Checking 1 new migration file(s) for destructive operations...
  PASS: No unapproved destructive migrations found.      (exit 0)
  44 migrations found in prisma/migrations ... All migrations have been successfully applied.   (fresh database; second deploy: "No pending migrations to apply.")
  select count(*) from _prisma_migrations -> 44
  schedule_services: weekdays | integer[] | ARRAY[]::integer[] ; day_hours | jsonb | not null | '{"sets": [], "version": 1}'::jsonb
  migration.sql: ALTER TABLE "schedule_services" ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[], ADD COLUMN "day_hours" JSONB NOT NULL DEFAULT '{"version":1,"sets":[]}';
  rls-force-coverage.test.ts: 22 tests passed (in the reservations run)
  node scripts/prisma-enum-drift.mjs: exit 0, no output
  schema.prisma:626:  @@unique([scheduleId, venueServiceId])
  ```
- Result: PASS

### E3. Reservations store, save path, audit detail and the Postgres integration tests (Milestone 2)

- Check: the full `services/reservations` suite against the fresh Postgres, with `DATABASE_URL` set, JSON reporter, then `scripts/assert-vitest-ran.mjs`.
- Evidence:
  ```
   Test Files  234 passed (234)
        Tests  3960 passed (3960)
  JSON report written to /tmp/acu-e2e/res-results.json
  Suites ran for real: 3960/3960 tests passed, 0 skipped.
  19 *integration* files in the report, 286 tests: 286 passed, 0 not passed; total pending 0, failed 0, todo 0.
  availability-day-scope.integration.test.ts: reads a row inserted without the two columns as no scope; writes a varied week through the store and reads it back byte-equal
  rls-route-sweep.integration.test.ts: 144 tests; rls-isolation 20; rls-owner-enforcement 7; collapse-day-named-schedules.integration 1
  ```
  Integration tests ran for real: 286 ran, 0 skipped.
- Result: PASS

### E4. Legacy migration emits one regular week; collapse function and script (Milestone 3)

- Check: the same reservations and engine suites (golden migration oracle, backfill, collapse unit and integration).
- Evidence:
  ```
  availability-migration.golden.test.ts (22 golden tests passed): legacy -> availability rows: slots are identical before and after seed: The Grand Bistro in America/New_York from 2026-03-02 ...
  backfill-availability.test.ts | runBackfill backfills a venue whose days differ as one regular schedule with day sets
  day-named-schedules.test.ts | collapseDayNamedSchedules (property) never changes what any weekday resolves to
  collapse-day-named-schedules.integration.test.ts | (real Postgres) keeps every weekday's hours, archives the folded schedule and stays carried over
  ```
  The collapse script was exercised only against the mocked client and the throwaway database; an apply on a real database is an Owner step (see Not verified).
- Result: PASS

### E5. Quick-setup draft, form, strip in quick setup and wizard, guest-facing lines (Milestone 4, unit level)

- Check: the full `apps/hospitality` unit suite (`pnpm exec vitest run`, junit report).
- Evidence:
  ```
  <testsuites name="vitest tests" tests="5230" failures="0" errors="0">; 383 <testsuite> elements; 0 suites with skipped>0
  quick-setup-draft.test.ts | writes a uniform draft as the rows it always wrote: no scope, no sets
  quick-setup-draft.test.ts | projects a varied week to each weekday's earliest open and latest close
  QuickSetupForm.test.tsx | different hours on some days > puts a later close on Friday and Saturday into one set of the draft
  QuickSetupHoursStep.test.tsx | sends each weekday's earliest open to latest close for a varied week
  AvailabilityCalendar.test.tsx | prints the first and last time a guest can book, not the close
  AvailabilityGuestPreview.test.tsx | prints the first and last time a guest can book, not the close
  ```
- Result: PASS

### E6. Change regular week, day drawer scope and nudge, Schedules tab, New/Edit schedule rows, Compare, History line, migrated test (Milestone 5, unit level)

- Check: the same hospitality suite.
- Evidence:
  ```
  ChangeRegularWeekDrawer.test.tsx | on a varied week > the Applies to line and the impact count follow the days the services run
  AvailabilityDayEditor.test.tsx | every regular Friday: changes that weekday of the regular week in place
  AvailabilityScheduleControls.test.tsx | Schedules tab > lists a schedule saved before this change with kind alternate
  ScheduleEditorDrawer.varied.test.tsx | saves one service Mon–Fri with different Friday hours, and Edit schedule reopens the same rows
  CompareServices.varied.test.tsx | marks a scoped row with its base hours and + different hours, and the link opens Edit schedule
  AvailabilityHistoryDrawer.test.tsx | words a Friday-only regular-week change with Fri and the start date, and shows the summary of an unknown code
  regular-week-line.test.ts | says Dinner closes later on Fri and Sat
  AvailabilityMigrationBanner.test.tsx | tells a migrated venue its hours were carried over and nothing changed for guests
  availability-dead-ends.spec.ts: 20 passed (the "Choose a start date to save." case is in it)
  ```
- Result: PASS

### E7. Interaction counter wrapper (Milestone 1)

- Check: `e2e/interaction-counter.spec.ts` through the harness.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  [1/3] interaction counter › a click, a fill, a check, an uncheck and a press each count 1
  [2/3] interaction counter › a combobox opened then chosen counts 2
  [3/3] interaction counter › goto, expect and waitFor count 0
    3 passed (1.9s)
  ```
- Result: PASS

### E8. Install, lint, typecheck

- Check: `pnpm install --frozen-lockfile`; `pnpm lint --force`; `pnpm typecheck --force` (node v22.22.3).
- Evidence:
  ```
  Done in 3.1s     (pnpm install --frozen-lockfile; the shell's `echo EXIT=$?` printed the exit of the following `tail`, so the install's own exit code was not captured; the lockfile was accepted and the postinstall prisma generate ran)
  pnpm typecheck --force:   Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   (exit 0)
  pnpm lint --force:        Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   (exit 0)
    @mbe/hospitality:lint: ✖ 232 problems (0 errors, 232 warnings)
    @mattbutlerengineering/rialto:lint: ✖ 182 problems (0 errors, 182 warnings); @mbe/gen 108; @mbe/rialto-web 165; @mbe/auth 2 (all 0 errors)
  ```
  Lint is green with warnings only. Whether those 232 hospitality warnings predate this run was not examined.
- Result: PASS

### E9. Flake check: "Escape on Go to date puts focus back on the menu button (desktop, en-US)" in `availability-regular-week.spec.ts`

- Check: that spec at the default worker count; the same spec at `--workers=4`; the test with `--repeat-each=3 --retries=0`; then all 14 availability specs at `--workers=4 --retries=0`.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  availability-regular-week.spec.ts, default workers:             31 passed (2.2m)
  availability-regular-week.spec.ts, --workers=4 (one file, so one worker in practice): 31 passed (2.2m)
  -g "Escape on Go to date" --repeat-each=3 --retries=0:          12 passed (42.3s)
  all 14 availability-*.spec.ts, --workers=4 --retries=0:
    1 failed
      [chromium] › e2e/availability-regular-week.spec.ts:366:5 › navigation and day-drawer controls (#7981) › Escape on Go to date puts focus back on the menu button (desktop, en-US)
    157 passed (3.5m)
    Error: expect(locator).toBeHidden() failed
    Locator:  getByRole('dialog', { name: 'Go to date' })
    Expected: hidden   Received: visible   Timeout: 5000ms
    > 382 |       await expect(dialog).toBeHidden();      (after `keyboard.press("Escape")` at line 381)
  ```
  The flake reproduces under parallel load, so it is recorded as a finding, not a pass. Neither `GoToDateDialog.tsx` nor `AvailabilityToolbar.tsx` differs from `origin/main`, and the test's own body is unchanged by this run; the likely cause (the Escape keypress landing before the dialog's key handler is attached) is [INFERENCE], not confirmed. Whether it also flakes on `origin/main` was not run.
- Result: FAIL (flaky under parallel load)

### E10. Visual check of the real surface

- Check: Playwright screenshots through the same harness session and mocked API, saved to `/tmp/acu-e2e/shots/` (outside the repo), at 1280x720 and 375x812; I opened and looked at each of these: quick setup with the demo week and the strip (`1280x720-01`, `-15`, `-16-demo-tall`, `375x812-13`, `-15`, `-16`), a different-hours block (`1280x720-03`, `375x812-03`), Change regular week editing Wednesday (`1280x720-21`, `-22`, `375x812-20`, `-21`), the calendar's regular-week line (`1280x720-06`, `-23`, `375x812-06`, `-23`).
- Evidence (text read off the screenshots, then what I saw):
  ```
  /tmp/acu-e2e/shots/: 40 PNG files (20 per viewport, 1280x720-NN-*.png and 375x812-NN-*.png); throwaway specs deleted, git status --porcelain empty
  strip  MONDAY    "Lunch 11:30 AM – 1:45 PM" / "Not offered: Dinner, Brunch"
  strip  FRIDAY    "Lunch 11:30 AM – 1:45 PM" / "Dinner 5:00 PM – 11:15 PM" / "Not offered: Brunch"
  strip  SATURDAY  "Brunch 10:00 AM – 1:15 PM" / "Dinner 5:00 PM – 11:15 PM" / "Not offered: Lunch"
  strip  SUNDAY    "Brunch 10:00 AM – 1:15 PM" / "Dinner 5:00 PM – 9:15 PM"
  block  "Dinner: different hours"  Fri, Sat ticked; Opens 5:00 PM; Last seating 11:15 PM; Closes 12:00 AM; "Closes 12:00 AM the next day"
  drawer "Change regular week"  "Lunch: different hours", Wed ticked, Closes 1:00 PM; footer "Choose a start date to save." then "Save hours from Nov 4"
  line   "Regular week: Lunch Mon–Fri · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun"
  line   (after the Wednesday change) "Regular week: Lunch Mon–Fri, earlier Wed · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun"
  ```
  What I saw:
  - Quick setup, 1280x720: the form fills the left column and the "Guest preview" strip (party select, then one block per weekday, Monday first) sits on the right at the same height as the form. Monday reads "Lunch 11:30 AM – 1:45 PM / Not offered: Dinner, Brunch"; Friday and Saturday dinner end "11:15 PM", Thursday and Sunday "9:15 PM". Rows are legible, with no clipped or overlapping text. The strip is about 1,125 px tall, so at 720 px only about Monday to Tuesday show without scrolling; with a 1500 px tall viewport all seven days show.
  - Quick setup, 375x812: one column, the strip below the form (as designed); rows legible at 375 px and nothing runs off the card; Saturday and Sunday are further down.
  - Different-hours block ("Dinner: different hours"): Tue to Sun checkboxes with Fri and Sat ticked, Opens 5:00 PM, Last seating 11:15 PM, Closes 12:00 AM, "Closes 12:00 AM the next day", "Remove these hours". Fits at both widths; the weekday checkboxes wrap to two rows at 375 px.
  - Change regular week, Wednesday: block "Lunch: different hours" with Wed ticked and Closes 1:00 PM; the footer reads "Choose a start date to save." until a start is picked, then "Save hours from Nov 4". After saving, the calendar line reads "Regular week: Lunch Mon–Fri, earlier Wed · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun" and Wednesday's cell shows "Lunch 11:30 AM–12:15 PM".
  - Calendar line, before the change: "Regular week: Lunch Mon–Fri · Dinner Tue–Sun, later Fri–Sat · Brunch Sat–Sun" with a Details disclosure listing each weekday ("MONDAY Lunch 11:30 AM – 1:45 PM", "SATURDAY Brunch 10:00 AM – 1:15 PM · Dinner 5:00 PM – 11:15 PM"). No per-day schedule or assignment is listed.
  - Observations, none blocking a criterion:
    - O1. "Different days for this service", "Different hours on some days", "Use the shared days" and "Remove service N" render as small low-contrast text with no border; they read as captions, not buttons. When a service has its own days, "Different days for this service" and "Use the shared days" are both visible, stacked, with a large gap between them.
    - O2. The "Ending" field's placeholder "No end — this becomes" is cut at the field edge (no ellipsis) in the Change regular week drawer at 375 px and at 1280 px; the full wording appears in the line under it ("No end — this becomes the new regular week").
    - O3. At 375 px in the calendar's Details table the Monday row's short value sits to the right of its label while every other weekday's value wraps below its label; the rows do not align.
    - O4. The "Bookings are open ..." and "Regular week changed from Nov 4" toasts overlap the header (and the drawer title if the drawer is opened while the toast shows); transient.
    - O5. In the month grid, Monday cells (one service) show no count line and other days show "2 services". `day-summary.ts` shows a count only from 2 services (its comment: "or `null` when the count is not worth showing"), so this is by design, not a defect.
  - Could not check: a screen reader or keyboard pass on the real surface; pixel-level contrast measurement; dark mode; a venue with many services (long strip) or with tables loaded (party check against real tables); the strip's "Updated" tag animation and the `prefers-reduced-motion` path; the Safari and Firefox engines (Chromium only); screenshots caught the popovers mid-fade in the first capture, so I re-took the Change regular week shots after waiting. Full-page screenshots do not capture the app's inner scroller, so the strip was captured with a tall viewport instead.
- Result: PASS (observations O1 to O4 listed under Failures as non-blocking findings for Review)

### E11. Real Auth0 `auth.setup.ts` e2e login

- Check: none run locally: E2E_AUTH0_* creds exist only in CI.
- Evidence: not run. All e2e evidence above used the synthetic OIDC session, which skips `auth.setup.ts` entirely, so the real login path is a limitation of this verification, not a pass.
- Result: NOT RUN (CI-only)

## Failures

1. **PRD "Copy in three locales" fails** (routes to Implement). Add `availabilitySchedules.regularWeek.closedDays_many` to `apps/hospitality/src/i18n/catalogs/es-MX.json` and `fr-CA.json` (translated, in the style of the other `_many` keys such as es-MX `minutes_many`), then re-run `pnpm check:i18n-catalogs` until it prints PASS. Evidence is the `FAIL: i18n catalog parity — 2 issue(s) found` output above. Also a lesson for the next PRD and breakdown: the criterion named "the locale-parity check", the breakdown pointed it at `locales.test.ts`, which does not compare catalogs; point it at `pnpm check:i18n-catalogs`.
2. **E9 flake** (routes to Implement): `Escape on Go to date puts focus back on the menu button (desktop, en-US)` in `availability-regular-week.spec.ts` failed once under `--workers=4 --retries=0` (`expect(dialog).toBeHidden()` at line 382, dialog still visible after 5000 ms) and passed alone, at default workers, and 12 of 12 under `--repeat-each=3 --retries=0`. The dialog and its test body are not changed by this run, so it may predate it; that was not checked. Needs an owner decision: fix the test or the dialog's Escape wiring, or accept the flake knowingly.
3. **Non-blocking visual observations** (for Review; no criterion fails on them): O1 low-affordance ghost buttons and the stacked "Different days for this service" / "Use the shared days" pair; O2 clipped "Ending" placeholder; O3 the Monday row misalignment in the phone Details table; O4 toast overlapping the header and the drawer title.

## Not verified

- **Owner-only human-timed five-minute walkthrough** (PRD criterion 12): not run, by design.
- **Real Auth0 e2e login (`auth.setup.ts`)**: CI-only; not run (E11).
- **A full-stack browser run**: every e2e used mocked API responses; the calendar, day drawer and guest preview in the demo e2e come from `engine-days-mock.ts` running the same pure engine as the service, so PRD 2's e2e leg is not independent of the engine. The service's own builders were exercised by the reservations suite, not by a browser against the real service and database.
- **CI-only jobs**: the CI Migration Dry-Run job (postgres:16-alpine; this run used postgres:15), the Docker build of `services/agent` (the breakdown notes its Dockerfile changed), the visual-regression workflows (`apps-visual`, `rialto-visual`), Lighthouse, mutation testing and the e2e screenshots workflow. None was run here.
- **Collapse script apply on a real database**: the Owner's step; only the mocked-client unit tests and the throwaway Postgres were used.
- **Whether the 232 hospitality lint warnings predate this run**, and whether the "Escape on Go to date" flake exists on `origin/main`: not examined.
- **Accessibility, dark mode, other browsers, many-service strips and tables-loaded party checks** on the real surface (see E10).
- **Interaction counts** are counts of Playwright actions on one fixture (agent stand-in evidence), not human time; the PRD 12 walkthrough is the only time-based criterion and it was not run.
