# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** Phase 1 — Rialto-Web Migration

## Current Position

Phase: 1 of 4 (Rialto-Web Migration)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-02-27 — Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: rialto-web migrated first — lowest risk, establishes pattern for all subsequent migrations
- [Roadmap]: Dashboard rename isolated as its own phase — Auth0 callback update must be atomic with the rename
- [Roadmap]: @mbe/ui deleted only in Phase 4 — after all three apps are migrated and typecheck clean

### Pending Todos

None yet.

### Blockers/Concerns

- [Pre-Phase 1]: Verify DigitalOcean `preservePathPrefix: false` behavior for SPAs in staging before assuming correct for all three static sites
- [Pre-Phase 4]: PWA service worker scope isolation when two PWAs share a domain — test in staging before production

## Session Continuity

Last session: 2026-02-27
Stopped at: Roadmap created, ready to plan Phase 1
Resume file: None
