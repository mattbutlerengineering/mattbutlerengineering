# Architecture Research

**Domain:** Multi-SPA monorepo with design system migration and unified hosting
**Researched:** 2026-02-27
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    mattbutlerengineering.com (Cloudflare CDN)           │
├────────────────────┬────────────────────┬───────────────────────────────┤
│  /  (marketing)    │  /rialto (showcase) │  /hospitality (dashboard)     │
│  Static Site #1    │  Static Site #2     │  Static Site #3               │
│  apps/marketing    │  apps/rialto-web    │  apps/hospitality             │
│  dist/ → DO CDN    │  dist/ → DO CDN     │  dist/ → DO CDN               │
├────────────────────┴────────────────────┴───────────────────────────────┤
│            DigitalOcean App Platform Ingress (path-prefix rules)         │
│   /api → users-api service                                               │
│   /hospitality → hospitality static site                                │
│   /rialto → rialto-web static site                                      │
│   / → marketing static site (catch-all last)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                          Shared Package Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ @mbe/rialto  │  │  @mbe/auth   │  │ @mbe/types│  │ @mbe/api-client│ │
│  │ (design sys) │  │  (Auth0)     │  │ (TS types)│  │ (HTTP client) │  │
│  └──────────────┘  └──────────────┘  └───────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                          Backend Services                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │   users-api      │  │   agent-api      │  │   reservations-api    │  │
│  │   :3001          │  │   :3003          │  │   (port TBD)          │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| marketing (apps/marketing) | Public portfolio/engineering showcase at `/` | users-api via VITE_API_URL, Auth0 for auth |
| rialto-web (apps/rialto-web) | Design system showcase at `/rialto` | No backend dependency, standalone |
| hospitality (apps/hospitality) | Reservation management at `/hospitality` | users-api, reservations-api via VITE_API_URL |
| @mbe/rialto | Component library — sole design primitive for all three apps | Consumed at build time via monorepo workspace |
| @mbe/ui | Legacy Tailwind-based components — to be removed | Currently imported by marketing and dashboard |
| @mbe/auth | Auth0 integration for React apps and Fastify services | Auth0 SaaS via OAuth 2.0 / JWKS |
| DigitalOcean App Platform ingress | Routes path prefixes to correct static site or service | All deployed components |
| Cloudflare | DNS, CDN, proxy in front of DigitalOcean | DigitalOcean App default domain |

## How Multi-SPA Path-Prefix Routing Works

Each SPA is an independent deployment artifact. The ingress layer (DigitalOcean App Platform) dispatches requests to the correct static site based on URL prefix. Each SPA then takes over for all client-side routing within its subtree.

### Three Required Configurations Per App

**1. Vite `base` option** (controls asset URLs in the build output):
```typescript
// apps/rialto-web/vite.config.ts — already correct
export default defineConfig({
  base: "/rialto/",  // trailing slash required
});

// apps/hospitality/vite.config.ts — must be updated from /dashboard/
export default defineConfig({
  base: "/hospitality/",
});

// apps/marketing/vite.config.ts — stays at root (no base needed, or base: "/")
export default defineConfig({
  // no base, or base: "/"
});
```

**2. React Router `basename`** (controls which URL prefix Router considers "root"):
```typescript
// apps/rialto-web/src/main.tsx — already correct
<BrowserRouter basename="/rialto">

// apps/hospitality/src/main.tsx — must change from /dashboard
<BrowserRouter basename="/hospitality">

// apps/marketing/src/main.tsx — stays at root
<BrowserRouter>  // no basename
```

**3. Ingress rules ordered most-specific first** (DO App Platform):
```typescript
// infrastructure/pulumi/index.ts — ingress rules
rules: [
  { match: { path: { prefix: "/api" } },         component: "users-api" },
  { match: { path: { prefix: "/hospitality" } }, component: "hospitality" },
  { match: { path: { prefix: "/rialto" } },      component: "rialto-web" },
  { match: { path: { prefix: "/" } },            component: "marketing" },  // catch-all last
]
```

**Why this order matters:** If `/` is listed first, it matches everything including `/rialto` and `/hospitality`. The catch-all must be last. (MEDIUM confidence — documented behavior in DigitalOcean App Platform path prefix routing docs.)

### SPA Deep-Link Handling

Each static site must have `catchallDocument: "index.html"` in its Pulumi spec. Without this, direct navigation to `/rialto/drivers/123` returns 404 because the static file server looks for a file at that path. The catchall rewrites all non-file requests to `index.html`, letting React Router handle them.

```typescript
// infrastructure/pulumi/index.ts — each static site spec
staticSites: [
  {
    name: "rialto-web",
    catchallDocument: "index.html",  // required for SPA deep links
    // ...
  },
  {
    name: "hospitality",
    catchallDocument: "index.html",
    // ...
  },
  {
    name: "marketing",
    catchallDocument: "index.html",
    // ...
  },
]
```

### Auth Redirect URIs

Auth0 callback URLs must include the path prefix. When renaming dashboard → hospitality, the Auth0 redirect URI must change:

- Old: `https://mattbutlerengineering.com/dashboard/callback`
- New: `https://mattbutlerengineering.com/hospitality/callback`

Pulumi manages the Auth0 app config, so this flows through `auth0Outputs` updates.

## Design System Migration Architecture

### Current State (Before Migration)

```
apps/marketing/       → @mbe/ui (Tailwind CVA), inline className=""
apps/dashboard/       → @mbe/ui (Tailwind CVA), inline className="" (440 uses)
apps/rialto-web/      → @mbe/rialto + inline className="" (466 uses in showcase)
packages/ui/          → Tailwind + CVA + Radix UI (to be deleted)
```

### Target State (After Migration)

```
apps/marketing/       → @mbe/rialto only, no Tailwind, no @mbe/ui
apps/hospitality/     → @mbe/rialto only, no Tailwind, no @mbe/ui
apps/rialto-web/      → @mbe/rialto only, no Tailwind (showcase cleaned up)
packages/ui/          → deleted from workspace
```

### Migration Pattern: Component-by-Component Replacement

The correct pattern for each app is **one component file at a time**, not a full-app sweep. This is because Tailwind classes and Rialto components coexist safely during migration — Rialto uses CSS Modules with `var(--rialto-*)` tokens, which are fully isolated from Tailwind's global utility classes. There is no class name conflict between the two systems during transition.

```
For each component file in the app:
1. Import the appropriate @mbe/rialto component
2. Replace Tailwind-classed JSX with Rialto component
3. Remove the @mbe/ui import for that component
4. Remove unused className props
5. Verify: build succeeds, visual match acceptable
```

Tailwind and Rialto styles can coexist in the same app during transition because:
- Rialto uses CSS Modules (scoped class names, no global pollution)
- Rialto injects CSS custom properties via `RialtoProvider` / `@mbe/rialto/styles`
- Tailwind utility classes operate in global scope but don't conflict with Rialto module class names

### Rialto Provider Requirement

Every app consuming Rialto must wrap with `RialtoProvider` (or at minimum import `@mbe/rialto/styles`). This injects the CSS custom property token tree that all components depend on.

```typescript
// Required in each app's main.tsx
import "@mbe/rialto/styles";  // CSS tokens + reset
// or
import { RialtoProvider } from "@mbe/rialto";
<RialtoProvider>
  <App />
</RialtoProvider>
```

rialto-web already does this. marketing and hospitality do not yet — this must be the first step for each app before any component replacement.

### Rialto Component Inventory (55+ components)

Rialto covers all UI needs for these three apps:

| Category | Components |
|----------|------------|
| Layout | Stack, Sidebar, ScrollArea, Divider |
| Navigation | Navbar, Tabs, Breadcrumb, Pagination, NavigationMenu |
| Data display | Table, Card, Stat, Badge, Tag, DataList, Timeline, Tree |
| Forms | Input, TextArea, Select, Checkbox, Toggle, Slider, NumberInput, PinInput, Autocomplete, SegmentedControl |
| Feedback | Toast (ToastProvider), Alert, Banner, Dialog, ConfirmDialog, Drawer, Skeleton, Progress, Meter |
| Content | Hero, Footer, PageHeader, Avatar, AspectRatio, Text, Kbd |
| Overlay | Popover, Tooltip, HoverCard, DropdownMenu, ContextMenu, CommandPalette |
| Disclosure | Accordion, Collapsible, Steps |

No Tailwind utility classes or @mbe/ui components are needed when Rialto covers this surface area.

### Tailwind Removal Steps (Per App)

After all components are migrated:
1. Remove `tailwindcss` from `devDependencies` in app's `package.json`
2. Remove `postcss.config.js` (only needed for Tailwind processing)
3. Remove `tailwind.config.js`
4. Delete any `@tailwind` directives from CSS files
5. Remove `@mbe/ui` from `dependencies`
6. Run `pnpm install` to prune lockfile
7. Run `pnpm build --filter=@mbe/<app-name>` to verify clean build

## Recommended Project Structure

No structural changes to the monorepo directory layout are required. The migration operates within existing app directories.

The rename from `apps/dashboard` to `apps/hospitality` requires:

```
# Directory rename
apps/dashboard/ → apps/hospitality/

# package.json name field
"name": "@mbe/dashboard" → "name": "@mbe/hospitality"

# All internal imports
import from "@mbe/dashboard" → import from "@mbe/hospitality"

# Pulumi component names
name: "dashboard" → name: "hospitality"
outputDir: "apps/dashboard/dist" → outputDir: "apps/hospitality/dist"
buildCommand: "pnpm build --filter=@mbe/dashboard" → "pnpm build --filter=@mbe/hospitality"

# Auth0 redirect URIs
/dashboard/callback → /hospitality/callback
```

## Architectural Patterns

### Pattern 1: Consistent Vite Base + Router Basename

**What:** Vite's `base` option and React Router's `basename` must match exactly (same prefix, same trailing slash).

**When to use:** Every app deployed to a sub-path.

**Trade-offs:** If they diverge, assets load from wrong paths (404s) or router matches wrong routes. Trailing slash is required by both.

**Example:**
```typescript
// vite.config.ts
export default defineConfig({ base: "/hospitality/" });

// main.tsx
<BrowserRouter basename="/hospitality">
```

### Pattern 2: Ingress Rules Ordered Specific → General

**What:** Path-prefix ingress rules must be ordered from most-specific prefix to least-specific. The marketing catch-all (`/`) must be last.

**When to use:** Any multi-app deployment on a single domain.

**Trade-offs:** Wrong order causes all traffic to hit the catch-all. The fix is reordering in Pulumi and redeploying.

**Example:**
```typescript
rules: [
  { prefix: "/api" },           // most specific
  { prefix: "/hospitality" },   // specific
  { prefix: "/rialto" },        // specific
  { prefix: "/" },              // catch-all LAST
]
```

### Pattern 3: CSS Custom Property Token System (Rialto)

**What:** Rialto uses CSS custom properties (`var(--rialto-*)`) as its token layer. Components reference tokens, never hardcoded values. This allows the design system to coexist with Tailwind during migration (no naming conflicts).

**When to use:** Authoring Rialto components; mapping old Tailwind utility values to Rialto tokens.

**Trade-offs:** Requires `@mbe/rialto/styles` to be imported before any Rialto component renders. Without it, all tokens resolve to `initial` and components render unstyled.

**Example:**
```css
/* Wrong — hardcoded, not portable */
.button { background: #d4a72c; }

/* Right — token-referenced, theme-aware */
.button { background: var(--rialto-accent); }
```

### Pattern 4: Incremental App Migration (App-by-App, Not Component-Type-by-Component-Type)

**What:** Migrate one entire app to Rialto before starting the next. Do not migrate "all buttons across all apps" at once.

**When to use:** When apps are deployed independently and can be verified in isolation.

**Trade-offs:** The monorepo means changes to `@mbe/rialto` affect all apps simultaneously, but app-specific migration work stays contained. Easier to test, easier to revert.

**Order rationale:**
1. **rialto-web** — Already imports Rialto; primarily needs className cleanup and @mbe/ui removal. Validates the migration pattern before touching production apps.
2. **marketing** — Simplest app (one page), no auth complexity, no backend data. De-risks the Tailwind removal process.
3. **hospitality** — Most complex (440 Tailwind usages, auth-gated, backend-connected). Tackled last with confidence from prior two migrations.

## Data Flow

### Asset Loading Flow (Production)

```
Browser: GET mattbutlerengineering.com/rialto/drivers/123
    ↓
Cloudflare (CDN / proxy)
    ↓
DigitalOcean App Platform ingress
    ↓ matched by prefix /rialto
Static Site: rialto-web
    ↓ catchallDocument: "index.html" rewrites to index.html
    ↓ index.html references /rialto/assets/index-[hash].js
BrowserRouter basename="/rialto" + Vite base="/rialto/"
    ↓ React Router parses /rialto/drivers/123 → route: /drivers/:id
DriverRead component renders
```

### Design System Token Flow

```
@mbe/rialto/styles (CSS file imported in app main.tsx)
    ↓ injects :root { --rialto-accent: #d4a72c; --rialto-surface: #f8f6f3; ... }
@mbe/rialto components (CSS Modules reference var(--rialto-*))
    ↓ scoped class names (e.g., .button_abc123 { background: var(--rialto-accent) })
Rendered HTML
    ↓ browser resolves CSS custom properties from :root
Consistent visual output regardless of which app is consuming
```

### Design System Migration Data Flow (During Transition)

```
[App during migration]
    ├── Component A (already migrated) → imports @mbe/rialto → uses var(--rialto-*)
    ├── Component B (not yet migrated) → imports @mbe/ui → uses Tailwind className=""
    └── Both work simultaneously — no style conflicts
```

## Scaling Considerations

This is a portfolio/showcase/hospitality system for a solo developer. Scaling concerns are minimal and should not drive architectural decisions.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1-10 users) | DigitalOcean App Platform static sites with DO CDN — sufficient and already deployed |
| Growth (10-1k users) | Cloudflare CDN (already in place) handles static asset caching globally; no app changes needed |
| Hypothetical (1k+ users) | Hospitality backend (reservations-api) would be the first bottleneck; horizontal scaling via DO instance count |

### First Bottleneck

Static frontend apps have no meaningful scaling limit given CDN. The reservations API (when built out) is the first constraint — handled by DigitalOcean App Platform's `instanceCount` setting when needed.

## Anti-Patterns

### Anti-Pattern 1: Mismatched Vite base and Router basename

**What people do:** Set `base: "/rialto/"` in Vite but forget to update `basename` in `BrowserRouter`, or vice versa.

**Why it's wrong:** Asset references in `index.html` will use the correct prefix, but React Router will compute route URLs from the wrong base. Deep links either 404 on assets or produce incorrect route matches.

**Do this instead:** Always update both in lockstep. Treat them as a single configuration unit.

### Anti-Pattern 2: Catch-All Ingress Rule First

**What people do:** Put `{ prefix: "/" }` first in the ingress rule list for convenience.

**Why it's wrong:** All requests, including `/rialto` and `/hospitality`, match the `/` prefix first. Every request goes to the marketing static site regardless of the actual path.

**Do this instead:** Specific prefixes first, `/` last. No exceptions.

### Anti-Pattern 3: Importing @mbe/rialto/styles More Than Once

**What people do:** Import `@mbe/rialto/styles` in every component file that uses Rialto components.

**Why it's wrong:** CSS custom properties are global and idempotent so duplication works — but it inflates bundle size and slows CSS parsing. The token stylesheet should be imported exactly once per app.

**Do this instead:** Import `@mbe/rialto/styles` only in `main.tsx` (or the app entry point), never in individual component files.

### Anti-Pattern 4: Big-Bang Migration Across All Apps at Once

**What people do:** Start migrating marketing, rialto-web, and hospitality simultaneously, with PRs for each touching shared package changes.

**Why it's wrong:** Changes to `@mbe/rialto` (e.g., adding a component needed for hospitality) affect rialto-web and marketing builds simultaneously. Merge conflicts and build failures multiply across parallel branches.

**Do this instead:** Complete one app's migration fully (including Pulumi deploy verification) before beginning the next. Sequential is safer than parallel for this migration.

### Anti-Pattern 5: Removing @mbe/ui from the Workspace Before All Apps Are Migrated

**What people do:** Delete `packages/ui/` from the workspace early to force migration completion.

**Why it's wrong:** Any un-migrated app immediately fails to build. If hospitality is mid-migration, removing @mbe/ui breaks CI for all builds.

**Do this instead:** Keep `packages/ui/` in the workspace until the last app's migration is committed. Remove it as the final step of the full migration.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Auth0 | OAuth 2.0 redirect flow; JWKS JWT verification | Redirect URIs must be updated per-app when path prefix changes (dashboard → hospitality) |
| DigitalOcean App Platform | Pulumi `digitalocean.App` resource with `ingress.rules` | Static sites use `catchallDocument: "index.html"` for SPA routing |
| Cloudflare | CNAME to DO default ingress domain; proxied mode | No app-level config needed; handled in Pulumi `cloudflare.Record` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| apps → @mbe/rialto | Build-time import (pnpm workspace) | No runtime communication; Rialto is compiled into each app's bundle |
| apps → @mbe/auth | Build-time import; Auth0 SDK calls at runtime | Each app configures its own Auth0 redirect URI via VITE_* env vars |
| apps → backend services | HTTP via VITE_API_URL env var; routed through DO ingress | Ingress strips prefix before forwarding to service (preservePathPrefix: false) |
| apps/hospitality → reservations-api | HTTP via api-client; JWT in Authorization header | Same pattern as dashboard → users-api today |
| @mbe/ui → deleted | N/A after migration | Remove only after all three apps are migrated |

## Sources

- Vite `base` option official docs: https://vite.dev/config/shared-options (HIGH — official)
- React Router `basename` option: https://reactrouter.com/en/main/router-components/browser-router (HIGH — official)
- DigitalOcean App Platform path prefix routing: https://docs.digitalocean.com/products/app-platform/how-to/url-rewrites/ (MEDIUM — official, verified against existing Pulumi config in codebase)
- DigitalOcean static site catchall: https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/ (MEDIUM — official)
- Cloudflare vertical microfrontend template (path-based routing pattern): https://www.infoq.com/news/2026/02/cloudflare-vmfe-template/ (MEDIUM — recent, Feb 2026)
- "Don't use Tailwind for your Design System": https://sancho.dev/blog/tailwind-and-design-systems (LOW — opinion piece, consistent with Rialto's CSS Modules approach)
- Incremental migrations with microfrontends: https://vercel.com/kb/guide/incremental-migrations-with-microfrontends (MEDIUM — official Vercel docs)
- Pro tips for UI library migration: https://medium.com/@houhoucoop/pro-tips-for-ui-library-migration-in-large-projects-d54f0fbcd083 (LOW — unverified)
- Existing codebase `vite.config.ts` files (rialto-web, dashboard, marketing): direct analysis (HIGH — ground truth)
- Existing `infrastructure/pulumi/index.ts`: direct analysis (HIGH — ground truth)

---
*Architecture research for: Multi-SPA monorepo — design system migration and unified hosting*
*Researched: 2026-02-27*
