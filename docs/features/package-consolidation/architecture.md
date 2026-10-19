---
stage: architect
run: feature:package-consolidation
date: 2026-10-18
ux: skipped — Internal monorepo refactor with no user-facing surface; the ChatPanel stream prop is a developer API, not a UX surface (autorun brief).
assumptions:
  - "Open question 1 (ChatPanel stream prop): decided REQUIRED, not optional-with-default. Reading the brief's 'rialto's public API grows only additively' through the PRD's own test for it ('no existing export or prop is removed or renamed'). A new required prop removes and renames nothing, and no registry consumer could have run ChatPanel before (README § Compatibility), so no working consumer breaks. If the Owner reads 'additively' as strict semver-minor at the type level, the fallback is to make the prop optional with NO default and throw a clear error when it is missing. That flip stays additive, so it can happen later without an ADR."
  - "Open question 2 (JWKS home): decided `packages/observability/src/auth0-jwks.ts`, a new file, rather than inside `readiness.ts` as #7105's body suggests. The issue's intent (land it in observability so #7106 is a pure relocation) holds either way; a file of its own makes #7106 a one-file move."
  - '#7105''s ''PrismaLike defined once'' is met by having observability import the type from `@mbe/database` (`Pick<PrismaLike, "$queryRaw">`). This adds a temporary observability → database edge, which disappears when #7106 deletes observability (service-bootstrap already depends on database). Taken because the issue''s acceptance criterion requires it in #7105; deferring the dedupe to #7106 was the alternative.'
  - "No ADR written. Both open decisions fail the 'hard to reverse' leg (see ## ADRs)."
---

# Architecture: Consolidate `packages/` from 20 to 14

## Approach

This is a relocation, not a redesign. Seven of the nine work items (#7098–#7101, #7103, #7104, #7106) only move or delete code. Each one deletes a workspace package, or moves its source into its sole caller. It then removes every structural trace of the package: Dockerfile `COPY`/build lines, `regen-manifest` entries, knip ignores, dep-graph allowlist entries, codecov paths and lockfile entries. Runtime contracts are unchanged.

Two items change a seam, and those are where the design work is:

- **#7102** reverses a dependency. Rialto stops importing the private data client. The caller supplies the stream function instead, the same "through context or props, no hard import" pattern as ADR-025 and ADR-028.
- **#7105** unifies the Auth0 JWKS readiness check. One resolver and one probe now serve two adapters, `/health` and `/ready`, and each adapter keeps its own retry and message policy, so neither response changes.

Shape compared and rejected: a single "big bang" consolidation PR. It would put every Dockerfile, lockfile and generated-artifact change into one cold CI run with no bisect point. One package per PR keeps each revert to one package.

## Components

### Deletions: `mcp-server` (#7098), `supply-chain-scanner` (#7099)

- Responsibility: none. These packages have zero importers, and that is the evidence for deleting them.
- Collaborators: references to purge.
  - #7098: `tools/cli/src/command-loaders.ts` (the `mcp` loader) and the CLAUDE.md CLI table.
  - #7099: `knip.jsonc`.
  - Both: `scripts/dep-graph-discovery.mjs` allowlist entries, `scripts/regen-manifest.mjs`, the `ci.yml` codecov list and the regenerated dep-graph.

### `@mbe/agent-core/testing` subpath (#7100)

- Responsibility: owns the 3 agent test helpers. It is a subpath export only and is never re-exported from the root `index.ts`, so test helpers cannot reach the production bundle.
- Collaborators: 5 agent-core tests and 3 services/agent tests.

### Service-local factories + `@mbe/ui-quality-capture` (#7101)

- Responsibility: the factories become real local fixtures in `services/reservations/src/test/mocks.ts` and `services/users/src/test/fixtures.ts`. The renamed package owns only the Playwright capture helper.
- Collaborators: 4 e2e capture/spec files across hospitality, marketing and rialto-web.

### `services/reservations/src/jobs/` (#7103) and `src/notifications/` (#7104)

- Responsibility: unchanged. ADR-019's in-process JobWorker and the notification dispatch move without changing their behaviour.
- `notifications` replaces its `@mbe/api-client` `retry` import with a local equivalent, so reservations does not pick up a data-client dependency.
- Collaborators: reservations' transitions, notifier runtime and effects harness, and the Dockerfile lines named in the issues.

### `ChatPanel` stream seam (#7102)

- Responsibility: `useChatStream` owns NDJSON-line interpretation, meaning messages, elements, actions, tool status and denials. It no longer owns transport: the caller supplies the function that turns a request into an async iterable of parsed lines.
- Collaborators:
  - `apps/hospitality/src/pages/ChatPage.tsx` and **`apps/hospitality/src/components/DashboardLayout.tsx:420`**, the second in-tree caller, which #7102's body misses. Both pass `streamNDJSON` from `@mbe/api-client/streaming`.
  - `ChatPanel.stories.tsx`, `ChatPanel.test.tsx` and `useChatStream.test.ts` switch from `vi.mock("@mbe/api-client/streaming")` to an in-memory adapter passed as the prop.
  - The a11y fixture (`src/test/accessibility/component-fixtures.tsx:825`) drops ChatPanel from `SKIPPED_COMPONENTS` and renders it with an in-memory adapter.
- Two adapters: production `streamNDJSON` and the in-memory test adapter. The seam is real by the canon's test.

### Auth0 JWKS module: `packages/observability/src/auth0-jwks.ts` (#7105)

- Responsibility: owns the Auth0 JWKS rule end to end:
  - the dev-tenant constant, which must appear exactly once under `packages/`;
  - `buildJwksUrl` (moved from `readiness.ts`);
  - URL resolution with the production refusal;
  - the unconfigured message;
  - one fetch-with-timeout probe that classifies the outcome.
- Collaborators, the two adapters:
  - `registerStandardChecks` in `observability/src/readiness.ts`, the `/ready` adapter;
  - `checkAuth0` in `service-bootstrap/src/health.ts`, the `/health` adapter.
- `validate-startup-config.ts` keeps re-exporting `buildJwksUrl`, which is public API of `@mbe/service-bootstrap`.
- Why observability and not service-bootstrap: service-bootstrap already depends on observability. A module in service-bootstrap would need observability's `readiness.ts` to import back into service-bootstrap, which is a cycle.
- #7106 moves the file unchanged to `packages/service-bootstrap/src/observability/auth0-jwks.ts`.

### Observability fold (#7106)

- Responsibility: `packages/service-bootstrap/src/observability/` owns telemetry, readiness, error rates and the rate-limit monitor.
- `@mbe/sentry` takes `build-info` and `redactSignal` as internal modules, so sentry depends on nothing from service-bootstrap. This avoids a sentry → service-bootstrap edge, which would be a cycle because service-bootstrap depends on sentry.
- The dynamic `import()` of telemetry in `start-service-server.ts` stays dynamic: OTel must initialise before anything else is imported.
- Collaborators: the 3 services' `package.json` and Dockerfiles, `knip.jsonc:98-125`, and the regen manifest.

## Data model

No persisted data changes. The only "data" is the TypeScript contracts below.

- **Access patterns:**
  - one stream per chat send, retry or confirm;
  - one JWKS probe per `/health` scrape;
  - one JWKS probe per `/ready` evaluation, plus at most one retry.
- **Consistency:** not applicable. Nothing is stored.

## Interfaces & contracts

### `ChatPanelProps.stream` / `UseChatStreamOptions.stream` (rialto public API, additive)

- Input: `stream: ChatStreamFn`. Rialto defines the type structurally and never imports it:

  ```ts
  export interface ChatStreamRequest {
    url: string;
    body: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
  export type ChatStreamFn = (request: ChatStreamRequest) => AsyncIterable<unknown>;
  ```

  `streamNDJSON<T>(config: StreamConfig): AsyncGenerator<T>` is assignable as is, because `StreamConfig` has the same four fields and `T` infers to `unknown`. `ChatStreamRequest` and `ChatStreamFn` are exported from `ChatPanel/index.ts` and the rialto root (additive exports).

- Output: unchanged. The `UseChatStreamReturn` shape and every existing prop stay the same. Each yielded value is narrowed to the internal `NDJSONLine` shape exactly as today, and unknown line types are ignored as today.
- Behaviour notes:
  - `useChatStream` holds `stream` in a ref, in the same pattern it already uses for `getAccessToken`. Swapping the function between renders therefore does not recreate `streamRequest`, and no `setState` runs in an effect (the rialto lint ban).
  - Rialto ends with zero `@mbe/*` imports in `src/`.
  - `scripts/lib-external.ts` loses its `/^@mbe\/api-client/` entry. Its test (`scripts/lib-external.test.ts`, which today asserts "finds at least one @mbe/* import") is rewritten to assert the stronger invariant: **zero** `@mbe/*` imports in lib source. Otherwise the gate fails, or no-ops, the moment the import goes.
  - `apps/rialto-web` and `apps/gen` keep their `@mbe/api-client` prebuild steps. Both still import api-client themselves: `gen` via `useGenStream`, and `rialto-web` via a test. Removing those steps is out of scope.
- Failure modes:
  - Anything the injected function throws, or yields through rejection, follows today's path. `AbortError` stops streaming silently, and any other error sets `error` and enables `retry()`.
  - A missing `stream` is a compile error for TypeScript callers. A JavaScript caller that omits it gets a `TypeError` inside `streamRequest`, which surfaces as the existing inline error state, not a crash.
  - Timeouts and retries belong to the injected function. Rialto adds none.
- Changeset: `@mattbutlerengineering/rialto: minor`. Rialto is at 0.7.1. The changeset says ChatPanel is now usable from a registry install.

### `resolveJwksUrl(explicit?: string): string | null` (auth0-jwks.ts)

- Input:
  - an explicit URL;
  - otherwise `process.env.AUTH0_JWKS_URL`;
  - otherwise `buildJwksUrl(process.env.AUTH_AUTHORITY)`;
  - otherwise the dev tenant.
- Output: a URL, or `null` when nothing is configured and `NODE_ENV=production`.
- Behaviour notes:
  - The function reads `process.env` on every call.
  - The two existing copies (`health.ts` `resolveJwksUrl` and `readiness.ts` `resolveAuth0Url`) are identical on every input, so merging them changes nothing.
- Failure modes: none. It is a pure function and never throws.

### `probeJwks(url, { timeoutMs, fetchFn }): Promise<JwksProbeOutcome>` (auth0-jwks.ts)

- Input:
  - `url`;
  - `timeoutMs` (both callers pass 2000 today);
  - `fetchFn`. The `/health` adapter passes a thunk over `globalThis.fetch` that is resolved per call, because health tests use `vi.stubGlobal`. The `/ready` adapter passes its injected `fetchFn`.
- Output: one of

  ```ts
  | { ok: true; latency }
  | { ok: false; latency; reason: "http"; status }
  | { ok: false; latency; reason: "timeout" | "network"; error: Error }
  ```

- Failure modes:
  - It never throws, and the timer is cleared in `finally`.
  - Timeout means the `AbortController` fired, detected by `error.name === "AbortError"`.
  - Retry: the probe itself does not retry. It is safe to retry, because it is an idempotent GET.

### Adapter policies (preserved exactly; the comparison the skill requires)

The two old checks were run over the inputs where they differ. Each difference is kept on purpose: the unified design moves only the shared parts, and each adapter keeps its own policy.

| Input / aspect                                                | `/health` (`checkAuth0`)               | `/ready` (`registerStandardChecks` "auth")                                                                                            | Unified design                                                                            |
| ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Transient failure                                             | no retry                               | one retry after 50 ms (#5534)                                                                                                         | retry stays in the readiness adapter (`withTransientRetry` around probe and throw)        |
| Non-200 message                                               | `Auth0 JWKS returned <N>`              | `JWKS returned <N>`                                                                                                                   | each adapter formats its own message from `reason: "http"`                                |
| Timeout message                                               | `Auth0 JWKS unreachable (timeout >2s)` | the raw abort error's message                                                                                                         | health formats; readiness rethrows `outcome.error`                                        |
| Network error                                                 | `Auth0 JWKS unreachable: <msg>`        | the raw error's message                                                                                                               | same split                                                                                |
| Unconfigured (production, nothing set)                        | `degraded`, shared message             | throws the shared message                                                                                                             | message constant lives in auth0-jwks.ts                                                   |
| When the URL is resolved                                      | every call                             | once, at plugin registration                                                                                                          | unchanged                                                                                 |
| Both `AUTH0_JWKS_URL` and `AUTH_AUTHORITY` set, but different | probes `AUTH0_JWKS_URL`                | probes `AUTH_AUTHORITY` (`readiness-routes.ts:74` pre-resolves the authority and passes it as `auth0Url`, which outranks the env var) | **unchanged**: a pre-existing precedence split, recorded below as a seed and out of scope |
| Latency                                                       | reported                               | ignored                                                                                                                               | the probe always returns it                                                               |
| Timer on a throw path                                         | `clearTimeout` is skipped on throw     | cleared in `finally`                                                                                                                  | always cleared; no observable response change                                             |

### `StandardChecksOptions.prisma` type

- Input: `Pick<PrismaLike, "$queryRaw">`, imported with `import type` from `@mbe/database`. It replaces observability's local `{ $queryRaw(strings: TemplateStringsArray) }`.
- Behaviour notes:
  - Observability's `PrismaLike` export is dropped. Nothing outside observability imports it.
  - `ReadinessRoutesOptions = StandardChecksOptions` inherits the change.
- Failure modes: compile time only. A real `PrismaClient` already satisfies `@mbe/database`'s `PrismaLike` through `createDatabase<T extends PrismaLike>`, and the tests' `{ $queryRaw: vi.fn() }` mocks satisfy the `Pick`. `pnpm typecheck` across the 3 services is the gate.

### `/health` and `/ready` HTTP contracts (ADR-009)

- Unchanged. #7105 first writes `createServiceApp`-level tests with an injected fetch:
  - JWKS reachable → ready;
  - JWKS unreachable → 503 not ready;
  - the `/health` Auth0 `ok` and `degraded` bodies.
- #7105 and #7106 must pass those tests without editing them.

## Stack & dependencies

- No new third-party dependencies.
- The packages that move take their runtime dependencies with them:
  - #7103: `bullmq` and `ioredis` become direct dependencies of reservations, if they are not already.
  - #7104: the notification provider SDKs move the same way.
- **Edges removed:**
  - rialto → `@mbe/api-client` (devDependency, vitest alias, lib external);
  - sentry → observability;
  - reservations → `@mbe/api-client` via notifications' `retry` (if it is the only use);
  - all 3 services → observability (phantom dependencies kept only for build ordering).
- **Edges added:**
  - temporary observability → `@mbe/database` (type-only, #7105 → #7106);
  - agent-core gains a `./testing` export.

## Decisions & alternatives

- **The ChatPanel `stream` prop is required** over optional-with-default. A default would need a second fetch/NDJSON parser inside rialto, duplicating `packages/api-client/src/streaming.ts`: the same two-copies defect #7105 exists to remove. It would also turn a forgotten prop into silent use of a default transport instead of a compile error at the 2 in-tree callers. Optional-with-no-default lost too: it trades a compile error for a runtime one and buys only type-level semver purity on a surface that has never run outside the monorepo.
- **Rialto defines `ChatStreamFn` structurally** over importing `StreamConfig` as a type-only import from api-client. Even a type-only import leaves `@mbe/api-client` in rialto's emitted `.d.ts`, so registry consumers' typecheck would still fail.
- **The JWKS module lives in observability (`auth0-jwks.ts`)** over service-bootstrap. Service-bootstrap depends on observability, so a service-bootstrap home creates a cycle. It is a file of its own rather than part of `readiness.ts`, so #7106 moves one file and `readiness.ts` keeps only the tracker.
- **One shared probe plus per-adapter policy** over one shared check function. A single check would force `/health` to adopt `/ready`'s retry, or `/ready` to drop it, and would change one endpoint's messages. Both are behaviour changes the PRD forbids.
- **Only the resolver and probe are unified** over also unifying URL precedence. The `/ready` precedence (authority before `AUTH0_JWKS_URL`) differs from `/health`, and changing either is a behaviour change. Recorded as a seed for a later run.
- **`PrismaLike` is deduped in #7105 via a temporary observability → database type edge** over waiting for #7106. #7105's acceptance criterion requires it, and the edge lives for one PR.
- **`build-info` and `redactSignal` go into `@mbe/sentry`** (#7106) over a service-bootstrap subpath. Service-bootstrap depends on sentry, so the reverse edge would be a cycle.
- **One package per PR** over a single consolidation PR. Each PR is a cold CI run either way (the lockfile is a turbo global dependency), but per-package PRs keep a one-package revert and bisect point.

Follow-ups noticed and not acted on:

- `/health` and `/ready` resolve the JWKS URL with different precedence when both `AUTH0_JWKS_URL` and `AUTH_AUTHORITY` are set. Seed it for `docs/backlog.md` at Decompose or Review.
- #7102's body names one ChatPanel caller; there are two (`DashboardLayout.tsx:420`).
- At the time of writing, `fix/localization-conditional-literals` has no open PR. #7102 still sequences last, as agreed. Line 139 of `useChatStream.ts` is the `"Not allowed"` literal that session is replacing with a message key.

## ADRs

None. No decision met the ADR bar.

- **Required `stream` prop:** a real trade-off, but not hard to reverse. Relaxing required to optional later is an additive, non-breaking change.
- **JWKS module placement:** a file location that #7106 moves anyway.
- **The dependency-direction rule** ("rialto takes I/O by injection") already has precedent in ADR-025 and ADR-028, so it is not surprising without context.

The next free number on this branch is ADR-029. The untracked `docs/adr/ADR-027-rialto-localization-through-context.md` in the main checkout duplicates this branch's committed ADR-028 and was left alone.
