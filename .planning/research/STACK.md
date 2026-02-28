# Stack Research

**Domain:** Design system migration and multi-SPA hosting
**Researched:** 2026-02-27
**Confidence:** HIGH — core stack already validated in production; research focused on migration tooling and infrastructure patterns

---

## Context: What is NOT Being Researched

The base stack is fixed by `PROJECT.md` constraints:

> React 19, Vite 7, TypeScript — no framework changes

This research addresses only:
1. How to migrate apps from Tailwind + @mbe/ui to Rialto-only
2. How to correctly configure multi-SPA path-prefix hosting on DigitalOcean App Platform

---

## Recommended Stack

### Core Technologies (Unchanged)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.0.0 | UI framework | Already in use; React 19 concurrent features already active |
| Vite | 7.0.0 | Build tool | Already in use; `base` config option is the key mechanism for path-prefix SPAs |
| TypeScript | 5.9.3 | Type safety | Already in use; strict mode enforced |
| React Router DOM | 7.1.0 | Client-side routing | Already in use; `basename` prop on `BrowserRouter` must match the Vite `base` path |
| @mbe/rialto | 0.1.0 | Design system | The migration target — CSS Modules + CSS custom properties, no Tailwind dependency |

### Migration Approach: Rialto CSS Architecture

Rialto already uses the correct 2025/2026 pattern. Confirmed by reading the source:

- **CSS Modules** for scoping: each component has a `ComponentName.module.css` file
- **CSS custom properties** (`var(--rialto-*)`) for all visual values — no hardcoded colors, spacing, or radii
- **No runtime CSS-in-JS** — zero runtime overhead, works with SSR if ever needed
- **Vite library mode** with `cssFileName: "styles"` — all component styles bundled into `dist/lib/styles.css`, exported as `@mbe/rialto/styles`

This is the right pattern. No alternative styling architecture is needed.

### Multi-SPA Path-Prefix Hosting

The infrastructure already has the correct pattern in `infrastructure/pulumi/index.ts`. The existing `dashboard` app already demonstrates the complete working configuration.

**Required alignment (must match across three files for each app):**

| Config file | Setting | Example (hospitality) |
|------------|---------|----------------------|
| `vite.config.ts` | `base: "/hospitality/"` | Sets asset URL prefix at build time |
| `App.tsx` (BrowserRouter) | `basename="/hospitality"` | Tells React Router where the app is mounted |
| `pulumi/index.ts` (ingress rule) | `prefix: "/hospitality"` | Routes traffic to the correct static site |
| `pulumi/index.ts` (static site) | `catchallDocument: "index.html"` | Enables client-side routing |
| PWA manifest | `scope: "/hospitality/"`, `start_url: "/hospitality/"` | Required for PWA correctness |

### Supporting Libraries (Migration-Specific)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @mbe/rialto | 0.1.0 | Replacement for @mbe/ui and Tailwind | Every component in migrated apps |
| framer-motion | ^12.0.0 | Animation (peer dep of Rialto) | Already installed as peer dep; required |
| lucide-react | >=0.400.0 | Icons (peer dep of Rialto) | Already installed as peer dep; required |
| vite-plugin-dts | ^4.5.4 | TypeScript declarations for Rialto | Already in use in Rialto's lib build |

### Libraries Being Removed

| Library | Why Removed | Replaced By |
|---------|------------|-------------|
| tailwindcss | No longer the design system; creates maintenance burden and styling conflicts with Rialto | Rialto's CSS Modules + CSS custom properties |
| postcss | Only needed as Tailwind's build pipeline; not needed without Tailwind | Remove when Tailwind is removed |
| autoprefixer | Same — Tailwind's PostCSS plugin chain | Remove when PostCSS is removed |
| @mbe/ui | Explicitly being replaced by Rialto (noted in codebase docs); built on Tailwind + class-variance-authority + Radix | @mbe/rialto |
| class-variance-authority | @mbe/ui's variant utility | Not needed — Rialto uses CSS module class composition |
| tailwind-merge | @mbe/ui's className merge utility | Not needed — Rialto uses explicit className composition |
| clsx | @mbe/ui's conditional class helper | Not needed — Rialto components compose classes directly |

---

## Alternatives Considered

### CSS-in-JS (e.g., styled-components, Emotion)

**Not recommended.** By 2026, the community consensus is that runtime CSS-in-JS trades developer convenience for performance regression, SSR complexity, and debugging difficulty. The project already made the correct call: Rialto uses CSS Modules + CSS custom properties, which has zero runtime overhead and full SSR compatibility. Do not introduce CSS-in-JS.

### Tailwind CSS v4 (upgrade instead of remove)

**Not recommended.** Tailwind v4 has a CSS-first config model and is architecturally different from v3. The project decision is to remove Tailwind entirely and standardize on Rialto. An upgrade would still leave two design systems competing — Tailwind utility classes and Rialto token-based classes — with ongoing risk of style conflicts. Removal is the right call.

### shadcn/ui (headless component approach)

**Not applicable.** The project already has 55+ Rialto components. Shadcn is the right choice when starting fresh with no design system. Here, the design system exists and is the target, not the problem.

### Vite base: `"./"` (relative base for portable builds)

**Not recommended for this project.** Relative base (`base: "./"`) enables deployment without knowing the path at build time. Useful for IPFS or unknown paths. Here, the paths are known and fixed (marketing at `/`, hospitality at `/hospitality`, rialto-web at `/rialto`). Static base paths produce cleaner asset URLs and correct absolute asset resolution.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Tailwind CSS utility classes in migrated apps | Creates dual design system — conflicts with Rialto tokens, doubles maintenance | Rialto CSS Modules + `var(--rialto-*)` tokens |
| Raw inline styles with hardcoded values | Bypasses the design token system; breaks theming | Rialto components with `style` prop using `var(--rialto-*)` variables only |
| @mbe/ui components | Tailwind-dependent; being deprecated | @mbe/rialto equivalents |
| CSS-in-JS libraries | Runtime overhead, SSR complexity | Rialto's CSS Modules approach |
| React Router without `basename` | App routes break when served at a sub-path; `/about` resolves to `/about` instead of `/hospitality/about` | `<BrowserRouter basename="/hospitality">` |
| Vite `base` without trailing slash | Known Vite issue: trailing slash required for correct asset resolution in sub-path builds | `base: "/hospitality/"` (trailing slash required) |
| `preservePathPrefix: false` for SPAs (DigitalOcean) | DigitalOcean strips the prefix before forwarding to the static site; SPAs built with a base path expect it in URLs — omitting the flag strips the path the app is expecting | Set `preservePathPrefix: false` only when the backend handles its own routing (like the users-api). For static SPAs, the ingress rule does NOT strip the path — the SPA's `vite.config.ts base` handles URL prefix alignment. |

---

## Installation (Migration Steps Per App)

```bash
# 1. In each migrated app, remove Tailwind + @mbe/ui
pnpm remove tailwindcss postcss autoprefixer @mbe/ui --filter @mbe/<app-name>

# 2. Add @mbe/rialto
pnpm add @mbe/rialto --filter @mbe/<app-name>

# 3. Import Rialto styles in main entry point
# apps/<app-name>/src/main.tsx
import "@mbe/rialto/styles";
```

```typescript
// 4. Update App.tsx basename to match Vite base
// apps/hospitality/src/App.tsx
<BrowserRouter basename="/hospitality">

// apps/rialto-web/src/App.tsx
<BrowserRouter basename="/rialto">

// apps/marketing/src/App.tsx
<BrowserRouter basename="/">  // or omit basename entirely — root has no sub-path
```

```typescript
// 5. vite.config.ts: ensure base is set correctly
// apps/hospitality/vite.config.ts
export default defineConfig({
  base: "/hospitality/",   // must match React Router basename
  // ...
});
```

```typescript
// 6. Delete tailwind.config.js and postcss.config.js from each app
// These files are only needed for Tailwind's build pipeline
```

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @mbe/rialto 0.1.0 | react@^19.0.0, framer-motion@^12.0.0, lucide-react@>=0.400.0 | Peer deps must be installed in consuming app |
| react-router-dom 7.1.0 | react@^19.0.0 | React Router v7 requires React 18+; 19 is supported |
| vite 7.0.0 | @vitejs/plugin-react@^5.0.0 | Plugin version must be >=5.0.0 for Vite 7 compat |
| vite-plugin-pwa 1.2.0 | vite@^7.0.0 | PWA plugin already upgraded to Vite 7 in dashboard |
| Vite `base: "/path/"` | React Router `basename="/path"` | Both must match. Vite base has trailing slash; React Router basename does NOT include trailing slash. |

---

## Stack Patterns by Variant

**Marketing app (root `/`):**
- `vite.config.ts`: no `base` config (defaults to `/`) or explicitly `base: "/"`
- `App.tsx`: `<BrowserRouter>` with no `basename`
- Pulumi ingress: `prefix: "/"` as the catch-all, last in rules array
- `catchallDocument: "index.html"` required

**Hospitality app (renamed from dashboard, at `/hospitality`):**
- `vite.config.ts`: `base: "/hospitality/"`
- `App.tsx`: `<BrowserRouter basename="/hospitality">`
- PWA scope/start_url: `"/hospitality/"`
- Pulumi ingress: `prefix: "/hospitality"`, ordered before the catch-all `/`
- `catchallDocument: "index.html"` required

**Rialto showcase app (at `/rialto`):**
- Already correctly configured: `base: "/rialto/"` in vite.config.ts
- Needs `<BrowserRouter basename="/rialto">` if it uses React Router client-side navigation
- Pulumi ingress rule for `/rialto` needs to be added (currently not in index.ts)

---

## Pulumi Ingress Ordering Rule

Ingress rules in DigitalOcean App Platform are evaluated in order. More specific paths must appear before less specific ones:

```typescript
// Correct order (most specific → least specific):
rules: [
  { match: { path: { prefix: "/api" } },         component: { name: "users-api" } },
  { match: { path: { prefix: "/hospitality" } },  component: { name: "hospitality" } },
  { match: { path: { prefix: "/rialto" } },       component: { name: "rialto-web" } },
  { match: { path: { prefix: "/" } },             component: { name: "marketing" } },  // catch-all last
]
```

---

## Sources

- Context7 `/vitejs/vite` — Verified `base` config, library mode CSS, `--base` CLI flag behavior (HIGH confidence)
- Context7 `/remix-run/react-router` — Verified `BrowserRouter` `basename` prop API and React Router v7 config (HIGH confidence)
- DigitalOcean App Platform docs (https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/) — `catchallDocument` and `preservePathPrefix` behavior (MEDIUM confidence — doc verified, not hands-on tested for new `/hospitality` path)
- packages/rialto source code — Confirmed CSS Modules + CSS custom properties pattern, lib build config, peer deps (HIGH confidence — read directly)
- infrastructure/pulumi/index.ts — Confirmed existing ingress pattern, static site config, DigitalOcean App Platform Pulumi schema (HIGH confidence — read directly)
- apps/dashboard/vite.config.ts — Confirmed working `base: "/dashboard/"` pattern with PWA (HIGH confidence — existing working implementation)
- apps/*/package.json — Confirmed current Tailwind, @mbe/ui, and postcss dependencies to remove (HIGH confidence — read directly)
- WebSearch: "React & CSS in 2026: Best Styling Approaches Compared" (https://medium.com/@imranmsa93/react-css-in-2026-best-styling-approaches-compared-d5e99a771753) — CSS Modules vs CSS-in-JS 2026 ecosystem sentiment (LOW confidence — Medium article, used to corroborate, not as primary source)
- WebSearch: sancho.dev "Don't use Tailwind for your Design System" (https://sancho.dev/blog/tailwind-and-design-systems) — why Tailwind and design systems conflict (MEDIUM confidence — well-argued technical article)

---

*Stack research for: Rialto Unification & Hosting — design system migration and multi-SPA hosting*
*Researched: 2026-02-27*
