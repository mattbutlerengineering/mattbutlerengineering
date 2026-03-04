# Phase 2: Dashboard Rename - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename `apps/dashboard` to `apps/hospitality` — directory, package name, URL paths, Auth0 configuration, and Pulumi IaC — all atomically so auth and routing never break. Update all documentation references. Add a redirect from the old path. No feature changes, no Rialto migration (that's Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Naming & branding
- Name is "hospitality" everywhere: directory (`apps/hospitality`), package (`@mbe/hospitality`), URL path (`/hospitality`), page titles, PWA manifest name
- PWA manifest description updated to drop "dashboard": "Hospitality management — reservations, guests, and floor plans"
- All user-facing strings that say "dashboard" updated to "hospitality" (e.g., SettingsPage copy)
- Full doc sweep: CLAUDE.md, NEXT_STEPS.md, evaluations, planning docs — same approach as the web→marketing rename

### Auth0 transition
- Auth0 client renamed from `mattbutlerengineering-app` to `mattbutlerengineering-hospitality` (Pulumi resource name change — may trigger recreation and new client ID)
- Clean swap of callback URLs: replace `/dashboard/callback` with `/hospitality/callback` (both localhost and production). No dual-URL transition period.
- Logout URLs and web origins updated from `/dashboard` to `/hospitality`

### Redirect handling
- Add a 301 permanent redirect from `/dashboard/*` to `/hospitality/*` in Pulumi ingress rules
- Ensures old bookmarks and shared links continue to work

### Dev port & local environment
- Keep port 3002 for hospitality (no port reassignment)
- Update all dev workflow docs: "Hospitality: http://localhost:3002/hospitality"

### Claude's Discretion
- Pulumi export variable naming (dashboardClientId → hospitalityClientId, etc.) — rename for consistency
- Git approach for directory rename (git mv vs delete+create) — pick whichever preserves history better
- Deployment ordering strategy — ensure no outage window
- Verification approach — typecheck + any auth flow checks deemed necessary

</decisions>

<specifics>
## Specific Ideas

- Follow the same pattern as the web→marketing rename: one commit for code/config, one for doc updates
- Auth0 resource rename is the highest-risk change — if it triggers client ID recreation, all env vars referencing the old client ID must be updated simultaneously

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- The web→marketing rename just completed — same grep-and-replace pattern applies across docs
- Pulumi IaC already has the path-prefix routing pattern established for rialto-web

### Established Patterns
- Path-prefix routing: each app sets `base: "/<name>/"` in vite.config.ts
- BrowserRouter basename matches the Vite base path
- Auth0 callback URL pattern: `{origin}/<app-name>/callback`
- PWA manifest scope matches the base path

### Integration Points
- `apps/dashboard/vite.config.ts` — base path, PWA manifest (scope, start_url, name, description)
- `apps/dashboard/src/main.tsx` — Auth0 redirect URI, BrowserRouter basename
- `apps/dashboard/package.json` — package name @mbe/dashboard
- `infrastructure/pulumi/index.ts` — ingress rules, static site config, build command, env vars
- `infrastructure/pulumi/auth0.ts` — Auth0 client name, callback URLs, logout URLs, web origins, client grant
- `infrastructure/pulumi/README.md` — documentation
- `apps/dashboard/src/pages/SettingsPage.tsx` — user-facing "dashboard" text
- `pnpm-lock.yaml` — will regenerate after package.json name change
- Docs: CLAUDE.md, NEXT_STEPS.md, evaluations (frontend-meta-frameworks, monorepo-tooling), plans (platform-design, rialto-monorepo-integration), .planning/codebase/*.md

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-dashboard-rename*
*Context gathered: 2026-02-28*
