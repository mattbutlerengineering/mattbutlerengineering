---
stage: architect
run: maintenance:open-security-set
date: 2026-10-09
ux: skipped — no new screen; the booking widget already branches on requiresDeposit
assumptions:
  - "Maintenance run. There is no prd.md and no ux.md. The predecessor is defect.md. UX is skipped because there is no new screen; the booking widget already branches on requiresDeposit."
  - "Public guest-risk stays unauthenticated and rate-limited. The object inside the existing { data } envelope becomes only { requiresDeposit: boolean }. requiresDeposit is true only when assessGuestReliability returns risky. No requireAuth and no session token. Staff Guest.riskScore stays."
  - "#5369 is a full role switch in this run, not a smaller target. The ADR-026 §3.3 sequence is already in this tree. There is no serial or identity column to grant, so nothing is deferred for sequence work. The runtime role is NOLOGIN and is assumed with SET LOCAL ROLE on the existing owner connection. Migrate stays the owner. A second connection string is rejected because it would be a secret write against the one Pulumi databaseUrl shared by users, reservations, and agent."
  - "#5995 is a registry fork executed at implement time. This design does not pick a version and does not delete the ignore."
  - "#5962 is out of this design. No secret is read or rotated."
  - "Release stays prepare-and-stop. This artifact authorizes no deploy, merge, or production role edit."
---

# Architecture: Public guest-risk disclosure, inert RLS backstop, and unpatched http-cache-semantics ignore

#5962 is out of this design. Do not rotate secrets, read secret values, or close that issue.

## Approach

Three independent fixes. The public guest-risk policy already exists (`assessGuestReliability`); the public adapter stops repeating its named result and returns only the boolean the booking widget already branches on. The RLS backstop already has policies, `SECURITY DEFINER` resolvers, and the §3.3 call-site fixes in this tree; what is missing is that the reservations process still _is_ the table owner, and no migration sets `FORCE ROW LEVEL SECURITY`. One `NOLOGIN` role, `GRANT EXECUTE` on the three resolver functions, `FORCE` on the seven venue tables, and `SET LOCAL ROLE` at the start of each app transaction land together. The migrate job keeps today's `DATABASE_URL` and never assumes that role. The advisory ignore stays until implement sees a published `http-cache-semantics` version greater than 4.2.0.

## Components

### Public guest-risk projection

- Responsibility: turn one venue-scoped reliability result into `{ requiresDeposit: boolean }` and nothing else.
- Collaborators: `assessGuestReliability` (the policy), `resolveVenueId` / `runWithVenueContext` (existing venue seam), `PublicVenueClient.guestRisk`, the booking widget.

Deletion test: without it, the route handler inlines the boolean rule and the named score leaks again. The score rule stays in `assessGuestReliability`. Staff guest reads are a second adapter over that same policy and are not this component.

### Staff guest score

- Responsibility: keep the named `riskScore` on the authenticated guest shape.
- Collaborators: `Guest` / `GuestSchema`, `guestService`, staff guest routes and CRM views.

Deletion test: folding this into the public projection would strip the score staff already render (`GuestCard`, `GuestHistoryStrip`). It does not change in this run.

### Reservations runtime role

- Responsibility: be the only role the reservations process is when it runs a statement, and not be a member of the table owner.
- Collaborators: the migration that creates it, `assumeAppRole`, the seven RLS policies, the three `SECURITY DEFINER` functions.

Deletion test: without it, `SET LOCAL ROLE` has nowhere to go and the owner bypass #5369 describes remains. It owns no venue rule. The policies do.

### App-role adapter (`assumeAppRole`)

- Responsibility: `SET LOCAL ROLE` to the runtime role as the first statement of an app transaction, including when no venue id is set.
- Collaborators: `setVenueContext`, and the raw `$queryRaw` callers of the three resolver functions.

Deletion test: without it, every call site invents its own `SET ROLE` and one of them will forget. `setVenueContext` still owns `app.venue_id`. This adapter does not.

### Migrate owner

- Responsibility: keep applying Prisma migrations as the table owner on the existing `DATABASE_URL`.
- Collaborators: `db-migrate-reservations` (`infrastructure/pulumi/index.ts` injects the same `databaseUrl` secret it gives the app today).

Deletion test: pointing this job at the runtime role makes `CREATE` / `ALTER` fail, and a hand-edited production role is forbidden. It must not call `assumeAppRole`.

### FORCE coverage guard

- Responsibility: fail CI when an RLS-enabled reservations table is neither forced nor listed, and fail when a listed table is already forced.
- Collaborators: `parseRlsDeclarations` / `PENDING_FORCE_TABLES`, the new FORCE migration.

Deletion test: without the "already forced" half, emptying `PENDING_FORCE_TABLES` is optional and the list can keep saying the flip is blocked after it shipped. The stale sentences that still say §3.3 blocks the flip (`services/reservations/src/services/rls-force-coverage.ts` header, and `services/reservations/CLAUDE.md` "Current caveat" plus the closing paragraph that still says the public funnel would 404) are updated in the same change. ADR-026's closing "still open" sentence is amended the same way. No new ADR.

### http-cache-semantics ignore

- Responsibility: either replace `GHSA-ch52-4w7c-c8xp` with a scoped override of a published version greater than 4.2.0, or leave the ignore in place.
- Collaborators: the npm registry (read at implement time), root `package.json`.

Deletion test: without it, someone deletes the ignore because the brief remembered "no patch" and turns the next `pnpm audit` red, or invents a version that is not on the registry.

## Data model

No new table and no new column.

`GuestRiskResult` loses `riskScore`. It is not stored. Access pattern: one public read, by email or by phone, inside one already-resolved venue, returning a derived boolean. Consistency: the boolean is computed in the same request as the guest read; it is not a stored flag that can drift from `assessGuestReliability`. Unknown guest, `trusted`, and `standard` are all `false`. Only `risky` is `true`.

`Guest.riskScore` stays a derived field on the staff read model (`GuestSchema` still requires `"trusted" | "standard" | "risky"`). Staff access pattern is unchanged: authenticated guest routes. `services/reservations/src/schemas/schema-baseline.json` has no `GuestRiskResult` entry; the `Guest` entry in that baseline stays.

The runtime role is a privilege, not a row. Name: `app_reservations`. Attributes: `NOLOGIN NOINHERIT`. It is not granted membership in the table owner (`pg_has_role(app_reservations, relowner, 'MEMBER')` is false). The owner is granted membership in `app_reservations` so it can `SET ROLE` — the opposite direction. No password, so no new secret.

Tables the role may DML, by `@@map` name, and no others: `venue_groups`, `venues`, `floor_plans`, `tables`, `guests`, `reservations`, `deposits`, `waitlist_entries`, `reservation_holds`, `venue_memberships`. The first seven are the ADR-026 RLS tables. The last three have no policy; withholding DML would 42501 those routes. Do not `GRANT ... ON ALL TABLES IN SCHEMA public`. Users (`users`) and agent (`sessions`, `session_events`, `stored_specs`) can share this database: docker-compose puts users and reservations in one database, and Pulumi injects one `databaseUrl` into all three services. There is no `serial` or `identity` column in the reservations schema (ids are `cuid()`), so this change grants no sequence. A later migration that adds one must grant `USAGE` on it itself.

`ALTER DEFAULT PRIVILEGES` for tables created later by the migrate role grants the same DML to `app_reservations`. Without that, the next table migration leaves the app role blind.

`EXECUTE` is granted on exactly:

- `app_cross_venue_venues(text)`
- `app_resolve_venue_id(text, text, text)`
- `app_reservation_venue_ids_for_user(text)`

`REVOKE EXECUTE ... FROM PUBLIC` is already in the two migrations that created them. Owner implicit execute is what makes those calls succeed today; after `SET ROLE` it is not enough.

## Interfaces & contracts

### `GET /public/v1/venues/:slug/guest-risk`

- Input: path `slug`; query `email` and/or `phone`. No `Authorization` header is consulted. Existing route config stays: `rateLimit.max` 20 per 1 minute. No `requireAuth`.
- Output: HTTP 200 body `{ data: { requiresDeposit: boolean } }`. The key `riskScore` is absent from the raw JSON, not merely stripped by a client parser. `requiresDeposit` is `true` only when `assessGuestReliability` returns `"risky"`.
- Failure modes: missing both email and phone → 400 problem-details, as today. Unknown slug, or `resolveVenueId` null → 404, as today. Over the rate limit → 429 from the existing limiter. Database down → the existing error handler (500). The widget's `fetchGuestRisk` already catches and returns `false` (no deposit step); that fail-open stays, because changing it would show a deposit when the lookup failed. Timeout is the api-client default, 30 seconds (`packages/api-client/src/client.ts`). Retry is the client's existing GET policy: replay on 502/503/504 up to 3 times; do not retry 400, 404, 429, or 500. The lookup is read-only, so a retry is safe.

### `GuestRiskResult` / `GuestRiskResultSchema` / `guestRiskResultJsonSchema`

- Input: the Zod object that both Fastify's response schema and `PublicVenueClient.guestRisk` parse.
- Output: `{ requiresDeposit: boolean }` only. `guestRiskResultJsonSchema` is the `toFastifyJsonSchema("GuestRiskResult", GuestRiskResultSchema)` call already in `packages/types/src/schemas/json-schema.ts`; it changes because the Zod object changes, not because a second schema is hand-written.
- Failure modes: a response that still contains `riskScore` fails `public-guest-risk.test.ts` on the raw payload (`"riskScore" in body.data` is false) and fails `packages/api-client/src/contract.test.ts`, which diffs Zod keys against the Fastify schema keys. Zod's default strip of unknown keys is not the proof. A client that still sends no new field is unaffected.

These change together, and staff `riskScore` does not:

- `packages/types/src/guest.ts` — `GuestRiskResult` only. `Guest.riskScore` stays.
- `packages/types/src/schemas/guest.ts` — `GuestRiskResultSchema` only. `GuestSchema.riskScore` stays.
- `packages/types/src/schemas/json-schema.ts` — `guestRiskResultJsonSchema` follows the Zod object.
- `services/reservations/src/routes/public-guest-risk.ts` — handler and the route `description` that currently says it returns a risk score. Response schema stays `{ data: { $ref: "GuestRiskResult#" } }`.
- `services/reservations/src/routes/public-guest-risk.test.ts` — the regression: raw JSON has no `riskScore`; `requiresDeposit` is false for trusted, standard (decay), and unknown, and true for risky.
- `packages/api-client/src/public-venue.ts` — `PublicVenueClient.guestRisk` still unwraps `{ data }` and parses `GuestRiskResultSchema`.
- `packages/api-client/src/public-venue.test.ts` and `packages/api-client/src/contract.test.ts`.
- Booking widget call site: `apps/hospitality/src/components/booking-widget/useBookingFlow.ts` `fetchGuestRisk` already returns `result.requiresDeposit` and does not read `riskScore`. Mocks that still pass `riskScore` are updated so they match the schema: `useBookingFlow.test.ts`, `BookingWidget.test.tsx`, `apps/hospitality/e2e/api-mocks.ts`, `apps/hospitality/e2e/fixtures/guest-risk-mock.test.ts`.

### `assumeAppRole(tx)`

- Input: the Prisma transaction client already opened by `withVenueScopedQueries` or by an explicit `$transaction`. Role name is the constant `app_reservations`, checked against `^[a-z_]+$` in that module. `SET ROLE` cannot take a bind parameter, so the statement is `SET LOCAL ROLE "app_reservations"` via `$executeRawUnsafe` of that constant only.
- Output: `current_user` is `app_reservations` for the rest of that transaction. Then `setVenueContext` may `set_config('app.venue_id', …, true)`. When the venue id is null, the role is still assumed and `set_config` is still skipped (default-deny). `SET LOCAL` resets at commit or rollback, so a pooled connection does not keep the role.
- Failure modes: role missing (`42704`) or `SET ROLE` not granted (`42501`) fails the statement. Callers do not catch it and continue as the owner; that would restore the bypass. The request surfaces through the existing error handler. Timeout is the existing Prisma pool; there is no new timeout. Retry is safe: the statement is idempotent inside a transaction that has not written yet, and a failed transaction rolls back.

`setVenueContext` calls this before its null-venue return. These `$queryRaw` call sites do not go through that wrapper today, so each opens a `$transaction`, assumes the role, then calls the function. Otherwise they keep running as the owner, owner implicit `EXECUTE` hides a missing `GRANT`, and those statements are not the runtime role:

- `services/reservations/src/services/resolve-venue.ts` `resolveVenueId`
- `services/reservations/src/services/venue.ts` (the two `app_cross_venue_venues` reads)
- `services/reservations/src/services/lapsed-guest-cron.ts` `getAllVenueIds`
- `services/reservations/src/services/reservation.ts` `listByUserId`

`floor-plan.ts`'s position update already calls `setVenueContext` inside its transaction, so it picks up the role there. Health and readiness `SELECT 1` stay on the owner connection: they do not touch an RLS table and do not need `EXECUTE`.

### Runtime-role migration

Two migrations, applied in one pre-deploy, because `CREATE ROLE` cannot run inside a transaction block (`25001`) and Prisma wraps a multi-statement migration in one. The role file is a single SQL statement and nothing else. Implement confirms that against Prisma 7.10 (`services/reservations` depends on `prisma@^7.10.0`) before adding a comment to that file; a comment that the engine counts as a second statement would wrap the file and the deploy would fail.

- Input: the migrate connection, which is today's owner (`DATABASE_URL` on `db-migrate-reservations`).
- Output, all of it or the deploy does not serve the new process:
  1. `CREATE ROLE app_reservations NOLOGIN NOINHERIT` (its own one-statement migration).
  2. `GRANT app_reservations TO CURRENT_USER`. Never `GRANT <owner> TO app_reservations`.
  3. `GRANT USAGE ON SCHEMA public`, DML on the ten tables above, `ALTER DEFAULT PRIVILEGES` for later tables created by this same role, and `GRANT EXECUTE` on the three functions.
  4. `ALTER TABLE … FORCE ROW LEVEL SECURITY` on `venues`, `floor_plans`, `tables`, `guests`, `reservations`, `deposits`, `waitlist_entries`.
- Failure modes: `lock_timeout` of `5s` around the `FORCE` statements, then `RESET lock_timeout`, matching `20260925010000_add_rls_venue_resolution_functions`. A lock timeout fails the migration; DO pre-deploy then does not switch traffic, so the old process never runs against a half-applied FORCE. `CREATE ROLE` is not transactional: if it commits and the second migration fails, the role exists and nothing `SET ROLE`s to it, because the new process is not released. No password is written. No Pulumi env changes. No edit of `deploy-services.yml`. Timeout is that `5s` lock wait plus Prisma's normal migration execution; retry of a failed deploy is safe once the failed migration is resolved the way this repo already resolves a failed `migrate deploy` (it is not left half-recorded). Do not hand-edit the production role to "finish" a failed migration.

`PENDING_FORCE_TABLES` becomes empty in the same change. `unforcedRlsTables` also reports a pending name that the migrations already force, so the list cannot keep describing a closed gap.

`prisma/seed.ts` builds its own `PrismaClient` and does not set `app.venue_id`. After FORCE, a non-superuser owner's seed writes fail closed. The compose `POSTGRES_USER` is a superuser, and superuser bypasses FORCE, so the local compose seed path still works. Production does not run seed. Do not grant `BYPASSRLS` to fix seed.

### RLS proof (non-owner denied, owner bypasses only while FORCE is off)

- Input: a migrated database at `DATABASE_URL`, skipped with `describe.skipIf` when that variable is unset, same as the existing RLS suites. CI's `test` job has no Postgres; these tests are not what makes `CI Gate` green.
- Output:
  - After `SET LOCAL ROLE app_reservations`, a read of venue A with `app.venue_id` set to venue B returns no venue A row. The same session, setting `app.cross_venue = 'on'` itself and reading `venues` directly, still returns no row. Calling the three functions returns their defined rows (`GRANT EXECUTE` is what makes that succeed).
  - `pg_has_role('app_reservations', relowner, 'MEMBER')` is false for the seven tables.
  - The owner connection, with `FORCE` turned off for the assertion and restored to whatever the migrations declare in `finally`, sees both venues. With `FORCE` on, the same connection sees only the venue in `app.venue_id`, and sees none when it is unset. `rls-owner-enforcement.integration.test.ts` already toggles FORCE and restores `declaredForce`; once the migration declares FORCE, add the explicit off-window so "the owner still bypasses unless FORCE is on" stays an assertion rather than an unreachable branch.
- Failure modes: a superuser or `BYPASSRLS` connection fails the existing owner-suite guard (those bypass FORCE, so a green run would prove nothing). A throwaway `LOGIN` probe role in the existing isolation suite stays; it is not a substitute for the durable `app_reservations` session. Timeout is the existing suite lock (`pg_advisory_lock` key `5369`) so two files do not flip FORCE under each other. Retry is not part of the test; a failed assertion leaves FORCE restored in `finally`.

### Registry fork for `GHSA-ch52-4w7c-c8xp`

- Input: the published version list of `http-cache-semantics` on the npm registry, queried by implement. Not this document's memory, and not the brief's "patched versions: none" as of 2026-10-09.
- Output: either a root `pnpm.overrides` entry and a lockfile that no longer resolves 4.2.0, plus removal of `GHSA-ch52-4w7c-c8xp` from root `package.json` `pnpm.auditConfig.ignoreGhsas` (that array is exactly `["GHSA-ch52-4w7c-c8xp"]` today; delete `ignoreGhsas` if the array would be empty), or no code change and the issue left open.
- Failure modes: registry or network failure is not evidence that no patch exists. Leave the ignore. Do not remove it and then discover the override did not resolve. Retry of the read is safe. Timeout is the npm client's own. The version chosen, when any version greater than 4.2.0 exists, is the lowest such version, written as the scoped override `"http-cache-semantics@<=4.2.0": "^<that version>"`. An open `>=` range is the override shape this repo already rejects because it can pull a later major. The lockfile today pins `http-cache-semantics@4.2.0` under `make-fetch-happen@15.0.6` (Pulumi tooling, not an API request path).

## Stack & dependencies

- Existing Fastify route, Zod schema, and `@mbe/api-client` — the public contract already has one schema shared by the route and the client.
- Existing Prisma 7 migrate and the owner `DATABASE_URL` — no new database, no new secret, no new pool.
- Postgres `SET LOCAL ROLE` plus `FORCE ROW LEVEL SECURITY` — the mechanism ADR-026 already measured; `BYPASSRLS` stays rejected because DigitalOcean grants no superuser.
- npm registry read plus `pnpm.overrides` — only if a version greater than 4.2.0 is actually published.

## Decisions & alternatives

- **`SET LOCAL ROLE` on the current owner connection** over a second reservations connection string — the second string is a secret, this run must not write or read secrets, and the one Pulumi `databaseUrl` is also `DATABASE_URL` for users-api, agent-api, and all three migrate jobs. Retargeting it would point those services at a role that must not own their tables.
- **`NOLOGIN` role, owner granted membership in it** over `GRANT` of the owner to the app role — membership the other way makes `pg_has_role(..., relowner, 'MEMBER')` true, which is the second conjunct of the cross-venue policies, so the app could set `app.cross_venue` and read every venue. `NOINHERIT` is in addition to "no membership", not instead of it.
- **`FORCE` in the same pre-deploy as the role and the grants** over shipping the role without `FORCE` — without `FORCE`, any statement that forgets `SET LOCAL ROLE` is the owner and bypasses RLS, which is the bug. With `FORCE`, a forgotten `SET ROLE` still filters ordinary reads; the hatch stays forgeable only for that owner statement. The §3.3 sequence this would have depended on is already in this tree (`resolveVenueId`, `loadInVenueContext`, the fan-outs, the job-worker wraps). It is not deferred. There is no unmerged sequence grant: no `serial` / `identity` column exists.
- **Full switch in this run** over a tests-only smaller target — a smaller target would leave production queries on the owner with `FORCE` unset, so the policies would still be inert. The route sweep that measured the old 404s is `describe.skipIf(!DATABASE_URL)` and does not run in CI; that residual (a missed unscoped read returns empty, not a 5xx, once `FORCE` is on) is accepted and recorded, not used as a reason to skip the flip. Old containers during pre-deploy are the owner under `FORCE` with the §3.3 code that is already on this tree; they are not the pre-fix 404 shape.
- **Lowest published version greater than 4.2.0, scoped `pnpm.overrides`** over deleting the ignore, and over an open `>=` range — deleting the ignore while 4.2.0 is still the newest version re-breaks `pnpm audit`. The open range is the override shape called out in `.claude/rules/gotchas.md` (Dependencies).
- **No tracker write in this stage** over filing follow-up issues now — a work-order issue waits until its breakdown row exists (`adr0032-one-way-mirror`). The run id lives in this file's frontmatter (`adr0004-typed-ids-in-frontmatter`).

## ADRs

No new ADR. Amend ADR-026's last sentence, which still says the non-owner role and the FORCE flip are open, in the same change that lands them. A second ADR would restate ADR-026. The connection-string alternative and the `NOLOGIN` choice are recorded above; they are reversible by a later migration (`NO FORCE`, drop the role) and do not clear the bar for a new ADR on their own.
