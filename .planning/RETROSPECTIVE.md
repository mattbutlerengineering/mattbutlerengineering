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

## Milestone: v1.2 — Generative UI

**Shipped:** 2026-03-28
**Phases:** 7 | **Plans:** 15 | **Commits:** 79

### What Was Built
- Rialto catalog with Zod schemas for 26 components, TypeScript Compiler API generation, and CI drift check
- Streaming gen-ui and gen-chat AI endpoints with Auth0 JWT, rate limiting, prompt caching (~$0.001/gen)
- Playground app at /gen — three-column layout with streaming preview, JSON inspector, prompt history, favorites, and shareable permalinks
- GenCopilot component in @mbe/rialto embedded in hospitality dashboard with domain-aware prompt context
- StoredSpec persistence layer with REST API, auto-save, replay, favorites, and conversational refinement
- @pulumi/cloudflare v5→v6 upgrade with gen Worker managed as Pulumi resource

### What Worked
- **json-render catalog pattern**: Constraining AI output to Rialto component schemas eliminated XSS and design system fidelity concerns — the LLM can only produce valid component trees
- **Prompt caching with Anthropic**: catalog.prompt() as cached system prompt reduced per-generation cost to ~$0.001 with Haiku 4.5
- **Milestone audit → gap closure phases**: Audit caught Vite proxy bug (GenCopilot → wrong port) and missing Pulumi resource before shipping — Phases 17-18 closed both gaps cleanly
- **Auth-agnostic GenCopilot design**: `getAccessToken` prop instead of importing @mbe/auth kept rialto free of auth provider coupling
- **Rapid execution**: 7 phases, 15 plans in 2 days — tight scope and clear dependencies kept momentum

### What Was Inefficient
- **Production verification deferred**: GEN-07 (SSE e2e) and INFRA-04 (spend cap) require manual steps (pulumi up, Anthropic console) that can't be automated — these shipped as known gaps
- **Stream format mismatch**: toUIMessageStream() produced prefix-coded lines that useGenStream couldn't parse — required Phase 17 to switch to raw textStream; could have been caught with integration tests
- **Test mocks don't exercise stream path**: gen-ui.test.ts and gen-chat.test.ts mock the stream but don't test actual NDJSON parsing — low coverage for the most critical data path
- **Model selection unreachable from UI**: GEN-08 (haiku/sonnet selection) exists server-side but frontend never sends the model param — Sonnet is unreachable from the playground

### Patterns Established
- **json-render + Rialto catalog**: defineCatalog() for server-side Zod schemas, defineRegistry() for client-side React mapping — clean client/server split
- **Streaming hook pattern**: useGenStream (standalone) and useGenCopilotStream (embedded) both parse NDJSON lines into flat elements for json-render's flatToTree()
- **Conditional mount for copilot**: `{open && <GenCopilot>}` gives fresh state on every open without controlled prop complexity
- **Spec-context refinement**: Refinement mode embeds the current spec as JSON context in the prompt, reusing the gen-ui JSONL pipeline rather than building separate patch logic
- **Pulumi-managed Workers with Static Assets**: WorkersScript resource with assets.directory pointing to pre-built SPA output

### Key Lessons
1. **Integration tests > unit tests for streaming**: The stream format mismatch (toUIMessageStream vs textStream) was only caught in local dev, not by unit tests that mocked the stream — add end-to-end stream parsing tests for streaming APIs
2. **Audit → gap closure is now a validated pattern**: Three milestones running, all caught real gaps. Budget 1-2 gap closure phases into every milestone plan
3. **Manual operational steps need a checklist**: GEN-07 and INFRA-04 require human action — these should be tracked as a separate "operational readiness" checklist alongside code requirements
4. **Prompt caching makes LLM features affordable**: $0.001/generation with Haiku 4.5 means playground experimentation is essentially free — removes cost as a barrier to AI feature development

### Cost Observations
- Model mix: ~85% sonnet (main dev), ~10% haiku (agents), ~5% opus (audit, milestone)
- Sessions: ~6 across 2 days
- Notable: Entire 7-phase milestone in 2 days — tightest scope per phase yet, with clear upstream/downstream dependencies

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 77 | 5 | Established verification gates, retroactive fix pattern, CSS Modules convention |
| v1.1 | 138 | 6 | Milestone audit → gap closure phases, two-tier llms.txt, registry pipeline |
| v1.2 | 79 | 7 | AI generation pipeline, json-render catalog pattern, Pulumi CF v6 migration |

### Cumulative Quality

| Milestone | Requirements | Coverage | Key Additions |
|-----------|-------------|----------|---------------|
| v1.0 | 28/28 | N/A (frontend migration) | CSS Modules (zero deps) |
| v1.1 | 24/24 | axe-core CI for 58 components | axe-core, ts-morph (registry) |
| v1.2 | 34/34 | CI catalog drift check | AI SDK, json-render, Zod v4, @pulumi/cloudflare v6 |

### Velocity Trend

| Milestone | Days | Phases | Plans/Day | LOC Added |
|-----------|------|--------|-----------|-----------|
| v1.0 | 6 | 5 | 2.3 | ~74,100 |
| v1.1 | 19 | 6 | 0.9 | ~65,212 |
| v1.2 | 2 | 7 | 7.5 | ~18,858 |

### Top Lessons (Verified Across Milestones)

1. **SUMMARY frontmatter is the requirements contract** — both v1.0 and v1.1 had frontmatter omissions that cascaded into audit gaps; must be enforced per-plan, not fixed retroactively
2. **Establish process gates before execution** — v1.0 missed verification for early phases, v1.1 missed verification for Phase 08; the cost of retroactive fixes is always higher
3. Incremental migration (one app at a time) reduces blast radius and validates patterns early
4. **Audit before milestone completion catches real gaps** — all three milestones caught genuine gaps; budget 1-2 gap closure phases into every milestone
5. **Integration tests for streaming APIs are non-negotiable** — v1.2's stream format mismatch was only caught in local dev, not by mocked tests; add e2e stream parsing tests
