---
stage: capture
run: maintenance:endpoint-definitions-pilot
date: 2026-10-04
re-entry: architect
origin: "/idea-to-prod:deepen review at fcd4be0a1 (2026-10-04), candidate #3; autorun-brief.md"
assumptions:
  - "Pilot scope read as the 11 authenticated `/api/v1/guests` endpoints (the brief's '~11'). The two public guest endpoints (`GET /public/v1/venues/:slug/guest-risk`, `POST /public/v1/venues/:slug/guests/recognize`, client in `public-venue.ts:35,46`) are treated as the public-venue domain and stay out."
  - "Work-in-flight check: ran `gh pr list --state open` on 2026-10-04 (18 open PRs) — nothing matched endpoint definitions, the guests domain, or route-contract. Proceeding."
  - "Re-entry `architect` taken from the brief (the endpoint-definition shape is a design decision, not a scoped fix)."
---

# Condition: one endpoint's shape is declared up to four times, and only path + method is checked

## Condition

Degraded, not broken. Across the HTTP seam between `@mbe/api-client` and the
Fastify services, a single endpoint is stated in up to four places — the
client's hand-written URL and method, a TypeScript request/response interface
in `@mbe/types`, a Zod schema in `@mbe/types`, and the route's TS generic plus
its (often inline) JSON response schema. The only automated guard
(`tools/route-contract`) checks that a client `method + path` is answered by
some owner. Bodies, query names and response shapes can drift silently; seven
past commits were exactly that drift.

**Target state that ends the run:**

1. A Zod endpoint definition in `@mbe/types` (path, method, params / query /
   body, response) drives the Fastify route's registration schema, the
   api-client method, and the TS types via `z.infer`.
2. The guests domain (the 11 endpoints below) is migrated to it — routes,
   client, types.
3. `tools/route-contract` is extended to compare request bodies and response
   schemas for migrated endpoints (written first; it must fail today on the
   inline schemas).
4. The per-endpoint migration cost is measured and recorded in `release.md`
   for the remaining domains (one domain per later run, newest first).
5. Unchanged: Fastify JSON-schema validation behaviour, OpenAPI output
   (ADR-007 versioning, `/api/v1` prefix), ADR-002 RFC 7807 error envelope.

Out of scope: every non-guests domain, SSE (#2 sse-event-catalog), venue
auth (#4 venue-scoped-routes). No user-facing surface.

## Reproduction / Evidence

Re-verified read-only against worktree HEAD `954eeb217` (parent `2653312ff` =
`origin/main` on 2026-10-04).

**Hand-written client URLs — claim holds (88).** Counting the client-call
sites per file in `packages/api-client/src/`: availability 10, briefing 1,
deposits 5, floor-plans 8, guests 11, health 1, public-venue 4, reservations
11, tables 7, users 7, venues 12, waitlist 7, agent-sessions 4 (`/v1/sessions`,
`agent-sessions.ts:47-62`) = **88**. Some use file-local consts
(e.g. `health.ts:28` `SYSTEM_HEALTH_PATH`; reservations/waitlist/deposits have
far fewer literals than calls). `tools/route-contract/src/route-contract.ts:8-9`
itself records "87 client pairs" (unique method+path; two floor-plans methods
share one pair).

**Example pairing — holds.** `packages/api-client/src/guests.ts:117`
`` `/api/v1/guests/lapsing?venueId=${venueId}` `` ↔
`services/reservations/src/routes/guests.ts:439` `"/lapsing"` +
`services/reservations/src/app.ts:248`
`fastify.register(guestRoutes, { prefix: "/api/v1/guests" })`.

**Request types declared 3× — holds, with a nuance.**
`packages/types/src/reservation.ts:77-91` (`CreateReservationRequest`
interface) / `packages/types/src/schemas/reservation-requests.ts:64`
(`CreateReservationBodySchema`) / route generic. In the guests domain:
`CreateGuestRequest` interface `packages/types/src/guest.ts:58` +
`CreateGuestBodySchema` `reservation-requests.ts:193` + route generic;
find-or-create is stated **four** times — `FindOrCreateGuestRequest`
interface in the client (`api-client/src/guests.ts:12-18`), route generic
`Body` (`routes/guests.ts:266-272`), and `FindOrCreateGuestBodySchema`
(`reservation-requests.ts:206`). `z.infer` appears only for `ProblemDetails`
(`packages/types/src/api.ts:24`) and the health-system schemas
(`schemas/health-system.ts`) — holds.
_Nuance:_ the **Fastify validation** schemas for request bodies and
querystrings are already Zod-derived — `createGuestBodyJsonSchema =
toRequestJsonSchema(CreateGuestBodySchema)` (`schemas/json-schema.ts:302-303`),
imported at `routes/guests.ts:14-21`. The triple declaration is at the
**type** level (interface + Zod + generic), not the validation level.

**Inline response schemas — holds (19 files, 134).** Files under
`services/reservations/src/routes/` with `type: "object"` literals: deposits
29, venues 17, guests 15, waitlist 13, holds 11, reservations 9, tables 8,
floor-plans 8, availability 7, booking-metrics 3, five public-\* files at 2,
public-reservations / public-deposits / public-availability / briefing at 1 =
**19 files, 134 occurrences**. The directory now has 34 non-test `.ts` files
(the brief said 32; the extra ones are helpers/fixtures, e.g.
`rls-route-sweep.fixtures*.ts`). LapsingGuest's 8 fields are re-typed inline
at `routes/guests.ts:454-473` — holds; it is also an interface at
`packages/types/src/guest.ts:47-56` and has **no** Zod schema. The two
already disagree: the interface types `communicationPreference` as
`CommunicationPreference`, the route JSON as bare `type: "string"`.
_Nuance:_ the `Guest` and `GuestSegment` entity shapes are **not** inline —
they are Zod-derived (`guestJsonSchema`, `guestSegmentJsonSchema`) and
registered via `services/reservations/src/schemas/index.ts:40-41` as
`Guest#` / `GuestSegment#`, guarded by a snapshot baseline
(`schemas/schema-baseline.json`, `schemas.test.ts`). What is hand-written in
the guests routes is the `{ data: ... }` envelope around those refs (7 sites)
plus the LapsingGuest and win-back (`{ sent: boolean }`, `:521-528`) bodies.

**"The client passes no response schema" — FALSE as stated.**
`ApiClient.get/getOne/postOne/patchOne` accept an optional Zod schema and
`safeParse` the response (`packages/api-client/src/client.ts:78,126-127,211-281`).
In guests, 8 of 11 methods pass one (`guestListSchema`,
`z.array(GuestSegmentSchema)`, `GuestSchema` — `guests.ts:33,41-110`); only
`getLapsing` (`:116-117`), `sendWinBack` (`:123-124`) and `delete` (`:102-103`,
204 no body) do not. The true statement: runtime validation is **opt-in and
per call site**, and the client's schema is chosen by hand, independent of
the route's response schema.

**Guard today — holds.** `tools/route-contract` (#5877, `4fc15a65d`):
one-directional client → owner (`route-contract.ts:4-16`), method + path only
— `ClientPair` is `{ method, path, producedBy }` with the path
"query-stripped, placeholder-substituted" (`src/types.ts:26-32`). It drives
the real client at runtime (`client-inventory.ts`) and matches with Fastify's
own `findRoute`. It does **not** check request bodies, query parameter names,
response shapes, or routes with no client caller.
`packages/api-client/src/contract.test.ts` is self-referential — holds: it
compares each Zod schema's keys against the JSON Schema `@mbe/types` derives
from that same Zod schema (`contract.test.ts:4-26`), and covers no guests
schema.

**Drift incidents — all seven commits exist:** `b8c552e39` (#4735 floor-plan
activate/positions URLs), `f4eb21bef` (#4826 empty body on setActive),
`7e1a13150` (#4862 undefined body on clone/transition), `4fc15a65d` (#5877
pin every client URL), `b3b8c07d0` (#5714 restore `/api/gen/ui`),
`b2a1d0c5f` (#5348 manage-token header), `b5367ad68` (#2642
PaginatedResponse type mismatch). Three of the seven (#4826, #4862, #2642) are
body/type drift that `tools/route-contract` would still not catch today.

### Pilot endpoint list (guests domain) — 11 client methods ↔ 11 routes, 1:1

Prefix `/api/v1/guests` (`app.ts:248`). Client = `packages/api-client/src/guests.ts`;
route = `services/reservations/src/routes/guests.ts`.

| #   | Method | Path              | Client method (line) | Route (line) | Response today                             | Client validates?             |
| --- | ------ | ----------------- | -------------------- | ------------ | ------------------------------------------ | ----------------------------- |
| 1   | GET    | `/`               | `list` (41)          | 47 / 51      | `createListResponseSchema("Guest#")`       | yes, `guestListSchema`        |
| 2   | GET    | `/search`         | `search` (52)        | 87 / 91      | `createListResponseSchema("Guest#")`       | yes, `guestListSchema`        |
| 3   | GET    | `/segments`       | `getSegments` (63)   | 130 / 134    | inline envelope → `GuestSegment#`          | yes, `z.array(GuestSegment…)` |
| 4   | GET    | `/:id`            | `get` (74)           | 172 / 176    | inline envelope → `Guest#`                 | yes, `GuestSchema`            |
| 5   | POST   | `/`               | `create` (81)        | 218 / 222    | inline envelope → `Guest#`                 | yes                           |
| 6   | POST   | `/find-or-create` | `findOrCreate` (88)  | 265 / 275    | inline envelope → `Guest#`                 | yes                           |
| 7   | PATCH  | `/:id`            | `update` (95)        | 315 / 320    | inline envelope → `Guest#`                 | yes                           |
| 8   | POST   | `/:id/notes`      | `addNote` (109)      | 363 / 368    | inline envelope → `Guest#`                 | yes                           |
| 9   | GET    | `/lapsing`        | `getLapsing` (116)   | 435 / 439    | fully inline, 8 fields (454-473)           | **no**                        |
| 10  | POST   | `/:id/win-back`   | `sendWinBack` (123)  | 494 / 498    | fully inline `{ sent: boolean }` (521-528) | **no**                        |
| 11  | DELETE | `/:id`            | `delete` (102)       | 557 / 560    | 204 `type: "null"`; 404/409 `Error#`       | n/a (no body)                 |

Route line = `fastify.<verb><{` / path literal. Every guests route also
declares `$ref: "Error#"` problem responses (ADR-002/ADR-008 envelope).

## Root-cause hypothesis

_Hypothesis, not a finding:_ there is no single artifact that **is** an
endpoint. Entity shapes were consolidated into Zod (with derived JSON Schema
for Fastify) one schema at a time, but the endpoint level — path, method, the
query/body/response triple, and the envelope — was never given a home, so
each consumer (route generic, route JSON schema, client method, TS interface)
restates it, and the only cross-check added later (`route-contract`) could
only see what is observable without a shared definition: method + path.

## Blast radius

- **Who:** developers and implement-queue agents changing any HTTP endpoint;
  indirectly hospitality/marketing users when drift ships as a 400/404 or a
  silently mis-shaped response (seven incidents 2026-06-25 → 2026-09-28).
- **How badly:** degraded, not broken — no known live drift in the guests
  domain today. LapsingGuest's interface/route mismatch on
  `communicationPreference` is a latent type-level inconsistency, not a wire
  failure.
- **Pilot change surface:** `packages/types` (definitions), `packages/api-client`
  (guests client), `services/reservations` (guests routes), `tools/route-contract`.
  Generated `llms.txt` and OpenAPI output in the reservations service are
  affected and must stay byte-identical where ADR-007 requires.
- Review and Ship scale: standard (cross-package refactor, no migration, no
  secrets, no user-facing surface).

## Ruled out

- **"Fastify request validation is hand-written"** — no; guests request
  body/query JSON schemas are already Zod-derived (`json-schema.ts:302-303`).
  The pilot does not need to re-plumb request validation, only derive types
  and the endpoint shell from the same definition.
- **"Guest entity response is re-typed per route"** — no; `Guest#` /
  `GuestSegment#` are Zod-derived shared refs with a snapshot baseline. The
  duplication is in envelopes and the two non-entity bodies.
- **"The client never validates responses"** — false (see Evidence); do not
  build the pilot on the premise that runtime validation is new. The design
  question is whether the endpoint definition _supplies_ the client's schema.
- **Extending `contract.test.ts`** — it compares a Zod schema with its own
  derivation, so it cannot detect client↔route drift by construction.

## Notes

- Product decisions surfaced so far (for Architect, not decided here):
  1. Should migrated endpoints whose client passes no response schema today
     (`getLapsing`, `sendWinBack`) start validating at runtime? That is a
     behaviour change (a mismatch would become a client-side error).
  2. LapsingGuest `communicationPreference`: enum (TS) vs string (route).
     Aligning on the enum tightens the OpenAPI output — must be checked
     against the "OpenAPI output unchanged" constraint.
- Constraints carried from the brief: deepening test order (new
  interface-level tests first against today's code, old shallow tests deleted
  last in the same change, with a coverage-moved note); rebase on
  `origin/main` before each PR; sequencing alongside #1/#2/#4.
