# Requirements: Rialto Unification & Hosting

**Defined:** 2026-02-27
**Core Value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Rialto-Web Showcase

- [ ] **RIALTO-01**: All 55 Rialto components are visible with interactive states in the showcase app
- [ ] **RIALTO-02**: RialtoProvider wraps the app with theme context
- [ ] **RIALTO-03**: Theme/vibe switcher allows toggling between themes
- [ ] **RIALTO-04**: All Tailwind CSS removed — Rialto-only styling throughout
- [ ] **RIALTO-05**: App served at mattbutlerengineering.com/rialto with working client-side routing

### Marketing / Portfolio

- [ ] **PORT-01**: Hero section with name, role, and brief tagline
- [ ] **PORT-02**: About section with 3-5 sentences on focus and background
- [ ] **PORT-03**: Projects showcase with 3-5 curated project cards (title, tech stack, description, link)
- [ ] **PORT-04**: Social and contact links (GitHub, LinkedIn, email)
- [ ] **PORT-05**: "This site IS the project" narrative — callout explaining the monorepo, design system, and IaC as engineering proof
- [ ] **PORT-06**: Live links to rialto-web showcase and hospitality app
- [ ] **PORT-07**: All styling uses Rialto components exclusively — no Tailwind, no @mbe/ui
- [ ] **PORT-08**: App served at mattbutlerengineering.com/ with working client-side routing

### Hospitality App

- [ ] **HOSP-01**: Directory renamed from `apps/dashboard` to `apps/hospitality`
- [ ] **HOSP-02**: Package name updated from `@mbe/dashboard` to `@mbe/hospitality`
- [ ] **HOSP-03**: URL path changed from `/dashboard` to `/hospitality` (Vite base, React Router basename)
- [ ] **HOSP-04**: Auth0 callback URL updated to `/hospitality/callback` in Pulumi IaC
- [ ] **HOSP-05**: All Tailwind CSS classes replaced with Rialto components
- [ ] **HOSP-06**: All @mbe/ui imports replaced with @mbe/rialto equivalents
- [ ] **HOSP-07**: All existing features preserved (reservations, timeline, floor plans, guest management)
- [ ] **HOSP-08**: App served at mattbutlerengineering.com/hospitality with working client-side routing

### Infrastructure & Hosting

- [ ] **INFRA-01**: Pulumi ingress rules for `/rialto`, `/hospitality`, and `/` (catch-all last)
- [ ] **INFRA-02**: SPA fallback (catchallDocument) configured per app
- [ ] **INFRA-03**: Vite `base`, React Router `basename`, and Pulumi ingress in sync per app
- [ ] **INFRA-04**: All three apps accessible at mattbutlerengineering.com with correct path-prefix routing

### Cleanup

- [ ] **CLEAN-01**: @mbe/ui package removed from monorepo
- [ ] **CLEAN-02**: Tailwind CSS, PostCSS, and autoprefixer removed from all migrated app devDependencies
- [ ] **CLEAN-03**: No remaining Tailwind className references in any migrated app

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
| RIALTO-01 | TBD | Pending |
| RIALTO-02 | TBD | Pending |
| RIALTO-03 | TBD | Pending |
| RIALTO-04 | TBD | Pending |
| RIALTO-05 | TBD | Pending |
| PORT-01 | TBD | Pending |
| PORT-02 | TBD | Pending |
| PORT-03 | TBD | Pending |
| PORT-04 | TBD | Pending |
| PORT-05 | TBD | Pending |
| PORT-06 | TBD | Pending |
| PORT-07 | TBD | Pending |
| PORT-08 | TBD | Pending |
| HOSP-01 | TBD | Pending |
| HOSP-02 | TBD | Pending |
| HOSP-03 | TBD | Pending |
| HOSP-04 | TBD | Pending |
| HOSP-05 | TBD | Pending |
| HOSP-06 | TBD | Pending |
| HOSP-07 | TBD | Pending |
| HOSP-08 | TBD | Pending |
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |
| INFRA-04 | TBD | Pending |
| CLEAN-01 | TBD | Pending |
| CLEAN-02 | TBD | Pending |
| CLEAN-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28 (pending roadmap creation)

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after initial definition*
