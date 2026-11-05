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
  - "Re-verify (2026-11-04, targeted): this file is the b46a22fcd full pass plus a re-verify of the CI fix diff at HEAD 004c8881a (13 files from origin/feat/availability-config-usability..HEAD: `ResolvedService` moved to `packages/availability/src/types.ts`, `toClock` un-exported in `quick-setup-draft.ts`, two integration suites added to ci.yml's RLS list, hospitality size-limit budgets, regenerated llms files, breakdown.md). Each criterion carries a `Re-verify basis` line saying whether its evidence is fresh at HEAD or carried from the full pass (b46a22fcd, rebased 775762bab). Sections written by the earlier pass (the assumptions above, the criterion bodies) keep their original wording and numbers; where they say `284 passed` or cite b46a22fcd they describe that earlier pass."
  - "Re-verify environment: node v22.22.3; a new throwaway container `acu-pg-test` (postgres:15, host port 55439, CI's `rls_owner`/`rls_scratch` recipe, `db:migrate:deploy` as rls_owner) removed with `docker rm -f acu-pg-test` (`docker ps -a` lists none of that name afterwards). Nothing was listening on :3002 before the e2e run (`lsof -i :3002` printed nothing). The e2e run used the same synthetic-OIDC harness /tmp/acu-e2e/run-e2e.sh at default workers (1); its evidence is labelled local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). `e2e/locale-sweep.spec.ts` was not in the re-verify's list and was not re-run, so the earlier 284 (14 availability specs plus locale-sweep) is now 158 (14 availability specs)."
  - "Re-verify drift lane: `pnpm regen` then `pnpm regen --check --git-only` (CI's two steps), then `pack <dir> --check` for each of the 22 `git ls-files '*llms.txt'` directories passed as repo-relative paths. The CLI prints the resolved absolute path in its `is in sync` line; the directory argument was relative."
  - "E11 is split by head: PASS on PR #8237's CI for the pre-fix head 7b5e1d375 (the head CI ran; `gh run view 41837794423` headSha), NOT RUN for HEAD 004c8881a until Ship pushes it and CI runs. In the Summary count it is a NOT RUN, because the head under verification is 004c8881a. E13 is PASS only for the local replication; GitHub's own CI run on the pushed head is NOT RUN here."
  - "Visual Regression (hospitality) on PR #8237 failed on `availability@1280x720.png` and `availability@375x812.png` `toHaveScreenshot` (read from `gh run view 41837794354 --job 126601665997 --log-failed`). `apps-visual.yml` says `Advisory: no ci.yml job needs this workflow, so it never moves CI Gate`. This run did not regenerate baselines and did not examine the image diff; regenerating them is an Owner `workflow_dispatch` of `visual-noise-floor.yml` with `app: hospitality`."
---

# Verification: One regular week that can differ by day

## Summary

Targeted re-verify at HEAD 004c8881a (the CI fix diff) on top of the full pass at b46a22fcd (rebased 775762bab). 40 criteria (39 from the full pass plus the new **E13**): **38 PASS, 2 NOT RUN, 0 FAIL**, one known pre-existing open risk, and one open item that is not this run's to close. This is not an unqualified pass.

- **NOT RUN (2):**
  - **PRD 12**, the Owner-only human-timed five-minute walkthrough (an Owner post-release check, never claimed by an agent).
  - **E11**, the real Auth0 `auth.setup.ts` e2e login, **at the new head 004c8881a**. It is PASS on PR #8237's CI for the PRE-fix head 7b5e1d375 (`Hospitality E2E (shard 1)`, `(shard 2)` and `(shard 3)` all `pass`, run 41837794423), but that run did not include the CI fix commits, so for 004c8881a it is NOT RUN until Ship pushes and CI runs.
- **Also NOT RUN inside a PASS:** **E13**'s confirmation by GitHub's own CI. E13 is PASS only as a local replication of Build, Lint and Test (rest); the real jobs on the pushed head are NOT RUN here and are confirmed only at Ship.
- **Open item, not a FAIL of this run (Owner step): Visual Regression (hospitality) baselines.** PR #8237's `Visual Regression (hospitality)` job failed on `availability@1280x720.png` and `availability@375x812.png`. It is advisory (`apps-visual.yml`: "no ci.yml job needs this workflow, so it never moves CI Gate"). Its baselines must be regenerated by a `workflow_dispatch` of `visual-noise-floor.yml` with `app: hospitality`, which this run may not take. I did not examine the image diff, and the new baselines are not verified.
- **Known pre-existing open risk (not a FAIL of this run, not a pass of the test):** the e2e `Escape on Go to date puts focus back on the menu button` still fails intermittently under `--workers=4 --retries=0` (earlier pass at b46a22fcd: 59 passed, 1 failed of 60; fix loop: this branch 59/60, origin/main 58/60). It was not re-run at 004c8881a; the default-workers e2e at 004c8881a had 0 failures of 158. Its cause is unknown and unfixed. E9 is a PASS only for "did this run introduce it?" and is carried from the full pass.
- **Unknown (not examined):** the real CI jobs on the pushed head, Migration Dry-Run on postgres:16-alpine, the `services/agent` Docker build, Lighthouse, mutation testing, a full-stack browser run against the real service (every e2e mocks the API), an Owner apply of the collapse script on a real database, the es-MX and fr-CA wording of `closedDays_many` beyond key parity, a screen-reader or keyboard pass, dark mode, browsers other than Chromium, and `e2e/locale-sweep.spec.ts` at 004c8881a (not re-run).
- **Evidence basis:** criteria whose path the CI fix diff touched (the `@mbe/availability` type move, quick setup) cite fresh runs at 004c8881a; the others rest on output from the full pass at b46a22fcd (rebased 775762bab), marked per criterion. Every e2e line is a local run, synthetic OIDC session (auth.setup.ts skipped; no Auth0 E2E creds locally). The interaction counts are agent stand-in evidence (counts of Playwright actions), not human time.

## Re-verification at HEAD 004c8881a (CI fix diff)

Fresh runs by this stage, all in the worktree on branch feat/availability-config-usability, HEAD `004c8881a4f44405e4da61e768c20dc5169a21d7`, porcelain empty before and after. Output below is quoted from those runs.

```
$ pnpm check:boundaries
✔ no dependency violations found (4453 modules, 11911 dependencies cruised)        EXIT=0
$ pnpm check:knip
Configuration hints (123) ... (hints only; no `Unused exports` section)               EXIT=0
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/assert-vitest-ran.test.mjs
 ✓ scripts/__tests__/assert-vitest-ran.test.mjs (12 tests) 14ms
 Test Files  1 passed (1) / Tests  12 passed (12)
$ pnpm size:check
 Tasks:    32 successful, 32 total / Cached:    0 cached, 32 total                  EXIT=0
   Quick-setup draft + legacy-hours reader ...  Size limit: 8 kB   Size: 4.37 kB brotlied
   Copilot context + catalog registry ...       Size limit: 11.3 kB Size: 11.23 kB brotlied
$ pnpm --filter @mbe/availability test        Test Files  20 passed (20) / Tests  340 passed (340)   EXIT=0
$ pnpm --filter @mbe/availability typecheck   (tsc --noEmit -p tsconfig.test.json)                    EXIT=0
$ pnpm --filter @mbe/availability build       (tsc)                                                   EXIT=0
$ pnpm --filter @mbe/hospitality test         Test Files  383 passed (383) / Tests  5238 passed (5238)   EXIT=0
$ pnpm --filter @mbe/types test               Test Files  29 passed (29) / Tests  494 passed (494)
$ pnpm --filter @mbe/agent-service test       Test Files  53 passed (53) / Tests  1028 passed (1028)
$ pnpm check:i18n-catalogs                    PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
$ pnpm install --frozen-lockfile              services/reservations postinstall: ✔ Generated Prisma Client (v7.10.1) ...   Done in 3.1s   INSTALL_EXIT=0
$ pnpm typecheck --force                      Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   EXIT=0
$ pnpm lint --force                           Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total   EXIT=0
    @mbe/hospitality:lint: ✖ 230 problems (0 errors, 230 warnings); rialto 182; @mbe/gen 108; @mbe/rialto-web 165; @mbe/auth 2 (all 0 errors)
$ DATABASE_URL=postgresql://rls_owner:...@localhost:55439/rls_scratch pnpm --filter @mbe/reservations-service db:migrate:deploy
    All migrations have been successfully applied.
$ (services/reservations) vitest run --reporter=default --reporter=json --outputFile.json=/tmp/acu-e2e/res-ci.json
 Test Files  234 passed (234) / Tests  3965 passed (3965)
$ node scripts/assert-vitest-ran.mjs /tmp/acu-e2e/res-ci.json
Suites ran for real: 3965/3965 tests passed, 0 skipped.                                    EXIT=0
  from the JSON report: 19 integration files, {"passed":286}, total 3965, pending 0, failed 0   (ran 286, skipped 0; includes the two files the fix added to ci.yml's RLS list: availability-day-scope 2 tests and collapse-day-named-schedules.integration 1 test)
$ pnpm regen                                  Done. All artifacts regenerated.             REGEN=0
$ pnpm regen --check --git-only               All generated artifacts are up to date.      CHECK=0      (git status --porcelain empty afterwards)
$ pack <dir> --check, 22 llms.txt directories, relative paths      22 of 22 in sync (each line "... llms.txt is in sync."), porcelain empty afterwards
$ run-e2e.sh <the 14 e2e/availability-*.spec.ts>      (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally; default workers 1; :3002 free before)
  158 passed (9.9m)     EXIT=0
```

Notes on that output: the e2e run printed `[WebServer] http proxy error ... AggregateError [ECONNREFUSED]` lines for `/api/v1/venues/...` requests (the dev server's proxy to a service that is not running; every spec mocks the API). They did not fail a test, and I did not examine which requests they were. The `knip` output carries 123 configuration hints; its exit code is 0 and it lists no unused exports.

Reading against the CI fix loop's four items (breakdown.md `## CI fix loop`): Build `no-circular` and the size budgets (`check:boundaries`, `size:check`, `@mbe/availability` test/typecheck/build), Lint knip (`check:knip`, root `lint --force`), Test (rest) `assert-vitest-ran` (the vitest guard test, plus the reservations run in which both gated integration files ran for real).

## Criteria & evidence

### PRD 1. Varied week in quick setup

- Re-verify basis: CI fix diff touched this path (quick setup, `toClock` un-export). Fresh at HEAD 004c8881a: `e2e/availability-demo-week.spec.ts` is inside the 158 passed, and the hospitality suite passed 383 files / 5238 tests. The `284 passed` below is from the full pass at b46a22fcd (rebased 775762bab).
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

- Re-verify basis: CI fix diff touched this path (the `ResolvedService` type move in `@mbe/availability`). Fresh at HEAD 004c8881a: `@mbe/availability` Test Files 20 passed (20) / Tests 340 passed (340); `build` and `typecheck` exit 0; the 14 availability e2e specs 158 passed. Quoted output below is from the full pass (same counts).
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

- Re-verify basis: hospitality code is shared with the CI fix diff (quick setup). Fresh at HEAD 004c8881a: `@mbe/hospitality` 383 files / 5238 tests passed, and `availability-migrated-venue.spec.ts` is inside the 158 passed e2e. The quoted output is from the full pass, with the same counts.
- Re-verify basis (PRD 3 continued): the migrated-venue path itself (collapse, regular-week reading) is unaffected by the CI fix diff.
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

- Re-verify basis: shares the hospitality path the CI fix diff touched. Fresh at HEAD 004c8881a: `availability-one-weekday.spec.ts` is inside the 158 passed and the hospitality suite is 5238/5238. Quoted output is from the full pass.
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

- Re-verify basis: shares the quick-setup path the CI fix diff touched. Fresh at HEAD 004c8881a: hospitality 5238/5238 (includes `RegularWeekStrip.test.tsx`) and `availability-demo-week.spec.ts` inside the 158 passed. The strip text below was read from the browser in the full pass (E10) and was not re-read at 004c8881a.
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

- Re-verify basis: quick setup is on the CI fix diff's path. Fresh at HEAD 004c8881a: `availability-interaction-guards.spec.ts` and `availability-quick-setup.spec.ts` are inside the 158 passed, so the guard's assertion (count within the bound) held; the `COUNT` lines below were not re-printed at 004c8881a (they come from the full pass's throwaway console.log copy).
- Check: the guard spec counted by a throwaway copy with a console.log (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally); `availability-quick-setup.spec.ts` ran inside the 284.
- Evidence:
  ```
  COUNT uniform bistro = 5 bound 5        (UNIFORM_BISTRO_BASELINE = 5; assertion toBeLessThanOrEqual)
  6 passed (27.7s)      (the throwaway copy plus the committed guard spec, 3 tests each)
  ```
  Agent stand-in evidence: the count is Playwright actions, not human time.
- Result: PASS

### PRD 7. Varied week faster than today

- Re-verify basis: same as PRD 6. Fresh: the guard spec passed at 004c8881a (inside the 158). The `COUNT demo quick-setup=18 via-schedules=26` line is from the full pass.
- Check: same run; quick setup alone against quick setup plus the Schedules tab's New schedule, one wrapper, one spec.
- Evidence:
  ```
  COUNT demo quick-setup=18 via-schedules=26 bound=26      (18 < 26)
  ```
  Agent stand-in evidence only (stated in the spec header).
- Result: PASS

### PRD 8. Large setup no slower

- Re-verify basis: same as PRD 6. Fresh: the guard spec passed at 004c8881a (inside the 158). The `COUNT large multi-service = 13` line is from the full pass.
- Check: same run, the four-service large fixture.
- Evidence:
  ```
  COUNT large multi-service = 13 bound 13      (LARGE_SETUP_BASELINE = 13; toBeLessThanOrEqual)
  ```
  A guard, not a re-timed 15-minute bar.
- Result: PASS

### PRD 9. Interactions keep working

- Re-verify basis: `services/agent` and `services/reservations` import `@mbe/availability`, whose types the CI fix diff moved. Fresh at HEAD 004c8881a: `@mbe/agent-service` Test Files 53 passed (53) / Tests 1028 passed (1028); reservations 234 files / 3965 tests passed; `availability-tonight-decisions.spec.ts` inside the 158 passed. Quoted named tests are from the full pass.
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

- Re-verify basis: locale catalogs are untouched by the CI fix diff. Fresh at HEAD 004c8881a: `pnpm check:i18n-catalogs` prints `PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.`; `availability-locale.spec.ts` is inside the 158 passed. `locale-sweep.spec.ts` was not re-run at 004c8881a: its evidence is from the full pass (b46a22fcd, rebased 775762bab), code unaffected by the CI fix diff.
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

- Re-verify basis: CI fix diff touched this path. Fresh at HEAD 004c8881a: `@mbe/types` 29 files / 494 tests, `@mbe/availability` 20 / 340, `@mbe/agent-service` 53 / 1028, `@mbe/hospitality` 383 / 5238, reservations (fresh Postgres 15, DATABASE_URL set) 234 / 3965 with `Suites ran for real: 3965/3965 tests passed, 0 skipped.` and 19 integration files, 286 ran and passed, 0 skipped; the 14 availability e2e specs 158 passed (default workers). The property-test names and the `284 passed` line below are from the full pass.
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

- Re-verify basis: not run at b46a22fcd and not run now.

- Check: none run. It is an Owner post-release check; no stage claims it.
- Evidence: not run.
- Result: NOT RUN (Owner-only, by design)

### PRD 13. The demo runs as written

- Re-verify basis: shares the quick-setup path the CI fix diff touched. Fresh at HEAD 004c8881a: `availability-demo-week.spec.ts` inside the 158 passed (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally). The strip text below is from the full pass.

- Check: `availability-demo-week.spec.ts` follows the PRD's demo step by step; the strip read at HEAD in the visual check (E10).
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  284 passed (14.1m)      (e2e/availability-demo-week.spec.ts:63 in it)
  strip after the demo week was entered: Monday "Lunch 11:30 AM – 1:45 PM / Not offered: Dinner, Brunch"; Friday and Saturday dinner "5:00 PM – 11:15 PM"; Thursday and Sunday dinner "5:00 PM – 9:15 PM"
  ```
  A scripted e2e on mocked API responses, not a person.
- Result: PASS

### E1. Engine: day scope, validation, encode/decode, projection, week spans, property tests (Milestone 1)

- Re-verify basis: CI fix diff touched this path (`ResolvedService` moved to `packages/availability/src/types.ts`; `resolve-day.ts`, `service-days.ts`, `slots.ts`, `index.ts`). Fresh at HEAD 004c8881a: `@mbe/types` Test Files 29 passed (29) / Tests 494 passed (494); `@mbe/availability` Test Files 20 passed (20) / Tests 340 passed (340); `@mbe/availability` typecheck and build exit 0. Named tests below are from the full pass.

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

- Re-verify basis: migration and schema untouched by the CI fix diff; evidence is from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. Additionally at HEAD 004c8881a: `db:migrate:deploy` as rls_owner on the fresh container printed `All migrations have been successfully applied.` including `20261103120000_add_schedule_service_day_scope`.

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

- Re-verify basis: the CI fix diff touched this path only through the `@mbe/availability` type move and the RLS-list addition in ci.yml. Fresh at HEAD 004c8881a: full `services/reservations` suite on a fresh Postgres 15: Test Files 234 passed (234) / Tests 3965 passed (3965); `Suites ran for real: 3965/3965 tests passed, 0 skipped.`; 19 integration files, 286 ran and passed, 0 skipped, including `availability-day-scope.integration.test.ts` (2) and `collapse-day-named-schedules.integration.test.ts` (1), the two files the fix added to ci.yml's RLS list.

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The fresh reservations run at HEAD 004c8881a (234 files / 3965 tests, 0 skipped, collapse integration 1 passed) also contains these tests.

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

- Re-verify basis: CI fix diff touched this path (`toClock` un-exported in `quick-setup-draft.ts`). Fresh at HEAD 004c8881a: `@mbe/hospitality` Test Files 383 passed (383) / Tests 5238 passed (5238); `pnpm check:knip` exit 0. Named tests below are from the full pass.

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

- Re-verify basis: same hospitality suite and e2e as E5, fresh at HEAD 004c8881a (383 files / 5238 tests; `availability-dead-ends`, `availability-draft`, `availability-regular-week`, `availability-phone` specs inside the 158 passed). The code of these drawers is unaffected by the CI fix diff; quoted names and the `284 passed` line are from the full pass at b46a22fcd (rebased 775762bab).

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

- Re-verify basis: fresh at HEAD 004c8881a: `availability-interaction-baselines.spec.ts` and `availability-interaction-guards.spec.ts` are inside the 158 passed (0 failed). The `COUNT` lines below are from the full pass.

- Check: `e2e/availability-interaction-baselines.spec.ts` in the 284 run (the wrapper's own tests), and the guard run above.
- Evidence (local run, synthetic OIDC session; auth.setup.ts skipped; no Auth0 E2E creds locally):
  ```
  284 passed (14.1m)      (availability-interaction-baselines.spec.ts in it; 0 failed)
  COUNT uniform bistro = 5 bound 5 / COUNT large = 13 bound 13 / quick-setup=18 via-schedules=26
  ```
  Not run on its own, so the three wrapper-test names are not quoted.
- Result: PASS

### E8. Install, lint, typecheck

- Re-verify basis: fresh at HEAD 004c8881a, re-run by this stage: `pnpm install --frozen-lockfile` exit 0 (`Done in 3.1s`); `pnpm typecheck --force` `Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total`; `pnpm lint --force` `Tasks: 45 successful, 45 total / Cached: 0 cached, 45 total`, 0 errors, hospitality 230 warnings, rialto 182, gen 108, rialto-web 165, auth 2. These match the counts quoted below, so the later fix commits did not change them.

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff (`GoToDateDialog.tsx`, `AvailabilityToolbar.tsx` and the test are not among the 13 files). The `--workers=4 --retries=0` repeat run was NOT re-run at 004c8881a; the default-workers run of `availability-regular-week.spec.ts` inside the 158 had 0 failures.

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff in rendered output (the diff is a type move, an un-export, budgets, CI config and generated docs). The screenshots were not retaken at 004c8881a.

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

- Check: (1) PR #8237's CI, read with `gh pr checks 8237` and `gh run view 41837794423 --json headSha`; (2) a local run with the real `auth.setup.ts` was not possible: E2E_AUTH0_* creds exist only in CI.
- Evidence (1), `gh pr checks 8237` (read now); the E2E run 41837794423 has headSha 7b5e1d375ffec4c6bd9ff5d12c56b1ccb788d09a, the pre-fix head (an ancestor of HEAD; the five commits a369a207d to 004c8881a come after it):
  ```
  Hospitality E2E (shard 1)	pass	16m32s	.../actions/runs/41837794423/job/126601959501
  Hospitality E2E (shard 2)	pass	12m6s	.../actions/runs/41837794423/job/126601959537
  Hospitality E2E (shard 3)	pass	15m12s	.../actions/runs/41837794423/job/126601959601
  Hospitality E2E	pass	4s	.../actions/runs/41837794423/job/126610868240
  ```
  These ran with the real `auth.setup.ts` (the dispatch states it; I did not open the job logs to confirm the setup step). The local e2e at 004c8881a used the synthetic OIDC session, which skips `auth.setup.ts`.
- Result: PASS on CI evidence for the pre-fix head 7b5e1d375; **NOT RUN for HEAD 004c8881a** until Ship pushes it and CI runs there. Counted as NOT RUN in the Summary.

### E12. CLI checks and the drift lane

- Re-verify basis: CI fix diff touched this path (regenerated `llms.txt` and `llms-full.txt`, the size budgets). Fresh at HEAD 004c8881a, below under "Re-verified at HEAD 004c8881a". The CLI, ADR, deps and graph lines below are from the full pass at b46a22fcd (rebased 775762bab); their code is unaffected by the CI fix diff.
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
- Re-verified at HEAD 004c8881a (the drift lane; relative paths; porcelain empty afterwards):
  ```
  $ pnpm regen                          Done. All artifacts regenerated.            REGEN=0
  $ pnpm regen --check --git-only       All generated artifacts are up to date.     CHECK=0
  $ pnpm --filter @mbe/cli start pack <dir> --check   for the 22 `git ls-files '*llms.txt'` dirs
  22 of 22 in sync ("... llms.txt is in sync.")
  $ pnpm size:check                     Tasks: 32 successful, 32 total              EXIT=0
  ```
- Result: PASS

### E13. CI-blocking jobs Build, Lint and Test (rest) replicated locally, green

- Re-verify basis: new criterion at this re-verify; every line below was run at HEAD 004c8881a.
- Check: PR #8237's CI failed three jobs that block `CI Gate` (`gh pr checks 8237`: `Build fail 1m55s`, `Lint fail 2m43s`, `Test (Node 22, rest) fail 5m33s`; breakdown.md `## CI fix loop`: Build `no-circular`, Lint knip `Unused exports (1)`, Test (rest) `assert-vitest-ran`), plus a fourth failure the local Build replica found past where CI stopped (`size:check`). Each failing step was re-run locally at HEAD, along with the rest of the Build, Lint and Test steps that the repo's root scripts cover.
- Evidence (local replica, not GitHub's runners):
  ```
  Build  : pnpm check:boundaries     ✔ no dependency violations found (4453 modules, 11911 dependencies cruised)   EXIT=0
           pnpm size:check          Tasks: 32 successful, 32 total   EXIT=0
           pnpm --filter @mbe/availability build   EXIT=0
           pnpm regen --check --git-only   All generated artifacts are up to date.   CHECK=0
  Lint   : pnpm check:knip           (no Unused exports)   EXIT=0
           pnpm lint --force         Tasks: 45 successful, 45 total / Cached: 0 cached   EXIT=0 (0 errors)
           pnpm typecheck --force    Tasks: 45 successful, 45 total / Cached: 0 cached   EXIT=0
  Test   : vitest run --config scripts/vitest.config.mjs scripts/__tests__/assert-vitest-ran.test.mjs   Tests  12 passed (12)
           services/reservations on Postgres 15: Test Files 234 passed (234) / Tests 3965 passed (3965); Suites ran for real: 3965/3965 tests passed, 0 skipped.
           @mbe/availability 340/340; @mbe/hospitality 5238/5238; @mbe/types 494/494; @mbe/agent-service 1028/1028
  install: pnpm install --frozen-lockfile   Done in 3.1s   INSTALL_EXIT=0
  ```
  Differences from CI that this run did not remove: I ran package-level and root scripts, not CI's `ci.yml` steps one by one (the `Build` job's `repo-audit` boundaries step and the `Test (Node 22, rest)` job's test matrix legs were not replayed as workflow steps); the Postgres image is 15, not the 16-alpine of Migration Dry-Run; the `rest` job's package list was not diffed against what I ran.
- Not run: **GitHub's own CI run on the pushed head 004c8881a (or whatever head Ship pushes)** that would turn the Build, Lint and Test (rest) jobs green. Nothing has been pushed. That confirmation happens at Ship: NOT RUN here.
- Result: PASS (local replication green). The CI confirmation is NOT RUN (see the Summary).

### Verify fix loop: es-MX and fr-CA plural forms for closedDays

- Re-verify basis: fresh at HEAD 004c8881a: `pnpm check:i18n-catalogs` prints `PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.`

- Check: `pnpm check:i18n-catalogs` at HEAD.
- Evidence:
  ```
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.
  ```
  Correctness of the Spanish and French strings beyond plural-form presence is not claimed.
- Result: PASS

### Verify fix loop: Go to date Escape flake classified

- Check: the classification and both-tree evidence are recorded in the breakdown Notes (breakdown.md line 253: this branch 59/60, origin/main 58/60); the test body is unchanged since the merge base; this stage's run is in E9.
- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff.
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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. Its tests sit in suites re-run green at HEAD 004c8881a (`@mbe/types` 494/494; reservations 3965/3965).

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The test sits in the hospitality suite, 5238/5238 at HEAD 004c8881a.

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The test sits in the hospitality suite, 5238/5238 at HEAD 004c8881a.

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

- Re-verify basis: CI fix diff touched this path (`quick-setup-draft.ts`, `toClock` un-exported). Fresh at HEAD 004c8881a: the test sits in the hospitality suite, Test Files 383 passed (383) / Tests 5238 passed (5238), and `pnpm check:knip` exit 0. I did not re-run the single named test on its own; the quoted line is from the full pass.

- Check: the named test.
- Evidence:
  ```
   ✓ quick setup draft > flags a service whose own days all fall outside the days the schedule is used on
   Tests  1 passed | 38 skipped (39)
  ```
  The Accept's alternative (`validateDraft` refuses with an issue) is the leg this test names; the drawer's Save wiring (b36b46c44) is covered by the hospitality suite passing, not by a separate named test here.
- Result: PASS

### Review minor 2: the collapse script's `replaced` log omits created rows

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The tests sit in the reservations suite, 3965/3965 at HEAD 004c8881a.

- Check: the named test; `reference.md`.
- Evidence:
  ```
   ✓ collapseVenue > logs the ids of the rows a collapse creates, so the log can be rolled back from
  services/reservations/docs/reference.md:670: ... Every `would_collapse` / `collapsed` line carries the rows it replaced and the ids of the rows it created (`created`): keep the log, it is the backup. Rollback is manual: restore the replaced rows, delete the created ones (archived schedules can be unarchived).
  ```
- Result: PASS

### Review minor 3: the collapse script's `refused` check compares issue sets

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The tests sit in the reservations suite, 3965/3965 at HEAD 004c8881a.

- Check: the named tests.
- Evidence:
  ```
   ✓ introducedIssues > reports an issue the collapse adds even when it also fixes one (equal counts)
   ✓ introducedIssues > reports nothing when the collapse only keeps or removes issues
   Tests  3 passed | 5 skipped (8)      (with the minor 2 test)
  ```
- Result: PASS

### Review minor 4: `encodeWeek` is canonical over `bookingTypes` and `fixed` seating order

- Re-verify basis: CI fix diff touched this path (`service-days.ts` imports `ResolvedService` from `types.ts`). Fresh at HEAD 004c8881a: `@mbe/availability` Test Files 20 passed (20) / Tests 340 passed (340), which include `service-days.test.ts`. The single named test was not re-run on its own; the quoted line is from the full pass.

- Check: the named test.
- Evidence:
  ```
   ✓ encodeWeek canonical form > groups days whose bookingTypes or fixed seating differ only in order
   Tests  1 passed | 23 skipped (24)
  ```
- Result: PASS

### Review minor 5: the "varied week faster than today" guard can fail

- Re-verify basis: the mutation proof is from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff; it was NOT re-run at 004c8881a. At HEAD 004c8881a the unmutated guard spec `availability-interaction-guards.spec.ts` passed inside the 158 (porcelain empty afterwards, so the constant is unmodified).

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. The test sits in the hospitality suite, 5238/5238 at HEAD 004c8881a.

- Check: the named test.
- Evidence:
  ```
   ✓ regularWeekLine > reads the week in force today, not a dated Change regular week that starts later
   Tests  1 passed | 5 skipped (6)
  ```
  The line's agreement with Details in a browser was not looked at.
- Result: PASS

### Review minor 8: the lint warning at `ScheduleEditorDrawer.tsx:130`

- Re-verify basis: fresh at HEAD 004c8881a for the lint leg: `pnpm lint --force` exit 0, `@mbe/hospitality:lint: ✖ 230 problems (0 errors, 230 warnings)`, the count quoted below. The single-file `eslint` run is from the full pass.

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

- Re-verify basis: `QuickSetupForm` is on the quick-setup path the CI fix diff touched. Fresh at HEAD 004c8881a: the tests sit in the hospitality suite, 383 files / 5238 tests passed. The single-file runs and the browser readings are from the full pass.

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

- Re-verify basis: from the full pass at b46a22fcd (rebased 775762bab), code unaffected by the CI fix diff. At HEAD 004c8881a `@mbe/agent-service` is Test Files 53 passed (53) / Tests 1028 passed (1028).

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

Open and not failing this run (Owner step, not routed to Implement): **Visual Regression (hospitality) baselines.** PR #8237's `Visual Regression (hospitality)` job failed (`toHaveScreenshot` on `availability@1280x720.png` and `availability@375x812.png`). It is advisory and never moves CI Gate (`apps-visual.yml`). The baselines are regenerated by a `workflow_dispatch` of `visual-noise-floor.yml` with `app: hospitality`; this run may not take that step.

## Not verified

- **Owner-only human-timed five-minute walkthrough** (PRD 12): not run, by design.
- **Real Auth0 e2e login (`auth.setup.ts`)** (E11) at HEAD 004c8881a: not run. PASS only on PR #8237's CI for the pre-fix head 7b5e1d375; needs CI on the pushed head, at Ship.
- **GitHub's own CI on the pushed head** (E13's confirmation): not run; nothing is pushed.
- **A full-stack browser run**: every e2e mocks the API; the calendar, day drawer and guest preview in the demo e2e come from `engine-days-mock.ts` running the same pure engine as the service, so PRD 2's e2e leg is not independent of the engine. The service's own builders were exercised by the reservations suite, not by a browser.
- **CI-only jobs**: the Migration Dry-Run job (postgres:16-alpine; this run used postgres:15), the `services/agent` Docker build, Lighthouse and mutation testing. None was run here. (`pnpm regen --check --git-only` and `pnpm size:check`, which the earlier pass listed here, were run at 004c8881a.)
- **Visual Regression (hospitality)**: not run, failing on the PR, advisory; baselines need an Owner `workflow_dispatch` of `visual-noise-floor.yml` with `app: hospitality`. `e2e/locale-sweep.spec.ts` was not re-run at 004c8881a.
- **Collapse script apply on a real database**: the Owner's step; only the mocked-client unit tests and the throwaway Postgres were used.
- **Whether the 230 hospitality lint warnings predate this run**: not examined. **Whether the Go to date Escape flake exists on `origin/main`**: shown only by the fix loop's run (2 of 60), not re-measured here; its cause was not investigated.
- **Correctness of the es-MX and fr-CA `closedDays_many` wording** beyond key, placeholder and plural-form presence: no native-speaker review.
- **Route-test internals for Review major 1 and 3**: I ran the named tests and quoted their titles; I did not read every assertion against the Accept's sub-claims.
- **Visual**: accessibility with a screen reader or keyboard, dark mode, other browsers, many-service strips, tables-loaded party checks; some full-page and element screenshots at 375 px were cropped by the app's inner scroll container (E10).
- **Interaction counts** are counts of Playwright actions on one fixture (agent stand-in evidence), not human time.
