# Feature Research

**Domain:** Engineering portfolio site + design system showcase + multi-app path-prefix hosting
**Researched:** 2026-02-27
**Confidence:** MEDIUM (web search verified against observed best-practice examples; no single authoritative spec exists for portfolio sites)

---

## Scope

This research covers three distinct feature surfaces that share the same deployment:

1. **Marketing app** — engineering portfolio / personal showcase at `/`
2. **Rialto-web app** — design system component showcase at `/rialto`
3. **Hosting layer** — path-prefix routing for all apps under `mattbutlerengineering.com`

Each surface has its own table stakes and differentiators.

---

## Feature Landscape

### Surface 1: Engineering Portfolio (Marketing App)

#### Table Stakes (Users Expect These)

Features visitors assume exist. Missing these makes the site feel like a placeholder.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hero / identity section | Every personal site has one — tells visitors who you are within 5 seconds | LOW | Name, role, brief tagline. Already exists but uses generic copy. |
| Projects showcase | Primary evidence of capability — 3–5 curated projects with descriptions | LOW | One project per card: title, tech stack, outcomes, link to live/repo. Missing currently. |
| About / bio section | Context for who the person is, what they focus on, what they've built | LOW | 3–5 sentences max. Currently absent. |
| Social / contact links | GitHub, LinkedIn, email — expected by every recruiter and collaborator | LOW | Footer or header placement. Currently absent. |
| Responsive layout | Site must work on mobile; portfolio viewers include mobile users | LOW | Rialto components handle this; minimal explicit work needed. |
| Fast load time | Slow sites signal poor engineering judgment — bad signal for a tech portfolio | LOW | Vite builds are fast by default; avoid heavy bundles. |
| Clean navigation | Simple nav between sections or pages; no confusion about how to explore | LOW | Single-page with anchored sections OR multi-page — either works. |

#### Differentiators (Competitive Advantage)

Features that set the portfolio apart from the thousands of generic developer sites.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "This site IS the project" narrative | The portfolio itself — monorepo, design system, IaC — is evidence of engineering skill | LOW | Write-up explaining the stack and architecture decisions. Rare: most devs don't make their portfolio setup the proof. |
| Technical writing / blog | Shows depth of thinking, attracts engineering audience, SEO benefit | MEDIUM | Even 2–3 well-crafted posts beats 0. Can be simple Markdown-rendered posts. |
| Live links to all three apps | Demonstrates working multi-app deployment — visitors can click through to the Rialto showcase and hospitality app | LOW | Cross-linking between apps costs almost nothing but signals the whole system is live. |
| Open-source / side project callouts | Not just "I worked at X" — shows what you build when nobody is paying you | LOW | Subset of projects section but worth calling out explicitly. |
| Consistent visual identity via Rialto | Portfolio looks intentional and polished because it uses the same design system you built | LOW | This is free once Rialto migration is done; just needs to be executed well. |
| Performance / Lighthouse score callout | Engineers with good portfolios brag about their Lighthouse scores — it's proof that craft matters | LOW | Run Lighthouse CI (already evaluated), display result. |

#### Anti-Features (Do Not Build)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Animated particle backgrounds / WebGL hero | Looks impressive at first glance; "creative" | Heavy, distracting, hurts performance, looks dated quickly | Clean typography hierarchy is more memorable and faster |
| Contact form with backend | Standard on agency sites | Requires backend work, spam prevention, email delivery service — scope creep for a portfolio | Use a `mailto:` link or Calendly embed; zero infrastructure |
| Blog CMS with admin interface | "I need to edit posts easily" | YAGNI for a solo site; the engineering overhead outweighs convenience | MDX files checked into the monorepo; redeploy to publish |
| Testimonials / endorsements section | Looks professional | Impossible to fill meaningfully for a solo engineer with no clients; looks empty or fake | Let the work speak; projects + code quality are the real endorsement |
| Skills / proficiency bars | Ubiquitous on templates | Meaningless (who decides 85% TypeScript?) — signals template use, not craft | List technologies by project context instead |
| Real-time visitor counter / analytics display | Fun novelty | Privacy issues, adds dependency, distracts from content | Use private analytics (Plausible or similar) internally; don't surface it |

---

### Surface 2: Design System Showcase (Rialto-Web App)

#### Table Stakes (Users Expect These)

Features that any serious design system showcase must have. Without these, the showcase is worse than just reading the source code.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All components visible in one place | Primary purpose of a showcase — prove the library is complete | LOW | Already exists in `showcase/App.tsx` with 55+ components. Needs Rialto-only styling. |
| Component name + description labels | Visitors need to know what they're looking at | LOW | Section headers with component name and one-line description already present via `Section` component. |
| Interactive state demos | Components must be shown in all meaningful states: default, hover, disabled, loading, error | MEDIUM | Some states are interactive now; audit for completeness after Tailwind removal. |
| Light/dark theme toggle | Rialto has theme support; showcasing it demonstrates the design system's capability | LOW | `FloatingControls` component already exists. Keep and improve it. |
| Responsive demonstration | Shows that components work across breakpoints | LOW | Inherent if components are built right; no extra work needed. |
| Code snippets alongside demos | Developers want to copy-paste the import + JSX | MEDIUM | Not currently present in the showcase. High value for adoption. |
| Navigation / table of contents | 55+ components is a lot to scroll through — visitors need to jump to what they want | LOW | Currently uses section anchors (`id={title.toLowerCase()}`). Add a sticky sidebar or jump links. |
| Vibe/theme switcher (already named "VibeName") | Rialto appears to have multiple visual themes; demonstrating them adds credibility | LOW | `VibeName` type and `RialtoProvider` are already imported — expose this in the UI. |

#### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Design token visualization | Shows the underlying system, not just the components — color palettes, spacing scales, typography ramps | LOW | Color palette section already exists in `showcase/App.tsx`. Expand to full token table. |
| Animation showcase (motion presets) | Rialto uses Framer Motion with `precision`, `spring`, `springGentle` presets — showcasing motion is rare and differentiated | LOW | Motion system already referenced in `showcase/App.tsx`. Make the presets explicit and demonstrable. |
| Accessibility callouts | Document keyboard navigation, ARIA attributes, and screen reader behavior per component | HIGH | Research shows accessibility docs are a differentiator among design systems. Significant writing work. |
| Icon catalog with search | `getIconsByCategory` and `iconCategories` already in the codebase — icon discovery is high-value | LOW | Already imported; just needs a search input wired up. |
| Copy-to-clipboard for import statements | Removes the friction of "how do I import this" — one-click workflow | LOW | Simple browser API; high value for developer adoption. |

#### Anti-Features

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Full Storybook integration | "Industry standard for component docs" | Adds significant build complexity, separate tool chain, conflicts with the existing showcase approach | The existing custom showcase is already well-structured; extend it rather than adopting Storybook |
| Interactive prop editor (knobs) | Allows live customization of component props | High implementation complexity for marginal gain in a single-author system | Show multiple pre-composed examples of components in different configurations |
| Version selector | "Show docs for v1, v2, v3" | Only relevant when external consumers exist; Rialto is a private monorepo package | Not needed until Rialto is published to npm |
| Component API reference table (auto-generated) | Comprehensive prop documentation | Requires TypeDoc or similar integration; significant tooling overhead | Code snippets + examples serve the same purpose for an internal design system |

---

### Surface 3: Multi-App Hosting (Path-Prefix Routing)

#### Table Stakes (Users Expect These)

These are infrastructure expectations — get them wrong and the apps simply do not work.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All apps reachable at correct paths | `/`, `/rialto`, `/hospitality` — if paths don't work, nothing works | MEDIUM | Requires Traefik rules + Vite `base` config per app. Existing infra has Traefik. |
| SPA fallback for sub-routes | React Router routes (e.g., `/rialto/components/button`) must not 404 | MEDIUM | Nginx/Traefik must serve `index.html` for all paths under each prefix — catch-all rewrite needed. |
| Asset paths correct under prefix | JS/CSS/image assets must resolve relative to the app's `base` path | LOW | Set `base` in `vite.config.ts` for each non-root app. Marketing stays at `/`. |
| HTTPS everywhere | Users expect SSL; browsers warn without it | LOW | DigitalOcean + Pulumi already provision this. Verify cert covers all paths. |
| Cross-app navigation works | Links between apps (e.g., marketing site linking to `/rialto`) must work as regular `<a>` hrefs | LOW | Use plain `href` not React Router `<Link>` for cross-app navigation. |
| No CORS issues between apps and APIs | All apps share same domain origin for session/cookie/storage purposes | LOW | Same-origin by design (path prefix); no extra CORS config needed for same-domain API calls. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Shared navigation component across apps | Visitors see a consistent shell — feels like one product, not three separate sites | MEDIUM | Requires a shared layout package (already `packages/shared-layout` exists). Worth using. |
| Per-app deployment isolation | Deploy one app without rebuilding others — Turborepo cache makes this achievable | LOW | Turborepo pipeline already set up; ensure each app's build is independent. |
| Zero-downtime deployments | Dropping the live site during deploy is unprofessional for an engineering showcase | MEDIUM | DigitalOcean App Platform or Kubernetes rolling updates — check current Pulumi config. |

#### Anti-Features

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Subdomain per app (marketing.mattbutlerengineering.com) | "Cleaner separation between apps" | Loses the single-domain story; cross-app navigation breaks; SSL becomes multi-cert problem | Path-prefix routing is the right call — already decided |
| Micro-frontend shell with module federation | "Real micro-frontend architecture" | Enormous complexity for 3 small React apps; module federation has sharp edges | Keep apps as independent builds served by the same reverse proxy |
| Server-side rendering (SSR) | "Better SEO and performance" | Requires Node.js runtime per app, defeats static hosting, adds infra complexity | Static builds + good meta tags are sufficient for a portfolio/showcase |
| Edge caching / CDN purge automation | "Fast global delivery" | Over-engineering for a personal site with low traffic | DigitalOcean Spaces or App Platform CDN is sufficient; no custom cache invalidation needed |

---

## Feature Dependencies

```
[Marketing: Projects Showcase]
    └──requires──> [Real content: project descriptions, screenshots, links]

[Marketing: Blog/Writing]
    └──requires──> [MDX rendering or equivalent static content pipeline]
                       └──requires──> [Content creation (not a tech problem)]

[Rialto Showcase: Code Snippets]
    └──requires──> [Syntax highlighting library (Shiki or Prism)]

[Rialto Showcase: Token Visualization]
    └──enhances──> [Rialto Showcase: Component demos]

[Rialto Showcase: Icon Search]
    └──requires──> [getIconsByCategory API already exists — wiring only]

[Hosting: SPA Fallback Routing]
    └──requires──> [Traefik catch-all rule per app prefix]
                       └──requires──> [Vite base config per app]

[Hosting: Shared Navigation]
    └──requires──> [packages/shared-layout exists — extend it]
                       └──conflicts──> [each app's isolated bundle]
                                           └──resolved by: shared-layout as a monorepo package, not runtime federation]

[Marketing: "This site IS the project" narrative]
    └──requires──> [Hosting is actually working] (can't write about it until it's live)
    └──requires──> [Rialto migration is done] (can't claim design system if still using Tailwind)
```

### Dependency Notes

- **Projects showcase requires content**: The feature is trivially simple technically (a grid of cards). The bottleneck is writing good project descriptions. Plan for content creation time.
- **Code snippets requires syntax highlighting**: Shiki is the current standard (used by Vite docs, Astro, etc.) — lightweight, accurate, no client-side JS needed for static highlighting.
- **SPA fallback and Vite base config are coupled**: Both must be set correctly or the app breaks. These are done together per-app.
- **Shared navigation conflicts with full bundle isolation**: Solved by the monorepo package approach — shared-layout is a build-time dependency, not a runtime-shared module. No module federation needed.

---

## MVP Definition

### Launch With (v1) — Minimum for "This is live and professional"

- [ ] Marketing: Hero, About, Projects (3+ real projects), GitHub/LinkedIn links — the baseline that any engineer would expect
- [ ] Marketing: Rialto-only styling, no Tailwind — satisfies the design system migration goal
- [ ] Rialto Showcase: All 55 components visible with correct Rialto-only styling — validates the migration
- [ ] Rialto Showcase: Light/dark toggle, vibe switcher — demonstrates the design system's flexibility
- [ ] Rialto Showcase: Token visualization section — shows the foundation, not just the components
- [ ] Hosting: All three apps reachable at correct paths with SPA fallback routing — the whole thing works end-to-end

### Add After Validation (v1.x) — Polish Pass

- [ ] Rialto Showcase: Code snippets with syntax highlighting — adds developer utility; defer until core showcase works
- [ ] Rialto Showcase: Icon search — low complexity, high value; add after core is working
- [ ] Marketing: Technical writing section (1–2 posts) — content takes time; don't block launch on it
- [ ] Hosting: Shared navigation bar across apps — improves cohesion; needs shared-layout package work

### Future Consideration (v2+) — Only If Needed

- [ ] Marketing: Blog with MDX pipeline — adds content infrastructure complexity; defer until there's content to justify it
- [ ] Rialto Showcase: Accessibility docs per component — high writing effort; valuable only if Rialto is used by others
- [ ] Marketing: Case studies / long-form project write-ups — great differentiator; blocked on having time to write them
- [ ] Lighthouse score display — micro-feature; fun but not critical

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Marketing: Hero + About + Links | HIGH | LOW | P1 |
| Marketing: Projects showcase (3 cards) | HIGH | LOW (tech); MEDIUM (content) | P1 |
| Rialto Showcase: All components, Rialto-only | HIGH | MEDIUM (migration work) | P1 |
| Rialto Showcase: Theme/vibe switcher | HIGH | LOW | P1 |
| Hosting: Path-prefix routing (all 3 apps) | HIGH | MEDIUM | P1 |
| Hosting: SPA fallback + Vite base config | HIGH | LOW | P1 |
| Rialto Showcase: Token visualization | MEDIUM | LOW | P2 |
| Rialto Showcase: Navigation / TOC sidebar | MEDIUM | LOW | P2 |
| Marketing: "This site IS the project" narrative | MEDIUM | LOW | P2 |
| Rialto Showcase: Code snippets + syntax highlight | MEDIUM | MEDIUM | P2 |
| Rialto Showcase: Icon search | MEDIUM | LOW | P2 |
| Hosting: Shared navigation across apps | MEDIUM | MEDIUM | P2 |
| Marketing: Technical writing / blog | MEDIUM | HIGH (content) | P3 |
| Rialto Showcase: Accessibility docs | LOW | HIGH | P3 |
| Rialto Showcase: Copy-to-clipboard import | LOW | LOW | P3 |
| Marketing: Lighthouse score callout | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor / Reference Analysis

These are well-regarded examples used to validate the feature landscape (MEDIUM confidence — WebSearch sourced):

| Feature | Brittany Chiang (brittanychiang.com) | Josh Comeau (joshwcomeau.com) | Rialto Approach |
|---------|--------------------------------------|-------------------------------|-----------------|
| Hero | Name + role + tagline | Name + email link | Name + role + link to rialto showcase |
| Projects | Featured + archive grid | Articles + courses | Projects grid (card per project) |
| Navigation | Sticky sidebar (desktop), hamburger (mobile) | Top nav | Simple top nav via Rialto Navbar |
| Design system | Custom CSS vars | Custom CSS | Rialto (the actual story here) |
| Blog/Writing | Not present | Primary content | Deferred to v1.x |
| Dark mode | Yes | Yes | Yes (Rialto handles it) |
| Animation | Glow cursor, section highlights | Subtle hover | Framer Motion (already in rialto-web) |
| Code snippets in showcase | N/A | Yes (core to his brand) | P2 — add after migration |

---

## Sources

- [How to Create a Software Engineer Portfolio in 2026 — Zencoder](https://zencoder.ai/blog/how-to-create-software-engineer-portfolio) — MEDIUM confidence (WebSearch)
- [Best Developer Portfolio Websites — Webportfolios.dev](https://www.webportfolios.dev/blog/best-developer-portfolio-websites) — MEDIUM confidence (WebSearch)
- [22 Best Developer Portfolios — Colorlib](https://colorlib.com/wp/developer-portfolios/) — MEDIUM confidence (WebSearch, curated examples)
- [7 Best Practices for Design System Documentation — UXPin](https://www.uxpin.com/studio/blog/7-best-practices-for-design-system-documentation/) — MEDIUM confidence (WebSearch)
- [Best Design System Documentation Sites — Backlight.dev](https://backlight.dev/mastery/the-best-design-system-documentation-sites) — MEDIUM confidence (WebSearch)
- [Design System documentation best practices — Backlight.dev](https://backlight.dev/blog/design-system-documentation-best-practices) — MEDIUM confidence (WebSearch)
- [Tips for design system documentation — LogRocket](https://blog.logrocket.com/ux-design/design-system-documentation/) — MEDIUM confidence (WebSearch)
- [Path-Based Routing with Nginx — Cloud Native Daily](https://medium.com/cloud-native-daily/path-based-routing-with-nginx-reverse-proxy-for-multiple-applications-in-a-vm-53838169540c) — MEDIUM confidence (WebSearch)
- [5 Mistakes Developers Make in Portfolio Websites — DevPortfolioTemplates](https://www.devportfolios.dev/blog/5-mistakes-developers-make-in-their-portfolio-websites) — MEDIUM confidence (WebSearch)
- [Accessibility as Design System Policy — TestParty](https://testparty.ai/blog/accessibility-as-design-system-policy) — MEDIUM confidence (WebSearch)
- Existing codebase analysis: `apps/rialto-web/src/showcase/App.tsx`, `apps/marketing/src/pages/HomePage.tsx` — HIGH confidence (direct source inspection)

---

*Feature research for: Engineering portfolio + design system showcase + multi-app hosting*
*Researched: 2026-02-27*
