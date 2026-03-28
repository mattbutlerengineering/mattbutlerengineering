---
phase: 14-playground-app
plan: 03
subsystem: infra
tags: [cloudflare-workers, github-actions, pulumi, edge-router, service-binding, ci-cd]

requires:
  - phase: 14-playground-app/14-02
    provides: apps/gen wrangler.toml + built gen SPA ready for deployment

provides:
  - CI/CD deploy-gen job in deploy-static.yml triggers on apps/gen/** changes
  - Edge router /gen/* route via GEN Service Binding (CDN-free)
  - Pulumi GEN Service Binding uncommeted and active (mattbutlerengineering-gen)

affects:
  - 15-playground-features
  - 16-generative-ui-streaming

tech-stack:
  added: []
  patterns:
    - "deploy-gen CI job follows identical pattern to deploy-hospitality (build filter + wrangler deploy)"
    - "Edge router else-if chain: /hospitality → /rialto → /gen → marketing (catch-all)"

key-files:
  created:
    - apps/gen/.env.example
  modified:
    - .github/workflows/deploy-static.yml
    - infrastructure/worker/edge-router.js
    - infrastructure/pulumi/index.ts
    - infrastructure/pulumi/auth0.ts

key-decisions:
  - "[14-03]: GEN Service Binding uncommented — apps/gen wrangler.toml created in 14-02, Worker can now be deployed"
  - "[14-03]: deploy-gen detects changes to packages/rialto-catalog/** in addition to apps/gen/** — gen depends on catalog"
  - "[14-03]: wrangler deploy must run before pulumi up — Worker must exist before Service Binding can reference it"
  - "[14-03]: Auth0 gen URLs added to shared auth0.ts alongside hospitality; gen app can share or get its own CLIENT_ID"

patterns-established:
  - "New static app deploy pattern: add path filter to on.push.paths + detect-changes output + paths-filter block + deploy job"

requirements-completed:
  - PLAY-01
  - PLAY-03

duration: 2min
completed: 2026-03-28
---

# Phase 14 Plan 03: Gen App CI/CD and Edge Router Summary

**CI/CD deploy pipeline for apps/gen via deploy-static.yml, /gen/* edge routing via Service Binding, and Pulumi GEN binding — completing the production infrastructure for mattbutlerengineering.com/gen**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-28T16:01:19Z
- **Completed:** 2026-03-28T16:15:00Z
- **Tasks:** 2 of 2 complete (1 auto + 1 checkpoint:human-verify — approved)
- **Files modified:** 5

## Accomplishments

- Added `deploy-gen` CI job to deploy-static.yml with Auth0 env vars, build filter, and wrangler deploy step
- Added `apps/gen/**` and `packages/rialto-catalog/**` to push path triggers and detect-changes filters
- Added `/gen` route to edge-router.js routing gen traffic to `env.GEN` Service Binding
- Uncommented GEN Service Binding in pulumi/index.ts (`mattbutlerengineering-gen`)
- Added gen callback/logout/origin URLs to infrastructure/pulumi/auth0.ts alongside hospitality
- Created apps/gen/.env.example with VITE_AUTH_* template variables for local development

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gen deploy job to CI and update edge router + Pulumi** - `469ccb9` (feat)
2. **Task 2: Checkpoint files — gen .env.example and Auth0 gen URLs** - `98f8a82` (feat)

## Files Created/Modified

- `.github/workflows/deploy-static.yml` - Added gen path filters, detect-changes output, and deploy-gen job
- `infrastructure/worker/edge-router.js` - Added /gen route (before marketing catch-all), updated JSDoc
- `infrastructure/pulumi/index.ts` - Uncommented GEN Service Binding
- `infrastructure/pulumi/auth0.ts` - Added gen callback, logout URL, and web origin alongside hospitality
- `apps/gen/.env.example` - VITE_AUTH_* environment variable template for local development

## Decisions Made

- GEN Service Binding is now uncommented because the wrangler.toml was created in 14-02 and the Worker can be deployed via CI before `pulumi up` runs
- `packages/rialto-catalog/**` added to gen path filter since the playground depends on the catalog for JSON schema rendering
- Deploy ordering note preserved in plan: `wrangler deploy` must precede `pulumi up` (CI handles this naturally)
- Auth0 gen URLs added to existing auth0.ts alongside hospitality rather than creating a new Pulumi resource — gen app can use AUTH0_GEN_CLIENT_ID secret to point at its own Auth0 application

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

Before production deployment works end-to-end:

1. **Auth0 SPA app** — Create "mattbutlerengineering-gen" application in Auth0 Dashboard
   - Type: Single Page Application
   - Allowed Callback URLs: `https://mattbutlerengineering.com/gen/callback`
   - Allowed Logout URLs: `https://mattbutlerengineering.com/gen`
   - Allowed Web Origins: `https://mattbutlerengineering.com/gen`

2. **GitHub secret** — Add `AUTH0_GEN_CLIENT_ID` with the Auth0 client ID from step 1

3. **First deploy** — Either push a change to `apps/gen/**` to trigger CI, or run manually:
   ```bash
   # Must happen BEFORE pulumi up
   npx wrangler@3 deploy --config apps/gen/wrangler.toml

   # Then activate the GEN Service Binding
   cd infrastructure/pulumi && pulumi up
   ```

4. **Verify** — `https://mattbutlerengineering.com/gen` should serve the playground login page

## Next Phase Readiness

- All Phase 14 infrastructure is complete — CI, edge router, and Pulumi are ready
- Checkpoint:human-verify approved — user confirmed local dev and build work
- Phase 15 (playground features / UI polish) can begin immediately
- Production serve requires user to complete the setup checklist above (Auth0 app, GitHub secret, wrangler deploy, pulumi up)
- Remaining Phase 13 blocker still pending: `pulumi up` to deploy agent-api to DO App Platform (required for streaming generation in production)

## Self-Check: PASSED

- FOUND: `.planning/phases/14-playground-app/14-03-SUMMARY.md`
- FOUND: commit `469ccb9` (feat(14-03): add gen CI deploy job, edge router route, and Pulumi GEN binding)
- FOUND: commit `98f8a82` (feat(14-03): add gen .env.example and Auth0 gen URLs to Pulumi)
- FOUND: `deploy-gen` job in `.github/workflows/deploy-static.yml`
- FOUND: `env.GEN` route in `infrastructure/worker/edge-router.js`
- FOUND: GEN Service Binding in `infrastructure/pulumi/index.ts` (uncommented)
- FOUND: `apps/gen/.env.example`
- FOUND: gen URLs in `infrastructure/pulumi/auth0.ts`

---
*Phase: 14-playground-app*
*Completed: 2026-03-28*
