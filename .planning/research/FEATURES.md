# Feature Research

**Domain:** Generative UI — AI-powered interface generator built on a constrained component catalog (json-render pattern)
**Researched:** 2026-03-27
**Confidence:** HIGH for json-render capabilities (direct docs inspection + InfoQ coverage); MEDIUM for playground/copilot patterns (Microsoft, CopilotKit official guidance); MEDIUM-LOW for sharing/history UX patterns (limited authoritative sources)

---

## Scope

This research covers seven dimensions of generative UI as they apply to this milestone:

1. **Catalog/registry features** — what metadata json-render needs per component beyond what `registry.json` already has
2. **Generation modes** — standalone (full-page) vs inline/conversational vs hybrid
3. **Prompt engineering** — how good generative UI systems instruct the LLM about available components
4. **Interactive generated UIs** — state binding, form submissions, data updates in generated interfaces
5. **Code export** — how json-render exports to standalone React components
6. **Playground features** — what generative UI playgrounds typically offer
7. **Copilot patterns** — how AI copilots embed in existing apps (sidebar, inline, command palette)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Prompt → rendered UI (streaming) | Core value prop — if generation isn't instant/streaming, it feels broken | MEDIUM | json-render's `createSpecStreamCompiler()` handles streaming; wire up to Claude or GPT with `catalog.prompt()` as system prompt |
| Component catalog with Zod schemas | json-render requires Zod-validated catalog; without this, the renderer has no vocabulary | MEDIUM | Rialto's `registry.json` has `name`, `description`, `props`, `slots`, `characterLimits` — needs Zod schemas added per json-render's `defineCatalog()` API |
| Constrained generation (guardrails) | Users expect AI can't hallucinate components outside the catalog | LOW | json-render enforces this via schema validation — catalog defines the vocabulary, renderer rejects unknown elements |
| Standalone generation mode | Full-page generation from a single prompt — the "wow demo" mode | MEDIUM | json-render standalone mode: LLM outputs only JSONL patches with no conversational text; maps directly to full-page renders |
| Inline/conversational mode | Multi-turn refinement ("make the button larger", "add a table below") | HIGH | json-render inline/chat mode interleaves prose with JSONL patch operations; requires `pipeJsonRender` or `pipeYamlRender` mixers to separate responses |
| Component descriptions in catalog | LLM needs to know when to use Accordion vs Collapsible, Card vs Panel | LOW | Already have `description` in `registry.json` — must be mapped into json-render's `description` field on each catalog entry |
| Action definitions for interactive components | Buttons and forms in generated UI need wired actions (submit, setState, navigate) | MEDIUM | json-render's built-in `setState`, `pushState`, `validateForm` actions are injected automatically by `ActionProvider`; custom actions declared in catalog |
| Loading/error states for generation | Users need feedback while AI generates; errors need graceful handling | LOW | Standard streaming pattern: show skeleton or spinner during stream, surface LLM errors with retry |
| Mobile-responsive generated output | Generated UIs must work on tablets (hospitality staff use tablets at floor level) | MEDIUM | Requires responsive props in catalog component schemas — Rialto components are responsive but catalog constraints must allow responsive variants |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Rialto-constrained catalog (design system fidelity) | All generated UIs look identical to hand-authored Rialto UIs — no inconsistency | MEDIUM | json-render catalog replaces shadcn defaults with Rialto components. This is the architecture's core advantage: AI can't escape the design system. |
| Character limit enforcement in catalog | json-render can expose `characterLimits` from `registry.json` as Zod `.max()` constraints — AI respects label lengths | LOW | Rialto's `registry.json` already has `characterLimits` per prop (e.g., Button children max 30 chars). Map these to Zod `.max()` in the catalog schema — automatic prompt enforcement |
| Domain-aware prompt context (hospitality data shapes) | Catalog `customRules` in `catalog.prompt()` inject domain knowledge: reservation schema, floor plan structure, guest data | MEDIUM | json-render's `catalog.prompt({ customRules: [...] })` accepts freeform rules. Inject hospitality-specific rules: "Use ReservationCard for reservation objects, FloorPlanGrid for table layouts" |
| Hybrid mode (conversational refinement of full-page) | Start with standalone full-page generation, then refine inline via chat without starting over | HIGH | Requires persisting the spec between turns and switching from standalone to inline mode mid-session. json-render supports both modes; session management is custom work. |
| Code export via `@json-render/codegen` | "Take this generated UI and own it" — export as standalone React with no json-render runtime dependency | MEDIUM | `generateJSX()` + `collectUsedComponents()` from `@json-render/codegen` transform spec to JSX. Output uses Rialto imports, not shadcn — requires adapter. |
| Prompt history with replay | Users iterate on prompts; being able to re-run an old prompt with the current catalog is valuable for iteration | MEDIUM | Persist prompt + generated spec pairs; replay regenerates from stored prompt. Not version control — simple ordered list. |
| "Favorites" / saved generations | Users find a generated UI they like and want to save it before refining further | LOW | Store spec JSON + prompt in a saved items list; render from stored spec on demand |
| Shareable permalink to generated UI | Share a link that renders a specific stored spec — useful for hospitality staff to share a floor plan or booking widget config with colleagues | MEDIUM | Hash or UUID → stored spec lookup → server-side render from spec. Requires persistence layer (existing Prisma/Postgres). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Open-ended code generation (arbitrary HTML/CSS) | "More flexible" | Security risk (XSS), breaks design system fidelity, inconsistent styling, near-impossible to support | Use json-render's catalog constraint. AI generates JSON spec within Rialto vocabulary — guaranteed consistent output |
| Real-time collaborative editing of generated UIs | "Like Figma for AI UIs" | Multi-user spec sync is a hard distributed systems problem; conflicts in JSON patch streams are non-trivial; far exceeds this milestone scope | Single-user generation with shareable permalinks covers 90% of the collaboration need |
| LLM-generated CSS/inline styles | "Let AI customize styling" | Breaks Rialto token system, produces hardcoded hex values, can't theme, inaccessible contrast ratios | All styling is Rialto tokens. AI controls layout and component selection, not colors or spacing values |
| Unlimited component catalog | "Give AI access to everything" | More components = more prompt tokens = higher cost; LLM selection accuracy drops with large catalogs; slower generation | Curated catalog of 25-35 most composable components. Quality over quantity — `catalog.prompt()` gets expensive fast |
| Auto-deploy generated UIs to production | "Skip the developer" | Generated UIs aren't reviewed; may not meet accessibility standards; business logic may be wrong | Code export → developer review → manual deploy. Code export is the off-ramp from generated to owned. |
| Persistent UI mutations (AI edits live app state) | "Have the copilot actually change the floor plan" | Conflates UI generation with app mutation; introduces rollback requirements, audit trails, permissions problems | Copilot generates a preview/proposal; human confirms before applying to real data |
| Versioned prompt management (prompt library/hub) | "Track all our prompts" | Prompt management is a separate product category (LangSmith, Arize AX); building it here is scope creep | Use prompt history (ordered list of prior prompts in session) — simple, sufficient for the use case |

---

## Feature Dependencies

```
[Catalog: Zod schemas for all Rialto components]
    └──required by──> [json-render catalog (defineCatalog)]
    └──required by──> [Streaming generation (catalog.prompt() system prompt)]
    └──required by──> [Code export (collectUsedComponents needs typed catalog)]
    └──leverages──> [registry.json characterLimits → Zod .max() constraints]

[Streaming generation (standalone mode)]
    └──required by──> [Playground: basic prompt → UI flow]
    └──required by──> [Copilot: full-page generation]
    └──enhances──> [Hybrid mode (standalone as starting point)]

[Inline/conversational mode]
    └──required by──> [Copilot sidebar (multi-turn refinement)]
    └──required by──> [Hybrid mode (refinement phase)]
    └──requires──> [Spec persistence between turns]

[Spec persistence (stored generated specs)]
    └──required by──> [Prompt history + replay]
    └──required by──> [Favorites / saved generations]
    └──required by──> [Shareable permalinks]
    └──required by──> [Code export (export any saved spec, not just current)]

[Code export (@json-render/codegen)]
    └──requires──> [Catalog Zod schemas] (collectUsedComponents traverses typed catalog)
    └──enhances──> [Playground: "own this UI" off-ramp]

[Domain-aware prompt context]
    └──requires──> [Catalog + catalog.prompt() base] (custom rules extend the base prompt)
    └──enhances──> [Hospitality copilot] (domain rules make generation accurate for reservations/floor plans)

[Copilot sidebar embed in hospitality app]
    └──requires──> [Inline/conversational mode]
    └──requires──> [Domain-aware prompt context]
    └──enhances──> [Shareable permalink] (staff share a generated widget config)
```

### Dependency Notes

- **Catalog Zod schemas are the foundation**: Everything — streaming, code export, type inference, prompt generation — flows from having a correct `defineCatalog()` declaration. This is Phase 1 work regardless of which features launch.
- **Spec persistence unlocks three features at once**: History, favorites, and shareable permalinks all require a stored spec. Build the persistence layer once, get three features.
- **Standalone mode precedes inline mode**: Inline mode requires understanding what spec already exists and patching it. Starting with standalone (generate from scratch) is simpler to validate before adding refinement complexity.
- **Code export requires typed catalog**: `@json-render/codegen`'s `collectUsedComponents()` traverses the catalog to know what imports the exported JSX needs. Can't export correctly without a complete catalog.

---

## MVP Definition

### Launch With (v1 — Generative UI Core)

Minimum viable product — validates that AI can generate Rialto-quality UIs.

- [ ] Catalog Zod schemas for top 25 Rialto components — foundation for everything else; without this nothing works
- [ ] Standalone generation mode (prompt → full-page Rialto UI, streamed) — the core demo; proves the concept
- [ ] `catalog.prompt()` system prompt with Rialto component descriptions and character limit constraints — quality gate for generation
- [ ] Playground: basic text input + streaming renderer — the surface that proves standalone generation works
- [ ] Playground: prompt history (in-session, no persistence required yet) — lets users iterate without losing prior attempts
- [ ] Action wiring: `setState`, `validateForm` for interactive generated forms — generated forms that actually work

### Add After Validation (v1.x)

Features to add once core standalone generation is working and generating quality output.

- [ ] Inline/conversational refinement mode — enables "make the header smaller" follow-ups; requires standalone to be stable first
- [ ] Spec persistence (Prisma model for stored specs) — unlocks history replay, favorites, shareable permalinks in one schema migration
- [ ] Favorites / saved generations — depends on spec persistence; low effort once storage exists
- [ ] Shareable permalink — depends on spec persistence; medium effort (UUID route + server lookup)
- [ ] Domain-aware prompt context for hospitality — customRules injecting reservation/floor plan knowledge; depends on catalog being stable

### Future Consideration (v2+)

Features to defer until core generation is validated and used.

- [ ] Code export (@json-render/codegen) — high value but only needed once generated UIs prove worth keeping; defer until users ask "how do I own this?"
- [ ] Hybrid mode (standalone → inline mid-session) — complex session management; defer until inline mode is battle-tested
- [ ] Copilot sidebar embed in hospitality app — full copilot embed is a separate UX surface; defer until playground is mature enough to prove the generation quality

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Catalog Zod schemas (25 Rialto components) | HIGH | MEDIUM | P1 |
| Standalone generation mode (streaming) | HIGH | MEDIUM | P1 |
| `catalog.prompt()` system prompt with Rialto rules | HIGH | LOW | P1 |
| Playground: prompt input + streamed renderer | HIGH | MEDIUM | P1 |
| Action wiring (setState, validateForm) | HIGH | MEDIUM | P1 |
| Prompt history (in-session) | MEDIUM | LOW | P1 |
| Inline/conversational refinement mode | HIGH | HIGH | P2 |
| Spec persistence (Prisma storage) | HIGH | MEDIUM | P2 |
| Favorites / saved generations | MEDIUM | LOW | P2 (after persistence) |
| Shareable permalink | MEDIUM | MEDIUM | P2 (after persistence) |
| Domain-aware prompt context (hospitality rules) | HIGH | LOW | P2 |
| Code export (@json-render/codegen) | HIGH | MEDIUM | P3 |
| Hybrid mode (standalone → inline) | MEDIUM | HIGH | P3 |
| Copilot sidebar in hospitality app | HIGH | HIGH | P3 |

**Priority key:**
- P1: Must have for v1 milestone (validates core generation loop)
- P2: Add after core loop is working and generating quality output
- P3: Future milestone once generation quality is proven

---

## Detailed Feature Analysis by Research Question

### 1. Catalog/Registry Features — What Metadata json-render Needs

The existing `registry.json` has: `name`, `description`, `importPath`, `props` (name + type + required + description), `slots`, `characterLimits`.

**What json-render additionally requires:**
- **Zod schema per prop** (not TypeScript type strings — Zod validates at runtime): `z.string().max(30)` not `"string | undefined"`
- **Action definitions** declared at catalog level: which components can trigger which actions
- **`hasChildren` / slots as json-render slots**: map existing `slots[]` to json-render's `slots` array
- **Component-level usage guidance** in `description`: current descriptions are component-centric ("a grouped set of collapsible panels"); need usage-centric additions ("use when content sections can be collapsed independently; prefer over Tab for 3+ sections")
- **Character limits as Zod constraints**: `characterLimits[].max` maps directly to `z.string().max(n)` in the Zod schema

**What to NOT add to the catalog:**
- All 91 components — curate to ~25-30 composable primitives. Layout components (Stack, Grid), content components (Card, Text, Badge, Alert, DataList), form components (Input, Select, Toggle, Checkbox, Button), navigation (Tabs, Breadcrumb), feedback (Toast, Dialog, ConfirmDialog).
- Internal/wrapper components (AccordionItem, BreadcrumbItem, ContextMenuEntry) — these are sub-components used inside parent; only register the parent in the catalog.

**Confidence: HIGH** — from direct json-render docs inspection.

### 2. Generation Modes

json-render defines two distinct modes:

**Standalone mode**: LLM outputs only JSONL patches (RFC 6902 format). No conversational text. Suited for: full-page generation from a single prompt, playground demos, "generate a dashboard for hotel check-ins."

**Inline/chat mode**: LLM interleaves natural language with JSONL patches. Requires `pipeJsonRender` or `pipeYamlRender` mixers to separate prose from spec operations. Suited for: conversational refinement, copilot sidebar in hospitality app, multi-turn editing.

**Hybrid**: Start with standalone, persist the spec, continue with inline refinement. Custom session management required — json-render supports both modes but switching between them mid-session is application-level work.

**Recommendation**: Build standalone first. It's simpler (no mixer required, no session state), easier to test, and proves the catalog/prompt quality. Add inline mode once standalone generates acceptable output.

**Confidence: HIGH** — from DeepWiki json-render architecture docs.

### 3. Prompt Engineering — How to Instruct the LLM

`catalog.prompt()` generates a system prompt that includes:
1. JSON Schema representation of all component props (converted from Zod)
2. Component names and descriptions
3. Available actions and their parameters
4. Custom rules (injected via `customRules` parameter)

**What makes generative UI prompt engineering effective** (from research):
- **Component descriptions must be usage-oriented**, not feature-oriented: "Use DataList for key-value pairs in a detail view; use DataTable for tabular data with multiple rows and sortable columns" — not "DataList renders a list of items"
- **Explicit negative rules** in `customRules`: "Never use Avatar without a name prop. Never nest Card inside Card. Always use ConfirmDialog for destructive actions, not Dialog."
- **Domain context as custom rules**: For hospitality, inject: "When displaying reservation data, use ReservationCard. When displaying floor plan data, use FloorPlanGrid. Guest names are always first + last name format."
- **Character limit enforcement**: Mapping `characterLimits` to Zod `.max()` means the schema itself enforces limits — the LLM sees them in the JSON Schema output and respects them.

**What to avoid in the system prompt**:
- Don't dump all 91 components — token cost scales with catalog size; accuracy drops with too many choices
- Don't include raw TypeScript type strings — json-render converts Zod to JSON Schema for the prompt; use Zod, not TypeScript interfaces

**Confidence: HIGH** for json-render mechanics; MEDIUM for best practice composition rules (from practitioner sources).

### 4. Interactive Generated UIs — State Binding and Forms

json-render's React schema provides built-in state management primitives:
- **`setState`**: Updates shared state by key. AI can wire a Button's `onClick` action to `setState({ key: "activeTab", value: "reservations" })`
- **`pushState`**: Appends to an array in state (e.g., adding an item to a list)
- **`removeState`**: Removes from state by key
- **`validateForm`**: Triggers form validation and calls a registered submit handler

These are injected into AI prompts automatically by `ActionProvider` without needing to be declared in catalog actions. Custom actions (navigate to a page, call an API endpoint) must be declared in the catalog.

**For hospitality app integration**: Generated booking widgets and floor plan views need custom actions beyond built-in state: `submitReservation`, `updateTableStatus`, `assignGuest`. These would be declared as catalog actions with Zod parameter schemas, registered in the `ActionProvider`, and the LLM can call them from generated button components.

**The security boundary**: State binding operates within the generated UI surface. The LLM cannot access app-level React state outside the json-render boundary. Application data flows in via props; generated UI actions flow out via registered action handlers. This is the correct separation.

**Confidence: HIGH** — from json-render official docs and LogRocket analysis.

### 5. Code Export — `@json-render/codegen`

The `@json-render/codegen` package provides:
- **`generateJSX(spec)`**: Converts a stored JSON spec into React/JSX code
- **`collectUsedComponents(spec, catalog)`**: Identifies which catalog components the spec uses — drives the import statements in the output

**Output format**: Standalone React component files with proper imports from `@mbe/rialto` (not shadcn — requires that the catalog is built on Rialto, not the default shadcn components). Exported code has zero json-render runtime dependencies.

**What the exported code looks like**: A React functional component that hardcodes the layout, uses Rialto imports, has static prop values (no AI, no json-render). The developer can then wire in real data, add routing, add tests.

**The "off-ramp" mental model**: Code export is for when a generated UI proves useful enough to graduate from AI-maintained to developer-maintained. It's not the primary use case — most generated UIs are ephemeral (used once, discarded). Export is for the ones worth keeping.

**Confidence: HIGH** for capability; MEDIUM for Rialto-specific output (requires custom adapter, not documented).

### 6. Playground Features

Based on research across json-render's own playground, CopilotKit's generative UI playground, and Microsoft's collaborative UX guidance:

**Table stakes for a generative UI playground**:
- Prompt text input with submission (Enter or button)
- Streaming rendered output (components appear as JSON streams)
- Prompt history (in-session) — lets users try variations without losing prior results
- Clear/reset action (start fresh without reloading)
- Error state with retry (LLM failures happen; user should not see raw errors)

**Differentiating playground features**:
- Split pane: prompt/chat on left, rendered output on right — lets user see prompt and result simultaneously
- Spec inspector: collapsible JSON view of the generated spec — useful for developers debugging catalog issues
- Favorites: star a generation to save it; view saved generations list
- Shareable link: copy URL that renders a specific saved spec
- "Export as React" button: triggers code export for the current spec

**Anti-features for the playground**:
- Live component prop editor (knobs) — conflicts with AI-generated approach; if you're editing props manually, use Rialto showcase instead
- Model selector — adds UI complexity; pick one model (Claude) and optimize for it
- Prompt templates library — scope creep; prompt history + domain-aware defaults cover 90% of the need

**Confidence: MEDIUM** — synthesized from Microsoft collaborative UX docs, CopilotKit playground, and json-render playground docs.

### 7. Copilot Patterns — Embedding in Existing Apps

Microsoft's framework identifies three embed patterns (from official ISV UX guidance):

**Embedded (single entity)**: Minimal footprint, contextual. Example: inline "Generate booking widget" button in the hospitality floor plan editor. Triggered from context (right-click, hover button, inline icon). Best for: occasional guidance, single-action interactions.

**Assistive (sidebar)**: Side panel with full chat interface. User keeps the main app visible. Best for: ongoing tasks, multi-turn refinement. Example: "Hospitality Copilot" sidebar where staff describe what UI they need for tonight's event layout.

**Immersive (full canvas)**: Full-page AI experience. Best for: complex generation tasks, report generation. The standalone playground is this pattern.

**Recommendation for hospitality app**: Start with embedded pattern (a "Generate with AI" button in specific contexts like FloorPlanEditorPage and BookingWidgetDemoPage). This requires less infrastructure than a sidebar, proves value in context, and defers the full sidebar to v2. The sidebar pattern requires inline/conversational mode to be mature.

**Key UX requirements for copilot embeds** (from Microsoft HAX guidelines):
- Show generation suggestions (starter prompts) on first open — "I can generate a seating chart for up to 50 guests. Try: 'Create a floor plan for a wedding reception of 40'"
- Keep prompt + output history visible together — tight feedback loop
- Add friction at "apply to app" moments — generated outputs should require confirmation before mutating real data
- Allow editing generated output before applying — human stays the pilot
- Provide feedback mechanism (thumbs up/down) — improves generation quality over time

**Confidence: HIGH** for Microsoft's three-pattern framework; MEDIUM for hospitality-specific recommendations.

---

## Competitor/Reference Analysis

| Feature | json-render (Vercel) | CopilotKit | Tambo | Our Approach |
|---------|---------------------|------------|-------|--------------|
| Component catalog | Zod schemas + `defineCatalog()` | Predefined component set | Component registry | Rialto components via `defineCatalog()` |
| Generation mode | Standalone + inline/chat | Chat-first | Chat-first | Standalone first, then inline |
| Design system fidelity | shadcn defaults | Custom | Custom | Rialto (primary differentiator) |
| State management | Built-in (setState, validateForm) | Hook-based | Hook-based | json-render built-ins + custom hospitality actions |
| Code export | `@json-render/codegen` | No | No | `@json-render/codegen` adapted for Rialto |
| Streaming | Yes (progressive rendering) | Yes | Yes | Yes (json-render core) |

---

## Sources

- [json-render official docs — Catalog](https://json-render.dev/docs/catalog) — HIGH confidence (official docs, direct inspection)
- [json-render DeepWiki architecture](https://deepwiki.com/vercel-labs/json-render) — HIGH confidence (comprehensive architecture analysis)
- [Vercel json-render GitHub](https://github.com/vercel-labs/json-render) — HIGH confidence (official source)
- [InfoQ: Vercel Releases JSON-Render](https://www.infoq.com/news/2026/03/vercel-json-render/) — HIGH confidence (March 2026 coverage)
- [LogRocket: json-render dynamic UI](https://blog.logrocket.com/vercel-json-render-dynamic-ui/) — MEDIUM confidence (verified against official docs)
- [Microsoft ISV UX Guidance for Copilot](https://learn.microsoft.com/en-us/microsoft-cloud/dev/copilot/isv/ux-guidance) — HIGH confidence (Microsoft official, HAX toolkit)
- [CopilotKit: Developer's Guide to Generative UI 2026](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026) — MEDIUM confidence (practitioner guide, CopilotKit-biased)
- [Vercel AI SDK: Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces) — HIGH confidence (official Vercel docs)
- [Roger Wong: Generative UI and the Ephemeral Interface](https://rogerwong.me/2025/11/generative-ui-and-the-ephemeral-interface) — MEDIUM confidence (practitioner analysis)
- [Google A2UI Protocol](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/) — HIGH confidence (Google official blog)
- Existing codebase: `packages/rialto/registry.json`, `apps/hospitality/src/pages/`, `services/agent/` — HIGH confidence (direct inspection)

---

*Feature research for: Generative UI milestone — AI-powered interface generator on Rialto design system*
*Researched: 2026-03-27*
