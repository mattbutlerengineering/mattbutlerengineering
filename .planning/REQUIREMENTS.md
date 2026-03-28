# Requirements: mattbutlerengineering

**Defined:** 2026-03-27
**Core Value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com

## v1.2 Requirements

Requirements for Generative UI milestone. Each maps to roadmap phases.

### Catalog

- [x] **CAT-01**: Zod v4 upgrade across all services and packages without breaking existing schemas
- [x] **CAT-02**: `packages/rialto-catalog` package with `defineCatalog()` containing Zod schemas for ~25 Rialto components
- [x] **CAT-03**: `defineRegistry()` mapping catalog component types to Rialto React components
- [x] **CAT-04**: `catalog.prompt()` generates a system prompt with usage-oriented descriptions and character limit constraints
- [x] **CAT-05**: CI check that fails if committed catalog schemas drift from Rialto TypeScript prop interfaces
- [x] **CAT-06**: Catalog includes action declarations for `setState`, `validateForm`, and `navigate`

### Generation Backend

- [x] **GEN-01**: `POST /api/gen/ui` endpoint streams JSONL spec patches via SSE (standalone mode)
- [x] **GEN-02**: `POST /api/gen/chat` endpoint streams text + JSONL via SSE (conversational mode)
- [x] **GEN-03**: Auth0 JWT authentication required on all generation endpoints
- [x] **GEN-04**: Per-user rate limiting by Auth0 `sub` claim
- [x] **GEN-05**: Anthropic prompt caching configured with `cache_control` on catalog system prompt
- [x] **GEN-06**: Cost logging — `cache_read_input_tokens`, total tokens, and model used per request
- [x] **GEN-07**: SSE streaming verified end-to-end through CF Worker edge router to browser
- [x] **GEN-08**: Model selection — Haiku 4.5 for simple prompts, Sonnet 4.6 for complex (user-selectable or auto)

### Playground App

- [x] **PLAY-01**: `apps/gen` Vite SPA served at `/gen` with Auth0 login
- [x] **PLAY-02**: Prompt bar for natural language input with submit action
- [x] **PLAY-03**: Streaming preview pane that renders Rialto components progressively as JSONL arrives
- [x] **PLAY-04**: JSON spec inspector showing the raw generated spec
- [x] **PLAY-05**: In-session prompt history (survives page navigation, clears on logout)
- [x] **PLAY-06**: Loading and error states for generation (spinner during TTFT, error display on failure)
- [x] **PLAY-07**: Theme-aware rendering (generated UIs respect current light/dark mode)

### Hospitality Copilot

- [x] **COP-01**: `<GenCopilot>` component in `packages/rialto` with embedded generation panel
- [x] **COP-02**: Integration into hospitality app dashboard layout
- [x] **COP-03**: Domain-aware prompt context (reservation schema, floor plan structure, guest data shapes)
- [x] **COP-04**: Generated UIs render inline within the hospitality app using Rialto components

### Persistence

- [x] **PERS-01**: Prisma model for stored specs (prompt, spec JSON, user ID, timestamps)
- [x] **PERS-02**: Prompt history replay — user can re-run previous prompts
- [x] **PERS-03**: Favorites — user can save/unsave generated UIs
- [ ] **PERS-04**: Shareable permalink — UUID-based URL that loads a stored spec
- [ ] **PERS-05**: Inline/conversational refinement mode ("make the button larger" applies patches to existing spec)

### Infrastructure

- [x] **INFRA-01**: CF Worker edge router gains `/gen*` route and GEN Service Binding
- [ ] **INFRA-02**: Pulumi resource for gen app CF Worker with Static Assets
- [x] **INFRA-03**: `AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY` configured in DO App Platform
- [x] **INFRA-04**: Hard monthly spend cap configured in Anthropic console

## Future Requirements

Deferred to v1.3+. Tracked but not in current roadmap.

### Code Export

- **EXPORT-01**: Export generated UI as standalone React component with Rialto imports
- **EXPORT-02**: `collectUsedComponents()` for tree-shaking exports to only used components

### Advanced Copilot

- **ACOP-01**: Full sidebar copilot pattern in hospitality app (assistive mode)
- **ACOP-02**: Hybrid mode — switch between standalone and conversational mid-session
- **ACOP-03**: Copilot in marketing and rialto-web apps

## Out of Scope

| Feature | Reason |
|---------|--------|
| Open-ended HTML/CSS generation | XSS risk, breaks design system fidelity |
| LLM-generated inline styles | Breaks Rialto token system |
| Auto-deploy generated UIs | No human review gate |
| Public unauthenticated playground | Cost/abuse risk; auth required |
| npm-publishable catalog package | Monorepo-only; external distribution is future |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAT-01 | Phase 12 | Complete |
| CAT-02 | Phase 12 | Complete |
| CAT-03 | Phase 12 | Complete |
| CAT-04 | Phase 12 | Complete |
| CAT-05 | Phase 12 | Complete |
| CAT-06 | Phase 12 | Complete |
| GEN-01 | Phase 13 | Complete |
| GEN-02 | Phase 13 | Complete |
| GEN-03 | Phase 13 | Complete |
| GEN-04 | Phase 13 | Complete |
| GEN-05 | Phase 13 | Complete |
| GEN-06 | Phase 13 | Complete |
| GEN-07 | Phase 13 | Complete |
| GEN-08 | Phase 13 | Complete |
| INFRA-01 | Phase 13 | Complete |
| INFRA-02 | Phase 13 | Pending |
| INFRA-03 | Phase 13 | Complete |
| INFRA-04 | Phase 13 | Complete |
| PLAY-01 | Phase 14 | Complete |
| PLAY-02 | Phase 14 | Complete |
| PLAY-03 | Phase 14 | Complete |
| PLAY-04 | Phase 14 | Complete |
| PLAY-05 | Phase 14 | Complete |
| PLAY-06 | Phase 14 | Complete |
| PLAY-07 | Phase 14 | Complete |
| COP-01 | Phase 15 | Complete |
| COP-02 | Phase 15 | Complete |
| COP-03 | Phase 15 | Complete |
| COP-04 | Phase 15 | Complete |
| PERS-01 | Phase 16 | Complete |
| PERS-02 | Phase 16 | Complete |
| PERS-03 | Phase 16 | Complete |
| PERS-04 | Phase 16 | Pending |
| PERS-05 | Phase 16 | Pending |

**Coverage:**
- v1.2 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-27 — traceability updated with Phase 12-16 assignments*
