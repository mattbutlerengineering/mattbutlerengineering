# Roadmap: Rialto Unification & Hosting

## Overview

Four sequential app migrations that converge on a single outcome: every web app using Rialto as the sole design system, all reachable under mattbutlerengineering.com. The order is lowest-risk-first — rialto-web establishes the migration pattern, the dashboard rename isolates the Auth0 plumbing, marketing proves the pattern on a production app, and hospitality closes out the migration at full scale. Cleanup (Tailwind, @mbe/ui) happens as each app is migrated, with the final package deletion deferred until all consumers are confirmed clear.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Rialto-Web Migration** - Migrate rialto-web to Rialto-only, establishing the migration pattern (completed 2026-02-28)
- [x] **Phase 2: Dashboard Rename** - Rename dashboard to hospitality and update all auth/routing config atomically (completed 2026-02-28)
- [x] **Phase 3: Marketing Portfolio** - Migrate marketing to Rialto-only and build out portfolio content (completed 2026-02-28)
- [ ] **Phase 4: Hospitality Migration + Full Hosting** - Migrate hospitality to Rialto-only, remove @mbe/ui, verify all three apps in production

## Phase Details

### Phase 1: Rialto-Web Migration
**Goal**: The rialto-web showcase app runs entirely on Rialto with no Tailwind, served correctly at /rialto
**Depends on**: Nothing (first phase)
**Requirements**: RIALTO-01, RIALTO-02, RIALTO-03, RIALTO-04, RIALTO-05
**Success Criteria** (what must be TRUE):
  1. All 55+ Rialto components are visible with correct styling in the showcase app
  2. Theme and vibe switcher changes the visual appearance of all components on the page
  3. No Tailwind CSS classes remain in apps/rialto-web source — grep returns zero matches
  4. Navigating directly to mattbutlerengineering.com/rialto/any-sub-path returns the app, not a 404
**Plans:** 3/3 plans complete

Plans:
- [x] 01-01-PLAN.md — App shell: RialtoProvider at root, theme toggle, ShowcaseLayout with Sidebar, OverviewPage
- [x] 01-02-PLAN.md — All 43 per-component showcase pages with variants, playground, props table, accessibility
- [ ] 01-03-PLAN.md — Tailwind removal, Pulumi ingress rule for /rialto, build verification, human sign-off

### Phase 2: Dashboard Rename
**Goal**: The dashboard app is renamed to hospitality with all routing, auth, and infrastructure config updated atomically
**Depends on**: Phase 1
**Requirements**: HOSP-01, HOSP-02, HOSP-03, HOSP-04, INFRA-01, INFRA-02, INFRA-03
**Success Criteria** (what must be TRUE):
  1. The app directory is apps/hospitality and the package name is @mbe/hospitality
  2. Logging in via Auth0 redirects to /hospitality/callback without error
  3. Navigating directly to mattbutlerengineering.com/hospitality/any-sub-path returns the app, not a 404
  4. No references to /dashboard or @mbe/dashboard remain in Vite config, React Router, or Pulumi IaC
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Rename directory, package name, Vite config, React Router, Auth0 IaC, Pulumi ingress, cross-app links
- [ ] 02-02-PLAN.md — Documentation sweep: CLAUDE.md, evaluations, plans, codebase docs, skill files

### Phase 3: Marketing Portfolio
**Goal**: The marketing site is a complete engineering portfolio built entirely with Rialto, served at the root path
**Depends on**: Phase 2
**Requirements**: PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07, PORT-08
**Success Criteria** (what must be TRUE):
  1. A visitor sees Hero, About, Projects (3+ cards), and social/contact links on a single page load
  2. The "this site IS the project" callout explains the monorepo, Rialto, and IaC as engineering proof
  3. Links to the rialto-web showcase and hospitality app are live and navigable
  4. No Tailwind CSS classes remain in apps/marketing source — grep returns zero matches
  5. Navigating to mattbutlerengineering.com/ loads the portfolio without error
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Build portfolio page: RialtoProvider shell, Hero, Projects (5 cards), About, Contact sections using Rialto components
- [ ] 03-02-PLAN.md — Remove Tailwind/PostCSS/@mbe/ui dependencies, delete config files, verify build/typecheck/lint, visual sign-off

### Phase 4: Hospitality Migration + Full Hosting
**Goal**: The hospitality app runs entirely on Rialto, @mbe/ui is gone from the monorepo, and all three apps are verified in production
**Depends on**: Phase 3
**Requirements**: HOSP-05, HOSP-06, HOSP-07, HOSP-08, INFRA-04, CLEAN-01, CLEAN-02, CLEAN-03
**Success Criteria** (what must be TRUE):
  1. All existing hospitality features (reservations, timeline, floor plans, guest management) work correctly after migration
  2. No Tailwind CSS classes remain in apps/hospitality source — grep returns zero matches
  3. No @mbe/ui imports remain anywhere in the monorepo — pnpm typecheck passes with zero @mbe/ui errors
  4. All three apps load at their correct paths: / (marketing), /rialto (showcase), /hospitality (reservation app)
  5. Deep links to all three apps return 200 with the correct app, not a 404
**Plans**: 5 plans

Plans:
- [ ] 04-01-PLAN.md — App shell + @mbe/ui pages: RialtoProvider, Sidebar, PageHeader, Card/Button migration (Home, Profile, Settings, Admin)
- [ ] 04-02-PLAN.md — Pure Tailwind pages to CSS Modules (Reservations, Guests, FloorPlans, FloorPlanEditor, BookingWidgetDemo, Timeline)
- [ ] 04-03-PLAN.md — Domain components to CSS Modules (booking-widget, floor-plan, timeline)
- [ ] 04-04-PLAN.md — Cleanup: remove Tailwind deps, fix ESLint ajv, delete @mbe/ui + @mbe/shared-layout, update docs
- [ ] 04-05-PLAN.md — Verification: build/typecheck/lint/test + visual checkpoint for all three apps

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Rialto-Web Migration | 3/3 | Complete   | 2026-02-28 |
| 2. Dashboard Rename | 2/2 | Complete   | 2026-02-28 |
| 3. Marketing Portfolio | 2/2 | Complete   | 2026-02-28 |
| 4. Hospitality Migration + Full Hosting | 4/5 | In Progress|  |
