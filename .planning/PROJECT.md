# mattbutlerengineering

## What This Is

A professional engineering portfolio and monorepo hosting three web applications under mattbutlerengineering.com — all built exclusively with the Rialto design system. The marketing site showcases projects and engineering skills, the hospitality app manages reservations and floor plans, and the rialto-web app is an interactive design system showcase.

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

### Active

(None — define next milestone with `/gsd:new-milestone`)

### Out of Scope

- agent-viz app — internal tool, not part of public web presence
- SSR / server-side rendering — static SPA builds are correct for this use case
- Storybook — custom showcase (rialto-web) already exists
- Mobile app — web-first; mobile later if ever
- Subdomain routing — path-prefix is the convention and simpler to manage

## Context

Shipped v1.0 with 51,640 LOC TypeScript across 379 files.
Tech stack: React 19, Vite 7, TypeScript, Pulumi, Auth0, DigitalOcean App Platform.
Three apps live at mattbutlerengineering.com: marketing (/), rialto-web (/rialto), hospitality (/hospitality).
Rialto is the sole design system — no Tailwind, no @mbe/ui, no legacy styling anywhere.
Backend services (users, agent) unchanged during v1.0 — APIs stay as-is.

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

---
*Last updated: 2026-03-04 after v1.0 milestone*
