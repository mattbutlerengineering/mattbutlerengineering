# Generative UI Framework Evaluation — March 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Frontend** | React 19, Vite 7, TypeScript |
| **Design System** | Rialto (59 components, barrel export from `@mattbutlerengineering/rialto`) |
| **Component Metadata** | `registry.json` (props, descriptions, examples), `llms.txt` / `llms-full.txt` |
| **Backend** | Fastify (users, agent, reservations services) |
| **AI Integration** | `@anthropic-ai/claude-agent-sdk` in `@mbe/agent-core` (code-level agents only) |
| **Auth** | Auth0 |
| **Hosting** | Cloudflare Workers (static) + DigitalOcean App Platform (API) |
| **Monorepo** | Turborepo + pnpm, `@mbe/` package prefix |

### Pain Points & Motivations

- No AI-powered UI generation capability — all interfaces are hand-coded
- Rialto has 59 components with typed props and a machine-readable registry, but no way to leverage this metadata for dynamic UI composition
- Agent service handles code-level tasks (worktrees, PRs) but can't generate visual interfaces
- Three use cases identified: AI-generated pages/dashboards, AI copilot embedded in hospitality app, standalone generative UI playground
- Portfolio differentiation: demonstrating design system + AI integration is a compelling engineering narrative

---

## Evaluation Criteria

| Criterion | Why It Matters |
|-----------|---------------|
| **Custom component catalog** | Must work with Rialto components, not just built-in shadcn/UI |
| **Streaming support** | Progressive rendering as AI generates — critical for UX |
| **AI SDK compatibility** | Integrate with Anthropic/Claude or Vercel AI SDK patterns |
| **Type safety** | Zod schemas, TypeScript — prevent hallucinated props |
| **Standalone + inline modes** | Need both full-page generation AND conversational embedded UI |
| **Code export** | Generate standalone React components users can copy |
| **Framework weight** | Bundle size impact on existing Vite apps |
| **React 19 compatibility** | Must work with current stack |
| **Maturity / community** | Stars, releases, production usage, documentation quality |
| **Migration friction** | Effort to integrate with existing monorepo and Rialto |

---

## Framework Profiles

### 1. json-render (Vercel Labs)

Generative UI framework that constrains AI output to developer-defined catalogs. AI generates JSON specs (not code), which render natively via platform-specific renderers. Released January 2026 under Apache 2.0.

| Criterion | Details |
|-----------|---------|
| **Custom catalog** | First-class — define components + Zod schemas in a catalog; AI constrained to catalog. `@json-render/shadcn` ships 36 pre-built components; custom catalogs are the primary use case |
| **Streaming** | JSONL streaming with progressive rendering — components appear as JSON arrives |
| **AI SDK compat** | Native integration via `pipeJsonRender()` + `useUIStream` / `useJsonRenderMessage` hooks. Works with `streamText` and `useChat` |
| **Type safety** | Zod schemas for all component props; AI can only reference defined components and valid props |
| **Modes** | Standalone (JSONL-only, full-page) and Inline (text + JSONL, conversational) |
| **Code export** | Yes — export generated UI as standalone React components with no runtime dependencies |
| **Framework weight** | `@json-render/core` + `@json-render/react` — moderate (dedicated renderer) |
| **React 19** | Yes — React renderer is current |
| **Maturity** | 13.5k GitHub stars, 191 commits, 200+ releases, active development. Vercel Labs backing. |
| **Migration friction** | Medium — need to build a Rialto catalog mapping Rialto components to Zod schemas. `registry.json` already has prop metadata that could bootstrap this. |

**Key strengths:**
- Catalog system is exactly what's needed — guardrailed AI output mapped to real components
- `registry.json` + `llms.txt` already contain the metadata to build a Rialto catalog
- Multiple renderers: React, Vue, Svelte, React Native, PDF, email, terminal, 3D
- State binding system (`$state`, `$bindState`) for interactive generated UIs
- Code export means generated UIs can become permanent features

**Key weaknesses:**
- JSON intermediate layer adds complexity vs direct tool-call rendering
- New framework to learn and maintain
- Catalog must be kept in sync with Rialto component changes

**Verdict:** Strongest fit for the full vision (all three use cases). Catalog concept maps directly to Rialto's registry. AI SDK integration is native. Code export enables the playground → production workflow.

---

### 2. Tambo

React toolkit for building agents that render UI. Register components with Zod schemas; the agent picks the right one and streams props. MIT license.

| Criterion | Details |
|-----------|---------|
| **Custom catalog** | Yes — register React components paired with Zod schemas. Schemas become LLM tool definitions. |
| **Streaming** | Props stream to components as the model generates them |
| **AI SDK compat** | Has its own agent runtime; integrates with external LLMs but not AI SDK hooks directly |
| **Type safety** | Zod schema validation; typed tool definitions |
| **Modes** | Primarily conversational (chat + rendered components). No standalone full-page mode documented. |
| **Code export** | Not documented |
| **Framework weight** | `@tambo-ai/react` — moderate. Includes conversation state management and agent orchestration |
| **React 19** | Yes |
| **Maturity** | 11.1k GitHub stars, 5,325 commits, MIT license, active. Backed by Tambo AI. |
| **Migration friction** | Medium — register Rialto components with Zod schemas. Brings its own state management layer which may conflict with existing patterns. |

**Key strengths:**
- Clean DX — register components, agent picks them
- "Interactable" components that persist and update across conversation turns
- MCP integration for external tool connections
- Lighter weight than json-render for simple component-selection use cases

**Key weaknesses:**
- No standalone/full-page generation mode — primarily chat-embedded
- Own agent runtime may conflict with existing `@mbe/agent-core`
- No code export capability documented
- Less ecosystem breadth than json-render (no PDF, email, 3D renderers)

**Verdict:** Good for the "copilot embedded in hospitality app" use case. Less suitable for standalone page generation or playground. Agent runtime overlap with existing agent service is a concern.

---

### 3. CopilotKit

Full application integration framework for AI copilots. Handles state synchronization between AI and UI, tool lifecycles, and multi-step workflows.

| Criterion | Details |
|-----------|---------|
| **Custom catalog** | Via `useFrontendTool` hook — bind predefined React components to tool lifecycles |
| **Streaming** | Yes — via AG-UI protocol for real-time coordination |
| **AI SDK compat** | Has its own runtime (CopilotRuntime). Supports LangGraph, CrewAI, custom agents. Not AI SDK-native. |
| **Type safety** | TypeScript throughout; Zod schemas for tool parameters |
| **Modes** | Primarily inline (chat sidebar/panel). Supports "static" generative UI (agent picks components) and A2UI declarative specs |
| **Code export** | Not a focus — more about runtime copilot behavior than exportable artifacts |
| **Framework weight** | Heavy — full runtime, state sync, AG-UI protocol, chat panel components |
| **React 19** | Yes |
| **Maturity** | Very large community, well-funded, comprehensive docs. Y Combinator backed. |
| **Migration friction** | High — CopilotKit is an opinionated framework that wants to manage the AI runtime. Significant overlap with existing agent service and auth patterns. |

**Key strengths:**
- Best-in-class for "AI assistant embedded in your app" pattern
- State synchronization between AI and application data
- Multi-step workflow support with approval gates
- Large ecosystem and community

**Key weaknesses:**
- Heavy framework — wants to own the AI runtime and UI layer
- Significant overlap with existing `@mbe/agent-core` architecture
- Chat-panel focused — not designed for full-page UI generation
- Would need to replace or wrap existing agent patterns

**Verdict:** Overkill for this project. The framework wants more control over the AI runtime than makes sense when you already have an agent service. Better suited for greenfield projects that need a full copilot experience.

---

### 4. assistant-ui

Open-source UI component library for AI chat interfaces. Y Combinator W25. Focused on presentation layer, not generation.

| Criterion | Details |
|-----------|---------|
| **Custom catalog** | Not applicable — this is a chat UI library, not a generative UI framework |
| **Streaming** | Yes — renders streaming AI responses with tool-call visualization |
| **AI SDK compat** | Direct AI SDK integration — designed to work with `useChat` and tool-call patterns |
| **Type safety** | TypeScript, shadcn/ui-based |
| **Modes** | Chat interface only — renders messages, tool calls, and tool results |
| **Code export** | No |
| **Framework weight** | Light — UI components only, no runtime |
| **React 19** | Yes |
| **Maturity** | 50k+ monthly npm downloads, YC-backed, active development |
| **Migration friction** | Low for chat UI, but doesn't solve the core generative UI problem |

**Key strengths:**
- Beautiful chat interfaces
- Excellent AI SDK integration
- Light weight — just components, no runtime opinions
- Good tool-call rendering

**Key weaknesses:**
- Not a generative UI framework — renders chat messages and tool results, doesn't generate arbitrary UI
- Overlaps with what Rialto already provides for UI components
- Would need json-render or similar underneath for actual UI generation

**Verdict:** Wrong category. assistant-ui solves the "make a nice chat interface" problem, not the "AI generates UI from components" problem. Could complement json-render or Tambo for the chat chrome, but Rialto already covers this territory.

---

### 5. AI SDK Native (Tool-Call Mapping)

No external framework — use Vercel AI SDK v6 tool-calling directly. Define tools that return data; render components based on tool-call results in the message parts.

| Criterion | Details |
|-----------|---------|
| **Custom catalog** | Implicit — each tool maps to a component. No formal catalog abstraction. |
| **Streaming** | Yes — `streamText` + `toUIMessageStreamResponse()` streams tool states (`input-available`, `output-available`, `output-error`) |
| **AI SDK compat** | IS the AI SDK — native by definition |
| **Type safety** | Zod schemas for tool input/output |
| **Modes** | Primarily inline (chat + tool rendering). No standalone page generation. |
| **Code export** | No |
| **Framework weight** | Zero additional — just `ai` + `@ai-sdk/react` |
| **React 19** | Yes |
| **Maturity** | AI SDK is the standard — massive adoption, Vercel-maintained |
| **Migration friction** | Low — add `ai` + `@ai-sdk/react`, define tools, render in `message.parts` |

**Key strengths:**
- Zero framework overhead — just the AI SDK you'd add anyway
- Simplest mental model: tool = component
- Best for "start here and evolve" approach
- All AI SDK ecosystem benefits (providers, streaming, agents)

**Key weaknesses:**
- No layout composition — AI picks tools (components), but can't compose them into layouts
- No catalog abstraction — each tool is manually defined, not derived from registry
- No state binding — components are read-only renders of tool output
- No code export
- Quickly hits ceiling for complex generative UI

**Verdict:** Best starting point if you want to ship something quickly. Define 5-10 tools that map to Rialto components, wire up `useChat`, and you have basic generative UI. Can evolve to json-render when you need layout composition and standalone generation.

---

## Comparison Table

| Framework | Custom Catalog | Streaming | AI SDK Native | Standalone Mode | Code Export | Framework Weight | Maturity | Migration Friction |
|-----------|---------------|-----------|--------------|----------------|------------|-----------------|----------|-------------------|
| **json-render** | First-class | JSONL progressive | Yes (pipeJsonRender) | Yes | Yes | Moderate | 13.5k stars | Medium |
| **Tambo** | Zod registration | Props streaming | Own runtime | No | No | Moderate | 11.1k stars | Medium |
| **CopilotKit** | useFrontendTool | AG-UI protocol | Own runtime | No | No | Heavy | Very large | High |
| **assistant-ui** | N/A (chat UI) | Yes | Yes | N/A | No | Light | 50k+ npm/mo | Low (wrong tool) |
| **AI SDK native** | Implicit (tools) | Yes | IS the SDK | No | No | Zero | Standard | Low |

---

## Eliminated Frameworks

| Framework | Primary Elimination Reason |
|-----------|---------------------------|
| **CopilotKit** | Too heavy — wants to own the AI runtime; significant overlap with existing agent service. Better for greenfield copilot apps. |
| **assistant-ui** | Wrong category — chat UI library, not generative UI framework. Rialto already covers UI components. |
| **Thesys/Crayon** | Rapid prototyping tool, not a production framework. No custom component support. |
| **Google A2UI** | Cross-platform spec (JSONL), but early stage and Google-ecosystem focused. No React-first tooling. |
| **MCP Apps** | Open-ended pattern (iframes/HTML) — security and consistency concerns incompatible with Rialto-only constraint. |

---

## Recommended Shortlist

### #1 json-render (Recommended)

json-render is the strongest fit for all three use cases:

1. **AI-generated pages/dashboards** — Standalone mode generates full-page JSONL specs from Rialto catalog
2. **Copilot in hospitality app** — Inline mode mixes text + rendered components in conversational UI
3. **Playground** — Standalone mode with code export lets users prompt → preview → copy React code

**Why it wins:**
- Catalog concept maps directly to Rialto's existing `registry.json` — you're not starting from scratch
- Native AI SDK integration means `streamText` + `pipeJsonRender` + `useChat` works out of the box
- Code export enables the "try in playground → ship in app" workflow
- Multiple renderers mean the same catalog could eventually produce PDFs, emails, or OG images
- Vercel Labs backing suggests long-term maintenance and AI SDK alignment

**Integration path:**
1. Build `@mbe/rialto-catalog` package: derive json-render catalog from `registry.json` + Zod schemas
2. Add generation endpoint to agent service (or new service): `streamText` → `pipeJsonRender`
3. Add `<Renderer>` + `useUIStream` to hospitality app for copilot mode
4. Build playground app at `/gen` using standalone mode
5. Connect all three to the same Rialto catalog

**Trade-offs:** Adds a framework dependency. Catalog must stay in sync with Rialto. JSON intermediate layer is an abstraction that could leak.

### #2 AI SDK Native + Custom Renderer (Build-Your-Own)

If json-render feels too heavy or you want full control:

1. Define tools from `registry.json` programmatically — each Rialto component becomes a tool
2. Use `streamText` + `useChat` + `message.parts` rendering
3. Build a custom `<DynamicRenderer>` that maps tool outputs to Rialto components
4. Add layout composition later (JSON spec → component tree)

**When to choose this:** If you want to start small (5-10 components), ship quickly, and build the abstraction incrementally. Risk: you end up rebuilding json-render's catalog system.

### #3 Tambo (Alternative)

If the primary use case narrows to "copilot in hospitality app" only:

1. Register hospitality-relevant Rialto components with Zod schemas
2. Use Tambo's conversation state management for persistent interactions
3. Leverage "interactable" components for forms and data entry

**When to choose this:** If standalone page generation and code export aren't priorities, and you want a lighter framework focused on conversational UI.

---

## Decision Matrix

| Scenario | Recommended Path |
|----------|-----------------|
| All three use cases (pages + copilot + playground) | json-render with Rialto catalog |
| Start simple, evolve later | AI SDK native tools → migrate to json-render when hitting limits |
| Copilot-only in hospitality app | Tambo or AI SDK native |
| Maximum control, custom everything | AI SDK native + custom renderer |
| Portfolio showcase priority | json-render (code export + playground mode = best demo) |
| Minimize new dependencies | AI SDK native (zero additional framework) |

---

## Sources

### Framework Documentation & Repositories
- [json-render — Official Site](https://json-render.dev/)
- [json-render — GitHub (vercel-labs/json-render)](https://github.com/vercel-labs/json-render)
- [json-render — AI SDK Integration Docs](https://json-render.dev/docs/ai-sdk)
- [json-render — Introduction](https://json-render.dev/docs)
- [Tambo — GitHub](https://github.com/tambo-ai/tambo)
- [CopilotKit — Official Site](https://www.copilotkit.ai)
- [CopilotKit — Generative UI Examples](https://github.com/CopilotKit/generative-ui)
- [assistant-ui — Evaluation (DEV Community)](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10)
- [AI SDK — Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- [Vercel Academy — Multi-Step & Generative UI](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui)

### Industry Analysis & Comparisons
- [CopilotKit — The Developer's Guide to Generative UI in 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)
- [Builder.io — The React + AI Stack for 2026](https://www.builder.io/blog/react-ai-stack-2026)
- [DEV Community — Top AI Libraries for React Developers in 2026](https://dev.to/puckeditor/top-ai-libraries-for-react-developers-in-2026-nmb)
- [InfoQ — Vercel Releases JSON-Render](https://www.infoq.com/news/2026/03/vercel-json-render/)
- [The New Stack — Vercel's json-render: A Step Toward Generative UI](https://thenewstack.io/vercels-json-render-a-step-toward-generative-ui/)
- [LogRocket — Exploring Vercel's JSON Render](https://blog.logrocket.com/vercel-json-render-dynamic-ui/)
- [DEV Community — The A2UI Protocol: 2026 Complete Guide](https://dev.to/czmilo/the-a2ui-protocol-a-2026-complete-guide-to-agent-driven-interfaces-2l3c)
