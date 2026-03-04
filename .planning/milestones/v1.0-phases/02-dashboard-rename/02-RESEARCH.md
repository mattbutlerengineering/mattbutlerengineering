# Phase 2: Dashboard Rename - Research

**Researched:** 2026-02-28
**Domain:** Monorepo app rename — directory, package name, URL paths, Auth0 IaC, Pulumi ingress
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Name is "hospitality" everywhere: directory (`apps/hospitality`), package (`@mbe/hospitality`), URL path (`/hospitality`), page titles, PWA manifest name
- PWA manifest description updated to: "Hospitality management — reservations, guests, and floor plans"
- All user-facing strings that say "dashboard" updated to "hospitality" (e.g., SettingsPage copy)
- Full doc sweep: CLAUDE.md, NEXT_STEPS.md, evaluations, planning docs — same approach as the web→marketing rename
- Auth0 client renamed from `mattbutlerengineering-app` to `mattbutlerengineering-hospitality` (Pulumi resource name change — may trigger recreation and new client ID)
- Clean swap of callback URLs: replace `/dashboard/callback` with `/hospitality/callback` (both localhost and production). No dual-URL transition period.
- Logout URLs and web origins updated from `/dashboard` to `/hospitality`
- Add a 301 permanent redirect from `/dashboard/*` to `/hospitality/*` in Pulumi ingress rules
- Keep port 3002 for hospitality (no port reassignment)
- Update all dev workflow docs: "Hospitality: http://localhost:3002/hospitality"

### Claude's Discretion

- Pulumi export variable naming (dashboardClientId → hospitalityClientId, etc.) — rename for consistency
- Git approach for directory rename (git mv vs delete+create) — pick whichever preserves history better
- Deployment ordering strategy — ensure no outage window
- Verification approach — typecheck + any auth flow checks deemed necessary

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOSP-01 | Directory renamed from `apps/dashboard` to `apps/hospitality` | git mv strategy confirmed; pnpm workspace auto-discovers by glob `apps/*` |
| HOSP-02 | Package name updated from `@mbe/dashboard` to `@mbe/hospitality` | package.json name field change + pnpm-lock.yaml regeneration |
| HOSP-03 | URL path changed from `/dashboard` to `/hospitality` (Vite base, React Router basename) | vite.config.ts base field + BrowserRouter basename in main.tsx |
| HOSP-04 | Auth0 callback URL updated to `/hospitality/callback` in Pulumi IaC | auth0.ts callback/logout/origin arrays; client resource name change triggers recreation |
| INFRA-01 | Pulumi ingress rules for `/rialto`, `/hospitality`, and `/` | index.ts ingress block; existing pattern confirmed; redirect rule for /dashboard |
| INFRA-02 | SPA fallback (catchallDocument) configured per app | Already configured as `catchallDocument: "index.html"` in existing dashboard static site |
| INFRA-03 | Vite `base`, React Router `basename`, and Pulumi ingress in sync per app | All three must match: `/hospitality/`; prior rialto-web pattern is the model |

</phase_requirements>

## Summary

This is a pure rename operation with no feature changes. The dashboard app exists at `apps/dashboard` with package name `@mbe/dashboard`, Vite base `/dashboard/`, BrowserRouter basename `/dashboard`, and a Pulumi IaC configuration that wires up Auth0 callbacks, ingress routing, and build commands — all referencing "dashboard". Every one of these must change atomically to "hospitality" so that auth and routing never enter an inconsistent state.

The highest-risk element is the Auth0 Pulumi resource rename. Changing the Pulumi logical name from `mattbutlerengineering-app` to `mattbutlerengineering-hospitality` will cause Pulumi to delete-and-recreate the Auth0 client, generating a new `client_id`. This means: (1) the `.env` file must be updated before any local dev attempt, and (2) the DigitalOcean static site's `VITE_AUTH_CLIENT_ID` env must be updated in the same `pulumi up` that changes the Auth0 client — both happen atomically in one deploy. No manual Auth0 dashboard intervention is needed since Auth0 is fully managed by Pulumi.

The DigitalOcean App Platform's `AppSpecIngressRuleRedirect` interface supports `redirectCode: 301` and a `uri` field for the destination path. This means a proper 301 `/dashboard/*` → `/hospitality/*` redirect can be expressed as a Pulumi ingress rule without any external proxy or Cloudflare Worker. The existing codebase does not yet use redirect rules, but the provider SDK (v4.56.0) fully supports them.

**Primary recommendation:** Execute the rename in two commits — Commit 1: all code, config, env, and IaC changes (the atomic functional change); Commit 2: all documentation updates. Follow the exact same two-commit pattern used for the web→marketing rename.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@pulumi/digitalocean` | 4.56.0 (installed) | DigitalOcean App Platform IaC | Already in use; `AppSpecIngressRuleRedirect` confirmed in types |
| `@pulumi/auth0` | 3.11.0 (installed) | Auth0 resource management | Already in use; renaming resource triggers delete+recreate |
| Vite | 7.x (installed) | Frontend build tool; `base` config sets URL prefix | Already in use |
| React Router DOM | 7.x (installed) | Client-side routing; `BrowserRouter basename` sets path prefix | Already in use |
| vite-plugin-pwa | 1.2.0 (installed) | PWA manifest; `scope` and `start_url` must match base | Already in use |

### No New Dependencies

This phase introduces zero new packages. Every tool needed is already installed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pulumi ingress redirect rule | Cloudflare redirect rule | Pulumi is simpler since IaC is already the source of truth; no reason to split routing across two systems |
| `git mv` | Delete + recreate | `git mv` preserves file history; preferred |

## Architecture Patterns

### Recommended Project Structure (after rename)

```
apps/
├── marketing/          # Unchanged
├── hospitality/        # Renamed from dashboard/; all internals identical
└── rialto-web/         # Unchanged
```

### Pattern 1: Path-Prefix SPA — The Established Pattern

**What:** Each app sets `base: "/<name>/"` in vite.config.ts, `basename="/<name>"` in BrowserRouter, and a matching ingress rule in Pulumi. The rialto-web app is the proven model.

**When to use:** All non-root SPAs in this monorepo.

**Current dashboard implementation (to be changed):**
```typescript
// apps/dashboard/vite.config.ts
base: "/dashboard/",
manifest: {
  name: "MBE Dashboard",
  short_name: "Dashboard",
  scope: "/dashboard/",
  start_url: "/dashboard/",
},

// apps/dashboard/src/main.tsx
<BrowserRouter basename="/dashboard">
  redirectUri: window.location.origin + "/dashboard/callback",
```

**After rename (hospitality):**
```typescript
// apps/hospitality/vite.config.ts
base: "/hospitality/",
manifest: {
  name: "MBE Hospitality",
  short_name: "Hospitality",
  description: "Hospitality management — reservations, guests, and floor plans",
  scope: "/hospitality/",
  start_url: "/hospitality/",
},

// apps/hospitality/src/main.tsx
<BrowserRouter basename="/hospitality">
  redirectUri: window.location.origin + "/hospitality/callback",
```

### Pattern 2: Pulumi Auth0 Client Resource Rename

**What:** Changing the Pulumi logical resource name causes Pulumi to treat it as a delete-then-create. The old Auth0 client is deleted and a new one is created with a new `client_id`.

**Critical implication:** All consumers of the `client_id` must be updated in the same `pulumi up`:
- `VITE_AUTH_CLIENT_ID` in the hospitality static site env
- `VITE_AUTH_CLIENT_ID` in the marketing static site env
- Local `.env` file

Both static sites in Pulumi already reference `auth0Outputs.dashboardClientId` (which becomes `auth0Outputs.hospitalityClientId`). Since they're in the same Pulumi program, they'll pick up the new client ID automatically in the same deploy.

**Auth0 resource rename pattern:**
```typescript
// BEFORE: infrastructure/pulumi/auth0.ts
export const dashboardApp = new auth0.Client("mattbutlerengineering-app", {
  name: "mattbutlerengineering-app",
  callbacks: ["http://localhost:3002/dashboard/callback", ...],
  allowedLogoutUrls: ["http://localhost:3002/dashboard", ...],
});
export const auth0Outputs = {
  dashboardClientId: dashboardApp.clientId,
};

// AFTER: infrastructure/pulumi/auth0.ts
export const hospitalityApp = new auth0.Client("mattbutlerengineering-hospitality", {
  name: "mattbutlerengineering-hospitality",
  callbacks: ["http://localhost:3002/hospitality/callback", ...],
  allowedLogoutUrls: ["http://localhost:3002/hospitality", ...],
});
export const auth0Outputs = {
  hospitalityClientId: hospitalityApp.clientId,
};
```

### Pattern 3: DigitalOcean Ingress Redirect Rule

**What:** The `AppSpecIngressRuleRedirect` type in `@pulumi/digitalocean` supports `redirectCode: 301` and `uri` for destination. The rule uses `match.path.prefix` to catch all `/dashboard` requests and redirects to `/hospitality`.

**Verified from SDK types** (`infrastructure/pulumi/node_modules/@pulumi/digitalocean/types/input.d.ts`):
```typescript
export interface AppSpecIngressRuleRedirect {
  authority?: pulumi.Input<string>;    // target host (omit = same host)
  port?: pulumi.Input<number>;
  redirectCode?: pulumi.Input<number>; // 301, 302, 307, 308, etc.
  scheme?: pulumi.Input<string>;       // "http" | "https"
  uri?: pulumi.Input<string>;          // destination path
}
```

**Redirect rule pattern for Pulumi ingress:**
```typescript
// Add BEFORE the /hospitality rule in the ingress.rules array
{
  match: {
    path: {
      prefix: "/dashboard",
    },
  },
  redirect: {
    uri: "/hospitality",
    redirectCode: 301,
  },
},
```

**Note:** The `uri` field is the destination path. DigitalOcean App Platform redirect rules rewrite the matched prefix, not append it. To preserve sub-paths (e.g., `/dashboard/reservations` → `/hospitality/reservations`), verify whether DO strips-and-replaces or whether only the prefix is swapped. Based on DO documentation patterns, `uri: "/hospitality"` redirects to that exact URI for all matches — sub-path preservation may require client-side JavaScript or a more complex rule. This is an open question (see Open Questions section).

### Pattern 4: Pulumi Ingress — Full Updated Block

```typescript
ingress: {
  rules: [
    {
      match: { path: { prefix: "/api" } },
      component: { name: "users-api", preservePathPrefix: false },
    },
    // NEW: 301 redirect from old /dashboard path
    {
      match: { path: { prefix: "/dashboard" } },
      redirect: { uri: "/hospitality", redirectCode: 301 },
    },
    // RENAMED: was "dashboard", now "hospitality"
    {
      match: { path: { prefix: "/hospitality" } },
      component: { name: "hospitality", preservePathPrefix: false },
    },
    {
      match: { path: { prefix: "/rialto" } },
      component: { name: "rialto-web", preservePathPrefix: false },
    },
    {
      match: { path: { prefix: "/" } },
      component: { name: "marketing" },
    },
  ],
},
```

### Anti-Patterns to Avoid

- **Renaming only the directory without updating IaC first:** If code is deployed under the new path but Auth0 still only allows `/dashboard/callback`, login will break. Change must be atomic.
- **Forgetting the `pnpm-lock.yaml` regeneration:** Changing `package.json` name from `@mbe/dashboard` to `@mbe/hospitality` will cause lockfile inconsistency. Run `pnpm install` after renaming to regenerate it.
- **Leaving the marketing app's `<a href="/dashboard">` link:** After the rename, this link will hit the 301 redirect but it's better to update it directly to avoid user-visible latency on a primary nav link.
- **Not updating `.env` before testing locally:** After Auth0 client is recreated by Pulumi, the `client_id` changes. The local `.env` file is not managed by Pulumi and must be manually updated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 301 redirect from /dashboard | Custom Cloudflare Worker or nginx rule | `AppSpecIngressRuleRedirect` in Pulumi | Already in the provider; IaC keeps everything in one place |
| Auth0 client management | Manual Auth0 dashboard changes | `@pulumi/auth0` Pulumi resource | IaC is already the source of truth; manual changes would drift |

**Key insight:** This phase is 100% configuration and rename, not new code. The entire implementation is grep-and-replace plus Pulumi resource updates.

## Common Pitfalls

### Pitfall 1: Auth0 Client ID Changes After Pulumi Resource Rename

**What goes wrong:** After running `pulumi up`, the Auth0 client gets a new `client_id`. If the local `.env` (`VITE_AUTH_CLIENT_ID`) still has the old value, login fails locally with an "Unknown or invalid client" error.

**Why it happens:** Pulumi's logical resource rename triggers delete+recreate of the Auth0 Client resource. The new resource gets a fresh client ID.

**How to avoid:** After `pulumi up`, run `pulumi stack output` to get the new `auth0ClientId` output, then update `.env` accordingly.

**Warning signs:** Auth0 login page shows "Something went wrong" or "Unknown or invalid client" — this is the symptom of stale client ID.

### Pitfall 2: pnpm Workspace Filter Commands Cached with Old Name

**What goes wrong:** Scripts and Claude tools using `pnpm --filter @mbe/dashboard` will fail silently or not resolve the package after the rename.

**Why it happens:** pnpm workspace filter uses the `name` field from `package.json`. After rename, the old filter name no longer resolves.

**How to avoid:** Update `.claude/settings.local.json` allowedTools entries from `@mbe/dashboard` to `@mbe/hospitality`. Also update any CI scripts or documentation that reference the old filter name.

### Pitfall 3: PWA Service Worker Scope Mismatch

**What goes wrong:** If the old PWA service worker (registered under `/dashboard/` scope) is cached in a user's browser, it may conflict with the new registration under `/hospitality/` scope.

**Why it happens:** PWA service workers are scoped by path. If a browser has an old service worker registered at `/dashboard/`, it continues serving cached assets for that path even after the app moves.

**How to avoid:** The 301 redirect at `/dashboard/*` means browsers navigating to the old path will be redirected before any service worker can intercept. New registrations will use `/hospitality/` scope. This is acceptable for a dev-phase app with no real users yet. In production with real users, a service worker unregister step would be needed.

**Warning signs:** PWA install banner appears at wrong path, or old cached content shows after rename.

### Pitfall 4: Marketing App's Hard-Coded `/dashboard` Link

**What goes wrong:** The `<a href="/dashboard">` in `apps/marketing/src/components/Layout.tsx` will work via the 301 redirect, but adds an unnecessary round-trip and leaves the old path in source.

**Why it happens:** The marketing app directly links to the dashboard by hardcoded path.

**How to avoid:** Change to `/hospitality` as part of the code commit.

### Pitfall 5: Ordering of Ingress Rules — Redirect Before Component

**What goes wrong:** If the `/dashboard` redirect rule appears AFTER the `/hospitality` component rule, and if the routing system matches `/dashboard` by some other rule, requests may not redirect correctly.

**Why it happens:** DigitalOcean App Platform ingress processes rules in order, most-specific-first by convention.

**How to avoid:** Place the `/dashboard` redirect rule immediately before or after the `/hospitality` component rule, but BEFORE the catch-all `/` rule. Verified pattern: specific paths first, catch-all last.

## Code Examples

Verified from codebase inspection (all paths are absolute from repo root):

### Vite Config — Before and After

```typescript
// BEFORE: apps/dashboard/vite.config.ts
manifest: {
  name: "MBE Dashboard",
  short_name: "Dashboard",
  description: "Hospitality management dashboard for reservations, guests, and floor plans",
  scope: "/dashboard/",
  start_url: "/dashboard/",
},
base: "/dashboard/",

// AFTER: apps/hospitality/vite.config.ts
manifest: {
  name: "MBE Hospitality",
  short_name: "Hospitality",
  description: "Hospitality management — reservations, guests, and floor plans",
  scope: "/hospitality/",
  start_url: "/hospitality/",
},
base: "/hospitality/",
```

### main.tsx — Before and After

```typescript
// BEFORE: apps/dashboard/src/main.tsx
const authConfig = {
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? window.location.origin + "/dashboard/callback",
};
<BrowserRouter basename="/dashboard">

// AFTER: apps/hospitality/src/main.tsx
const authConfig = {
  redirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? window.location.origin + "/hospitality/callback",
};
<BrowserRouter basename="/hospitality">
```

### package.json — Name Change

```json
// BEFORE: apps/dashboard/package.json
{ "name": "@mbe/dashboard" }

// AFTER: apps/hospitality/package.json
{ "name": "@mbe/hospitality" }
```

### Pulumi Static Site — Before and After

```typescript
// BEFORE: infrastructure/pulumi/index.ts
{
  name: "dashboard",
  buildCommand: "pnpm build --filter=@mbe/dashboard",
  outputDir: "apps/dashboard/dist",
  envs: [
    { key: "VITE_AUTH_REDIRECT_URI", value: `https://${domain}/dashboard/callback` },
    { key: "VITE_AUTH_CLIENT_ID", value: auth0Outputs.dashboardClientId },
  ],
}

// AFTER: infrastructure/pulumi/index.ts
{
  name: "hospitality",
  buildCommand: "pnpm build --filter=@mbe/hospitality",
  outputDir: "apps/hospitality/dist",
  envs: [
    { key: "VITE_AUTH_REDIRECT_URI", value: `https://${domain}/hospitality/callback` },
    { key: "VITE_AUTH_CLIENT_ID", value: auth0Outputs.hospitalityClientId },
  ],
}
```

### Pulumi Export Variables — Before and After

```typescript
// BEFORE: infrastructure/pulumi/index.ts
export const auth0ClientId = auth0Outputs.dashboardClientId;
export const dashboardUrl = pulumi.interpolate`https://${domain}/dashboard`;

// AFTER: infrastructure/pulumi/index.ts
export const auth0ClientId = auth0Outputs.hospitalityClientId;
export const hospitalityUrl = pulumi.interpolate`https://${domain}/hospitality`;
```

### SettingsPage — User-Facing Copy

```tsx
// BEFORE: apps/dashboard/src/pages/SettingsPage.tsx (line 128)
Choose how the dashboard looks to you

// AFTER: apps/hospitality/src/pages/SettingsPage.tsx (line 128)
Choose how the app looks to you
```

### Marketing Layout — Nav Link

```tsx
// BEFORE: apps/marketing/src/components/Layout.tsx
<a href="/dashboard"><Button size="sm">Sign In</Button></a>

// AFTER: apps/marketing/src/components/Layout.tsx
<a href="/hospitality"><Button size="sm">Sign In</Button></a>
```

### Rialto-Web Showcase Layout — Footer Link

```tsx
// BEFORE: apps/rialto-web/src/layouts/ShowcaseLayout.tsx
{ label: "Dashboard", href: "https://mattbutlerengineering.com/dashboard" }

// AFTER: apps/rialto-web/src/layouts/ShowcaseLayout.tsx
{ label: "Hospitality", href: "https://mattbutlerengineering.com/hospitality" }
```

### .env File — Before and After

```bash
# BEFORE: apps/dashboard/.env and apps/dashboard/.env.example
VITE_AUTH_REDIRECT_URI=http://localhost:3002/dashboard/callback

# AFTER: apps/hospitality/.env and apps/hospitality/.env.example
VITE_AUTH_REDIRECT_URI=http://localhost:3002/hospitality/callback
```

## Complete File Change Inventory

This is the exhaustive list of files that must change, grouped by commit:

### Commit 1: Code, Config, IaC (Functional Changes)

**Directory rename:**
- `apps/dashboard/` → `apps/hospitality/` (via `git mv`)

**In the renamed directory:**
- `apps/hospitality/package.json` — name: `@mbe/hospitality`
- `apps/hospitality/vite.config.ts` — base, PWA name/short_name/description/scope/start_url
- `apps/hospitality/src/main.tsx` — BrowserRouter basename, redirectUri fallback
- `apps/hospitality/src/pages/SettingsPage.tsx` — user-facing "dashboard" → "app"
- `apps/hospitality/.env` — VITE_AUTH_REDIRECT_URI
- `apps/hospitality/.env.example` — VITE_AUTH_REDIRECT_URI

**Infrastructure:**
- `infrastructure/pulumi/auth0.ts` — client resource name, callbacks, logoutUrls, webOrigins, export variable names
- `infrastructure/pulumi/index.ts` — ingress rules (add redirect, rename component), static site config, export var names

**Cross-app links:**
- `apps/marketing/src/components/Layout.tsx` — href `/dashboard` → `/hospitality`
- `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` — Dashboard href → Hospitality href

**Settings:**
- `.claude/settings.local.json` — `@mbe/dashboard` filter → `@mbe/hospitality`

**Run after rename:**
- `pnpm install` — regenerates `pnpm-lock.yaml` with new package name

### Commit 2: Documentation Updates

- `CLAUDE.md` — URL table row, directory layout, dev access point
- `docs/ARCHITECTURE.md` — all path/component references
- `docs/NEXT_STEPS.md` — app list, URL table
- `docs/evaluations/2026-02-26-frontend-meta-frameworks.md` — `apps/dashboard/` references
- `docs/evaluations/2026-02-26-auth-providers.md` — `apps/dashboard/src/main.tsx` reference
- `docs/evaluations/2026-02-26-monorepo-tooling.md` — `@mbe/dashboard` reference
- `docs/evaluations/2026-02-26-analytics-feature-flags.md` — "dashboard app" references
- `docs/evaluations/2026-02-26-e2e-testing.md` — dashboard app reference
- `docs/plans/2026-01-22-platform-design.md` — `/dashboard` path references
- `docs/plans/2026-02-25-rialto-monorepo-integration.md` — `apps/dashboard` references
- `.planning/codebase/ARCHITECTURE.md` — dashboard references
- `.planning/codebase/STRUCTURE.md` — dashboard references
- `.planning/codebase/STACK.md` — `apps/dashboard` references
- `.planning/codebase/CONCERNS.md` — `apps/dashboard/` file paths
- `.claude/skills/auth-package/SKILL.md` — `/dashboard/callback` example
- `infrastructure/pulumi/README.md` — dashboard entry in resources table

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Auth0 config | Pulumi IaC (`@pulumi/auth0`) | Existing | Auth0 state is code, not drift |
| No path redirect | `AppSpecIngressRuleRedirect` in Pulumi | This phase | Bookmarks and shared links continue working |

**Deprecated/outdated:**
- DigitalOcean App Platform previously had limited ingress rule support. Current provider v4.56.0 has full redirect rule support including `redirectCode` and `uri`.

## Open Questions

1. **Does DO App Platform's redirect `uri` preserve sub-paths?**
   - What we know: The `AppSpecIngressRuleRedirect.uri` field accepts a path string. The docs say "An optional URI path to redirect to."
   - What's unclear: Whether `/dashboard/reservations` → `/hospitality/reservations` (prefix swap) or `/dashboard/reservations` → `/hospitality` (exact URI, losing sub-path).
   - Recommendation: Given the app is not yet in production with real users, the simpler approach — `uri: "/hospitality"` — is acceptable. Old `/dashboard` bookmarks will land on the hospitality home page rather than the exact sub-page. This is fine for a dev-phase app. If sub-path preservation is needed in future, a Cloudflare Transform Rule can handle it.

2. **Will the DigitalOcean static site component name change (`dashboard` → `hospitality`) trigger a zero-downtime redeploy or a brief gap?**
   - What we know: Renaming a static site component in DO App Platform causes the old component to be deleted and a new one created.
   - What's unclear: Whether DO handles this atomically or if there's a gap window.
   - Recommendation: Run `pulumi up` during low-traffic time. The 301 redirect rule for `/dashboard` will be added in the same deploy, so old-path visitors are covered. New-path visitors may see a brief build/deploy gap for the new component.

## Validation Architecture

> `workflow.nyquist_validation` is not set in config.json (absent = false). Skipping this section.

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `apps/dashboard/vite.config.ts`, `apps/dashboard/src/main.tsx`, `apps/dashboard/package.json`, `apps/dashboard/src/pages/SettingsPage.tsx` — current state verified by direct file read
- Codebase inspection: `infrastructure/pulumi/auth0.ts`, `infrastructure/pulumi/index.ts` — current IaC state verified by direct file read
- SDK types: `infrastructure/pulumi/node_modules/@pulumi/digitalocean/types/input.d.ts` — `AppSpecIngressRuleRedirect` interface verified with redirectCode and uri fields
- SDK version: `@pulumi/digitalocean@4.56.0` (installed, confirmed)
- Git log: web→marketing rename pattern (`2a2bf28`) — confirmed two-commit approach (code+docs separate)
- Cross-app files: `apps/marketing/src/components/Layout.tsx`, `apps/rialto-web/src/layouts/ShowcaseLayout.tsx` — verified dashboard href references

### Secondary (MEDIUM confidence)

- DigitalOcean App Platform ingress redirect behavior: inferred from `AppSpecIngressRuleRedirect.uri` field description "An optional URI path to redirect to" — does not explicitly document sub-path preservation behavior

### Tertiary (LOW confidence)

- PWA service worker scope isolation behavior on rename: general knowledge that scopes are path-scoped; no direct verification against this specific app's SW configuration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools verified as installed
- Architecture: HIGH — all integration points directly inspected in codebase
- Pitfalls: HIGH for Auth0 client ID change, MEDIUM for DO redirect sub-path behavior

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable infrastructure; no fast-moving dependencies)
