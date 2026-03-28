---
phase: 18-gen-worker-pulumi-resource
plan: 01
subsystem: infra
tags: [pulumi, cloudflare, workers, static-assets, ci-cd, github-actions]

requires:
  - phase: 14-playground-app
    provides: apps/gen wrangler.toml and Worker deployment that Pulumi now manages

provides:
  - "@pulumi/cloudflare v6 with all existing resources migrated to v6 API names"
  - "gen Worker as a Pulumi WorkersScript resource with Static Assets (SPA notFoundHandling)"
  - "CI deploy-static.yml without gen wrangler deploy job"
  - "CI pulumi-up.yml with gen app build step before pulumi up"

affects:
  - any future infrastructure changes involving Cloudflare Workers

tech-stack:
  added:
    - "@pulumi/cloudflare v6.13.0 (upgraded from v5.49.0)"
  patterns:
    - "Unified WorkersScript bindings array with type field (replaces separate plainTextBindings/serviceBindings)"
    - "WorkersRoute uses script property (renamed from scriptName in v6)"
    - "Pulumi owns full gen Worker lifecycle — no wrangler for gen in CI"

key-files:
  created: []
  modified:
    - "infrastructure/pulumi/package.json"
    - "infrastructure/pulumi/index.ts"
    - ".github/workflows/deploy-static.yml"
    - ".github/workflows/pulumi-up.yml"
    - ".github/workflows/pulumi-preview.yml"

key-decisions:
  - "[18-01]: @pulumi/cloudflare v6 renames cloudflare.Record to cloudflare.DnsRecord — class name change only, no property changes"
  - "[18-01]: WorkersScript v6 uses unified bindings[] array with type field instead of separate plainTextBindings/serviceBindings arrays"
  - "[18-01]: WorkersRoute v6 uses script property instead of scriptName"
  - "[18-01]: WorkersScript v6 uses mainModule property (instead of module: true) for module syntax Workers"
  - "[18-01]: Gen Worker assets.directory path is relative to infrastructure/pulumi/ (../../apps/gen/dist)"
  - "[18-01]: pulumi-up.yml now triggers on apps/gen/** so gen source changes initiate a Pulumi redeploy with new assets"

patterns-established:
  - "Pulumi WorkersScript with assets.directory for static-site-only Workers (no content, no mainModule)"

requirements-completed: [INFRA-02]

duration: 4min
completed: 2026-03-28
---

# Phase 18 Plan 01: Gen Worker Pulumi Resource Summary

**@pulumi/cloudflare v5→v6 migration with gen Worker added as Pulumi-managed WorkersScript using Static Assets and SPA routing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T18:48:50Z
- **Completed:** 2026-03-28T18:53:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Upgraded @pulumi/cloudflare from v5.49.0 to v6.13.0 and migrated all v5 API names to v6 (DnsRecord, scriptName, script, unified bindings)
- Added gen Worker as a Pulumi-managed WorkersScript resource with Static Assets config matching wrangler.toml (SPA notFoundHandling)
- Removed deploy-gen job from CI (wrangler no longer deploys gen) and added gen build step to Pulumi CI so assets exist before pulumi up

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade @pulumi/cloudflare to v6 and add gen Worker resource** - `96c85d5` (feat)
2. **Task 2: Update CI workflows** - `d7893e8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `infrastructure/pulumi/package.json` - Bumped @pulumi/cloudflare to ^6.13.0
- `infrastructure/pulumi/index.ts` - Migrated to v6 API (DnsRecord, scriptName, unified bindings); added genWorker WorkersScript with assets config
- `.github/workflows/deploy-static.yml` - Removed deploy-gen job and all gen change detection
- `.github/workflows/pulumi-up.yml` - Added apps/gen/** trigger paths and Build gen app step with VITE_ env vars
- `.github/workflows/pulumi-preview.yml` - Added apps/gen/** and shared package trigger paths

## Decisions Made

- **v6 DnsRecord** — cloudflare.Record was renamed to cloudflare.DnsRecord in v6; only the class name changed, all properties remain the same
- **Unified bindings array** — v6 replaces separate plainTextBindings/serviceBindings with a single bindings[] array where each entry has a `type` field (`"plain_text"` or `"service"`)
- **WorkersRoute script property** — v6 renames `scriptName` to `script` on WorkersRoute (distinct from WorkersScript where `scriptName` is the right name)
- **mainModule for edge-router** — v6 replaces `module: true` with `mainModule: "edge-router.js"` to signal module syntax Worker
- **Gen Worker assets-only** — gen Worker uses only `assets.directory` with no `content`/`mainModule` (pure static asset Worker with SPA routing)
- **Relative path from pulumi dir** — assets.directory is `../../apps/gen/dist` (relative to `infrastructure/pulumi/`, which is the Pulumi work-dir)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The plan's interfaces section showed the v6 WorkersScript API but the v6 bindings restructuring (unified `bindings[]` array) was discovered by reading the actual type declarations. The existing edge-router's `plainTextBindings` and `serviceBindings` were migrated to the new format as part of Task 1.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18 is the final phase of v1.2 Generative UI milestone
- `pulumi up` must be run to apply the gen Worker resource to the Cloudflare stack (replaces the wrangler-deployed Worker)
- Before running `pulumi up`, ensure `apps/gen/dist/` exists (built by `pnpm build --filter=@mbe/gen`)
- The GEN Service Binding in the edge-router already references `mattbutlerengineering-gen` — the gen Worker must exist in the Pulumi stack before pulumi up succeeds

## Self-Check: PASSED

All files verified present. Both task commits verified in git log.

---
*Phase: 18-gen-worker-pulumi-resource*
*Completed: 2026-03-28*
