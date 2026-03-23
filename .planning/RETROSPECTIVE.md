# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Rialto Unification & Hosting

**Shipped:** 2026-03-04
**Phases:** 5 | **Plans:** 14 | **Commits:** 77

### What Was Built
- Rialto showcase app with 55+ interactive components at /rialto
- Engineering portfolio site with Hero, Projects, About, Contact at /
- Hospitality reservation app fully migrated to Rialto at /hospitality
- Dashboard → hospitality rename with atomic Auth0/Pulumi/routing migration
- @mbe/ui and @mbe/shared-layout legacy packages removed from monorepo
- Complete Tailwind CSS elimination across all three apps

### What Worked
- **Incremental migration order**: rialto-web → rename → marketing → hospitality was lowest-risk-first, each phase validated the pattern for the next
- **CSS Modules as Tailwind replacement**: Zero new dependencies, scoped styling, clean migration path
- **Phase-level verification gates**: build/typecheck/lint/test + human visual sign-off caught issues before they compounded
- **Pulumi IaC**: Auth0 client rename, ingress rules, and static site config all managed declaratively
- **Rapid execution**: 6 days for 5 phases, 14 plans — well-scoped plans kept velocity high

### What Was Inefficient
- **Missing VERIFICATION.md for early phases**: Phases 01 and 03 predated the verification workflow, requiring a Phase 5 retroactive fix
- **Documentation state drift**: Requirement checkboxes and ROADMAP plan checkboxes fell out of sync — needed bulk fix in Phase 5
- **ESLint ajv error deferred too long**: The blanket pnpm override issue affected all packages; should have been fixed in Phase 1 or 2 instead of Phase 4
- **SUMMARY frontmatter incomplete**: HOSP-06 was missing from 04-01-SUMMARY — attribution gaps are easy to miss

### Patterns Established
- **Rialto-only styling**: All apps use @mbe/rialto exclusively — no Tailwind, no @mbe/ui
- **CSS Modules for non-component styling**: Page layouts and domain components use .module.css files
- **CSS logical properties** (padding-inline, margin-block-end): Used throughout hospitality for RTL readiness
- **Static site pattern in Pulumi**: name, sourceDir, buildCommand, outputDir, catchallDocument, preservePathPrefix
- **301 redirect for path renames**: Pulumi ingress redirect rule preserves backward compat
- **Retroactive VERIFICATION.md**: Formal verification can be created from codebase evidence when phase predates the workflow

### Key Lessons
1. **Establish verification workflow before Phase 1**: Missing VERIFICATION.md files cost an entire phase to fix retroactively
2. **Keep documentation state accurate during execution**: Checkbox drift compounds — update REQUIREMENTS.md and ROADMAP.md as each plan completes, not as a batch fix later
3. **Fix monorepo-wide issues early**: The ajv override affected every package; fixing it in Phase 1 would have avoided carrying the error through 3 phases
4. **Pulumi resource renames are destructive**: Auth0 client rename (delete+recreate) generates a new client_id requiring manual .env update — document this prominently

### Cost Observations
- Model mix: ~80% sonnet, ~15% haiku (agents), ~5% opus (milestone audit, retrospective)
- Sessions: ~8 across 6 days
- Notable: Phase 2 (rename) completed in 7 minutes total — well-scoped atomic changes are extremely fast

---

## Milestone: v1.1 — Rialto Accessibility & AI DX

**Shipped:** 2026-03-23
**Phases:** 6 | **Plans:** 17 | **Commits:** 138

### What Was Built
- WCAG AA accessibility across all 58 Rialto components — axe-core CI assertions, token-level contrast, focus management
- Three realistic example pages (dashboard, settings, form-states) with copy-to-clipboard, composition notes, multi-state panels
- AI developer experience toolkit — registry.json (90 components), two-tier llms.txt, CLAUDE.md Rialto section, `mbe new` CLI
- 20 structured spec files and accessibility docs on all interactive showcase pages
- Audit-driven gap closure phases (10, 11) fixing documentation and registry coverage gaps

### What Worked
- **Token-level contrast approach**: Fixing WCAG AA at the design token level (not per-component CSS) gave systematic coverage across all components with a single programmatic test
- **Milestone audit before completion**: The `/gsd:audit-milestone` workflow caught 10 partial/unsatisfied requirements that would have shipped as gaps — creating targeted fix phases was the right response
- **Two-tier llms.txt**: Splitting AI reference into lean (<20KB) and full (26KB) served different context window budgets well
- **Wave-based parallel execution**: Multiple plans executed in parallel within phases, keeping the 17-plan milestone to ~19 days
- **cloneElement pattern for aria injection**: Solved nested-interactive axe violations in DropdownMenu/Popover without restructuring component trees

### What Was Inefficient
- **Phase 08 skipped verification entirely**: The verifier agent was not run for Phase 08, creating the single biggest audit gap — 5 requirements with no VERIFICATION.md
- **SUMMARY frontmatter omissions in Phase 06**: Plans 06-02 and 06-03 completed 5 requirements but didn't list them in frontmatter — identical to the v1.0 lesson that wasn't fully internalized
- **llms-full.txt prop accuracy**: Stale prop names (onOpenChange vs onClose for Drawer/ConfirmDialog) shipped to Phase 09 before being caught by audit — AI consumers would have generated failing code
- **Registry props coverage**: 49/90 components had empty props arrays due to TypeScript Compiler API limitations with generics — required a dedicated Phase 11 to fix

### Patterns Established
- **Dual aria-live region pattern**: Both polite and assertive regions always mounted at page load for reliable screen reader registration
- **triggerRef focus-return**: Effect ordering (triggerRef before focus-trap) ensures activeElement captured correctly in overlay components
- **focusRing compose**: Canonical `:focus-visible` pattern via `composes: focusRing` — never inline box-shadow rules
- **Registry generation pipeline**: `pnpm build:registry` → CI drift check → rialto-web static serving
- **Spec file format**: Anatomy, tokens, props, states, accessibility in standardized `.spec.md` files

### Key Lessons
1. **Never skip the verifier**: Phase 08's missing VERIFICATION.md was the single biggest audit gap — run `/gsd:verify-work` for every phase, no exceptions
2. **SUMMARY frontmatter is the requirements contract**: If a plan completes a requirement, it MUST be in `requirements-completed` frontmatter — this lesson was learned in v1.0 but not fully enforced
3. **AI-facing documentation needs accuracy testing**: Props documented in llms-full.txt should be validated against actual TypeScript interfaces before shipping — stale prop names produce broken AI output
4. **TypeScript Compiler API has generic limitations**: Components with generic props (Table<T>) need explicit non-generic aliases for registry extraction
5. **Audit-then-fix is worth the cost**: Two targeted fix phases (10, 11) brought requirements from 14/24 to 24/24 — cheaper than discovering gaps post-ship

### Cost Observations
- Model mix: ~75% sonnet, ~15% haiku (agents), ~10% opus (audit, milestone completion)
- Sessions: ~12 across 19 days
- Notable: Phases 10-11 (gap closure) completed in ~11 minutes combined — well-scoped documentation fixes are very fast

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 77 | 5 | Established verification gates, retroactive fix pattern, CSS Modules convention |
| v1.1 | 138 | 6 | Milestone audit → gap closure phases, two-tier llms.txt, registry pipeline |

### Cumulative Quality

| Milestone | Requirements | Coverage | Zero-Dep Additions |
|-----------|-------------|----------|-------------------|
| v1.0 | 28/28 | N/A (frontend migration) | CSS Modules (zero deps) |
| v1.1 | 24/24 | axe-core CI for 58 components | axe-core, ts-morph (registry) |

### Top Lessons (Verified Across Milestones)

1. **SUMMARY frontmatter is the requirements contract** — both v1.0 and v1.1 had frontmatter omissions that cascaded into audit gaps; must be enforced per-plan, not fixed retroactively
2. **Establish process gates before execution** — v1.0 missed verification for early phases, v1.1 missed verification for Phase 08; the cost of retroactive fixes is always higher
3. Incremental migration (one app at a time) reduces blast radius and validates patterns early
4. **Audit before milestone completion catches real gaps** — v1.1 audit found 10 partial requirements that were genuinely incomplete (not just doc gaps)
