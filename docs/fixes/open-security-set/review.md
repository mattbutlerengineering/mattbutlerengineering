---
stage: review
run: maintenance:open-security-set
date: 2026-10-08
assumptions:
  - "verification.md is present. This review does not re-run the suites it already recorded."
  - "Autorun. The user is not in the loop. Majors stay unresolved for a user decision. Minors may be deferred. No product code was changed."
---

# Review: Public guest-risk disclosure, inert RLS backstop, and unpatched http-cache-semantics ignore

## Scope

`git diff origin/main...HEAD` on `fix/open-security-set` (merge-base `a9a4b3fa`). Seven commits, not the four commits this branch is behind on main:

- `523fa86ec` fix(reservations): return only requiresDeposit from public guest-risk
- `4fab27ca2` fix(reservations): add app_reservations role and force RLS
- `55d67f6b5` fix(reservations): assume app_reservations on app transactions
- `3ac99202e` test(reservations): add the app_reservations RLS proof suite
- `cf41bf34a` fix(deps): override http-cache-semantics to 4.3.0
- `62aa9a98a` test(reservations): record the passing RLS proof run
- `c49a11eb1` docs(open-security-set): record verification evidence

Examined the guest-risk route and shared schema, both new migrations, `assumeAppRole` / `setVenueContext` / the venue-scoped proxy, the four raw call sites, the RLS proof, ADR-026's closing sentence, root `package.json` overrides, and the published `http-cache-semantics@4.2.0` and `@4.3.0` sources. Generated `llms.txt` files were not reviewed as behavior.

## Findings

### Major: `http-cache-semantics@4.3.0` does not patch GHSA-ch52-4w7c-c8xp, and the ignore is gone

- Scenario: A shared cache using this library stores a response that `maxAge()` zeroes (shared `Set-Cookie` without `public`, or `proxy-revalidate`). `stale()` is `maxAge() <= age()`, so that entry is stale immediately. `evaluateRequest` then honors `Cache-Control: max-stale` and returns a hit (`_evaluateRequestHitResult`) without revalidation. That branch in published 4.3.0 (`index.js` around the `allowsStaleWithoutRevalidation` check) is the same code as 4.2.0. The 4.3.0 diff only changes `Vary: *` matching and adds `status` on the cached response. GitHub still lists patched versions as none. OSV's affected range stops at 4.2.0, so resolving 4.3.0 and deleting `ignoreGhsas` makes `pnpm audit` treat GHSA-ch52-4w7c-c8xp as gone while the max-stale path is unchanged. The package is still the `make-fetch-happen` tooling edge, not an API request path.
- Standard: none
- Decision: unresolved — needs a user decision. Put the ignore back, or keep 4.3.0 knowing it does not close this advisory.

### Major: `CREATE ROLE` is cluster-global, so the migration is not replayable

- Scenario: `CREATE ROLE app_reservations` commits for the whole Postgres cluster. Prisma's shadow database is another database on that same cluster, and `services/reservations` `db:migrate` is `prisma migrate dev`, which replays every migration there. `DROP DATABASE` does not drop the role. The next replay — shadow, or `db:migrate:deploy` against `mbe` on `infrastructure-postgres-1` after this run already applied the migration to `open_security_rls` on that cluster — fails with `42710` (`role "app_reservations" already exists`). Prisma then marks the migration failed and later deploys stop until it is resolved. `migrate deploy` on a cluster that has never created the role still succeeds once. Production pre-deploy is that path. A second database on the production cluster is not.
- Standard: none
- Decision: unresolved — needs a user decision. Idempotent role creation, or accept that only a single fresh cluster can apply this migration.

### Major: schema-wide default privileges grant `app_reservations` DML on later users and agent tables

- Scenario: Production injects one `databaseUrl` into users, reservations, agent, and all three migrate jobs (`infrastructure/pulumi/index.ts`). Local compose already puts users and reservations in database `mbe`. `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_reservations` does not touch tables that exist today. The next `CREATE TABLE` in `public` by that same migrate role — a users or agent migration — grants `app_reservations` full DML on it. The reservations process assumes that role at the start of every app transaction. There is no RLS on those tables. Architecture forbids `GRANT ... ON ALL TABLES IN SCHEMA public` for this shared database; the default-privileges statement is the same grant for every later table.
- Standard: none
- Decision: unresolved — needs a user decision. Drop the default privileges and grant inside each reservations migration, or accept the cross-service grant.

### Minor: old booking widget fail-opens deposits when the API ships first

- Scenario: The deployed hospitality bundle still parses `GuestRiskResultSchema` with required `riskScore`. This API returns `{ data: { requiresDeposit } }` only. Zod fails, `fetchGuestRisk` catches, and returns `false`. A risky guest is not shown the deposit step until the widget bundle that only requires `requiresDeposit` is deployed. The new client accepts the old body (unknown keys are stripped). Widget first, then reservations API, avoids the window.
- Standard: none
- Decision: deferred — autorun, user not in the loop. Ship must deploy the hospitality widget before the reservations API if this stays a single change.

### Minor: branch is behind main on `pnpm-lock.yaml`

- Scenario: `HEAD..origin/main` includes a js-yaml bump and the omp adapter, and both sides edit `pnpm-lock.yaml`. A resolution that keeps main's lockfile entries and drops this branch's `http-cache-semantics@4.3.0` pin puts 4.2.0 back while `package.json` no longer ignores the advisory, and the next audit goes red. Or the reverse: the override is recorded and the lockfile still resolves 4.2.0, which the seam test rejects.
- Standard: none
- Decision: deferred — autorun, user not in the loop. Resolve the lockfile at merge; do not take either side whole.

## Passes with no findings

Correctness of the public guest-risk body: the handler sends `{ requiresDeposit }` only, the route test asserts the raw payload (not a Zod strip), `requiresDeposit` is still `riskScore === "risky"`, unknown guests stay false, staff `Guest.riskScore` / `GuestSchema` stay, and the route is still unauthenticated with `rateLimit.max` 20. `requiresDeposit: true` still means risky. That leak is the contract in `architecture.md`, not a defect.

Design of the role switch matches the architecture's call list. `setVenueContext` assumes `app_reservations` before `set_config`, including a null venue id. `resolveVenueId`, both `app_cross_venue_venues` reads, `getAllVenueIds`, and `listByUserId` assume the role inside the transaction that calls the function. Explicit `$transaction` writers (`book-slot`, `floor-plan`, `waitlist`, venue create) go through `setVenueContext`. The proxy does the same for model delegates. `SET LOCAL ROLE` is built only from `app_reservations` after `^[a-z_]+$`. The grant is `GRANT app_reservations TO CURRENT_USER`, not the reverse. FORCE is the seven venue tables, with `lock_timeout` 5s and `RESET`. No `BYPASSRLS`, no second `DATABASE_URL`, no `deploy-services.yml` change. `PENDING_FORCE_TABLES` is empty and a listed-but-already-forced name is reported. Health `SELECT 1` does not assume the role.

Security of the hatch: the proof checks `pg_has_role(app_reservations, relowner, 'MEMBER')` is false, a venue-B context hides venue A, and `app_reservations` setting `app.cross_venue` itself still sees no venue row. The policy's conjunct is `USAGE`; for a non-superuser, `MEMBER` false implies `USAGE` false. The owner-suite off-window still shows the owner bypasses only while FORCE is off. No secret was added.

## Verdict

No critical finding. Three majors are unresolved and need a user decision before this is ready to ship: the 4.3.0 override does not patch GHSA-ch52-4w7c-c8xp, `CREATE ROLE` will fail on replay, and default privileges cross into later users and agent tables. Two minors are deferred. Product code was not changed.
