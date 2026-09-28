---
stage: capture
run: maintenance:api-client-route-contract
date: 2026-09-22
re-entry: architect
origin: "docs/backlog.md seed (from: session:2026-08-30)"
assumptions:
  - 'Treated the whole `@mbe/api-client` path-literal surface as the condition''s subject — all four prefix families measured (`/api/v1`, `/public/v1`, `/v1/sessions`, `/api/health/system`) — not only the `/api/v1/...` literals the brief''s indicative per-module counts implied. The brief''s in-scope line ("the path half of the client↔service contract") is prefix-agnostic, so this reads as the brief''s intent rather than an expansion, but the decision was made without live user input.'
  - 'Two candidate live mismatches were measured statically at capture (`/api/health/system`, `/api/v1/venues/groups/by-slug/:slug`) and recorded as findings to carry forward, NOT fixed here and NOT probed against production. The brief authorizes fixing a live mismatch "the new guard discovers while being built"; it does not say whether a statically-measured, unprobed mismatch found at capture qualifies. Decision: carry them to Architect with evidence, do not act on them at capture.'
  - "`/api/health/system` has no Fastify owner at all — its nearest owner is the edge worker (`infrastructure/worker/edge-router.js`), which is outside the brief's three-service in-scope list. Left as an explicit OPEN SCOPE QUESTION for Architect rather than silently widening or narrowing the brief's scope."
---

# Condition: `@mbe/api-client` URL literals are pinned independently of the routes meant to answer them

<!-- Condition brief (something is degraded). Filename stays defect.md. -->

## Condition

**Degraded:** a `@mbe/api-client` URL literal and the service route meant to answer
it can diverge with every gate green. Each side's tests pin its own half, the E2E
mocks are written from the client so they mirror the client's half, and nothing in
the repo compares the two sets. Agreement is incidental, not enforced.

**Target state that ends the run:** a check that runs in CI on every pull request
and fails when a `@mbe/api-client` URL literal has no registered route in its owning
service — demonstrated to fail against a known-bad input and to pass once reverted,
with the coverage it does and does not reach stated explicitly.

## Reproduction / Evidence

All measurements below are from this worktree at `origin/main` `0a80ea85b`
(`.claude/worktrees/api-client-route-contract`, branch `fix/api-client-route-contract`),
2026-09-22. No live probe was performed; nothing here depends on one.

### The originating production defect (2026-08-30, already fixed)

`FloorPlansClient.setActive` posted to `/floor-plans/:id/active` and
`bulkUpdatePositions` to `/floor-plans/:id/bulk-update-positions` with a bare array,
while reservations registered `/:id/activate` and `/tables/positions` taking
`{ floorPlanId, positions }`. Both halves were green; the deployed API answered 404
to both; "Set as Active" and every position save in the floor-plan editor failed in
production.

**Confirmed fixed on `main`** — `packages/api-client/src/floor-plans.ts:58` now sends
`/api/v1/floor-plans/${id}/activate` and `:80` sends
`/api/v1/floor-plans/tables/positions` with `{ floorPlanId, positions }`, and both
are registered (see the route table below). These two literals are this run's
**reproduction evidence** for the guard's proof-of-failure, not its work.

### Both halves are real, and both boot

All three services expose `buildApp()` and boot far enough for
`app.printRoutes()` **without a live database** — Prisma connects lazily. Measured by
booting each one directly under `tsx` from a scratch script (outside the repo):

| Service                 | Routes enumerated | Booted with                                             |
| ----------------------- | ----------------- | ------------------------------------------------------- |
| `services/reservations` | 89 entries        | no mocks; needed `@mbe/types` + `@mbe/api-client` built |
| `services/users`        | 21 entries        | no mocks                                                |
| `services/agent`        | 31 entries        | no mocks; needed `@mbe/agent-core` built                |

The in-repo precedent for the same boot under vitest already exists —
`services/reservations/src/routes/contract.test.ts:52` does
`buildApp({ logger: false })` with `./services/database.js` mocked via
`@mbe/database/testing`'s `createMockDatabaseService()`, and
`services/users/src/app.test.ts:20` does the same.

**Measured caveat for Architect:** under `tsx` the service apps resolve workspace deps
to `dist/`, so a standalone script needs `@mbe/types`, `@mbe/api-client` and
`@mbe/agent-core` built first (each failure was a hard `ERR_MODULE_NOT_FOUND`, not a
silent skip). Under vitest they resolve to source. The harness choice changes the
build prerequisites.

### The client side is NOT a set of greppable literals

Literal extraction over `packages/api-client/src/*.ts` (excluding tests) yields
**47 distinct normalized paths** across four prefix families:

| Family               | Distinct paths | Owning service             |
| -------------------- | -------------- | -------------------------- |
| `/api/v1/...`        | 36             | reservations + users       |
| `/public/v1/...`     | 7              | reservations               |
| `/v1/sessions...`    | 3              | agent                      |
| `/api/health/system` | 1              | **nobody** — see Finding A |

That inventory is **incomplete by construction**. Seven further real client paths are
composed at runtime from module-level constants and a union-typed variable, and a
literal grep cannot see any of them:

- `packages/api-client/src/reservations.ts:79` — `const RESERVATION_BASE_PATH = "/api/v1/reservations"`, then `:100` `${RESERVATION_BASE_PATH}/me?page=…`, `:111`/`:129`/`:139`/`:150` `${RESERVATION_BASE_PATH}/${id}`, `:171` `${RESERVATION_BASE_PATH}/walk-in`
- `packages/api-client/src/deposits.ts:5` — `const DEPOSIT_BASE_PATH = "/api/v1/deposits"`, then `:38` `${DEPOSIT_BASE_PATH}/${id}` and `:68` **`${DEPOSIT_BASE_PATH}/${id}/${action}`** where `action: "capture" | "refund" | "forfeit"` — three distinct server routes behind one template

So the real client surface is ~54 distinct paths, of which **7 (13%) are invisible to
literal extraction**. All seven happen to be correctly registered today, so a
literal-only guard would be green _and_ blind — the exact shape of decoration this run
exists to avoid shipping.

Two client paths also carry query strings inside the path literal
(`reservations.ts:100`, `:183`), which must be stripped before comparison.

### The service side is not statically greppable either

Route paths are declared as bare string literals on their own line after a multi-line
TypeScript generic (e.g. `services/reservations/src/routes/tables.ts:40-44` —
`fastify.get<{…}>(` spans four lines before `"/"`), and prefixes are applied at
registration (`services/reservations/src/app.ts:224-261`). Runtime enumeration
(`printRoutes()` / an `onRoute` hook) is the only reliable read of this half.

### `contract.test.ts` is weaker than the brief describes — measured

The brief records that `packages/api-client/src/contract.test.ts` "diffs Zod schemas in
`@mbe/types` against the JSON Schemas the services re-export". **Measured: it does not.**
Both sides are imported from the _same_ package — `@mbe/types/schemas` (lines 5-14 and
17-26) — and no service is imported anywhere in the file. Worse, the "server side" is
_derived from_ the client side: `packages/types/src/schemas/json-schema.ts:204` is
`export const userJsonSchema = toFastifyJsonSchema("User", UserSchema)`, generated from
the very `UserSchema` the test compares it against. The test can only fail if
`toFastifyJsonSchema` drops a key. It is closer to tautological than to a contract
check, and the file's name reads as covering "the contract" while covering neither half
against a service.

Related, minor: `test:contract` exists as a script (`packages/api-client/package.json:35`)
and a turbo task (`turbo.json:97`) but **no workflow invokes it** — grep over
`.github/workflows/` returns nothing. `contract.test.ts` does still run in CI, picked up
by `vitest run` under the `test` / `test:coverage` task (`ci.yml:541`), so the dedicated
entry point is dead rather than the test itself.

## Findings: two candidate live mismatches, measured at capture

Both were found by diffing the measured client inventory against the measured route
tables. **Neither was probed against production** — recorded as findings, not fixed here
(see `assumptions:`).

### Finding A — `GET /api/health/system` has no route anywhere (live UI consumer)

- Client sends it: `packages/api-client/src/health.ts:13` (`SYSTEM_HEALTH_PATH`), via `HealthClient.system()`.
- Real consumer: `apps/hospitality/src/components/SystemHealthBadge.tsx:53` calls `api.health.system()`.
- Base URL is relative (`apps/hospitality/src/hooks/useApiClient.ts:12` — `import.meta.env.VITE_API_URL ?? ""`), so the request goes to the apex host and hits the edge worker.
- The edge worker answers `/health/system` by **exact match, with no `/api` prefix**: `infrastructure/worker/edge-router.js:147` (`if (url.pathname === "/health/system")`).
- `/api` **is** an origin route (`infrastructure/worker/routes-config.json` → `originRoutes: ["/api","/public"]`), and the proxy preserves the path verbatim: `edge-router.js:214` — `new URL(url.pathname + url.search, env.API_ORIGIN)`.
- No Fastify service registers it. Measured health routes: reservations `/health`, `/api/health`, `/api/v1/reservations/health`; users `/health`, `/api/v1/users/health`; agent `/health`, `/api/gen/health`.

**Reading:** `/api/health/system` matches nothing at the edge and nothing at origin. Same
shape as the 2026-08-30 floor-plan pair, with a live dashboard consumer. **Open scope
question for Architect:** its nearest owner is the edge worker, which is outside the
brief's three-service in-scope list — decide whether the guard compares against the edge
worker's route table too, or whether this finding ships as a separate fix.

### Finding B — `GET /api/v1/venues/groups/by-slug/:slug` is not registered (latent)

- Client sends it: `packages/api-client/src/venues.ts:125` (`VenueGroupsClient.getBySlug`).
- `services/reservations/src/routes/venues.ts` declares `"/by-slug/:slug"` at `:551` (the _venue_ route, → `/api/v1/venues/by-slug/:slug`) and `"/groups"` / `"/groups/:id"` at `:115`/`:147`/`:196`/`:252`/`:307`. There is no `"/groups/by-slug/:slug"`.
- Confirmed against the booted route table: `/api/v1/venues/by-slug/:slug` present, `/api/v1/venues/groups/by-slug/:slug` absent.
- Segment count rules out an accidental match on `/api/v1/venues/groups/:id`.

**Reading:** a real path-half mismatch, but **latent** — no application calls it. Every
`getBySlug` call site found (`apps/hospitality/src/hooks/useVenues.ts:51`,
`pages/PublicBookingPage.tsx:51`, `pages/VenueOnboardingPage.tsx:52`) is the _venue_
client, not the group client. Lower severity than Finding A; still exactly what the
guard must catch.

## Root-cause hypothesis

**Hypothesis (not a finding):** two independently-pinned halves of one contract. The
client's tests assert the client's own literal; the service's tests assert the service's
own registration; the E2E route mocks were authored from the client, so they reproduce
the client's literal faithfully rather than the service's truth. Nothing compares the
two sets, so agreement is incidental. The measurements above are consistent with this
and add a second contributing factor: the one file named `contract.test.ts` in the client
compares a package against itself, which makes the gap _look_ covered.

## Blast radius

- **Who:** every `@mbe/api-client` consumer — `apps/hospitality` most of all, plus `apps/gen`, `apps/rialto-web`, `packages/rialto`, `packages/notifications`, `packages/agent-core`, `tools/cli`, `services/agent` (all declare the dependency).
- **How badly:** total for the affected call — the feature simply does not work in production — and invisible to lint, typecheck, unit tests, E2E, and human review. A 404 is the only symptom and it surfaces in a browser, not a gate.
- **Since when / duration:** unbounded. The floor-plan pair shipped and stayed broken until a human curled the live route. Finding B has no known first-broken date; Finding A's client constant is unchanged in the current tree.
- **Surface at risk:** ~54 distinct client paths against 141 registered route entries across three services (89 reservations + 21 users + 31 agent, including docs/health/OPTIONS entries).

**Scale implication:** Review and Ship scale to a test-plus-CI-wiring change with no
runtime code path — small — _unless_ Finding A is taken in-scope, which would add a
user-facing production fix and raise Ship's blast radius accordingly.

## Ruled out

- **Re-fixing the two 2026-08-30 floor-plan URLs.** Confirmed already fixed on `main` (`floor-plans.ts:58`, `:80`). They are the guard's proof-of-failure input, not work.
- **Per-side unit tests.** Both sides already had them and both were green while production 404'd. Still true: `packages/api-client/src/floor-plans.test.ts` and `services/reservations/src/routes/floor-plans.test.ts` both exist.
- **E2E route mocks.** Written from the client, so they reproduce the client's literal faithfully. They cannot be the oracle for the client.
- **Extending `packages/api-client/src/contract.test.ts` in place as-is.** Not ruled out as a _location_, but ruled out as a _model_: it compares `@mbe/types` to itself and imports no service. Reusing its shape would reproduce the tautology.
- **Hosting the guard inside `packages/api-client`.** Measured cycle: `services/agent/package.json:32` declares `@mbe/api-client`, and `services/reservations` reaches it transitively via `@mbe/notifications` (observed as a resolution chain: `services/reservations/src/…` → `packages/notifications/src/twilio-sms-adapter.ts` → `@mbe/api-client`). `packages/api-client/package.json` depends only on `@mbe/types` and `zod`. Importing service apps from the client package would close a dependency loop.
- **Static parsing of either half.** Measured above: client paths are composed from constants and a union-typed segment (7 of ~54 invisible to grep); service paths sit behind multi-line generics with registration-time prefixes.

## Open questions for Architect

1. **Scope of "owning service".** Does the guard compare against the edge worker's route table (`infrastructure/worker/edge-router.js` + `routes-config.json`) as a fourth owner, or only the three Fastify services? Finding A is unresolvable without answering this.
2. **Where the guard lives / which package owns it.** Not `packages/api-client` (cycle, measured). Candidates: a service-side test, a root-level `scripts/` check (note: `scripts/**` is outside the lint gate), or a new package.
3. **How client paths are enumerated.** Static parse (measurably misses 7 paths), runtime interception of the transport seam, or an exported route map the client and the guard share.
4. **Param normalization.** `:venueId` vs `:id`, `${id}` vs `:p`, and embedded query strings — what canonical form both halves reduce to.
5. **Routes with no client caller.** The set is non-empty and sizeable (`/api/v1/events/*`, `/api/v1/floor-plans/venue/:venueId/active`, `/api/v1/floor-plans/tables/:tableId/assign|remove`, `/api/v1/waitlist/:id/{cancel,expire,notify,seat}`, `/api/v1/reservations/metrics/daily`, `/api/v1/stripe/webhook`, `/api/gen/*`, `/v1/orchestrate`, `/v1/webhooks/*`, docs/health/OPTIONS). Decide whether the diff is one-directional (client → service) or reports both, and whether the reverse direction is a failure or a report.
6. **Test harness and build prerequisites.** vitest (resolves workspace deps to source) vs a standalone script (needs `@mbe/types`, `@mbe/api-client`, `@mbe/agent-core` built first — each a hard `ERR_MODULE_NOT_FOUND`). This decides what CI must build before the guard runs.

## Re-entry depth

**`re-entry: architect`** — the brief recommended it "to be confirmed against the code";
confirmed, with the six open questions above as the evidence. The decisive ones are
measured, not stylistic:

- The guard cannot live in the package that owns the literals (dependency cycle, measured).
- Neither half can be enumerated by static parsing (7 of ~54 client paths invisible; service paths behind multi-line generics).
- The comparison surface spans four prefix families and a fourth route owner the brief's scope does not name.

`re-entry: implement` was genuinely available and is rejected on evidence: this is not a
mechanical diff with one obvious home.

Per the protocol, work items are therefore **not** drafted here — the
`architecture.md` + `breakdown.md` chain owns them.

## Notes

- **2026-09-22, capture.** Worktree builds performed for measurement only: `pnpm --dir packages/types build`, `pnpm --dir packages/api-client build`, `pnpm build --filter @mbe/agent-core`. All outputs land in gitignored `dist/` (`git check-ignore` confirms `.gitignore:6 dist/`); `git status --porcelain` shows no tracked modification from this stage.
- **2026-09-22, capture.** The brief's indicative per-module URL counts (venues 9, availability 6, tables 5, guests 5, floor-plans 5, public-venue 4, users 3, health 2, agent-sessions 2, deposits 1) are **superseded by measurement**. They appear to have counted occurrences rather than distinct paths, and they imply `public-venue.ts` / `health.ts` / `agent-sessions.ts` carry `/api/v1/` literals — measured, those three carry `/public/v1/`, `/api/health/system` and `/v1/sessions` respectively. The measured inventory in this brief is the one to build from.
- **2026-09-22, capture.** No tracker intake for this run (brief). The backlog seed was claimed in place in `docs/backlog.md` with `(claimed: maintenance:api-client-route-contract)`.
- Route tables were enumerated by flattening `app.printRoutes({ commonPrefix: false })` from a scratch script outside the repo tree. Nothing was written into the repo by that measurement.
