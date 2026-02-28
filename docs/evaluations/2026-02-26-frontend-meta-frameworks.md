# Frontend Meta-Framework Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Frontend framework** | React 19 + Vite 7 (pure SPAs, no meta-framework) |
| **Routing** | React Router v7 in library/SPA mode (`BrowserRouter`); no loaders/actions, no file-based routing |
| **Build system** | Vite 7, `@vitejs/plugin-react`, TypeScript |
| **Monorepo** | Turborepo + pnpm workspaces; `@mbe/` package prefix |
| **Design systems** | `@mbe/ui` (shadcn/Tailwind, legacy) → `@mbe/rialto` (CSS Modules + Framer Motion, new) |
| **Deployment** | DigitalOcean App Platform, `deployOnPush: true` |
| **SSR/SSG** | None — all 3 apps are client-side rendered |
| **Preview deployments** | None (DO App Platform does not provide this natively) |

### App Inventory

| App | Purpose | Deps | Routing | Styling | Auth | Routes |
|-----|---------|------|---------|---------|------|--------|
| `apps/marketing/` | Public marketing site | React 19, Vite 7, RR v7 | `BrowserRouter` | Tailwind v3 + `@mbe/ui` | None | 1 |
| `apps/dashboard/` | Hospitality mgmt PWA | React 19, Vite 7, RR v7, Konva | `BrowserRouter` (base `/dashboard`) | Tailwind v3 + `@mbe/ui` | `@mbe/auth` (OIDC) | 10 |
| `apps/rialto-web/` | Design system showcase | React 19, Vite 7, RR v7 | `BrowserRouter` (base `/rialto`) | CSS Modules + `@mbe/rialto` | None | 12 |

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│apps/marketing│     │apps/dashboard│     │apps/rialto-web│
│  React SPA   │     │  React SPA   │     │  React SPA   │
│  1 route     │     │  10 routes   │     │  12 routes   │
│  No auth     │     │  OIDC auth   │     │  No auth     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            │
                    Vite build → static assets
                            │
                    DigitalOcean App Platform
                    (static site hosting + CDN)
```

### Pain Points & Motivations

- **Zero SEO on marketing site** — Client-side SPA means crawlers see an empty `<div id="root">`. No server-rendered `<meta>` tags, no Open Graph tags for social sharing, no structured data in initial HTML.
- **No preview deployments** — DO App Platform does not provide automatic per-PR preview URLs. No staging environment for frontend changes.
- **No server-side data fetching** — All data fetching is client-side `useEffect` + fetch. No loaders, no server functions, no streaming.
- **Dashboard loads everything upfront** — Code splitting limited to manual `React.lazy` (rialto-web uses it; dashboard does not).

---

## Evaluation Criteria

| Criterion | Why It Matters |
|-----------|---------------|
| **SSR/SSG/ISR support** | Marketing site needs server-rendered HTML for SEO and social sharing |
| **SEO capabilities** | Meta tags, sitemaps, structured data in initial HTML response |
| **React compatibility** | Project has 3 React apps + 2 React component libraries; rewriting is a non-starter |
| **Routing model** | File-based vs config-based; migration effort from current `BrowserRouter` setup |
| **Data fetching patterns** | Loaders, server functions, streaming — improvement over raw `useEffect` + fetch |
| **Vite compatibility** | Current build system is Vite 7; incompatible bundlers add migration friction |
| **Build performance** | Monorepo with multiple apps; build speed matters for CI/CD |
| **DigitalOcean deployment** | Current hosting platform; must deploy there or justify platform change |
| **Preview deployments** | Critical missing capability; any solution should enable per-PR previews |
| **Monorepo support** | Must work with Turborepo + pnpm workspaces |
| **Design system compatibility** | Must work with `@mbe/rialto` (CSS Modules + Framer Motion) and `@mbe/ui` (Tailwind) |
| **Migration friction** | Effort to migrate from current React + Vite SPAs |

---

## Per-App Analysis

Not all apps need a meta-framework. Each app has different requirements:

### `apps/marketing/` — Marketing Site

**Verdict: NEEDS a meta-framework (or at minimum SSG).**

| Need | Current State | Impact |
|------|--------------|--------|
| SEO | Zero (SPA, empty HTML) | Google may not index; social sharing broken |
| Performance | JS must execute before content appears | Poor LCP, delayed FCP |
| Content management | Hardcoded in React components | Hard to update marketing copy |
| Social sharing | No OG tags in initial HTML | Links shared on social media show no preview |

This is the only app where the current SPA architecture is actively harmful. A marketing site exists to be found and shared — client-side rendering defeats both purposes.

### `apps/dashboard/` — Hospitality Management PWA

**Verdict: SPA is the correct architecture. No meta-framework needed.**

| Factor | Why SPA is Right |
|--------|-----------------|
| Authentication required | Behind OIDC auth — no public content to index |
| No SEO need | Dashboard should NOT be indexed by search engines |
| PWA functionality | `vite-plugin-pwa` provides service worker, offline support |
| Canvas rendering | Konva canvas for floor plans — inherently client-side |
| Existing API backend | `services/users` Fastify API handles all data; no need for server functions |

Adding SSR to an authenticated dashboard adds complexity (auth token forwarding, server-side session management) with zero user-facing benefit. The only improvement worth considering is better code splitting — but that is achievable with `React.lazy` without a meta-framework.

### `apps/rialto-web/` — Design System Showcase

**Verdict: SPA is the correct architecture. No meta-framework needed.**

| Factor | Why SPA is Right |
|--------|-----------------|
| Internal tool | Used by developers to preview components, not by end users |
| No SEO need | Not a public-facing product |
| Already uses lazy loading | `React.lazy` for all 12 routes (well-implemented) |
| Interactive by nature | Every page demonstrates interactive components |

---

## Provider Classification

| Category | Frameworks | Characteristics |
|----------|-----------|-----------------|
| **React Meta-Frameworks** | React Router v7 (Framework Mode), Next.js (App Router), TanStack Start | Full-stack React frameworks with SSR/SSG, routing, data fetching |
| **Content-Focused** | Astro | Content-first with island architecture; React components as interactive islands |
| **Current Baseline** | Vite + React (SPA) | No meta-framework; pure client-side rendering |
| **Non-React** | SvelteKit, SolidStart, Nuxt | Different UI frameworks; require complete codebase rewrite |

---

## Provider Profiles

### 1. Vite + React SPA (Current Baseline)

The current state — no meta-framework. Pure client-side rendered React apps built with Vite. Included as the baseline for comparison.

| Criterion | Details |
|-----------|---------|
| **Version** | Vite 7.3.1 + React 19 + React Router v7.13.0 |
| **Rendering** | Client-side only (CSR). Empty HTML until JS executes. |
| **SSR/SSG** | None |
| **SEO** | None — crawlers see `<div id="root">` |
| **Routing** | React Router v7 `BrowserRouter` (library mode); manual route configuration |
| **Data fetching** | Manual `useEffect` + fetch or React Query; no server-side data loading |
| **Code splitting** | `React.lazy` + dynamic `import()` (rialto-web uses it; dashboard does not) |
| **Build performance** | Fast — Vite's native ESM dev server + Rollup/Rolldown production builds |
| **DigitalOcean deployment** | Excellent — static site on DO App Platform (free tier: 3 apps, 1 GiB/mo each) |
| **Preview deployments** | Not built-in; possible via DO GitHub Actions |
| **Monorepo support** | Excellent — standard Vite apps in Turborepo + pnpm workspaces |
| **Design system** | Full compatibility (Vite handles CSS Modules, Tailwind, Framer Motion natively) |
| **Migration effort** | None (current state) |
| **Pricing** | Free (open source, MIT) |
| **Bundle size** | ~42 KB gzipped (React runtime + app code); smaller than any meta-framework |

**When Vite SPA is the right choice:** Authenticated apps, internal tools, PWAs, dashboards — anything where SEO is irrelevant and a separate API backend already exists.

**What you lose:** Server-rendered HTML, SEO, social sharing previews, server-side data fetching, file-based routing.

---

### 2. React Router v7 Framework Mode

The result of merging Remix into React Router. Already installed in all 3 apps as the SPA routing library (v7.1.0–7.13.0). Framework mode adds file-based routing, loaders/actions, SSR/SSG, and a Vite plugin.

| Criterion | Details |
|-----------|---------|
| **Version** | 7.13.1 (February 2026); stable since November 2024 |
| **Rendering** | SSR (default), SPA (`ssr: false`), SSG (pre-render), hybrid (mix per route) |
| **SSR/SSG** | Full SSR with streaming; SSG via `prerender: true` or explicit path list |
| **ISR** | Not supported — must pre-render at build time or use SSR |
| **SEO** | Full — server-rendered HTML with meta tags, OG tags, structured data |
| **Routing** | File-based (`app/routes/`) + `routes.ts` config; type-safe route params |
| **Data fetching** | `loader` (server), `clientLoader` (client), `action` (mutations); automatic revalidation |
| **Code splitting** | Automatic per-route code splitting via Vite |
| **Vite-native** | Yes — `@react-router/dev/vite` plugin; Vite dev server + build |
| **DigitalOcean** | SSG/SPA: static site (free). SSR: Node.js container service ($5+/mo). |
| **Preview deployments** | Via Vercel/Netlify (built-in) or DO GitHub Actions (manual setup) |
| **Monorepo support** | Works with Turborepo + pnpm; standard Vite-based app |
| **Design system** | Full compatibility — CSS Modules, Tailwind, Framer Motion all work |
| **Migration effort** | Low-Medium — already on RR v7; add Vite plugin, move routes to file-based, adopt incrementally |
| **RSC support** | Preview only (v7.9.2+); requires Parcel bundler, not Vite |
| **Pricing** | Free (MIT, open source); maintained by Shopify |
| **npm downloads** | ~3M/week |
| **GitHub stars** | ~56,300 |

**Key strength:** Lowest migration friction of any meta-framework — the project already uses React Router v7. Upgrading to framework mode is incremental: add the Vite plugin, create `react-router.config.ts`, and migrate one route at a time.

**Key limitation:** No ISR (must choose between build-time SSG or per-request SSR). RSC support is preview-only and requires Parcel (not Vite). Fewer deployment adapters and learning resources compared to Next.js.

**Migration path from current SPA:**
1. Replace `react()` Vite plugin with `reactRouter()` from `@react-router/dev/vite`
2. Create `react-router.config.ts` with `ssr: false` (stay SPA initially)
3. Move routes into file-based convention or `routes.ts`
4. Adopt loaders/actions one route at a time
5. Enable SSR when ready

Sources:
- [React Router: Picking a Mode](https://reactrouter.com/start/modes)
- [React Router: Rendering Strategies](https://reactrouter.com/start/framework/rendering)
- [React Router: Framework Adoption from Component Routes](https://reactrouter.com/upgrading/component-routes)
- [React Router: Deploying](https://reactrouter.com/start/framework/deploying)
- [react-router on npm](https://www.npmjs.com/package/react-router)

---

### 3. Next.js (App Router)

The most popular React meta-framework. Maintained by Vercel. App Router (introduced in Next.js 13) is now the primary architecture with React Server Components, Server Actions, and streaming.

| Criterion | Details |
|-----------|---------|
| **Version** | 16.1.6 (February 2026); Turbopack is default bundler |
| **Rendering** | SSR, SSG, ISR, CSR, SPA (`output: 'export'`), Partial Prerendering (Cache Components) |
| **SSR/SSG** | Full — all modes supported and mixable per-route |
| **ISR** | Yes — `revalidate` option; works self-hosted with filesystem cache |
| **SEO** | Excellent — server-rendered HTML, `metadata` API, generateMetadata(), OG image generation |
| **Routing** | File-based (`app/` directory); layouts, loading states, error boundaries per route |
| **Data fetching** | React Server Components (async server components), Server Actions (`"use server"`), streaming |
| **Code splitting** | Automatic per-route + per-component code splitting |
| **Vite-native** | **No** — uses Turbopack (Rust-based). Vite plugins incompatible. |
| **DigitalOcean** | SSR: Node container ($5+/mo). Static export: free. ISR: limited (single-instance filesystem cache). |
| **Preview deployments** | Automatic on Vercel. On DO: manual GitHub Actions setup. |
| **Monorepo support** | Excellent — Turborepo is made by Vercel; first-class Next.js integration |
| **Design system** | CSS Modules: native support. Tailwind: first-class. Framer Motion: works with `"use client"`. |
| **Migration effort** | Medium-High — different bundler (Turbopack, not Vite), different routing (file-system), RSC mental model |
| **RSC support** | Full — default in App Router; Server Components, Server Actions, streaming |
| **Pricing** | Framework: free (MIT). Vercel: free tier → $20/user/mo Pro → $3,500+/mo Enterprise. Self-hosted: server costs only. |
| **npm downloads** | ~4.5M/week |
| **GitHub stars** | ~131,000 |

**Key strength:** Most complete feature set. ISR, RSC, Server Actions, streaming, Cache Components (partial prerendering). Largest ecosystem — every SaaS provider has Next.js integration docs. Turborepo monorepo support is first-class.

**Key risks:**
- **Bundler incompatibility**: Turbopack cannot use Vite plugins. Migrating means leaving the Vite ecosystem entirely.
- **Complexity for simple apps**: RSC mental model (`"use client"` boundaries), Cache Components, and App Router conventions add significant cognitive overhead.
- **Vercel coupling**: While self-hosting works, some features (edge middleware, image CDN, automatic previews) are Vercel-only or degraded when self-hosted.
- **API churn**: Significant API changes between major versions (Pages Router → App Router, caching model changes in v15/v16, `middleware.ts` → `proxy.ts`).

**Self-hosted vs Vercel:**

| Feature | Self-Hosted | Vercel |
|---------|------------|--------|
| SSR | Yes (Node.js) | Yes (edge + serverless) |
| ISR | Yes (filesystem cache, single instance) | Yes (distributed CDN cache) |
| Image optimization | Yes (requires `sharp`) | Yes (edge CDN pipeline) |
| Preview deployments | Manual (GitHub Actions) | Automatic (built-in) |
| Edge middleware | No (runs in single region) | Yes (global edge network) |
| Analytics | No (self-manage) | Built-in Web Vitals |

Sources:
- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- [Next.js 16.1 Blog Post](https://nextjs.org/blog/next-16-1)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js SPA Guide](https://nextjs.org/docs/app/guides/single-page-applications)
- [Migrating from Vite](https://nextjs.org/docs/app/guides/migrating/from-vite)
- [Vercel Pricing](https://vercel.com/pricing)
- [DigitalOcean Next.js Hosting](https://www.digitalocean.com/solutions/nextjs-hosting)

---

### 4. TanStack Start

Newest React meta-framework from TanStack (Tanner Linsley). Built on TanStack Router (type-safe routing), Vite (bundling), and Nitro (server/deployment). Currently in Release Candidate — not yet 1.0.

| Criterion | Details |
|-----------|---------|
| **Version** | 1.163.2 RC (February 2026); v1.0 RC since September 22, 2025 |
| **Rendering** | SSR, SSG (static prerendering), SPA mode, ISR, selective SSR per route |
| **SSR/SSG** | Full SSR with streaming; static prerendering at build time |
| **ISR** | Yes — incremental static regeneration via background regeneration |
| **SEO** | Full — server-rendered HTML with meta tags |
| **Routing** | File-based + code-based; fully typed route params, search params, loader data |
| **Data fetching** | `createServerFn()` for type-safe RPC; integrates with TanStack Query for caching |
| **Code splitting** | Automatic per-route via Vite |
| **Vite-native** | Yes — migrated from Vinxi to pure Vite in June 2025 |
| **DigitalOcean** | Node.js via `node-server` Nitro preset; or static prerender for static hosting |
| **Preview deployments** | Via Vercel/Netlify Nitro presets (built-in) or DO GitHub Actions |
| **Monorepo support** | Works but with known issues — pnpm symlink 404 bug ([#6588](https://github.com/TanStack/router/issues/6588)), Turborepo prerender issue |
| **Design system** | Full compatibility — Vite-based, CSS Modules and Framer Motion work |
| **Migration effort** | Medium — need to learn TanStack Router's API (different from React Router); route definitions differ |
| **RSC support** | Not yet — planned as non-breaking v1.x addition post-1.0 |
| **Pricing** | Free (MIT, open source); TanStack LLC is bootstrapped (no VC) |
| **npm downloads** | ~1.1M/month (growing rapidly) |
| **GitHub stars** | ~13,600 (TanStack/router, includes Start) |

**Key strength:** Best-in-class type safety for routing. Nitro server engine provides "adapter-less" deployment — configure a preset, deploy anywhere. Vite-native, so existing Vite config and plugins carry over. ISR support (which React Router v7 lacks).

**Key risks:**
- **Not yet 1.0**: Release Candidate since September 2025. API is stable but final 1.0 hasn't shipped.
- **Monorepo bugs**: Known pnpm workspace symlink issues. Not battle-tested in large monorepos.
- **Small community**: ~1.1M monthly downloads vs Next.js at ~4.5M weekly. Fewer tutorials, examples, and third-party integrations.
- **Single maintainer risk**: TanStack LLC is bootstrapped. While TanStack Query and Router are widely used, Start depends on continued investment from a small team.
- **No RSC**: React Server Components not yet supported — a feature gap vs Next.js.

Sources:
- [TanStack Start v1 RC Announcement](https://tanstack.com/blog/announcing-tanstack-start-v1)
- [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [Why TanStack Start is Ditching Adapters](https://tanstack.com/blog/why-tanstack-start-is-ditching-adapters)
- [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [@tanstack/react-start on npm](https://www.npmjs.com/package/@tanstack/react-start)

---

### 5. Astro

Content-first framework with island architecture. Ships zero JavaScript by default — interactive components (from React, Svelte, Vue, etc.) are "islands" that hydrate independently. Acquired by Cloudflare in January 2026.

| Criterion | Details |
|-----------|---------|
| **Version** | 5.7+ stable; Astro 6.0 in beta (stable expected weeks away) |
| **Rendering** | Static (SSG, default), Server (SSR), Hybrid (per-page choice) |
| **SSR/SSG** | Full — SSG by default, SSR via adapters, hybrid mixing both |
| **ISR** | Not built-in; achievable via server islands with caching headers |
| **SEO** | Excellent — static HTML by default; `@astrojs/sitemap`, `@astrojs/rss` integrations |
| **Routing** | File-based (`src/pages/`); content collections for structured data |
| **Data fetching** | Content Layer API (Zod-validated collections), server islands for dynamic data |
| **Code splitting** | N/A — zero JS by default; each island loads independently |
| **Vite-native** | Yes — built on Vite; Vite plugins work via `vite.plugins` config |
| **React integration** | `@astrojs/react` (v4.4.2) — mature, first-party. React 19, CSS Modules, Framer Motion all work. |
| **DigitalOcean** | Static output: free (static site). SSR: Node adapter + container service ($5+/mo). |
| **Preview deployments** | Via Cloudflare Pages (native), Vercel/Netlify (native), or DO GitHub Actions |
| **Monorepo support** | Works in Turborepo + pnpm; known friction with Vite version conflicts (Astro bundles its own Vite) |
| **Design system** | React components work as islands. `@mbe/rialto` (CSS Modules + Framer Motion) and `@mbe/ui` (Tailwind) compatible. |
| **Migration effort** | Low-Medium (for marketing site only) — existing React components become islands; static content becomes `.astro` templates |
| **Content collections** | Type-safe Markdown/MDX/JSON content with Zod schemas. Up to 5x faster Markdown builds. |
| **Pricing** | Free (MIT, open source); Cloudflare committed to keeping it open source |
| **npm downloads** | ~1.25M/week |
| **GitHub stars** | ~56,700 |

**Key strength:** Purpose-built for content/marketing sites. Zero JavaScript by default means Lighthouse 98-100 scores out of the box. Content collections provide type-safe management of blog posts, case studies, and marketing copy. React components work as interactive islands — existing `@mbe/rialto` and `@mbe/ui` components require zero modification.

**Key limitation:** Astro is an MPA (multi-page application) framework — not suited for SPAs or highly interactive apps. State does not persist across page navigations (each page is a fresh server render or static file). React context/state works within a single island but not across islands. This makes Astro a poor fit for the dashboard or rialto-web showcase.

**Island architecture:**

```astro
---
// Static content — ships zero JavaScript
import Header from '../components/Header.astro';
import ContactForm from '../components/ContactForm.tsx';
---
<Header />
<h1>Welcome to Matt Butler Engineering</h1>
<p>This content is static HTML — no JS shipped.</p>

<!-- React island — hydrates when visible in viewport -->
<ContactForm client:visible />
```

| Directive | Behavior |
|-----------|----------|
| `client:load` | Hydrate immediately on page load |
| `client:idle` | Hydrate when browser is idle |
| `client:visible` | Hydrate when component enters viewport |
| `client:media={query}` | Hydrate when CSS media query matches |
| `client:only="react"` | Skip SSR, render only on client |

**Astro vs Next.js for content sites:**

| Metric | Astro | Next.js (static export) |
|--------|-------|------------------------|
| Lighthouse score | 98-100 | 80-90 |
| JS bundle (content page) | 0-5 KB | 70-100+ KB (React runtime) |
| Build speed (1000 pages) | ~18 seconds | ~52 seconds |
| Time to Interactive | Near-instant (no hydration) | Delayed (full page hydration) |

Sources:
- [Astro Islands Documentation](https://docs.astro.build/en/concepts/islands/)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro Actions](https://docs.astro.build/en/guides/actions/)
- [Astro Server Islands](https://docs.astro.build/en/guides/server-islands/)
- [Astro 6 Beta](https://astro.build/blog/astro-6-beta/)
- [Cloudflare acquires Astro](https://blog.cloudflare.com/astro-joins-cloudflare/)
- [@astrojs/react](https://docs.astro.build/en/guides/integrations-guide/react/)

---

### 6. SvelteKit

| Criterion | Details |
|-----------|---------|
| **Version** | 2.53.2 (February 2026); Svelte 5 with runes reactivity |
| **Rendering** | SSR (default), SSG (per-route prerender), hybrid |
| **React compatible** | **No** — Svelte is its own language/compiler. `.svelte` files, not JSX. |
| **Migration effort** | **Full rewrite** — every component, every hook, every state management pattern |
| **npm downloads** | ~786K/week (SvelteKit); ~2M/week (Svelte) |
| **GitHub stars** | ~84,800 (Svelte); ~20,200 (SvelteKit) |

---

### 7. SolidStart

| Criterion | Details |
|-----------|---------|
| **Version** | 1.2.0 stable (December 2025); SolidJS 1.9.11 |
| **Rendering** | CSR, SSR (including out-of-order streaming), SSG |
| **React compatible** | **No** — despite JSX syntax, component model is fundamentally different (signals, components render once, no virtual DOM) |
| **Migration effort** | **Full rewrite** — JSX similarity is deceptive; reactivity model, state management, and execution semantics all differ |
| **npm downloads** | ~20K/week (SolidStart); ~1.1M/week (SolidJS) |
| **GitHub stars** | ~35,000 (SolidJS); ~5,800 (SolidStart) |

---

### 8. Nuxt

| Criterion | Details |
|-----------|---------|
| **Version** | 4.3.1 (February 2026); Vue 3 + Composition API |
| **Rendering** | SSR, SSG, hybrid (per-route rendering rules), Nitro server engine |
| **React compatible** | **No** — Vue uses `.vue` single-file components, template syntax (`v-if`, `v-for`), Composition API |
| **Migration effort** | **Full rewrite** — different template language, different reactivity model, different component format |
| **npm downloads** | ~1M/week |
| **GitHub stars** | ~59,000 |

---

## Comparison Tables

### Features

| Framework | SSR | SSG | ISR | SPA | RSC | SEO | File Routing | Vite-Native |
|-----------|-----|-----|-----|-----|-----|-----|-------------|-------------|
| **Vite SPA** (current) | — | — | — | ✅ | — | ❌ | — | ✅ |
| **RR v7 Framework** | ✅ | ✅ | — | ✅ | Preview | ✅ | ✅ | ✅ |
| **Next.js** | ✅ | ✅ | ✅ | ✅ | ✅ Full | ✅ | ✅ | ❌ (Turbopack) |
| **TanStack Start** | ✅ | ✅ | ✅ | ✅ | — (planned) | ✅ | ✅ | ✅ |
| **Astro** | ✅ | ✅ (default) | ⚠️ (via caching) | ⚠️ (not ideal) | — | ✅ Best | ✅ | ✅ |

### Migration Effort (from current React + Vite SPAs)

| Framework | Bundler Change | Routing Change | Component Rewrite | Design System | Overall Effort |
|-----------|---------------|----------------|-------------------|---------------|---------------|
| **Vite SPA** | None | None | None | None | None |
| **RR v7 Framework** | None (Vite) | Config → file-based | None | None | **Low** |
| **Next.js** | Vite → Turbopack | Config → file-based | Add `"use client"` | Check RSC compat | **Medium-High** |
| **TanStack Start** | None (Vite) | RR v7 → TanStack Router | None | None | **Medium** |
| **Astro** | None (Vite) | New (Astro pages) | React → `.astro` + islands | React as islands | **Low-Medium** (marketing site only) |

### DigitalOcean Deployment

| Framework | Static Deploy | SSR Deploy | Preview Deploys | ISR on DO |
|-----------|--------------|------------|-----------------|-----------|
| **Vite SPA** | ✅ Free | N/A | Via GitHub Actions | N/A |
| **RR v7 Framework** | ✅ Free (SSG/SPA) | ✅ Node container ($5+) | Via GitHub Actions | N/A |
| **Next.js** | ✅ Free (static export) | ✅ Node container ($5+) | Via GitHub Actions | ⚠️ Filesystem only |
| **TanStack Start** | ✅ Free (prerender) | ✅ Node container ($5+) | Via GitHub Actions | ⚠️ Limited |
| **Astro** | ✅ Free (default) | ✅ Node adapter ($5+) | Via GitHub Actions | ⚠️ Via caching |

### Community & Ecosystem

| Framework | npm Downloads/wk | GitHub Stars | Stability | Backed By |
|-----------|-----------------|-------------|-----------|-----------|
| **Vite** | ~2M+ | ~73,000 | Stable (v7.3.1) | StackBlitz + community |
| **React Router v7** | ~3M | ~56,300 | Stable (v7.13.1) | Shopify |
| **Next.js** | ~4.5M | ~131,000 | Stable (v16.1.6) | Vercel |
| **TanStack Start** | ~275K | ~13,600 | RC (not yet 1.0) | TanStack LLC (bootstrapped) |
| **Astro** | ~1.25M | ~56,700 | Stable (v5.7+) | Cloudflare (acquired Jan 2026) |

---

## Eliminated Frameworks

### Hard Blocker: Requires React Rewrite

These frameworks use a different UI library/language than React. Adopting any of them would require rewriting all 3 apps, both design system packages (`@mbe/rialto`, `@mbe/ui`), and the auth package (`@mbe/auth`). This is a non-starter.

| Framework | UI Library | Why Incompatible | What Makes It Good (for greenfield) |
|-----------|-----------|-----------------|--------------------------------------|
| **SvelteKit** | Svelte (custom `.svelte` files) | Own language/compiler; no JSX, no React hooks, no React component model | Best DX satisfaction ratings; 65% smaller bundles; 41% more SSR throughput than Next.js |
| **SolidStart** | SolidJS (signals + JSX) | JSX syntax is deceptive — fundamentally different execution model (components render once, signals not hooks) | Fastest raw DOM performance; fine-grained reactivity eliminates re-render overhead |
| **Nuxt** | Vue 3 (`.vue` SFCs) | Template syntax (`v-if`, `v-for`), Composition API, completely different component format | Excellent auto-imports, Nitro server engine, mature ecosystem |

**Note:** If starting from scratch with no existing React codebase, SvelteKit would be a strong contender for its developer experience and performance characteristics. But the migration cost from an existing React project is prohibitive.

### Eliminated on Fit

| Framework | Reason |
|-----------|--------|
| **Next.js for dashboard/rialto-web** | Adding SSR to authenticated/internal apps provides zero user benefit while adding complexity (auth token forwarding, `"use client"` boundaries everywhere). |
| **Astro for dashboard/rialto-web** | Astro is an MPA framework — client-side state does not persist across page navigations. Fundamentally wrong architecture for an interactive dashboard or component showcase. |

---

## Recommended Shortlist

### Per-App Recommendations

The central finding of this evaluation is that different apps need different solutions:

| App | Recommendation | Rationale |
|-----|---------------|-----------|
| `apps/marketing/` | **Astro** (migrate) | Marketing site needs SEO. Astro ships zero JS, scores Lighthouse 98-100, has content collections for marketing copy. Existing React components work as islands. |
| `apps/dashboard/` | **Vite SPA** (stay) | Authenticated PWA with Konva canvas. SPA is the correct architecture. Add `React.lazy` code splitting for route-level chunks. |
| `apps/rialto-web/` | **Vite SPA** (stay) | Internal component showcase. Already uses `React.lazy` well. No SEO need. SPA is correct. |

### #1 Astro — For the Marketing Site (Recommended)

Astro is the ideal fit for `apps/marketing/` because:

1. **Zero JS by default** — Static HTML ships instantly. Lighthouse 98-100 without optimization effort.
2. **SEO-first** — Server-rendered HTML with meta tags, sitemaps, RSS feeds. Solves the primary pain point.
3. **Content collections** — Type-safe Markdown/MDX with Zod schemas. Purpose-built for marketing content (blog posts, case studies, feature descriptions).
4. **React islands** — Existing `@mbe/ui` and `@mbe/rialto` components work inside islands with zero modification. Interactive elements (nav, contact form) hydrate independently.
5. **Vite-native** — Same build system as other apps. Vite plugins carry over.
6. **Static output** — Deploy as static site on DO App Platform (free tier). No server needed.
7. **Low migration effort** — Marketing site has 1 route. Rewrite `HomePage` as `.astro` template with React islands for interactive parts. The smallest migration scope of any meta-framework.
8. **Cloudflare backing** — Acquired January 2026. Long-term investment guaranteed. MIT license preserved.

**Trade-offs:**
- Learning `.astro` template syntax (straightforward — it's HTML with `---` frontmatter)
- State does not persist across page navigations (non-issue for a marketing site)
- Vite version coupling in monorepo (Astro bundles its own Vite; may differ from other apps)

### #2 Vite SPA — For Dashboard and Rialto-Web (Stay)

The current architecture is correct for authenticated/internal apps:

1. **No SSR overhead** — Dashboard is behind OIDC auth. Rialto-web is an internal tool. SEO is irrelevant for both.
2. **PWA support** — Dashboard uses `vite-plugin-pwa` for offline capability. Meta-frameworks complicate service worker integration.
3. **Konva canvas** — Floor plan editor is inherently client-side. SSR would render nothing useful.
4. **Separate API backend** — `services/users` Fastify API handles all data. No need for server functions or loaders.
5. **Zero migration cost** — Already working. Focus effort on the marketing site, not on over-engineering internal tools.

**Improvements to make without a meta-framework:**
- Add `React.lazy` code splitting to dashboard routes (rialto-web already has this)
- Set up preview deployments via DO GitHub Actions
- Consider React Router v7 framework mode (SPA mode, `ssr: false`) for type-safe routing and automatic code splitting — but only if the routing boilerplate becomes painful

### #3 React Router v7 Framework Mode — Strongest Alternative

If the per-app approach (Astro + Vite SPA) feels like too much tooling diversity, RR v7 framework mode is the unified alternative:

1. **Already installed** — All 3 apps use React Router v7. Migration is incremental.
2. **SPA mode** — `ssr: false` keeps dashboard and rialto-web as SPAs while gaining file-based routing and code splitting.
3. **SSR for marketing** — Enable `ssr: true` or `prerender` for `apps/marketing` only.
4. **Same patterns everywhere** — Loaders, actions, and route modules work identically in SSR and SPA mode.

**When to choose this over Astro + Vite SPA:**
- Team grows and consistent tooling matters more than optimal performance per-app
- Marketing site becomes complex enough to benefit from React's full interactivity model (not just islands)
- Dashboard needs server-side data fetching (e.g., bypass the separate Fastify API)

**Trade-offs vs Astro:**
- Marketing site will ship React runtime (~80 KB) even for static content (Astro ships 0 KB)
- No content collections (must build your own or use a CMS)
- No ISR (must pre-render at build time or use full SSR)

---

## Migration Path Analysis

### Path A: Astro for Marketing Site (Recommended)

**Scope:** Only `apps/marketing/` — the simplest app (1 route, no auth, no complex state).

**Phase 1 — Setup (1-2 hours)**
1. Create new Astro project in `apps/marketing/` (or alongside as `apps/marketing-astro/`)
2. Add `@astrojs/react` integration for React island support
3. Configure Turborepo pipeline for the new Astro build

**Phase 2 — Migration (2-4 hours)**
1. Convert `HomePage` to `.astro` template (static HTML for content, React islands for interactive elements)
2. Import existing `@mbe/ui` or `@mbe/rialto` components as islands
3. Add `@astrojs/sitemap` for SEO
4. Configure proper `<meta>` tags, OG images, structured data

**Phase 3 — Deploy (1 hour)**
1. Update DO App Platform config (already serves static sites)
2. Update Turborepo build pipeline
3. Verify Lighthouse scores (expect 95-100)

**Total estimated effort:** 4-7 hours for a working, SEO-optimized marketing site.

**Risk:** Minimal. The marketing site is 1 route. If Astro doesn't work out, reverting to the React SPA is trivial.

### Path B: React Router v7 Framework Mode (Alternative)

**Scope:** All 3 apps (but primarily `apps/marketing/` for SSR).

**Phase 1 — Marketing Site (4-8 hours)**
1. Add `@react-router/dev` Vite plugin to `apps/marketing/`
2. Create `react-router.config.ts` with `prerender: true` for SSG
3. Convert `App.tsx` routes to file-based route modules
4. Add loaders for any data fetching, `meta` exports for SEO

**Phase 2 — Dashboard (optional, 8-16 hours)**
1. Add `@react-router/dev` Vite plugin with `ssr: false`
2. Migrate 10 routes to file-based modules incrementally
3. Adopt loaders for data fetching (replace `useEffect` + fetch)
4. Gain automatic code splitting per route

**Phase 3 — Rialto-Web (optional, 4-8 hours)**
1. Add `@react-router/dev` Vite plugin with `ssr: false`
2. Migrate 12 routes (already uses lazy loading, so gain is minimal)

**Total estimated effort:** 4-8 hours for marketing site; 16-32 hours for all 3 apps.

### Path C: Next.js (Not Recommended)

**Why not:**
1. Bundler change (Vite → Turbopack) affects every app and shared package
2. Highest migration effort of any option
3. RSC `"use client"` boundaries add complexity for the dashboard (which is entirely client-side)
4. Leaving DigitalOcean for Vercel (to get full feature set) is a separate infrastructure decision
5. Overkill for a 1-route marketing site and two internal SPAs

**When to reconsider:** If the project grows to need ISR at scale, RSC for complex server-side rendering, or Vercel's deployment infrastructure, Next.js becomes the rational choice. But that is not the current state.

---

## Decision Matrix

| Scenario | Recommended Action |
|----------|-------------------|
| **Current state** (3 SPAs, marketing site needs SEO) | Migrate `apps/marketing/` to **Astro**; keep dashboard and rialto-web as Vite SPAs |
| Marketing site grows (blog, case studies, many pages) | **Astro** — content collections are purpose-built for this |
| Dashboard needs server-side data fetching | **RR v7 Framework Mode** — add loaders incrementally while keeping SPA mode |
| Want unified tooling across all apps | **RR v7 Framework Mode** — same framework, different rendering strategies per app |
| Need ISR for content that updates frequently | **Next.js** or **TanStack Start** — only frameworks with true ISR |
| Moving to Vercel for hosting | **Next.js** — purpose-built for Vercel with automatic previews, edge, analytics |
| Team grows, need industry-standard framework | **Next.js** — largest ecosystem, most hiring pool, most learning resources |
| Want type-safe routing with Vite | **TanStack Start** (after 1.0) or **RR v7 Framework Mode** |
| Marketing site becomes highly interactive (not just content) | **RR v7 Framework Mode** — full React on every page, SSR for SEO |
| Need preview deployments immediately | Set up DO GitHub Actions (works with any framework); or move marketing site to Vercel/Cloudflare Pages |

---

## Re-Evaluation Triggers

Watch for these events that should trigger a fresh evaluation:

1. **TanStack Start ships 1.0** — Moves from RC to stable. Re-evaluate as unified framework (Vite-native, ISR, type-safe routing). Monitor monorepo bug fixes.
2. **Marketing site grows beyond 10 pages** — Content collections and build performance become more important. Validates Astro choice or triggers reconsideration of Next.js for ISR.
3. **Considering Vercel for hosting** — Next.js immediately becomes the default recommendation. The hosting evaluation should revisit this.
4. **React Router v7 ships stable RSC support** — Currently preview/Parcel-only. When Vite-based RSC is stable, RR v7 framework mode becomes a much stronger unified solution.
5. **Dashboard needs server-side rendering** — If the business model changes and dashboard content needs to be public/indexed, re-evaluate RR v7 framework mode or Next.js for the dashboard.
6. **Astro Vite version conflicts cause monorepo issues** — If Astro's bundled Vite conflicts with Vite 7 in other apps, evaluate workarounds or consider RR v7 framework mode for the marketing site instead.
7. **Team grows beyond 1 developer** — Tooling diversity (Astro + Vite SPA) may become a maintenance burden. A unified framework (RR v7 or Next.js) reduces context-switching for the team.
8. **Vite 8 ships with Rolldown as default** — Monitor Astro compatibility with Vite 8. May resolve or create monorepo version conflicts.

---

## Sources

### React Router v7
- [React Router: Picking a Mode](https://reactrouter.com/start/modes)
- [React Router: Rendering Strategies](https://reactrouter.com/start/framework/rendering)
- [React Router: Framework Adoption from Component Routes](https://reactrouter.com/upgrading/component-routes)
- [React Router: Deploying](https://reactrouter.com/start/framework/deploying)
- [React Router: Data Loading](https://reactrouter.com/start/framework/data-loading)
- [React Router: Middleware](https://reactrouter.com/how-to/middleware)
- [React Router RSC Preview](https://remix.run/blog/rsc-preview)
- [react-router on npm](https://www.npmjs.com/package/react-router)

### Next.js
- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- [Next.js 16.1 Blog Post](https://nextjs.org/blog/next-16-1)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js SPA Guide](https://nextjs.org/docs/app/guides/single-page-applications)
- [Next.js CSS Guide](https://nextjs.org/docs/app/getting-started/css)
- [Migrating from Vite to Next.js](https://nextjs.org/docs/app/guides/migrating/from-vite)
- [Vercel Pricing](https://vercel.com/pricing)
- [DigitalOcean Next.js Hosting](https://www.digitalocean.com/solutions/nextjs-hosting)
- [Turbopack API Reference](https://nextjs.org/docs/app/api-reference/turbopack)

### TanStack Start
- [TanStack Start v1 RC Announcement](https://tanstack.com/blog/announcing-tanstack-start-v1)
- [TanStack Start Overview](https://tanstack.com/start/latest/docs/framework/react/overview)
- [TanStack Start: Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start: Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [Why TanStack Start is Ditching Adapters](https://tanstack.com/blog/why-tanstack-start-is-ditching-adapters)
- [Migrating TanStack Start from Vinxi to Vite](https://blog.logrocket.com/migrating-tanstack-start-vinxi-vite/)
- [Inngest: Reducing Local Dev Time by 83%](https://www.inngest.com/blog/migrating-off-nextjs-tanstack-start)
- [@tanstack/react-start on npm](https://www.npmjs.com/package/@tanstack/react-start)

### Astro
- [Astro Islands Documentation](https://docs.astro.build/en/concepts/islands/)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro Actions](https://docs.astro.build/en/guides/actions/)
- [Astro Server Islands](https://docs.astro.build/en/guides/server-islands/)
- [Astro 6 Beta](https://astro.build/blog/astro-6-beta/)
- [Cloudflare Acquires Astro](https://blog.cloudflare.com/astro-joins-cloudflare/)
- [@astrojs/react Integration](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Astro: Migrating from CRA](https://docs.astro.build/en/guides/migrate-to-astro/from-create-react-app/)
- [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [Astro on npm](https://www.npmjs.com/package/astro)

### SvelteKit
- [SvelteKit on npm](https://www.npmjs.com/package/@sveltejs/kit)
- [Svelte GitHub](https://github.com/sveltejs/svelte)
- [SvelteKit vs Next.js 16 Benchmarks](https://www.devmorph.dev/blogs/sveltekit-vs-nextjs-16-performance-benchmarks-2026)

### SolidStart
- [SolidStart GitHub](https://github.com/solidjs/solid-start)
- [SolidStart 1.0 Announcement](https://www.solidjs.com/blog/solid-start-the-shape-frameworks-to-come)
- [SolidJS vs React: Comparing Component Models](https://blog.openreplay.com/solidjs-vs-react-comparing-component-models-performance/)

### Nuxt
- [Nuxt GitHub](https://github.com/nuxt/nuxt)
- [Nuxt 4.0 Announcement](https://nuxt.com/blog/v4)

### Vite
- [Vite 7.0 Announcement](https://vite.dev/blog/announcing-vite7)
- [Vite 8 Beta: Rolldown-powered](https://vite.dev/blog/announcing-vite8-beta)
- [Vite vs Next.js Comparison](https://designrevision.com/blog/vite-vs-nextjs)

### DigitalOcean
- [App Platform Pricing](https://www.digitalocean.com/pricing/app-platform)
- [App Platform Static Sites](https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/)
- [GitHub Actions for App Platform](https://www.digitalocean.com/blog/github-actions-for-app-platform)

### Comparisons
- [Next.js, React Router, TanStack: When To Use Each](https://thenewstack.io/next-js-react-router-tanstack-when-to-use-each/)
- [TanStack Start vs Next.js (LogRocket)](https://blog.logrocket.com/tanstack-start-vs-next-js-choosing-the-right-full-stack-react-framework/)
- [Astro vs Next.js for Static Sites](https://eastondev.com/blog/en/posts/dev/20251202-astro-vs-nextjs-static-site/)
- [React Architecture Tradeoffs: SPA, SSR, or RSC](https://reacttraining.com/blog/react-architecture-spa-ssr-rsc)
