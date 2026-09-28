---
stage: architect
run: maintenance:api-client-route-contract
date: 2026-09-22
ux: not-applicable — maintenance run (no PRD); run ships a CI guard and two route-path fixes, no UI surface
assumptions:
  - 'The guard lands as a NEW workspace package (`tools/route-contract`, `@mbe/route-contract`) rather than a file inside an existing one. The brief scopes the run to "the guard itself, its CI wiring, and the proof that it fails" but never says whether adding a workspace package is in bounds, and it is a repo-shape change with real side costs (a `pnpm-lock.yaml` entry, which cold-busts every turbo task for that CI run; a `dep-graph.json` / `docs/architecture/dependency-graph.md` regeneration). Measured justification is in § Decisions; the decision to spend that cost at all was made without live user input.'
  - 'The guard compares METHOD + path, not path alone. The brief and `defect.md` both say "URL literal". Method is free to capture (the client''s transport already carries it) and `findRoute` already keys on it, so the stronger key costs nothing — but it is strictly more than was asked for, and it can fail a PR the literal-only wording would have passed (a client that POSTs to a GET-only route).'
  - 'The guard does NOT pin host-reachability — whether a path is reachable through the apex (`mattbutlerengineering.com`, via the edge) versus only on the direct origin host (`api.mattbutlerengineering.com`). It asserts only that SOME route owner answers the path. This matters today: `/v1/sessions*` (4 paths) is answered by `services/agent` but the edge serves the marketing SPA for it at the apex, because `originRoutes` is `["/api","/public"]` — deliberate, and already recorded as `EDGE_EXEMPT_PREFIXES = ["/v1"]` in `infrastructure/pulumi/ingress-coverage.test.ts:145`. Making reachability a failure here would red main on day one for a condition this run has no defect against. The brief is silent on the distinction.'
---

# Architecture: pinning `@mbe/api-client` URL literals to a route that answers them

## Approach

The two halves of this contract cannot be read statically — `defect.md` measured
that, and every measurement below reconfirms it. So the guard **executes both
halves and asks them**: it drives the real `@mbe/api-client` over a recording
transport to learn every `method + path` the client can emit, boots the three
real Fastify apps and asks each one `findRoute({ method, url })`, and calls the
real edge Worker's `fetch` with a stub environment to see what the edge does
with the path. A client pair that no owner answers fails the suite. There is no
allowlist and no skip.

The load-bearing discovery is that **Fastify's `findRoute` does runtime path
matching, not pattern-spelling comparison** — measured, `services/reservations`
answers `findRoute({method:"GET", url:"/api/v1/venues/PLACEHOLDER"})` with a hit
against its registered `/api/v1/venues/:id`, while `hasRoute` on the same input
returns `false` and only matches the literal `:id` spelling. That collapses the
question the brief expected to be hardest — normalizing `${id}` against `:param`
across four prefix families — into _nothing_: the client emits a concrete path
with an opaque placeholder segment, and find-my-way (the same matcher production
runs) decides. The guard never re-implements route matching, so it cannot
disagree with production about what matches.

The shape that lost: a **static inventory** — a hand-maintained or generated map
of paths that both halves are checked against. It is cheaper to build and it is
the shape `infrastructure/pulumi/ingress-coverage.test.ts` already uses for the
_prefix_ contract. It loses because a map is a third thing to keep true, and a
guard whose inventory silently drifts is the decorative-gate failure this repo
has recorded repeatedly. Executing both halves means there is nothing to keep in
sync: whatever the client actually sends is what gets checked, against whatever
the services actually register.

## Components

### `tools/route-contract` — the guard (new workspace package, `@mbe/route-contract`)

- Responsibility: owns the single question "is every `method + path` the shared
  client can emit answered by some route owner?" — and the answer's failure
  message. It is a leaf: nothing imports it, so it may depend on everything.
- Collaborators: `@mbe/api-client` (drives it), `@mbe/reservations-service` /
  `@mbe/users-service` / `@mbe/agent-service` (boots them),
  `@mbe/edge-worker` (calls its `fetch`). All five are **devDependencies**, so
  turbo has real graph edges and orders `^build` / Prisma generation correctly.
- Deletion test: if it vanished, the failure it catches reappears as a 404 in
  production with every gate green — which is this run's entire premise.

### Client driver (inside the guard package)

- Responsibility: produce the client's emitted surface by running it. Constructs
  `createApiClient({ baseUrl: "" })` plus `new AgentSessionClient({ baseUrl: "" })`,
  replaces `globalThis.fetch` with a recorder that returns `204`, and invokes
  every method on every sub-client with placeholder arguments.
- Deliberately **not** placed in `packages/api-client`: that would add a public
  export to a package carrying `size-limit` budgets
  (`packages/api-client/package.json` `size-limit`, 650 B / 460 B / 1000 B) for
  something only CI reads. The client stays untouched except for the two fixes.

### Route-owner adapters (inside the guard package)

- Responsibility: turn "does anyone answer this?" into one uniform boolean per
  owner, and nothing else. Two shapes, because the owners are two shapes:
  - **Fastify adapter** — `buildApp({ logger: false })`, `await app.ready()`,
    then `app.findRoute({ method, url })`.
  - **Edge adapter** — `edgeRouter.fetch(new Request("https://host" + path), stubEnv)`,
    classified by a tag header on the **returned** response.
- These are humble: they translate and report. No ownership rules, no prefix
  logic, no knowledge of the client.

## Data model

No persistence. Two in-memory sets and a join:

```
ClientPair   = { method: "GET"|"POST"|"PATCH"|"PUT"|"DELETE", path: string }
                 // path is query-stripped and param-substituted
Owner        = "reservations" | "users" | "agent" | "edge"
Verdict      = { pair: ClientPair, owners: Owner[], edgeDisposition: EdgeDisposition }
EdgeDisposition = "edge-terminal" | "forwarded-to-origin" | "static-spa"
```

Access patterns, which is what picked the shape:

1. _For each of ~87 client pairs, does any of 4 owners answer?_ — a linear scan
   over a tiny set; four boot costs dominate, so nothing indexed is warranted.
2. _Which client method produced a failing pair?_ — required for the failure
   message to be actionable, so the recorder stores the producing
   `client.method` name alongside each pair rather than a bare set of strings.
3. _Did the driver actually drive everything?_ — needs per-method issue counts,
   not a deduplicated set (see § Failure modes).

Consistency: entirely within one process, one test run. Nothing settles later.

Measured sizes at `origin/main` `0a80ea85b`: **87** client pairs; **276**
registered method+path entries across the three services (that count includes
Fastify's auto-registered `HEAD`/`OPTIONS`; `defect.md`'s 141 counts distinct
path entries — neither number is load-bearing, the ~3:1 ratio is); **5**
edge-terminal paths (`/health/system`, `/health/uptime`, `/health/performance`,
`/health/lighthouse`, `/health/deps`).

## Interfaces & contracts

### Client driver → inventory

- Input: the client roster — `createApiClient(...)`'s 14 sub-clients plus
  `AgentSessionClient`, which is **not** in that factory (measured:
  `packages/api-client/src/index.ts:81-97` omits it; it `extends ApiClient` and
  takes a `ClientConfig` directly, `agent-sessions.ts:38-41`). The roster is
  explicit and asserted against `index.ts`'s exports, because a new sub-client
  wired into `index.ts` but not into the roster is the one way this enumeration
  can silently narrow.
- Output: `ClientPair[]` with producing method names. Query strings are stripped
  (`split("?")[0]`) — required for `reservations.ts:100`, `:183` and
  `venues.ts:106`, which embed `?page=&limit=` in the path literal. The
  placeholder must be a single opaque segment containing no `/`, `?` or `#`.
- Failure modes:
  - **A method that issues no request.** Must be detected per-call, not by
    watching a deduplicated set grow. Measured trap: a naive set-growth check
    flags `floorPlans.get`, `floorPlans.activate` and
    `reservations.cancelWithReason` as "issued nothing" — all three are aliases
    that emit a path an earlier method already emitted
    (`floor-plans.ts:39-41`, `:65-67`; `reservations.ts:145-157`). Count
    requests per invocation instead; then the only genuinely non-HTTP methods
    are `holds.setSessionId` / `getSessionId` / `sessionHeaders`, which are
    named exempt.
  - **Argument-dependent paths.** `deposits.transition(id, action)` composes
    `${DEPOSIT_BASE_PATH}/${id}/${action}` from a union
    (`deposits.ts:14`, `:66-68`) — three server routes behind one template. It
    is exempt from the reflective drive and pinned instead by an exhaustive
    `Record<DepositTransition, …>` map, so adding a fourth transition fails
    `pnpm typecheck` rather than slipping past.
  - **Retry/timeout do not apply.** The recorder returns `204` synchronously;
    `client.ts:109` only retries `GET/HEAD/PUT/DELETE` and only on 502/503/504,
    and `AbortSignal.timeout(30_000)` never fires. Each drive is one fetch.
  - Blind by construction, and stated rather than implied: a caller that
    bypasses the client owns its own URL and is not covered —
    `streamNDJSON(config)` takes a caller-supplied `config.url`
    (`streaming.ts:35-36`) and holds no literal of its own.

### Fastify adapter → `owners`

- Input: `{ method, url }` with the placeholder already substituted.
- Output: `true` when `app.findRoute()` returns a match.
- Failure modes: a route declaring a **regex-constrained param** would reject
  the placeholder and read as a false failure. Measured today: none of the 87
  pairs is affected — 85 resolve and the 2 that do not are Findings A and B,
  both independently confirmed unregistered. If one is ever added, the symptom
  is a red guard on a working route; the fix is a per-route placeholder, not an
  allowlist.
- Cost and prerequisites, measured: all three apps boot to `ready()` **with no
  database and no mocks** — Prisma connects lazily and `findRoute` never enters
  a handler, so no query is ever issued. The one observed side effect is ioredis
  connection-retry logging from the reservations job worker
  (`services/reservations/src/app.ts:280-291` starts it `onReady` when
  `notifierRuntime.redisUrl` is set, which it is outside production); it is
  noise, not failure, and is silenced by mocking `ioredis` the way
  `packages/jobs/src/worker.test.ts:20-28` already does.

### Edge adapter → `owners` + disposition

- Input: `{ path }` and a stub `env` (`API_ORIGIN`, a no-op `HEALTH_STATE` KV,
  and the four static bindings).
- Output: `edge-terminal` (the edge answers it itself — an owner),
  `forwarded-to-origin` (`/api`, `/public`; a Fastify service must answer), or
  `static-spa` (the marketing SPA answers — **not** an owner).
- Failure modes and the trap that has to be designed around: **classify by the
  response the router returns, never by which stub was called.** Measured — a
  "which spy fired" oracle misclassifies `/health/system` as `static-spa`,
  because `handleHealthSystem` legitimately fans out through both the origin
  `fetch` and the static bindings as part of doing its job
  (`edge-router.js:147-149`). Tagging the stub responses with a header and
  reading it off the returned response classifies all six probe paths correctly.
- Prerequisite that constrains the whole harness: `edge-router.js:24` does
  `import topologyConfig from "./routes-config.json"` with **no import
  attribute**, so bare Node refuses it (`ERR_IMPORT_ATTRIBUTE_MISSING`). It
  imports fine under vite/vitest (and tsx). The module also needs a
  `globalThis.HTMLRewriter` stub, per `edge-router.test.js`'s existing one.

### The guard → CI

- Input: none. Output: pass, or a failure naming, per unowned pair, the method,
  the path, the producing client method, and the edge disposition.
- Failure modes — the anti-vacuity contract, which is the part that decides
  whether this is a gate or a decoration. The suite fails if: the client
  inventory is empty or any roster sub-client contributed zero pairs; any
  non-exempt client method issued zero requests; any of the four owner tables is
  empty. Modelled directly on
  `infrastructure/pulumi/ingress-coverage.test.ts:164` ("reads real values
  from every source, so nothing below can pass vacuously").

## Stack & dependencies

- **vitest, in the new package's `test` / `test:coverage`** — forced, not
  preferred. It is the only runner that resolves `edge-router.js`'s
  attribute-less JSON import, and under it workspace deps resolve to **source**,
  which removes the `dist` prerequisites `defect.md` measured under `tsx`
  (`@mbe/types`, `@mbe/api-client`, `@mbe/agent-core`, each a hard
  `ERR_MODULE_NOT_FOUND`).
- **`ci.yml`'s existing `Test (Node 22)` job runs it — no new workflow, no new
  job.** That job runs `pnpm turbo test:coverage --concurrency=2`
  (`ci.yml:541`) and is in `ci-gate`'s `needs` (`ci.yml:979-999`), so a
  package declaring `test:coverage` is gated on every pull request by the only
  required check. It also already generates and restores the services' Prisma
  clients (`ci.yml:492-496`, plus the `prepare` job), which is exactly what
  booting them needs.
- **Do not wire it to `test:contract`.** That script exists at
  `packages/api-client/package.json:35` and as a turbo task (`turbo.json:97`),
  and **no workflow invokes it** (measured: `grep -rn "test:contract" .github/`
  returns nothing). Hanging the guard there would ship it never having run.
- **`@mbe/config/vitest/node`** — the node environment preset every sibling uses.
- Dependency cost shape: five workspace devDependencies, each used behind
  exactly one adapter call. Large surface, tiny interface.

## Decisions & alternatives

- **`tools/route-contract`, a new leaf package** over every existing home:
  - over **`packages/api-client`** — measured cycle. `services/agent/package.json`
    declares `@mbe/api-client` directly and `services/reservations` reaches it
    through `@mbe/notifications`, so the client cannot import the services back.
  - over **`infrastructure/worker`** — it is _not_ a leaf:
    `apps/rialto-web/package.json` devDepends on `@mbe/edge-worker`, so three
    service devDeps added there would pull all three service builds into
    `apps/rialto-web`'s turbo `^build` closure. It is also plain JS with no
    `tsconfig` and `include: ["**/*.test.js"]`, so the guard would go
    untypechecked.
  - over **`infrastructure/pulumi`** — a genuine leaf, node vitest env, and the
    home of the closest sibling guard (`ingress-coverage.test.ts`). It loses on
    ownership: that guard is _about_ the Pulumi ingress rules; this one is not
    about infrastructure at all. It also compiles CJS (`__dirname`, TS1470),
    making `tsc --noEmit` over ESM service imports a needless risk.
  - over **`scripts` (`@mbe/scripts`)** — a leaf with a node vitest config, but
    `.mjs`-only (`include: ["scripts/__tests__/**/*.test.mjs"]`) and it declares
    no `typecheck` script.
  - **`tools/`, not `packages/`** — every `packages/*` sibling carries committed
    `llms.txt` / `llms-full.txt`, which would need a new `FAMILIES` entry in
    `scripts/regen-manifest.mjs` or CI's coverage test fails;
    `tools/mutation-testing` shows a `tools/*` package needs none. Precedent for
    the single-purpose-leaf shape itself: `packages/supply-chain-scanner`
    (nothing depends on it; standard `build`/`lint`/`typecheck`/`test`
    /`test:coverage`).
- **Runtime interception of the client** over static parsing and over an
  exported shared route map — static parsing was measured blind to 7 of ~54
  paths in `defect.md`, and this run re-measured the true surface at **87**
  method+path pairs against 47 by literal grep. A shared map is a third artifact
  that can drift from both halves it claims to describe.
- **`findRoute` over `hasRoute`, `printRoutes()` parsing, and `inject()`** —
  `hasRoute` compares pattern spelling (measured: `false` for a concrete URL);
  parsing `printRoutes()` means re-implementing matching in a regex;
  `app.inject()` would run handlers, reaching auth, Prisma and Redis for a
  question answerable at the router.
- **One-directional, client → owner.** A registered route with no client caller
  is not a failure and is not reported. ~276 registered method+path entries
  against 87 client pairs; most of the difference is legitimately called by
  something other than `@mbe/api-client` (`/api/v1/stripe/webhook`,
  `/api/v1/events/stream`, `/v1/orchestrate`, `/v1/webhooks/*`, `/api/gen/*`,
  cron and ops paths) or is Fastify's own `HEAD`/`OPTIONS`. A reverse rule would
  need a ~190-entry allowlist — the same escape hatch Decision 1 rejected,
  pointed backwards.
- **Finding A: change the client literal to `/health/system`** over teaching the
  edge to answer `/api/health/system`. Five measured reasons, in order of force:
  1. **ADR-009** (`status: active`) § "Tier 2: System Aggregation
     (`/health/system`)" and **ADR-011** (`status: active`) line 41 both name
     `/health/system` on the edge as the canonical path. `check-adr` runs in the
     Architecture Audit job; a second name would contradict two active ADRs.
  2. `packages/types/src/schemas/health-system.ts:105` — the schema the client
     validates with — calls itself "The full `GET /health/system` response — the
     one owner of this contract."
  3. Two other consumers already use that path and work:
     `tools/cli/src/commands/health.ts:5` and `scripts/lib/health-alert-summary.mjs`.
  4. `/api` is an `originRoutes` prefix, so `/api/health/system` is _forwarded
     to DO_ — measured directly against the edge module
     (`disposition=forwarded-to-origin`), which is precisely the
     `"Route GET:/api/health/system not found"` body the production probe saw.
     Terminating it at the edge means inserting a synonym branch ahead of the
     origin-proxy branch for a path no one asks for.
  5. The change is complete on its own, measured rather than assumed: the
     unauthenticated **coarse** response parses against `systemHealthSchema`
     (`packages/types/src/schemas/health-system.test.ts:133-134`), so the fix
     swaps a 404 for data, not for a validation error.

  One recorded consequence, so it is a decision and not a surprise: the path
  moves rate-limit buckets — `/health/system` is **10 req/60 s**
  (`infrastructure/worker/rate-limiter.js:16`) where `/api/` is 100
  (`:17`). `SystemHealthBadge` polls at `POLL_INTERVAL_MS = 60_000`
  (`SystemHealthBadge.tsx:8`), i.e. 1/min per admin tab, so roughly ten admin
  tabs per source IP before shedding. Acceptable at today's admin population.

  Worth carrying into Review: the reason this survived is that
  `SystemHealthBadge.tsx:54-57` swallows the error and `:67` returns `null`.
  The production symptom is an **absent badge**, not an error — absence
  rendering identically to fine, again.

- **Finding B: delete `VenueGroupsClient.getBySlug`** (`packages/api-client/src/venues.ts:121-129`)
  over registering `/api/v1/venues/groups/by-slug/:slug`. Measured: **zero**
  application callers repo-wide. Every `getBySlug` call site is the _venue_
  client — `apps/hospitality/src/hooks/useVenues.ts:51`,
  `pages/VenueOnboardingPage.tsx:52`, `pages/PublicBookingPage.tsx:51` — all
  resolving to `/api/v1/venues/by-slug/:slug`, which is registered and green.
  The only other references are the method's own unit test
  (`packages/api-client/src/venues.test.ts:323-327`) and a row in
  `packages/api-client/CLAUDE.md:55`; all three go with it. Registering the
  route instead would add a service handler, a query, tests and public surface
  for a capability with no consumer, and would make the guard green by giving it
  less to object to.

## Proving the guard fails

Required by success criterion 2, and every input below is measured at
`origin/main` `0a80ea85b`, not predicted:

| Input                                                                      | `findRoute` owners | Guard   |
| -------------------------------------------------------------------------- | ------------------ | ------- |
| `POST /api/v1/floor-plans/:id/active` (pre-fix `setActive`)                | `[]`               | **RED** |
| `POST /api/v1/floor-plans/:id/activate` (current, `floor-plans.ts:58`)     | `["reservations"]` | green   |
| `POST /api/v1/floor-plans/:id/bulk-update-positions` (pre-fix)             | `[]`               | **RED** |
| `POST /api/v1/floor-plans/tables/positions` (current, `floor-plans.ts:80`) | `["reservations"]` | green   |

The primary proof is the 2026-08-30 pair: re-introduce one literal, watch the
suite go red, revert, watch it go green. **Findings A and B are a second,
free proof** — both are red on `main` _before_ their fixes land, so the guard's
very first run reproduces a real defect it was not told about, and Verify can
quote the pre-fix red and the post-fix green without any scratch edit.

## What this guard does not cover

Stated because success criterion 3 asks for it, and because an unstated gap is
how the next one hides:

- **Host reachability.** It proves an owner exists, not that the owner is
  reachable through the host a given caller points at. `/v1/sessions*` passes via
  `services/agent` while the apex serves the marketing SPA for it. That seam is
  `infrastructure/pulumi/ingress-coverage.test.ts` (DO ingress + edge
  `originRoutes` coverage) — the sibling guard on the next hop of the same chain.
- **Payload shape.** Unchanged and out of scope. Flagged, not fixed:
  `packages/api-client/src/contract.test.ts` imports both of its "sides" from
  `@mbe/types/schemas` and imports no service, so its name over-claims what it
  checks (`defect.md` measured this).
- **Non-client callers.** Anything that builds its own URL — `streamNDJSON`, the
  apps' direct `fetch` calls, E2E fixtures — is invisible here.
- **Whether the handler works.** `findRoute` proves a route matches, nothing more.

## ADRs

None — no decision met the bar. Each is reversible in one file, none is
surprising once the measurements above are on the page, and the one decision
that touches an ADR (Finding A) resolves _toward_ ADR-009 / ADR-011 rather than
away from them.
