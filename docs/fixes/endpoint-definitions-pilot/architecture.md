---
stage: architect
run: maintenance:endpoint-definitions-pilot
date: 2026-10-04
ux: not-applicable — maintenance run, no user-facing surface (defect.md § Condition)
assumptions:
  - "Design choice: a single `defineEndpoint` contract object in `@mbe/types` + one generic `ApiClient.call(def, input)` + one Fastify `registerEndpoint(fastify, def, opts)` helper in `@mbe/service-bootstrap`, with `GuestsClient` kept as a thin hand-written facade so its public positional signatures (and therefore all 11 hospitality call sites) stay byte-identical. Chosen over (a) pure minimal (hooks call `api.call` directly) and (b) a generated per-domain client — see § Decisions. Autorun: the deepen pattern names both designs; this is the recommended hybrid."
  - "Open decision 1 (runtime validation for `getLapsing` / `sendWinBack`): YES — every migrated endpoint validates its success body through `call`, because the definition supplies the schema. Recommended default; reversible per endpoint. A mismatch surfaces as the same `ApiValidationError` → `onError` path 8 of 11 guests methods already take (`client.ts:126-134`)."
  - "Open decision 2 (LapsingGuest `communicationPreference`): align on the enum (`z.enum` matching `GuestSchema`, `schemas/guest.ts:24`, and the TS type the widget already narrows on, `LapsingGuestsWidget.tsx:28`). Consequence, stated not hidden: exactly ONE documentation-only OpenAPI delta — `enum: [email_only, sms_only, both, transactional_only]` added under `getLapsingGuests` → 200 → `data.items.communicationPreference`. Wire bytes unchanged (fast-json-stringify does not enforce `enum`; Fastify does not validate responses). This is the only place the pilot departs from byte-identical OpenAPI; the parity snapshot diff in PR 3 is the record. Fallback if the reviewer/Matt rejects it: `z.string()` for that one field and `LapsingGuest` stays a hand interface — OpenAPI then byte-identical. Autorun default (recommended option); reversible."
  - "There is NO route-level OpenAPI baseline today. The existing baselines are entity-level only: `services/reservations/src/schemas/schema-baseline.json` and `services/reservations/src/schemas/__snapshots__/schemas.test.ts.snap` (Guest#, GuestSegment#, Pagination#, Error# …). They must not change in this run. The route-level guarantee is created by PR 2 (`guests-openapi.test.ts` + its snapshot) before any route is touched."
  - 'Route-level response JSON is derived with Zod''s `toJSONSchema` target `openapi-3.0` (emits `nullable: true`, matching the hand-written lapsing schema `routes/guests.ts:465-466`) and has `required` / `additionalProperties` stripped (the hand-written envelopes declare neither). Shared entities map to `$ref: "<Id>#"` through Zod''s `override` hook against an explicit identity table. Verified available in the installed zod (`to-json-schema.d.ts`: `target: … "openapi-3.0"`, `override`). If either misbehaves, the PR 2 snapshot fails loudly; fallback is an override that rewrites `anyOf:[X,{type:null}]` → `X + nullable`.'
  - "Path params are interpolated with `encodeURIComponent` (today: raw `${id}`, `guests.ts:75`); query strings go through the existing `buildQueryString` (today `getSegments`/`getLapsing` hand-append `?venueId=${venueId}` unencoded, `guests.ts:65,117`). Identical bytes for every legal id/venueId (cuid/uuid); recorded as a behaviour change for non-URL-safe input only."
  - "The route-contract parity check compares request bodies, querystrings, and success-response schemas. Querystring is included alongside bodies because it is the same comparator and defect.md names 'query names' as an unguarded drift class; params/path are already covered by the existing method+path join."
  - "OpenAPI docs metadata (`summary`, `operationId`, `description`, `tags`, `security`) stays at the route registration, not in the definition — it is server-only, and putting it in `@mbe/types` ships prose into the hospitality bundle (`packages/api-client` carries size-limit budgets). Per-status response `description` lives in the definition because it is keyed by the same status code as the schema."
  - "Tests-first ordering is satisfied by putting the parity guard (PR 2) before the migration (PR 3). The generic machinery (PR 1) lands first because the guard needs a runtime capture point (`ApiClient.call`) to read the client's declared body/query schemas; PR 1 changes no route and no client method."
---

# Architecture: declare an endpoint once — guests-domain pilot

## Approach

Give the endpoint a home. A plain, Zod-only **endpoint definition**
(`method`, absolute `path`, `params` / `query` / `body` schemas, and a
`responses` table keyed by status) lives in `@mbe/types`. Two adapters
consume the same object: on the server, `registerEndpoint` turns it into the
Fastify route's `schema` (request schemas through the existing
`toRequestJsonSchema`, `json-schema.ts:188`; response schemas through a new
`toResponseJsonSchema` that keeps shared entities as `$ref: "Guest#"`) and
types the handler via `z.output`; on the client, one generic
`ApiClient.call(def, input)` builds the URL, sends the body, and validates
the success body with the definition's own schema. Domain clients stay as
thin facades so no consumer moves. `tools/route-contract` gains a
schema-parity check — client-declared vs route-registered body, query and
success response, compared after normalization — written and pinned against
today's guests code before the migration lands. The shape was chosen after
comparing two interfaces against the real call sites (§ Decisions).

### The two designs compared (deepen pattern)

Checked against `packages/api-client/src/guests.ts` (11 methods, positional
signatures, 8 pass a schema), `services/reservations/src/routes/guests.ts`
(11 routes, Zod-derived request schemas, hand-written response envelopes),
`apps/hospitality/src/hooks/useGuests.ts` (9 call sites, lines 29-153) +
`useGuestDirectory.ts:98,109` (2), and `ApiClient` (`client.ts:75-289`).

|                                           | (a) Minimal: `defineEndpoint` + generic caller used directly                                                                                                                                                                       | (b) Generated per-domain client from an endpoint map                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface a caller learns                 | `api.call(def, { params, query, body })`                                                                                                                                                                                           | `api.guests.<name>({ params, query, body })`                                                                                                                                                        |
| Hospitality call sites                    | All 11 rewritten; each must unwrap `.data` itself (8 endpoints are `{ data: … }`) and stringify numeric query values (`limit: 50`, `useGuests.ts:29`, vs wire-typed `page`/`limit: z.string()`, `reservation-requests.ts:175-176`) | All 11 rewritten to object-input form; positional ergonomics (`get(id)`, `addNote(id, text)`, `getSegments(venueId)`) are not expressible without per-method adapters — which is (a)'s facade again |
| `tools/route-contract` driver             | Breaks the roster model — it enumerates sub-client prototype methods (`client-inventory.ts:163,235`); deleting `GuestsClient` leaves nothing to drive                                                                              | Generated objects have no prototype methods; driver and its anti-narrowing checks need rework                                                                                                       |
| New machinery                             | One generic method                                                                                                                                                                                                                 | Mapped-type generator + envelope-unwrap policy encoded in the map                                                                                                                                   |
| Coexistence with the other 12 sub-clients | Fine                                                                                                                                                                                                                               | Two client styles **and** two method-input conventions                                                                                                                                              |

**Chosen: (a)'s single contract object and single generic caller, with the
domain facade retained.** The facade is the one part (a) would delete, and
the deletion test says keep it: removing it moves argument shaping and
envelope unwrapping into 11 hook call sites. It holds no contract facts —
every path, method and schema comes from the definition — so it cannot
drift; the compiler pins its argument mapping because `call`'s `input` is
typed from the definition.

## Components

### Endpoint definitions — `packages/types/src/endpoints/`

- Responsibility: the one statement of each endpoint's wire contract.
  `define.ts` holds `defineEndpoint` (an identity function that exists for
  inference) and the `problem(description?)` response marker;
  `guests.ts` holds `guestsEndpoints` — 11 entries, one per row of
  defect.md's pilot table. Imports Zod only — no JSON Schema, no Fastify,
  no prose docs — so it is safe in the client bundle.
- Collaborators: `schemas/guest.ts` (gains `LapsingGuestSchema`,
  `WinBackResultSchema`), `schemas/reservation-requests.ts` (existing guests
  request schemas, reused unchanged), `schemas/common.ts`
  (`paginatedResponseSchema`).

### Response JSON derivation — `packages/types/src/schemas/json-schema.ts`

- Responsibility: `toResponseJsonSchema(zod)` — the server-side translation
  of a definition's response body into the JSON Schema Fastify serializes
  with and @fastify/swagger documents. Owns the `SHARED_RESPONSE_REFS`
  identity table (`GuestSchema → "Guest#"`, `GuestSegmentSchema →
"GuestSegment#"` for the pilot), placed beside the `toFastifyJsonSchema`
  calls that assign those `$id`s (`json-schema.ts:231-233`) so the two can
  only be edited together. `Pagination` is deliberately absent: list routes
  inline it today (`list-utils.ts:60-70`).
- Collaborators: `toRequestJsonSchema` (unchanged), `registerEndpoint`,
  route-contract normalizer.

### `registerEndpoint` — `packages/service-bootstrap/src/register-endpoint.ts`

- Responsibility: register one Fastify route from one definition. Computes
  the relative URL from `fastify.prefix` (guests plugin is mounted at
  `/api/v1/guests`, `app.ts:248`), builds `schema` (`params`/`querystring`/
  `body` via `toRequestJsonSchema`; `response` via `toResponseJsonSchema`
  for bodies, `{ description?, $ref: "Error#" }` for `problem()`,
  `{ description, type: "null" }` for 204), merges route-supplied docs
  metadata, and types `handler` from the definition.
- Collaborators: `@mbe/types` (definitions + derivation), Fastify. Adds no
  dependency — `service-bootstrap` already depends on both.

### `ApiClient.call` — `packages/api-client/src/client.ts`

- Responsibility: execute one definition. Interpolates `:param` segments,
  appends `query` with `buildQueryString` (`client.ts:12`), serializes
  `body`, chooses the method (so retry policy, `SAFE_RETRY_METHODS`
  `client.ts:34`, is untouched), and passes the definition's single 2xx body
  schema to the existing `request` for validation. Returns the full wire
  body; it does not unwrap.
- Collaborators: `request` (unchanged). Existing `get`/`getOne`/… stay for
  the 12 unmigrated sub-clients.

### `GuestsClient` facade — `packages/api-client/src/guests.ts`

- Responsibility: keep the public, positional API that hospitality calls.
  Each method is one `call` plus, where the endpoint is enveloped, `.data`.
  Public types `ListGuestsParams`, `SearchGuestsParams`,
  `FindOrCreateGuestRequest` stay exported (the last becomes
  `z.input<typeof FindOrCreateGuestBodySchema>`).
- Collaborators: `ApiClient.call`, `guestsEndpoints`.

### Guests routes — `services/reservations/src/routes/guests.ts`

- Responsibility unchanged: preHandlers (auth, venue access), handler
  bodies, ADR-002 problem replies. Each `fastify.<verb><{…}>(path, {schema})`
  becomes `registerEndpoint(fastify, guestsEndpoints.<name>, { docs,
preHandler, handler })`. Route generics, inline response objects, and
  the `createListResponseSchema` import disappear.

### Route-contract schema parity — `tools/route-contract/src/schema-parity.ts`

- Responsibility: for each driven client invocation in a domain listed in
  `PARITY_DOMAINS`, compare what the client declares at runtime with what
  the owning route registers, after one normalization. Client side: a spy on
  `ApiClient.prototype.call` captures the definition (body/query schemas);
  a spy on `ApiClient.prototype.request` captures the response schema for
  any call path (so today's 8 schema-passing methods are compared too).
  Route side: the reservations test boot's `app.swagger()` document — the
  very artifact the OpenAPI constraint protects — read at the matched
  path+method. A pure `normalize` resolves `$ref`s (`Guest#` and
  swagger's `#/components/schemas/…`), rebuilds querystring objects from
  swagger `parameters`, drops `description`/`$id`/`title`/`examples`,
  drops `required` on the response side only (routes never declare it, and
  will not under the OpenAPI constraint), and unifies the two nullable
  spellings. Client Zod is converted with the same `toRequestJsonSchema` /
  `toResponseJsonSchema` the server uses.
- Collaborators: `client-inventory.ts` (driver), `fastify-owners.ts` (gains
  an accessor for the test boot's swagger document), `route-contract.test.ts`.

## Data model

No persistent data. The model is the definition type:

```ts
type Responses = { [status: number]: { description?: string; body: ZodType | null } | Problem };

interface EndpointDefinition<M, P, Params, Query, Body, R extends Responses> {
  method: M; // "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: P; // absolute, Fastify syntax: "/api/v1/guests/:id"
  params?: Params; // z.object; keys must equal the :segments in path
  query?: Query; // z.object (wire-typed: strings)
  body?: Body; // z.object
  responses: R; // exactly one 2xx entry
}
```

Derived types, consumed instead of restated: `EndpointInput<D>` =
`{ params: z.input<Params>; query: z.input<Query>; body: z.input<Body> }`
(each key present only when declared); `EndpointSuccess<D>` = `z.output` of
the single 2xx body; `EndpointRouteGeneric<D>` = Fastify's `{ Params,
Querystring, Body, Reply }` from `z.output` (querystring defaults such as
`page: "1"` are applied by AJV `useDefaults`, so `z.output` is the truthful
handler type).

**Pilot entities.** `LapsingGuestSchema` (8 fields, `email`/`phone`
nullable, `communicationPreference` enum — decision 2) and
`WinBackResultSchema` (`{ sent: boolean }`) are added to `schemas/guest.ts`.
`LapsingGuest`, `CreateGuestRequest`, `UpdateGuestRequest` in
`packages/types/src/guest.ts:47-79` become `z.infer`/`z.input` aliases of
their schemas — same names, same exports, so `LapsingGuestsWidget.tsx`,
`useSSESync.tsx:50` and `services/guest.ts:401` keep compiling unchanged.

**Access patterns.** Read at module load (definitions are constants); read
at route registration (once per boot); read per client call. No
consistency question beyond "server and client import the same constant",
which the workspace build guarantees and route-contract verifies.

**Invariants and owners.** Path/params agreement and the single-2xx rule are
owned by `defineEndpoint`'s types and re-asserted by `registerEndpoint` at
boot. Entity `$id` ↔ Zod identity is owned by `SHARED_RESPONSE_REFS`.

## Interfaces & contracts

### `defineEndpoint(def)`

- Input: an `EndpointDefinition` literal.
- Output: the same object, type-narrowed.
- Failure modes: compile-time only — a `:param` without a `params` key, or
  zero/multiple 2xx responses, fails `tsc`. (Vitest does not typecheck;
  `pnpm typecheck` is the gate.)

### `registerEndpoint(fastify, def, { docs, preHandler?, handler })`

- Input: a Fastify plugin instance whose `prefix` is a prefix of
  `def.path`; docs metadata (`summary`, `operationId`, `description`,
  `tags`, `security`); preHandlers; a handler typed from the definition.
- Output: one registered route whose `schema` deep-equals what the
  hand-written registration produced (proven by the PR 2 snapshot).
- Failure modes: throws synchronously at registration — so the service
  fails to boot and every test of it fails — when `def.path` is not under
  `fastify.prefix`, when there is not exactly one 2xx response, or when
  a `params` key has no matching `:segment`. No runtime cost per request:
  validation and serialization are Fastify's, unchanged.

### `toResponseJsonSchema(zod)`

- Input: a Zod schema.
- Output: JSON Schema (OpenAPI-3.0 flavour) with shared entities as
  `$ref: "<Id>#"`, no `required`, no `additionalProperties`.
- Failure modes: a schema that is a _copy_ of a shared entity (e.g.
  `GuestSchema.extend(…)`) inlines instead of `$ref`-ing — silently in the
  function, loudly in the OpenAPI snapshot. Unrepresentable Zod
  (`unrepresentable: "any"`, as today) degrades to `{}`.

### `ApiClient.call(def, input, override?)`

- Input: a definition, `EndpointInput<D>`, optional `PerRequestOptions`.
- Output: `Promise<EndpointSuccess<D>>`; `undefined` for 204.
- Failure modes: unchanged from `request` — `ApiClientError` carrying RFC
  7807 `ProblemDetails` for non-2xx (ADR-002/008); `ApiValidationError` when
  the success body fails the definition's schema (now also for
  `getLapsing`/`sendWinBack`, decision 1); timeout 30 s default, aborts via
  `AbortSignal.timeout` (`client.ts:376`); retries only GET/HEAD/PUT/DELETE
  on 502/503/504/network error, POST/PATCH never unless
  `idempotentRetry` — the method now comes from the definition, so
  `findOrCreate`/`addNote`/`sendWinBack` (POST) remain non-retried.

### Route-contract parity verdict

- Input: the driven client inventory + the reservations test boot.
- Output: one failure line per mismatch — client method, method + path,
  facet (`body` / `query` / `response`), and the first differing JSON
  pointer.
- Failure modes: a domain in `PARITY_DOMAINS` whose methods produce zero
  captures fails the anti-vacuity check (same principle as `vacuity.ts`).
  Domains not in `PARITY_DOMAINS` are not compared — that is the
  coexistence seam, and the list only grows.

## Stack & dependencies

- No new runtime dependency. Zod 4 (`catalog:` `^4.6.5`) already provides
  `toJSONSchema` with `target: "openapi-3.0"` and `override`; Fastify 5 and
  @fastify/swagger 9 are already in `service-bootstrap`.
- `/api/v1` prefix (ADR-007) is preserved by construction: definitions carry
  the absolute path; plugin prefixes in `app.ts` are unchanged.
- ADR-002/008: error responses stay `$ref: "Error#"` (RFC 7807, registered
  under the legacy id, `schemas/index.ts:23`).

## Decisions & alternatives

- **Hybrid (contract object + generic caller + retained facade)** over (a)
  facade-less generic caller — rewrites 11 hospitality call sites and breaks
  route-contract's prototype-roster driver for no contract gain; and over
  (b) generated per-domain client — same call-site churn, cannot express
  positional signatures, adds a mapped-type generator.
- **Definitions are Zod-only data in `@mbe/types`** over definitions that
  also carry JSON Schema or docs — keeps JSON Schema derivation and prose on
  the server side of the seam and out of the size-limited client bundle.
- **`registerEndpoint` helper** over a pure `routeSchema(def)` the route
  spreads into `fastify.get(...)` — the helper also owns prefix-relative
  URL and handler typing, which would otherwise be restated per route.
- **Response `$ref`s via Zod `override` + explicit identity table** over Zod
  metadata-registry `id`s with `external.uri` — the registry route emits
  `$defs`/URI refs that do not match Fastify's `"Guest#"` spelling without
  further rewriting.
- **Strip `required` from route response schemas** over emitting it —
  byte-identical OpenAPI, and emitting it would make fast-json-stringify
  throw (500) on any omitted field, a serialization behaviour change.
- **Route side of parity read from `app.swagger()`** over capturing raw
  route options — Fastify's `findRoute` returns only `{ handler, params,
searchParams }` (`fastify/lib/route.js:180-197`) and `buildApp` exposes no
  pre-registration hook; the swagger document is public API and is exactly
  the artifact the constraint protects.
- **Pinned known-gaps list in PR 2** over a red test or an `it.skip` — main
  stays green, the guard is live from PR 2 for every other facet, any new
  drift _or_ accidental fix fails it, and PR 3 deletes the list.
- **Facade unwraps `.data`; `call` does not** over an `envelope` flag in the
  definition — the definition states the true wire shape; unwrapping is a
  caller convenience.

## Test plan and ordering

Mandatory order: guard first, migrate second, delete last.

1. **PR 2 — new tests at the intended interface, against today's code.**
   - `services/reservations/src/routes/guests-openapi.test.ts` (new):
     boots `buildApp`, snapshots `app.swagger().paths` filtered to
     `/api/v1/guests*` into `__snapshots__/guests-openapi.test.ts.snap`.
     Passes today; it _is_ the baseline.
   - `tools/route-contract/src/schema-parity.test.ts` (new, pure
     normalizer unit tests incl. one deliberately drifted fixture per facet)
     and a new `describe` in `route-contract.test.ts` asserting the guests
     parity failures equal `KNOWN_PARITY_GAPS`. Predicted today (Implement
     records the measured list): **body** 4 (`create`, `findOrCreate`,
     `update`, `addNote` — client declares no body schema), **query** 4
     (`list`, `search`, `getSegments`, `getLapsing`), **response** 2
     (`getLapsing`, `sendWinBack` — client declares no schema). The other 8
     response comparisons are expected to pass already.
2. **PR 3 — migrate.** `KNOWN_PARITY_GAPS` → deleted, guests failures must
   be `[]`. `guests-openapi` snapshot: zero diff except the decision-2
   `enum` line. Entity baselines (`schema-baseline.json`,
   `schemas.test.ts.snap`) zero diff. `services/reservations/src/routes/
guests.test.ts` (25 behaviour tests incl. 400/401/403/404, #3101 authz)
   and `guests-dietary.test.ts` pass unmodified — the evidence that Fastify
   validation behaviour is unchanged. `apps/hospitality` hook tests pass
   unmodified.
3. **PR 3, last commit — delete the shallow tests.**
   `packages/api-client/src/guests.test.ts` is deleted in full (17 tests).
   Coverage moved: the 12 request-shape and unwrap assertions (lines 55-202) → the
   existing route-contract method+path join plus the new body/query parity;
   the 3 "schema validation" tests (220-241) → `ApiClient.call` unit tests
   (PR 1) + response parity; the 2 "error handling" tests (204-218) →
   existing `client.test.ts` (404 categorization, network retry). The commit
   message states this mapping.

## PR plan

Each PR rebases on `origin/main`, passes `CI Gate`, and leaves main green.

| PR                                                                             | Contents                                                                                                                                                                                                                                                                                | Mergeable alone because                                |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1 `feat(types,api-client,service-bootstrap): endpoint definition machinery`    | `defineEndpoint` + types + `problem()`; `toResponseJsonSchema` + `SHARED_RESPONSE_REFS`; `registerEndpoint`; `ApiClient.call`. Unit tests for each (TDD), incl. a fixture definition proving `registerEndpoint` output for a `$ref` envelope, a list, a 204 and a nullable inline body. | Additive; no route or client method uses it yet        |
| 2 `test(route-contract,reservations): guests schema parity + OpenAPI baseline` | `guests-openapi.test.ts` + snapshot; `schema-parity.ts` + tests; `PARITY_DOMAINS = ["guests"]`; `KNOWN_PARITY_GAPS` pinned to the measured list                                                                                                                                         | Green by construction; the guard is live               |
| 3 `refactor(guests): declare each guests endpoint once`                        | `endpoints/guests.ts`, `LapsingGuestSchema`, `WinBackResultSchema`, type aliases; routes via `registerEndpoint`; facade via `call`; gaps list deleted; final commit deletes `api-client/src/guests.test.ts` with the coverage note                                                      | Parity `[]`, snapshot unchanged but the one named line |

Generated artifacts: post-commit `pack-changed` regenerates `llms.txt` /
`llms-full.txt` for `packages/types`, `packages/api-client`,
`packages/service-bootstrap`, `services/reservations`, root — stage them by
explicit path. Run `pnpm --dir packages/api-client size` on PR 1 and PR 3.
Coordination: #4 venue-scoped-routes edits the same guests preHandlers and
#2 sse-event-catalog touches `LapsingGuest` (`useSSESync.tsx:50`) — rebase
before PR 3 and keep `LapsingGuest`'s exported name and shape.

## Measured-cost template (filled by Implement/Ship into release.md, then reused per later domain)

| Measure                                                   | How measured                           | Guests (pilot)                  |
| --------------------------------------------------------- | -------------------------------------- | ------------------------------- |
| Endpoints migrated                                        | client methods ↔ routes                | 11                              |
| Parity gaps found by the PR 2 guard (real drift surfaced) | length of `KNOWN_PARITY_GAPS`          | _measured_                      |
| Route file LOC before → after                             | `wc -l routes/<domain>.ts`             | 597 → _                         |
| Client file LOC before → after                            | `wc -l api-client/src/<domain>.ts`     | 126 → _                         |
| Inline `type: "object"` literals before → after           | `grep -c` on the route file            | 15 → _                          |
| Hand TS interfaces replaced by `z.infer`                  | count                                  | _                               |
| New Zod schemas required (entities with no schema yet)    | count                                  | 2 (LapsingGuest, WinBackResult) |
| OpenAPI snapshot deltas                                   | lines in the PR 3 snapshot diff        | 1 (decision 2)                  |
| Tests deleted / added                                     | counts per file                        | _                               |
| Behaviour decisions surfaced                              | count, each named in release.md        | 2                               |
| Agent effort for the migration PR                         | wall-clock + tokens of the PR 3 worker | _                               |

Remaining domains, newest features first, priced from the pilot's
per-endpoint figures × their counts (defect.md evidence): venues 12,
reservations 11, availability 10, floor-plans 8, tables 7, users 7 (users
service — needs `registerEndpoint` in a second service, a real second
adapter), waitlist 7, deposits 5 (deposits route file has the most inline
objects, 29), public-venue 4, agent-sessions 4 (agent service, `/v1`
prefix), briefing 1, health 1.

## ADRs

None — no decision met the ADR bar. The endpoint-definition shape is
reversible per domain (two styles coexist by design), and each choice is
recorded above. Offer one at the end of the multi-domain migration if the
shape becomes the mandated style for new routes.
