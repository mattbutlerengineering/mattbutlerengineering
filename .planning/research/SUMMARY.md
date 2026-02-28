# Project Research Summary

**Project:** Rialto Unification & Hosting
**Domain:** Design system migration (Tailwind -> Rialto) + multi-SPA path-prefix hosting
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

This project has two tightly coupled objectives: unify all three frontend apps under the Rialto design system (replacing Tailwind CSS and @mbe/ui), and bring the full multi-SPA deployment online under correct path-prefix routing. Both objectives are well-understood, well-scoped, and have ground-truth evidence in the existing codebase — the dashboard app already demonstrates the complete working pattern for both the hosting infrastructure and a partial Rialto adoption. The core stack is fixed (React 19, Vite 7, TypeScript), and the design system target is fixed (@mbe/rialto with CSS Modules + CSS custom properties). No new architectural decisions are required; this is an execution project, not a design project.

The recommended approach is sequential app migration: rialto-web first (already partially migrated, lowest risk), then marketing (simplest app, no auth), then hospitality/dashboard rename (most complex: 440+ Tailwind usages, auth-gated, backend-connected). The hosting infrastructure must be validated end-to-end before the last app is migrated — specifically, the ingress rules, Vite base configs, React Router basenames, and catchallDocument settings must all align. Running these in strict sequential order avoids the compounding failure modes that arise from parallel migration branches.

The primary risks are operational, not architectural. Five critical pitfalls are well-documented: Tailwind's CSS preflight disappearing without Rialto's reset in place, DigitalOcean ingress misconfiguration, Auth0 callback URL mismatch after the dashboard rename, leftover Tailwind classes surviving the library swap, and premature deletion of @mbe/ui before all consumers are migrated. Each has a clear, low-cost prevention strategy. The project is well-positioned to execute quickly given that patterns are proven in the existing codebase.

## Key Findings

### Recommended Stack

The stack is unchanged from what is already deployed. The migration is purely additive (adopt Rialto) and subtractive (remove Tailwind, @mbe/ui, PostCSS, autoprefixer). Rialto's architecture is correct for 2026: CSS Modules for scoping, CSS custom properties for theming, zero runtime overhead, SSR-compatible. No alternative styling approach should be introduced.

The hosting layer uses DigitalOcean App Platform with path-prefix ingress rules. The multi-SPA pattern requires three aligned configurations per app: Vite `base`, React Router `basename`, and a Pulumi ingress rule. The dashboard app already implements this pattern correctly and serves as the reference implementation.

**Core technologies:**
- @mbe/rialto 0.1.0: Design system target — CSS Modules + CSS custom properties, peer deps already installed
- React Router DOM 7.1.0: Client-side routing — `basename` must match Vite `base` exactly
- Vite 7.0.0: Build tool — `base` option controls asset URL prefix; trailing slash required
- DigitalOcean App Platform: Hosting — ingress rules ordered most-specific-first; `catchallDocument: "index.html"` required on all static sites
- Pulumi (TypeScript): IaC — manages ingress rules, static site specs, Auth0 config atomically

**Removing:** tailwindcss, postcss, autoprefixer, @mbe/ui, class-variance-authority, tailwind-merge, clsx

### Expected Features

Three distinct feature surfaces are in scope for this project: the marketing portfolio, the Rialto design system showcase, and the shared hosting layer.

**Must have (table stakes — P1):**
- Marketing: Hero, About, Projects showcase (3+ real projects), GitHub/LinkedIn links
- Marketing: Rialto-only styling (no Tailwind) — validates the migration goal
- Rialto Showcase: All 55+ components visible with correct Rialto-only styling
- Rialto Showcase: Light/dark theme toggle and vibe switcher — demonstrates the design system
- Hosting: All three apps reachable at correct paths (`/`, `/rialto`, `/hospitality`)
- Hosting: SPA fallback routing (catchallDocument) so deep links return 200, not 404

**Should have (competitive — P2):**
- Rialto Showcase: Design token visualization (color palette, spacing, typography)
- Rialto Showcase: Navigation sidebar / table of contents (55+ components is a long scroll)
- Rialto Showcase: Code snippets with syntax highlighting (Shiki recommended)
- Rialto Showcase: Icon search (getIconsByCategory API already exists — wiring only)
- Marketing: "This site IS the project" narrative — rare differentiator for an engineering portfolio
- Hosting: Shared navigation bar across apps via packages/shared-layout

**Defer (v2+):**
- Marketing: Blog with MDX pipeline — content infrastructure not justified until content exists
- Rialto Showcase: Accessibility docs per component — high writing effort, valuable only if Rialto gets external consumers
- Rialto Showcase: Interactive prop editor (Storybook knobs) — over-engineering for a single-author system

**Anti-features confirmed (do not build):**
- Animated particle backgrounds, WebGL hero
- Contact form with backend (use mailto or Calendly)
- Subdomain per app (breaks the single-domain story)
- Module federation shell (over-engineering for 3 small apps)

### Architecture Approach

The architecture is already correct and proven in production. Three independent SPAs are deployed as static sites on DigitalOcean App Platform, served under path prefixes (`/`, `/rialto`, `/hospitality`) via ordered ingress rules. Cloudflare sits in front as CDN/proxy. Shared packages (@mbe/rialto, @mbe/auth, @mbe/types) are build-time dependencies via pnpm workspaces — no runtime module federation. The design system token flow is: `@mbe/rialto/styles` injects CSS custom properties at `:root`; components reference `var(--rialto-*)` via CSS Modules; themes and vibes work by overriding the custom property values at runtime.

The migration pattern is app-by-app, not component-type-by-component-type. Tailwind and Rialto are safe to coexist during transition (no class name conflicts), enabling incremental component-by-component replacement within each app before Tailwind is removed entirely.

**Major components:**
1. apps/marketing — Public portfolio at `/`; simplest app; migrated second
2. apps/rialto-web — Design system showcase at `/rialto`; already partially on Rialto; migrated first
3. apps/hospitality (rename from apps/dashboard) — Auth-gated reservation management at `/hospitality`; most complex; migrated last
4. @mbe/rialto — The migration target; consumed at build time by all three apps; CSS Modules + CSS custom properties
5. DigitalOcean App Platform ingress — Routes path prefixes to correct static site; rules ordered most-specific-first
6. Auth0 (via Pulumi IaC) — Callback URLs must be updated atomically with the dashboard rename

### Critical Pitfalls

1. **Tailwind CSS preflight removed without Rialto reset imported** — Import `@mbe/rialto/styles` as the FIRST import in every app's `main.tsx` before any app-local CSS. Verify `--rialto-surface` resolves on `:root` in DevTools after migration. Establish this pattern in rialto-web first.

2. **Tailwind utility classes left in JSX after library swap** — After removing Tailwind from PostCSS, remaining `className="min-h-screen flex..."` strings silently do nothing. Audit with `grep -r "className" apps/<app>/src/ --include="*.tsx"` after each migration. Run Playwright visual regression against pre-migration baseline.

3. **Auth0 callback URL not updated when renaming dashboard to hospitality** — Update Auth0 Allowed Callback URLs in Pulumi IaC atomically with the rename. Deploy IaC change before the renamed app. Test login flow to `/hospitality/` in staging. Old `/dashboard/callback` can remain temporarily during transition but must be removed post-verification.

4. **DigitalOcean App Platform ingress misconfiguration** — Ingress rules must be ordered most-specific-first; `/` catch-all must be last. Each static site must have `catchallDocument: "index.html"`. Test deep links directly (navigate to `/rialto/any-sub-page`, not via in-app navigation) — these are the first to break.

5. **@mbe/ui deleted before all consumers are migrated** — Do NOT remove `packages/ui` until all three apps pass `pnpm typecheck` with zero `@mbe/ui` import errors. Deleting it mid-migration breaks CI for all remaining apps simultaneously.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Rialto-Web Migration + Pattern Establishment

**Rationale:** rialto-web already imports Rialto and has the fewest Tailwind usages. Migrating it first validates the full migration pattern (RialtoProvider setup, Tailwind removal, visual regression testing) in the lowest-risk app before touching the two production apps. Mistakes here are cheap to fix.

**Delivers:** One fully migrated app; a proven migration checklist; visual regression baselines; confirmation that the showcase displays all 55+ components correctly in Rialto-only mode.

**Addresses (P1):** Rialto Showcase — all components with correct styling, theme toggle, vibe switcher, token visualization

**Avoids:** Tailwind preflight pitfall (establishes correct import order); @mbe/ui premature deletion (pattern locks in the sequencing)

**Research flag:** Standard pattern — skip phase research. Pattern is fully documented in existing codebase (rialto-web is 70% there already).

---

### Phase 2: Dashboard Rename + Auth Update

**Rationale:** The dashboard rename to "hospitality" has a hard dependency on Auth0 callback URL updates that must happen atomically with the deployment. Isolating this rename as its own phase ensures the auth plumbing is verified before Rialto migration work begins on that app. This also updates all Pulumi ingress rules to reference the new component name.

**Delivers:** apps/dashboard renamed to apps/hospitality; Vite base updated to `/hospitality/`; React Router basename updated; Pulumi ingress rule and static site name updated; Auth0 callback URL updated and verified; login flow confirmed working at `/hospitality/`.

**Addresses:** Hosting — all apps reachable at correct paths (prerequisite for hosting phase)

**Avoids:** Auth0 callback URL mismatch (dedicated phase means this cannot be forgotten); VITE_AUTH_REDIRECT_URI hardcoded fallback updated

**Research flag:** Standard pattern — skip phase research. Auth0 + Pulumi integration is well-documented and already implemented for the dashboard; this is a reconfiguration, not a new integration.

---

### Phase 3: Marketing App Migration

**Rationale:** Marketing is the simplest app (one page, no auth, no backend data, fewer Tailwind usages than hospitality). Migrating it second proves the Tailwind-removal process works end-to-end on a production app with real content, while the stakes of a brief visual disruption are lower than for the auth-gated hospitality app.

**Delivers:** Marketing app fully migrated to Rialto-only; Tailwind, postcss, autoprefixer, @mbe/ui removed from apps/marketing; portfolio content complete (Hero, About, Projects, links); visual regression tests passing.

**Addresses (P1):** Marketing — Hero, About, Projects showcase, GitHub/LinkedIn links, Rialto-only styling, fast load time

**Avoids:** Leftover Tailwind classes (grep audit after removal); Tailwind preflight removed without Rialto reset (pattern already established in Phase 1)

**Research flag:** Standard pattern — skip phase research. Migration pattern proven in Phase 1; marketing app is simpler.

---

### Phase 4: Hospitality App Migration + Full Hosting Verification

**Rationale:** Hospitality is the most complex migration (440+ Tailwind usages, auth-gated, backend-connected, two PWA service workers to manage). Tackling it last means the migration pattern is proven, the auth plumbing is verified from Phase 2, and the hosting infrastructure is understood. This phase also removes @mbe/ui from the workspace as its final step.

**Delivers:** apps/hospitality fully migrated to Rialto-only; Tailwind, @mbe/ui removed from the app; PWA service worker scope verified to `/hospitality/`; @mbe/ui removed from packages/ workspace (the final cleanup); all three apps reachable and verified end-to-end in production.

**Addresses (P1):** Hosting — all three apps at correct paths, SPA fallback routing, no CORS issues, cross-app navigation via plain hrefs

**Avoids:** PWA service worker scope conflict (navigateFallbackAllowlist scoped to `/hospitality/`); @mbe/ui premature deletion (removed only in this phase's final step); big-bang migration (already avoided by sequential approach)

**Research flag:** Standard pattern — skip phase research. All patterns established. The complexity here is volume of Tailwind usages, not novel integration challenges.

---

### Phase 5: Showcase Enhancement + Polish

**Rationale:** With all three apps migrated and hosting verified, the P2 features can be added safely. These are net-new features rather than migrations, so they carry no migration risk. This phase can be executed in any order internally.

**Delivers:** Rialto Showcase with code snippets (Shiki), icon search, navigation sidebar, design token visualization; Marketing with "this site IS the project" write-up; shared navigation bar across apps (packages/shared-layout).

**Addresses (P2):** Rialto Showcase — code snippets, icon search, TOC sidebar, token visualization; Marketing — portfolio narrative; Hosting — shared navigation

**Avoids:** Scope creep (blog CMS, Storybook, accessibility docs, version selector all deferred)

**Research flag:** Code snippets with Shiki may benefit from a quick research pass — Shiki integration in a Vite + React app has a few gotchas (async loading, bundle size). All other P2 features use existing APIs with no new dependencies.

---

### Phase Ordering Rationale

- **rialto-web first:** Lowest risk, highest pattern-learning value. Mistakes are cheapest here.
- **Rename before migration:** The Auth0 callback update is a hard dependency. Isolating it prevents it from being forgotten inside a larger migration PR.
- **Marketing before hospitality:** Marketing is simpler; validates end-to-end Tailwind removal before the 440-usage migration.
- **Hosting verification at Phase 4 close:** Only meaningful after all three apps are deployed under their final paths. Deep-link testing across all apps confirms the full system.
- **Enhancement last:** No P2 features are blockers for launch. Adding them after the migration is complete means they don't slow down the primary objective.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (Shiki integration):** Shiki's async API and Vite integration have known gotchas. A 30-minute research spike before implementation is recommended. All other P2 features use existing APIs.

Phases with standard patterns (skip research-phase):
- **Phase 1 (rialto-web migration):** Fully documented in existing codebase; pattern established.
- **Phase 2 (rename/Auth0 update):** Pulumi + Auth0 integration is working today; this is reconfiguration.
- **Phase 3 (marketing migration):** Pattern proven in Phase 1.
- **Phase 4 (hospitality migration):** Pattern proven; volume of work, not novel complexity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack unchanged and in production; Rialto source read directly; Vite + React Router config verified against working dashboard implementation |
| Features | MEDIUM | Portfolio feature landscape from web search (no authoritative spec); showcase features validated against existing showcase source; hosting requirements derived from working infrastructure |
| Architecture | HIGH | Existing working implementations in codebase (dashboard Vite base, Pulumi ingress, Rialto CSS Modules) serve as ground truth; migration patterns verified against community sources |
| Pitfalls | HIGH | Infrastructure pitfalls verified against existing code; migration pitfalls documented in official React Router issue tracker and Tailwind repo; Auth0 callback behavior confirmed in Auth0 community docs |

**Overall confidence:** HIGH

### Gaps to Address

- **DigitalOcean `preservePathPrefix` behavior for static SPAs:** The existing Pulumi config has `preservePathPrefix: false` on the dashboard static site, but the behavior differs for SPAs vs backend services. This should be tested in staging for rialto-web before assuming it is correct (MEDIUM risk — the pattern works for dashboard, but adding a third SPA may surface edge cases).

- **PWA service worker scope when two PWAs share a domain:** The hospitality app (PWA) and the new hospitality path prefix have a verified pattern for scope isolation (`navigateFallbackAllowlist`), but this has not been tested with two active PWAs on the same DigitalOcean App Platform deployment. Verify in staging before production.

- **Marketing portfolio content:** The feature is technically trivial (a grid of cards). The actual gap is project descriptions, screenshots, and links. This is a content creation task, not a technical one — budget time for it in Phase 3 planning.

- **Shared navigation package (packages/shared-layout):** The package exists but its current state and API are not fully documented in the research. Review the package contents before committing to the P2 shared navigation feature in Phase 5.

## Sources

### Primary (HIGH confidence)
- packages/rialto source code — CSS Modules architecture, component inventory, peer deps, lib build config
- infrastructure/pulumi/index.ts — Existing ingress rules, static site config, DigitalOcean App Platform Pulumi schema
- apps/dashboard/vite.config.ts — Working `base: "/dashboard/"` pattern with PWA
- apps/*/package.json — Current Tailwind, @mbe/ui, and postcss dependencies confirmed
- Context7 `/vitejs/vite` — Verified `base` config, library mode CSS, `--base` CLI flag
- Context7 `/remix-run/react-router` — Verified `BrowserRouter` `basename` prop API and React Router v7 config
- React Router issue tracker (github.com/remix-run/react-router) — basename pitfalls confirmed

### Secondary (MEDIUM confidence)
- DigitalOcean App Platform docs — `catchallDocument` and `preservePathPrefix` behavior
- DigitalOcean static site catchall (blog.hao.dev) — Practitioner SPA routing confirmation
- Auth0 community (community.auth0.com) — Callback URL wildcard limitations confirmed
- Vercel incremental microfrontend migration guide — Migration ordering rationale
- Cloudflare vertical microfrontend template (InfoQ, Feb 2026) — Path-based routing pattern
- WebSearch: portfolio best practices (Zencoder, Webportfolios.dev, Colorlib) — Feature landscape validation
- WebSearch: design system documentation best practices (UXPin, Backlight, LogRocket) — Showcase features
- sancho.dev "Don't use Tailwind for your Design System" — Architectural rationale for removal

### Tertiary (LOW confidence)
- Medium: "React & CSS in 2026" — CSS Modules vs CSS-in-JS ecosystem sentiment (corroborates Rialto's approach)
- Medium: "Design Systems in 2026: Predictions, Pitfalls, and Power Moves" — Token drift editorial
- Medium: "Pro Tips for UI Library Migration" — Migration sequencing guidance

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
