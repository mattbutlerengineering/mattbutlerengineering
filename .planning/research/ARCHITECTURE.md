# Architecture Research

**Domain:** Generative UI integration into existing monorepo (Fastify + Vite SPAs + CF Worker edge)
**Researched:** 2026-03-27
**Confidence:** HIGH — patterns verified against official AI SDK v6 docs, json-render source, CF Workers docs, and live AI Gateway model list

---

## Standard Architecture

### System Overview

```
Browser
  |
  | HTTPS
  v
mattbutlerengineering.com (CF Worker: edge-router)
  |
  |-- /gen/*          --> Workers Static Assets: gen app (NEW, Service Binding)
  |-- /hospitality/*  --> Workers Static Assets: hospitality (existing, Service Binding)
  |-- /rialto/*       --> Workers Static Assets: rialto-web (existing, Service Binding)
  |-- /api/*          --> HTTP subrequest --> api.mattbutlerengineering.com (DO App Platform)
  |-- /*              --> Workers Static Assets: marketing (existing, Service Binding)
  |
  v (for /api/gen/*)
api.mattbutlerengineering.com (DO App Platform — existing host)
  |
  +-- services/agent/ (Fastify, port 3003) [EXTEND with /api/gen/* routes]
  |     |
  |     +--> POST /api/gen/ui        — streamText + Output.object() -> JSON spec stream
  |     +--> POST /api/gen/chat      — streamText -> UI message stream
  |
  +--> Vercel AI Gateway (ai-gateway.vercel.sh) via AI_GATEWAY_API_KEY
  +--> Anthropic Claude (anthropic/claude-sonnet-4.6)
```

```
packages/ (new and modified)
  rialto-catalog/ (NEW)     -- catalog + registry; shared by gen app + hospitality
  rialto/         (EXTEND)  -- add <GenCopilot> sidebar component
  types/          (EXTEND)  -- UISpec types, GenPromptRequest types
  api-client/     (EXTEND)  -- typed client for /api/gen/* endpoints

apps/
  gen/            (NEW)     -- playground SPA at /gen
  hospitality/    (EXTEND)  -- integrate <GenCopilot> sidebar via layout

services/
  agent/          (EXTEND)  -- /api/gen/* routes added to existing Fastify service
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `edge-router` (CF Worker) | Path-prefix routing; SSE passthrough | Add `/gen` Service Binding. SSE passes through transparently — CF Worker returns subrequest `Response` body as-is (ReadableStream passthrough, no buffering). |
| `services/agent` (Fastify) | AI generation endpoints; stream SSE | New routes `/api/gen/ui` (structured output via `streamText + Output.object()`) and `/api/gen/chat` (`streamText`). Both use `reply.send(result.toUIMessageStream())`. |
| `packages/rialto-catalog` (new) | Rialto component catalog + registry for json-render | `defineCatalog()` + `defineRegistry()` wrapping real Rialto component implementations; shared across apps. |
| `apps/gen` (new) | Standalone playground SPA | Vite SPA at `/gen`; `useUIStream` hook + `<Renderer>` from `@json-render/react`; editable prompt, live preview, JSON spec export. |
| `apps/hospitality` (extend) | Existing SPA + embedded AI copilot | Add `<GenCopilot>` to sidebar via route layout; copilot calls `/api/gen/chat`. |
| `packages/rialto` (extend) | Shared UI + new `<GenCopilot>` component | `<GenCopilot>` is a UI component; belongs in the design system package so any future app can embed it. |
| `packages/types` (extend) | Shared TypeScript types | `UISpec`, `GenPromptRequest`, `GenStreamResponse` types consumed by both services and apps. |
| `packages/api-client` (extend) | Typed fetch wrappers | `genApi.streamUI(prompt)` returning `ReadableStream`; auth headers injected automatically. |

---

## Recommended Project Structure

```
packages/
  rialto-catalog/
    package.json             -- name: @mbe/rialto-catalog; private: true
    src/
      catalog.ts             -- defineCatalog(schema, { components, actions })
      registry.tsx           -- defineRegistry(catalog, { components -> Rialto impls })
      index.ts               -- re-export catalog + registry + inferred types
    tsconfig.json

apps/
  gen/
    package.json             -- name: @mbe/gen; deps: @mbe/rialto, @mbe/rialto-catalog, @mbe/api-client
    vite.config.ts           -- base: "/gen/", server.port: 3005
    src/
      main.tsx               -- RialtoProvider, BrowserRouter basename="/gen"
      pages/
        Playground.tsx       -- prompt textarea + <Renderer> + streaming state
      components/
        PromptBar.tsx        -- controlled input, send button
        PreviewPane.tsx      -- <Renderer spec={spec} registry={registry} />
        CodeExport.tsx       -- show generated JSON spec + export-as-code

services/
  agent/
    src/
      routes/
        gen-ui.ts            -- POST /api/gen/ui -> streamText + Output.object() (JSON spec)
        gen-chat.ts          -- POST /api/gen/chat -> streamText (UI message stream)
      app.ts                 -- register genUiRoutes + genChatRoutes plugins (MODIFY)

infrastructure/
  worker/
    edge-router.js           -- add /gen -> env.GEN binding (MODIFY)
    wrangler.gen.toml        -- NEW: CF Worker config for gen static app
  pulumi/
    index.ts                 -- add GEN CF Worker resource (MODIFY)
```

### Structure Rationale

- **`packages/rialto-catalog/` as a separate package:** The catalog definition (`defineCatalog`) is pure data (Zod schemas + descriptions). The registry (`defineRegistry`) wraps real Rialto components. Separating into its own package lets `apps/gen` and `apps/hospitality` share the same catalog without coupling. `packages/rialto` stays lean — no json-render dependency added to the core design system.

- **Extend `services/agent/` rather than creating a new service:** The agent service already has Fastify, CORS, structured logging, and a DO App Platform deploy pipeline. Two new routes (`/api/gen/ui`, `/api/gen/chat`) do not justify a second service. New routes added as FastifyPlugins in `routes/gen-ui.ts` and `routes/gen-chat.ts`, registered in `app.ts`.

- **`apps/gen` as a new Vite SPA:** Follows the established pattern (`apps/hospitality`, `apps/rialto-web`). Gets its own path prefix (`/gen`), its own `vite.config.ts` with `base: "/gen/"`, and its own CF Worker with Static Assets deployed via `wrangler deploy`.

- **`<GenCopilot>` in `packages/rialto`:** The copilot sidebar is a UI component, not app-specific logic. Placing it in `@mbe/rialto` makes it available to any future app. It depends on `@mbe/rialto-catalog` and `@json-render/react` — both are acceptable as additional deps in the shared UI package.

---

## Architectural Patterns

### Pattern 1: SSE Passthrough Through CF Worker Edge

**What:** The CF Worker edge router proxies `/api/*` via `fetch()` returning the subrequest `Response` directly. CF Workers pass `ReadableStream` bodies through without buffering when you return the subrequest `Response` object as-is. SSE from Fastify at DO App Platform reaches the browser without modification.

**When to use:** All `/api/gen/*` streaming endpoints. No changes needed to the existing `/api/*` routing logic in `edge-router.js`.

**Trade-offs:** CF Free plan has a 100ms CPU time limit per Worker invocation, but this applies only to the Worker's own CPU usage. The edge router executes minimal CPU work (URL rewrite + `fetch()`), then suspends while awaiting the upstream stream. Long-lived SSE connections are not a concern.

**Required Fastify headers** to prevent intermediate proxy buffering:
```typescript
reply.header("Content-Type", "text/plain; charset=utf-8");
reply.header("X-Accel-Buffering", "no");
reply.header("Cache-Control", "no-cache");
reply.header("x-vercel-ai-ui-message-stream", "v1");
```

**Example (AI SDK v6 — uses `streamText` with `Output.object()`, not `streamObject`):**
```typescript
// services/agent/src/routes/gen-ui.ts
import { streamText, Output } from "ai";
import type { FastifyPluginAsync } from "fastify";
import { catalog } from "@mbe/rialto-catalog";
import { uiSpecSchema } from "@mbe/types";

// AI SDK v6: when the model string is "provider/model", the AI SDK automatically
// routes through the Vercel AI Gateway using AI_GATEWAY_API_KEY env var.
// No separate provider import needed.

export const genUiRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/gen/ui", async (request, reply) => {
    const { prompt } = request.body as { prompt: string };

    const result = streamText({
      model: "anthropic/claude-sonnet-4.6",
      system: catalog.prompt(),
      prompt,
      output: Output.object({ schema: uiSpecSchema }),
    });

    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("X-Accel-Buffering", "no");
    reply.header("Cache-Control", "no-cache");
    reply.header("x-vercel-ai-ui-message-stream", "v1");

    return reply.send(result.toUIMessageStream());
  });
};
```

**AI Gateway auth for DO App Platform:** OIDC tokens require Vercel hosting and `vercel env pull`. For DO App Platform, use `AI_GATEWAY_API_KEY` — create a key in the Vercel AI Gateway dashboard and add it to DO App Platform environment variables. This is the correct approach for non-Vercel-hosted servers.

### Pattern 2: Catalog-Constrained Generation (json-render)

**What:** `@json-render/core` `defineCatalog()` builds a Zod-validated catalog of Rialto components. `catalog.prompt()` generates a system prompt that constrains the model to only produce components declared in the catalog. The model outputs a flat JSON spec. `@json-render/react` `<Renderer>` resolves the spec against the registry (actual Rialto component implementations) and renders it.

**When to use:** All generative UI features. The playground app and copilot sidebar share the same catalog from `@mbe/rialto-catalog`. The catalog is the single source of truth for what the AI can produce.

**Trade-offs:** The catalog must be kept in sync with Rialto component props as the design system evolves. Adding a new Rialto component requires adding it to the catalog with Zod prop schemas. This is a manual step but low friction.

**Example — catalog definition:**
```typescript
// packages/rialto-catalog/src/catalog.ts
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  components: {
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
        size: z.enum(["sm", "md", "lg"]).optional(),
        disabled: z.boolean().optional(),
      }),
      description: "Clickable button. Use variant=primary for main CTA actions.",
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        padding: z.enum(["sm", "md", "lg"]).optional(),
      }),
      slots: ["default"],
      description: "Content container. Use for grouping related content.",
    },
    // ... remaining Rialto components with descriptions
  },
  actions: {
    navigate: {
      params: z.object({ path: z.string() }),
      description: "Navigate to a path within the app",
    },
  },
});
```

**Example — registry (maps catalog to real Rialto components):**
```typescript
// packages/rialto-catalog/src/registry.tsx
import { defineRegistry } from "@json-render/react";
import { Button, Card, Input, Text, Stack, Badge } from "@mbe/rialto";
import { catalog } from "./catalog.js";

export const { registry } = defineRegistry(catalog, {
  components: {
    Button: ({ props, emit }) => (
      <Button variant={props.variant} size={props.size} disabled={props.disabled}
        onClick={() => emit("press")}>
        {props.label}
      </Button>
    ),
    Card: ({ props, children }) => (
      <Card title={props.title} subtitle={props.subtitle} padding={props.padding}>
        {children}
      </Card>
    ),
    // ...
  },
});
```

### Pattern 3: Progressive Spec Streaming with `useUIStream`

**What:** `@json-render/react` `useUIStream` hook connects to the Fastify SSE endpoint, applies streaming JSON-Pointer patches as tokens arrive, and exposes a `spec` object that `<Renderer>` consumes. The UI builds progressively as the model generates — components appear as their JSON nodes complete.

**When to use:** `apps/gen` playground (full spec stream via `streamText + Output.object()` on backend). The hospitality copilot variant uses `useChat` instead (text + tool call stream), since the copilot response is conversational rather than a pure spec render.

**Trade-offs:** Progressive rendering requires the flat json-render spec format (element map with ID references). This works out-of-the-box with `streamText + Output.object()` on the backend and `useUIStream` on the frontend. No custom streaming plumbing needed.

**Example:**
```typescript
// apps/gen/src/pages/Playground.tsx
import { useUIStream, Renderer } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { Stack } from "@mbe/rialto";

export function Playground() {
  const { spec, isStreaming, send } = useUIStream({ api: "/api/gen/ui" });

  return (
    <Stack direction="column" gap="lg">
      <PromptBar onSend={send} disabled={isStreaming} />
      <Renderer spec={spec} registry={registry} loading={isStreaming} />
    </Stack>
  );
}
```

---

## Data Flow

### Full Request Path: Prompt to Rendered UI

```
1. User types prompt in apps/gen Playground
        |
        v
2. useUIStream.send(prompt)
   POST /api/gen/ui
   Headers: Content-Type: application/json, Authorization: Bearer <token>
        |
        v
3. CF Worker edge-router (edge-router.js)
   url.pathname.startsWith("/api/") -> fetch(api.mattbutlerengineering.com/api/gen/ui)
   request.body passed through verbatim (existing pattern, no change needed)
        |
        v
4. services/agent Fastify — POST /api/gen/ui route handler
   - Validates body: { prompt: string }
   - Calls catalog.prompt() -> system prompt with component schema
   - Calls streamText({ model: "anthropic/claude-sonnet-4.6", output: Output.object({ schema }) })
   - AI SDK routes "anthropic/*" string through Vercel AI Gateway via AI_GATEWAY_API_KEY
   - Sets SSE headers (text/plain, X-Accel-Buffering: no, x-vercel-ai-ui-message-stream: v1)
   - reply.send(result.toUIMessageStream()) -> begins streaming
        |
        v
5. Vercel AI Gateway -> Anthropic Claude (anthropic/claude-sonnet-4.6)
   Generates JSON spec tokens constrained to catalog schema
   Streams tokens back to Fastify -> Fastify pipes to DO response body
        |
        v
6. CF Worker receives the subrequest Response, returns it directly to browser
   (ReadableStream body — no buffering, no modification)
        |
        v
7. Browser — useUIStream hook receives SSE stream
   Applies progressive JSON-Pointer patches to build spec object
   spec changes trigger React re-renders via useState
        |
        v
8. <Renderer spec={spec} registry={registry} />
   Resolves each spec element type to a Rialto component via registry lookup
   Renders components as spec nodes complete — UI appears progressively
        |
        v
9. User sees UI building in real time
   isStreaming=false when done; CodeExport shows final JSON spec
```

### Hospitality Copilot Data Flow

```
Hospitality user -> <GenCopilot> sidebar (in apps/hospitality)
  |
  | POST /api/gen/chat (AI SDK useChat text/tool stream)
  v
services/agent — /api/gen/chat — streamText({ model: "anthropic/claude-sonnet-4.6", system, prompt, tools })
  |                               tools can call reservations API, fetch table status, etc.
  v
useChat hook in <GenCopilot>
  -> Renders assistant messages as text
  -> Tool call results can render a <Renderer> inline within the chat message
```

### AI SDK Dependency Placement

```
services/agent/package.json:
  "ai": "^6.x"               -- streamText, Output, createUIMessageStream
  (no @ai-sdk/anthropic needed — AI Gateway routing is built into AI SDK v6
   when using "provider/model" string format with AI_GATEWAY_API_KEY)

packages/rialto-catalog/package.json:
  "@json-render/core": "^1.x"   -- defineCatalog, schema
  "@json-render/react": "^1.x"  -- defineRegistry
  "@mbe/rialto": "workspace:*"  -- Rialto component implementations in registry
  "zod": "^3.x"                 -- prop schema definitions

apps/gen/package.json:
  "@mbe/rialto-catalog": "workspace:*"  -- catalog + registry
  "@json-render/react": "^1.x"          -- Renderer, useUIStream

packages/rialto/package.json (extend):
  "@json-render/react": "^1.x"          -- Renderer (for GenCopilot component)
  "ai": "^6.x"                          -- useChat (client-side, for GenCopilot)

apps/hospitality/package.json (extend):
  "@mbe/rialto-catalog": "workspace:*"  -- catalog + registry (for inline rendering)
```

**Rule:** `ai` server SDK (`streamText`, `Output`) lives in `services/` only. Client-side hooks (`useChat`, `useUIStream`) live in `apps/` or `packages/rialto` (for the `<GenCopilot>` component). Catalog definitions live in `packages/rialto-catalog/`.

---

## Component Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `apps/gen` <-> `services/agent` | HTTP POST + SSE stream via `/api/gen/ui` | Bearer token in Authorization header; CORS already configured in Fastify |
| `apps/hospitality` <-> `services/agent` | HTTP POST + SSE stream via `/api/gen/chat` | Same auth pattern; extend `@mbe/api-client` with `genApi` methods |
| `apps/*` <-> `packages/rialto-catalog` | Direct workspace import | `@mbe/rialto-catalog` provides catalog + registry; no network boundary |
| `packages/rialto-catalog` <-> `packages/rialto` | Workspace import | Registry wraps real Rialto components; prop schemas must stay in sync with Rialto prop types |
| `services/agent` <-> Vercel AI Gateway | HTTPS via `ai-gateway.vercel.sh` | Auth: `AI_GATEWAY_API_KEY` env var in DO App Platform. Model string `"anthropic/claude-sonnet-4.6"` routes automatically. OIDC auth is Vercel-hosted only — not applicable to DO. |
| CF Worker <-> `apps/gen` | Service Binding (new) | New `GEN` binding in `wrangler.gen.toml`; new `/gen` route in `edge-router.js` |
| CF Worker <-> `services/agent` | HTTP subrequest (existing) | No changes to `/api/*` routing logic needed |

---

## Build Order

Phases that can be parallelized are marked with `||`.

```
Phase 1: Foundation packages (no deps on new code — start here)
  packages/rialto-catalog    -- defineCatalog, defineRegistry, catalog.prompt()
  packages/types             -- extend with UISpec, GenPromptRequest, GenStreamResponse
  packages/api-client        -- extend with genApi.streamUI() + genApi.streamChat()

Phase 2: Backend routes (depends on Phase 1 types and catalog)
  services/agent             -- gen-ui.ts + gen-chat.ts routes
                             -- register in app.ts
                             -- add AI_GATEWAY_API_KEY to DO App Platform env config
                             -- (uses "anthropic/claude-sonnet-4.6" model string — no provider URL needed)

Phase 3a || Phase 3b: Apps (both depend on Phase 1 + 2, run in parallel)

  3a: Playground app
    apps/gen                 -- Vite SPA, /gen path prefix
    infrastructure/worker    -- wrangler.gen.toml, edge-router.js /gen binding
    infrastructure/pulumi    -- GEN CF Worker resource

  3b: Copilot embed
    packages/rialto          -- <GenCopilot> component (useChat + optional Renderer)
    apps/hospitality         -- integrate <GenCopilot> into DashboardLayout sidebar
```

Phases 3a and 3b share no direct dependency on each other and can be developed concurrently once Phase 2 is complete.

---

## Anti-Patterns

### Anti-Pattern 1: New Service for Gen Endpoints

**What people do:** Create `services/gen/` as a separate Fastify service with its own Prisma, CORS, logging, Docker config, and DO App Platform component.

**Why it's wrong:** Two streaming routes do not justify a new service. The agent service already has all required infrastructure: Fastify, CORS, structured logging, DO App Platform deploy pipeline, environment variable management. A second service doubles operational surface area for zero benefit.

**Do this instead:** Add `genUiRoutes` and `genChatRoutes` as FastifyPlugins to `services/agent/src/routes/`. Register them in `app.ts`. Total addition is approximately 80 lines of route code.

### Anti-Pattern 2: Installing AI SDK at Monorepo Root

**What people do:** Install `ai`, `@ai-sdk/anthropic`, `@json-render/react` in the root `package.json` for convenience.

**Why it's wrong:** `ai` (server SDK) should never be included in Vite SPA builds. `@json-render/react` should not be imported in the Fastify service. Root-level installation makes Turborepo's dependency graph ambiguous and risks cross-contamination in production bundles.

**Do this instead:** Install `ai` only in `services/agent/package.json`. Install `@json-render/react` and client-side hooks only in packages and apps that use them. Let Turborepo's workspace resolution handle version consistency.

### Anti-Pattern 3: `Content-Type: application/json` on Streaming Endpoints

**What people do:** Set `Content-Type: application/json` on `/api/gen/ui` expecting the structured output schema means JSON delivery.

**Why it's wrong:** `streamText + Output.object()` streams partial JSON tokens, not a complete JSON document. Any JSON parser that sees the response will either fail or wait for the stream to close before parsing — defeating the purpose of streaming.

**Do this instead:** Set `Content-Type: text/plain; charset=utf-8`. The AI SDK's `toUIMessageStream()` produces a text-based line-delimited SSE format. Set `x-vercel-ai-ui-message-stream: v1` so `useUIStream` and `useChat` recognize the protocol version.

### Anti-Pattern 4: Catalog Definitions Inside `packages/rialto`

**What people do:** Add `defineCatalog` and `defineRegistry` calls directly inside `packages/rialto` alongside the component source.

**Why it's wrong:** `packages/rialto` is a design system library. Adding `@json-render/core` couples every consumer of `@mbe/rialto` to json-render, significantly increasing bundle weight. Apps that only use Rialto components (marketing, users) would pull in unused json-render code.

**Do this instead:** Keep `packages/rialto-catalog` as a separate internal package (`private: true`) that depends on `@mbe/rialto`. Only apps doing generative UI add `@mbe/rialto-catalog` as a dependency.

### Anti-Pattern 5: Buffering SSE at the CF Worker Edge

**What people do:** In `edge-router.js`, read the full upstream response before returning it — e.g., `new Response(await upstreamResponse.text(), ...)`.

**Why it's wrong:** This defeats streaming entirely. The browser receives nothing until the AI model finishes generating (potentially 15-30 seconds), then gets all content at once. The UX degrades to an unresponsive loading spinner.

**Do this instead:** Return the subrequest response body directly: `return fetch(target, ...)` or `return response`. CF Workers pass `ReadableStream` bodies through without buffering when you return the `Response` object as-is. The existing edge router already does this correctly for `/api/*` — do not change that logic.

### Anti-Pattern 6: Coupling Gen Routes to `@mbe/agent-core`

**What people do:** Import `@anthropic-ai/claude-agent-sdk` from `@mbe/agent-core` inside the gen routes, assuming the agent SDK handles streaming.

**Why it's wrong:** `@anthropic-ai/claude-agent-sdk` is for autonomous code-editing agents (the existing sessions feature). Gen routes need `streamText + Output.object()` from the Vercel `ai` package — a fundamentally different paradigm (constrained JSON generation vs. open-ended tool-calling agent loops).

**Do this instead:** Gen routes import directly from `ai`. They have no dependency on `@mbe/agent-core`.

### Anti-Pattern 7: Using `streamObject()` (removed in AI SDK v6)

**What people do:** Import and call `streamObject({ model, schema, prompt })` from the `ai` package.

**Why it's wrong:** `streamObject` was removed in AI SDK v6. The replacement is `streamText` with `output: Output.object({ schema })`. Using the removed API causes a runtime error.

**Do this instead:**
```typescript
// WRONG (v5 API — removed)
import { streamObject } from "ai";
const result = streamObject({ model, schema: mySchema, prompt });

// CORRECT (v6 API)
import { streamText, Output } from "ai";
const result = streamText({ model, output: Output.object({ schema: mySchema }), prompt });
```

### Anti-Pattern 8: OIDC Auth for Non-Vercel Servers

**What people do:** Attempt to use `vercel env pull` OIDC tokens to authenticate with the AI Gateway from DO App Platform.

**Why it's wrong:** OIDC tokens are generated by Vercel for Vercel-hosted projects only. They require `vercel env pull` and expire every 12 hours. DO App Platform cannot generate them.

**Do this instead:** Create an `AI_GATEWAY_API_KEY` in the Vercel AI Gateway dashboard. Add it to DO App Platform as an environment variable. The AI SDK automatically uses `AI_GATEWAY_API_KEY` when routing via `"provider/model"` string format.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Vercel AI Gateway | AI SDK v6 model string `"anthropic/claude-sonnet-4.6"` + `AI_GATEWAY_API_KEY` env var | No separate provider import needed in v6. API key auth (not OIDC) is correct for DO App Platform. Fetch current model IDs from `https://ai-gateway.vercel.sh/v1/models` before hardcoding. |
| json-render npm packages | `@json-render/core`, `@json-render/react` as npm dependencies | Apache 2.0 license; active development (200+ releases since Jan 2026 launch); pin to minor version |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `edge-router.js` <-> `apps/gen` Worker | New `GEN` Service Binding | Same pattern as existing `HOSPITALITY` and `RIALTO` bindings; add `wrangler.gen.toml` |
| `packages/rialto-catalog` <-> `apps/*` | Workspace import | `catalog.prompt()` called server-side in Fastify route; `registry` used client-side in Renderer |
| `services/agent` gen routes <-> `packages/agent-core` | No coupling | Gen routes use `ai` SDK directly; they do not touch `@anthropic-ai/claude-agent-sdk` |
| `packages/rialto-catalog` <-> `packages/rialto` | Workspace import (registry depends on Rialto components) | Must keep catalog prop schemas in sync with Rialto component prop types |

---

## Scaling Considerations

| Scale | Architecture |
|-------|-------------|
| 0-1k gen requests/day | Single DO App Platform dyno; no caching; SSE adds no server-side state |
| 1k-100k requests/day | Rate-limit `/api/gen/*` routes (add per-IP or per-user limit alongside existing `MAX_CONCURRENT_SESSIONS` pattern); token cost becomes significant — enable Anthropic prompt caching on the system prompt (`catalog.prompt()` is stable and long) |
| 100k+ requests/day | Extract gen routes to dedicated service; add request queue to prevent AI Gateway rate limit spikes; cache popular specs by prompt hash with short TTL |

### Scaling Priorities

1. **First bottleneck:** AI Gateway / Anthropic rate limits. Gen routes share the same `AI_GATEWAY_API_KEY` as agent sessions. Consider separate gateway keys for gen vs. agent session traffic — configurable in Vercel AI Gateway dashboard with per-key spend limits.
2. **Second bottleneck:** DO App Platform dyno concurrency. Each SSE stream holds a Fastify connection open for 5-30s. Monitor active connection count; scale horizontally before adding architectural complexity.

---

## Sources

- [AI SDK Fastify Cookbook](https://ai-sdk.dev/cookbook/api-servers/fastify) — Official Fastify + `streamText` patterns (HIGH confidence)
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) — SSE format, `x-vercel-ai-ui-message-stream` header requirement (HIGH confidence)
- [AI SDK Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `streamText + Output.object()` replacing `streamObject` in v6; `partialOutputStream` (HIGH confidence)
- [Vercel AI Gateway Overview](https://vercel.com/docs/ai-gateway) — capabilities, model string format `"provider/model"` (HIGH confidence)
- [Vercel AI Gateway Text Quickstart](https://vercel.com/docs/ai-gateway/getting-started/text) — `AI_GATEWAY_API_KEY` env var, model string routing, OIDC token scope (HIGH confidence — official docs)
- [Vercel AI Gateway Authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) — API key vs. OIDC; OIDC requires Vercel hosting (HIGH confidence)
- [json-render Getting Started (DeepWiki)](https://deepwiki.com/vercel-labs/json-render/2-getting-started) — `defineCatalog`, `defineRegistry`, `useUIStream`, `<Renderer>` patterns (HIGH confidence)
- [json-render Official Site](https://json-render.dev/) — `catalog.prompt()` system prompt generation, Zod prop schema examples (HIGH confidence)
- [Vercel json-render Release (InfoQ)](https://www.infoq.com/news/2026/03/vercel-json-render/) — Framework architecture, progressive rendering, flat spec format (MEDIUM confidence — journalism, not official docs)
- [Cloudflare Workers SSE](https://developers.cloudflare.com/agents/api-reference/http-sse/) — SSE support in CF Workers, long-lived connection behavior (HIGH confidence)
- [CF Workers Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/) — ReadableStream passthrough; no buffering when returning Response body as-is (HIGH confidence)
- [CF SSE buffering community thread](https://community.cloudflare.com/t/using-server-sent-events-sse-with-cloudflare-proxy/656279) — `X-Accel-Buffering: no` requirement for proxy passthrough (MEDIUM confidence)
- Live AI Gateway model list: `curl https://ai-gateway.vercel.sh/v1/models` — confirmed `anthropic/claude-sonnet-4.6` as current highest version (HIGH confidence — live data)
- Existing codebase: `infrastructure/worker/edge-router.js`, `services/agent/src/app.ts`, `packages/agent-core/package.json` — examined directly (HIGH confidence)

---

*Architecture research for: generative UI integration into mattbutlerengineering monorepo*
*Researched: 2026-03-27*
