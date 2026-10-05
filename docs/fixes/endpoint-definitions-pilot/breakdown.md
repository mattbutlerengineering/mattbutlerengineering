---
stage: decompose
run: maintenance:endpoint-definitions-pilot
date: 2026-10-04
assumptions:
  - "Review-the-cut step answered by the autorun brief rather than live: milestones are the three PRs of architecture.md § PR plan (binding per the autorun dispatch), so the milestone boundaries are not re-litigated here. Skill default (draft is the cut) taken."
  - "Tracker import/export: none — autorun-brief.md § Run says 'Tracker: none. No GitHub issue interaction.' No `(tracker: #N)` references."
  - "Each milestone = one PR, independently mergeable with main green: M1 additive (nothing calls the machinery), M2 green by construction (KNOWN_PARITY_GAPS pins today's measured failures), M3 deletes the gaps list and must reach parity `[]`. Items inside a milestone are commits on that PR, not separate PRs."
  - "M2 and M3 depend on M1 being merged to origin/main first (M2's client-side capture spies on `ApiClient.prototype.call`, which M1 adds; M3 consumes every M1 export). No stacking: each PR is cut from a fresh rebase on origin/main after its predecessor merges."
  - "Architecture decision 2 (LapsingGuest `communicationPreference` as enum, one documentation-only OpenAPI delta) is carried as an explicit reviewer checkpoint on item 3.1 / 3.6, with the `z.string()` fallback pre-specified — not re-decided here."
  - "The measured-cost recording is a final work item (4.1) whose output is the release.md table; it is checked off at Ship, since release.md is Ship's artifact. Implement fills the measured cells into this breakdown's Notes as each PR lands so Ship only transcribes."
---

# Breakdown: declare an endpoint once — guests-domain pilot

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met.

Every item lists: **Accept** (checkable criterion), **Test first** (what fails
first and why), **Files**, **Blocked by**. Gates for every PR: `pnpm install
--frozen-lockfile` and `pnpm build --filter @mbe/cli...` in a fresh worktree;
`pnpm typecheck` (Vitest does not typecheck — `defineEndpoint`'s compile-time
failure modes are only caught here); `pnpm lint`; `pnpm test` in each touched
package; `/local-ci-precheck`; rebase on `origin/main` immediately before
opening the PR; stage generated `llms.txt` / `llms-full.txt` by explicit path.

## Milestone 1 (PR 1): endpoint-definition machinery — additive, nothing uses it yet

Demonstrable: a fixture definition registers a Fastify route whose schema is
asserted, and `ApiClient.call` executes it end to end in unit tests. No route
or client method changes. PR title:
`feat(types,api-client,service-bootstrap): endpoint definition machinery`.

- [x] **1.1 `defineEndpoint` + derived types + `problem()`** — the contract object and its type helpers in `@mbe/types`.
  - Accept: `packages/types/src/endpoints/define.ts` exports `defineEndpoint`, `problem`, `EndpointDefinition`, `EndpointInput<D>`, `EndpointSuccess<D>`, `EndpointRouteGeneric<D>`; re-exported from the package entry. Type tests (`expectTypeOf` / `@ts-expect-error`) prove: a `:param` with no matching `params` key fails `tsc`; zero or two 2xx responses fail `tsc`; `EndpointInput` contains only the declared keys; `EndpointSuccess` is the `z.output` of the single 2xx body (and `undefined` for a `body: null` 204). `pnpm --dir packages/types typecheck` green.
  - Test first: `define.test.ts` with the type assertions and `@ts-expect-error` lines fails because the module does not exist; after the stub exists, the `@ts-expect-error` lines fail ("unused directive") until the param/2xx constraints are implemented.
  - Files: `packages/types/src/endpoints/define.ts`, `packages/types/src/endpoints/define.test.ts`, `packages/types/src/endpoints/index.ts`, `packages/types/src/index.ts`, possibly `packages/types/src/exports.test.ts` (if it pins the export list).
  - Blocked by: —
- [x] **1.2 `toResponseJsonSchema` + `SHARED_RESPONSE_REFS`** — server-side response derivation that keeps shared entities as `$ref`.
  - Accept: in `packages/types/src/schemas/json-schema.ts`, `toResponseJsonSchema(zod)` emits OpenAPI-3.0 JSON Schema (`nullable: true` for nullable fields), no `required`, no `additionalProperties`; `GuestSchema` → `{ $ref: "Guest#" }` and `GuestSegmentSchema` → `{ $ref: "GuestSegment#" }` via `override` against `SHARED_RESPONSE_REFS`, placed beside the `toFastifyJsonSchema` `$id` assignments. Unit tests: `{ data: GuestSchema }` envelope → `$ref` inside `properties.data`; `paginatedResponseSchema(GuestSchema)` matches the shape `createListResponseSchema("Guest#")` produces today (`list-utils.ts:60-70`) up to `required`; a nullable string field → `{ type: "string", nullable: true }`; `GuestSchema.extend(...)` inlines (documented failure mode). Entity baselines `services/reservations/src/schemas/schema-baseline.json` and `schemas.test.ts.snap` zero diff.
  - Test first: `json-schema.test.ts` new `describe("toResponseJsonSchema")` fails on the missing export; the nullable case is the first behavioural failure if the target is not `openapi-3.0` (Zod default emits `anyOf: [X, {type:"null"}]`). Fallback per architecture assumption: an override rewriting `anyOf` → `nullable`.
  - Files: `packages/types/src/schemas/json-schema.ts`, `packages/types/src/json-schema.test.ts`.
  - Blocked by: —
- [x] **1.3 `registerEndpoint` in `@mbe/service-bootstrap`** — register one Fastify route from one definition.
  - Accept: `packages/service-bootstrap/src/register-endpoint.ts` exported from the package index. Tests boot a bare Fastify instance with a plugin at prefix `/api/v1/things` and a fixture definition set covering: a `$ref` envelope response, a paginated list with query, a 204 (`type: "null"` + description), a nullable inline body, and a `problem()` → `{ $ref: "Error#" }`; assert the registered route's swagger output equals a hand-written expected schema; handler receives typed params/query/body. Throws synchronously at registration when `def.path` is not under `fastify.prefix`, when not exactly one 2xx, or when a `params` key has no `:segment`. Docs metadata (`summary`, `operationId`, `description`, `tags`, `security`) merges from the route options, never from the definition.
  - Test first: `register-endpoint.test.ts` fails on the missing module; the prefix-mismatch throw test is the first behavioural failure (proves the relative-URL computation is real, not a passthrough).
  - Files: `packages/service-bootstrap/src/register-endpoint.ts`, `packages/service-bootstrap/src/register-endpoint.test.ts`, `packages/service-bootstrap/src/index.ts`.
  - Blocked by: 1.1, 1.2
- [x] **1.4 `ApiClient.call(def, input, override?)`** — one generic client method executing a definition.
  - Accept: in `packages/api-client/src/client.ts`, `call` interpolates `:param` segments with `encodeURIComponent`, appends `query` via the existing `buildQueryString`, serializes `body`, takes the method from the definition (retry policy unchanged: POST/PATCH not retried unless `idempotentRetry`), passes the single 2xx body schema to the existing `request` for validation, returns the full wire body (no unwrap), returns `undefined` for 204. Unit tests: URL bytes for a cuid id are identical to today's raw interpolation; an id containing `/` is encoded (recorded behaviour change for non-URL-safe input); schema mismatch → `ApiValidationError` through `onError`; non-2xx → `ApiClientError` with RFC 7807 `ProblemDetails`; a POST definition is not retried on 503. Existing `get`/`getOne`/`postOne`/`patchOne` untouched. `pnpm --dir packages/api-client size` within budget (record the delta in Notes).
  - Test first: `client.test.ts` new `describe("call")` fails on the missing method; the POST-not-retried case guards the "method comes from the definition" claim. These tests are where the 3 "schema validation" tests of `guests.test.ts` (lines 220-241) later land (see 3.7).
  - Files: `packages/api-client/src/client.ts`, `packages/api-client/src/client.test.ts`.
  - Blocked by: 1.1
- [x] **1.5 PR 1 gates, open, merge** — ship M1 under the release authorization.
  - Accept: rebased on `origin/main`; full gates green; generated llms artifacts for `packages/types`, `packages/api-client`, `packages/service-bootstrap`, root staged by explicit path; `reviewer` PASS; `CI Gate` green on final head; squash-merged with explicit `--subject`. No route file and no domain client file appears in the diff.
  - Test first: n/a (gate item) — the diff-scope check (`git diff --name-only origin/main...HEAD` contains no `routes/` or `api-client/src/<domain>.ts`) is the assertion.
  - Files: none new.
  - Blocked by: 1.1, 1.2, 1.3, 1.4

## Milestone 2 (PR 2): guard first — guests OpenAPI baseline + schema parity, green by construction

Demonstrable: route-contract now reports body / query / response parity for
the guests domain, and today's real mismatches are pinned by name. Main stays
green; any new drift _or_ accidental fix fails the build. PR title:
`test(route-contract,reservations): guests schema parity + OpenAPI baseline`.
No production code changes in this PR other than route-contract tooling and a
swagger accessor.

- [x] **2.1 Guests route-level OpenAPI snapshot** — the baseline the "OpenAPI unchanged" constraint is measured against.
  - Accept: `services/reservations/src/routes/guests-openapi.test.ts` boots `buildApp`, snapshots `app.swagger().paths` filtered to `/api/v1/guests*` (11 operations) into `__snapshots__/guests-openapi.test.ts.snap`; passes on today's code; snapshot committed. Determinism: run twice locally, zero diff (key ordering stable — no locale-sensitive sort).
  - Test first: written against today's code, so it is a baseline, not a red test — the "fails first" proof is to run once with an empty snapshot file and confirm Vitest writes it, then hand-edit one byte in the snapshot and confirm the test fails, then revert.
  - Files: `services/reservations/src/routes/guests-openapi.test.ts`, `services/reservations/src/routes/__snapshots__/guests-openapi.test.ts.snap`.
  - Blocked by: — (does not need M1; ordered here per the PR plan)
- [x] **2.2 `schema-parity.ts` normalizer + unit tests** — pure comparison of client-declared vs route-registered schemas.
  - Accept: `tools/route-contract/src/schema-parity.ts` exports a pure `normalize` that resolves `Guest#`-style and `#/components/schemas/…` `$ref`s, rebuilds querystring objects from swagger `parameters`, drops `description`/`$id`/`title`/`examples`, drops `required` on the response side only, unifies `nullable: true` vs `anyOf [X, null]`; and a `compareFacet` returning the first differing JSON pointer. `schema-parity.test.ts` covers each rule plus one deliberately drifted fixture per facet (`body`, `query`, `response`) that must report a mismatch with the right pointer.
  - Test first: the drifted fixtures fail first (module missing, then "expected a mismatch, got none" until each normalization rule is real) — a normalizer that erases everything would pass the equal cases, so the drifted cases are the meaningful red.
  - Files: `tools/route-contract/src/schema-parity.ts`, `tools/route-contract/src/schema-parity.test.ts`.
  - Blocked by: —
- [x] **2.3 Capture points + swagger accessor** — wire both sides of parity into the existing driver.
  - Accept: `client-inventory.ts` spies `ApiClient.prototype.call` (definition → body/query schemas) and `ApiClient.prototype.request` (response schema for any call path, so today's 8 schema-passing guests methods are compared); `fastify-owners.ts` exposes the reservations test boot's `app.swagger()` document. Existing route-contract, vacuity and driver-completeness tests still pass unchanged.
  - Test first: `client-inventory.test.ts` new case asserting a driven guests `list` call yields a captured response schema fails until the `request` spy exists; `fastify-owners.test.ts` new case asserting the swagger document contains `/api/v1/guests/lapsing` fails until the accessor exists.
  - Files: `tools/route-contract/src/client-inventory.ts`, `client-inventory.test.ts`, `fastify-owners.ts`, `fastify-owners.test.ts`, `types.ts`.
  - Blocked by: M1 merged (1.5 — `ApiClient.prototype.call` must exist on origin/main)
- [x] **2.4 Parity verdict + `PARITY_DOMAINS` + `KNOWN_PARITY_GAPS`** — the live guard, pinned to today's measured mismatches.
  - Accept: `route-contract.test.ts` gains a `describe` asserting guests parity failures **equal** `KNOWN_PARITY_GAPS` (exact set, so a new drift or an accidental fix both fail); `PARITY_DOMAINS = ["guests"]`; anti-vacuity: a listed domain producing zero captures fails. The pinned list is the **measured** one, recorded verbatim in Notes alongside architecture's prediction (body 4: create, findOrCreate, update, addNote; query 4: list, search, getSegments, getLapsing; response 2: getLapsing, sendWinBack). Any measured gap outside the prediction is a behaviour finding: record it in Notes and, if it implies a wire change rather than a missing client declaration, STOP and surface (brief § Constraints).
  - Test first: the equality assertion is written with an empty `KNOWN_PARITY_GAPS` first and run — it fails, listing today's real gaps (this is the "fails today on inline schemas" proof the brief requires); the measured list is then pinned.
  - Files: `tools/route-contract/src/route-contract.test.ts`, `tools/route-contract/src/route-contract.ts` (or a new `known-parity-gaps.ts`), `tools/route-contract/src/vacuity.ts` if the anti-vacuity check reuses it.
  - Blocked by: 2.2, 2.3
- [x] **2.5 PR 2 gates, open, merge** — ship the guard.
  - Accept: rebased on `origin/main` (after M1 merged); full gates green; `generated-artifact-determinism-reviewer` consulted if llms artifacts change; `reviewer` PASS; `CI Gate` green; squash-merged with explicit `--subject`. Diff touches no route handler, no client method, no `@mbe/types` schema.
  - Test first: n/a (gate item).
  - Files: none new.
  - Blocked by: 2.1, 2.4

## Milestone 3 (PR 3): migrate guests — declare each endpoint once, delete the gaps list, delete the shallow tests last

Demonstrable: all 11 guests endpoints are stated once in `@mbe/types`;
route-contract guests parity is `[]`; the OpenAPI snapshot is unchanged except
the one named decision-2 line. PR title:
`refactor(guests): declare each guests endpoint once`.

**Coordination (must do before opening):** rebase on `origin/main`. Run #2
`sse-event-catalog` touches `LapsingGuest` consumers (`useSSESync.tsx:50`) and
run #4 `venue-scoped-routes` will later edit the guests route preHandlers.
PR 3 must preserve `LapsingGuest`'s exported **name and shape** from
`@mbe/types` and must not alter preHandler arrays beyond moving them into
`registerEndpoint` options verbatim. If either run has merged, re-run 3.1–3.6
gates on the rebased head; if a preHandler conflict appears, keep origin/main's
preHandlers.

- [x] **3.1 `LapsingGuestSchema`, `WinBackResultSchema`, type aliases** — the two missing entity schemas; hand interfaces become `z.infer`/`z.input`.
  - Accept: `schemas/guest.ts` gains `LapsingGuestSchema` (8 fields, `email`/`phone` nullable, `communicationPreference` = the `GuestSchema` enum) and `WinBackResultSchema` (`{ sent: boolean }`). In `packages/types/src/guest.ts`, `LapsingGuest`, `CreateGuestRequest`, `UpdateGuestRequest` become aliases with the same names and exports; `LapsingGuestsWidget.tsx`, `useSSESync.tsx`, `services/guest.ts` compile unchanged (`pnpm typecheck` repo-wide). Entity baselines zero diff (these schemas are not registered as shared `$id`s).
  - **Reviewer checkpoint (architecture decision 2):** aligning `communicationPreference` on the enum adds exactly one documentation-only OpenAPI line (`enum: [email_only, sms_only, both, transactional_only]` under `getLapsingGuests` → 200 → `data.items.communicationPreference`); wire bytes unchanged. The PR description must call this out for the `reviewer` and Matt. **Fallback if rejected:** `communicationPreference: z.string()` and `LapsingGuest` stays a hand interface — OpenAPI then byte-identical, and the snapshot in 3.6 must show zero diff.
  - Test first: an `expectTypeOf<LapsingGuest>().toEqualTypeOf<z.infer<typeof LapsingGuestSchema>>()` assertion plus a parse test of a recorded lapsing payload fail on the missing schema.
  - Files: `packages/types/src/schemas/guest.ts`, `packages/types/src/guest.ts`, `packages/types/src/schemas.test.ts` (or a guest schema test).
  - Blocked by: M2 merged (2.5)
- [x] **3.2 `guestsEndpoints` definitions** — the 11 entries, one per defect.md pilot-table row.
  - Accept: `packages/types/src/endpoints/guests.ts` exports `guestsEndpoints` with 11 `defineEndpoint` entries (absolute `/api/v1/guests…` paths, existing request schemas from `reservation-requests.ts` reused unchanged, responses: `paginatedResponseSchema(GuestSchema)` for list/search, `{ data: … }` envelopes, `LapsingGuestSchema` list, `WinBackResultSchema`, 204 `null`, and every route's existing `problem()` statuses with their descriptions). Imports Zod only (no JSON Schema, no Fastify, no prose docs — checked by a test that the module graph has no `fastify` / `json-schema` import). Re-exported from the package entry.
  - Test first: a test iterating defect.md's 11 (method, path) pairs and asserting each has exactly one definition fails on the missing module.
  - Files: `packages/types/src/endpoints/guests.ts`, `packages/types/src/endpoints/guests.test.ts`, `packages/types/src/endpoints/index.ts`.
  - Blocked by: 3.1
- [x] **3.3 Guests routes via `registerEndpoint`** — each `fastify.<verb><{…}>(path, { schema })` becomes `registerEndpoint(fastify, guestsEndpoints.<name>, { docs, preHandler, handler })`.
  - Accept: route generics, inline response objects and the `createListResponseSchema` import removed from `services/reservations/src/routes/guests.ts`; handler bodies and preHandlers moved verbatim. `guests.test.ts` (25 behaviour tests incl. 400/401/403/404, #3101 authz) and `guests-dietary.test.ts` pass **unmodified**. `guests-openapi` snapshot: zero diff except the decision-2 line (or zero diff under the fallback). Entity baselines zero diff.
  - Test first: the PR 2 snapshot is the red — migrate one route, run `guests-openapi.test.ts`, and any derivation difference fails it before the next route is touched; migrate route by route.
  - Files: `services/reservations/src/routes/guests.ts`, `services/reservations/src/routes/__snapshots__/guests-openapi.test.ts.snap` (decision-2 line only).
  - Blocked by: 3.2
- [x] **3.4 `GuestsClient` facade via `call`** — keep the positional public API; each method is one `call` plus `.data` where enveloped.
  - Accept: `packages/api-client/src/guests.ts` holds no URL literal, no method string and no hand-picked schema; `ListGuestsParams`, `SearchGuestsParams`, `FindOrCreateGuestRequest` (now `z.input<typeof FindOrCreateGuestBodySchema>`) stay exported; `getLapsing` and `sendWinBack` now validate responses (decision 1 — mismatch → `ApiValidationError` via `onError`). `apps/hospitality` hook tests (`useGuests`, `useGuestDirectory`, `LapsingGuestsWidget`) pass unmodified; hospitality typecheck green. `pnpm --dir packages/api-client size` within budget.
  - Test first: route-contract parity — with `KNOWN_PARITY_GAPS` still present, migrating a facade method makes its pinned gap disappear and the exact-equality assertion fails ("accidental fix"), which is the signal to remove that entry; proceed method by method.
  - Files: `packages/api-client/src/guests.ts`.
  - Blocked by: 3.2
- [x] **3.5 Delete `KNOWN_PARITY_GAPS`** — the guard now demands parity.
  - Accept: the gaps list and its import are deleted; the guests parity assertion is `toEqual([])`; route-contract method+path join, vacuity and driver-completeness tests green.
  - Test first: emptied incrementally in 3.4; final deletion turns the equality into `[]` and passes only if all 10 pinned gaps are closed.
  - Files: `tools/route-contract/src/route-contract.test.ts` (and `known-parity-gaps.ts` if created).
  - Blocked by: 3.3, 3.4
- [x] **3.6 Snapshot + behaviour record** — prove the "must keep identical" constraints.
  - Accept: PR 3's diff to `guests-openapi.test.ts.snap` is exactly the decision-2 `enum` line (or empty under fallback); `schema-baseline.json` / `schemas.test.ts.snap` unchanged; ADR-002 `Error#` refs present on every guests operation in the snapshot; `/api/v1` prefix unchanged. Behaviour changes recorded in Notes: decision 1 (runtime validation on 2 methods), decision 2 (one OpenAPI doc line — **reviewer checkpoint**), `encodeURIComponent`/`buildQueryString` for non-URL-safe input.
  - Test first: n/a — this is the evidence assembly over 3.3's snapshot and the entity baselines.
  - Files: none beyond 3.3.
  - Blocked by: 3.5
- [x] **3.7 Last commit: delete `packages/api-client/src/guests.test.ts`** — remove the shallow-module tests, stating where coverage moved.
  - Accept: file deleted in full (17 tests) in the final commit of PR 3; commit message states: 12 request-shape/unwrap assertions (lines 55-202) → route-contract method+path join + body/query parity; 3 "schema validation" tests (220-241) → `ApiClient.call` unit tests (1.4) + response parity; 2 "error handling" tests (204-218) → existing `client.test.ts` (404 categorization, network retry). Coverage for `packages/api-client` stays ≥ 80%.
  - Test first: before deleting, temporarily break one facade method (e.g. wrong body key) and confirm route-contract parity fails — proving the moved coverage actually catches what the deleted tests caught; revert.
  - Files: `packages/api-client/src/guests.test.ts` (deleted).
  - Blocked by: 3.6
- [x] **3.8 PR 3 gates, open, merge** — ship the migration.
  - Accept: rebased on `origin/main` (coordination note above honored: `LapsingGuest` name/shape preserved, preHandlers match origin/main); full gates green; llms artifacts for `packages/types`, `packages/api-client`, `services/reservations`, root staged by explicit path; PR description carries the decision-2 reviewer checkpoint and the behaviour-change list; `reviewer` PASS; `CI Gate` green; squash-merged with explicit `--subject`. Deploy workflows run on merge (dispatch through CI if a paths filter skips `packages/types` / `packages/api-client`).
  - Test first: n/a (gate item).
  - Files: none new.
  - Blocked by: 3.7

## Milestone 4: measured cost recorded for the remaining domains

- [x] **4.1 Record the measured per-endpoint migration cost in `release.md`** — fill architecture.md § Measured-cost template and price the remaining domains.
  - Accept: `release.md` contains the filled table (endpoints 11; parity gaps found = measured length of `KNOWN_PARITY_GAPS` from 2.4; route LOC 597 → after; client LOC 126 → after; inline `type: "object"` 15 → after; hand interfaces replaced; new Zod schemas 2; OpenAPI snapshot deltas; tests deleted/added per file; behaviour decisions with each named; PR 3 worker wall-clock + tokens) and a per-domain estimate for the 12 remaining domains (venues 12, reservations 11, availability 10, floor-plans 8, tables 7, users 7 — second service needs `registerEndpoint` adoption, waitlist 7, deposits 5, public-venue 4, agent-sessions 4 — agent service `/v1` prefix, briefing 1, health 1) derived from pilot per-endpoint figures. No cell left as a placeholder; anything unmeasurable is marked "not measured" with the reason.
  - Test first: n/a — measurement item; every number cites its command (`wc -l`, `grep -c`, snapshot diff line count).
  - Files: `docs/fixes/endpoint-definitions-pilot/release.md` (written at Ship).
  - Blocked by: 3.8

## Design gaps found

None. Every architecture component maps to an item: `defineEndpoint` (1.1),
`toResponseJsonSchema` + `SHARED_RESPONSE_REFS` (1.2), `registerEndpoint`
(1.3), `ApiClient.call` (1.4), schema parity + swagger accessor (2.2–2.4),
OpenAPI baseline (2.1), guests definitions and entity schemas (3.1–3.2),
routes (3.3), facade (3.4). Condition-brief target state: (1) → M1 + 3.2;
(2) → 3.3–3.4; (3) → M2 (written first, fails today per 2.4's empty-list run);
(4) → 4.1; (5) → 2.1 + 3.3 + 3.6.

## Notes

Deviations discovered during Implement, dated. Measured `KNOWN_PARITY_GAPS` (2.4), size-limit deltas (1.4, 3.4) and measured-cost cells are recorded as each PR lands.

### 2026-10-04 — Milestone 1 (PR 1)

- **Docs carrier (logged per the autorun dispatch):** the run-dir docs (`defect.md`, `architecture.md`, `breakdown.md`, `autorun-brief.md`) ride on PR 1, so later PR branches cut from origin/main already contain them; each PR updates `breakdown.md` checkboxes/Notes for the work it carries. Item 1.5's box is checked on PR 2's branch (it can only be true after the merge).
- **1.1 deviation — compile-time checks surface as a required extra argument, not an intersected property.** First implementation intersected the definition with `{ params: DefinitionError<…> }`; with an inline `z.object(...)` argument TypeScript's inference collapsed `method`/`path` to `never` and reported the error on the wrong lines. `defineEndpoint<const D>(def, ..._contractCheck: DefinitionCheck<D>)` reports `Expected 2 arguments, but got 1` with a labelled tuple naming the violation (`params_keys_must_equal_path_segments`, `exactly_one_2xx_response_required_several_declared`, …) and leaves inference alone. Same contract as architecture § Interfaces (compile-time only).
- **1.1 deviation — `packages/types` typecheck now includes test files** (`tsconfig.test.json`, the existing `packages/api-client` pattern). Without it the `expectTypeOf` / `@ts-expect-error` assertions the item requires are never enforced (the package tsconfig excluded `*.test.ts`). Existing tests were already type-clean. Mutation-checked: flipping one expected type makes `pnpm --dir packages/types typecheck` fail.
- **1.3 deviation — `EndpointRouteGeneric` omits `Reply` for a body-less (204) success.** Fastify's `SendArgs` makes the payload required for a union reply type, so `reply.code(204).send()` (today's delete handler, moved verbatim in 3.3) would not compile. Omitting `Reply` matches today's hand-written `fastify.delete<{ Params }>` exactly.
- **1.3 deviation — registered schema asserted via `onRoute`, not swagger.** The test captures `routeOptions.schema` (the exact object Fastify registers and @fastify/swagger reads) instead of rendering swagger; the swagger-level guarantee is PR 2's `guests-openapi` snapshot. Measured while writing it: `fastify.route({ url: "/" })` inside a prefixed plugin registers exactly what `fastify.get("/")` does (GET `/api/v1/things` and `/api/v1/things/` both 200, same `printRoutes` tree), so `relativeUrl` maps `""` → `"/"`.
- **1.3 — handler typing enforced by a scoped `packages/service-bootstrap/tsconfig.test.json`** (only `register-endpoint*.ts`), wired into that package's `typecheck` script. Turning on all its test files surfaced 14 pre-existing type errors in unrelated tests — out of scope, logged here, not fixed. `zod` added as a service-bootstrap devDependency for fixtures (lockfile delta: 3 lines).
- **1.4 — `call` sends `{}` for a body-less POST/PATCH/PUT** (encodes #4826 once; `sendWinBack` already sends `{}` today, so PR 3 stays byte-identical). `successBodySchema` is a local helper rather than importing `successResponse` from `@mbe/types` at runtime, keeping `client.ts` free of runtime `@mbe/types` imports.
- **1.4 size-limit (measured, `pnpm --dir packages/api-client size`):** index 592 B → 592 B, users 406 B → 406 B, streaming 902 B → 902 B brotli (limits 650 / 460 / 1000 B). Delta 0 B (size-limit measures each entry file; `index.js` is re-exports).
- **RED → GREEN evidence (PR 1):** 1.1 `define.test.ts` → `Error: Cannot find module './define.js'` → 10/10 pass + `tsc -p tsconfig.test.json` clean; 1.2 → 5× `TypeError: toResponseJsonSchema is not a function` → 74/74 pass; 1.3 → `Cannot find module './register-endpoint.js'` → 8/8 pass; 1.4 → 10 failing `call` cases → 78/78 pass.
- **Pre-push AI-antipattern ratchet tripped on first push** (`noopTestAssertions` 20 → 25, `hardcodedRoutes` 851 → 880): the machinery fixtures' `"/api/v1/…"` literals and the five type-only `it` blocks (the ratchet's `expect()/assert()` regex cannot see `expectTypeOf` / `@ts-expect-error`). Fixed rather than re-baselined: fixtures use `/v1/…`, type assertions moved into a never-called `_typeLevelAssertions()` that `tsconfig.test.json` still typechecks (mutation-checked). Ratchet back at 851 / 20. **Cost note for 4.1:** PR 3 adds 11 `/api/v1/guests…` literals in `endpoints/guests.ts` while deleting the client's and routes' literals — net must stay ≤ 0 for the ratchet.
- **Reviewer (PR #6052) PASS 8/10, one minor finding fixed in-PR:** `call` dropped a declared body on DELETE (real shape: `cancel-reservation.ts` manage-cancel). Now a declared body is serialized on any method; `{}` only for a body-less POST/PATCH/PUT. RED `expected undefined to be '{"cancellationReason":"x"}'` → GREEN. Edge cases the reviewer noted and left out of scope (logged for later domains): `200: problem()` passes the compile-time check but `registerEndpoint` rejects it at boot; a 207 is not counted as 2xx; `call` sends no per-call headers (x-session-id, manage-token Bearer) — holds/public-reservations will need that.
- **PR 1 gates (2026-10-04, branch `refactor/endpoint-defs-pr1`):** root `pnpm typecheck` 52/52 tasks; root `pnpm lint` 52/52 tasks; tests — `packages/types` 292 passed (297 before the five type-only `it` blocks moved into `_typeLevelAssertions`), `packages/api-client` 328 passed, `packages/service-bootstrap` 181 passed, `services/reservations` 1702 passed / 150 skipped, `tools/route-contract` 68 passed, `apps/hospitality` 2523 passed; `pnpm regen` then `pnpm regen --check` → "All generated artifacts are up to date." Entity baselines (`schema-baseline.json`, `schemas.test.ts.snap`) untouched.

- **1.5 done:** PR #6052 — reviewer PASS 8/10 on `10b86ff8f`, minor finding fixed, re-review PASS 9/10 on final head `cf084cb43`; `CI Gate` success on `cf084cb43` (run 37262755725); squash-merged as **`93b318192`** `feat(types,api-client,service-bootstrap): endpoint definition machinery (#6052)`. Diff contained no `routes/` file and no `api-client/src/<domain>.ts`.

### 2026-10-04 — Milestone 2 (PR 2)

- **Branching:** PR 2 was developed on `refactor/endpoint-defs-pr2` while #6052 was in CI, then rebased with `git rebase --onto origin/main <pr1-head>` after the squash-merge — so it is cut from origin/main (`93b318192`), not stacked.
- **2.1 measured:** @fastify/swagger documents the guests list route as `/api/v1/guests/` (trailing slash — a `"/"` route in a prefixed plugin) and every shared entity as `#/components/schemas/def-N` (`def-4` = `Error`, `def-7` = `Guest`, `def-8` = `GuestSegment`, `$id` kept as `title`). Snapshot is 943 lines, 11 operations; two consecutive runs byte-identical; a one-byte edit fails it. Component contents are not re-snapshotted (entity baselines own them).
- **2.1 deviation — operations selected by operationId, not by path prefix.** Filtering on `"/api/v1/guests"` literals added to the AI-antipattern `hardcodedRoutes` ratchet; selecting the 11 operations by their operationIds holds no route literal and pins the same set (snapshot content unchanged, key renamed).
- **2.2 measured — three nullable spellings coexist in the one reservations swagger document:** `type: ["null","string"]` (entity components), `type: ["string","null"]` and `anyOf: [X, {type:"null"}]` (request bodies), and `nullable: true` (hand-written response schemas / `toResponseJsonSchema`). `normalize` maps all to `{ …X, nullable: true }`.
- **2.3:** spies restore in the same `finally` as `fetch`. `@mbe/types` added as a route-contract devDependency (3-line lockfile delta; dep-graph artifacts regenerated: `route_contract --> types`).
- **2.4 — measured `KNOWN_PARITY_GAPS` (verbatim, 10):** `guests.create body`, `guests.findOrCreate body`, `guests.update body`, `guests.addNote body`, `guests.list query`, `guests.search query`, `guests.getSegments query`, `guests.getLapsing query`, `guests.getLapsing response`, `guests.sendWinBack response`. **Identical to architecture's prediction** (body 4 / query 4 / response 2); the other 8 response comparisons already pass. Every gap is a missing client declaration — none implies a wire change, so no STOP. RED (empty list) → the assertion printed exactly these 10 → pinned → GREEN. Mutation check: `guests.get` validating with `GuestSchema.extend({ x })` adds `guests.get response — differs at /properties/data/properties/x`.
- **RED → GREEN (PR 2):** 2.2 `Cannot find module './schema-parity.js'` → 18/18 (21 with `findOperation`); mutation (erase `properties`) fails 6/18. 2.3 four new cases failing (`schemaCaptures` / `openApiDocument` undefined) → 30/30. 2.4 two new cases failing → 92/92.
- **PR 2 gates (branch `refactor/endpoint-defs-pr2`, rebased on `93b318192`):** root `pnpm typecheck` 52/52; root `pnpm lint` 52/52; `tools/route-contract` 95 passed; `services/reservations` 1739 passed / 16 expected-fail / 150 skipped; `pnpm regen` (llms + dep-graph) then `pnpm regen --check` clean; AI-antipattern ratchet at baseline (`hardcodedRoutes` 852, `noopTestAssertions` 20). No route handler, client method or `@mbe/types` schema in the diff.
- **2.5 done:** PR #6056 — reviewer PASS 9/10 on `5b5917800`; `generated-artifact-determinism-reviewer` PASS (llms ordering byte-order, dep-graph edge consistent, snapshot deterministic; warned that `def-N` numbering is positional — a new `addSchema` ahead of `Guest` renumbers refs and needs a deliberate `-u`). CodeQL then flagged `js/polynomial-redos` (high) on `path.replace(/\/+$/, "")` in `findOperation` — fixed with a bounded loop (`61604fcad`); re-review PASS 9/10 on final head `326a8af4c`; `CI Gate` + CodeQL success on `326a8af4c` (run 37267468945); squash-merged as **`2433bbdbd`** `test(route-contract,reservations): guests schema parity + OpenAPI baseline (#6056)`.

### 2026-10-05 — Milestone 3 (PR 3, draft — stops before Verify)

- **Branching:** developed on `refactor/endpoint-defs-pr3` while #6056 was in CI/review, rebased with `git rebase --onto origin/main <pr2-head>` after its squash-merge (base `2433bbdbd`). Coordination check at rebase time: no change to `routes/guests.ts` preHandlers or to `LapsingGuest` consumers on origin/main between `93b318192` and `2433bbdbd`; `LapsingGuest` keeps its exported name and shape (now `z.infer`).
- **3.1:** `CommunicationPreferenceSchema` extracted from `GuestSchema` (same enum, entity baselines unchanged) so `LapsingGuestSchema` reuses it rather than restating it. RED: 3 failing (`LapsingGuestSchema`/`WinBackResultSchema` undefined) → 3/3 + type assertions in `_typeLevelAssertions` (`LapsingGuest` ≡ `z.infer`, Create/Update ≡ `z.input`).
- **3.2 deviation — paths built on an exported `GUESTS_PREFIX` constant**, not 11 literals: keeps the `hardcodedRoutes` ratchet honest (the prefix is the one route constant). The "imports Zod only" test reads the module source via Vite's `?raw` import (`raw-imports.d.ts`), because `packages/types` has no `@types/node`. RED: `Cannot find module './guests.js'` → 4/4.
- **3.3 — route by route against the PR 2 snapshot:** `list` alone → zero diff; all 11 → exactly one delta, the decision-2 enum. **Decision-2 snapshot diff (reviewer checkpoint), verbatim:** under `/api/v1/guests/lapsing` → `get` → `200` → `data.items.properties.communicationPreference`, `+ "enum": ["email_only", "sms_only", "both", "transactional_only"]` (6 snapshot lines, one JSON property). Wire bytes unchanged. `guests.test.ts` + `guests-dietary.test.ts` 30/30 **unmodified**; reservations `tsc` clean with the route generics gone.
- **3.4 deviation — facade migrated in one step, not method by method.** The parity "accidental fix" signal fired for all 10 pinned gaps at once (measured `[]` vs 10) — the same evidence, one run. Query key order preserved (`venueId` first). `packages/api-client/src/guests.test.ts` (17 tests) still passed against the new facade before its deletion.
- **3.5:** `known-parity-gaps.ts` deleted; assertion is `toEqual([])` with body and query now compared by content. The driver's `call` spy now resets the pending definition in a `finally` (PR 2 review suspicion).
- **3.6 evidence:** snapshot diff = the one decision-2 property (above); `git diff origin/main -- services/reservations/src/schemas/` empty (entity baselines untouched); every one of the 11 guests operations still carries `Error#` (`def-4`) refs — listGuests 1, searchGuests 1, getGuestSegments 1, getGuestById 1, createGuest 2, findOrCreateGuest 2, updateGuest 1, addGuestNote 3, getLapsingGuests 2, sendGuestWinBack 2, deleteGuest 2 (= each route's declared problem statuses); `/api/v1` prefix unchanged. **Behaviour changes recorded:** (1) decision 1 — `getLapsing` and `sendWinBack` now validate responses (`ApiValidationError` via `onError`); (2) decision 2 — the one OpenAPI documentation line above; (3) path ids `encodeURIComponent`'d and `getSegments`/`getLapsing` queries built by `buildQueryString` — identical bytes for cuid/uuid ids, different only for non-URL-safe input.
- **3.7 moved-coverage proof (before deleting):** (a) facade sends `{ note: text }` to `addNote` → `pnpm --dir packages/api-client typecheck` fails `'note' does not exist in type '{ text: string; }'` (body shape is typed from the definition); (b) facade calls `addNote` with path `…/:id/notez` → route-contract fails twice: "has a route owner for every client pair" (`POST /api/v1/guests/route-contract-placeholder/notez`) and parity (`[route] no OpenAPI operation documents it`). Both reverted.
- **Environment gotcha hit (logged, not a defect):** route-contract resolves `@mbe/types` / `@mbe/api-client` from `dist/`, so switching branches without rebuilding both gives false parity results (a PR-3 dist made PR 2's pinned-gaps test fail as "accidental fix"; a PR-2 dist made PR 3's driver throw `Cannot read properties of undefined (reading 'list')`). CI builds `^build` first, so this is local-only.
- **PR 3 gates (rebased on `2433bbdbd`):** root `pnpm typecheck` 52/52; root `pnpm lint` 52/52; tests — `packages/types` 299, `packages/api-client` 328 (311 after 3.7), `packages/service-bootstrap` 181, `services/reservations` 1739 passed / 16 expected-fail / 150 skipped, `tools/route-contract` 95, `apps/hospitality` 2523 — all pass; `apps/hospitality` `size:check` within every budget (delta vs main not measured); api-client size-limit unchanged (592 / 406 / 902 B); `pnpm regen` + `--check` clean; AI-antipattern ratchet `hardcodedRoutes` **852 → 842 (IMPROVED)**, `noopTestAssertions` 20.

#### Measured cost (item 4.1 data — Ship transcribes into release.md)

| Measure                                       | Guests (pilot)                                                                                                                                                         | How measured                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Endpoints migrated                            | 11                                                                                                                                                                     | client methods ↔ routes                            |
| Parity gaps found by the PR 2 guard           | 10 (body 4, query 4, response 2 — all missing client declarations, no wire drift)                                                                                      | `KNOWN_PARITY_GAPS` length                         |
| Route file LOC                                | 597 → 327                                                                                                                                                              | `wc -l services/reservations/src/routes/guests.ts` |
| Client file LOC                               | 126 → 119                                                                                                                                                              | `wc -l packages/api-client/src/guests.ts`          |
| Inline `type: "object"` literals              | 15 → 0                                                                                                                                                                 | `grep -c` on the route file                        |
| Hand TS types replaced by `z.infer`/`z.input` | 4 (`LapsingGuest`, `CreateGuestRequest`, `UpdateGuestRequest`, `FindOrCreateGuestRequest`)                                                                             | count                                              |
| New Zod schemas                               | 2 entities (`LapsingGuestSchema`, `WinBackResultSchema`) + 1 extracted (`CommunicationPreferenceSchema`) + 1 params (`GuestIdParamsSchema`)                            | count                                              |
| Definitions file                              | 166 lines (`packages/types/src/endpoints/guests.ts`)                                                                                                                   | `wc -l`                                            |
| OpenAPI snapshot deltas                       | 1 property / 6 lines (decision 2)                                                                                                                                      | PR 3 snapshot diff                                 |
| Tests deleted / added                         | deleted 17 (`api-client/src/guests.test.ts`); added 3 (`guest-schemas.test.ts`) + 4 (`endpoints/guests.test.ts`) + 1 (`client-inventory` delete-capture case reworded) | per file                                           |
| Behaviour decisions surfaced                  | 3 (decision 1 runtime validation; decision 2 enum doc line; URL encoding for non-URL-safe input)                                                                       | named above                                        |
| Route-literal ratchet                         | −10 (`hardcodedRoutes` 852 → 842)                                                                                                                                      | `node scripts/check-ai-antipatterns.mjs`           |
| Agent effort, PR 3                            | ~32 min wall-clock for 3.1–3.7 incl. gates (04:57:54Z → 05:29:48Z; interleaved with PR 2 review/CI); tokens not separately measurable inside a shared session          | timestamps                                         |

One-time machinery cost (PR 1 + PR 2, not repeated per domain): `defineEndpoint` + types, `toResponseJsonSchema`, `registerEndpoint`, `ApiClient.call`, schema-parity guard. Per later domain the work is PR 3's shape only: add the domain to `PARITY_DOMAINS` (measure its gaps), write its definitions, migrate routes and facade, delete its shallow client test.

### 2026-10-05 — Ship (3.8, 4.1)

- **3.8 done:** origin/main had moved to `b50540242` (#6055 reservation-transition-effects, #6059); merged into `refactor/endpoint-defs-pr3` as `21e56cee5`. Git auto-resolved `routes/guests.ts`: #6055's `scanLapsedGuests(venueId, (vid, guests) => fastify.reservationEvents.emitLapsingGuests(vid, guests))` landed inside the migrated `registerEndpoint` handler, so both intents are kept. Gates re-run after a forced rebuild of `@mbe/types`/`@mbe/api-client`/`@mbe/service-bootstrap`/`@mbe/cli`. `CI Gate` success on `21e56cee5` (run 37274190657). Squash-merged as **`17b1edceb`** `refactor(guests): declare each guests endpoint once (#6060)`. Evidence is in `release.md`.
- **4.1 done:** the measured-cost table and the per-domain estimates are in `release.md` § Measured cost.
