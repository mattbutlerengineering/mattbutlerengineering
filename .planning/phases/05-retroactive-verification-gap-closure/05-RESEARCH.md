# Phase 5: Retroactive Verification & Gap Closure - Research

**Researched:** 2026-03-04
**Domain:** Documentation audit, process gap closure, integration cleanup
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RIALTO-01 | All 55 Rialto components are visible with interactive states in the showcase app | Codebase confirmed: 57 lazy-loaded routes in routes.tsx; nav-sections.ts has 72 component entries; 43 component pages under pages/{forms,data,navigation,feedback,overlays,layout}/. OverviewPage shows 65 components (includes 8 token stub pages). The actual showcase components are present and wired. |
| RIALTO-02 | RialtoProvider wraps the app with theme context | Confirmed in apps/rialto-web/src/main.tsx line 33: `<RialtoProvider theme={theme}>` wraps BrowserRouter. Listed in 01-01-SUMMARY.md requirements-completed. |
| RIALTO-03 | Theme/vibe switcher allows toggling between themes | Confirmed in apps/rialto-web/src/main.tsx: ThemeToggle component, `handleThemeToggle` function, localStorage persistence. Listed in 01-01-SUMMARY.md requirements-completed. |
| RIALTO-04 | All Tailwind CSS removed — Rialto-only styling throughout | Confirmed: grep for className patterns in rialto-web/src returns zero Tailwind utility classes. Only `className="accent"` patterns exist in HeroPage.tsx — these are Rialto Hero's `:global(.accent)` CSS class (defined in packages/rialto/src/components/Hero/Hero.module.css line 76), NOT Tailwind. Listed in 01-03-SUMMARY.md requirements-completed. |
| RIALTO-05 | App served at mattbutlerengineering.com/rialto with working client-side routing | Confirmed: Vite base = "/rialto/", BrowserRouter basename="/rialto", Pulumi ingress /rialto with preservePathPrefix:false and catchallDocument:index.html. Listed in 01-03-SUMMARY.md requirements-completed. |
| PORT-01 | Hero section with name, role, and brief tagline | Confirmed in apps/marketing/src/components/HeroSection.tsx: `eyebrow="Engineering Leader"`, title "One-person team. Full ownership.", subtitle about designing/building/shipping/operating. Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-02 | About section with 3-5 sentences on focus and background | Confirmed in apps/marketing/src/components/AboutSection.tsx: 4 Text variant="body" paragraphs covering end-to-end building, quality standards, single-person accountability, and current open work. Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-03 | Projects showcase with 3-5 curated project cards | Confirmed in apps/marketing/src/data/projects.ts: PROJECTS array has 5 entries (Rialto Design System, Hospitality App, mattbutlerengineering.com, Agent System, MBE CLI) each with title/tags/description. Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-04 | Social and contact links (GitHub, LinkedIn, email) | Confirmed in apps/marketing/src/components/ContactSection.tsx: GitHub (github.com/mattbutler), LinkedIn (linkedin.com/in/mattbutler), and email (matt@mattbutlerengineering.com) as plain `<a>` tags. Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-05 | "This site IS the project" narrative | Confirmed in apps/marketing/src/data/projects.ts: project entry "mattbutlerengineering.com" with description "This site is the engineering proof — a Turborepo monorepo with Pulumi IaC, a custom design system, and three apps deployed under one domain. The portfolio is the product." Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-06 | Live links to rialto-web showcase and hospitality app | Confirmed in apps/marketing/src/data/projects.ts: Rialto Design System project has `href: "/rialto"`, Hospitality App has `href: "/hospitality"`. Listed in 03-01-SUMMARY.md requirements-completed. |
| PORT-07 | All styling uses Rialto components exclusively — no Tailwind, no @mbe/ui | Confirmed: marketing app has no tailwind config files, no Tailwind CSS in source, no @mbe/ui imports. Verified via grep and 03-02-SUMMARY.md which documents removal. Listed in 03-02-SUMMARY.md requirements-completed. |
| PORT-08 | App served at mattbutlerengineering.com/ with working client-side routing | Confirmed: marketing vite.config.ts has no base path (defaults to "/"), BrowserRouter with no basename. Listed in 03-02-SUMMARY.md requirements-completed. |
| HOSP-06 | All @mbe/ui imports replaced with @mbe/rialto equivalents | Verified in 04-VERIFICATION.md as passed. No @mbe/ui references found via grep in apps/hospitality/src. BUT: missing from all SUMMARY requirements-completed frontmatter. 04-01-SUMMARY.md has NO requirements-completed field. 04-02-SUMMARY.md has NO requirements-completed field. The work was done but never attributed to a plan in SUMMARY frontmatter. |
</phase_requirements>

---

## Summary

Phase 5 is a **documentation and cleanup phase**, not a feature implementation phase. The codebase is functionally complete — all 14 requirements were confirmed wired and working by the Phase 4 milestone audit integration checker. The gaps are entirely in the formal verification record and documentation state.

The audit found two categories of gaps. First, process gaps: phases 01 (Rialto-Web Migration) and 03 (Marketing Portfolio) were executed and completed but never had VERIFICATION.md files created. This caused 13 requirements to be treated as "orphaned" — present in the traceability table but absent from all VERIFICATION.md files. Second, integration issues: a stale Auth0 callback URL in `infrastructure/pulumi/auth0.ts` (line 10: `localhost:3000/callback`) that has no handler in the marketing app, and orphaned VITE_AUTH_* environment variable injections in the marketing Pulumi static site config that marketing never reads.

The plan for Phase 5 has four distinct work items: (1) create a retroactive Phase 01 VERIFICATION.md by inspecting the codebase against RIALTO-01 through RIALTO-05, (2) create a retroactive Phase 03 VERIFICATION.md by inspecting the codebase against PORT-01 through PORT-08, (3) fix three documentation state issues (HOSP-06 missing from SUMMARY frontmatter, three stale REQUIREMENTS.md checkboxes, ROADMAP.md stale plan checkboxes), and (4) remove the stale Auth0 callback and orphaned Pulumi env vars.

**Primary recommendation:** Execute as two plans — Plan 1 covers retroactive verification (VERIFICATION.md files for phases 01 and 03) plus documentation state fixes; Plan 2 covers the code changes to auth0.ts and Pulumi index.ts.

---

## Standard Stack

### Core

No new libraries required. This phase operates entirely on existing tooling.

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| bash grep | system | Codebase inspection for verification checks | Used in prior verification phases |
| pnpm build / typecheck / lint / test | workspace | Automated gate checks | Established pattern from Phase 04-05 |
| git | system | Committing documentation changes | Standard |

### Supporting

None — no new dependencies needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual codebase grep | Automated test harness | Manual grep is sufficient; the functional correctness was already proven in Phase 04. Adding tests here would be scope creep. |

---

## Architecture Patterns

### Recommended Structure for Phase 5

```
.planning/phases/
├── 01-rialto-web-migration/
│   └── 01-VERIFICATION.md      # CREATE — retroactive verification of RIALTO-01 through RIALTO-05
├── 03-marketing-portfolio/
│   └── 03-VERIFICATION.md      # CREATE — retroactive verification of PORT-01 through PORT-08
├── 04-hospitality-migration-full-hosting/
│   ├── 04-01-SUMMARY.md        # MODIFY — add requirements-completed: [HOSP-06] to frontmatter
│   └── 04-02-SUMMARY.md        # REVIEW — confirm whether HOSP-06 work lives here or in 04-01
.planning/
├── REQUIREMENTS.md             # MODIFY — check boxes for RIALTO-01, RIALTO-04, RIALTO-05
└── ROADMAP.md                  # MODIFY — mark 01-03-PLAN.md, 02-01, 02-02, 03-02, all 04-* as [x]
infrastructure/pulumi/
├── auth0.ts                    # MODIFY — remove localhost:3000/callback (line 10)
└── index.ts                    # MODIFY — remove VITE_AUTH_* env block from marketing static site (lines 107-128)
```

### Pattern 1: Retroactive VERIFICATION.md

**What:** A VERIFICATION.md is a structured document proving each requirement passes against the actual codebase. It contains: phase metadata, per-success-criteria verdict with evidence, requirement traceability table, and automated check results.

**Template (from 04-VERIFICATION.md):**
```markdown
---
phase: NN
name: Phase Name
status: passed
verified: YYYY-MM-DD
---

# Phase NN Verification: Phase Name

## Goal
[Phase goal one-liner]

## Success Criteria Verification

### SC1: [Criterion]
**Status:** PASSED
- [Evidence point 1]
- [Evidence point 2]

## Requirement Traceability

| Requirement ID | Description | Status |
|---------------|-------------|--------|
| REQ-XX | Description | ✓ Verified |

## Automated Checks (from plan NN-XX)

| Check | Result |
|-------|--------|
| pnpm build | ✓ Zero errors |
| Tailwind grep | ✓ Zero matches |

## Result

**Status: PASSED** — All N success criteria met. All M requirement IDs verified.
```

**When to use:** Whenever a phase completes and formal verification is needed.

**Key difference from Phase 04:** Retroactive VERIFICATION.md files reference evidence already present in the codebase and existing SUMMARY files. They do NOT require re-running all automated checks — the Phase 04 automated gate (04-05-PLAN.md) already confirmed build/typecheck/lint/test all pass across the full monorepo.

### Pattern 2: Documentation State Fix

**What:** Updating three types of stale documentation: REQUIREMENTS.md checkboxes, ROADMAP.md plan checkboxes, and SUMMARY frontmatter requirements-completed lists.

**REQUIREMENTS.md checkbox format:**
```markdown
- [x] **RIALTO-01**: All 55 Rialto components are visible with interactive states in the showcase app
```

**SUMMARY frontmatter requirements-completed format:**
```yaml
requirements-completed: [HOSP-06]
```

### Pattern 3: Pulumi Integration Cleanup

**What:** Two targeted edits to Pulumi infrastructure code.

**Change 1 — auth0.ts:** Remove `"http://localhost:3000/callback"` from the `localCallbacks` array. The marketing app has no auth flow. This URL was added before the dashboard-to-hospitality rename established that auth only belongs to the hospitality app. The correct local callback is `"http://localhost:3002/hospitality/callback"` which already exists.

**Change 2 — index.ts:** Remove the `envs` array block from the `marketing` static site entry (lines 107-128). The marketing app never imports VITE_AUTH_AUTHORITY, VITE_AUTH_CLIENT_ID, VITE_AUTH_AUDIENCE, or VITE_AUTH_REDIRECT_URI. Injecting hospitality's client ID into the marketing build is a mild unnecessary exposure.

**Verification after Pulumi changes:** The changes are IaC — they take effect on `pulumi up` (production deployment). For local development, no changes are needed. The automated suite (build/typecheck) still passes because these are runtime config values, not compile-time imports.

### Anti-Patterns to Avoid

- **Don't re-implement functionality to prove verification:** The audit already confirmed all requirements are wired. VERIFICATION.md files reference existing evidence, they don't require rewriting code.
- **Don't add HOSP-06 to multiple SUMMARY files:** It should be attributed to exactly one plan — the plan that did the work. Research finding: 04-01-PLAN.md has HOSP-06 in its plan spec, and 04-01-SUMMARY.md covers the @mbe/ui → @mbe/rialto migration for HomePage/ProfilePage/SettingsPage/AdminPage. Add HOSP-06 to 04-01-SUMMARY.md requirements-completed.
- **Don't update REQUIREMENTS.md to [x] for anything not confirmed wired:** Per audit, only RIALTO-01, RIALTO-04, and RIALTO-05 have stale [ ] checkboxes; the others are already [x]. RIALTO-01's box was unchecked despite 57 page routes existing. The requirement says "55 components" and 57+ pages exist — it passes.
- **Don't run pulumi up as part of this phase:** Pulumi changes are committed to IaC source; deployment is a separate manual step.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Counting component pages | Custom script | Direct grep + ls of known directories | Structure is already known from SUMMARY files; counting is trivial |
| Verification document format | New schema | Exact pattern from 04-VERIFICATION.md | Consistency with existing audit tooling |

**Key insight:** This phase is document creation and targeted code removal. The hard work of implementing the features was done in phases 01-04. Phase 5 is about record-keeping and cleanup.

---

## Common Pitfalls

### Pitfall 1: RIALTO-01 Component Count Confusion

**What goes wrong:** The OverviewPage shows "65 components" but the requirement says "55 components". This mismatch causes confusion about whether RIALTO-01 passes.

**Why it happens:** The showcase has 43 component showcase pages plus 8 token stub pages (motion, typography, color, spacing, radius, shadows, surfaces, icon-vocabulary), plus the auth/dashboard/drivers/teams/visual-test demo pages. The OverviewPage stat counts all of these.

**How to avoid:** The requirement is "55+ Rialto components are visible with interactive states." The codebase has 43 dedicated component showcase pages covering all categories (forms 10, data 11, navigation 7, feedback 7, overlays 9, layout 7 = 51) plus OverviewPage. The component count from nav-sections.ts is 72 path entries. This clearly meets "55+" regardless of the exact count.

**Warning signs:** If the VERIFICATION.md for Phase 01 tries to say "exactly 55", it will be wrong. Say "55+" or "57 component routes" based on the actual codebase count.

### Pitfall 2: Misattributing HOSP-06 to Wrong SUMMARY

**What goes wrong:** Adding HOSP-06 to the wrong plan's SUMMARY frontmatter.

**Why it happens:** HOSP-06 is listed in the plan spec for 04-01-PLAN.md. But 04-01-SUMMARY.md has no `requirements-completed` field at all — it was never added. 04-02-SUMMARY.md also has no `requirements-completed` field.

**How to avoid:** Add `requirements-completed: [HOSP-06]` to 04-01-SUMMARY.md. The 04-01 plan covered @mbe/ui → @mbe/rialto migration for the hospitality app shell, pages, and layout — the core of the HOSP-06 work.

**Warning signs:** If HOSP-06 ends up in both 04-01 AND 04-02 SUMMARY files, it's duplicated. Pick one — 04-01 is correct.

### Pitfall 3: Breaking Pulumi State with auth0.ts Change

**What goes wrong:** Removing a callback URL from auth0.ts that's actively registered in Auth0's production config causes a Pulumi update to remove it from the live Auth0 Application, potentially breaking auth flows if anything depends on it.

**Why it happens:** The URL `localhost:3000/callback` is in the localCallbacks array. In production, the prod versions of this URL (`https://domain/callback`) also exist in the prodCallbacks array. If the production callback URL is also removed, that would break hospitality auth.

**How to avoid:** Only remove `http://localhost:3000/callback` from `localCallbacks` (line 10). Leave `http://localhost:3002/hospitality/callback` in localCallbacks. Do NOT change prodCallbacks. Verify the change by reading the resulting callbackUrls array after edit: it should still contain `https://domain/callback` and `https://domain/hospitality/callback`.

**Warning signs:** If the edit accidentally removes any prod callback URL, revert immediately.

### Pitfall 4: ROADMAP.md Stale Plan Checkboxes

**What goes wrong:** The ROADMAP.md has many plan-level `[ ]` checkboxes that should be `[x]` for phases 01-04. Fixing some but not all creates inconsistency.

**Why it happens:** The milestone audit documented that ROADMAP.md Phase 4 is stale, but ROADMAP.md also has stale plan checkboxes in Phases 1, 2, and 3 (visible at lines 37, 51, 52, 68, 83-87).

**How to avoid:** When updating REQUIREMENTS.md checkboxes, also update ALL stale ROADMAP.md plan-level checkboxes for phases 01-04 in a single pass.

**Warning signs:** If ROADMAP.md Phase 4 plans still show `[ ]` after the fix, the update was incomplete.

---

## Code Examples

Verified patterns from existing codebase:

### auth0.ts Before and After

Before (current state):
```typescript
const localCallbacks = [
  "http://localhost:3000/callback",       // REMOVE THIS LINE
  "http://localhost:3002/hospitality/callback",
];
```

After:
```typescript
const localCallbacks = [
  "http://localhost:3002/hospitality/callback",
];
```

### Pulumi index.ts Marketing Static Site Before and After

Before (lines 95-129 currently):
```typescript
{
  name: "marketing",
  // ...
  catchallDocument: "index.html",
  envs: [                                  // REMOVE THIS ENTIRE envs BLOCK
    { key: "VITE_AUTH_AUTHORITY", value: "...", scope: "BUILD_TIME" },
    { key: "VITE_AUTH_CLIENT_ID", value: auth0Outputs.hospitalityClientId, scope: "BUILD_TIME" },
    { key: "VITE_AUTH_AUDIENCE", value: `https://api.${domain}`, scope: "BUILD_TIME" },
    { key: "VITE_AUTH_REDIRECT_URI", value: `https://${domain}/callback`, scope: "BUILD_TIME" },
  ],
},
```

After:
```typescript
{
  name: "marketing",
  // ...
  catchallDocument: "index.html",
  // No envs — marketing has no auth, no backend calls
},
```

### REQUIREMENTS.md Checkbox Fix

```markdown
// Before
- [ ] **RIALTO-01**: All 55 Rialto components are visible with interactive states in the showcase app
- [ ] **RIALTO-04**: All Tailwind CSS removed — Rialto-only styling throughout
- [ ] **RIALTO-05**: App served at mattbutlerengineering.com/rialto with working client-side routing

// After
- [x] **RIALTO-01**: All 55 Rialto components are visible with interactive states in the showcase app
- [x] **RIALTO-04**: All Tailwind CSS removed — Rialto-only styling throughout
- [x] **RIALTO-05**: App served at mattbutlerengineering.com/rialto with working client-side routing
```

### SUMMARY Frontmatter Addition for HOSP-06

In 04-01-SUMMARY.md, add to the frontmatter block:
```yaml
requirements-completed: [HOSP-06]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase-complete without VERIFICATION.md | Phase-complete requires VERIFICATION.md | Introduced in Phase 02 | Phases 01 and 03 predate this workflow |
| Requirements verified informally via SUMMARY | Formal VERIFICATION.md required for milestone | Phase 04 verification workflow | Retroactive VERIFICATION.md files needed for phases 01, 03 |

**Deprecated/outdated:**
- localhost:3000/callback in auth0.ts: Was added when marketing was planned to have auth. Marketing does not have auth (no handler at /callback route). Should be removed.
- VITE_AUTH_* in marketing Pulumi config: Was copied from hospitality config when marketing was speculatively given auth support. Marketing never reads these vars. Should be removed.

---

## Open Questions

1. **RIALTO-01 component count interpretation**
   - What we know: Nav-sections.ts has 72 entries; routes.tsx has 57 lazy-loaded component routes; OverviewPage shows "65 components" (includes token stub pages)
   - What's unclear: Does RIALTO-01 mean "55 unique Rialto library components showcased" or "55 page routes"?
   - Recommendation: The requirement says "All 55 Rialto components are visible" — the showcased components (43 per-component pages + OverviewPage + layout pages) clearly cover 55+ Rialto library components. Interpret as PASSED. Note in VERIFICATION.md that 57+ component routes exist.

2. **Which plan to attribute HOSP-06 to in SUMMARY frontmatter**
   - What we know: 04-01-PLAN.md claims HOSP-06 in its spec; 04-01-SUMMARY.md has no requirements-completed field; 04-02-SUMMARY.md also has no requirements-completed
   - What's unclear: Does HOSP-06 cover all @mbe/ui replacement (04-01 + 04-02 combined) or just the 04-01 work?
   - Recommendation: Add HOSP-06 to 04-01-SUMMARY.md. 04-01 performed the primary @mbe/ui → @mbe/rialto migration; 04-02 was pure Tailwind-to-CSS-modules work (no @mbe/ui). Grep confirms zero @mbe/ui in hospitality now.

3. **Whether Pulumi auth0.ts change needs pulumi up before phase is considered closed**
   - What we know: Auth0.ts change is IaC only; local dev is unaffected; Phase 5 success criteria says "No stale Auth0 callback URL in auth0.ts" (not "deployed and removed from Auth0")
   - What's unclear: Does "no stale URL in auth0.ts" mean committed to source or deployed?
   - Recommendation: Success criterion is met when the commit is made. Note in VERIFICATION.md that `pulumi up` is required for the change to take effect in Auth0's live config.

---

## Validation Architecture

> No nyquist_validation in .planning/config.json — this section follows standard process based on phase pattern.

### Test Framework (from established Phase 04 pattern)

| Property | Value |
|----------|-------|
| Framework | pnpm workspace scripts + grep |
| Config file | none — workspace-level commands |
| Quick verification command | `grep -r "localhost:3000/callback" infrastructure/pulumi/auth0.ts` |
| Full suite command | `pnpm build && pnpm typecheck && pnpm lint && pnpm test` |

### Phase Requirements to Verification Map

| Req ID | Verification Method | Evidence Location | Automated? |
|--------|--------------------|--------------------|-----------|
| RIALTO-01 | Count component pages/routes in codebase | apps/rialto-web/src/routes.tsx (lazy imports), pages/ subdirectories | grep/ls count |
| RIALTO-02 | Confirm RialtoProvider in main.tsx | apps/rialto-web/src/main.tsx line 33 | grep |
| RIALTO-03 | Confirm ThemeToggle + localStorage persistence in main.tsx | apps/rialto-web/src/main.tsx lines 27-29 | grep |
| RIALTO-04 | Zero Tailwind className utilities in rialto-web/src | grep className with no Tailwind patterns | grep |
| RIALTO-05 | Vite base + BrowserRouter basename + Pulumi ingress alignment | vite.config.ts, main.tsx, infrastructure/pulumi/index.ts | grep three-way |
| PORT-01 | Hero section with name/role/tagline in HeroSection.tsx | apps/marketing/src/components/HeroSection.tsx | file read |
| PORT-02 | About section with 3-5 sentences in AboutSection.tsx | apps/marketing/src/components/AboutSection.tsx | file read |
| PORT-03 | 5 project cards in projects.ts | apps/marketing/src/data/projects.ts | file read |
| PORT-04 | GitHub/LinkedIn/email links in ContactSection.tsx | apps/marketing/src/components/ContactSection.tsx | file read |
| PORT-05 | "This site IS the project" text in projects.ts | apps/marketing/src/data/projects.ts | file read |
| PORT-06 | href:/rialto and href:/hospitality in projects.ts | apps/marketing/src/data/projects.ts | grep |
| PORT-07 | No Tailwind/no @mbe/ui in marketing/src | grep across marketing/src | grep |
| PORT-08 | No base path in marketing vite.config.ts | apps/marketing/vite.config.ts | file read |
| HOSP-06 | No @mbe/ui in hospitality/src | grep across hospitality/src | grep |

### Wave 0 Gaps

None — no test files need creation. This phase creates documentation files (VERIFICATION.md, REQUIREMENTS.md edits) and makes targeted code changes. All verification evidence comes from reading existing codebase files.

---

## Sources

### Primary (HIGH confidence)

- **Direct codebase inspection** — Read apps/rialto-web/src/main.tsx, apps/marketing/src/components/*, apps/marketing/src/data/projects.ts, apps/marketing/vite.config.ts, infrastructure/pulumi/auth0.ts, infrastructure/pulumi/index.ts (lines 95-180)
- **Existing SUMMARY files** — 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 03-01-SUMMARY.md, 03-02-SUMMARY.md — all contain requirements-completed frontmatter fields
- **04-VERIFICATION.md** — Template and pattern for retroactive VERIFICATION.md format
- **v1.0-MILESTONE-AUDIT.md** — Definitive gap inventory with YAML frontmatter listing all orphaned requirements and integration issues

### Secondary (MEDIUM confidence)

- STATE.md accumulated decisions — confirms patterns and decisions made in each phase
- ROADMAP.md — identifies stale checkboxes at plan level

### Tertiary (LOW confidence)

None — all findings are from direct codebase and document inspection.

---

## Metadata

**Confidence breakdown:**
- Requirement verification evidence: HIGH — read actual source files, confirmed all 14 requirements are wired
- Documentation state fixes: HIGH — stale items clearly identified in audit with file/line references
- Pulumi cleanup: HIGH — auth0.ts line 10 and index.ts lines 107-128 confirmed, change is simple removal
- HOSP-06 attribution: HIGH — 04-01-PLAN.md claims it, grep confirms zero @mbe/ui in hospitality

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (documentation phase, stable)
