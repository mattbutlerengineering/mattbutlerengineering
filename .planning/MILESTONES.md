# Milestones

## v1.1 Rialto Accessibility & AI DX (Shipped: 2026-03-23)

**Delivered:** All Rialto components are WCAG AA accessible, example pages demonstrate real-world composition, and AI tools produce correct Rialto code via registry, llms.txt, and CLI scaffold.

**Stats:**
- Phases: 6-11 (17 plans)
- Commits: 138
- Files modified: 388 (+65,212 / -2,364)
- Codebase: 94,670 LOC TypeScript
- Timeline: 19 days (2026-03-04 → 2026-03-23)
- Git range: feat(06-01)..feat(11-01)
- Requirements: 24/24 satisfied

**Key accomplishments:**
1. WCAG AA accessibility across all 58 Rialto components — axe-core CI assertions, token-level contrast verification, focus-return-on-close for all overlay components
2. Three realistic example pages (dashboard, settings, form-states) with copy-to-clipboard JSX, composition notes, and multi-state panels
3. AI developer experience toolkit — component registry (registry.json), two-tier llms.txt, CLAUDE.md Rialto section, and `mbe new` CLI scaffold
4. Component documentation — 20 structured spec files, accessibility docs on all interactive showcase pages, manual verification checklist
5. Audit-driven gap closure — Phases 10-11 fixed SUMMARY frontmatter, stale llms-full.txt props, registry props coverage (23 components improved), and Phase 08 VERIFICATION.md

---

## v1.0 Rialto Unification & Hosting (Shipped: 2026-03-04)

**Delivered:** Every web app uses Rialto as the sole design system, all accessible at mattbutlerengineering.com with path-prefix routing.

**Stats:**
- Phases: 1-5 (14 plans)
- Commits: 77
- Files modified: 379 (+74,100 / -8,530)
- Codebase: 51,640 LOC TypeScript
- Timeline: 6 days (2026-02-27 → 2026-03-04)
- Git range: 0382b68..50cbea7
- Requirements: 28/28 satisfied

**Key accomplishments:**
1. Rialto showcase app with 55+ interactive components, theme/vibe switching, and SPA routing at /rialto
2. Dashboard → hospitality rename with atomic Auth0/Pulumi/routing migration and 301 backward-compat redirect
3. Engineering portfolio site built entirely with Rialto — Hero, Projects, About, Contact sections at /
4. Hospitality app fully migrated from Tailwind + @mbe/ui to Rialto + CSS Modules with all features preserved
5. @mbe/ui and @mbe/shared-layout legacy packages deleted; Tailwind removed from all apps
6. Full milestone audit with retroactive verification closing all documentation gaps

---

