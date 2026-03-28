# Product Requirements Document: Generative UI (v1.2)

**Date:** 2026-03-27
**Status:** Draft
**Milestone:** v1.2 Generative UI
**Author:** Claude + Matt Butler

---

## 1. Problem Statement

The mattbutlerengineering monorepo has a mature design system (Rialto, 59 components) with machine-readable metadata (registry.json, llms.txt, Zod-typed props). But every interface is hand-coded. There is no way for users or developers to describe what they need in natural language and receive a rendered, interactive UI built from Rialto components.

**Opportunity:** Bridge the gap between the design system's metadata and AI-powered interface generation — turning Rialto from a component library into a generative UI platform.

---

## 2. Goals

1. **AI generates Rialto-native interfaces** from natural language prompts, constrained to the design system vocabulary
2. **Three surfaces:** standalone playground, embedded hospitality copilot, full-page dashboard generation
3. **Portfolio showcase:** demonstrate design system + AI integration as an engineering narrative
4. **Cost-effective:** ~$5-10/month for moderate usage via Haiku 4.5 + prompt caching

---

## 3. Non-Goals

- Open-ended HTML/CSS generation (breaks design system fidelity)
- LLM-generated inline styles (breaks Rialto token system)
- Auto-deploying generated UIs to production (no human review)
- Full sidebar copilot (defer to v2 — start with embedded pattern)
- Code export (defer until generation quality proven)

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  apps/gen     │  │ apps/hospitality  │  │  apps/rialto-web  │  │
│  │  (Playground) │  │ (Copilot Embed)   │  │  (Showcase)       │  │
│  │              │  │                   │  │                   │  │
│  │ useUIStream  │  │ useChat +         │  │  (no AI)          │  │
│  │ <Renderer>   │  │ <GenCopilot>      │  │                   │  │
│  └──────┬───────┘  └────────┬──────────┘  └───────────────────┘  │
│         │                   │                                    │
│         │    @mbe/rialto-catalog (registry: Component → React)   │
│         │    @mbe/rialto (59 components)                         │
└─────────┼───────────────────┼────────────────────────────────────┘
          │ SSE stream        │ SSE stream
          ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│              CF Worker Edge Router                               │
│              mattbutlerengineering.com                            │
│                                                                  │
│   /gen*  → GEN Worker (Static Assets)                            │
│   /api/gen/* → api.mattbutlerengineering.com (passthrough SSE)   │
│   /hospitality* → HOSPITALITY Worker                             │
│   /rialto* → RIALTO Worker                                      │
│   /* → MARKETING Worker                                          │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DigitalOcean App Platform                            │
│              api.mattbutlerengineering.com                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  services/agent (Fastify, port 3003)                       │  │
│  │                                                            │  │
│  │  Existing:                    New:                         │  │
│  │  POST /v1/sessions            POST /api/gen/ui             │  │
│  │  GET  /v1/sessions            POST /api/gen/chat           │  │
│  │  POST /v1/orchestrate                                      │  │
│  │                                                            │  │
│  │  ┌──────────────────────┐  ┌────────────────────────────┐ │  │
│  │  │ @mbe/agent-core      │  │ AI SDK v6                  │ │  │
│  │  │ (Claude Agent SDK)   │  │ streamText + catalog.prompt│ │  │
│  │  └──────────────────────┘  └─────────────┬──────────────┘ │  │
│  └──────────────────────────────────────────┼────────────────┘  │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────┐
                              │  Anthropic API              │
                              │  (via AI SDK @ai-sdk/       │
                              │   anthropic or AI Gateway)   │
                              │                             │
                              │  Haiku 4.5  → simple UIs    │
                              │  Sonnet 4.6 → complex UIs   │
                              └─────────────────────────────┘
```

### 4.2 Data Flow: Prompt → Rendered UI

```
User types prompt
       │
       ▼
  ┌─────────────┐     POST /api/gen/ui
  │  apps/gen    │ ──────────────────────►  ┌──────────────────┐
  │  PromptBar   │                          │ services/agent    │
  └─────────────┘                          │                  │
                                            │  1. Auth check   │
       ┌────────────────────────────────── │  2. Rate limit   │
       │  SSE stream (JSONL patches)       │  3. Build prompt: │
       │                                    │     catalog.prompt│
       │                                    │     + user prompt │
       ▼                                    │  4. streamText() │
  ┌─────────────┐                          │     → Anthropic  │
  │  useUIStream │                          │  5. Stream JSONL │
  │  compiles    │                          │     patches back │
  │  JSONL → spec│                          └──────────────────┘
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐     ┌──────────────────┐
  │  <Renderer>  │ ──► │ rialto-catalog   │
  │  spec + reg  │     │ registry maps    │
  │  = Rialto UI │     │ type → Component │
  └─────────────┘     └──────────────────┘
         │
         ▼
  ┌─────────────────────────────┐
  │  Rendered Rialto Components  │
  │  (Card, Stack, Button, etc.) │
  │  Progressive streaming       │
  └─────────────────────────────┘
```

### 4.3 Package Dependency Graph

```
                    ┌─────────────┐
                    │  zod@^4.3   │  (monorepo-wide upgrade)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────────┐
              │            │                │
              ▼            ▼                ▼
   ┌──────────────┐ ┌───────────┐  ┌──────────────────┐
   │ @json-render │ │ ai@^6.0   │  │ @ai-sdk/anthropic│
   │ /core        │ │           │  │                  │
   └──────┬───────┘ └─────┬─────┘  └────────┬─────────┘
          │               │                  │
          ▼               │                  │
   ┌──────────────┐       │                  │
   │ @json-render │       │                  │
   │ /react       │       │                  │
   └──────┬───────┘       │                  │
          │               │                  │
          ▼               ▼                  ▼
   ┌──────────────────────────────────────────────┐
   │         packages/rialto-catalog (NEW)         │
   │                                               │
   │  defineCatalog() ─── Zod schemas from Props   │
   │  defineRegistry() ── Component → React map    │
   │  catalog.prompt() ── System prompt for LLM    │
   └───────────┬───────────────────┬───────────────┘
               │                   │
     ┌─────────┘                   └──────────┐
     ▼                                        ▼
┌──────────┐                          ┌────────────────┐
│ apps/gen │                          │ services/agent │
│ (client) │                          │ (server)       │
│          │                          │                │
│ registry │                          │ catalog.prompt │
│ Renderer │                          │ streamText     │
│ useUIStream                         │ @ai-sdk/*     │
└──────────┘                          └────────────────┘
```

---

## 5. Component Catalog Design

### 5.1 Curated Component Set (~25 of 59)

Not all 59 Rialto components belong in the catalog. Sub-components (AccordionItem, BreadcrumbItem) are children, not top-level catalog entries. The AI sees only composable primitives.

**Layout & Structure:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Stack | Primary layout primitive | direction, gap, align, justify |
| Card | Content container | variant, padding, title, subtitle |
| Divider | Visual separator | orientation |
| AspectRatio | Media container | ratio |

**Typography & Content:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Text | All text rendering | variant, size, weight, as |
| Badge | Status indicators | variant, size, dot |
| Avatar | User identity | src, alt, fallback, size |

**Input & Forms:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Button | Primary action | variant, size, loading, disabled |
| Input | Text entry | label, hint, error, type, placeholder |
| Select | Option selection | label, options, placeholder |
| Toggle | Boolean switch | label, checked, onCheckedChange |
| Checkbox | Multi-select | label, checked |

**Navigation:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Tabs | Content switching | defaultValue, children (Tab items) |
| Breadcrumb | Location context | items |
| NavigationMenu | App navigation | items |

**Feedback & Overlay:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Alert | Inline messages | variant, title, children |
| Banner | Page-level messages | variant, title, dismissible |
| Dialog | Modal content | open, onClose, title |
| Toast | Ephemeral notifications | (via useToast hook) |

**Data Display:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Table | Tabular data | columns, data, rowKey |
| DataList | Key-value pairs | children |
| EmptyState | No-data placeholder | heading, description, action |
| Accordion | Collapsible sections | children |

**Specialized:**
| Component | Catalog Role | Key Props for AI |
|-----------|-------------|-----------------|
| Sidebar | App shell layout | children |
| AppBar | Top navigation | title, actions |
| Footer | Page footer | children |

### 5.2 Catalog → Zod Schema Example

```typescript
// packages/rialto-catalog/src/catalog.ts
import { defineCatalog } from "@json-render/core";
import { z } from "zod";

export const rialtoCatalog = defineCatalog({
  components: {
    Card: {
      description: "Content container with optional title and subtitle. Use for grouping related information.",
      props: z.object({
        variant: z.enum(["default", "outlined"]).describe("Visual style").optional(),
        padding: z.enum(["sm", "md", "lg"]).describe("Internal spacing").optional(),
        title: z.string().max(100).describe("Card heading text").optional(),
        subtitle: z.string().max(200).describe("Secondary description").optional(),
      }),
      slots: {
        children: { description: "Card content — any components" },
      },
    },
    // ... ~24 more components
  },
  actions: {
    setState: { description: "Update local UI state" },
    validateForm: { description: "Validate form inputs" },
    navigate: { description: "Navigate to a URL" },
  },
});
```

---

## 6. User Experiences

### 6.1 Playground (`/gen`)

```
┌─────────────────────────────────────────────────────────────┐
│  ◄ mattbutlerengineering.com/gen                       ☀ ▣  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │              [Generated Rialto UI renders here]       │  │
│  │                                                       │  │
│  │              Components stream in progressively       │  │
│  │              as the AI generates the spec             │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │ Prompt History          │  │ JSON Spec Inspector      │  │
│  │                         │  │                          │  │
│  │ > reservation dashboard │  │ { "type": "Stack",      │  │
│  │ > contact form          │  │   "props": { ... },     │  │
│  │ > settings page         │  │   "children": [ ... ]   │  │
│  │                         │  │ }                        │  │
│  └─────────────────────────┘  └──────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 💬 Describe the UI you want...                    ▶  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Hospitality Copilot (Embedded Pattern)

```
┌─────────────────────────────────────────────────────────────┐
│  ◄ mattbutlerengineering.com/hospitality            ☀ ▣ 👤 │
├─────────────────────────────────────────────────────────────┤
│  ┌────────┐                                                 │
│  │ Home   │  Dashboard                                      │
│  │ Reserv │  ─────────                                      │
│  │ Floor  │                                                 │
│  │ Guests │  ┌──────────────────────────────────────────┐   │
│  │        │  │ Today's Overview                         │   │
│  │        │  │ ...existing dashboard content...         │   │
│  │        │  └──────────────────────────────────────────┘   │
│  │        │                                                 │
│  │        │  ┌──────────────────────────────────────────┐   │
│  │        │  │ ✨ Generate with AI                      │   │
│  │        │  │                                          │   │
│  │        │  │ "Show me a summary of this week's        │   │
│  │        │  │  reservations as a card grid"             │   │
│  │        │  │                                   [Go]   │   │
│  │        │  │                                          │   │
│  │        │  │ ┌─ Generated UI ──────────────────────┐  │   │
│  │        │  │ │  Card  Card  Card  Card             │  │   │
│  │        │  │ │  Mon   Tue   Wed   Thu              │  │   │
│  │        │  │ │  12    8     15    22               │  │   │
│  │        │  │ └─────────────────────────────────────┘  │   │
│  │        │  └──────────────────────────────────────────┘   │
│  └────────┘                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Phased Delivery

| Phase | Name | Delivers | Depends On |
|-------|------|----------|------------|
| 12 | Catalog Foundation | `packages/rialto-catalog`, Zod schemas for ~25 components, CI catalog drift check, type extensions | Zod v4 upgrade |
| 13 | AI Generation Endpoint | `/api/gen/ui` and `/api/gen/chat` routes, auth, caching, rate limiting, SSE verification | Phase 12 |
| 14a | Playground App | `apps/gen` at `/gen`, streaming renderer, prompt history, spec inspector | Phase 13 |
| 14b | Hospitality Copilot | `<GenCopilot>` component, hospitality integration, domain-aware context | Phase 13 |
| 15 | Persistence & Refinement | Spec storage, history replay, favorites, permalinks, inline mode | Phases 14a/14b |

Phase numbering continues from v1.1 (ended at phase 11).

---

## 8. Cost Model

| Scenario | Model | Tokens (in/out) | Cost/Gen | Monthly (100/day) |
|----------|-------|-----------------|----------|-------------------|
| Simple layout | Haiku 4.5 | 500/2000 | ~$0.001 | ~$3 |
| Complex dashboard | Sonnet 4.6 | 1000/4000 | ~$0.01 | ~$9 |
| With prompt caching | Haiku 4.5 | 50*/2000 | ~$0.0003 | ~$1 |

*\*Cache hit reduces 5000-token catalog to ~50 tokens of cache-read cost*

**Monthly budget estimate:** $5-15 for moderate usage. Hard cap recommended at $50/month in Anthropic console.

---

## 9. Security Model

- All generation endpoints require Auth0 JWT authentication (via existing `@mbe/auth`)
- Per-user rate limiting by Auth0 `sub` claim (not IP — prevents abuse from authenticated users)
- Catalog constrains AI output — no arbitrary HTML, no inline styles, no unknown components
- json-render's `z.strict()` on schemas rejects invalid props at render time
- Prompt injection mitigated by catalog constraint (AI can only generate from known components)
- No user-provided code execution — generated specs are data, not code

---

## 10. Success Criteria

1. User can type a prompt and see a streaming Rialto UI render within 2 seconds (TTFT)
2. Generated UIs use only Rialto components — no hallucinated components or props
3. Playground at `/gen` is publicly accessible and demonstrates the capability
4. Hospitality copilot generates context-aware UIs from reservation/floor plan data
5. Monthly AI cost stays under $15 for normal usage patterns
6. Prompt caching achieves >90% cache hit rate after warmup

---

## 11. Open Questions

1. Should the playground require authentication, or be public (read-only generation)?
2. How many components should be in the initial catalog? Start with ~15 and expand, or launch with full ~25?
3. Should generated UIs be theme-aware (respect current light/dark mode)?
4. Should we support "remix" — taking an existing page and generating variations?

---

## 12. References

- [Generative UI Framework Evaluation](../evaluations/2026-03-27-generative-ui-frameworks.md)
- [AI Provider Evaluation](../evaluations/2026-03-27-ai-providers-generative-ui.md)
- [Research: SUMMARY.md](../../.planning/research/SUMMARY.md)
- [json-render Documentation](https://json-render.dev/docs)
- [AI SDK v6 Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
