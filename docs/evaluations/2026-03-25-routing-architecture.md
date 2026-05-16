# Routing Architecture Evaluation — March 2026

## Current State

| Dimension        | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| **Routing**      | Cloudflare Worker (`edge-router.js`) — path-prefix routing to multiple origins |
| **Static sites** | 3 CF Pages projects (marketing, hospitality, rialto-web) — free                |
| **API services** | DO App Platform (`api.mattbutlerengineering.com`) — 2 services                 |
| **Auth**         | Auth0 OIDC with callback at `/hospitality/callback`                            |
| **PWA**          | Hospitality only — Workbox (precaches JS/CSS, NOT HTML)                        |
| **DNS**          | Cloudflare (proxied AAAA `100::` → Worker intercepts all traffic)              |
| **IaC**          | Pulumi TypeScript (`infrastructure/pulumi/index.ts`)                           |
| **Monthly cost** | ~$0 (static) + ~$10/mo (2 API containers)                                      |

### Architecture

```
Client
  ↓
Browser Cache          ← Layer 1: browser may cache HTML
  ↓
Service Worker         ← Layer 2: Workbox may serve precached response
  ↓
Cloudflare CDN         ← Layer 3: CDN may cache Worker subrequest responses
  ↓
CF Worker (edge-router) ← Layer 4: routes by path prefix, fights CDN with headers
  ↓
Origin
  ├─ CF Pages (marketing)      — served at /*
  ├─ CF Pages (hospitality)    — served at /hospitality/* (prefix stripped)
  ├─ CF Pages (rialto-web)     — served at /rialto/* (prefix stripped)
  └─ DO App Platform           — served at /api/*
```

### Pain Points (5 recent bug-fix commits)

All five bugs stem from the same root cause: **the edge-router makes HTTP subrequests to CF Pages origins, and Cloudflare's CDN caches those subrequest responses**. The Worker must fight the CDN with manual cache-bypass headers.

| Commit    | Bug                                                   | Root Cause                                                            |
| --------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `2708a34` | SW precaching HTML → stale pages after deploy         | Workbox served old `index.html` referencing deleted JS bundles        |
| `f6d5cf3` | OIDC callback broken after deploy                     | SW precache served stale HTML for `/hospitality/callback`             |
| `e78b4f0` | React Router pathless layout ambiguity                | Callback route competed with `DashboardLayout` at same level          |
| `42690f8` | CDN cached HTML from Worker subrequests → blank pages | CF CDN cached the subrequest response; stale HTML → old JS hash → 404 |
| `5da4a3c` | SPA navigation routes cached by CDN                   | Non-asset paths (no file extension) were not cache-bypassed           |

**Key insight:** The subrequest-through-CDN pattern is fundamentally adversarial. The Worker has to set `Cache-Control: no-store`, `CDN-Cache-Control: no-store`, and `cf: { cacheTtl: 0, cacheEverything: false }` — three independent mechanisms — to prevent one caching layer from serving stale HTML. Any Cloudflare behavior change can re-introduce the bug.

---

## Evaluation Criteria

| Criterion                            | Why It Matters                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **SPA route caching correctness**    | Root cause of all 5 recent bugs; HTML must never be served stale after deploy                              |
| **PWA service worker compatibility** | Hospitality uses Workbox with `scope: "/hospitality/"`; routing must not interfere with SW registration    |
| **Auth/OIDC callback routing**       | `/hospitality/callback` must reach the SPA, never be cached or intercepted                                 |
| **Effort to add a new app**          | Currently requires updating 5+ files (edge-router, Pulumi, deploy workflow, vite config, CF Pages project) |
| **Local dev parity**                 | Vite proxies approximate edge-router but behavior differs — bugs only appear in production                 |
| **Migration effort**                 | Solo developer; time is the scarcest resource                                                              |
| **Cost implications**                | Currently ~$0 for static hosting; changes should not significantly increase cost                           |
| **Vendor lock-in**                   | Degree of platform-specific code; ability to move later                                                    |

---

## Option Profiles

### Option 1: Status Quo (CF Worker edge-router)

Keep the current hand-rolled Cloudflare Worker with manual cache-bypass headers.

| Criterion       | Assessment                                                                                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SPA caching** | Correct but fragile — requires 3 independent cache-bypass mechanisms (`Cache-Control`, `CDN-Cache-Control`, `cf: { cacheTtl: 0 }`) working together. Any CF CDN behavior change can reintroduce stale HTML. |
| **PWA**         | Works after `2708a34` fix — HTML excluded from Workbox `globPatterns`; `navigateFallback: null`                                                                                                             |
| **OIDC**        | Works after `f6d5cf3` and `e78b4f0` fixes — callback treated as SPA route (no extension → cache bypassed)                                                                                                   |
| **Add new app** | 5+ files: `edge-router.js` (route), `pulumi/index.ts` (CF Pages project + binding), `deploy-static.yml` (job), new app `vite.config.ts` (proxy), CF Pages project config                                    |
| **Dev parity**  | Poor — Vite proxies ≠ edge-router; CDN caching bugs invisible in dev                                                                                                                                        |
| **Migration**   | None                                                                                                                                                                                                        |
| **Cost**        | $0 (CF Pages free tier)                                                                                                                                                                                     |
| **Lock-in**     | Medium — CF Worker API, CF Pages platform                                                                                                                                                                   |

**Key strength:** Already working; zero migration risk.

**Key risk:** Continued fragility. Five cache-related bug fixes in recent history, all from the same architectural tension. The next CF CDN behavior change could require a sixth fix.

---

### Option 2: CF Workers with Static Assets (replaces Pages)

Migrate the 3 CF Pages projects to **Workers with static assets** (CF's newer deployment model). The edge-router then uses **Service Bindings** (`env.BINDING.fetch()`) to call each app Worker directly — bypassing the CDN entirely for internal requests.

**Why not just add Service Bindings to existing Pages?** CF Pages projects cannot be Service Binding targets. Service Bindings are Worker-to-Worker only. CF has published a [migration guide from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) for exactly this reason.

| Criterion       | Assessment                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SPA caching** | Fundamentally fixed — `env.BINDING.fetch()` bypasses CDN entirely. Internal requests go directly from edge-router to the app Worker on the same thread. All cache-bypass header logic in `edge-router.js` (lines 57-76, 101-112) can be deleted.  |
| **PWA**         | No change — SW config stays identical; scope `/hospitality/` works the same way                                                                                                                                                                   |
| **OIDC**        | No change — callback is a normal SPA route; CDN is no longer in the path                                                                                                                                                                          |
| **Add new app** | 3 files: new Worker config (e.g., `wrangler.toml`), `edge-router.js` (add binding + route), `pulumi/index.ts` (add Worker resource + Service Binding)                                                                                             |
| **Dev parity**  | Unchanged (same Vite proxy approach locally) — consider adding Caddy as complement                                                                                                                                                                |
| **Migration**   | Medium — convert 3 CF Pages projects to Workers with `wrangler.toml` + static asset config; update Pulumi from `PagesProject` to `WorkersScript` with `serviceBindings`; update deploy workflow from `wrangler pages deploy` to `wrangler deploy` |
| **Cost**        | $0 — Workers free tier includes 100K requests/day; static asset serving is free                                                                                                                                                                   |
| **Lock-in**     | Medium — deeper into CF Workers platform, but static assets are just files                                                                                                                                                                        |

**Key strength:** Eliminates the root cause of all 5 bugs. The edge-router becomes simpler (no cache-fighting logic), and internal routing is a direct function call, not an HTTP subrequest through CDN.

**Key risk:** Migration effort is real — each CF Pages project needs a `wrangler.toml`, and Pulumi resources change from `PagesProject` to `WorkersScript`. The deploy workflow changes from `wrangler pages deploy` to `wrangler deploy`. This is a one-time cost but not trivial.

**Files that change:**

- `infrastructure/worker/edge-router.js` — rewrite routing to use `env.HOSPITALITY.fetch()` instead of `fetch(new Request(target))`; delete all cache-bypass logic
- `infrastructure/pulumi/index.ts` — replace 3 `PagesProject` resources with `WorkersScript` resources; add `serviceBindings` to edge-router Worker
- `.github/workflows/deploy-static.yml` — change from `wrangler pages deploy` to `wrangler deploy`
- New: `apps/*/wrangler.toml` — per-app Worker configuration with static asset binding

---

### Option 3: Vercel for Static Sites

Move the 3 static sites from CF Pages to Vercel. Keep APIs on DO App Platform. Use Vercel's path-prefix rewrites for routing. Vercel handles SPA caching correctly by default (HTML gets `Cache-Control: no-cache`; hashed assets get `immutable`).

| Criterion       | Assessment                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SPA caching** | Correct by default — Vercel serves `index.html` with `no-cache`; hashed assets with `immutable`. No manual cache-bypass logic needed. Zero bug-fix history for this pattern in the Vercel ecosystem. |
| **PWA**         | Works — Vercel serves SW and manifest correctly; `scope: "/hospitality/"` works with rewrites                                                                                                        |
| **OIDC**        | Works — `/hospitality/callback` is a normal SPA rewrite; no CDN caching of HTML                                                                                                                      |
| **Add new app** | 2 files: new app directory + rewrite rule in `vercel.ts`                                                                                                                                             |
| **Dev parity**  | Good — `vercel dev` replicates production routing locally; could also keep Vite proxies                                                                                                              |
| **Migration**   | Medium-High — create Vercel project, write `vercel.ts` rewrites, update DNS (CF Worker routes API-only or removed), update Pulumi (remove CF Pages, add Vercel), update deploy workflow              |
| **Cost**        | $20/user/mo (Vercel Pro) — significant increase from $0. Hobby tier prohibits commercial use.                                                                                                        |
| **Lock-in**     | Low — Vercel rewrites are standard HTTP rewrites; apps remain plain Vite SPAs                                                                                                                        |

**Key strength:** Caching "just works" — no manual headers, no fighting the CDN. Adding new apps is trivial (directory + rewrite rule). Best preview deployment experience.

**Key risk:** Cost increase ($0 → $20/mo for Pro). Requires splitting routing: Vercel for static sites, CF Worker (or direct DNS) for API routing to DO App Platform. Two platforms to coordinate instead of one (though the coordination is simpler).

**Note:** The hosting evaluation (Feb 2026) classified Vercel as "Frontend-First" and eliminated it for API services because it cannot run Fastify containers. That analysis still holds — this option only moves static sites to Vercel, keeping APIs on DO.

**Files that change:**

- New: `vercel.ts` — rewrite rules for path-prefix routing
- `infrastructure/pulumi/index.ts` — remove 3 `PagesProject` resources; add Vercel project via `@pulumi/vercel`; update DNS
- `infrastructure/worker/edge-router.js` — either simplify to API-only routing or remove entirely
- `.github/workflows/deploy-static.yml` — replace `wrangler pages deploy` with Vercel CLI

---

### Option 4: Caddy for Local Dev Proxy (Complement Only)

Add a `Caddyfile` to replicate edge-router behavior locally. Replaces per-app Vite proxy configs with a single local reverse proxy. **Does not change production routing.**

| Criterion       | Assessment                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| **SPA caching** | Does not address production caching                                        |
| **PWA**         | Improves local PWA testing (correct scope routing)                         |
| **OIDC**        | Improves local auth testing (matches prod routing)                         |
| **Add new app** | +1 file (Caddyfile route) on top of whatever production changes are needed |
| **Dev parity**  | Excellent — single proxy replicates production routing behavior locally    |
| **Migration**   | Very low — add `Caddyfile` + `pnpm dev:caddy` script                       |
| **Cost**        | $0 (Caddy is open source)                                                  |
| **Lock-in**     | None                                                                       |

**Key strength:** Catches routing bugs before they reach production. Prevents the class of bugs that are invisible in dev but break in prod.

**Key limitation:** This is a complement to Options 1-3 or 5, not a standalone solution. It does not fix the production caching problem.

**Files that change:**

- New: `Caddyfile` at repo root
- `package.json` — add `dev:caddy` script
- Each app's `vite.config.ts` — remove `server.proxy` config (Caddy handles routing)

---

### Option 5: Consolidated Platform (Railway)

Move everything — static sites and API services — to Railway. Eliminates multi-origin coordination entirely. Railway was the recommended provider in the [hosting evaluation](2026-02-26-hosting-providers.md).

| Criterion       | Assessment                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SPA caching** | Correct by default — Railway serves static sites with proper cache headers                                                                                                     |
| **PWA**         | Works — Railway serves SW/manifest at correct paths                                                                                                                            |
| **OIDC**        | Works — path-based routing is native to Railway                                                                                                                                |
| **Add new app** | 1-2 files: add service to Railway project config                                                                                                                               |
| **Dev parity**  | Good — `railway run` for local dev; or keep Vite proxies                                                                                                                       |
| **Migration**   | High — move everything off CF Pages + DO App Platform. Rewrite Pulumi (Railway has no official Pulumi provider — use `railway.json`). Update DNS. Update all deploy workflows. |
| **Cost**        | ~$10-20/mo for Pro plan (includes $20 credit); pay-per-use for actual compute                                                                                                  |
| **Lock-in**     | Medium — `railway.json` is platform-specific; no Pulumi provider means losing IaC                                                                                              |

**Key strength:** Eliminates multi-origin coordination entirely. One platform, one routing config, one deploy pipeline. Best long-term simplification.

**Key risk:** High migration effort. Losing Pulumi IaC (Railway has no official provider). This is the right long-term move but a significant investment for a solo developer.

**Files that change:**

- New: `railway.json` per service (or `railway.toml`)
- `infrastructure/pulumi/index.ts` — remove all CF Pages + DO App Platform resources; keep Auth0 + DNS
- `infrastructure/worker/edge-router.js` — delete entirely
- `.github/workflows/deploy-static.yml` — replace with Railway deploy
- `.github/workflows/deploy-services.yml` — replace with Railway deploy

---

## Comparison Table

| Option                               |   SPA Cache Fix    | PWA | OIDC | Add New App  |  Dev Parity   |   Migration    |    Cost    |  Lock-in  |
| ------------------------------------ | :----------------: | :-: | :--: | :----------: | :-----------: | :------------: | :--------: | :-------: |
| **1. Status Quo**                    |     ⚠️ Fragile     | ✅  |  ✅  | ❌ 5+ files  |  ❌ Mismatch  |    ✅ None     |   ✅ $0    | ⚠️ Medium |
| **2. CF Workers + Service Bindings** | ✅ Root-cause fix  | ✅  |  ✅  |  ⚠️ 3 files  |  ❌ Mismatch  |   ⚠️ Medium    |   ✅ $0    | ⚠️ Medium |
| **3. Vercel (static only)**          | ✅ Default correct | ✅  |  ✅  |  ✅ 2 files  | ✅ vercel dev | ⚠️ Medium-High | ❌ $20/mo  |  ✅ Low   |
| **4. Caddy (dev only)**              | ❌ Prod unchanged  | ✅  |  ✅  |  ⚠️ +1 file  | ✅ Excellent  |  ✅ Very low   |   ✅ $0    |  ✅ None  |
| **5. Railway (all-in)**              | ✅ Default correct | ✅  |  ✅  | ✅ 1-2 files |    ✅ Good    |    ❌ High     | ⚠️ ~$15/mo | ⚠️ Medium |

---

## Eliminated Options

| Option                                   | Reason                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| **Vercel for everything** (static + API) | Cannot run Fastify containers — already eliminated in hosting evaluation           |
| **Option 4 standalone**                  | Does not fix production caching; only useful as complement                         |
| **Nginx/HAProxy reverse proxy**          | Adds infrastructure to manage; doesn't address CF CDN caching (the actual problem) |

---

## Recommendation

### Primary: Option 2 — CF Workers with Static Assets + Service Bindings

This is the right move because:

1. **Fixes the root cause** — `env.BINDING.fetch()` bypasses CDN entirely. All 5 recent bugs become impossible. The edge-router simplifies from 116 lines of cache-fighting logic to ~60 lines of clean routing.
2. **Stays on Cloudflare** — no new vendor, no cost increase, no DNS migration.
3. **Preserves Pulumi IaC** — resources change type (`PagesProject` → `WorkersScript`) but stay in the same provider.
4. **One-time migration** — convert 3 Pages projects to Workers with static assets. CF has a documented migration path.
5. **No impact on APIs** — DO App Platform routing is unchanged; only the static site delivery mechanism changes.

### Complement: Option 4 — Caddy for Local Dev

Regardless of production choice, add a `Caddyfile` for local dev parity. This prevents routing bugs from reaching production — catches issues like the React Router pathless layout ambiguity (`e78b4f0`) before deploy.

### Future consideration: Option 5 — Railway

When the project outgrows the current multi-platform setup (CF + DO), Railway consolidation is the natural next step. The hosting evaluation already recommends it. But the routing fix (Option 2) is independent and should not be delayed by a larger platform migration.

---

## Implementation Sequence (Option 2)

1. **Research** — verify `wrangler.toml` static asset config for a Vite SPA; test with marketing site first
2. **Migrate marketing** — convert `mattbutlerengineering-marketing` from CF Pages to Worker with static assets; update Pulumi; verify routing
3. **Add Service Binding** — update edge-router to use `env.MARKETING.fetch()` instead of HTTP subrequest; delete cache-bypass logic for this origin
4. **Migrate hospitality + rialto** — repeat for remaining 2 apps; add Service Bindings for each
5. **Simplify edge-router** — remove all `Cache-Control`/`CDN-Cache-Control`/`cacheTtl` cache-fighting code
6. **Test auth flow** — verify OIDC callback at `/hospitality/callback` works without cache interference
7. **Add Caddy** (optional) — create `Caddyfile` for local dev parity

---

## Sources

### Cloudflare

- [Service Bindings — Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Service Bindings — HTTP](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Workers Static Assets — Configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Pages Functions — Bindings](https://developers.cloudflare.com/pages/functions/bindings/) (documents that Pages cannot be Service Binding targets)
- [Service Bindings GA Blog Post](https://blog.cloudflare.com/service-bindings-ga/)

### Pulumi

- [Pulumi Cloudflare — WorkersScript](https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/)
- [Pulumi Vercel Provider](https://www.pulumi.com/registry/packages/vercel/)

### Cross-references

- [Hosting Provider Evaluation (Feb 2026)](2026-02-26-hosting-providers.md) — Railway recommendation, Vercel elimination for API services
- [Caching Evaluation (Feb 2026)](2026-02-26-caching.md) — caching layer analysis
