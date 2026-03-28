---
phase: 13-ai-generation-endpoint
plan: "02"
subsystem: infra
tags: [docker, pulumi, digitalocean, cloudflare, github-actions, agent-api]

# Dependency graph
requires:
  - phase: 13-ai-generation-endpoint
    provides: Plan 01 — agent service source code with /api/gen routes

provides:
  - Multi-stage Dockerfile for agent service (port 3003)
  - Pulumi agent-api service component with AI_GATEWAY_API_KEY secret
  - DO App Platform ingress routing /api/gen and /v1/* to agent-api before catch-all
  - GEN Service Binding commented in edge router (Phase 14 activation)
  - CI deploy trigger on services/agent/** and packages/agent-core/**
  - Updated migrate Dockerfile including agent service Prisma schema
affects:
  - 14-gen-playground (needs GEN Service Binding activated and gen Worker deployed)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Multi-stage Docker build following users service pattern (builder + runner stages, non-root user, Prisma generate in both stages)
    - DO App Platform ingress first-match ordering — specific routes before catch-all
    - Commented Service Binding as Phase 14 activation placeholder

key-files:
  created:
    - services/agent/Dockerfile
  modified:
    - infrastructure/migrate/Dockerfile
    - infrastructure/pulumi/index.ts
    - .github/workflows/deploy-services.yml

key-decisions:
  - "rialto-catalog excluded from agent Dockerfile — actual package.json has no rialto-catalog dependency (only agent-core and types)"
  - "migrate/Dockerfile updated to include agent service Prisma schema for when migrations are added"
  - "GEN Service Binding left commented in Pulumi — activating before Phase 14 deploys the Worker would cause Pulumi error"
  - "DEFAULT_MODEL set to anthropic/claude-haiku-4.5 for cost-optimized generation (~$0.001/gen)"

patterns-established:
  - "Service Binding comment pattern: add binding as commented entry with phase activation note when target Worker doesn't yet exist"

requirements-completed: [INFRA-01, INFRA-03]

# Metrics
duration: 12min
completed: 2026-03-27
---

# Phase 13 Plan 02: Deployment Infrastructure Summary

**Multi-stage Dockerfile for agent-api, DO App Platform Pulumi service with AI_GATEWAY_API_KEY secret and /api/gen ingress rules before /api catch-all, GEN Service Binding stub for Phase 14**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27T00:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created multi-stage agent service Dockerfile following users service pattern (builder + runner stages, non-root user, Prisma client generated in both stages)
- Added agent-api service to Pulumi with AI_GATEWAY_API_KEY secret, correct health check, and port 3003
- Added ingress rules routing /api/gen, /v1/sessions, /v1/orchestrate, /v1/webhooks to agent-api before reservations-api catch-all
- Updated migrate/Dockerfile to include agent Prisma schema for future migrations
- Added GEN Service Binding as commented stub with Phase 14 activation note
- Added services/agent/** and packages/agent-core/** to deploy-services.yml paths trigger

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent service Dockerfile and update migration Dockerfile** - `10a2efe` (feat)
2. **Task 2: Add agent service to Pulumi, update ingress rules, add GEN Service Binding, update CI** - `873c32d` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `services/agent/Dockerfile` - Multi-stage Docker build for agent service with pnpm workspace deps, Prisma generate, non-root user
- `infrastructure/migrate/Dockerfile` - Added agent service Prisma schema copy and migration command
- `infrastructure/pulumi/index.ts` - Added aiGatewayApiKey secret, agent-api service component, /api/gen ingress rules, GEN Service Binding comment, genUrl export
- `.github/workflows/deploy-services.yml` - Added services/agent/** and packages/agent-core/** to push paths

## Decisions Made
- **rialto-catalog excluded from Dockerfile**: The plan mentioned including rialto-catalog, but the actual agent service package.json has no dependency on it — only @mbe/agent-core and @mbe/types. Followed actual code requirements.
- **GEN Service Binding commented**: Activating the binding before the mattbutlerengineering-gen Worker exists in Phase 14 would cause a Pulumi deployment error (binding target not found). Left as commented entry per plan note.
- **DEFAULT_MODEL set to anthropic/claude-haiku-4.5**: Cost-optimized for generation requests (~$0.001/gen with prompt caching per plan research).

## Deviations from Plan

**1. [Rule 1 - Bug] Removed rialto-catalog from Dockerfile**
- **Found during:** Task 1 (creating Dockerfile)
- **Issue:** Plan instructed including packages/rialto-catalog in the Dockerfile, but @mbe/rialto-catalog is not a dependency in services/agent/package.json. Including it would add unnecessary build steps and fail if the package.json filtered dependency graph doesn't include it.
- **Fix:** Included only packages that are actual dependencies: @mbe/types, @mbe/config, @mbe/agent-core
- **Files modified:** services/agent/Dockerfile
- **Verification:** docker build --target builder succeeded without rialto-catalog
- **Committed in:** 10a2efe (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - corrected Dockerfile to match actual dependencies)
**Impact on plan:** Necessary correctness fix. The Dockerfile correctly reflects the agent service's actual workspace dependency graph.

## Issues Encountered
- None beyond the rialto-catalog deviation above

## User Setup Required
**External services require manual configuration before Pulumi can be applied.**

The `aiGatewayApiKey` Pulumi secret must be set before running `pulumi up`:

```bash
cd infrastructure/pulumi
pulumi config set --secret mbe-infrastructure:aiGatewayApiKey <key>
```

Obtain the key from: Vercel Dashboard > AI Gateway > Settings > API Keys > Create

## Next Phase Readiness
- Agent service has a complete deployment pipeline (Dockerfile + Pulumi + CI)
- Pulumi must be applied (`pulumi up`) and AI Gateway API key must be set before production deploy
- Phase 14 can activate the GEN Service Binding by uncommenting the entry in infrastructure/pulumi/index.ts

---
*Phase: 13-ai-generation-endpoint*
*Completed: 2026-03-27*
