---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Generative UI
status: completed
stopped_at: Completed 16-03-PLAN.md
last_updated: "2026-03-28T17:38:28.975Z"
last_activity: 2026-03-28 — Completed 16-03 (Shareable permalinks + refinement mode for Gen Playground)
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** v1.2 Generative UI — Phase 12 complete (all 3 plans done), Phase 13 complete (all 3 plans done, pulumi up + spend cap pending user action), Phase 14 complete (all 3 plans done)

## Current Position

Phase: 16 of 16 (Persistence and Refinement) — Complete (3 of 3 plans done)
Plan: 03 complete (SharedSpecPage permalink, Share button, refinement mode, PromptBar mode toggle)
Status: Phase 16 complete — all plans done
Last activity: 2026-03-28 — Completed 16-03 (Shareable permalinks + refinement mode for Gen Playground)

Progress: [██████████] 100%

Last session: 2026-03-28T17:41:00Z
Stopped at: Completed 16-03-PLAN.md

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 7.8 min
- Total execution time: 31 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 12-catalog-foundation | 3 | 19 min | 6.3 min |
| 13-ai-generation-endpoint | 1 | 12 min | 12 min |

*Updated after each plan completion*
| Phase 13-ai-generation-endpoint P01 | 5 | 2 tasks | 8 files |
| Phase 14-playground-app P01 | 18 | 2 tasks | 15 files |
| Phase 14-playground-app P02 | 6 | 2 tasks | 15 files |
| Phase 14-playground-app P03 | 2 | 1 tasks | 3 files |
| Phase 14-playground-app P03 | 15 | 2 tasks | 5 files |
| Phase 15-hospitality-copilot P01 | 22 | 2 tasks | 13 files |
| Phase 16-persistence-and-refinement P01 | 3 | 2 tasks | 8 files |
| Phase 16-persistence-and-refinement P02 | 3 | 2 tasks | 6 files |
| Phase 16-persistence-and-refinement P03 | 226 | 2 tasks | 8 files |

## Accumulated Context

### Decisions

v1.2 decisions (see PROJECT.md Key Decisions for full log):
- json-render selected as generative UI framework
- AI SDK + Anthropic Direct selected as AI provider
- Haiku 4.5 as default generation model (~$0.001/gen with prompt caching)
- INFRA requirements bundled with Phase 13 (SSE verification requires full pipeline)
- Phases 14 and 15 can run in parallel after Phase 13 is complete

Phase 12 Plan 01 decisions:
- Zod v4 enforced via pnpm workspace catalog — single source of truth for version across all workspace packages
- z.url() used instead of deprecated z.string().url() in Zod v4 (only breaking change found)
- rialto-catalog tsconfig extends @mbe/config/typescript/base with jsx: react-jsx added for React component support
- [Phase 12-catalog-foundation]: isDeclaredInRialto() filter — only extract props from Rialto source files, not inherited HTML/ARIA attrs from React types
- [Phase 12-catalog-foundation]: Toast hardcoded as HARDCODED_SCHEMA_LINES since ToastInput is not barrel-exported (Omit type alias)
- [Phase 12-catalog-foundation]: any-typed render functions in registry — TypeScript cannot infer specific prop types through catalog generics; Zod schemas in catalog provide runtime validation
- [Phase 12-catalog-foundation]: Toast excluded from registry — useToast() hook pattern incompatible with declarative JSON spec rendering
- [Phase 12-catalog-foundation]: DOM lib added to rialto-catalog tsconfig — registry.tsx is browser-side and tests use DOM APIs

Phase 13 Plan 02 decisions:
- [Phase 13-02]: rialto-catalog excluded from agent Dockerfile — actual package.json has no rialto-catalog dependency (only agent-core and types)
- [Phase 13-02]: GEN Service Binding commented in Pulumi — activating before Phase 14 deploys the Worker would cause Pulumi error (target not found)
- [Phase 13-02]: DEFAULT_MODEL set to anthropic/claude-haiku-4.5 for cost-optimized generation
- [Phase 13-02]: migrate/Dockerfile updated to include agent Prisma schema for when migrations are created
- [Phase 13-ai-generation-endpoint]: AI SDK v6 uses inputTokens/outputTokens (not promptTokens/completionTokens) for LanguageModelUsage
- [Phase 13-ai-generation-endpoint]: Import @mbe/rialto-catalog/catalog subpath (not index) from NodeNext services to avoid browser-only registry.tsx
- [Phase 13-ai-generation-endpoint]: ReadableStream mock in Fastify inject tests must close immediately (controller.close()) to prevent timeout

Phase 13 Plan 03 decisions:
- [Phase 13-03]: Production verification deferred — agent-api not yet in DO App Platform (pulumi up not run after 13-02 commits)
- [Phase 13-03]: Anthropic spend cap (INFRA-04) is a manual action in Anthropic console — cannot be automated, blocked on user action
- [Phase 13-03]: SSE passthrough architecture confirmed correct (edge router returns fetch() directly for /api/*) — will work once service is live
- [Phase 14-01]: FlatElement type derived from Parameters<typeof flatToTree>[0][number] — avoids direct @json-render/core dependency in apps/gen
- [Phase 14-01]: ThemedApp bridge pattern: ThemeProvider ancestor of RialtoProvider, bridge reads useTheme() and passes controlled theme prop
- [Phase 14-01]: AbortError in useGenStream caught silently — preserves partial spec on stop(), no error state set
- [Phase 14-playground-app]: Rialto Button has no danger variant — Stop button uses secondary+CSS data-stop override for error color
- [Phase 14-playground-app]: handlers from defineRegistry is a factory fn — omitted from JSONUIProvider since playground is render-only
- [Phase 14-playground-app]: rawLinesRef sync moved to useEffect (no-dep) — avoids react-hooks/refs lint error, same semantic for onComplete
- [Phase 14-playground-app]: [14-03]: GEN Service Binding uncommented — apps/gen wrangler.toml created in 14-02, Worker can now be deployed
- [Phase 14-playground-app]: [14-03]: wrangler deploy must run before pulumi up — Worker must exist before Service Binding can reference it
- [Phase 14-playground-app]: [14-03]: Auth0 gen URLs added to shared auth0.ts alongside hospitality; gen app can share or get its own CLIENT_ID via AUTH0_GEN_CLIENT_ID secret

Phase 15 Plan 01 decisions:
- [Phase 15-01]: GenCopilot uses relative imports for Alert/Skeleton/Button sub-components — importing from @mbe/rialto barrel would create circular dep inside the library
- [Phase 15-01]: useGenCopilotStream accepts getAccessToken prop not useAuth() — @mbe/rialto must remain auth-provider-agnostic, no dep on @mbe/auth
- [Phase 15-01]: GenCopilot has no open prop — Drawer always open={true}, consumer uses conditional mount ({copilotOpen && <GenCopilot>}) for fresh state on every open
- [Phase 15-01]: ComponentRegistry from @json-render/react as registry type — consumer passes registry from @mbe/rialto-catalog, no circular dep rialto↔rialto-catalog
- [Phase 16-persistence-and-refinement]: [16-01]: StoredSpec _enforceCapForUser evicts oldest unfavorited spec when count reaches 100 — keeps favorites safe while bounding storage per user
- [Phase 16-persistence-and-refinement]: [16-01]: GET /api/gen/specs/:id has no preHandler (public) for permalink sharing
- [Phase 16-persistence-and-refinement]: [16-01]: mapStoredSpec helper converts Prisma dates to ISO strings at service boundary — consistent with mapPrismaSession pattern
- [Phase 16-persistence-and-refinement]: [16-02]: accumulatedRawLines local array in useGenStream send() avoids stale React state closure — rawLines passed to onComplete from local variable not useState
- [Phase 16-persistence-and-refinement]: [16-02]: useSpecsApi deleteSpec captures previous specs in closure before optimistic removal — enables correct revert on error
- [Phase 16-persistence-and-refinement]: [16-02]: PlaygroundPage no longer needs rawLinesRef — rawLines now flow from useGenStream onComplete second argument directly to saveSpec
- [Phase 16-persistence-and-refinement]: [16-02]: HistoryPanel filter tabs use plain buttons with CSS not Rialto Tabs — Rialto Tabs component does not exist
- [Phase 16]: [16-03]: Refinement uses /api/gen/ui not /api/gen/chat — embeds spec as JSON context in prompt, reuses JSONL streaming pipeline
- [Phase 16]: [16-03]: isSharedSpec check bypasses auth gate for /gen/s/ paths before isAuthenticated check
- [Phase 16]: [16-03]: useState initial value computed from route param to avoid synchronous setState in useEffect (react-hooks/set-state-in-effect)

### Pending Todos

None.

### Blockers/Concerns

- **Phase 12:** ~~How to automate Zod catalog schema generation~~ — RESOLVED in Plan 02 via TypeScript Compiler API isDeclaredInRialto() filter
- **Phase 13:** Vercel AI Gateway model string routing via `AI_GATEWAY_API_KEY` in DO App Platform is confirmed in docs but untested in practice — verify before treating as resolved
- **Phase 13:** ~~User must set Pulumi secret `aiGatewayApiKey` before running `pulumi up`~~ — documented in 13-03 SUMMARY, still pending user action
- **Phase 13 [BLOCKING USER ACTION]:** `pulumi up` must be run from `infrastructure/pulumi/` to deploy agent-api to DO App Platform; Anthropic spend cap must be set at https://console.anthropic.com/settings/limits
- **Phase 16:** `pipeJsonRender` mixing of prose and JSONL patch streams has limited documentation — plan for hands-on experimentation

## Session Continuity

Last session: 2026-03-28T17:26:04Z
Stopped at: Completed 16-02-PLAN.md
