---
phase: 13-ai-generation-endpoint
plan: "01"
subsystem: api
tags: [ai-sdk, anthropic, fastify, rate-limit, sse, streaming, jwt, auth0, prompt-caching]

requires:
  - phase: 12-catalog-foundation
    provides: "@mbe/rialto-catalog with catalog.prompt() system prompt for AI generation"

provides:
  - "POST /api/gen/ui — streaming SSE endpoint for standalone Rialto UI spec generation"
  - "POST /api/gen/chat — streaming SSE endpoint for conversational mode"
  - "Per-user rate limiting via @fastify/rate-limit with Auth0 sub as key"
  - "Anthropic prompt caching via providerOptions on system message"
  - "Cost logging (inputTokens, outputTokens, cacheReadInputTokens) via onFinish"

affects: [14-gen-playground, 15-hospitality-copilot, 16-streaming-prose]

tech-stack:
  added:
    - "ai@6.0.141 — AI SDK v6 streamText + Output.object for streaming"
    - "@fastify/rate-limit@10.x — per-user rate limiting in Fastify 5"
    - "@mbe/rialto-catalog — workspace dep (catalog.prompt() system prompt)"
    - "@mbe/auth — workspace dep (requireAuth preHandler + authPlugin)"
  patterns:
    - "AI Gateway model string routing: 'anthropic/claude-haiku-4.5' via AI_GATEWAY_API_KEY env var"
    - "Streaming route pattern: streamText -> toUIMessageStream() -> reply.send(ReadableStream)"
    - "Prompt caching via messages[].providerOptions.anthropic.cacheControl (NOT top-level system: param)"
    - "Per-route rate limit override via config.rateLimit with keyGenerator using req.user.id"
    - "Cost logging in onFinish callback using usage.inputTokens/outputTokens + providerMetadata.anthropic"

key-files:
  created:
    - "services/agent/src/routes/gen-ui.ts — POST /api/gen/ui with streamText + Output.object + auth + caching"
    - "services/agent/src/routes/gen-chat.ts — POST /api/gen/chat conversational streaming endpoint"
    - "services/agent/src/routes/gen-ui.test.ts — 5 tests: auth rejection, validation, model selection, caching"
    - "services/agent/src/routes/gen-chat.test.ts — 4 tests: auth rejection, validation, streamText args, caching"
  modified:
    - "services/agent/src/app.ts — registered authPlugin, rateLimit, genUiRoutes, genChatRoutes"
    - "services/agent/tsconfig.json — added jsx: react-jsx for cross-package workspace compat"
    - "services/agent/package.json — added ai, @fastify/rate-limit, @mbe/rialto-catalog, @mbe/auth"
    - "packages/rialto-catalog/package.json — added ./catalog subpath export to isolate server-safe imports"

key-decisions:
  - "AI SDK v6 field names are inputTokens/outputTokens (not promptTokens/completionTokens) — verified from types"
  - "Import @mbe/rialto-catalog/catalog directly (not /index) to avoid pulling browser-only registry.tsx into NodeNext tsconfig"
  - "Added ./catalog subpath export to rialto-catalog package.json for clean server-side import"
  - "authPlugin registered conditionally (only when AUTH_AUTHORITY + AUTH_AUDIENCE env vars present) to keep tests clean"
  - "ReadableStream mock must call controller.close() immediately in tests — open streams cause Fastify inject to timeout"

patterns-established:
  - "Streaming SSE pattern: streamText result piped via toUIMessageStream() to reply.send() — no @fastify/sse needed"
  - "Rate limit hook: preHandler (not onRequest) so request.user is populated by requireAuth before rate key is read"

requirements-completed: [GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06, GEN-08]

duration: 5min
completed: 2026-03-28
---

# Phase 13 Plan 01: AI Generation Endpoint Summary

**Streaming POST /api/gen/ui and /api/gen/chat routes using AI SDK v6 streamText with Anthropic prompt caching, per-user rate limiting, and cost logging via onFinish**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-28T04:23:03Z
- **Completed:** 2026-03-28T04:28:26Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Two streaming generation routes registered in `services/agent` with Auth0 JWT auth, per-user rate limiting, and Anthropic prompt caching on the catalog system prompt
- AI SDK v6 model string routing via `AI_GATEWAY_API_KEY` — no `@ai-sdk/anthropic` package needed
- 9 tests across gen-ui and gen-chat covering auth rejection, body validation, model selection, and cache config; all 38 service tests pass

## Task Commits

1. **Task 1: Install deps and create gen-ui.ts + gen-chat.ts** - `01a7a1c` (feat)
2. **Task 2: Register routes in app.ts with rate limiting and add tests** - `a415567` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `services/agent/src/routes/gen-ui.ts` — POST /api/gen/ui with streamText + Output.object schema, requireAuth, prompt caching, cost logging
- `services/agent/src/routes/gen-chat.ts` — POST /api/gen/chat conversational mode with same streaming pattern
- `services/agent/src/routes/gen-ui.test.ts` — 5 tests: 401 auth gate, 400 missing prompt, 400 prompt too long, sonnet model selection, haiku default
- `services/agent/src/routes/gen-chat.test.ts` — 4 tests: 401 auth gate, 400 missing messages, streamText args verification, prompt caching config
- `services/agent/src/app.ts` — registered authPlugin (conditional on env), @fastify/rate-limit, genUiRoutes, genChatRoutes
- `services/agent/tsconfig.json` — added `jsx: react-jsx` to support rialto-catalog cross-package type resolution
- `services/agent/package.json` — ai, @fastify/rate-limit, @mbe/rialto-catalog, @mbe/auth added
- `packages/rialto-catalog/package.json` — added `./catalog` subpath export

## Decisions Made

- **AI SDK v6 usage fields:** `inputTokens`/`outputTokens` not `promptTokens`/`completionTokens` — verified from TypeScript types in `LanguageModelUsage`
- **Catalog import isolation:** Import `@mbe/rialto-catalog/catalog` (not the barrel `/index`) to avoid `registry.tsx` (which imports `@mbe/rialto` with bundler-style relative paths) being type-checked under the agent's NodeNext tsconfig
- **Subpath export added to rialto-catalog:** The `./catalog` export enables clean server-side import without the browser-only registry
- **Auth plugin conditional registration:** `authPlugin` only registered when `AUTH_AUTHORITY` + `AUTH_AUDIENCE` env vars are present — keeps test environment clean without requiring env stubs
- **Test ReadableStream must close immediately:** `new ReadableStream({ start(c) { c.close(); } })` — an open stream causes `app.inject()` to wait indefinitely for the stream to drain

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AI SDK v6 usage field names differ from plan spec**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Plan specified `usage.promptTokens` and `usage.completionTokens` — AI SDK v6 `LanguageModelUsage` type uses `inputTokens`/`outputTokens`
- **Fix:** Updated both route files to use `usage.inputTokens` and `usage.outputTokens`
- **Files modified:** gen-ui.ts, gen-chat.ts
- **Verification:** `pnpm --filter @mbe/agent-service typecheck` passes
- **Committed in:** `01a7a1c` (Task 1 commit)

**2. [Rule 3 - Blocking] Cross-package type errors from rialto-catalog → registry.tsx → @mbe/rialto**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Agent service (NodeNext moduleResolution) type-checked `registry.tsx` via the rialto-catalog barrel import, encountering bundler-style relative imports and missing `window` (DOM) — causing 30+ type errors
- **Fix:** (a) Added `./catalog` subpath export to `rialto-catalog/package.json`. (b) Changed route imports to `@mbe/rialto-catalog/catalog`. (c) Added `jsx: react-jsx` to agent tsconfig
- **Files modified:** packages/rialto-catalog/package.json, services/agent/tsconfig.json, gen-ui.ts, gen-chat.ts
- **Verification:** Typecheck passes with 0 errors
- **Committed in:** `01a7a1c` (Task 1 commit)

**3. [Rule 1 - Bug] Test ReadableStream mock caused inject() timeouts**
- **Found during:** Task 2 (test execution)
- **Issue:** `new ReadableStream()` without closing the controller left the stream open; Fastify's `inject()` waited for the stream to end, causing 5-second timeouts on 4 tests
- **Fix:** Changed to `new ReadableStream({ start(controller) { controller.close(); } })` so the stream immediately signals completion
- **Files modified:** gen-ui.test.ts, gen-chat.test.ts
- **Verification:** All 38 tests pass, no timeouts
- **Committed in:** `a415567` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 type bug, 1 blocking cross-package type error, 1 test correctness bug)
**Impact on plan:** All fixes necessary for correctness. No scope creep. The rialto-catalog subpath export is a clean improvement to the package API.

## Issues Encountered

- `@fastify/rate-limit` type augmentation for `FastifyContextConfig.rateLimit` required `/// <reference types="@fastify/rate-limit" />` in route files since the rate limit plugin is registered in `app.ts` not in the route files themselves. Fixed with triple-slash reference directive.

## User Setup Required

**`AI_GATEWAY_API_KEY` must be configured in DO App Platform** for the AI Gateway model string routing to function in production. This is a Pulumi secret added to the agent service environment — covered in Plan 13-03 (Pulumi deploy).

## Next Phase Readiness

- Routes are implemented and tested — ready for Phase 13-02 (Pulumi deploy of agent service to DO App Platform)
- `AI_GATEWAY_API_KEY` env var not yet set in DO App Platform (Plan 13-03)
- SSE end-to-end not yet verified through production routing (Plan 13-03)

## Self-Check: PASSED

All artifacts verified:
- FOUND: services/agent/src/routes/gen-ui.ts
- FOUND: services/agent/src/routes/gen-chat.ts
- FOUND: services/agent/src/routes/gen-ui.test.ts
- FOUND: services/agent/src/routes/gen-chat.test.ts
- FOUND: .planning/phases/13-ai-generation-endpoint/13-01-SUMMARY.md
- FOUND: commit 01a7a1c (Task 1)
- FOUND: commit a415567 (Task 2)

---
*Phase: 13-ai-generation-endpoint*
*Completed: 2026-03-28*
