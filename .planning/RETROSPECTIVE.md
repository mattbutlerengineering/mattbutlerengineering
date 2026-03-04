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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 77 | 5 | Established verification gates, retroactive fix pattern, CSS Modules convention |

### Cumulative Quality

| Milestone | Requirements | Coverage | Zero-Dep Additions |
|-----------|-------------|----------|-------------------|
| v1.0 | 28/28 | N/A (frontend migration) | CSS Modules (zero deps) |

### Top Lessons (Verified Across Milestones)

1. Establish process gates (verification, documentation) before starting execution — retroactive fixes are expensive
2. Incremental migration (one app at a time) reduces blast radius and validates patterns early
