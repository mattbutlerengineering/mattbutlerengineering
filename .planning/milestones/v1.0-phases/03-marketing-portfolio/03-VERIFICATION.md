---
phase: 03
name: Marketing Portfolio
status: passed
verified: 2026-03-04
---

# Phase 03 Verification: Marketing Portfolio

## Goal

The marketing site is a complete engineering portfolio built entirely with Rialto, served at the root path.

## Success Criteria Verification

### SC1: Hero, About, Projects (3+ cards), and social/contact links visible on single page load

**Status:** PASSED

Evidence from `apps/marketing/src/pages/HomePage.tsx`:

```tsx
import { HeroSection } from "../components/HeroSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { AboutSection } from "../components/AboutSection";
import { ContactSection } from "../components/ContactSection";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProjectsSection />
      <AboutSection />
      <ContactSection />
    </>
  );
}
```

All four sections rendered on a single page load — HeroSection, ProjectsSection, AboutSection, ContactSection.

- `grep -c "title:" apps/marketing/src/data/projects.ts` → **6 matches** (5 project entries + 1 header field) confirming 5 project cards in the PROJECTS array

### SC2: "This site IS the project" callout explains monorepo, Rialto, and IaC as engineering proof

**Status:** PASSED

Evidence from `grep "This site" apps/marketing/src/data/projects.ts`:

```
"This site is the engineering proof — a Turborepo monorepo with Pulumi IaC, a custom design system, " +
```

The narrative is present in the "mattbutlerengineering.com" project card, explaining the monorepo, Pulumi IaC, custom design system, and deployment context as engineering proof.

### SC3: Live links to /rialto and /hospitality are navigable

**Status:** PASSED

Evidence from `grep "href.*rialto\|href.*hospitality" apps/marketing/src/data/projects.ts`:

```
    href: "/rialto",
    href: "/hospitality",
    href: "/rialto",
```

Cross-app links to /rialto and /hospitality are present as data-driven `href` values in the PROJECTS array, rendered as plain `<a href>` tags in ProjectCard. Both paths resolve via Pulumi ingress rules.

### SC4: No Tailwind CSS classes remain in apps/marketing source

**Status:** PASSED

Evidence:

- `grep -rn "className=\"[a-z].*-[a-z]" apps/marketing/src/ --include="*.tsx" --include="*.ts" | grep -v "module.css|\.module\.|styles\."` → **0 matches**
- `ls apps/marketing/tailwind.config*` → no matches found (files deleted)
- `ls apps/marketing/postcss.config*` → no matches found (files deleted)

Tailwind, PostCSS, and autoprefixer confirmed removed per 03-02-SUMMARY.md documentation.

### SC5: Navigating to mattbutlerengineering.com/ loads the portfolio without error

**Status:** PASSED

Evidence of correct root path serving:

- `grep -n "base:" apps/marketing/vite.config.ts` → no `base:` entry found — Vite defaults to `"/"` (root path)
- Marketing App.tsx uses `<Routes>` with `<Route path="/" element={<HomePage />} />` — BrowserRouter with no `basename` (defaults to root)
- Pulumi ingress: `grep "prefix.*marketing\|marketing" infrastructure/pulumi/index.ts`:
  ```
  84:              prefix: "/",
  88:            name: "marketing",
  ```
  Marketing is the `/` catch-all route (last in ingress order, after /api, /dashboard redirect, /hospitality, /rialto)
- `catchallDocument: "index.html"` confirmed on marketing static site entry — SPA deep linking works

## Requirement Traceability

| Requirement ID | Description | Status | Evidence |
|----------------|-------------|--------|----------|
| PORT-01 | Hero section with name, role, and brief tagline | Verified | HeroSection.tsx renders with eyebrow="Engineering Leader", title, and subtitle; listed in 03-01-SUMMARY requirements-completed |
| PORT-02 | About section with 3-5 sentences on focus and background | Verified | AboutSection.tsx has 4 Text variant="body" paragraphs; listed in 03-01-SUMMARY requirements-completed |
| PORT-03 | Projects showcase with 3-5 curated project cards | Verified | projects.ts PROJECTS array has 5 entries (Rialto Design System, Hospitality App, mattbutlerengineering.com, Agent System, MBE CLI); listed in 03-01-SUMMARY requirements-completed |
| PORT-04 | Social and contact links (GitHub, LinkedIn, email) | Verified | ContactSection.tsx has GitHub (github.com/mattbutler), LinkedIn (linkedin.com/in/mattbutler), email (matt@mattbutlerengineering.com) links; listed in 03-01-SUMMARY requirements-completed |
| PORT-05 | "This site IS the project" narrative | Verified | "This site is the engineering proof..." present in projects.ts mattbutlerengineering.com entry; listed in 03-01-SUMMARY requirements-completed |
| PORT-06 | Live links to rialto-web showcase and hospitality app | Verified | href="/rialto" and href="/hospitality" in projects.ts PROJECTS array; listed in 03-01-SUMMARY requirements-completed |
| PORT-07 | All styling uses Rialto components exclusively — no Tailwind, no @mbe/ui | Verified | Zero Tailwind matches in marketing/src grep; tailwind.config deleted; no @mbe/ui imports; listed in 03-02-SUMMARY requirements-completed |
| PORT-08 | App served at mattbutlerengineering.com/ with working client-side routing | Verified | No Vite base (defaults to "/"); Pulumi ingress prefix="/" as catch-all last; catchallDocument:index.html; listed in 03-02-SUMMARY requirements-completed |

## Automated Checks (from Phase 04 gate, plan 04-05)

Phase 03 predates the per-phase verification workflow. The automated checks below were run as part of the Phase 04 full-monorepo gate (04-05-PLAN.md) which confirmed all apps — including marketing — pass:

| Check | Result |
|-------|--------|
| pnpm build | Zero errors (10/10 tasks including marketing) |
| pnpm typecheck | Zero errors (15/15 tasks including marketing) |
| pnpm lint | Zero errors (15/15 tasks including marketing) |
| pnpm test | All suites pass |
| Tailwind grep (marketing) | Zero matches |
| @mbe/ui grep | Zero references across monorepo |

## Result

**Status: PASSED** — All 5 success criteria met. All 8 requirement IDs verified (PORT-01 through PORT-08). Retroactive verification created 2026-03-04 as part of Phase 05 gap closure, closing the process gap from phases executed before the VERIFICATION.md workflow was established.
