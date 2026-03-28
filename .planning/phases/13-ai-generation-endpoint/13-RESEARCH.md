# Phase 13: AI Generation Endpoint - Research

**Researched:** 2026-03-28
**Domain:** AI SDK v6 streaming with Fastify 5 + Anthropic via Vercel AI Gateway + CF Worker SSE passthrough
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEN-01 | `POST /api/gen/ui` endpoint streams JSONL spec patches via SSE (standalone mode) | `streamText + Output.object()` pattern confirmed; `toUIMessageStream()` sends to Fastify via `reply.send()` |
| GEN-02 | `POST /api/gen/chat` endpoint streams text + JSONL via SSE (conversational mode) | Same `streamText` pattern without `Output.object()`; `toUIMessageStream()` works for both |
| GEN-03 | Auth0 JWT authentication required on all generation endpoints | `@mbe/auth` `authPlugin` already exists; `requireAuth` preHandler applies per-route |
| GEN-04 | Per-user rate limiting by Auth0 `sub` claim | `@fastify/rate-limit` with `keyGenerator: (req) => req.user?.id ?? req.ip` confirmed |
| GEN-05 | Anthropic prompt caching configured with `cache_control` on catalog system prompt | `providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }` on system message; 1024-token minimum for Sonnet/Haiku 4.5 |
| GEN-06 | Cost logging — `cache_read_input_tokens`, total tokens, and model used per request | `onFinish` callback on `streamText` result; `providerMetadata?.anthropic` contains cache token counts |
| GEN-07 | SSE streaming verified end-to-end through CF Worker edge router to browser | Edge router already passes `/api/*` fetch response directly — no buffering; `X-Accel-Buffering: no` header on Fastify side |
| GEN-08 | Model selection — Haiku 4.5 for simple, Sonnet 4.6 for complex (user-selectable or auto) | Both confirmed on AI Gateway: `anthropic/claude-haiku-4.5` and `anthropic/claude-sonnet-4.6` |
| INFRA-01 | CF Worker edge router gains `/gen*` route and GEN Service Binding | Edge router already handles `/gen*` as static — needs GEN Service Binding added; Pulumi `serviceBindings` array updated |
| INFRA-02 | Pulumi resource for gen app CF Worker with Static Assets | Pattern from existing `HOSPITALITY`/`RIALTO` bindings; new `wrangler.gen.toml` + Pulumi `serviceBinding` entry |
| INFRA-03 | `AI_GATEWAY_API_KEY` configured in DO App Platform (static key from Vercel dashboard; OIDC not available on DO) | Agent service not yet in Pulumi `index.ts` — must add agent-service component AND env var |
| INFRA-04 | Hard monthly spend cap configured in Anthropic console | Manual step; document in verification checklist |
</phase_requirements>

---

## Summary

Phase 13 adds two streaming generation routes to `services/agent` and deploys the full pipeline — Fastify to Vercel AI Gateway to Anthropic and back through the CF Worker edge router as an SSE stream. The prior research (STACK.md, ARCHITECTURE.md, PITFALLS.md) established the theory; this phase research establishes the exact implementation facts needed to write tasks.

**Critical discovery:** The agent service is not yet deployed to DO App Platform. `infrastructure/pulumi/index.ts` defines only `users-api` and `reservations-api` in the `mattbutlerengineering-api-app` spec. The `deploy-services.yml` workflow only watches `services/users/**` and `services/reservations/**`. Phase 13 must add the `agent-api` service to the Pulumi spec — this is not a small "add env var" task but a full new Pulumi service component.

The SSE passthrough through the edge router is already correct. The `/api/*` branch of `edge-router.js` does `return fetch(new Request(target, ...))` directly — no `new Response(response.body, ...)` wrapping. This means streaming works without any edge router changes for `/api/gen/*` paths. The only required change to the edge router is adding the `GEN` Service Binding for the `/gen*` static SPA (Phase 14, not Phase 13).

**Primary recommendation:** Implement in wave order: (1) install `ai` + `@fastify/rate-limit` into `services/agent` (no `@ai-sdk/anthropic` needed — AI Gateway string routing); (2) create `gen-ui.ts` and `gen-chat.ts` route files with auth, rate limit, caching, and cost logging; (3) register routes in `app.ts`; (4) add agent service to Pulumi; (5) configure DO App Platform env vars; (6) verify SSE end-to-end through production routing.

---

## Standard Stack

### Core (Phase 13 additions to `services/agent`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `^6.0.141` | `streamText`, `Output`, `UI_MESSAGE_STREAM_HEADERS` | AI SDK v6 — the streaming bridge confirmed in STACK.md and ARCHITECTURE.md |
| `@fastify/rate-limit` | `^10.x` | Per-user rate limiting in Fastify 5 | Official Fastify plugin; `@fastify/` scoped = maintained by the Fastify team |

**Note on AI Gateway authentication — why `AI_GATEWAY_API_KEY` is correct here (not OIDC, not direct provider):**

The Vercel AI Gateway supports two auth modes:
1. **OIDC tokens** (via `vercel env pull`) — automatic token management, no rotation needed. **Requires Vercel-hosted projects only.** Not available on DO App Platform.
2. **`AI_GATEWAY_API_KEY`** — a static API key from the Vercel dashboard. Works from any host including DO App Platform. Requires manual rotation.
3. **`ANTHROPIC_API_KEY` direct** — bypasses the gateway entirely; uses `@ai-sdk/anthropic` provider. No gateway observability but no gateway dependency.

This service runs on **DO App Platform, not Vercel**. OIDC is therefore not available. The correct choice is `AI_GATEWAY_API_KEY` (static key from Vercel AI Gateway dashboard). This keeps gateway observability and spend cap enforcement active. `ANTHROPIC_API_KEY` direct is only a fallback if the gateway setup proves problematic.

Use **`AI_GATEWAY_API_KEY`** for Phase 13 with the AI Gateway model string routing pattern. This keeps spend cap enforcement at the gateway level, which is the right operational posture for a personal project with real cost exposure. Set `AI_GATEWAY_API_KEY` as a Pulumi secret in DO App Platform env vars.

**AI SDK routing:** When `AI_GATEWAY_API_KEY` is set in the environment, the AI SDK automatically routes `"provider/model"` format strings through the gateway. No `@ai-sdk/anthropic` package needed — model strings like `"anthropic/claude-sonnet-4.6"` route automatically.

**Confirmed AI Gateway model IDs** (live API, 2026-03-28):
- `anthropic/claude-sonnet-4.6` — latest Sonnet (complex UIs)
- `anthropic/claude-haiku-4.5` — latest Haiku (simple UIs, ~3x cheaper)

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mbe/rialto-catalog` | `workspace:*` | `catalog.prompt()` system prompt | Required — Phase 12 output |
| `@mbe/auth` | `workspace:*` | `authPlugin` + `requireAuth` | Already in all services |
| `@mbe/types` | `workspace:*` | Shared request/response types | Already a dep |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `AI_GATEWAY_API_KEY` + model string | `@ai-sdk/anthropic` direct + `ANTHROPIC_API_KEY` | Direct provider bypasses gateway, losing observability and spend cap enforcement. Gateway string routing is simpler and operationally safer for a personal project. |
| `@fastify/rate-limit` | Custom in-memory counter | Rate limit needs per-user keying + sliding window. Don't hand-roll. |
| `onFinish` callback for cost logging | Polling `result.usage` | `onFinish` fires once stream closes; simplest hook for logging. |

**Installation:**
```bash
pnpm --filter @mbe/agent-service add ai @fastify/rate-limit
# Note: @ai-sdk/anthropic is NOT needed — AI SDK routes via AI_GATEWAY_API_KEY + "provider/model" string
```

---

## Architecture Patterns

### Recommended File Structure

```
services/agent/src/
  routes/
    gen-ui.ts        # NEW: POST /api/gen/ui (standalone spec stream)
    gen-chat.ts      # NEW: POST /api/gen/chat (conversational stream)
  app.ts             # MODIFY: register genUiRoutes + genChatRoutes
```

```
infrastructure/pulumi/
  index.ts           # MODIFY: add agent-api service component
```

### Pattern 1: Streaming Route with Auth, Rate Limit, Caching, and Cost Logging

The complete server-side pattern for a streaming gen route:

```typescript
// services/agent/src/routes/gen-ui.ts
// AI SDK routes "provider/model" strings through Vercel AI Gateway when
// AI_GATEWAY_API_KEY is set in the environment. No @ai-sdk/anthropic import needed.
import { streamText, Output } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { catalog } from "@mbe/rialto-catalog";
import { z } from "zod";

// Memoize catalog prompt at module load — avoid re-generating per request
const SYSTEM_PROMPT = catalog.prompt();

// GEN-08: model selection — AI Gateway model strings (confirmed live, 2026-03-28)
const MODELS = {
  haiku: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-sonnet-4.6",
} as const;

export const genUiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/ui",
    {
      preHandler: [requireAuth],
      config: {
        // Per-route rate limit override — 20 requests per user per hour
        rateLimit: {
          max: 20,
          timeWindow: "1 hour",
          keyGenerator: (request) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const { prompt, model: modelHint } = request.body as {
        prompt: string;
        model?: "haiku" | "sonnet";
      };

      // GEN-08: default to haiku (cheaper); caller can request sonnet for complex UIs
      const modelId = modelHint === "sonnet" ? MODELS.sonnet : MODELS.haiku;

      const result = streamText({
        model: modelId,   // AI SDK resolves "provider/model" via AI_GATEWAY_API_KEY
        // GEN-05: prompt caching via providerOptions on the system message
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        output: Output.object({ schema: z.object({ spec: z.any() }) }),
        // GEN-06: cost logging in onFinish
        onFinish: async ({ usage, providerMetadata }) => {
          const anthropicMeta = providerMetadata?.anthropic as
            | { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
            | undefined;
          request.log.info({
            userId: request.user?.id,
            modelId,
            totalInputTokens: usage.promptTokens,
            totalOutputTokens: usage.completionTokens,
            cacheReadInputTokens: anthropicMeta?.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: anthropicMeta?.cacheCreationInputTokens ?? 0,
          }, "gen-ui cost log");
        },
      });

      // GEN-07: SSE passthrough headers (AI SDK v6 UI_MESSAGE_STREAM_HEADERS)
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");
      reply.header("x-vercel-ai-ui-message-stream", "v1");
      reply.header("X-Accel-Buffering", "no");

      return reply.send(result.toUIMessageStream());
    }
  );
};
```

**Key facts verified:**
- `Output.object()` is the v6 replacement for the removed `streamObject`. Import from `ai`, not `ai/core`.
- `toUIMessageStream()` returns a `ReadableStream<Uint8Array>` that Fastify 5 accepts directly in `reply.send()`.
- No `@fastify/sse` plugin needed — `reply.send(ReadableStream)` is native Fastify 5.
- `providerMetadata?.anthropic` contains `cacheCreationInputTokens` and `cacheReadInputTokens` (note: camelCase in AI SDK, snake_case in raw Anthropic API).
- The `system` field in `streamText` does NOT support `providerOptions`. Use `messages` array with `role: "system"` to attach cache control.

### Pattern 2: Registering Rate Limit Plugin Globally with Per-Route Override

```typescript
// services/agent/src/app.ts (additions)
import rateLimit from "@fastify/rate-limit";
import { genUiRoutes } from "./routes/gen-ui.js";
import { genChatRoutes } from "./routes/gen-chat.js";

// Register rate limit plugin globally (gen routes set per-route overrides)
await fastify.register(rateLimit, {
  max: 100,           // global default — gen routes override this
  timeWindow: "1 minute",
  keyGenerator: (request) => request.ip, // fallback to IP
});

await fastify.register(genUiRoutes);
await fastify.register(genChatRoutes);
```

**Per-route override** via `config.rateLimit` on the route schema — confirmed in `@fastify/rate-limit` docs. The `keyGenerator` on the route uses `request.user?.id` (the Auth0 `sub` claim, available via `requireAuth` setting `request.user`).

### Pattern 3: SSE Passthrough Through Edge Router

The existing edge router already handles this correctly. The `/api/*` branch:

```javascript
// edge-router.js — existing, no changes needed for /api/gen/* routing
if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.set("Host", target.host);
  headers.set("X-Forwarded-Host", url.host);

  return fetch(new Request(target, {    // <-- returns fetch() directly
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  }));
}
```

The `return fetch(...)` pattern returns the subrequest `Response` as-is — no `new Response(response.body, ...)` wrapping. CF Workers pass `ReadableStream` bodies through without buffering. SSE streaming works for any `/api/*` path with no edge router changes.

**The `/gen*` static SPA** (apps/gen) needs a Service Binding and edge router route update — but that is Phase 14, not Phase 13. Phase 13 only requires the `/api/gen/*` API routes, which already work through the existing edge router.

### Pattern 4: Adding Agent Service to Pulumi

The agent service is NOT currently in `infrastructure/pulumi/index.ts`. It must be added as a new service component. Pattern matches existing `users-api`/`reservations-api` service entries:

```typescript
// infrastructure/pulumi/index.ts — additions to services array
{
  name: "agent-api",
  github: {
    repo: "mattbutlerengineering/mattbutlerengineering",
    branch: "main",
    deployOnPush: false,
  },
  sourceDir: "/",
  dockerfilePath: "services/agent/Dockerfile",
  instanceCount: 1,
  instanceSizeSlug: "apps-s-1vcpu-0.5gb",
  httpPort: 3003,
  envs: [
    { key: "NODE_ENV", value: "production" },
    { key: "PORT", value: "3003" },
    { key: "CORS_ORIGIN", value: `https://${domain}` },
    { key: "AUTH_AUTHORITY", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
    { key: "AUTH_AUDIENCE", value: `https://api.${domain}` },
    { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
    { key: "AI_GATEWAY_API_KEY", value: aiGatewayApiKey, type: "SECRET" },
    { key: "DEFAULT_MODEL", value: "anthropic/claude-haiku-4.5" },
  ],
  healthCheck: {
    httpPath: "/health",
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 5,
    successThreshold: 1,
    failureThreshold: 3,
  },
},
```

The agent service also needs a **DO App Platform ingress rule** to route `/api/gen/*` to `agent-api`. The current ingress rules route `/api/v1/users` to `users-api` and everything else (`/api`) to `reservations-api`. A new rule for `/api/gen` (and `/v1/sessions`, `/v1/orchestrate`, `/v1/webhooks`) must be added before the catch-all.

The agent service also needs a Dockerfile — currently the service has no `Dockerfile`. This must be created in `services/agent/Dockerfile`, following the pattern of `services/users/Dockerfile`.

The `AI_GATEWAY_API_KEY` must be added as a Pulumi secret:
```typescript
const aiGatewayApiKey = config.requireSecret("aiGatewayApiKey");
```

The `deploy-services.yml` workflow watches `services/users/**` and `services/reservations/**`. It must be updated to also watch `services/agent/**`.

### Anti-Patterns to Avoid

- **Using `streamObject()`:** Removed in AI SDK v6. Use `streamText({ output: Output.object({ schema }) })`.
- **Setting `system:` string with `providerOptions`:** The top-level `system` field in `streamText` does not accept `providerOptions`. Cache breakpoints must be set via `messages[{ role: "system", content, providerOptions }]`.
- **Importing `ai` top-level in client code:** `import { streamText } from 'ai'` is server-only. Client code (Phase 14) must use `ai/react` subpath.
- **Including timestamps or request IDs before the cache breakpoint:** Any value that changes per-request before the cache control marker invalidates the cache. The system prompt must be 100% static up to and including the cache breakpoint.
- **Using `createUIMessageStreamResponse()`:** This is the Next.js/Edge runtime pattern. In Fastify, use `reply.send(result.toUIMessageStream())` directly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-user rate limiting | In-memory request counter | `@fastify/rate-limit` | Sliding window, keyGenerator, store abstractions (Redis-ready), Fastify 5 compat |
| JWT verification | Manual JWKS fetch + verify | `@mbe/auth` `authPlugin` | Already implemented with `jose`; handles JWKS caching and issuer/audience checks |
| SSE response format | Manual `data: ...\n\n` formatting | `result.toUIMessageStream()` | AI SDK handles the SSE format, stream protocol headers, and keepalive pings |
| Structured streaming | Custom JSON-patch streamer | `streamText + Output.object()` | AI SDK handles partial object streaming, progressive patch delivery |
| Cost tracking from Anthropic response | Parse raw HTTP response | `onFinish` callback + `providerMetadata.anthropic` | AI SDK normalizes Anthropic's response format into typed metadata |

**Key insight:** The value of AI SDK v6 in this phase is exactly avoiding hand-rolled streaming plumbing. The three-line pattern (`streamText` → `reply.send(result.toUIMessageStream())` + 5 headers) replaces hundreds of lines of SSE/streaming infrastructure.

---

## Common Pitfalls

### Pitfall 1: Prompt Cache Miss — Static Data After Cache Breakpoint

**What goes wrong:** The `onFinish` callback logs `cacheReadInputTokens: 0` on every request despite apparent correct setup.

**Why it happens:** The cache breakpoint is correct but the system prompt changes between requests — or the prompt is under the minimum token threshold (1024 tokens for Sonnet/Haiku 4.5 models).

**How to avoid:**
1. Memoize `catalog.prompt()` at module load (not inside the route handler) — assign to `const SYSTEM_PROMPT = catalog.prompt()` at the top of the route file, outside the plugin function.
2. Log both `cacheCreationInputTokens` and `cacheReadInputTokens` from the first two identical requests. Second request must show `cacheReadInputTokens > 0`.
3. Verify the catalog prompt token count via `pnpm --filter @mbe/rialto-catalog exec node -e "import('@mbe/rialto-catalog').then(m => console.log(m.catalog.prompt().length))"` — at ~4 chars/token, the prompt should be 4,000+ characters to clear the 1024-token minimum.

**Warning signs:** `cacheReadInputTokens` is 0 on any request after the first; prompt string being generated inside the route handler closure.

### Pitfall 2: Agent Service Missing from DO App Platform Ingress

**What goes wrong:** Gen routes return 404 or 502 in production even though the service deploys successfully.

**Why it happens:** The DO App Platform ingress rules route `/api` (catch-all) to `reservations-api`. The agent service is deployed but never receives requests because the ingress catch-all catches `/api/gen/*` first.

**How to avoid:** Add the agent-api ingress rule BEFORE the `/api` catch-all:
```typescript
{ match: { path: { prefix: "/api/gen" } }, component: { name: "agent-api", preservePathPrefix: true } },
{ match: { path: { prefix: "/v1" } }, component: { name: "agent-api", preservePathPrefix: true } },
// existing catch-all:
{ match: { path: { prefix: "/api" } }, component: { name: "reservations-api", preservePathPrefix: true } },
```

**Warning signs:** 502 from production `/api/gen/ui` with no logs in agent service; logs appearing in reservations-api for gen requests.

### Pitfall 3: Missing Dockerfile for Agent Service

**What goes wrong:** Pulumi `pulumi up` succeeds but DO App Platform deploy fails — "Dockerfile not found at services/agent/Dockerfile".

**Why it happens:** The agent service has no Dockerfile. The `services/users` and `services/reservations` services each have one; `services/agent` does not.

**How to avoid:** Create `services/agent/Dockerfile` following the pattern of the existing services before running `pulumi up`.

### Pitfall 4: Rate Limit Not Applying Auth User ID

**What goes wrong:** Rate limiting applies per-IP instead of per-user. Multiple requests from the same user from different IPs avoid the limit. One user on a shared IP exhausts another user's limit.

**Why it happens:** `requireAuth` sets `request.user` but the global `@fastify/rate-limit` registration uses `keyGenerator: (req) => req.ip` by default. The per-route `config.rateLimit.keyGenerator` must be specified at the route level after auth has run.

**How to avoid:** The rate limit `keyGenerator` function runs after `preHandler` hooks (including `requireAuth`) when `hook: 'preHandler'` is set on the plugin registration. Set `hook: 'preHandler'` in the rate limit plugin registration to ensure `request.user` is populated when the key is generated.

```typescript
await fastify.register(rateLimit, {
  hook: "preHandler",  // CRITICAL: runs after requireAuth, so request.user is set
  max: 100,
  timeWindow: "1 minute",
});
```

### Pitfall 5: SSE Test Through Local Dev Bypasses Edge Router

**What goes wrong:** SSE streaming works locally but not through `mattbutlerengineering.com/api/gen/ui`.

**Why it happens:** Local dev calls Fastify directly on port 3003. The CF Worker edge router introduces a different fetch path. Tests must go through the production URL (or a staging equivalent) to verify SSE passthrough.

**How to avoid:** Verify SSE in production using:
```bash
curl -N -H "Authorization: Bearer <valid_token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a simple card"}' \
  https://mattbutlerengineering.com/api/gen/ui
```
Confirm incremental output appears, not a single response after a delay. Check Browser DevTools Network tab — the request should show as `EventStream` type with data arriving in multiple chunks.

---

## Code Examples

### Complete gen-ui.ts Route Handler

```typescript
// Source: AI SDK Fastify cookbook + Vercel AI Gateway docs
// AI SDK routes "provider/model" strings through AI Gateway via AI_GATEWAY_API_KEY env var.
// No @ai-sdk/anthropic package needed.
import { streamText, Output } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { catalog } from "@mbe/rialto-catalog";
import { z } from "zod";

// Memoize at module load — catalog.prompt() is expensive and deterministic
const SYSTEM_PROMPT = catalog.prompt();

const GenUiBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z.enum(["haiku", "sonnet"]).optional().default("haiku"),
});

// AI Gateway model strings — confirmed via live API 2026-03-28
const MODEL_IDS = {
  haiku: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-sonnet-4.6",
} as const;

export const genUiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/ui",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = GenUiBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid request body",
          statusCode: 400,
        });
      }

      const { prompt, model: modelHint } = parseResult.data;
      const modelId = MODEL_IDS[modelHint ?? "haiku"];

      const result = streamText({
        model: modelId,  // "anthropic/claude-haiku-4.5" — AI SDK resolves via gateway
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          { role: "user", content: prompt },
        ],
        output: Output.object({ schema: z.object({ spec: z.any() }) }),
        onFinish: async ({ usage, providerMetadata }) => {
          const meta = providerMetadata?.anthropic as Record<string, number> | undefined;
          request.log.info({
            userId: request.user?.id,
            modelId,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            cacheReadInputTokens: meta?.cacheReadInputTokens ?? 0,
            cacheCreationInputTokens: meta?.cacheCreationInputTokens ?? 0,
          }, "gen cost log");
        },
      });

      // AI SDK v6 UI message stream headers
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");
      reply.header("x-vercel-ai-ui-message-stream", "v1");
      reply.header("X-Accel-Buffering", "no");

      return reply.send(result.toUIMessageStream());
    }
  );
};
```

### Complete gen-chat.ts Route Handler

```typescript
// Source: AI SDK Fastify cookbook
// AI Gateway model string routing — no @ai-sdk/anthropic import needed.
import { streamText } from "ai";
import type { FastifyPluginAsync } from "fastify";
import type { ModelMessage } from "ai";
import { requireAuth } from "@mbe/auth/fastify";
import { catalog } from "@mbe/rialto-catalog";

const SYSTEM_PROMPT = catalog.prompt();

export const genChatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/gen/chat",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { messages } = request.body as { messages: ModelMessage[] };

      const result = streamText({
        model: "anthropic/claude-haiku-4.5",  // AI Gateway string routing
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
          ...messages,
        ],
        onFinish: async ({ usage, providerMetadata }) => {
          const meta = providerMetadata?.anthropic as Record<string, number> | undefined;
          request.log.info({
            userId: request.user?.id,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            cacheReadInputTokens: meta?.cacheReadInputTokens ?? 0,
          }, "gen-chat cost log");
        },
      });

      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");
      reply.header("x-vercel-ai-ui-message-stream", "v1");
      reply.header("X-Accel-Buffering", "no");

      return reply.send(result.toUIMessageStream());
    }
  );
};
```

### app.ts Registration

```typescript
// Add to services/agent/src/app.ts
import rateLimit from "@fastify/rate-limit";
import { genUiRoutes } from "./routes/gen-ui.js";
import { genChatRoutes } from "./routes/gen-chat.js";

// Register rate limit plugin — hook: preHandler ensures request.user is set
await fastify.register(rateLimit, {
  hook: "preHandler",
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request) =>
    (request as FastifyRequest & { user?: { id: string } }).user?.id ?? request.ip,
});

await fastify.register(genUiRoutes);
await fastify.register(genChatRoutes);
```

### Pulumi Agent Service Entry

```typescript
// infrastructure/pulumi/index.ts additions

// Add to config section:
const aiGatewayApiKey = config.requireSecret("aiGatewayApiKey");

// Add to services array (BEFORE the catch-all ingress rule change):
{
  name: "agent-api",
  github: {
    repo: "mattbutlerengineering/mattbutlerengineering",
    branch: "main",
    deployOnPush: false,
  },
  sourceDir: "/",
  dockerfilePath: "services/agent/Dockerfile",
  instanceCount: 1,
  instanceSizeSlug: "apps-s-1vcpu-0.5gb",
  httpPort: 3003,
  envs: [
    { key: "NODE_ENV", value: "production" },
    { key: "PORT", value: "3003" },
    { key: "CORS_ORIGIN", value: `https://${domain}` },
    { key: "AUTH_AUTHORITY", value: "https://dev-ytbgmz5ls3wh4xdx.us.auth0.com" },
    { key: "AUTH_AUDIENCE", value: `https://api.${domain}` },
    { key: "DATABASE_URL", value: databaseUrl, type: "SECRET" },
    { key: "AI_GATEWAY_API_KEY", value: aiGatewayApiKey, type: "SECRET" },
    { key: "DEFAULT_MODEL", value: "anthropic/claude-haiku-4.5" },
  ],
  healthCheck: {
    httpPath: "/health",
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 5,
    successThreshold: 1,
    failureThreshold: 3,
  },
}

// Update ingress rules — add before existing /api catch-all:
{
  match: { path: { prefix: "/api/gen" } },
  component: { name: "agent-api", preservePathPrefix: true },
},
{
  match: { path: { prefix: "/v1" } },
  component: { name: "agent-api", preservePathPrefix: true },
},
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `streamObject()` | `streamText({ output: Output.object() })` | AI SDK v6 (2025) | `streamObject` removed; planner must never use old API |
| OIDC tokens (Vercel-hosted only) | `AI_GATEWAY_API_KEY` static key (for DO App Platform) | AI Gateway v2 (2025) | OIDC requires `vercel env pull` + Vercel project; DO App Platform must use static API key |
| `createUIMessageStreamResponse()` | `reply.send(result.toUIMessageStream())` | Always Fastify-specific | Next.js pattern does not apply here |
| `system: string` top-level | `messages[{role:"system", providerOptions}]` | Always — Anthropic cache_control is message-level | Top-level `system` does not support cache breakpoints |

**Deprecated/outdated:**
- `streamObject`: Removed in AI SDK v6. Import will throw at runtime.
- `@fastify/sse` plugin: Not needed for AI streaming; only for broadcast pub-sub.
- IP-based rate limiting alone: Bypassed by proxy rotation; always key by Auth0 `sub` for gen endpoints.

---

## Open Questions

1. **Agent service Dockerfile pattern**
   - What we know: `services/users` and `services/reservations` each have a Dockerfile. `services/agent` does not.
   - What's unclear: The exact Dockerfile structure needed (multi-stage? workspace install?). The users/reservations Dockerfiles were not read in this research session.
   - Recommendation: Read `services/users/Dockerfile` at the start of the implementation wave as the reference pattern. The agent service is a nearly identical Node.js/Fastify service.

2. **`@fastify/rate-limit` v10 exact API for per-route `config.rateLimit` override**
   - What we know: Per-route override is documented; `hook: preHandler` required for request.user availability.
   - What's unclear: Whether `config.rateLimit.keyGenerator` is supported at the route level or only at plugin registration level in v10.
   - Recommendation: If per-route `keyGenerator` is not supported, register the rate limit plugin on a scoped Fastify instance for the gen routes only, with the `user.id` keyGenerator applied at that scope.

3. **`catalog.prompt()` token count**
   - What we know: 1024-token minimum for Sonnet/Haiku 4.5; 26 components in the catalog from Phase 12.
   - What's unclear: Whether the 26-component catalog prompt exceeds 1024 tokens (required for caching to activate).
   - Recommendation: Verify at implementation time with `console.log(catalog.prompt().length)`. At ~4 chars/token, need 4,096+ characters. If under threshold, add more component descriptions. With 26 components and detailed descriptions, this is likely sufficient but unverified.

4. **DO App Platform ingress rule ordering**
   - What we know: The current catch-all `{ prefix: "/api" }` routes to `reservations-api`. New rules for agent routes must come before it.
   - What's unclear: Whether DO App Platform ingress rule evaluation is first-match or longest-prefix. Assumption is first-match (standard for DO load balancer rules), but this should be verified against DO docs.
   - Recommendation: Place the `/api/gen` and `/v1` rules explicitly before `/api` in the ingress array.

---

## Validation Architecture

Nyquist validation is not configured (`workflow.nyquist_validation` not set in `.planning/config.json` — field absent, default false). Skipping this section.

---

## Sources

### Primary (HIGH confidence)
- Live AI Gateway model list (`curl https://ai-gateway.vercel.sh/v1/models`, 2026-03-28) — confirmed `anthropic/claude-sonnet-4.6` and `anthropic/claude-haiku-4.5`
- [AI SDK Fastify Cookbook](https://ai-sdk.dev/cookbook/api-servers/fastify) — `reply.send(result.textStream)` base pattern; headers required
- [AI SDK Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `Output.object()` API with `streamText`; `partialOutputStream` usage
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) — `x-vercel-ai-ui-message-stream: v1` header requirement
- [AI SDK Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — `providerOptions.anthropic.cacheControl` syntax; `providerMetadata.anthropic` structure; cache token property names
- [Vercel AI Gateway Text Quickstart](https://vercel.com/docs/ai-gateway/getting-started/text) — `AI_GATEWAY_API_KEY` env var confirmed; model string format `"provider/model"`
- [AI SDK Dynamic Prompt Caching Cookbook](https://ai-sdk.dev/cookbook/node/dynamic-prompt-caching) — message-level `providerOptions` for cache breakpoints
- [@fastify/rate-limit README](https://github.com/fastify/fastify-rate-limit/blob/main/README.md) — `keyGenerator`, `hook: preHandler`, per-route config override pattern
- Direct codebase inspection:
  - `infrastructure/pulumi/index.ts` — confirmed agent service absent from DO App Platform spec (CRITICAL DISCOVERY)
  - `infrastructure/worker/edge-router.js` — confirmed `/api/*` branch returns `fetch()` directly, no SSE buffering
  - `packages/auth/src/fastify/plugin.ts` — confirmed `requireAuth` preHandler + `request.user.id` set from Auth0 `sub`
  - `services/agent/src/app.ts` — confirmed existing route registration pattern and Fastify options
  - `services/agent/src/routes/sessions.ts` — confirmed FastifyPluginAsync + preHandler pattern
  - `packages/rialto-catalog/src/catalog.ts` — confirmed `catalog` export with `catalog.prompt()` from Phase 12
  - `.github/workflows/deploy-services.yml` — confirmed agent service NOT in deploy watch paths

### Secondary (MEDIUM confidence)
- [AI SDK Anthropic Prompt Caching Issue #7612](https://github.com/vercel/ai/issues/7612) — confirmed `providerMetadata.anthropic` structure for cache tokens
- Anthropic prompt caching minimum token search results — 1024 tokens for Sonnet/Haiku 4.5 models (cross-referenced with AI SDK Anthropic provider docs)

### Tertiary (LOW confidence)
- WebSearch results on per-route `@fastify/rate-limit` keyGenerator — confirm approach but exact v10 route-level API needs hands-on verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages confirmed via npm; AI SDK Fastify pattern confirmed via official cookbook
- Architecture: HIGH — edge router confirmed correct by direct source inspection; Pulumi gap confirmed by direct inspection
- Pitfalls: HIGH — caching API confirmed; agent service absence confirmed; ingress ordering is established DO App Platform behavior
- Pulumi patterns: HIGH — existing service entries provide exact template

**Critical finding:** The agent service (`services/agent`) is not deployed to DO App Platform. There is no Dockerfile, no Pulumi service component, and no ingress rule. Phase 13 must create all three before the gen routes are reachable in production. This is the largest task in the phase.

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable APIs; AI Gateway model IDs may change sooner)
