# Stack Research

**Domain:** Generative UI (json-render + AI SDK v6 + Anthropic)
**Researched:** 2026-03-27
**Confidence:** HIGH (all versions verified against npm registry and official docs/dist inspection)

## Context

This is an additive milestone on an existing monorepo. The stack below covers ONLY new packages needed for generative UI features. Do not re-add what already exists: React 19, Vite 7, TypeScript, Fastify 5, Prisma, `@anthropic-ai/claude-agent-sdk` (agent sessions).

---

## New Packages Required

### Core Generative UI

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@json-render/core` | `^0.15.0` | Catalog definition, spec parsing, stream compilation | The framework that constrains AI output to registered components. `defineCatalog()` produces a typed schema + optimized system prompt in one call. No Vite plugin needed — purely runtime. |
| `@json-render/react` | `^0.15.0` | React renderer for json-render specs | Ships `useUIStream` (standalone mode) and `useJsonRenderMessage` (inline/chat mode). Peer dep confirmed: `react@^19.2.3` — matches what the monorepo runs. |
| `ai` | `^6.0.141` | AI SDK core — `streamText`, `createUIMessageStream`, `pipeJsonRender` | The streaming bridge between Anthropic and the client. Dist-inspected: exports `createUIMessageStream`, `createUIMessageStreamResponse`, and `UI_MESSAGE_STREAM_HEADERS`. Fastify receives the stream directly via `reply.send()`. |
| `@ai-sdk/react` | `^3.0.143` | `useChat` hook for the client side | Consumes the UI message stream protocol (`x-vercel-ai-ui-message-stream: v1`). React 19 compat confirmed in peerDependencies: `"^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1"`. |
| `@ai-sdk/anthropic` | `^3.0.64` | Anthropic provider for AI SDK | Wraps the Anthropic Messages API into the AI SDK provider interface. Use `anthropic("claude-sonnet-4-5")` — do NOT use `@anthropic-ai/sdk` directly in the same service that uses this package. |

### Zod Upgrade (Required — Breaking Dependency)

| Technology | Current Version | Required Version | Reason |
|------------|----------------|-----------------|--------|
| `zod` | `^3.23.0` (all services) | `^4.3.6` | `@json-render/core@0.15.0` has a hard `peerDependencies: { zod: "^4.0.0" }`. The `ai` SDK v6 supports both (`^3.25.76 \|\| ^4.1.8`) so upgrading to 4 satisfies both. |

**Migration risk is LOW.** The existing Zod usage in `@mbe/agent-core` and all services is limited to:
`z.string()`, `z.number()`, `z.object()`, `z.optional()`, `z.url()`, `z.array()`, `z.union()`, `z.enum()`, `.describe()` — all preserved unchanged in Zod 4. The `.url()` validator on `z.string()` is deprecated (use top-level `z.url()` instead) but still works and emits only a deprecation warning.

Zod 4 ships a `zod/v3` compat export (`"./v3"` subpath). This is intended for library authors who need to vendor the old API for downstream consumers — it is NOT the right migration path for app-level code. Upgrade all consumer code to `zod@4` directly.

---

## Streaming Infrastructure

### Server Side — Fastify 5 (No Plugin Required)

Fastify 5 natively accepts `ReadableStream<Uint8Array>` in `reply.send()`. The AI SDK's `result.toUIMessageStream()` returns exactly this type. The pattern, confirmed against the official AI SDK Fastify cookbook example:

```typescript
// In a Fastify route handler — no additional SSE plugins needed
fastify.post("/api/generate-ui", async (request, reply) => {
  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: catalog.prompt(),
    messages: request.body.messages,
  });

  // AI SDK sets these headers automatically via toUIMessageStream(),
  // but Fastify needs them set explicitly before reply.send():
  reply.header("Content-Type", "text/event-stream");
  reply.header("Cache-Control", "no-cache");
  reply.header("x-vercel-ai-ui-message-stream", "v1");
  return reply.send(result.toUIMessageStream());
});
```

For json-render **inline mode** (conversational text interleaved with UI patches):

```typescript
// pipeJsonRender splits the stream into text parts and JSONL spec patches
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    writer.merge(pipeJsonRender(result.toUIMessageStream()));
  },
});
return reply.send(stream);
```

`createUIMessageStreamResponse` (which wraps the stream into a standard Web `Response`) is the Next.js / Edge runtime pattern. In Fastify, use `reply.send(stream)` directly — do not call `createUIMessageStreamResponse`.

The `UI_MESSAGE_STREAM_HEADERS` (dist-inspected from `ai@6.0.141`) are:
- `content-type: text/event-stream`
- `cache-control: no-cache`
- `connection: keep-alive`
- `x-vercel-ai-ui-message-stream: v1`
- `x-accel-buffering: no`

### Client Side — @ai-sdk/react

`useChat` from `@ai-sdk/react` consumes the stream. The `x-vercel-ai-ui-message-stream: v1` header signals the AI SDK UI protocol; the hook handles SSE parsing automatically. `useJsonRenderMessage` (from `@json-render/react`) extracts the spec patches from individual chat message data parts.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/sse` | `^0.4.0` (Fastify 5 compatible) | SSE broadcast / multi-client pub-sub | NOT needed for single-request AI streaming. Only add if a future feature requires pushing events to multiple connected clients simultaneously (e.g., live collaboration). |

---

## Installation

Install into the specific apps/services that need them — not at the root workspace.

```bash
# Frontend app that renders generative UI (e.g., apps/hospitality)
pnpm --filter @mbe/hospitality add @json-render/core @json-render/react ai @ai-sdk/react

# Backend service that handles AI inference (existing agent service or new service)
pnpm --filter @mbe/agent-service add ai @ai-sdk/anthropic

# Zod upgrade — ALL packages that currently declare zod as a dependency
pnpm --filter @mbe/agent-core add zod@^4.3.6
pnpm --filter @mbe/agent-service add zod@^4.3.6
pnpm --filter @mbe/users-service add zod@^4.3.6
pnpm --filter @mbe/reservations-service add zod@^4.3.6
```

Alternatively, enforce a single Zod version via the pnpm workspace catalog (add to `pnpm-workspace.yaml`):

```yaml
catalog:
  zod: "^4.3.6"
```

Then reference `catalog:` in each `package.json` instead of a version string. This prevents version drift across packages.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@ai-sdk/anthropic` | `@anthropic-ai/sdk` directly | `@anthropic-ai/claude-agent-sdk` already wraps the Anthropic SDK for agent sessions. Avoid two competing Anthropic clients in the same service — `@ai-sdk/anthropic` integrates natively with `streamText` and the data stream protocol. |
| `reply.send(stream)` in Fastify | `@fastify/sse` plugin | The `@fastify/sse` plugin's `{ sse: true }` route option adds a broadcast session model useful for pub-sub. Unnecessary complexity for single-request AI streaming where `reply.send(ReadableStream)` is sufficient and has no additional dependencies. |
| `ai@6` | `ai@5` or `ai@4` | v6 is current stable. `createUIMessageStream` and `pipeJsonRender` integration are v6 APIs documented by json-render. Earlier versions have different streaming APIs. |
| Upgrade all to `zod@4` | Use `zod/v3` compat subpath | The `zod/v3` compat path is for library authors — not app migration. Existing usage patterns (`z.string()`, `z.object()`, etc.) are stable in Zod 4. A monorepo should pin one Zod version. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@ai-sdk/openai` or other provider packages | Not needed — Anthropic is the only inference provider for this feature | `@ai-sdk/anthropic` only |
| `fastify-sse-v2` (community plugin) | Community package maintained for Fastify 4; `@fastify/sse` is the official Fastify 5 plugin if broadcast SSE is ever needed | Neither — `reply.send(stream)` is sufficient for AI streaming |
| `langchain` or `llamaindex` | 10x the dependency weight with no benefit over AI SDK v6 for Anthropic-only inference | `ai` + `@ai-sdk/anthropic` |
| Vite plugins for json-render | None exist or are required. json-render is purely runtime — `defineCatalog()` and `defineRegistry()` run at startup. No build-time code generation or Vite transform is involved. | No change to Vite config |
| `@ai-sdk/gateway` as an explicit dep | Already bundled inside the `ai` package. Adding it separately risks version mismatch. | Let `ai` manage it internally |
| `createUIMessageStreamResponse` in Fastify | This is the Next.js / Edge runtime pattern that returns a Web `Response`. Fastify has its own reply abstraction. | `reply.send(result.toUIMessageStream())` |

---

## Version Compatibility Matrix

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@json-render/core@0.15.0` | `zod@^4.0.0` | Hard peer dep — will not resolve with zod 3 |
| `@json-render/react@0.15.0` | `react@^19.2.3` | Requires React 19.2+ exactly (not 19.0 or 19.1). Verify installed React version with `pnpm why react` before adding. |
| `@ai-sdk/react@3.0.143` | `react@^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1` | Supports all React 19 minor versions |
| `ai@6.0.141` | `zod@^3.25.76 \|\| ^4.1.8` | Supports both Zod 3 and 4 — upgrading to zod 4 satisfies this |
| `@ai-sdk/anthropic@3.0.64` | `zod@^3.25.76 \|\| ^4.1.8` | Same as ai SDK |
| `@ai-sdk/react@3.0.143` | `ai@6.0.141` | `ai` is a direct `dependency` of `@ai-sdk/react` — versions are pinned together |

**React 19.2 caveat:** `@json-render/react@0.15.0` requires `react@^19.2.3`. Apps currently declare `react: "^19.0.0"` in their `package.json`. pnpm will resolve to the latest installed React 19.x, which may already be 19.2.x. Run `pnpm why react` to confirm before adding `@json-render/react`.

---

## Sources

- npm registry `@json-render/core@0.15.0` — peerDeps: `{ zod: "^4.0.0" }` (HIGH confidence — direct npm view)
- npm registry `@json-render/react@0.15.0` — peerDeps: `{ react: "^19.2.3" }` (HIGH confidence — direct npm view)
- npm registry `ai@6.0.141` — peerDeps: `{ zod: "^3.25.76 || ^4.1.8" }`, exports `['.', './internal', './test']` (HIGH confidence)
- npm registry `@ai-sdk/react@3.0.143` — peerDeps React 19 confirmed (HIGH confidence)
- npm registry `@ai-sdk/anthropic@3.0.64` — deps: `@ai-sdk/provider`, `@ai-sdk/provider-utils` (HIGH confidence)
- npm registry `zod@4.3.6` — exports confirmed `./v3` and `./v4` subpaths (HIGH confidence)
- Dist inspection `ai@6.0.141` — confirmed `createUIMessageStream`, `createUIMessageStreamResponse` exported; `UI_MESSAGE_STREAM_HEADERS` = `text/event-stream` + `x-vercel-ai-ui-message-stream: v1` (HIGH confidence)
- Dist inspection `@json-render/core@0.15.0` — confirmed uses `z.union`, `z.object`, `z.string`, `z.boolean`, `z.number` — all stable in Zod 4 (HIGH confidence)
- [AI SDK Fastify cookbook](https://ai-sdk.dev/cookbook/api-servers/fastify) — confirmed `reply.send(result.toUIMessageStream())` pattern, no plugins (HIGH confidence)
- [json-render AI SDK integration docs](https://json-render.dev/docs/ai-sdk) — confirmed `pipeJsonRender`, `createUIMessageStream`, `catalog.prompt()` (MEDIUM confidence — doc fetched, not hands-on tested)
- [AI SDK stream protocol docs](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) — confirmed `x-vercel-ai-ui-message-stream: v1` header, SSE format (HIGH confidence)
- [Zod v4 changelog](https://zod.dev/v4/changelog) — confirmed core APIs (`z.string()`, `z.object()`, `z.array()`, `z.union()`, `z.optional()`) stable in v4 (HIGH confidence)
- Monorepo source inspection — confirmed existing Zod usage in `@mbe/agent-core` is limited to stable APIs (HIGH confidence — read directly)

---
*Stack research for: Generative UI — json-render + AI SDK v6 + Anthropic*
*Researched: 2026-03-27*
