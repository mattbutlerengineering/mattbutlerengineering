# Milestones

## v1.6 Continuous Verification & DevEx (Shipped: 2026-04-05)

**Phases completed:** 0 phases, 0 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v1.2 Generative UI (Shipped: 2026-03-28)

**Delivered:** AI-powered interface generation using Rialto components — from natural language prompts to rendered, interactive UIs via a standalone playground at /gen and an embedded copilot in the hospitality app.

**Stats:**
- Phases: 12-18 (15 plans)
- Commits: 79
- Files modified: 155 (+18,858 / -268)
- Codebase: 100,402 LOC TypeScript
- Timeline: 2 days (2026-03-27 → 2026-03-28)
- Git range: docs(12)..docs(phase-18)
- Requirements: 34/34 satisfied

**Key accomplishments:**
1. Rialto Catalog — Zod schemas for 26 components with TypeScript Compiler API generation pipeline, CI drift check, and defineRegistry() client mapping
2. AI generation backend — streaming gen-ui and gen-chat routes with Auth0 JWT, rate limiting, Anthropic prompt caching (~$0.001/gen), and cost logging
3. Playground app — full Vite SPA at /gen with three-column layout, streaming preview, JSON inspector, prompt history, favorites, shareable permalinks, and conversational refinement
4. Hospitality copilot — GenCopilot component in @mbe/rialto with domain-aware prompt context, embedded in the hospitality dashboard via Drawer
5. Persistence layer — StoredSpec Prisma model with REST API, auto-save, replay, favorites, and shareable permalinks
6. IaC compliance — gen Worker managed by Pulumi with @pulumi/cloudflare v5→v6 upgrade across the entire stack

**Known Gaps (operational, not code):**
- GEN-07: Production SSE verification blocked on `pulumi up` (code and infra wiring verified correct)
- INFRA-04: Anthropic spend cap requires manual action at console.anthropic.com

---

## v1.1 Rialto Accessibility & AI DX (Shipped: 2026-03-23)

**Delivered:** All Rialto components are WCAG AA accessible, example pages demonstrate real-world composition, and AI tools produce correct Rialto code via registry, llms.txt, and CLI scaffold.

**Stats:**
- Phases: 6-11 (17 plans)
- Commits: 138
- Files modified: 388 (+65,212 / -2,364)
- Codebase: 94,670 LOC TypeScript
- Timeline: 19 days (2026-03-04 → 2026-03-23)
- Git range: feat(06-01)..feat(11-01)
- Requirements: 24/24 satisfied

**Key accomplishments:**
1. WCAG AA accessibility across all 58 Rialto components — axe-core CI assertions, token-level contrast verification, focus-return-on-close for all overlay components
2. Three realistic example pages (dashboard, settings, form-states) with copy-to-clipboard JSX, composition notes, and multi-state panels
3. AI developer experience toolkit — component registry (registry.json), two-tier llms.txt, CLAUDE.md Rialto section, and `mbe new` CLI scaffold
4. Component documentation — 20 structured spec files, accessibility docs on all interactive showcase pages, manual verification checklist
5. Audit-driven gap closure — Phases 10-11 fixed SUMMARY frontmatter, stale llms-full.txt props, registry props coverage (23 components improved), and Phase 08 VERIFICATION.md

---

## v1.0 Rialto Unification & Hosting (Shipped: 2026-03-04)

**Delivered:** Every web app uses Rialto as the sole design system, all accessible at mattbutlerengineering.com with path-prefix routing.

**Stats:**
- Phases: 1-5 (14 plans)
- Commits: 77
- Files modified: 379 (+74,100 / -8,530)
- Codebase: 51,640 LOC TypeScript
- Timeline: 6 days (2026-02-27 → 2026-03-04)
- Git range: 0382b68..50cbea7
- Requirements: 28/28 satisfied

**Key accomplishments:**
1. Rialto showcase app with 55+ interactive components, theme/vibe switching, and SPA routing at /rialto
2. Dashboard → hospitality rename with atomic Auth0/Pulumi/routing migration and 301 backward-compat redirect
3. Engineering portfolio site built entirely with Rialto — Hero, Projects, About, Contact sections at /
4. Hospitality app fully migrated from Tailwind + @mbe/ui to Rialto + CSS Modules with all features preserved
5. @mbe/ui and @mbe/shared-layout legacy packages deleted; Tailwind removed from all apps
6. Full milestone audit with retroactive verification closing all documentation gaps

---

