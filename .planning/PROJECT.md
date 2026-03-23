# mattbutlerengineering

## What This Is

A professional engineering portfolio and monorepo hosting three web applications under mattbutlerengineering.com — all built exclusively with the Rialto design system. The marketing site showcases projects and engineering skills, the hospitality app manages reservations and floor plans, and the rialto-web app is an interactive design system showcase with WCAG AA accessibility, realistic example pages, and AI-friendly tooling (registry, llms.txt, CLI scaffold).

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

### Active

(No active requirements — define with next milestone)

### Out of Scope

- agent-viz app — internal tool, not part of public web presence
- SSR / server-side rendering — static SPA builds are correct for this use case
- Storybook — custom showcase (rialto-web) already exists
- Mobile app — web-first; mobile later if ever
- Subdomain routing — path-prefix is the convention and simpler to manage
- npm publishing — monorepo-only for now; external distribution is a future milestone
- External adoption — Rialto is monorepo-only; external onboarding is a future milestone

## Context

Shipped v1.1 with 94,670 LOC TypeScript across 388+ files.
Tech stack: React 19, Vite 7, TypeScript, Pulumi, Auth0, DigitalOcean App Platform.
Three apps live at mattbutlerengineering.com: marketing (/), rialto-web (/rialto), hospitality (/hospitality).
Rialto is the sole design system — WCAG AA accessible, with axe-core CI, 20 spec files, registry.json, and llms.txt.
Backend services (users, agent, reservations) unchanged during v1.0/v1.1 — APIs stay as-is.

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

---
*Last updated: 2026-03-23 after v1.1 milestone completion*
