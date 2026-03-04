---
phase: 02-dashboard-rename
plan: 01
subsystem: infra
tags: [vite, react-router, pulumi, auth0, pwa, pnpm]

# Dependency graph
requires:
  - phase: 01-rialto-web-migration
    provides: rialto-web Pulumi ingress pattern (preservePathPrefix, BrowserRouter basename)
provides:
  - apps/hospitality directory with @mbe/hospitality package identity
  - Vite base /hospitality/ and PWA manifest updated to /hospitality
  - BrowserRouter basename /hospitality and Auth0 redirect URI /hospitality/callback
  - Auth0 client mattbutlerengineering-hospitality with /hospitality callback URLs
  - Pulumi ingress: 301 redirect from /dashboard, component rule for /hospitality
  - auth0Outputs.hospitalityClientId export (replaces dashboardClientId)
  - hospitalityUrl export in Pulumi (replaces dashboardUrl)
affects: [03-marketing-rialto-migration, 04-dashboard-rialto-migration, phase-3, phase-4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 301 redirect in DigitalOcean App Platform ingress for backward-compat path changes
    - Pulumi resource rename (delete+recreate) causes new Auth0 client_id — local .env needs manual update after pulumi up

key-files:
  created: []
  modified:
    - apps/hospitality/package.json
    - apps/hospitality/vite.config.ts
    - apps/hospitality/src/main.tsx
    - apps/hospitality/src/pages/SettingsPage.tsx
    - apps/hospitality/.env
    - apps/hospitality/.env.example
    - apps/marketing/src/components/Layout.tsx
    - apps/rialto-web/src/layouts/ShowcaseLayout.tsx
    - infrastructure/pulumi/auth0.ts
    - infrastructure/pulumi/index.ts
    - infrastructure/pulumi/README.md
    - pnpm-lock.yaml

key-decisions:
  - "301 redirect rule in Pulumi ingress preserves backward compat for /dashboard bookmarks and links"
  - "Auth0 Pulumi resource rename (mattbutlerengineering-app -> mattbutlerengineering-hospitality) will delete+recreate the client, generating a new client_id — local .env needs manual update after pulumi up"
  - "Remaining 'dashboard' word occurrences in docs, rialto demo pages, and generic CLI copy are not app-path references and were left unchanged"

patterns-established:
  - "Pulumi ingress rename pattern: add 301 redirect rule for old path before adding new component rule — order: /api, /old-path (redirect), /new-path (component), /rialto, / (catch-all)"

requirements-completed: [HOSP-01, HOSP-02, HOSP-03, HOSP-04, INFRA-01, INFRA-02, INFRA-03]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 2 Plan 1: Dashboard Rename Summary

**apps/dashboard renamed to apps/hospitality with @mbe/hospitality package, Vite base /hospitality/, Auth0 IaC updated to mattbutlerengineering-hospitality, and 301 redirect from /dashboard added to Pulumi ingress**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T18:08:38Z
- **Completed:** 2026-02-28T18:11:55Z
- **Tasks:** 3
- **Files modified:** 12 (plus 41 renames via git mv)

## Accomplishments

- Renamed apps/dashboard to apps/hospitality via git mv (preserves git history)
- Updated all app-level configs: package.json, vite.config.ts, main.tsx, .env, .env.example, SettingsPage.tsx, and cross-app links
- Rewrote Pulumi IaC: Auth0 client renamed, auth0Outputs updated, ingress rules updated with 301 redirect, static site entry renamed, export variables renamed
- pnpm build --filter=@mbe/hospitality and @mbe/hospitality typecheck both pass cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename directory and update all app-level files** - `dbc3667` (feat)
2. **Task 2: Update Pulumi IaC — Auth0 client, ingress rules, static site, exports** - `9a4eeec` (feat)
3. **Task 3: Run full verification** - no commit (verification only, no file changes)

## Files Created/Modified

- `apps/hospitality/package.json` - Package name changed to @mbe/hospitality
- `apps/hospitality/vite.config.ts` - base, PWA manifest name/short_name/scope/start_url updated to /hospitality/
- `apps/hospitality/src/main.tsx` - BrowserRouter basename and Auth0 redirectUri fallback updated to /hospitality
- `apps/hospitality/src/pages/SettingsPage.tsx` - "dashboard" UI copy changed to "app"
- `apps/hospitality/.env` - VITE_AUTH_REDIRECT_URI updated to /hospitality/callback
- `apps/hospitality/.env.example` - VITE_AUTH_REDIRECT_URI updated to /hospitality/callback
- `apps/marketing/src/components/Layout.tsx` - Sign In href changed to /hospitality
- `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` - Footer link label and href updated to Hospitality/hospitality
- `infrastructure/pulumi/auth0.ts` - Auth0 client, grant, and auth0Outputs renamed to hospitality
- `infrastructure/pulumi/index.ts` - Ingress 301 redirect + /hospitality rule, static site entry, hospitalityUrl export
- `infrastructure/pulumi/README.md` - "What Gets Created" table updated with hospitality and rialto-web
- `pnpm-lock.yaml` - Regenerated with new @mbe/hospitality package name

## Decisions Made

- **301 redirect in Pulumi ingress:** Added a redirect rule from `/dashboard` to `/hospitality` (HTTP 301) before the new `/hospitality` component rule. This preserves backward compatibility for any bookmarks or external links pointing to the old path.
- **Auth0 resource rename note:** Renaming the Pulumi resource from `"mattbutlerengineering-app"` to `"mattbutlerengineering-hospitality"` causes Pulumi to delete and recreate the Auth0 client, generating a new `client_id`. After `pulumi up`, the local `.env` file (`VITE_AUTH_CLIENT_ID`) will need manual update with the new client ID.
- **Remaining "dashboard" word occurrences:** Words like "dashboards" in marketing prose, demo page named "Dashboard" in rialto-web showcase, generic CLI text "Sign in to the dashboard", and Traefik dashboard reference in docker-compose.yml are generic English usage — not app-path references. Left unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm typecheck` (full monorepo) fails for `@mbe/reservations-service` and `@mbe/users-service` due to Prisma client not generated (missing `user`, `venue`, `venueGroup` models in the generated client). These are pre-existing issues completely unrelated to the dashboard rename. The `@mbe/hospitality`, `@mbe/marketing`, `@mbe/rialto-web`, and `@mbe/infrastructure` packages all typecheck cleanly.

## User Setup Required

**After running `pulumi up`:** The Auth0 client is being renamed from `mattbutlerengineering-app` to `mattbutlerengineering-hospitality`. Pulumi will delete the old client and create a new one with a new `client_id`. After deployment:

1. Run `pulumi stack output` to get the new client ID
2. Update `apps/hospitality/.env`: `VITE_AUTH_CLIENT_ID=<new_client_id>`
3. Restart the dev server

The production deployment via Pulumi static site envs will automatically use the new client ID.

## Next Phase Readiness

- apps/hospitality is fully renamed and verified — ready for Phase 4 Rialto migration work
- The 301 redirect from /dashboard ensures users with old bookmarks will be redirected automatically
- Pulumi IaC is consistent: ingress rules, static site config, and Auth0 config all reference /hospitality
- Pre-existing Prisma typecheck failures in services (unrelated to this rename) should be addressed in a separate task

## Self-Check: PASSED

- apps/hospitality/package.json: FOUND
- infrastructure/pulumi/auth0.ts: FOUND
- infrastructure/pulumi/index.ts: FOUND
- 02-01-SUMMARY.md: FOUND
- Commit dbc3667 (Task 1): FOUND
- Commit 9a4eeec (Task 2): FOUND

---
*Phase: 02-dashboard-rename*
*Completed: 2026-02-28*
