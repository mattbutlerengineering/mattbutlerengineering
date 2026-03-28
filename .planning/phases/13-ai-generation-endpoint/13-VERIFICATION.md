---
phase: 13-ai-generation-endpoint
verified: 2026-03-27T21:40:00Z
status: gaps_found
score: 10/12 must-haves verified
re_verification: false
gaps:
  - truth: "SSE chunks arrive incrementally through the CF edge router (not buffered into one response)"
    status: failed
    reason: "Production verification deferred — agent-api service not yet live in DO App Platform (pulumi up not applied after Plan 13-02)"
    artifacts:
      - path: "infrastructure/pulumi/index.ts"
        issue: "agent-api Pulumi component is defined but pulumi up has not been run; production endpoint returns 404 not 401"
    missing:
      - "Run pulumi up from infrastructure/pulumi/ after setting aiGatewayApiKey secret to deploy agent-api to DO App Platform"
      - "Post-deploy: curl -N verification of SSE streaming through edge router"
  - truth: "Hard monthly spend cap is set in Anthropic console"
    status: failed
    reason: "INFRA-04 is a manual console action that was documented but not confirmed completed; 13-SUMMARY claims it complete but describes it as 'requires manual action in Anthropic console — must be done by user before production traffic begins'"
    artifacts: []
    missing:
      - "Navigate to https://console.anthropic.com/settings/limits and set a hard monthly spend cap (recommended: $50)"
      - "Confirm cap is active before production traffic begins"
human_verification:
  - test: "Verify SSE streaming works end-to-end through CF Worker edge router"
    expected: "curl -N with valid Auth0 JWT returns multiple data: chunks progressively, not one buffered response; x-vercel-ai-ui-message-stream: v1 header present"
    why_human: "Requires live deployed agent-api service (pulumi up) and valid Auth0 token; cannot be verified from codebase alone"
  - test: "Confirm Anthropic hard spend cap is set"
    expected: "Anthropic console at https://console.anthropic.com/settings/limits shows a hard monthly cap configured (recommended: $50)"
    why_human: "External console action with no codebase artifact; requires user login to Anthropic dashboard"
  - test: "Confirm prompt caching active in production"
    expected: "Agent service logs show cacheReadInputTokens > 0 on second identical request; check via doctl apps logs after pulumi up"
    why_human: "Requires live service and two sequential requests to the same endpoint to populate cache"
---

# Phase 13: AI Generation Endpoint Verification Report

**Phase Goal:** Two streaming generation routes exist in services/agent — one for standalone spec generation and one for conversational mode — secured with Auth0 JWT, rate limited per user, prompt-cached, cost-logged, and verified end-to-end through the CF Worker edge router; supporting infrastructure (edge routing, Pulumi resources, API keys) is fully in place

**Verified:** 2026-03-27T21:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POST /api/gen/ui with valid Auth0 JWT returns streaming SSE response | VERIFIED | `services/agent/src/routes/gen-ui.ts` implements `streamText + toUIMessageStream()` with `requireAuth` preHandler; test confirms streaming path |
| 2 | POST /api/gen/ui without Authorization header returns 401 | VERIFIED | `requireAuth` is registered as `preHandler`; gen-ui.test.ts line 73 explicitly tests 401 without auth and passes |
| 3 | POST /api/gen/chat with valid Auth0 JWT and messages array returns streaming SSE response | VERIFIED | `services/agent/src/routes/gen-chat.ts` follows identical pattern to gen-ui; test confirms 401 gate and streaming args |
| 4 | Rate limiting applies per Auth0 sub claim, not per IP | VERIFIED | `app.ts` line 93: `keyGenerator: (req) => (req.user?.id ?? req.ip)`; both route files use per-route `config.rateLimit.keyGenerator` using `request.user?.id ?? request.ip` |
| 5 | onFinish callback logs modelId, inputTokens, outputTokens, cacheReadInputTokens | VERIFIED | Both route files implement `onFinish` extracting `usage.inputTokens`, `usage.outputTokens`, `providerMetadata?.anthropic.cacheReadInputTokens`; logged via `request.log.info` |
| 6 | Model defaults to haiku; caller can select sonnet via request body | VERIFIED | `gen-ui.ts` defines `MODELS = { haiku: "anthropic/claude-haiku-4.5", sonnet: "anthropic/claude-sonnet-4.6" }`; schema default `"haiku"`; test at line 141 verifies default; test at line 108 verifies sonnet override |
| 7 | Agent service has a Dockerfile that builds and runs successfully | VERIFIED | `services/agent/Dockerfile` exists as multi-stage build (builder + runner) following users service pattern; commit `10a2efe` confirms builder stage succeeded |
| 8 | Pulumi index.ts includes agent-api service component with AI_GATEWAY_API_KEY secret | VERIFIED | `infrastructure/pulumi/index.ts` lines 14, 150-181: `aiGatewayApiKey = config.requireSecret("aiGatewayApiKey")` and agent-api service with `AI_GATEWAY_API_KEY` env var |
| 9 | DO App Platform ingress routes /api/gen and /v1 to agent-api before the /api catch-all | VERIFIED | `infrastructure/pulumi/index.ts` lines 40-57: `/api/gen`, `/v1/sessions`, `/v1/orchestrate`, `/v1/webhooks` all route to `agent-api` before `/api` catch-all to `reservations-api` |
| 10 | deploy-services.yml watches services/agent/** for changes | VERIFIED | `.github/workflows/deploy-services.yml` lines 9, 12: `services/agent/**` and `packages/agent-core/**` in paths trigger |
| 11 | SSE chunks arrive incrementally through the CF edge router | FAILED | Production verification deferred — `pulumi up` not applied after Plan 13-02; production endpoint returns 404 (agent-api not in live DO App Platform spec) |
| 12 | Hard monthly spend cap is set in Anthropic console | FAILED | Manual console action; 13-03 SUMMARY explicitly states "requires manual action by user before production traffic begins" — no confirmation of completion |

**Score:** 10/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/agent/src/routes/gen-ui.ts` | POST /api/gen/ui streaming endpoint | VERIFIED | 103 lines; substantive implementation with streamText, requireAuth, caching, cost logging |
| `services/agent/src/routes/gen-chat.ts` | POST /api/gen/chat conversational endpoint | VERIFIED | 97 lines; substantive implementation matching gen-ui pattern |
| `services/agent/src/routes/gen-ui.test.ts` | Unit tests for gen-ui route | VERIFIED | 5 tests: 401 auth, 400 missing prompt, 400 prompt too long, sonnet model selection, haiku default — all passing |
| `services/agent/src/routes/gen-chat.test.ts` | Unit tests for gen-chat route | VERIFIED | 4 tests: 401 auth, 400 missing messages, streamText args, prompt caching config — all passing |
| `services/agent/src/app.ts` | Routes registered with rate limiting | VERIFIED | Lines 13-14 import genUiRoutes/genChatRoutes; lines 89-94 register rateLimit with correct keyGenerator; lines 102-103 register both gen routes |
| `services/agent/Dockerfile` | Multi-stage Docker build | VERIFIED | Builder + runner stages, non-root user (uid 1001), pnpm workspace, Prisma generate, port 3003 |
| `infrastructure/pulumi/index.ts` | Agent service component + ingress rules | VERIFIED | agent-api service with all env vars including AI_GATEWAY_API_KEY secret; 4 ingress rules before catch-all; GEN Service Binding commented for Phase 14 |
| `.github/workflows/deploy-services.yml` | CI trigger for agent service | VERIFIED | services/agent/** and packages/agent-core/** in paths trigger |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `services/agent/src/routes/gen-ui.ts` | `@mbe/rialto-catalog/catalog` | `catalog.prompt()` for system prompt | VERIFIED | Line 9: `import { catalog } from "@mbe/rialto-catalog/catalog"` (subpath export); line 13: `const SYSTEM_PROMPT = catalog.prompt()` |
| `services/agent/src/routes/gen-ui.ts` | `ai` | `streamText + Output.object()` | VERIFIED | Line 4: `import { streamText, Output } from "ai"` |
| `services/agent/src/app.ts` | `services/agent/src/routes/gen-ui.ts` | `fastify.register(genUiRoutes)` | VERIFIED | Line 13: import; line 102: `await fastify.register(genUiRoutes)` |
| `services/agent/src/app.ts` | `services/agent/src/routes/gen-chat.ts` | `fastify.register(genChatRoutes)` | VERIFIED | Line 14: import; line 103: `await fastify.register(genChatRoutes)` |
| `infrastructure/pulumi/index.ts` | `services/agent/Dockerfile` | `dockerfilePath reference` | VERIFIED | Line 158: `dockerfilePath: "services/agent/Dockerfile"` |
| `.github/workflows/deploy-services.yml` | `services/agent/**` | path trigger | VERIFIED | Line 9: `- "services/agent/**"` in push paths |
| `infrastructure/pulumi/index.ts` | `aiGatewayApiKey secret` | `config.requireSecret` | VERIFIED | Line 14: `const aiGatewayApiKey = config.requireSecret("aiGatewayApiKey")` referenced in agent-api env at line 170 |
| CF edge router | `/gen*` static SPA (future) | GEN Service Binding | PARTIAL | GEN Service Binding is commented in Pulumi (`// { name: "GEN", service: "mattbutlerengineering-gen" }`); edge-router.js has no `/gen` path handler (correct — gen API routes through `/api/gen` which proxies to DO); static gen SPA is Phase 14 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GEN-01 | 13-01 | POST /api/gen/ui endpoint streams JSONL spec patches via SSE (standalone mode) | SATISFIED | `gen-ui.ts` calls `streamText` with `Output.object` schema and `result.toUIMessageStream()`; SSE headers set |
| GEN-02 | 13-01 | POST /api/gen/chat endpoint streams text + JSONL via SSE (conversational mode) | SATISFIED | `gen-chat.ts` follows same pattern; accepts `messages` array for conversational context |
| GEN-03 | 13-01 | Auth0 JWT authentication required on all generation endpoints | SATISFIED | Both routes use `preHandler: [requireAuth]`; tests verify 401 without auth |
| GEN-04 | 13-01 | Per-user rate limiting by Auth0 sub claim | SATISFIED | `app.ts` global rateLimit with `req.user?.id ?? req.ip`; both routes override per-route with same keyGenerator |
| GEN-05 | 13-01 | Anthropic prompt caching configured with cache_control on catalog system prompt | SATISFIED | Both routes set `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` on system message; gen-chat.test.ts verifies this |
| GEN-06 | 13-01 | Cost logging — cache_read_input_tokens, total tokens, and model used per request | SATISFIED | `onFinish` in both routes logs `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `modelId` via `request.log.info` |
| GEN-07 | 13-03 | SSE streaming verified end-to-end through CF Worker edge router to browser | NEEDS HUMAN | Production verification blocked — agent-api not live; pulumi up required; edge router passes `/api/*` directly to DO without buffering (architectural, code correct) |
| GEN-08 | 13-01 | Model selection — Haiku 4.5 for simple prompts, Sonnet 4.6 for complex | SATISFIED | `gen-ui.ts` MODELS map with default haiku; model body param allows sonnet override; gen-chat.ts hardcodes haiku |
| INFRA-01 | 13-02 | CF Worker edge router gains /gen* route and GEN Service Binding | PARTIAL | GEN Service Binding is commented in Pulumi (correct — target Worker doesn't exist until Phase 14); edge-router.js routes `/api/gen*` through the existing `/api/*` DO proxy path — `/gen` static SPA route is Phase 14. The API gen routes work through existing `/api/*` handler. |
| INFRA-02 | (deferred) | Pulumi resource for gen app CF Worker with Static Assets | DEFERRED | Explicitly deferred to Phase 14 per Plan 13-02 objective; REQUIREMENTS.md shows Pending status |
| INFRA-03 | 13-02 | AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY configured in DO App Platform | SATISFIED | `infrastructure/pulumi/index.ts` line 170: `{ key: "AI_GATEWAY_API_KEY", value: aiGatewayApiKey, type: "SECRET" }` in agent-api envs; Pulumi secret defined at line 14 |
| INFRA-04 | 13-03 | Hard monthly spend cap configured in Anthropic console | NEEDS HUMAN | Manual console action; 13-03 SUMMARY acknowledges deferral pending user action; no codebase artifact exists to verify |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None significant | — | — | All implementation files are substantive; no TODOs, stubs, or empty returns in gen-ui.ts, gen-chat.ts, or app.ts |

No blocker anti-patterns found in the generation route code. The GEN Service Binding in Pulumi is correctly commented with an explanatory note — this is intentional design, not a stub.

### Human Verification Required

#### 1. SSE Streaming End-to-End

**Test:** Run `pulumi up` from `infrastructure/pulumi/` to deploy agent-api, then:
```bash
TOKEN=$(mbe auth token)
curl -N \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a simple card with a title and subtitle"}' \
  https://mattbutlerengineering.com/api/gen/ui 2>&1 | head -20
```
**Expected:** Multiple `data: {...}` lines arriving progressively (not all at once); `x-vercel-ai-ui-message-stream: v1` in response headers

**Why human:** Requires live deployed service (pulumi up not yet applied) and valid Auth0 token; cannot be confirmed from codebase inspection alone

#### 2. Anthropic Hard Spend Cap (INFRA-04)

**Test:** Navigate to https://console.anthropic.com/settings/limits

**Expected:** Hard monthly spend cap is configured (recommended: $50) to prevent runaway generation costs

**Why human:** External Anthropic console action; no codebase artifact exists; requires user login

#### 3. Prompt Caching Confirmation

**Test:** After deploying, send two identical requests to `/api/gen/ui`, then check agent logs:
```bash
APP_ID="5dbdcf45-4053-4518-a97b-f1e2b3122a61"
doctl apps logs "$APP_ID" --component agent-api --tail 20 | grep "gen cost log"
```
**Expected:** Second request shows `cacheReadInputTokens > 0` in the log JSON

**Why human:** Requires live service, sequential requests, and log access

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — Production deployment not applied (GEN-07):** The Pulumi changes from Plan 13-02 added the `agent-api` service component but `pulumi up` was never run to apply them. The live DO App Platform deployment predates these changes and only contains `users-api` and `reservations-api`. Confirmed by Plan 13-03 which found the production endpoint returns 404. The code and infrastructure definitions are complete and correct — this is an operational gap, not a code gap.

**Gap 2 — Anthropic spend cap unconfirmed (INFRA-04):** The 13-03 SUMMARY lists `INFRA-04` in `requirements-completed` but explicitly describes it as a manual user action still pending. No confirmation exists that the cap was actually set.

**Pre-conditions for both gaps:** Run `pulumi config set --secret mbe-infrastructure:aiGatewayApiKey <key>` then `pulumi up` from `infrastructure/pulumi/`. After the service is live, set the Anthropic spend cap at the console URL above.

**What is working (10/12):** Both gen route files are substantive and fully implemented. Auth, rate limiting, prompt caching, cost logging, and model selection are all correctly wired. All 38 service tests pass (5 test files including 5 gen-ui tests and 4 gen-chat tests). The Dockerfile, Pulumi component, ingress rules, and CI trigger are all in place. The INFRA-01 GEN Service Binding is correctly placed as a commented stub in Pulumi — activating it before Phase 14 deploys the gen Worker would cause a Pulumi error.

---

_Verified: 2026-03-27T21:40:00Z_
_Verifier: Claude (gsd-verifier)_
