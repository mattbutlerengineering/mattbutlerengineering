# Roadmap: mattbutlerengineering

## Milestones

- ✅ **v1.0 Rialto Unification & Hosting** — Phases 1-5 (shipped 2026-03-04)
- ✅ **v1.1 Rialto Accessibility & AI DX** — Phases 6-11 (shipped 2026-03-23)
- 🚧 **v1.2 Generative UI** — Phases 12-16 (in progress)

## Phases

<details>
<summary>✅ v1.0 Rialto Unification & Hosting (Phases 1-5) — SHIPPED 2026-03-04</summary>

- [x] Phase 1: Rialto-Web Migration (3/3 plans) — completed 2026-02-28
- [x] Phase 2: Dashboard Rename (2/2 plans) — completed 2026-02-28
- [x] Phase 3: Marketing Portfolio (2/2 plans) — completed 2026-02-28
- [x] Phase 4: Hospitality Migration + Full Hosting (5/5 plans) — completed 2026-03-04
- [x] Phase 5: Retroactive Verification & Gap Closure (2/2 plans) — completed 2026-03-04

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Rialto Accessibility & AI DX (Phases 6-11) — SHIPPED 2026-03-23</summary>

- [x] Phase 6: Accessibility Foundation (5/5 plans) — completed 2026-03-23
- [x] Phase 7: Example Pages (3/3 plans) — completed 2026-03-23
- [x] Phase 8: AI Developer Experience (3/3 plans) — completed 2026-03-23
- [x] Phase 9: Polish and Documentation (3/3 plans) — completed 2026-03-23
- [x] Phase 10: Documentation Reconciliation & llms-full.txt Fix (1/1 plan) — completed 2026-03-23
- [x] Phase 11: Registry Props & Phase 08 Verification (2/2 plans) — completed 2026-03-23

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### 🚧 v1.2 Generative UI (In Progress)

**Milestone Goal:** AI-powered interface generation using Rialto components — from natural language prompts to rendered, interactive UIs. Delivered via a standalone playground app at /gen and an embedded copilot in the hospitality app.

- [x] **Phase 12: Catalog Foundation** — Zod schemas for ~25 Rialto components, CI drift check, action declarations, and the client/server split that every downstream feature depends on (completed 2026-03-28)
- [x] **Phase 13: AI Generation Endpoint** — Streaming generation routes in services/agent with auth, rate limiting, prompt caching, cost logging, and SSE verified through the CF edge router; plus all supporting infrastructure (completed 2026-03-28)
- [x] **Phase 14: Playground App** — Vite SPA at /gen with prompt bar, streaming preview, JSON inspector, prompt history, and theme-aware rendering (completed 2026-03-28)
- [x] **Phase 15: Hospitality Copilot** — GenCopilot component embedded in the hospitality dashboard with domain-aware prompt context for reservations and floor plans (can run in parallel with Phase 14) (completed 2026-03-28)
- [x] **Phase 16: Persistence and Refinement** — Spec storage, prompt history replay, favorites, shareable permalinks, and inline conversational refinement mode (completed 2026-03-28)

## Phase Details

### Phase 12: Catalog Foundation
**Goal**: The rialto-catalog package exists with correct Zod schemas for ~25 Rialto components, a CI check that prevents catalog drift, and all action declarations — establishing the client/server split that everything else depends on
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06
**Success Criteria** (what must be TRUE):
  1. `pnpm build` succeeds across all workspace packages after the Zod v4 upgrade with no type errors in existing schemas
  2. `packages/rialto-catalog` exports a `defineCatalog()` with Zod schemas covering ~25 Rialto components and passes its own test suite
  3. `catalog.prompt()` returns a system prompt string that includes component descriptions and character limit constraints derived from the Zod schemas
  4. The CI drift check fails when a catalog schema is manually edited to diverge from the Rialto TypeScript prop interface, and passes when they match
  5. The catalog includes `setState`, `validateForm`, and `navigate` action declarations that can be referenced in generated specs
**Plans:** 3/3 plans complete

Plans:
- [ ] 12-01-PLAN.md — Zod v4 upgrade and rialto-catalog package scaffold
- [ ] 12-02-PLAN.md — Schema generation pipeline, defineCatalog(), actions, CI drift check
- [ ] 12-03-PLAN.md — Client-side defineRegistry() mapping

### Phase 13: AI Generation Endpoint
**Goal**: Two streaming generation routes exist in services/agent — one for standalone spec generation and one for conversational mode — secured with Auth0 JWT, rate limited per user, prompt-cached, cost-logged, and verified end-to-end through the CF Worker edge router; supporting infrastructure (edge routing, Pulumi resources, API keys) is fully in place
**Depends on**: Phase 12
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05, GEN-06, GEN-07, GEN-08, INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. `curl -X POST https://api.mattbutlerengineering.com/api/gen/ui` without an Authorization header returns 401; with a valid Auth0 JWT it returns a streaming JSONL response
  2. A second identical request to `/api/gen/ui` logs `cache_read_input_tokens > 0`, confirming prompt caching is active on the catalog system prompt
  3. Each generation request logs the model used, total tokens, and cache read tokens to the service log output
  4. SSE chunks arrive progressively in the browser DevTools Network tab (chunked incremental delivery, not one completed response) when routed through the CF edge router
  5. The `/gen` path is routed by the edge router to the gen app Static Assets worker via a Service Binding, and the Pulumi resource for the gen app CF Worker exists in the stack
**Plans:** 3/3 plans complete

Plans:
- [ ] 13-01-PLAN.md — Streaming gen-ui and gen-chat routes with auth, rate limiting, prompt caching, cost logging
- [ ] 13-02-PLAN.md — Agent service Dockerfile, Pulumi deployment, CI workflow, GEN Service Binding
- [ ] 13-03-PLAN.md — Production SSE verification and Anthropic spend cap checkpoint

### Phase 14: Playground App
**Goal**: A standalone Vite SPA at /gen lets authenticated users type natural language prompts and watch Rialto components render progressively as the AI streams a JSON spec; the app shows the raw spec, remembers prompts within the session, and respects the current theme
**Depends on**: Phase 13
**Requirements**: PLAY-01, PLAY-02, PLAY-03, PLAY-04, PLAY-05, PLAY-06, PLAY-07
**Note**: Can be developed in parallel with Phase 15 (Hospitality Copilot) once Phase 13 is complete
**Success Criteria** (what must be TRUE):
  1. Navigating to mattbutlerengineering.com/gen redirects unauthenticated users to login and renders the playground for authenticated users
  2. Typing a prompt and submitting shows a spinner immediately, then Rialto components appear progressively in the preview pane as the JSONL stream arrives — the page does not wait for the full response
  3. The JSON spec inspector panel shows the raw generated spec updating in real time alongside the rendered preview
  4. Prompts submitted during a session appear in a history list; navigating away and back within the same session preserves the history; logging out clears it
  5. When the app is in dark mode, generated UIs render with dark theme tokens; when in light mode, they render with light theme tokens
**Plans:** 3/3 plans complete

Plans:
- [ ] 14-01-PLAN.md — App scaffold with auth, theme context, and useGenStream streaming hook
- [ ] 14-02-PLAN.md — Three-column playground UI (history, preview, JSON inspector, prompt bar)
- [ ] 14-03-PLAN.md — CI/CD deploy job, edge router /gen route, Pulumi GEN binding + verification checkpoint

### Phase 15: Hospitality Copilot
**Goal**: A GenCopilot component is embedded in the hospitality app dashboard; authenticated users can open it, enter a prompt with hospitality-specific context (reservation schema, floor plan structure, guest data shapes), and see generated Rialto UI rendered inline within the app
**Depends on**: Phase 13
**Requirements**: COP-01, COP-02, COP-03, COP-04
**Note**: Can be developed in parallel with Phase 14 (Playground App) once Phase 13 is complete
**Success Criteria** (what must be TRUE):
  1. The hospitality dashboard contains a visible GenCopilot entry point that opens an embedded generation panel without navigating away from the app
  2. A prompt referencing hospitality domain concepts (e.g., "show reservations for table 5") produces a generated UI that uses reservation and floor plan field names from the actual data schema
  3. Generated Rialto components render inside the hospitality app layout using the same theme and design tokens as the surrounding app — no visual mismatch
  4. The GenCopilot component is importable from `@mbe/rialto` and renders without errors when mounted in any Rialto-themed app
**Plans:** 1/1 plans complete

Plans:
- [ ] 15-01-PLAN.md — GenCopilot component in @mbe/rialto + hospitality dashboard integration

### Phase 16: Persistence and Refinement
**Goal**: Generated specs are stored in the database; users can replay past prompts, save favorites, share UIs via permalink, and refine a generated UI conversationally without starting over
**Depends on**: Phase 14, Phase 15
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, PERS-05
**Success Criteria** (what must be TRUE):
  1. A Prisma migration adds the stored spec model and applies cleanly in both development and production environments
  2. Selecting a past prompt from the history list re-runs the generation with the same prompt, producing a new streaming result
  3. A user can mark a generated UI as a favorite and see it in a saved list that persists across sessions
  4. Copying a shareable permalink URL and opening it in a fresh browser session loads the exact stored spec without requiring the original prompt to be re-run
  5. Typing a refinement instruction ("make the button larger") in conversational mode applies a patch to the existing spec rather than regenerating from scratch — the preview updates to reflect only the changed element
**Plans:** 3/3 plans complete

Plans:
- [ ] 16-01-PLAN.md — StoredSpec Prisma model, service layer, and REST API endpoints
- [ ] 16-02-PLAN.md — API-backed history panel with auto-save, replay, and favorites
- [ ] 16-03-PLAN.md — Shareable permalink page and conversational refinement mode

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Rialto-Web Migration | v1.0 | 3/3 | Complete | 2026-02-28 |
| 2. Dashboard Rename | v1.0 | 2/2 | Complete | 2026-02-28 |
| 3. Marketing Portfolio | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. Hospitality Migration + Full Hosting | v1.0 | 5/5 | Complete | 2026-03-04 |
| 5. Retroactive Verification & Gap Closure | v1.0 | 2/2 | Complete | 2026-03-04 |
| 6. Accessibility Foundation | v1.1 | 5/5 | Complete | 2026-03-23 |
| 7. Example Pages | v1.1 | 3/3 | Complete | 2026-03-23 |
| 8. AI Developer Experience | v1.1 | 3/3 | Complete | 2026-03-23 |
| 9. Polish and Documentation | v1.1 | 3/3 | Complete | 2026-03-23 |
| 10. Documentation Reconciliation | v1.1 | 1/1 | Complete | 2026-03-23 |
| 11. Registry Props & Verification | v1.1 | 2/2 | Complete | 2026-03-23 |
| 12. Catalog Foundation | v1.2 | 3/3 | Complete | 2026-03-28 |
| 13. AI Generation Endpoint | v1.2 | 3/3 | Complete | 2026-03-28 |
| 14. Playground App | v1.2 | 3/3 | Complete | 2026-03-28 |
| 15. Hospitality Copilot | v1.2 | 1/1 | Complete | 2026-03-28 |
| 16. Persistence and Refinement | 3/3 | Complete    | 2026-03-28 | - |
