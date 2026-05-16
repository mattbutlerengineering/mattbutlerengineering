# AI Provider Evaluation for Generative UI — March 2026

## Current State

| Dimension                   | Value                                                        |
| --------------------------- | ------------------------------------------------------------ |
| **Existing AI integration** | `@anthropic-ai/claude-agent-sdk` v0.1.0 in `@mbe/agent-core` |
| **Current use case**        | Code-level agent sessions (worktrees, PRs, file edits)       |
| **API key management**      | `ANTHROPIC_API_KEY` env var in agent service                 |
| **Backend**                 | Fastify on DigitalOcean App Platform                         |
| **Frontend hosting**        | Cloudflare Workers (static assets)                           |
| **Budget**                  | Personal project — cost sensitivity is high                  |
| **Target use case**         | Generative UI: streaming component specs from prompts        |

### Pain Points & Motivations

- Currently locked to Anthropic Claude for agent sessions — no ability to use cheaper/faster models for simpler UI generation tasks
- No streaming to frontend clients — agent service handles backend-only code tasks
- No cost tracking or observability for AI spend
- Generative UI needs different model characteristics than code agents: faster output, structured JSON, lower cost per request
- Want flexibility to test different providers (Claude for complex reasoning, Haiku for simple layouts, GPT for structured output)

---

## Evaluation Criteria

| Criterion                         | Why It Matters                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Streaming support**             | Generative UI requires progressive rendering — must stream tokens/JSON to client               |
| **Structured output**             | AI must generate valid JSON constrained to component schemas — structured output mode critical |
| **Tool calling**                  | Generative UI frameworks use tool calls to map to components                                   |
| **Cost per generation**           | Each UI generation = one API call. High-volume playground use means cost matters.              |
| **Latency (time to first token)** | Users waiting for UI to appear — TTFT directly impacts perceived quality                       |
| **Model variety**                 | Need cheap/fast models for simple layouts AND powerful models for complex compositions         |
| **Provider flexibility**          | Avoid lock-in; ability to switch models per use case                                           |
| **Existing stack compatibility**  | Works with Fastify, existing Anthropic SDK, Cloudflare Workers                                 |
| **Observability**                 | Cost tracking, usage attribution, error monitoring                                             |
| **Auth model**                    | How API keys are managed; OIDC vs static keys                                                  |

---

## Provider Profiles

### 1. Anthropic Claude (Direct API)

Direct access to Claude models via `@anthropic-ai/sdk` or `@anthropic-ai/claude-agent-sdk`. Already in use for agent sessions.

| Criterion                         | Details                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| **Streaming**                     | Yes — SSE streaming via `stream: true` parameter                                |
| **Structured output**             | Yes — tool use with JSON schemas; `tool_choice: "any"` forces structured output |
| **Tool calling**                  | Yes — first-class tool use with typed schemas                                   |
| **Cost (UI generation)**          | Haiku 4.5: $1/$5 per MTok (cheapest). Sonnet 4.6: $3/$15. Opus 4.6: $5/$25.     |
| **Estimated cost per generation** | ~$0.002–0.01 with Haiku (500 input + 2000 output tokens typical)                |
| **Latency**                       | Haiku: fast. Sonnet: moderate. Opus: slower but highest quality.                |
| **Model variety**                 | 3 tiers: Haiku (fast/cheap), Sonnet (balanced), Opus (powerful)                 |
| **Provider flexibility**          | Anthropic-only — no access to GPT, Gemini, etc.                                 |
| **Stack compat**                  | Already integrated — `@anthropic-ai/claude-agent-sdk` in agent-core             |
| **Observability**                 | Basic usage tracking in API response. No built-in dashboard.                    |
| **Auth**                          | Static API key (`ANTHROPIC_API_KEY`)                                            |

**Cost optimization:**

- Prompt caching: 90% savings on repeated system prompts (catalog descriptions). Cache hit = 0.1x input price.
- Batch API: 50% discount for non-real-time generation (pre-generating template UIs)
- Haiku 4.5 at $1/$5 MTok is extremely cost-effective for simple UI generation

**Key strengths:**

- Zero migration cost — already in the stack
- Claude excels at following structured schemas (tool use quality is best-in-class)
- Prompt caching is huge for generative UI — the component catalog system prompt is identical across requests
- Haiku 4.5 is the sweet spot: cheap, fast, and good enough for most UI generation

**Key weaknesses:**

- Single provider — can't use GPT or Gemini for specific strengths
- No built-in cost dashboard or usage attribution
- API key management is manual
- If Anthropic has an outage, all AI features go down

**Verdict:** Path of least resistance. Already integrated, Claude's structured output quality is excellent, and Haiku 4.5 with prompt caching makes generative UI affordable (~$0.001 per cached generation). Main risk is single-provider dependency.

---

### 2. Vercel AI SDK + AI Gateway

Provider-agnostic AI integration via Vercel's AI SDK with optional AI Gateway for routing, failover, and observability. AI Gateway uses OIDC auth (auto-provisioned via `vercel env pull`).

| Criterion                         | Details                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Streaming**                     | Yes — `streamText` + `toUIMessageStreamResponse()` is the standard pattern                             |
| **Structured output**             | Yes — `Output.object()` with Zod schemas in `generateText` / `streamText`                              |
| **Tool calling**                  | Yes — first-class tools with `inputSchema` / `outputSchema` (Zod)                                      |
| **Cost (UI generation)**          | AI Gateway: 0% markup with BYOK. System credentials: provider list price.                              |
| **Estimated cost per generation** | Same as direct provider costs + $0 markup (BYOK)                                                       |
| **Latency**                       | <20ms routing latency added by gateway. Otherwise same as direct.                                      |
| **Model variety**                 | 100+ models across 20+ providers. Use `"anthropic/claude-haiku-4.5"` or `"openai/gpt-5.4"` as strings. |
| **Provider flexibility**          | Best-in-class — switch providers by changing a string. Automatic failover.                             |
| **Stack compat**                  | AI SDK is React-native (`useChat`, `useCompletion`). Works with Fastify via `streamText`.              |
| **Observability**                 | Built-in: cost tracking, usage attribution (tags), traces, provider-level breakdown                    |
| **Auth**                          | OIDC (auto-provisioned, zero secrets) or BYOK (bring your own API keys)                                |

**Pricing model:**

- AI Gateway itself: included in Vercel Pro plan
- With BYOK: 0% markup — pay provider prices directly
- With system credentials: provider list price, billed through Vercel
- Requires Vercel project (currently hosting is on CF Workers + DO)

**Key strengths:**

- Provider agnostic — use Claude for complex UIs, Haiku for simple ones, GPT for specific tasks
- Automatic failover: if Anthropic is down, route to OpenAI
- Built-in observability: see cost per generation, per user, per model
- OIDC auth eliminates API key management
- `streamText` + `useChat` is the standard pattern json-render integrates with
- AI SDK is the common denominator across all generative UI frameworks

**Key weaknesses:**

- Requires Vercel project — current hosting is CF Workers + DO, not Vercel
- Adds Vercel platform dependency
- OIDC token refresh adds complexity for non-Vercel deployments
- AI SDK is a new dependency (though lightweight: `ai` + `@ai-sdk/react`)

**Verdict:** Best long-term choice if you're willing to adopt Vercel for the AI backend (or at least the AI Gateway). Provider flexibility, observability, and the AI SDK ecosystem are significant advantages. The question is whether adopting Vercel makes sense for the hosting story.

---

### 3. OpenAI (Direct API)

Direct access to GPT models via `openai` SDK or `@ai-sdk/openai` provider.

| Criterion                         | Details                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Streaming**                     | Yes — SSE streaming                                                                                          |
| **Structured output**             | Yes — `response_format: { type: "json_schema" }` forces valid JSON. Strongest structured output enforcement. |
| **Tool calling**                  | Yes — function calling with JSON Schema                                                                      |
| **Cost (UI generation)**          | GPT-5.4: competitive with Sonnet. GPT-4.1-mini: cheaper tier.                                                |
| **Estimated cost per generation** | Varies by model — competitive with Claude pricing                                                            |
| **Latency**                       | Generally fast TTFT, especially mini models                                                                  |
| **Model variety**                 | GPT-5.x (flagship), GPT-4.1-mini (cheap), o-series (reasoning)                                               |
| **Provider flexibility**          | OpenAI-only                                                                                                  |
| **Stack compat**                  | Would need new SDK dependency; no existing integration                                                       |
| **Observability**                 | OpenAI dashboard with basic usage tracking                                                                   |
| **Auth**                          | Static API key (`OPENAI_API_KEY`)                                                                            |

**Key strengths:**

- Structured JSON output mode is arguably the strongest — guarantees valid JSON matching a schema
- Fast models available for simple generation tasks
- Massive ecosystem and community

**Key weaknesses:**

- No existing integration — new dependency
- Single provider (same lock-in concern as Anthropic-direct)
- Claude's instruction-following for component catalogs is generally considered better
- Would need to maintain two AI provider integrations (Anthropic for agents, OpenAI for UI)

**Verdict:** Not recommended as primary provider. OpenAI's structured output is strong, but adding a second direct provider integration creates maintenance burden. Better accessed through AI SDK as a fallback provider.

---

### 4. Google Gemini (Direct API)

Direct access to Gemini models. Relevant for multimodal capabilities (image understanding for UI from screenshots).

| Criterion                | Details                                                          |
| ------------------------ | ---------------------------------------------------------------- |
| **Streaming**            | Yes                                                              |
| **Structured output**    | Yes — JSON mode with schema constraints                          |
| **Tool calling**         | Yes — function declarations                                      |
| **Cost**                 | Gemini Flash: very cheap. Gemini Pro: moderate.                  |
| **Model variety**        | Flash (cheap/fast), Pro (balanced), Ultra (powerful)             |
| **Provider flexibility** | Google-only                                                      |
| **Stack compat**         | No existing integration                                          |
| **Unique strength**      | Best multimodal — could generate UI from screenshot/sketch input |

**Verdict:** Niche value for "screenshot → UI" workflows. Not recommended as primary provider. Better accessed through AI SDK/Gateway as an optional provider.

---

### 5. Multi-Provider via AI SDK (No Gateway)

Use Vercel AI SDK with direct provider packages (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.) without the AI Gateway layer. Self-managed provider routing.

| Criterion                | Details                                                 |
| ------------------------ | ------------------------------------------------------- |
| **Streaming**            | Yes — unified `streamText` API across all providers     |
| **Structured output**    | Yes — `Output.object()` is provider-agnostic            |
| **Tool calling**         | Yes — unified tool API (`inputSchema` / `outputSchema`) |
| **Cost**                 | Direct provider prices — no middleware markup           |
| **Model variety**        | All providers accessible via `@ai-sdk/*` packages       |
| **Provider flexibility** | Full — switch providers by changing import              |
| **Stack compat**         | AI SDK works with Fastify. React hooks for frontend.    |
| **Observability**        | Manual — must build cost tracking yourself              |
| **Auth**                 | Manage API keys per provider manually                   |

**Key strengths:**

- Provider flexibility without Vercel platform dependency
- Unified API for all providers
- Can start with Anthropic (existing key) and add others incrementally
- No additional hosting requirements

**Key weaknesses:**

- Must manage multiple API keys
- No automatic failover (must implement manually)
- No built-in observability — cost tracking is DIY
- More dependencies than single-provider direct API

**Verdict:** Pragmatic middle ground — gets provider flexibility and AI SDK ecosystem without requiring Vercel hosting. Recommended if staying on CF Workers + DO for hosting.

---

## Comparison Table

| Provider                | Streaming | Structured Output | Tool Calling | Cost (simple gen)  | Model Variety | Failover  | Observability | Migration Friction      | Hosting Req    |
| ----------------------- | --------- | ----------------- | ------------ | ------------------ | ------------- | --------- | ------------- | ----------------------- | -------------- |
| **Anthropic Direct**    | Yes       | Via tools         | Yes          | ~$0.001–0.01       | 3 tiers       | None      | Basic         | None (already in stack) | None           |
| **AI SDK + Gateway**    | Yes       | Output.object()   | Yes          | Same + $0 (BYOK)   | 100+ models   | Automatic | Built-in      | Medium                  | Vercel project |
| **OpenAI Direct**       | Yes       | json_schema mode  | Yes          | Competitive        | 3+ tiers      | None      | Basic         | High (new provider)     | None           |
| **Google Direct**       | Yes       | JSON mode         | Yes          | Very cheap (Flash) | 3 tiers       | None      | Basic         | High (new provider)     | None           |
| **AI SDK (no Gateway)** | Yes       | Output.object()   | Yes          | Direct prices      | All providers | Manual    | DIY           | Low–Medium              | None           |

---

## Eliminated Providers

| Provider                 | Primary Elimination Reason                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **OpenAI Direct**        | Adds second provider integration alongside existing Anthropic. Better accessed via AI SDK. |
| **Google Gemini Direct** | Niche multimodal value. Not justified as primary. Better as AI SDK optional provider.      |
| **AWS Bedrock**          | Enterprise-focused, complex auth (IAM), not justified for personal project.                |
| **Azure OpenAI**         | Enterprise-focused, requires Azure subscription.                                           |

---

## Recommended Shortlist

### #1 AI SDK + Anthropic Direct (Recommended)

Use Vercel AI SDK as the abstraction layer with Anthropic as the primary (and initially only) provider via `@ai-sdk/anthropic`. No AI Gateway — manage the Anthropic API key directly.

1. **Unified API** — `streamText`, `useChat`, `Output.object()` work identically regardless of future provider changes
2. **Existing integration leveraged** — keep `ANTHROPIC_API_KEY`, add `@ai-sdk/anthropic` provider wrapper
3. **No hosting change required** — works on CF Workers + DO as-is
4. **json-render compatible** — AI SDK is json-render's native integration path
5. **Provider evolution** — add `@ai-sdk/openai` or `@ai-sdk/google` later by installing a package and changing a string
6. **Prompt caching** — Anthropic's caching (0.1x input cost on hits) makes repeated catalog prompts nearly free

**Cost estimate (playground with 100 generations/day):**

- Haiku 4.5 with prompt caching: ~$0.001/gen × 100 = ~$0.10/day = ~$3/month
- Sonnet 4.6 for complex UIs: ~$0.01/gen × 20 = ~$0.20/day = ~$6/month
- Total estimated: ~$5–10/month for moderate usage

**Migration path:**

1. Install `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`
2. Create generation endpoint using `streamText` + existing `ANTHROPIC_API_KEY`
3. Use `useChat` + `DefaultChatTransport` on frontend
4. Add prompt caching for the Rialto catalog system prompt
5. Later: add `@ai-sdk/openai` for failover or specific use cases

### #2 AI SDK + AI Gateway (Future Upgrade)

If/when you move hosting to Vercel (or add Vercel for AI workloads specifically), upgrade to AI Gateway:

1. `vercel link` → enable AI Gateway → `vercel env pull`
2. Replace `@ai-sdk/anthropic` with `model: "anthropic/claude-haiku-4.5"` strings
3. Get automatic failover, cost tracking, and OIDC auth for free
4. No code changes to generation logic — just model string format changes

**When to upgrade:** When AI costs exceed ~$50/month and you need observability, or when you adopt Vercel for hosting.

### #3 Anthropic Direct (Minimal Change)

If AI SDK feels like unnecessary abstraction:

1. Use `@anthropic-ai/sdk` directly (not the agent SDK)
2. Implement streaming manually via Anthropic's SSE format
3. Build custom `useChat`-like hooks or use raw `EventSource`

**When to choose this:** If you want zero new frameworks and are confident you'll stay Anthropic-only. Risk: rebuilding what AI SDK provides for free, and harder to integrate with json-render.

---

## Decision Matrix

| Scenario                               | Recommended Path                                                 |
| -------------------------------------- | ---------------------------------------------------------------- |
| Generative UI with json-render         | AI SDK + Anthropic (json-render integrates natively with AI SDK) |
| Start simple, add providers later      | AI SDK + Anthropic → add @ai-sdk/openai when needed              |
| Need cost tracking / observability now | AI SDK + AI Gateway (requires Vercel project)                    |
| Minimize dependencies                  | Anthropic direct (existing SDK)                                  |
| Must support multiple providers day 1  | AI SDK + multiple @ai-sdk/\* packages                            |
| Moving hosting to Vercel               | AI SDK + AI Gateway (best DX on Vercel)                          |
| Stay on CF Workers + DO forever        | AI SDK + Anthropic direct (no Vercel dependency)                 |
| Budget-constrained, high volume        | Haiku 4.5 with prompt caching via any path (~$0.001/gen)         |

---

## Sources

### Pricing & Documentation

- [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Vercel AI Gateway Pricing](https://vercel.com/docs/ai-gateway/pricing)
- [Vercel AI Gateway — Authentication & BYOK](https://vercel.com/docs/ai-gateway/authentication-and-byok)
- [Vercel AI Gateway — Overview](https://vercel.com/docs/ai-gateway)
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
- [AI SDK — Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)

### Comparisons & Analysis

- [Claude API Pricing 2026: Full Breakdown (Metacto)](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [AI API Pricing Comparison 2026 (IntuitionLabs)](https://intuitionlabs.ai/articles/ai-api-pricing-comparison-grok-gemini-openai-claude)
- [LLM API Pricing 2026: Live Comparison (CloudIDR)](https://www.cloudidr.com/llm-pricing)
- [Vercel AI SDK vs Claude Agent SDK (Medium)](https://bertomill.medium.com/vercel-ai-sdk-vs-claude-agent-sdk-which-one-should-you-build-with-a88d2d6a4311)
- [Vercel AI Gateway — Unified Reporting](https://vercel.com/blog/unified-reporting-for-your-ai-spend)
- [Anthropic API Pricing Guide 2026 (nOps)](https://www.nops.io/blog/anthropic-api-pricing/)
- [Vercel AI Gateway Pricing Plans (TrueFoundry)](https://www.truefoundry.com/blog/understanding-vercel-ai-gateway-pricing)
