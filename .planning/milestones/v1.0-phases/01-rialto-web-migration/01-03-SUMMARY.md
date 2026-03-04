---
phase: 01-rialto-web-migration
plan: 03
subsystem: ui
tags: [pulumi, digitalocean, rialto, tailwind-removal, spa-routing, iac]

# Dependency graph
requires:
  - phase: 01-rialto-web-migration/01-02
    provides: "All 43+ component showcase pages, routes.tsx, App.tsx deleted"
  - phase: 01-rialto-web-migration/01-01
    provides: "App shell, sidebar, BrowserRouter with /rialto basename, Vite base /rialto/"
provides:
  - "Zero Tailwind classNames in rialto-web source (RIALTO-04 complete)"
  - "Pulumi ingress rule /rialto with preservePathPrefix: false (RIALTO-05 complete)"
  - "Pulumi rialto-web static site with catchallDocument: index.html"
  - "rialtoUrl export from Pulumi index.ts"
  - "Production build verified: tsc + vite build with zero errors"
affects: [02-dashboard-rename, 03-marketing-migration, 04-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static site entry pattern: name, github, sourceDir, buildCommand, outputDir, catchallDocument"
    - "Ingress ordering: most-specific-first (/api, /dashboard, /rialto before /)"
    - "SPA fallback: catchallDocument: index.html ensures all client-side routes return index.html"

key-files:
  created: []
  modified:
    - "infrastructure/pulumi/index.ts"
    - "apps/rialto-web/src/pages/layouts/LayoutDemo.tsx"

key-decisions:
  - "className='accent' replaced with inline style var(--rialto-accent) — no Tailwind processing exists in rialto-web"
  - "rialto-web static site entry has no envs — rialto-web has no backend calls or auth requirements"
  - "preservePathPrefix: false on /rialto ingress — DigitalOcean strips the prefix before passing to the static site, matching Vite base /rialto/ and BrowserRouter basename=/rialto"

patterns-established:
  - "Three-way routing alignment: Vite base + BrowserRouter basename + Pulumi ingress prefix must all match"
  - "catchallDocument: index.html is required for SPA client-side routing to work in production"

requirements-completed: [RIALTO-04, RIALTO-05]

# Metrics
duration: 15min
completed: 2026-02-28
---

# Phase 01 Plan 03: Tailwind Removal and Pulumi Routing Summary

**Removed final stray Tailwind className from LayoutDemo.tsx and added Pulumi /rialto ingress + static site entry, completing RIALTO-04 and RIALTO-05**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-28T16:03:56Z
- **Completed:** 2026-02-28T16:18:00Z
- **Tasks:** 2 completed (Task 3 awaiting human verification)
- **Files modified:** 2

## Accomplishments
- Removed the last stray `className="accent"` in LayoutDemo.tsx — replaced with `style={{ color: "var(--rialto-accent)" }}`
- Added `/rialto` ingress rule to Pulumi (after `/dashboard`, before `/` catch-all) with `preservePathPrefix: false`
- Added `rialto-web` static site entry to Pulumi with `catchallDocument: index.html` for SPA fallback
- Exported `rialtoUrl` from Pulumi index.ts
- Verified: TypeScript typecheck passes, production build succeeds (zero errors), zero Tailwind classNames, zero @mbe/ui imports, 65 lazy-loaded routes in routes.tsx
- Confirmed three-way alignment: Vite base `/rialto/`, BrowserRouter `basename="/rialto"`, Pulumi ingress `prefix: "/rialto"`

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove stray Tailwind className and add Pulumi ingress rule** - `8ad5bb5` (feat)
2. **Task 2: Full build, lint, and typecheck verification** - No new files (verification-only task)
3. **Task 3: Visual and functional verification** - Awaiting human checkpoint

**Plan metadata:** TBD (docs: complete plan — after checkpoint)

## Files Created/Modified
- `infrastructure/pulumi/index.ts` - Added /rialto ingress rule, rialto-web static site entry, rialtoUrl export
- `apps/rialto-web/src/pages/layouts/LayoutDemo.tsx` - Replaced className="accent" with inline style using Rialto token

## Decisions Made
- Used inline `style={{ color: "var(--rialto-accent)" }}` for the accent span rather than adding a CSS module class — minimal change, semantically equivalent, avoids creating a new CSS module class just for a one-off style
- Placed rialto-web static site entry between marketing and dashboard in the staticSites array (order doesn't matter for static sites, but logical grouping)
- No envs array needed for rialto-web — it's a pure client-side design system showcase with no backend calls

## Deviations from Plan

None - plan executed exactly as written. The stray className was exactly as documented in the plan, and the Pulumi additions matched the exact interface specification in the plan.

**Note on ESLint:** `pnpm --filter @mbe/rialto-web lint` fails with a pre-existing environment incompatibility (ESLint 10.0.2 + ajv missing `json-schema-draft-04.json`). This failure exists on the baseline commit before any of this plan's changes — confirmed via git stash test. Deferred to `deferred-items.md`.

## Issues Encountered
- ESLint pre-existing environment failure: ESLint 10.0.2 cannot find `ajv/lib/refs/json-schema-draft-04.json`. This is an ajv v8 vs ESLint 10 compatibility issue, pre-existing in the repo. Not caused by this plan. Documented for future investigation.

## User Setup Required
None - infrastructure changes are IaC (Pulumi) and require a `pulumi up` deployment, not manual configuration steps.

## Next Phase Readiness
- rialto-web showcase app is complete and production-ready pending `pulumi up` deployment
- Awaiting human verification (Task 3 checkpoint) to confirm visual and functional correctness
- After approval: Phase 1 is complete — proceed to Phase 2 (Dashboard rename)
- Known blocker: Verify DigitalOcean `preservePathPrefix: false` behavior in staging before assuming correct

## Self-Check: PASSED

All files verified present. Commit 8ad5bb5 verified in git history. Key content verified:
- `rialto-web` static site entry in pulumi/index.ts
- `var(--rialto-accent)` inline style in LayoutDemo.tsx (className="accent" removed)
- `catchallDocument` in pulumi/index.ts
- `rialtoUrl` export in pulumi/index.ts

---
*Phase: 01-rialto-web-migration*
*Completed: 2026-02-28*
