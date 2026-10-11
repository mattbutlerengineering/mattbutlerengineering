---
stage: verify
run: maintenance:open-security-set
date: 2026-10-08
assumptions:
  - "There is no prd.md. Criteria are the success sentence in defect.md plus each Accept line in breakdown.md. Every breakdown checkbox was already checked."
  - "The pre-change red run of the public guest-risk regression was not repeated. Verify did not revert the handler or check out the parent of 523fa86ec."
---

# Verification: Public guest-risk disclosure, inert RLS backstop, and unpatched http-cache-semantics ignore

## Summary

8 pass, 0 fail. The public guest-risk regression, the scratch-database RLS proof, the `http-cache-semantics@4.3.0` override, and both commanded typechecks passed on `fix/open-security-set`. No product code was edited. Tracker issues were not closed.

## Criteria & evidence

### Defect success: after the #6027 change, public guest-risk JSON has no `riskScore`, and `requiresDeposit` still reflects risky vs not

- Check: `pnpm --dir services/reservations exec vitest run src/routes/public-guest-risk.test.ts`. The suite asserts the raw 200 payload is `{ data: { requiresDeposit } }`, that the string `riskScore` is absent, that `requiresDeposit` is false for trusted, decayed/standard, unknown, and phone-lookup standard guests, and true for a risky guest.
- Evidence:
  ```
  ✓ src/routes/public-guest-risk.test.ts (16 tests) 694ms

   Test Files  1 passed (1)
        Tests  16 passed (16)
     Start at  22:02:24
     Duration  2.79s (import 43%, transform 30%, tests 26%, setup 1%)
  ```
- Result: PASS

### Defect success: #5369 has an architecture decision recorded before any FORCE or role-switch code

- Check: `architecture.md` records the full role switch (`app_reservations`, `SET LOCAL ROLE`, `FORCE` on the seven venue tables, migrate stays the owner). `git log` and `git merge-base --is-ancestor` compare the commit that added that file with the commit that added the FORCE migration.
- Evidence:
  ```
  === architecture vs force commits ===
  523fa86ec 2026-10-08 21:13:57 -0700 fix(reservations): return only requiresDeposit from public guest-risk
  523fa86ec is ancestor of 4fab27ca2
  === files in architecture commit ===
  523fa86ec 2026-10-08 21:13:57 -0700 fix(reservations): return only requiresDeposit from public guest-risk
   docs/fixes/open-security-set/architecture.md       | 185 +++++++++++++++++++++
   ...
   22 files changed, 589 insertions(+), 85 deletions(-)
  === files in force commit ===
  4fab27ca2 2026-10-08 21:25:17 -0700 fix(reservations): add app_reservations role and force RLS
   .../migration.sql                                  |   4 +
   .../migration.sql                                  |  41 ++++++
   .../src/services/rls-force-coverage.test.ts        | 146 +++++++++++++++++++--
   .../src/services/rls-force-coverage.ts             |  73 +++++------
   8 files changed, 254 insertions(+), 96 deletions(-)
  ```
  `523fa86ec` contains `docs/fixes/open-security-set/architecture.md` and does not contain the role or FORCE migrations. `4fab27ca2` is the later commit that adds those migrations. File mtime of `architecture.md` is `2026-10-08 20:55:53`, before both commits. The decision in that file is the full switch, not a smaller target: "One `NOLOGIN` role, `GRANT EXECUTE` on the three resolver functions, `FORCE` on the seven venue tables, and `SET LOCAL ROLE` at the start of each app transaction land together. The migrate job keeps today's `DATABASE_URL` and never assumes that role."
- Result: PASS

### Defect success: #5995 is overridden to a published patched version, or left open because no patch exists

- Check: `npm view http-cache-semantics version`, the published version list, and a read of root `package.json`. A version greater than 4.2.0 is published, so the override path applies. The ignore must be gone. The issue was not closed.
- Evidence:
  ```
  4.3.0
  ---pkg---
  mentions GHSA-ch52-4w7c-c8xp: false
  auditConfig: undefined
  override: ^4.3.0
  ```
  `git grep -n 'GHSA-ch52-4w7c-c8xp' -- package.json` printed `no GHSA-ch52-4w7c-c8xp in package.json`. Root `pnpm.overrides` contains `"http-cache-semantics@<=4.2.0": "^4.3.0"`. `pnpm.auditConfig` is absent. The seam test that locks this in passed (quoted under the Milestone 3 criterion). #5995 was not closed.
- Result: PASS

### Accept: Public guest-risk projection

- Check: the reservations route suite above, plus the api-client and hospitality files named by the Accept line: `pnpm --dir packages/api-client exec vitest run src/contract.test.ts src/public-venue.test.ts` and `pnpm --dir apps/hospitality exec vitest run src/components/booking-widget/useBookingFlow.test.ts src/components/booking-widget/BookingWidget.test.tsx e2e/fixtures/guest-risk-mock.test.ts`. `public-venue.test.ts` is the client unwrap suite; the Accept line names `contract.test.ts` and the hospitality files. Staff `Guest.riskScore` / `GuestSchema.riskScore` and `schema-baseline.json` were read, not executed as a separate suite.
- Evidence:
  ```
  ✓ src/routes/public-guest-risk.test.ts (16 tests) 694ms

   Test Files  1 passed (1)
        Tests  16 passed (16)
     Start at  22:02:24
     Duration  2.79s (import 43%, transform 30%, tests 26%, setup 1%)
  ```
  ```
  ✓ src/contract.test.ts (8 tests) 8ms
  ✓ src/public-venue.test.ts (18 tests) 43ms

   Test Files  2 passed (2)
        Tests  26 passed (26)
     Start at  22:02:59
     Duration  625ms (transform 65%, import 27%, tests 6%, worker 2%)
  ```
  `packages/api-client/src/contract.test.ts` asserts `expect([...zod].sort()).toEqual(["requiresDeposit"])`, `expect(zod.has("riskScore")).toBe(false)`, and the same for the Fastify JSON schema keys.
  ```
  ✓ e2e/fixtures/guest-risk-mock.test.ts (2 tests) 4ms
  ✓ src/components/booking-widget/useBookingFlow.test.ts (50 tests) 205ms
  ✓ src/components/booking-widget/BookingWidget.test.tsx (9 tests) 338ms

   Test Files  3 passed (3)
        Tests  61 passed (61)
     Start at  22:02:59
     Duration  2.31s (environment 55%, transform 17%, setup 13%, tests 9%, import 6%)
  ```
  The route suite covers the raw body, risky vs not (trusted, standard/decay, unknown), no `requireAuth` (`does not require Authorization and still returns only requiresDeposit` returns 200), `rateLimit` 20 then 429, 400 problem-details when email and phone are both missing, and 404 when `resolveVenueId` is null. The route description case asserts the swagger description and summary do not match `/risk score/i`. `GuestRiskResultSchema` is `{ requiresDeposit: z.boolean() }`. `fetchGuestRisk` still `return result.requiresDeposit` and `catch { return false; }`. Staff score is unchanged in source: `Guest.riskScore: GuestRiskScore` with `GuestRiskScore = "trusted" | "standard" | "risky"`, and `GuestSchema` still has `riskScore: z.enum(["trusted", "standard", "risky"])`. `schema-baseline.json` has no `GuestRiskResult` entry. Its `Guest` entry (line 241) still requires `riskScore` with `"enum": ["trusted", "standard", "risky"]`.
- Result: PASS

### Accept: Reservations runtime role, Migrate owner, and FORCE coverage guard

- Check: `pnpm --dir services/reservations exec vitest run src/services/rls-force-coverage.test.ts src/services/assume-app-role.test.ts src/middleware/venue-context.test.ts --reporter=verbose`, and `git diff --stat origin/main -- .github/workflows/deploy-services.yml infrastructure/pulumi/index.ts`. Typecheck commanded for this package is quoted here.
- Evidence:
  ```
  ✓ src/services/rls-force-coverage.test.ts > committed reservations migrations (ADR-026 / #5369) > forces the seven venue tables and keeps the pending list empty 0ms
  ✓ src/services/rls-force-coverage.test.ts > app_reservations role and FORCE migrations > creates app_reservations as one statement, comment included 0ms
  ✓ src/services/rls-force-coverage.test.ts > app_reservations role and FORCE migrations > grants the role to the migrate user, DML on the ten tables, execute, and FORCE 1ms
  ✓ src/services/rls-force-coverage.test.ts > app_reservations role and FORCE migrations > does not grant BYPASSRLS from seed 0ms
  ✓ src/services/rls-force-coverage.test.ts > unforcedRlsTables > reports a pending name the migrations already force 0ms
  ✓ src/services/rls-force-coverage.test.ts > unforcedRlsTables > reports a table that is RLS-enabled but not forced and not acknowledged 0ms
  ✓ src/services/rls-force-coverage.test.ts > stale FORCE-blocked prose > drops the claim that ADR-026 §3.3 blocks the flip 0ms
  ✓ src/services/rls-force-coverage.test.ts > stale FORCE-blocked prose > updates the reservations caveat and the funnel paragraph 1ms
  ✓ src/services/rls-force-coverage.test.ts > stale FORCE-blocked prose > amends ADR-026's closing sentence so the role and FORCE are not still open 1ms

   Test Files  3 passed (3)
        Tests  37 passed (37)
     Start at  22:02:58
     Duration  260ms (transform 66%, setup 11%, tests 9%, import 9%, worker 5%)
  ```
  ```
  === deploy-services and pulumi vs origin/main ===
  (empty diff above means no change)
  ```
  `infrastructure/pulumi/index.ts` still has one `config.requireSecret("databaseUrl")`. `db-migrate-${service}` for `reservations` still gets `secretEnv("DATABASE_URL", databaseUrl)`. No second `DATABASE_URL` was introduced. `deploy-services.yml` has no diff against `origin/main`. No production role was edited by this stage.
  ```
  $ pnpm --dir services/reservations exec tsc --noEmit
  (no stdout or stderr)
  exit 0
  ```
- Result: PASS

### Accept: App-role adapter (`assumeAppRole`)

- Check: the same verbose vitest run as the FORCE-coverage criterion (`assume-app-role.test.ts` and `venue-context.test.ts`). `pnpm --dir packages/database exec tsc --noEmit` because the role adapter sits on the shared database client types.
- Evidence:
  ```
  ✓ src/services/assume-app-role.test.ts > assumeAppRole > checks app_reservations against ^[a-z_]+$ and emits only that SET LOCAL ROLE statement 1ms
  ✓ src/services/assume-app-role.test.ts > assumeAppRole > runs $executeRawUnsafe with the checked constant and no bind values 1ms
  ✓ src/services/assume-app-role.test.ts > assumeAppRole > is not called by migrate, seed, health, or readiness 2ms
  ✓ src/services/assume-app-role.test.ts > assumeAppRole > assumes the role inside a transaction at the four raw call sites and does not swallow 42704 or 42501 2ms
  ✓ src/middleware/venue-context.test.ts > setVenueContext > assumes app_reservations when venueId is null, and does not run set_config 0ms
  ✓ src/middleware/venue-context.test.ts > setVenueContext > assumes app_reservations before set_config when a venue id is given 0ms

   Test Files  3 passed (3)
        Tests  37 passed (37)
     Start at  22:02:58
     Duration  260ms
  ```
  The null-venue case expects `$executeRaw` not called and `$executeRawUnsafe` called once with `SET LOCAL ROLE "app_reservations"`. The four call-site case reads `resolve-venue.ts`, `venue.ts`, `lapsed-guest-cron.ts`, and `reservation.ts` for `assumeAppRole` and `$transaction`, and asserts they do not contain `42704` or `42501`. Migrate, seed, health, app, and floor-plan are asserted not to call `assumeAppRole` by name; floor-plan still contains `setVenueContext`.
  ```
  $ pnpm --dir packages/database exec tsc --noEmit
  (no stdout or stderr)
  exit 0
  ```
- Result: PASS

### Accept: RLS proof (non-owner denied, owner bypasses only while FORCE is off)

- Check: exactly `DATABASE_URL='postgresql://rls_plain:rls_plain@127.0.0.1:5432/open_security_rls' pnpm --dir services/reservations exec vitest run src/routes/rls-owner-enforcement.integration.test.ts src/routes/rls-app-reservations.integration.test.ts`. No other database was created or migrated. The `mbe` database was not used. Docker container `infrastructure-postgres-1` was already up (`Up 13 hours (healthy)`).
- Evidence:
  ```
  ✓ src/routes/rls-app-reservations.integration.test.ts (4 tests) 120ms
  ✓ src/routes/rls-owner-enforcement.integration.test.ts (7 tests) 510ms

   Test Files  2 passed (2)
        Tests  11 passed (11)
     Start at  22:02:24
     Duration  820ms (tests 66%, import 15%, transform 14%, setup 3%, worker 1%)
  ```
  Those 11 tests are the cases in the two files: non-membership of the table owner on the seven venue tables; venue A hidden when `app_reservations` has `app.venue_id` set to venue B; no venue row when that session sets `app.cross_venue` itself; the three resolver functions return their defined rows; the connection is the owner of the seven tables and is not a superuser and not `BYPASSRLS`; live `relforcerowsecurity` matches the migrations; the owner sees both venues only while FORCE is off, sees only the venue in `app.venue_id` when FORCE is on, and a cross-venue write is refused once FORCE is set. Connection to the scratch URL succeeded. This suite is not claimed to be what makes `CI Gate` green.
- Result: PASS

### Accept: http-cache-semantics ignore

- Check: `npm view http-cache-semantics version`, `npm view http-cache-semantics versions --json`, the root `package.json` read, and `pnpm --dir scripts test -- scripts/__tests__/http-cache-semantics-override.test.mjs`.
- Evidence:
  ```
  4.3.0
  ---versions---
  [
    "1.0.0",
    "2.0.0",
    "3.0.0",
    "3.1.0",
    "3.2.0",
    "3.3.0",
    "3.3.1",
    "3.3.2",
    "3.3.3",
    "3.4.0",
    "3.5.0",
    "3.5.1",
    "3.6.0",
    "3.6.1",
    "3.7.0",
    "3.7.1",
    "3.7.3",
    "3.8.0",
    "3.8.1",
    "4.0.0",
    "4.0.1",
    "4.0.2",
    "4.0.3",
    "4.0.4",
    "4.1.0",
    "4.1.1",
    "4.2.0-beta.1",
    "4.2.0-beta.2",
    "4.2.0",
    "4.3.0"
  ]
  ---pkg---
  mentions GHSA-ch52-4w7c-c8xp: false
  auditConfig: undefined
  override: ^4.3.0
  ```
  `4.3.0` is the lowest published version greater than `4.2.0`. The override is the scoped form `"http-cache-semantics@<=4.2.0": "^4.3.0"`, not an open `>=` range.
  ```
  ✓ scripts/__tests__/http-cache-semantics-override.test.mjs (2 tests) 4ms

   Test Files  1 passed (1)
        Tests  2 passed (2)
     Start at  22:02:24
     Duration  203ms (import 46%, transform 38%, tests 9%, worker 6%)
  ```
  That test requires the override, rejects an `ignoreGhsas` entry of `GHSA-ch52-4w7c-c8xp`, and requires the lockfile not to resolve `http-cache-semantics@4.2.0` while resolving a `4.3.` version. The registry read succeeded, so the "leave the ignore" fork does not apply. #5995 was not closed.
- Result: PASS

## Failures

none.

## Not verified

- The success sentence also says the guest-risk regression fails before the #6027 change. That red run was not repeated. The handler was not reverted, and `523fa86ec^` was not checked out.
- `pnpm test`, `pnpm lint`, and the package `typecheck` scripts (the ones that use `tsconfig.test.json` and therefore typecheck tests) were not run. The commanded checks were `tsc --noEmit` in `services/reservations` and `packages/database` only. `packages/types`, `packages/api-client`, and `apps/hospitality` were not typechecked.
- `CI Gate` was not run. The RLS suite is skipped when `DATABASE_URL` is unset and is not the CI gate.
- No request was sent to a deployed reservations process. The guest-risk evidence is `app.inject` in Vitest.
- Production roles were not read or edited. The RLS proof used only `postgresql://rls_plain:rls_plain@127.0.0.1:5432/open_security_rls` on the already-running `infrastructure-postgres-1` container. The `mbe` database was not migrated.
- #6027, #5369, and #5995 were not closed. #5962 was not executed and was not closed. No secret value was read or rotated. Nothing was pushed, merged, or deployed.
