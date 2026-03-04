---
phase: 05-retroactive-verification-gap-closure
plan: "02"
subsystem: infra
tags: [auth0, pulumi, digitalocean, iac]

# Dependency graph
requires: []
provides:
  - Clean Auth0 localCallbacks with only hospitality callback (no stale localhost:3000)
  - Clean localLogoutUrls and localWebOrigins with no localhost:3000 entries
  - Marketing static site Pulumi config without unused VITE_AUTH_* env vars
affects: [infra, auth0, pulumi-up]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pulumi IaC: only configure Auth0 callbacks for apps that actually have auth flows"
    - "Pulumi IaC: only inject env vars that the app actually reads at build time"

key-files:
  created: []
  modified:
    - infrastructure/pulumi/auth0.ts
    - infrastructure/pulumi/index.ts

key-decisions:
  - "Auth0 localCallbacks cleanup: localhost:3000/callback removed — marketing has no auth route handler; hospitality callback preserved"
  - "Marketing Pulumi envs removed: VITE_AUTH_* vars were injected into marketing build but never consumed; removed to eliminate confusion"
  - "prodCallbacks left untouched: stale production callbacks are harmless (Auth0 ignores unregistered redirects), risk of accidental breakage outweighs cleanup benefit"

patterns-established:
  - "IaC cleanup: scope local-array cleanup tightly — only remove localhost entries, never touch prod arrays in the same pass"

requirements-completed: [RIALTO-05, PORT-08]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 5 Plan 02: Stale Auth0 Callbacks and Orphaned Pulumi Env Vars Summary

**Removed localhost:3000/callback from Auth0 localCallbacks and eliminated four orphaned VITE_AUTH_* env var injections from the marketing Pulumi static site config**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-04T18:47:49Z
- **Completed:** 2026-03-04T18:53:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Removed `http://localhost:3000/callback` from `localCallbacks` in auth0.ts — marketing never had an auth callback route handler
- Removed `http://localhost:3000` from `localLogoutUrls` and `localWebOrigins` in auth0.ts
- Removed entire `envs` block from marketing static site entry in index.ts — VITE_AUTH_AUTHORITY, VITE_AUTH_CLIENT_ID, VITE_AUTH_AUDIENCE, VITE_AUTH_REDIRECT_URI were all unused by marketing
- Hospitality Auth0 callbacks, logout URLs, and web origins confirmed preserved
- Production callbacks (prodCallbacks/prodLogoutUrls/prodWebOrigins) left untouched
- TypeScript compilation passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove stale Auth0 callback and orphaned marketing Pulumi env vars** - `b0f645e` (fix)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `/Users/mbutler/github/mattbutlerengineering/infrastructure/pulumi/auth0.ts` - Removed localhost:3000 from localCallbacks, localLogoutUrls, localWebOrigins; prod arrays unchanged
- `/Users/mbutler/github/mattbutlerengineering/infrastructure/pulumi/index.ts` - Removed envs block from marketing static site entry; hospitality envs preserved

## Decisions Made
- Scoped cleanup to local arrays only — prodCallbacks still has `https://${domain}/callback` (harmless stale entry per research Pitfall 3 guidance)
- Did not remove `auth0Outputs` import from index.ts — still referenced by hospitality envs block and top-level exports

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

These are IaC source changes. They take effect on `pulumi up` (production deployment). No `pulumi up` was run as part of this plan.

## Next Phase Readiness
- Phase 5 plans 01 and 02 complete — gap closure work done
- Infrastructure/pulumi TypeScript compiles cleanly
- No blockers

## Self-Check: PASSED

- FOUND: infrastructure/pulumi/auth0.ts
- FOUND: infrastructure/pulumi/index.ts
- FOUND: .planning/phases/05-retroactive-verification-gap-closure/05-02-SUMMARY.md
- FOUND: b0f645e (task commit)
- FOUND: d5d9ad8 (docs commit)

---
*Phase: 05-retroactive-verification-gap-closure*
*Completed: 2026-03-04*
