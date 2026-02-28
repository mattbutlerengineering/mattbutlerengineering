# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** Phase 1 — Rialto-Web Migration

## Current Position

Phase: 2 of 4 (Dashboard Rename)
Plan: 0 of 2 in current phase
Status: Context gathered — ready for planning
Last activity: 2026-02-28 — Phase 2 context discussion complete

Progress: [███░░░░░░░] 22%

## Performance Metrics

**Velocity:**
- Total plans completed: 3 (01-03 Tasks 1-2 done, Task 3 pending checkpoint)
- Average duration: 40 min
- Total execution time: 1.95 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-rialto-web-migration | 3 | 116 min | 39 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min), 01-02 (95 min), 01-03 (15 min)
- Trend: Fast plan — only 2 files changed, verification passed cleanly

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify DigitalOcean `preservePathPrefix: false` behavior for SPAs in staging before assuming correct for all three static sites
- [Pre-Phase 4]: PWA service worker scope isolation when two PWAs share a domain — test in staging before production

## Session Continuity

Last session: 2026-02-28
Stopped at: Phase 2 context gathered — ready for planning
Resume file: .planning/phases/02-dashboard-rename/02-CONTEXT.md
