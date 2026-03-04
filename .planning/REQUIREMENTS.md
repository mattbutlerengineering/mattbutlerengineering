# Requirements: Rialto Unification & Hosting

**Defined:** 2026-02-27
**Core Value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Rialto-Web Showcase

- [ ] **RIALTO-01**: All 55 Rialto components are visible with interactive states in the showcase app
- [x] **RIALTO-02**: RialtoProvider wraps the app with theme context
- [x] **RIALTO-03**: Theme/vibe switcher allows toggling between themes
- [ ] **RIALTO-04**: All Tailwind CSS removed — Rialto-only styling throughout
- [ ] **RIALTO-05**: App served at mattbutlerengineering.com/rialto with working client-side routing

### Marketing / Portfolio

- [x] **PORT-01**: Hero section with name, role, and brief tagline
- [x] **PORT-02**: About section with 3-5 sentences on focus and background
- [x] **PORT-03**: Projects showcase with 3-5 curated project cards (title, tech stack, description, link)
- [x] **PORT-04**: Social and contact links (GitHub, LinkedIn, email)
- [x] **PORT-05**: "This site IS the project" narrative — callout explaining the monorepo, design system, and IaC as engineering proof
- [x] **PORT-06**: Live links to rialto-web showcase and hospitality app
- [x] **PORT-07**: All styling uses Rialto components exclusively — no Tailwind, no @mbe/ui
- [x] **PORT-08**: App served at mattbutlerengineering.com/ with working client-side routing

### Hospitality App

- [x] **HOSP-01**: Directory renamed from `apps/dashboard` to `apps/hospitality`
- [x] **HOSP-02**: Package name updated from `@mbe/dashboard` to `@mbe/hospitality`
- [x] **HOSP-03**: URL path changed from `/dashboard` to `/hospitality` (Vite base, React Router basename)
- [x] **HOSP-04**: Auth0 callback URL updated to `/hospitality/callback` in Pulumi IaC
- [x] **HOSP-05**: All Tailwind CSS classes replaced with Rialto components
- [x] **HOSP-06**: All @mbe/ui imports replaced with @mbe/rialto equivalents
- [x] **HOSP-07**: All existing features preserved (reservations, timeline, floor plans, guest management)
- [ ] **HOSP-08**: App served at mattbutlerengineering.com/hospitality with working client-side routing

### Infrastructure & Hosting

- [x] **INFRA-01**: Pulumi ingress rules for `/rialto`, `/hospitality`, and `/` (catch-all last)
- [x] **INFRA-02**: SPA fallback (catchallDocument) configured per app
- [x] **INFRA-03**: Vite `base`, React Router `basename`, and Pulumi ingress in sync per app
- [ ] **INFRA-04**: All three apps accessible at mattbutlerengineering.com with correct path-prefix routing

### Cleanup

- [x] **CLEAN-01**: @mbe/ui package removed from monorepo
- [x] **CLEAN-02**: Tailwind CSS, PostCSS, and autoprefixer removed from all migrated app devDependencies
- [x] **CLEAN-03**: No remaining Tailwind className references in any migrated app

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Showcase Enhancements

- **RIALTO-V2-01**: Code snippets with syntax highlighting for each component
- **RIALTO-V2-02**: Icon search and browser
- **RIALTO-V2-03**: Token visualization (colors, spacing, typography)

### Portfolio Enhancements

- **PORT-V2-01**: Technical blog/writing section with Markdown-rendered posts
- **PORT-V2-02**: Lighthouse performance score callout
- **PORT-V2-03**: Live GitHub stats or contribution graph

### Cross-App

- **CROSS-V2-01**: Shared navigation across all apps via @mbe/shared-layout
- **CROSS-V2-02**: PWA support with service worker scope management

## Out of Scope

| Feature | Reason |
|---------|--------|
| agent-viz app migration | Internal tool, not part of public web presence |
| New backend features | APIs stay as-is; this is a frontend migration |
| SSR / server-side rendering | Static SPA builds are correct for this use case |
| Storybook | Custom showcase (rialto-web) already exists and is better tailored |
| Contact form with backend | Use mailto link — no backend needed for contact |
| Mobile app | Web-first; mobile later if ever |
| Subdomain routing | Path-prefix is already the convention and simpler to manage |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RIALTO-01 | Phase 1 | Pending |
| RIALTO-02 | Phase 1 | Complete (01-01) |
| RIALTO-03 | Phase 1 | Complete (01-01) |
| RIALTO-04 | Phase 1 | Pending |
| RIALTO-05 | Phase 1 | Pending |
| PORT-01 | Phase 3 | Complete |
| PORT-02 | Phase 3 | Complete |
| PORT-03 | Phase 3 | Complete |
| PORT-04 | Phase 3 | Complete |
| PORT-05 | Phase 3 | Complete |
| PORT-06 | Phase 3 | Complete |
| PORT-07 | Phase 3 | Complete |
| PORT-08 | Phase 3 | Complete |
| HOSP-01 | Phase 2 | Complete |
| HOSP-02 | Phase 2 | Complete |
| HOSP-03 | Phase 2 | Complete |
| HOSP-04 | Phase 2 | Complete |
| HOSP-05 | Phase 4 | Complete |
| HOSP-06 | Phase 4 | Complete |
| HOSP-07 | Phase 4 | Complete |
| HOSP-08 | Phase 4 | Pending |
| INFRA-01 | Phase 2 | Complete |
| INFRA-02 | Phase 2 | Complete |
| INFRA-03 | Phase 2 | Complete |
| INFRA-04 | Phase 4 | Pending |
| CLEAN-01 | Phase 4 | Complete |
| CLEAN-02 | Phase 4 | Complete |
| CLEAN-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
