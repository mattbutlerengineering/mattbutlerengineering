# Rialto Unification & Hosting

## What This Is

Migrate all web applications to use the Rialto design system exclusively, remove Tailwind CSS and legacy @mbe/ui, and host everything on mattbutlerengineering.com with path-prefix routing. Three apps: a portfolio/engineering showcase (marketing), a hospitality reservation system (renamed from dashboard), and the Rialto design system showcase.

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
- ✓ rialto-web showcase app — existing
- ✓ Dashboard app with reservations, timeline, floor plans — existing

### Active

- [ ] Migrate rialto-web to Rialto-only (remove Tailwind)
- [ ] Migrate marketing site to portfolio/engineering showcase using Rialto
- [ ] Rename dashboard to hospitality (directory, URLs, config)
- [ ] Migrate hospitality app to Rialto-only (remove Tailwind)
- [ ] Remove @mbe/ui legacy package
- [ ] Remove Tailwind CSS from all three apps
- [ ] Host all apps on mattbutlerengineering.com with path-prefix routing
- [ ] Deploy: / (marketing), /rialto (showcase), /hospitality (reservation app)

### Out of Scope

- agent-viz app — internal tool, not part of this migration
- New features for any app — this is a design system migration, not feature work
- Backend service changes — APIs stay as-is
- Mobile responsive overhaul — basic responsiveness only via Rialto defaults

## Context

- Rialto is a mature component library with 55+ components including layout (Stack, Sidebar), navigation (Navbar, Tabs, Breadcrumb), data display (Table, Card, Stat), forms (Input, Select, Checkbox), and feedback (Toast, Alert, Dialog)
- Apps currently use a mix of Tailwind CSS utility classes, @mbe/ui components, and some raw CSS
- @mbe/ui is explicitly being replaced by Rialto (noted in codebase docs)
- Path-prefix routing is already the convention: / (marketing), /dashboard (dashboard), /rialto (rialto-web)
- Marketing site is currently a basic React + Vite page — needs to become an engineering portfolio showcasing projects, open source work, and technical writing
- Incremental approach: rialto-web first, then marketing, then hospitality

## Constraints

- **Design system**: Rialto only — no Tailwind, no @mbe/ui, no raw CSS for component-level styling
- **Hosting**: All apps under mattbutlerengineering.com domain with path-prefix routing
- **Incremental**: One app at a time, starting with rialto-web
- **Existing stack**: React 19, Vite 7, TypeScript — no framework changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rialto-only (drop Tailwind) | Single design system reduces maintenance, ensures consistency | — Pending |
| Rename dashboard → hospitality | Better describes the domain; dashboard was a generic placeholder | — Pending |
| Start with rialto-web | Already closest to Rialto, lowest risk, validates the migration approach | — Pending |
| Incremental migration | Reduces blast radius, each app can be verified independently | — Pending |

---
*Last updated: 2026-02-27 after initialization*
