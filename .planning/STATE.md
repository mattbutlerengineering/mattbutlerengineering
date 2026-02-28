---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
last_updated: "2026-02-28T21:02:30Z"
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** Phase 3 — Marketing Portfolio (plan 1 of N complete)

## Current Position

Phase: 3 of 4 (Marketing Portfolio)
Plan: 1 of N in current phase
Status: Plan 03-01 complete — portfolio app shell and content sections built
Last activity: 2026-02-28 — 03-01 complete (marketing portfolio built with Rialto components)

Progress: [████████░░] 63%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 15 min
- Total execution time: 2.04 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-rialto-web-migration | 3 | 116 min | 39 min |
| 02-dashboard-rename | 2 of 2 | 7 min | 3.5 min |
| 03-marketing-portfolio | 1 of N | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-02 (95 min), 01-03 (15 min), 02-01 (3 min), 02-02 (4 min), 03-01 (3 min)
- Trend: Very fast — well-researched plan with clear component APIs

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: rialto-web migrated first — lowest risk, establishes pattern for all subsequent migrations
- [Roadmap]: Dashboard rename isolated as its own phase — Auth0 callback update must be atomic with the rename
- [Roadmap]: @mbe/ui deleted only in Phase 4 — after all three apps are migrated and typecheck clean
- [01-01]: Sidebar nav uses onClick+useNavigate not href — prevents full page reloads inside BrowserRouter
- [01-01]: RialtoProvider wraps BrowserRouter at root — ensures CSS token cascade applies to all routes
- [01-01]: Demo pages moved to /demos/* prefix — avoids route conflicts with new /components/* routes
- [01-01]: NAV_SECTIONS as source-of-truth — import into sidebar and routes.tsx for automatic route generation
- [01-02]: TimelinePage lives in pages/data/ but routes.tsx maps /components/timeline (Layout nav section) to it — file location and nav section need not match
- [01-02]: SpinnerPage is standalone even though ProgressPage also demos Spinner — one nav route per page
- [01-02]: Token pages deferred as inline stubs — full token reference pages for a future plan
- [01-03]: className="accent" replaced with inline style var(--rialto-accent) — no Tailwind processing in rialto-web
- [01-03]: rialto-web static site entry has no envs — pure client-side showcase, no backend or auth needed
- [01-03]: preservePathPrefix: false on /rialto — strips prefix before serving static files, matching Vite base and BrowserRouter basename
- [02-01]: 301 redirect rule in Pulumi ingress preserves backward compat for /dashboard bookmarks
- [02-01]: Auth0 Pulumi resource rename will delete+recreate client generating new client_id — local .env needs manual update after pulumi up
- [02-01]: Pulumi ingress rename pattern: add 301 redirect for old path before new component rule (order: /api, /old redirect, /new component, /rialto, / catch-all)
- [Phase 02-dashboard-rename]: [02-02]: Auth skill redirectUri uses port 3002 (actual dev port) not 5173 — updated to http://localhost:3002/hospitality/callback
- [03-01]: Text component has variants body/caption/detail/label/display — not heading/subheading as plan assumed; used native h2 + CSS module for section headings
- [03-01]: Cross-app links (/rialto, /hospitality) are data-driven via PROJECTS array, rendered as plain <a href> in ProjectCard
- [03-01]: @mbe/rialto was missing from marketing package.json — added as workspace dependency
- [03-01]: vite-env.d.ts was missing in marketing app — required for CSS module type declarations

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify DigitalOcean `preservePathPrefix: false` behavior for SPAs in staging before assuming correct for all three static sites
- [Pre-Phase 4]: PWA service worker scope isolation when two PWAs share a domain — test in staging before production

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 03-01-PLAN.md (marketing portfolio built with Rialto components)
Resume file: none
