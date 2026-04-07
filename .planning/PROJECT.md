# mattbutlerengineering

## What This Is

A professional engineering portfolio and monorepo hosting four web applications under mattbutlerengineering.com — all built exclusively with the Rialto design system. The marketing site showcases projects and engineering skills, the hospitality app manages reservations and floor plans with an embedded AI copilot, the rialto-web app is an interactive design system showcase, and the gen app is an AI-powered playground that generates Rialto UIs from natural language prompts.

## Core Value

Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com — a unified, professional web presence.

## Requirements

### Validated

- ✓ Monorepo with Turborepo + pnpm — existing
- ✓ Rialto design system with ~55 components — existing
- ✓ Backend services (users, agent, reservations) — existing
- ✓ Auth0 authentication integration — existing
- ✓ Path-prefix routing convention — existing
- ✓ Infrastructure as Code with Pulumi — existing
- ✓ All 55 Rialto components visible with interactive states in showcase — v1.0
- ✓ RialtoProvider + theme/vibe switcher in all apps — v1.0
- ✓ All Tailwind CSS removed from all apps — v1.0
- ✓ rialto-web served at /rialto with working SPA routing — v1.0
- ✓ Marketing portfolio with Hero, Projects, About, Contact sections — v1.0
- ✓ "This site IS the project" engineering narrative — v1.0
- ✓ Dashboard renamed to hospitality (directory, URLs, auth, IaC) — v1.0
- ✓ Hospitality app fully migrated to Rialto + CSS Modules — v1.0
- ✓ All existing hospitality features preserved — v1.0
- ✓ @mbe/ui and @mbe/shared-layout packages removed — v1.0
- ✓ All three apps at / (marketing), /rialto (showcase), /hospitality (app) — v1.0
- ✓ 301 redirect from legacy /dashboard to /hospitality — v1.0
- ✓ WCAG AA audit of all 58 Rialto components with axe-core CI assertions — v1.1
- ✓ Token-level contrast verification (4.5:1 text, 3:1 UI controls) — v1.1
- ✓ Focus-return-on-close for all overlay components — v1.1
- ✓ Realistic example pages (dashboard, settings, form-states) with composition notes — v1.1
- ✓ Component registry (registry.json) with props, descriptions, examples — v1.1
- ✓ Two-tier llms.txt (overview + full API reference) — v1.1
- ✓ CLAUDE.md Rialto usage section with top 10 component APIs — v1.1
- ✓ CLI scaffold (`mbe new`) for new Rialto projects — v1.1
- ✓ 20 structured spec files for most-used components — v1.1
- ✓ Accessibility docs on all interactive showcase pages — v1.1
- ✓ Rialto catalog with Zod schemas for 26 components and CI drift check — v1.2
- ✓ defineRegistry() mapping catalog to React components for json-render — v1.2
- ✓ Streaming gen-ui and gen-chat endpoints with Auth0 JWT, rate limiting, prompt caching — v1.2
- ✓ Per-request cost logging (tokens, cache hits, model) — v1.2
- ✓ Playground app at /gen with streaming preview, JSON inspector, prompt history — v1.2
- ✓ Shareable permalinks and conversational refinement mode — v1.2
- ✓ GenCopilot component in @mbe/rialto with hospitality domain context — v1.2
- ✓ StoredSpec persistence with favorites, replay, and auto-save — v1.2
- ✓ Gen Worker managed by Pulumi with @pulumi/cloudflare v6 — v1.2
- ✓ Four apps at / (marketing), /rialto (showcase), /hospitality (app), /gen (playground) — v1.2

- ✓ ADR enforcement in pre-commit hook (mbe check-adr) — v1.6
- ✓ API contract regression testing in CI — v1.6
- ✓ JIT context priming (mbe prime) — v1.6
- ✓ Dependency integrity audit (mbe check-deps) — v1.6
- ✓ Infrastructure MCP servers (Pulumi, DB, Auth0) — v1.6
- ✓ Monorepo dependency synchronization via pnpm catalogs (18 deps) — v1.6

### Active

(No active requirements — next milestone not yet defined)

### Out of Scope

- SSR / server-side rendering — static SPA builds are correct for this use case
- Storybook — custom showcase (rialto-web) already exists
- Mobile app — web-first; mobile later if ever
- Subdomain routing — path-prefix is the convention and simpler to manage
- npm publishing — monorepo-only for now; external distribution is a future milestone
- External adoption — Rialto is monorepo-only; external onboarding is a future milestone
- Open-ended HTML/CSS generation — XSS risk, breaks design system fidelity
- LLM-generated inline styles — breaks Rialto token system
- Auto-deploy generated UIs — no human review gate
- Public unauthenticated playground — cost/abuse risk; auth required

## Context

Shipped v1.6 with ~103K LOC TypeScript across 83 files changed in this milestone.
Tech stack: React 19, Vite 7, TypeScript, Pulumi, Auth0, DigitalOcean App Platform, AI SDK + Anthropic.
Four apps live at mattbutlerengineering.com: marketing (/), rialto-web (/rialto), hospitality (/hospitality), gen (/gen).
Rialto is the sole design system — WCAG AA accessible, with axe-core CI, Zod catalog (26 components), registry.json, and llms.txt.
Agent service (port 3003) now serves both claude-agent-sdk sessions and AI generation endpoints (gen-ui, gen-chat).
Dev tooling: mbe CLI with check-adr, check-deps, prime, mcp, pack, generate commands.
All 18 shared external dependencies unified via pnpm catalog — zero version drift.
Infrastructure MCP servers provide standardized agent interfaces for Pulumi, database, and Auth0.
All CF Workers (marketing, hospitality, rialto-web, gen) managed by Pulumi with @pulumi/cloudflare v6.

## Constraints

- **Design system**: Rialto only — no Tailwind, no @mbe/ui, no raw CSS for component-level styling
- **Hosting**: All apps under mattbutlerengineering.com domain with path-prefix routing
- **Existing stack**: React 19, Vite 7, TypeScript — no framework changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rialto-only (drop Tailwind) | Single design system reduces maintenance, ensures consistency | ✓ Good — zero Tailwind in monorepo |
| Rename dashboard → hospitality | Better describes the domain; dashboard was a generic placeholder | ✓ Good — clean rename with 301 redirect |
| Start with rialto-web | Already closest to Rialto, lowest risk, validates the migration approach | ✓ Good — established pattern for all subsequent migrations |
| Incremental migration | Reduces blast radius, each app can be verified independently | ✓ Good — each phase verified independently |
| CSS Modules for Tailwind replacement | Provides scoped styling without adding new dependencies | ✓ Good — clean, no-dependency solution |
| Retroactive verification for early phases | Phases 01/03 predated verification workflow | ✓ Good — formal VERIFICATION.md created from codebase evidence |
| Pulumi resource rename (delete+recreate) for Auth0 | Atomic rename; accepted operational cost of new client_id | ⚠️ Revisit — document operational step more prominently |
| Token-level contrast fixes | Fix at design token level (not per-component CSS) for WCAG AA | ✓ Good — systematic fix, 4.5:1 text / 3:1 UI verified |
| Two-tier llms.txt | Lean llms.txt (<20KB) + llms-full.txt (26KB) for different AI context budgets | ✓ Good — fits AI context windows while preserving full API |
| Registry via TypeScript Compiler API | Extract props from source using ts-morph pattern; gap-closed in Phase 11 | ✓ Good — 90 components with props, CI drift check |
| Audit-driven gap closure (Phases 10-11) | Milestone audit found 10 partial/unsatisfied reqs; created targeted phases | ✓ Good — 24/24 requirements satisfied |
| Dark text on gold accent backgrounds | #1a1918 on #b0841e (6.26:1) vs white on gold (2.73:1) | ✓ Good — meets AA without changing brand gold |
| cloneElement for aria-haspopup injection | Eliminates nested-interactive axe violation in DropdownMenu/Popover | ⚠️ Revisit — pre-existing TS type-narrowing errors (runtime correct) |

| json-render for generative UI | Catalog-based JSON generation constrained to Rialto components; native AI SDK integration; code export | ✓ Good — 26 components mapped, streaming preview works |
| AI SDK + Anthropic Direct | Provider-agnostic abstraction with existing Anthropic key; no hosting change required; add providers later | ✓ Good — streaming gen-ui and gen-chat routes, prompt caching active |
| Haiku 4.5 as default gen model | $1/$5 MTok + prompt caching ≈ $0.001/gen — cost-effective for playground volume | ✓ Good — cost-effective default, Sonnet selectable server-side |
| TypeScript Compiler API for catalog schemas | Extract prop types from Rialto source, generate Zod schemas automatically | ✓ Good — isDeclaredInRialto() filter, CI drift check prevents divergence |
| GenCopilot as @mbe/rialto export | Reusable copilot component, auth-agnostic (getAccessToken prop) | ✓ Good — embedded in hospitality, portable to any Rialto app |
| Conditional mount pattern for GenCopilot | Consumer uses `{open && <GenCopilot>}` for fresh state on every open | ✓ Good — simpler than controlled open prop, natural React pattern |
| @pulumi/cloudflare v5→v6 upgrade | Required for gen Worker resource; unified bindings[] array, DnsRecord rename | ✓ Good — all 4 Workers managed by Pulumi, CI deploys via Pulumi |
| Audit-driven gap closure (Phases 17-18) | Milestone audit found proxy routing bug and missing Pulumi resource | ✓ Good — 34/34 requirements satisfied |
| pnpm catalog for dependency sync | Centralize version management; eliminate drift across 22 workspace packages | ✓ Good — 18 deps cataloged, mbe check-deps exits 0 |
| Exclude peerDeps from drift audit | peerDeps express compatibility ranges, not resolved versions | ✓ Good — prevents false positives in auth/sentry React peer ranges |

---
*Last updated: 2026-04-05 after v1.6 milestone*
