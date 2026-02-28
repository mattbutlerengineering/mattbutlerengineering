# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** Phase 1 — Rialto-Web Migration

## Current Position

Phase: 1 of 4 (Rialto-Web Migration)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-28 — Completed 01-02 (all 43 component showcase pages)

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 51 min
- Total execution time: 1.7 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-rialto-web-migration | 2 | 101 min | 51 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min), 01-02 (95 min)
- Trend: Largest plan complete (43 pages); remaining plans should be faster

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify DigitalOcean `preservePathPrefix: false` behavior for SPAs in staging before assuming correct for all three static sites
- [Pre-Phase 4]: PWA service worker scope isolation when two PWAs share a domain — test in staging before production

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 01-02-PLAN.md (43 component showcase pages, routes.tsx wired, App.tsx deleted)
Resume file: None
