# Pitfalls Research

**Domain:** Design system migration (Tailwind CSS → Rialto) + multi-SPA hosting (DigitalOcean App Platform)
**Researched:** 2026-02-27
**Confidence:** HIGH (infrastructure pitfalls verified against existing code; migration pitfalls verified against community sources and codebase audit)

---

## Critical Pitfalls

### Pitfall 1: Tailwind Preflight (CSS Reset) Survives the Migration

**What goes wrong:**
When Tailwind is removed, teams delete the `@tailwind base; @tailwind components; @tailwind utilities;` directives but forget that Tailwind's `preflight.css` injected an opinionated CSS reset. After removal, browser default styles return — unstyled `<h1>` through `<h6>` tags, `<ul>` bullets, form element borders, and box-sizing differences appear. Rialto has its own `reset.css` (imported via `@mbe/rialto/styles`), but if Rialto styles aren't imported before app-local CSS, the app looks visually broken until engineers hunt down why headings suddenly have bold+large default rendering.

**Why it happens:**
Developers delete Tailwind from `index.css` and PostCSS config, run the app, and see apparent breakage. They often blame Rialto rather than the missing reset replacement. The `apps/marketing/src/index.css` and `apps/dashboard/src/index.css` files both currently have `@tailwind base; @tailwind components; @tailwind utilities;` at the top — removing these without importing `@mbe/rialto/styles` first creates a reset vacuum.

**How to avoid:**
Import `@mbe/rialto/styles` in `main.tsx` BEFORE any app-local CSS, as the rialto-web app already does correctly:
```tsx
import "@mbe/rialto/styles";
import "./global.css";
```
Do this in every migrated app's `main.tsx` on the first line. Verify in browser DevTools that `--rialto-*` custom properties appear on `:root` after migration.

**Warning signs:**
- Headings appear larger/bolder than expected after Tailwind removal
- Unordered lists show bullet points that shouldn't be there
- Form inputs revert to browser-default styles (3D border on text fields)
- `body` has default margin
- Running the app after removing Tailwind config but before importing Rialto styles

**Phase to address:** Phase 1 (rialto-web migration) — establish the correct import order pattern that all subsequent app migrations follow.

---

### Pitfall 2: `preservePathPrefix: false` Breaks React Router's Route Matching

**What goes wrong:**
The DigitalOcean App Platform ingress config uses `preservePathPrefix: false` for the dashboard component. This strips the `/dashboard` prefix before passing the request to the static site. The static site then serves `index.html` at what it thinks is `/`, and the `BrowserRouter` with `basename="/dashboard"` in `apps/dashboard/src/main.tsx` correctly expects routes like `/dashboard/reservations`. But if the prefix is stripped before the browser sees it, the browser URL still shows `/dashboard/reservations` (it's the browser URL, not modified by DOAP), so React Router should work. The actual danger is when adding `rialto-web` and `hospitality` to the ingress — `preservePathPrefix` must be `false` consistently and the Vite `base` config must match. Misconfiguration in either direction causes either a blank page (wrong `base`) or a 404 loop (wrong ingress rule ordering).

**Why it happens:**
DigitalOcean App Platform ingress `preservePathPrefix: false` means the path prefix is stripped when routing to the component internally, but the browser still sees the full path. The Vite `base` property must match the browser-visible path, not the internally-routed path. Teams get confused because there are two "paths" — the browser URL and the internal routing target — and conflate them.

**How to avoid:**
- Vite `base` = browser-visible prefix. Set `base: "/rialto/"` for rialto-web, `base: "/hospitality/"` for hospitality. Marketing stays at `base: "/"`.
- `preservePathPrefix: false` in DOAP ingress means DOAP strips the prefix internally before serving the static file root. This is correct behavior.
- `catchallDocument: "index.html"` must be set on every static site component so React Router receives all sub-routes.
- Always test deep links directly (navigate to `/rialto/some-page` directly, not via in-app navigation) — these fail first when misconfigured.

**Warning signs:**
- App loads at root (`/rialto`) but navigating to a sub-page and refreshing returns 404 or blank
- Assets (JS/CSS) 404 with paths like `/assets/index.abc123.js` instead of `/rialto/assets/index.abc123.js`
- The current `preservePathPrefix: false` on dashboard works — `rialto` and `hospitality` must match this pattern

**Phase to address:** Phase 3 (hosting/infrastructure) — verify by testing direct deep links to each app's sub-routes in staging before adding DNS.

---

### Pitfall 3: Auth0 Callback URL Not Updated for Renamed/New Apps

**What goes wrong:**
The `dashboard` app is being renamed to `hospitality` and its URL changes from `/dashboard` to `/hospitality`. The Auth0 application's "Allowed Callback URLs" currently has `https://mattbutlerengineering.com/dashboard/callback` registered. After renaming, the OIDC redirect will fail with "Callback URL mismatch" error — users will click "Sign In" and Auth0 will reject the login because the new callback URL (`/hospitality/callback`) is not on the allowlist.

**Why it happens:**
Auth0 enforces an exact allowlist for callback URLs — wildcards only work for subdomains, not path prefixes. The Pulumi `auth0Outputs` config manages these URLs, but the rename may not trigger an update to the Auth0 application settings if it's not explicitly tracked. The `VITE_AUTH_REDIRECT_URI` env var in Pulumi `index.ts` currently points to `/dashboard/callback` — this must change atomically with the rename.

**How to avoid:**
Update Auth0 "Allowed Callback URLs" and "Allowed Logout URLs" in Auth0 (via Pulumi IaC) before or simultaneously with renaming the app. The `VITE_AUTH_REDIRECT_URI` env var in the DOAP spec must be updated to `/hospitality/callback`. Verify in Auth0 dashboard that the old URL is removed and new URL is added. Do not remove the old URL until the rename deployment is complete (brief dual-registration during transition is safe).

**Warning signs:**
- Login flow redirects to Auth0, then returns an error page instead of the app
- Auth0 error: "Callback URL mismatch" in browser or Auth0 logs
- The `main.tsx` default fallback `window.location.origin + "/dashboard/callback"` will also need updating

**Phase to address:** Phase 2 (rename dashboard → hospitality) — must be on the checklist before deploying the renamed app to production.

---

### Pitfall 4: Tailwind Classes Left in Component Markup After Library Swap

**What goes wrong:**
After replacing `@mbe/ui` imports with `@mbe/rialto` and removing Tailwind from `index.css`, Tailwind utility classes remain scattered throughout JSX — `className="min-h-screen flex items-center justify-center bg-gray-50"` and similar. Without Tailwind, these class strings are inert and produce no visual effect. The UI appears unstyled or layout-broken for the specific components containing those leftover classes. This is confirmed by the current `apps/dashboard/src/App.tsx` `LoginPrompt` component (line 51-52), which uses raw Tailwind classes.

**Why it happens:**
The `@mbe/ui` → `@mbe/rialto` import swap is mechanical and easy to grep. But raw Tailwind utility classes in JSX have no `import` statement to find — they're invisible to tooling unless actively searched. With 442 `className` occurrences in `apps/dashboard/src/` alone, missed instances are guaranteed without a systematic audit.

**How to avoid:**
After removing Tailwind from PostCSS and `index.css`, run the app and check DevTools Network panel — if Tailwind's stylesheet is not loaded, any remaining `className` values will visually do nothing. Use this as a forcing function. Audit with:
```bash
grep -r "className" apps/<app>/src/ --include="*.tsx" | grep -v "@mbe/rialto"
```
Replace each with Rialto components or inline `style` using `var(--rialto-*)` tokens. The `LoginPrompt` component in dashboard is a known instance to address.

**Warning signs:**
- Elements appear unstyled (no flex layout, no color, no spacing) in specific areas after migration
- DevTools shows elements have class strings like `min-h-screen` but no corresponding CSS rules
- Visual regression tests (Playwright) detect layout changes from baseline

**Phase to address:** Each app's migration phase — run visual regression tests against the previous screenshot baseline immediately after Tailwind removal.

---

### Pitfall 5: `@mbe/ui` Removal Breaks Before All Consumers Are Migrated

**What goes wrong:**
The project plans to remove `@mbe/ui` after migrating all three apps. If `@mbe/ui` is removed from the monorepo workspace before all consumers are updated, the TypeScript build fails for any app still importing from it. Because Turborepo uses build caching, a build that "succeeded" locally with cache may mask this failure until CI runs a fresh build. The package.json removal also breaks `pnpm install` for all downstream apps simultaneously.

**Why it happens:**
`@mbe/ui` is referenced in 6 files across marketing and dashboard (confirmed from codebase grep). The incremental migration plan (rialto-web first, then marketing, then hospitality) means `@mbe/ui` must remain in the workspace until the last consumer is migrated. Removing it early — even accidentally via workspace cleanup — breaks all remaining consumers.

**How to avoid:**
Do NOT remove `@mbe/ui` from `packages/` until ALL three apps are confirmed Rialto-only. Track the removal as its own final phase step. Add a typecheck CI step that catches broken imports before merge. Use `pnpm typecheck` at the root to confirm zero import errors from `@mbe/ui` before the package is deleted.

**Warning signs:**
- `Module not found: @mbe/ui` TypeScript errors in any app
- A PR removes `packages/ui` without first verifying all `import { ... } from "@mbe/ui"` occurrences are gone

**Phase to address:** Final step of Phase 3 (or whichever phase completes the last app migration) — explicit "remove @mbe/ui" task only after all three apps pass typecheck clean.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leave Tailwind installed but not imported | Avoids CSS conflicts during migration | Tailwind dep remains in package.json, confused future engineers, larger lockfile | Never — remove cleanly per app |
| Use inline `style={{ }}` instead of Rialto tokens for one-off values | Fast to write | Hardcoded values bypass the design system's consistency guarantees; "one exception" multiplies into dozens | Only during active migration as a placeholder — must be resolved before phase completes |
| Keep both `@mbe/ui` and `@mbe/rialto` imports in the same file during transition | Gradual swap | Two design systems coexist; components using each may not visually match; Tailwind + Rialto CSS resets conflict | Acceptable only for the duration of a single app's migration sprint, not across multiple sprints |
| Skip visual regression baseline for "simple" components | Saves setup time | No safety net detects unintended visual changes after Tailwind removal | Never — establish Playwright baselines before starting each app's migration |
| Use `className` with hardcoded color hex values to match Rialto appearance | Looks correct immediately | Bypasses `--rialto-*` token system; breaks theming; requires global search-and-replace later | Never — use `var(--rialto-surface)` etc. from day one |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Auth0 (rename dashboard → hospitality) | Deploying the renamed app before updating Auth0 allowed callback URLs | Update Auth0 "Allowed Callback URLs" in Pulumi IaC atomically with the rename; deploy IaC change first, app second |
| DigitalOcean App Platform ingress (adding rialto app) | Adding rialto ingress rule after the `/` catch-all rule | DOAP ingress rules are evaluated in order — `/rialto` rule must be listed before `/` catch-all in `infrastructure/pulumi/index.ts` |
| Vite base + React Router basename (new apps) | Setting Vite `base: "/hospitality/"` but BrowserRouter `basename="/hospitality"` (without trailing slash) | Vite `base` uses trailing slash; React Router `basename` should NOT have trailing slash — `basename="/hospitality"` is correct. Trailing slash in basename causes route matching failures |
| DigitalOcean App Platform + rialto static site | Missing `catchallDocument: "index.html"` on new static site spec | All static SPA components need `catchallDocument: "index.html"` to handle React Router client-side routes returning 200 instead of 404 on page refresh |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rialto CSS bundle loaded multiple times (once per SPA) | Slower initial load for users who visit multiple apps | Rialto tokens and reset are self-contained; no de-duplication needed for separate SPAs. Each SPA correctly imports its own copy. | Not a real trap for 3 SPAs — becomes a concern only if 10+ apps share the same CDN |
| PWA service worker scope conflict between apps | Service worker for `/dashboard/` intercepts requests for `/rialto/` | Each app's workbox `navigateFallbackAllowlist` must scope to its own path prefix. `rialto-web` already does this correctly with `navigateFallbackAllowlist: [/^\/rialto\//]`. Hospitality must do the same. | Immediately on deployment of second PWA if scopes overlap |
| Framer Motion bundle duplicated across SPAs | Larger JS bundles per app | Acceptable for separate SPAs — no shared vendor chunk across DOAP static sites. If bundle size becomes a concern, Rialto's tree-shaking handles unused components. | At current scale (3 apps), not a problem |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Auth0 callback URL includes wildcard path (`/hospitality/*`) | Auth0 does not support path wildcards — the registration silently fails or is rejected, leaving login broken | Register exact paths: `https://mattbutlerengineering.com/hospitality/callback` — verify in Auth0 dashboard after Pulumi deploy |
| Leaving old `/dashboard/callback` in Auth0 allowlist permanently after rename | Orphaned callback URL; future confusion about what apps are valid | Remove old URL from Auth0 allowlist after the rename is fully deployed and verified |
| `VITE_AUTH_REDIRECT_URI` hardcoded fallback `window.location.origin + "/dashboard/callback"` left unchanged after rename | If the env var is missing in a deployment, authentication redirects to wrong URL silently | Update default fallback in `apps/hospitality/src/main.tsx` to `/hospitality/callback` as part of the rename |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Migrating one section of a page to Rialto while leaving adjacent sections in Tailwind | Users see visual inconsistency on the same page (different spacing, colors, typography) — looks like a broken UI | Migrate complete pages (or complete components) atomically; avoid half-migrated states in production |
| Marketing site at `/` shows blank between deploying Rialto migration and old Tailwind build | Users visiting during deployment see unstyled or blank page | Use DOAP's zero-downtime deploy; test with `pnpm build --filter=@mbe/marketing` locally before deploy |
| Rialto `RialtoProvider` missing at app root | Rialto components that depend on theme context (vibe, color mode) render with fallback/broken styles | Add `RialtoProvider` at the top of each app's component tree, as rialto-web does in `DemoLayout.tsx` |
| Deep link to `/rialto/some-page` shows 404 after deployment | Users who bookmark or share links to rialto-web sub-pages get 404 | Verify `catchallDocument: "index.html"` is set in DOAP spec for rialto static site, and that Vite `base: "/rialto/"` is set |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Tailwind removal:** Removed from `index.css` directives — verify PostCSS config (`postcss.config.js`) and `tailwind.config.js` are also deleted; verify `tailwindcss` removed from `package.json` devDependencies
- [ ] **@mbe/ui removal:** Import statements replaced in JSX — verify `@mbe/ui` is removed from app's `package.json` dependencies; verify `packages/ui` package.json still exists (don't delete until ALL apps are migrated)
- [ ] **Rialto styles imported:** `@mbe/rialto/styles` shows in browser DevTools Sources — verify `--rialto-surface` CSS custom property resolves on `:root` in DevTools
- [ ] **Path-prefix routing works:** App loads at `/rialto/` — verify direct navigation to `/rialto/some-sub-page` (deep link) returns 200 + correct content, not 404
- [ ] **Auth0 callback works for renamed app:** Login flow initiates — verify it completes and redirects back to `/hospitality/` (not `/dashboard/`)
- [ ] **Visual regression baseline:** Migration "looks correct" — run Playwright screenshot comparison against pre-migration baseline; every page in the migrated app must pass

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tailwind Preflight removed, Rialto reset not imported | LOW | Add `import "@mbe/rialto/styles";` as first import in `main.tsx`; rebuild; verify in browser |
| DOAP ingress rule ordering wrong (rialto traffic routed to marketing) | LOW | Reorder rules in `infrastructure/pulumi/index.ts` — most-specific-first, `/` last; `pulumi up` |
| Auth0 callback URL mismatch after rename | LOW | Update Pulumi auth0 config with new callback URL; `pulumi up`; test login flow |
| Leftover Tailwind classes discovered post-migration | MEDIUM | Grep for `className` patterns; replace with Rialto components or `var(--rialto-*)` tokens; retest visually |
| `@mbe/ui` deleted prematurely (builds break) | MEDIUM | Restore `packages/ui` from git history (`git checkout HEAD~1 -- packages/ui`); finish remaining migrations; re-delete cleanly |
| PWA service worker scope conflict | MEDIUM | Clear service workers in browser DevTools; fix `navigateFallbackAllowlist` scope in vite config; rebuild and redeploy |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tailwind Preflight removed without Rialto reset | Phase 1: rialto-web migration (establishes pattern) | `--rialto-surface` resolves on `:root` in DevTools after migration |
| `preservePathPrefix` / Vite `base` misconfiguration | Phase 3: hosting/infrastructure | Direct deep-link to `/rialto/any-sub-route` returns 200 in staging |
| Auth0 callback URL mismatch after rename | Phase 2: rename dashboard → hospitality | Login flow completes to `/hospitality/` in staging before production deploy |
| Tailwind classes left in JSX after library swap | Each app's migration phase | Zero `className` strings containing Tailwind utilities remain after grep audit; Playwright screenshots match baseline |
| `@mbe/ui` removed before all consumers migrated | Final step of last app migration | `pnpm typecheck` at root passes with zero errors; `grep -r "@mbe/ui" apps/` returns zero results before deletion |
| PWA service worker scope conflict | Phase 3: hospitality migration (second PWA) | ServiceWorker scope in browser DevTools shows correct path prefix; no cross-app navigation interceptions |

---

## Sources

- DigitalOcean App Platform static site catchall: https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/ (MEDIUM confidence — official DO docs)
- DigitalOcean SPA routing fix: https://blog.hao.dev/digitalocean-app-platform-how-to-redirect-all-requests-to-index-html-for-single-page-applications/ (MEDIUM confidence — practitioner account)
- React Router basename pitfalls: https://github.com/remix-run/react-router/issues/8427, https://github.com/remix-run/react-router/issues/7216 (HIGH confidence — official repo issue tracker)
- Vite base path / asset 404 issues: https://medium.com/@aleksej.gudkov/resolving-vite-v5-4-2-build-404-error-e1f13914f2d7 (MEDIUM confidence — practitioner)
- Auth0 callback URL wildcard limitations: https://community.auth0.com/t/how-do-i-set-up-a-dynamic-allowed-callback-url/60268 (HIGH confidence — Auth0 official community)
- Tailwind CSS specificity / class conflicts: https://github.com/tailwindlabs/tailwindcss/issues/8670 (HIGH confidence — official Tailwind repo)
- Design system token drift: https://rydarashid.medium.com/design-systems-in-2026-predictions-pitfalls-and-power-moves-f401317f7563 (LOW confidence — editorial)
- Design system migration pro tips: https://medium.com/@houhoucoop/pro-tips-for-ui-library-migration-in-large-projects-d54f0fbcd083 (MEDIUM confidence — practitioner)
- Tailwind CSS and design systems architectural mismatch: https://sancho.dev/blog/tailwind-and-design-systems (MEDIUM confidence — engineering blog)
- Multi-SPA nginx subdirectory routing: https://medium.com/@krishnaananthvk/how-i-spent-2-hours-teaching-nginx-and-react-router-to-play-nice-in-subdirectories-spoiler-they-d261e76f44e0 (MEDIUM confidence — practitioner post-mortem)
- Existing codebase: direct audit of `apps/`, `infrastructure/pulumi/index.ts`, `packages/rialto/` (HIGH confidence — source code)

---
*Pitfalls research for: Rialto Unification & Hosting (design system migration + multi-SPA hosting)*
*Researched: 2026-02-27*
