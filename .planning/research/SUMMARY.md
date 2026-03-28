# Project Research Summary

**Project:** Generative UI — json-render + AI SDK v6 + Anthropic
**Domain:** AI-powered constrained interface generation on top of the Rialto design system
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

This milestone adds generative UI to the mattbutlerengineering monorepo: Claude generates Rialto-native interfaces from natural language prompts, constrained by a json-render catalog so the AI can never produce components outside the design system. The approach is well-proven — json-render (Vercel, released early 2026) handles the catalog schema, system prompt generation, streaming spec compilation, and React rendering. The AI SDK v6 provides the streaming bridge between Anthropic and the client. The stack fits cleanly into existing infrastructure: two new Fastify routes added to `services/agent`, one new Vite SPA (`apps/gen`), and a new shared package (`packages/rialto-catalog`) that both the playground app and the hospitality copilot will consume.

The recommended implementation order is: catalog foundation first (Zod schemas for ~25 Rialto components), then backend generation routes (streaming endpoint wired to Anthropic via Vercel AI Gateway), then the standalone playground app, then the hospitality copilot embed. Standalone generation must be stable before inline conversational mode is added — the two modes have different streaming architectures and mixing them prematurely creates significant debugging complexity.

The dominant risks are not technical but operational. Three pitfalls require pre-emptive action before the first non-local deploy: the generation endpoint must require Auth0 JWT authentication (unauthenticated endpoints attract automated LLMjacking within hours of deployment), Anthropic prompt caching must be configured from day one (uncached catalog prompts at 5,000+ tokens cost real money at any meaningful request volume), and SSE streaming must be verified through the CF Worker edge router before wiring up the AI (buffering there silently breaks the entire streaming UX). Each of these is a "looks done but isn't" pitfall — everything works in local development and then fails in a distinct, non-obvious way in production.

## Key Findings

### Recommended Stack

The stack is additive — no existing packages are replaced. Five new npm packages cover generative UI: `@json-render/core` and `@json-render/react` for the catalog/registry/renderer layer, `ai@6` for streaming infrastructure, `@ai-sdk/react` for the client-side `useChat` and `useUIStream` hooks, and `@ai-sdk/anthropic` for the provider adapter. All versions are verified against the npm registry. The one breaking dependency is Zod: `@json-render/core@0.15.0` requires `zod@^4.0.0`, so all services currently on Zod 3 must upgrade. Migration risk is LOW — the Zod 4 API is backward-compatible for all existing usages (`z.string()`, `z.object()`, `z.array()`, `z.union()`, `z.optional()`, `z.enum()`). A pnpm workspace catalog entry enforces a single Zod version across the monorepo.

**Core technologies:**
- `@json-render/core@^0.15.0`: Catalog definition, schema parsing, `catalog.prompt()` system prompt generation — constrains AI output to registered Rialto components only
- `@json-render/react@^0.15.0`: `useUIStream`, `<Renderer>`, `defineRegistry` — progressive spec rendering in Vite SPAs; requires React 19.2.3+ (verify installed version with `pnpm why react` before adding)
- `ai@^6.0.141`: `streamText`, `Output.object()`, `createUIMessageStream` — streaming bridge; note that `streamObject` was removed in v6 and replaced by `streamText + Output.object()`
- `@ai-sdk/react@^3.0.143`: `useChat` for hospitality copilot conversational mode; `useUIStream` for standalone playground
- `@ai-sdk/anthropic@^3.0.64`: Anthropic provider adapter; alternatively use Vercel AI Gateway routing via `"anthropic/claude-sonnet-4.6"` model string + `AI_GATEWAY_API_KEY` env var (correct for DO App Platform — OIDC tokens are Vercel-hosted only)
- `zod@^4.3.6`: Upgrade all services; enforce via pnpm workspace catalog to prevent version drift

### Expected Features

**Must have (table stakes) — v1 launch:**
- Prompt to streaming rendered UI (standalone mode) — the core value prop; without streaming it feels broken
- Rialto component catalog with Zod schemas (~25 components) — the foundation; everything else depends on this
- Constrained generation via json-render catalog — AI cannot hallucinate components outside Rialto vocabulary
- `catalog.prompt()` system prompt with usage-oriented descriptions and character limit constraints mapped to Zod `.max()`
- Action wiring: `setState`, `validateForm` for interactive generated forms
- Playground app: text input, streaming renderer, prompt history (in-session)
- Loading and error states for generation; unknown component fallback renderer

**Should have (competitive) — v1.x after validation:**
- Inline/conversational refinement mode ("make the button larger") — requires `pipeJsonRender` mixer; build after standalone is stable
- Spec persistence (Prisma model) — one schema migration unlocks history replay, favorites, and shareable permalinks simultaneously
- Favorites / saved generations
- Shareable permalink (UUID → stored spec lookup)
- Domain-aware prompt context for hospitality (custom rules for reservation schema, floor plan structure)

**Defer (v2+):**
- Code export via `@json-render/codegen` — only needed once generated UIs prove worth keeping; `collectUsedComponents()` requires a complete catalog
- Hybrid mode (standalone → inline mid-session) — complex session management; defer until inline mode is battle-tested
- Full copilot sidebar embed in hospitality app — requires mature inline mode; start with embedded pattern (contextual "Generate with AI" button)

**Anti-features to reject regardless of requests:**
- Open-ended HTML/CSS generation — XSS risk, breaks design system fidelity
- LLM-generated inline styles — breaks Rialto token system, produces hardcoded hex values
- Unlimited component catalog — accuracy degrades with catalog size; prompt tokens scale linearly
- Auto-deploy generated UIs to production — no human review

### Architecture Approach

The architecture extends existing infrastructure rather than creating parallel systems. `packages/rialto-catalog` is a new private workspace package containing the `defineCatalog` spec and `defineRegistry` React mapping — keeping `@json-render/core` out of the core Rialto package so non-generative-UI apps (marketing, users) don't pull in unused dependencies. Two new Fastify routes (`/api/gen/ui` for standalone, `/api/gen/chat` for conversational) extend `services/agent` — not a new service. `apps/gen` is a new Vite SPA at `/gen` path prefix, following the established pattern. The CF Worker edge router gains one new Service Binding for the gen app; SSE streaming passes through without buffering when the upstream `Response` body is returned directly (not re-wrapped in `new Response(body, headers)`).

**Major components:**
1. `packages/rialto-catalog` (new) — catalog definitions (Zod schemas + descriptions + action declarations); `catalog.prompt()` called server-side only; client registry is a lightweight `{ ComponentName: ReactComponent }` map
2. `services/agent` (extended) — `/api/gen/ui` (`streamText + Output.object()` → JSON spec stream) and `/api/gen/chat` (conversational UI message stream) routes; Vercel AI Gateway routing via `AI_GATEWAY_API_KEY`
3. `apps/gen` (new) — Vite SPA at `/gen`; `useUIStream` + `<Renderer>` from `@json-render/react`; PromptBar, PreviewPane, JSON spec inspector; in-session prompt history
4. `packages/rialto` (extended) — `<GenCopilot>` sidebar component using `useChat` + optional `<Renderer>` for inline spec rendering in hospitality
5. `apps/hospitality` (extended) — integrates `<GenCopilot>` into DashboardLayout; domain-aware custom rules for reservations and floor plans

**Build order (dependency-driven):**
- Phase 1 (parallel): `packages/rialto-catalog`, `packages/types` extensions, `packages/api-client` extensions
- Phase 2: `services/agent` gen routes (depends on Phase 1 types and catalog)
- Phase 3a and 3b (parallel after Phase 2): playground app + infrastructure OR copilot component + hospitality integration

### Critical Pitfalls

1. **Catalog drift from Rialto source** — Generate Zod catalog schemas from Rialto TypeScript prop interfaces (ts-morph or react-docgen-typescript); add CI check failing if committed catalog differs from generated output. Hand-writing schemas is never acceptable — they drift within days. Use Zod `.strict()` so invalid props throw at render time rather than silently passing through.

2. **SSE buffering through the CF Worker edge router** — Test SSE streaming through the edge router before any AI wiring. Fix is `X-Accel-Buffering: no` on the Fastify side and returning the upstream `Response` object directly (never `new Response(response.body, modifiedHeaders)`). Verify in Browser DevTools Network tab showing chunked incremental delivery, not a single completed request.

3. **Prompt caching misses causing unexpected Anthropic costs** — Structure system prompt as static catalog (with `cache_control: { type: "ephemeral" }` breakpoint) followed by variable context. Log `cache_read_input_tokens` from every API response from day one. Set a hard monthly spend cap in the Anthropic console before any real usage. At Sonnet 4.6 rates, 100 uncached requests/day with a 5,000-token catalog prompt costs ~$45/month in static prompt processing alone.

4. **Unauthenticated generation endpoint enabling LLMjacking** — Apply `@mbe/auth` Fastify JWT middleware to generation routes before the first non-local deploy. Verify with `curl` returning 401 without an Authorization header. Operation Bizarre Bazaar (Dec 2025–Jan 2026) documented 35,000 attack sessions specifically targeting exposed AI endpoints — this risk is active, not theoretical.

5. **AI SDK bundle bloat and catalog leaking to client** — Import only from `ai/react` (not top-level `ai`) in client-side code; top-level `ai` imports add ~186 kB. Keep `catalog.prompt()` and all Zod schemas server-side only. Verify with `rollup-plugin-visualizer` after integration — `zod` and `ai` core should be absent from the client bundle.

## Implications for Roadmap

Based on cross-research dependency analysis, here is the recommended phase structure:

### Phase 1: Catalog Foundation

**Rationale:** Every downstream feature — streaming generation, code export, type-safe rendering, prompt quality — depends on a correct `defineCatalog()` definition. This is the single point of failure for the entire feature set. Establish the catalog, the automated generation pipeline, and the client/server architectural boundary before writing any AI code. The generation pipeline (TypeScript props → Zod schemas) must exist before the first catalog entry is committed or drift is guaranteed from day one.

**Delivers:** `packages/rialto-catalog` with Zod schemas for ~25 core Rialto components generated from TypeScript prop interfaces; CI check enforcing catalog-source parity; `packages/types` extensions for `UISpec`, `GenPromptRequest`, `GenStreamResponse`; `packages/api-client` extensions for `genApi.streamUI()` and `genApi.streamChat()`.

**Addresses:** Catalog Zod schemas (P1), `catalog.prompt()` system prompt structure, character limit constraints mapped to Zod `.max()`, usage-oriented component descriptions with enum `.describe()` annotations

**Avoids:** Catalog drift (Pitfall 1), json-render assumptions in Vite SPAs (Pitfall 4) — the client/server split is established here before any code is written

### Phase 2: AI Generation Endpoint

**Rationale:** The backend streaming endpoint is the integration point for the most complex dependencies: Fastify + AI SDK v6, Vercel AI Gateway routing, Anthropic model calls, and SSE passthrough through the CF edge router. Proving this pipeline works end-to-end — with auth, caching, and rate limiting in place — before building any UI ensures the foundation is solid. This phase includes the blocking integration test (SSE through the edge router) that is the most common source of production breakage.

**Delivers:** `services/agent` routes `/api/gen/ui` (standalone spec stream) and `/api/gen/chat` (conversational stream); Auth0 JWT middleware applied to generation routes; Anthropic prompt caching configured and verified (`cache_read_input_tokens > 0` on second identical request); per-user rate limiting (by Auth0 `sub` claim, not IP); cost logging; SSE passthrough verified through CF edge router; `AI_GATEWAY_API_KEY` configured in DO App Platform.

**Uses:** `ai@6` (`streamText`, `Output.object()`), `@ai-sdk/anthropic`, Vercel AI Gateway model string routing

**Avoids:** Unauthenticated endpoint (Pitfalls 6 and 8), prompt caching misses (Pitfall 3), SSE buffering (Pitfall 2), using `streamObject` (removed in AI SDK v6 — use `streamText + Output.object()`)

### Phase 3a: Playground App

**Rationale:** The standalone playground is the "wow demo" that validates catalog quality and generation UX. It is the simplest consumer of the backend pipeline — no conversation state, no app integration, no domain-specific context. Build and iterate here to prove the catalog generates acceptable Rialto-quality output before embedding AI anywhere in the hospitality app. Phases 3a and 3b can be developed concurrently — they share no direct dependency.

**Delivers:** `apps/gen` Vite SPA at `/gen`; `useUIStream` + `<Renderer>` progressive streaming UI; PromptBar, PreviewPane, JSON spec inspector; in-session prompt history; infrastructure additions (wrangler.gen.toml, `/gen` Service Binding in edge-router.js, Pulumi CF Worker resource for gen app).

**Implements:** Standalone generation mode (P1), prompt history (P1), playground surface (P1)

### Phase 3b: Hospitality Copilot Embed

**Rationale:** The embedded copilot pattern (contextual "Generate with AI" surface in the hospitality app) is lower-infrastructure than a full sidebar and proves AI generation value in a real workflow. Start with embedded; defer the full sidebar (assistive pattern) to v2 until inline/conversational mode is mature. Domain-aware prompt context (hospitality custom rules) lives here because it depends on a stable catalog.

**Delivers:** `<GenCopilot>` component in `packages/rialto` using `useChat` + optional `<Renderer>`; integration into `apps/hospitality` DashboardLayout; domain-aware prompt context with hospitality custom rules (reservation schema, floor plan structure, guest data shapes).

**Implements:** Embedded copilot pattern, domain-aware prompt context (P2)

### Phase 4: Persistence and Refinement

**Rationale:** Spec persistence is a single Prisma schema migration that unlocks three features simultaneously — history replay, favorites, and shareable permalinks. Implement once the generation quality from Phases 3a/3b is validated and worth persisting. Inline/conversational mode belongs here because it depends on spec persistence (you need a stored spec to apply RFC 6902 patch operations against).

**Delivers:** Prisma model for stored specs; prompt history replay; favorites list; shareable permalink (UUID → spec lookup); inline/conversational refinement mode (`pipeJsonRender` mixer for prose + JSONL patch interleaving).

**Implements:** Inline/conversational mode (P2), spec persistence (P2), favorites (P2), shareable permalink (P2)

**Avoids:** Building persistence infrastructure before generation quality is proven; adding inline mode complexity before standalone is battle-tested

### Phase Ordering Rationale

- Catalog first because everything — streaming, code export, type safety, prompt quality — flows from a correct `defineCatalog()`. Discovering a catalog architecture mistake in Phase 3 is expensive to unwind.
- Backend endpoint before any frontend because the streaming pipeline (Fastify → CF edge router → browser) is the integration most likely to have non-obvious production failure modes (SSE buffering, auth gaps, caching misses). Verify it before building UI on top of it.
- Standalone generation before inline/conversational because standalone has no session state, no spec-patching complexity, and is easier to validate. Inline mode adds RFC 6902 patch streaming — introduce that only after standalone output quality is acceptable.
- Persistence deferred to Phase 4 because it is only valuable after generation is proven to produce output worth keeping. Spec storage is a Prisma migration, not a long lead-time item.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 1 (Catalog Foundation):** Automating Zod catalog schema generation from Rialto TypeScript prop interfaces is not officially documented by json-render. Will require a spike (ts-morph vs. react-docgen-typescript vs. extending the existing `generate-manifest.ts` TypeScript Compiler API). Make this decision before writing any catalog schemas.
- **Phase 2 (AI Generation Endpoint):** Vercel AI Gateway model string routing with `AI_GATEWAY_API_KEY` in DO App Platform is confirmed in docs but untested in this specific environment. Verify the exact env var configuration works end-to-end before treating it as resolved.
- **Phase 4 (Inline/Conversational Mode):** `pipeJsonRender` mixing of prose and JSONL patch streams has limited documentation outside official json-render docs. Plan for hands-on experimentation to get correct stream interleaving behavior.

Phases with standard, well-documented patterns (skip `/gsd:research-phase`):

- **Phase 3a (Playground App):** Vite SPA + Service Binding follows the established monorepo pattern exactly (same as apps/hospitality, apps/rialto-web). No novel integration required.
- **Phase 3b (Copilot Embed, embedded pattern):** `useChat` + `<Renderer>` inline is straightforward once the backend chat endpoint is working. Microsoft's embedded copilot pattern is well-documented and maps cleanly to the existing hospitality app layout.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry with direct inspection; AI SDK v6 Fastify pattern confirmed against official cookbook; `streamObject` removal confirmed via dist inspection |
| Features | HIGH | json-render capabilities from official docs and DeepWiki architecture analysis; feature prioritization from direct inspection. MEDIUM for sharing/history UX patterns (limited authoritative sources) |
| Architecture | HIGH | Patterns verified against official AI SDK v6, json-render source, CF Workers docs, and live AI Gateway model list. One assumption (AI Gateway routing for DO App Platform via `AI_GATEWAY_API_KEY`) is confirmed in docs but untested in practice |
| Pitfalls | HIGH | SSE buffering confirmed via CF community threads and mastra-ai GitHub issue tracker; LLMjacking via Operation Bizarre Bazaar report; bundle size via documented analysis; prompt caching misses from Anthropic official caching docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Catalog generation pipeline:** How to automatically generate Zod catalog schemas from Rialto TypeScript prop interfaces is not documented by json-render. Research recommends ts-morph or react-docgen-typescript but implementation details need a spike at the start of Phase 1. If full automation proves impractical, hand-written schemas with a strict CI diff check are the fallback — but drift risk increases significantly.

- **`@json-render/react` bundle size:** No documented bundle size for this package. Measure with `rollup-plugin-visualizer` before committing to eager loading. If above 50 kB gzipped (after accounting for Rialto component imports already in the bundle), lazy-load the generative UI route via dynamic import.

- **Vercel AI Gateway model identifier currency:** The model string `"anthropic/claude-sonnet-4.6"` was verified via live API at research time (`curl https://ai-gateway.vercel.sh/v1/models`). Confirm the identifier is still current before Phase 2 implementation — the AI Gateway model list evolves.

- **React 19.2 version in apps:** `@json-render/react@0.15.0` requires `react@^19.2.3`. Current apps declare `react: "^19.0.0"`. Run `pnpm why react` before adding `@json-render/react` to confirm the resolved version is 19.2+.

## Sources

### Primary (HIGH confidence)
- npm registry direct inspection — `@json-render/core@0.15.0`, `@json-render/react@0.15.0`, `ai@6.0.141`, `@ai-sdk/react@3.0.143`, `@ai-sdk/anthropic@3.0.64`, `zod@4.3.6` peer dependencies and exports
- [AI SDK Fastify Cookbook](https://ai-sdk.dev/cookbook/api-servers/fastify) — `reply.send(result.toUIMessageStream())` pattern; no additional plugins required
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) — `x-vercel-ai-ui-message-stream: v1` header requirement, SSE format
- [AI SDK Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `streamText + Output.object()` replacing removed `streamObject` in v6
- [Vercel AI Gateway Authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok/authentication) — `AI_GATEWAY_API_KEY` for non-Vercel-hosted servers; OIDC tokens require Vercel hosting
- [json-render Getting Started (DeepWiki)](https://deepwiki.com/vercel-labs/json-render/2-getting-started) — `defineCatalog`, `defineRegistry`, `useUIStream`, `<Renderer>` patterns
- [json-render Official Site](https://json-render.dev/) — `catalog.prompt()`, Zod prop schema examples, inline vs. standalone modes
- [Cloudflare Workers Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/) — ReadableStream passthrough behavior; no buffering when returning Response body as-is
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — prompt injection as LLM01 risk
- [Anthropic prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — cache breakpoint structure, 2,048 token minimum for Sonnet 4.6
- Live AI Gateway model list — `curl https://ai-gateway.vercel.sh/v1/models` — confirmed `anthropic/claude-sonnet-4.6` as current
- Existing codebase: `infrastructure/worker/edge-router.js`, `services/agent/src/app.ts`, `packages/rialto/registry.json`, `packages/agent-core/package.json` — direct inspection

### Secondary (MEDIUM confidence)
- [InfoQ: Vercel Releases JSON-Render](https://www.infoq.com/news/2026/03/vercel-json-render/) — framework architecture, progressive rendering, flat spec format
- [Microsoft ISV UX Guidance for Copilot](https://learn.microsoft.com/en-us/microsoft-cloud/dev/copilot/isv/ux-guidance) — embedded/assistive/immersive copilot patterns; HAX toolkit
- [Cloudflare SSE community thread](https://community.cloudflare.com/t/using-server-sent-events-sse-with-cloudflare-proxy/656279) — `X-Accel-Buffering: no` requirement; mastra-ai SSE buffering issue
- [Operation Bizarre Bazaar](https://www.pillar.security/blog/operation-bizarre-bazaar-first-attributed-llmjacking-campaign-with-commercial-marketplace-monetization) — 35,000 attack sessions targeting exposed AI endpoints; LLMjacking campaign
- [AI SDK bundle size analysis](https://blog.hyperknot.com/p/til-vercel-ai-sdk-the-bloat-king) — 186 kB from top-level `ai` imports; subpath imports required
- [CopilotKit: Developer's Guide to Generative UI 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) — practitioner guide; CopilotKit-biased but useful for pattern comparison
- [LogRocket: json-render dynamic UI](https://blog.logrocket.com/vercel-json-render-dynamic-ui/) — verified against official docs

### Tertiary (LOW confidence)
- [Roger Wong: Generative UI and the Ephemeral Interface](https://rogerwong.me/2025/11/generative-ui-and-the-ephemeral-interface) — practitioner framing of ephemeral vs. persistent generated UIs; informed the code export "off-ramp" mental model

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
