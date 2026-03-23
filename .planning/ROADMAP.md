# Roadmap: mattbutlerengineering

## Milestones

- ✅ **v1.0 Rialto Unification & Hosting** — Phases 1-5 (shipped 2026-03-04)
- 🚧 **v1.1 Rialto Accessibility & AI DX** — Phases 6-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 Rialto Unification & Hosting (Phases 1-5) — SHIPPED 2026-03-04</summary>

- [x] Phase 1: Rialto-Web Migration (3/3 plans) — completed 2026-02-28
- [x] Phase 2: Dashboard Rename (2/2 plans) — completed 2026-02-28
- [x] Phase 3: Marketing Portfolio (2/2 plans) — completed 2026-02-28
- [x] Phase 4: Hospitality Migration + Full Hosting (5/5 plans) — completed 2026-03-04
- [x] Phase 5: Retroactive Verification & Gap Closure (2/2 plans) — completed 2026-03-04

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 Rialto Accessibility & AI DX (In Progress)

**Milestone Goal:** Make Rialto accessible (WCAG AA), build polished real-world example pages, and add AI-friendly tooling so AI tools produce correct, accessible Rialto code.

- [x] **Phase 6: Accessibility Foundation** - Audit and fix all 55+ components to WCAG AA; gate CI with axe-core (completed 2026-03-23)
- [x] **Phase 7: Example Pages** - Build realistic dashboard, settings, and form pages with all component states visible (completed 2026-03-23)
- [x] **Phase 8: AI Developer Experience** - Ship registry, two-tier llms.txt, CLAUDE.md update, and CLI scaffold (completed 2026-03-23)
- [x] **Phase 9: Polish and Documentation** - Per-component a11y docs in showcase and structured spec files for top 20 components (completed 2026-03-23)
- [ ] **Phase 10: Documentation Reconciliation & llms-full.txt Fix** - Fix SUMMARY frontmatter omissions, correct stale prop names in llms-full.txt, verify CLAUDE.md accuracy
- [ ] **Phase 11: Registry Props & Phase 08 Verification** - Improve registry.json props coverage, create Phase 08 VERIFICATION.md

## Phase Details

### Phase 6: Accessibility Foundation
**Goal**: All Rialto components meet WCAG AA — axe-core passes, keyboard navigation works, focus management is correct
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: A11Y-01, A11Y-02, A11Y-03, A11Y-04, A11Y-05, A11Y-06, A11Y-07, A11Y-08, A11Y-10
**Success Criteria** (what must be TRUE):
  1. Running `pnpm test` in `packages/rialto` passes axe-core assertions (`toHaveNoViolations`) for all 58 component directories including previously untested portal components
  2. A programmatic token-contrast Vitest test asserts 4.5:1 text contrast and 3:1 UI control contrast for both light and dark theme hex values
  3. Opening a Dialog or Drawer then closing it returns keyboard focus to the element that triggered it — verified by tab-navigating in the hospitality "Add Reservation" and "Walk-in" flows
  4. All interactive components have visible `:focus-visible` outlines — verifiable by tabbing through rialto-web showcase with mouse disconnected
  5. Every form input in the showcase has a visible or programmatically-associated label, and aria-live regions announce Toast and Alert updates to screen readers
**Plans:** 5/5 plans complete

Plans:
- [ ] 06-01-PLAN.md — Token contrast test + fix failing light theme token values
- [ ] 06-02-PLAN.md — Add 18 missing axe-core test cases for full component coverage
- [ ] 06-03-PLAN.md — Focus-return-on-close + focus trap for overlay components
- [ ] 06-04-PLAN.md — Screen reader announcements (aria-live for Toast, Progress, Skeleton)
- [ ] 06-05-PLAN.md — Focus-visible audit + visual verification checkpoint

### Phase 7: Example Pages
**Goal**: rialto-web gains three realistic example pages that demonstrate correct, real-world component composition with all states visible
**Depends on**: Phase 6
**Requirements**: EXMP-01, EXMP-02, EXMP-03, EXMP-04, EXMP-05, EXMP-06, EXMP-07, EXMP-08
**Success Criteria** (what must be TRUE):
  1. Navigating to `/rialto/examples/dashboard` shows a polished page with KPI cards, DataTable, Badges, and Stats using realistic domain data — not Lorem ipsum
  2. Navigating to `/rialto/examples/settings` shows a full settings layout with Form, Input, Select, Toggle, and Button in sectioned groups — this is the explicit v1.1 success criterion page
  3. Navigating to `/rialto/examples/form` shows a single page where error, disabled, loading, and default validation states are all visible simultaneously without any interaction
  4. Every example page has a copy-to-clipboard button that copies the full page JSX, and annotated composition notes explain why specific components are combined
  5. Multi-state flows (empty → loading → populated) are rendered as separate static panels on each example page, visible without JavaScript interaction
**Plans:** 3/3 plans complete

Plans:
- [ ] 07-01-PLAN.md — Shared infrastructure: ExamplePageLayout, routes, and sidebar navigation
- [ ] 07-02-PLAN.md — Dashboard example page with KPI stats, reservation table, multi-state panels
- [ ] 07-03-PLAN.md — Settings example page + Form States example page

### Phase 8: AI Developer Experience
**Goal**: Machine-readable Rialto artifacts are committed to the repo and consumable by AI tools — registry, llms.txt, CLAUDE.md, and CLI scaffold
**Depends on**: Phase 7
**Requirements**: AIDX-01, AIDX-02, AIDX-03, AIDX-04, AIDX-06
**Success Criteria** (what must be TRUE):
  1. `packages/rialto/registry.json` exists, is generated by `pnpm build:registry`, and a CI diff check fails the build if the committed file diverges from generated output
  2. `llms.txt` (under 20KB) and `llms-full.txt` (complete prop tables and composition examples) are both committed at repo root and linked from CLAUDE.md
  3. CLAUDE.md contains a Rialto usage section with import paths, RialtoProvider setup, and the top 10 most-used component APIs
  4. Running `mbe init my-app` creates `apps/my-app/` with a working vite config (base set to `/my-app/`), RialtoProvider in main.tsx, and a skeleton example page — no implementation is copied
  5. `packages/rialto/registry.json` is served as static JSON from rialto-web at `/rialto/registry.json` with the correct Content-Type header
**Plans:** 3/3 plans complete

Plans:
- [ ] 08-01-PLAN.md — Registry generation script, CI drift check, and rialto-web static serving
- [ ] 08-02-PLAN.md — Two-tier llms.txt at repo root and CLAUDE.md Rialto usage section
- [ ] 08-03-PLAN.md — CLI scaffold command (mbe new / mbe init)

### Phase 9: Polish and Documentation
**Goal**: Every component has accurate a11y documentation in the showcase, and the top 20 most-used components have structured spec files
**Depends on**: Phase 6, Phase 7
**Requirements**: A11Y-09, AIDX-05
**Success Criteria** (what must be TRUE):
  1. Each component page in rialto-web showcase has an "Accessibility" section listing keyboard shortcuts, ARIA roles/attributes, and screen reader behavior — verifiable by navigating to any interactive component page
  2. Structured `.spec.md` files exist for the top 20 most-used components in `packages/rialto/specs/` with anatomy, design tokens used, prop tables, and all component states documented
  3. A manual verification checklist exists and is completed for Dialog, DropdownMenu, CommandPalette, and Toast — covering behaviors axe-core cannot detect
**Plans:** 3/3 plans complete

Plans:
- [ ] 09-01-PLAN.md — Deepen a11y docs for 28 shallow showcase pages + manual verification checklist
- [ ] 09-02-PLAN.md — Structured spec files for top 10 components (Stack, Text, DataList, Select, Button, Card, Checkbox, Input, Toast, Divider)
- [ ] 09-03-PLAN.md — Structured spec files for next 10 components (Stat, Table, Skeleton, EmptyState, Toggle, Tag, Dialog, Tabs, Badge, Tooltip)

### Phase 10: Documentation Reconciliation & llms-full.txt Fix
**Goal**: Close documentation-only gaps: fix Phase 06 SUMMARY frontmatter omissions, correct stale prop names in llms-full.txt, and formally verify CLAUDE.md Rialto section
**Depends on**: Phase 8, Phase 6
**Requirements**: A11Y-03, A11Y-04, A11Y-05, A11Y-07, A11Y-08, AIDX-02, AIDX-03
**Gap Closure:** Closes gaps from v1.1 audit
**Success Criteria** (what must be TRUE):
  1. Phase 06 SUMMARY files (06-02, 06-03) list all contributed requirements in `requirements-completed` frontmatter
  2. `llms-full.txt` documents correct prop names for Drawer (`onClose`), ConfirmDialog (`onConfirm`/`onCancel`), and Popover (actual API)
  3. `llms.txt` is consistent with corrected `llms-full.txt`
  4. CLAUDE.md Rialto section is verified accurate against current component APIs
**Plans:** 1 plan

Plans:
- [ ] 10-01-PLAN.md — SUMMARY frontmatter fixes, llms prop corrections, CLAUDE.md verification

### Phase 11: Registry Props & Phase 08 Verification
**Goal**: Improve registry.json props coverage for components with empty props arrays, and create formal verification for Phase 08
**Depends on**: Phase 10
**Requirements**: AIDX-01, AIDX-04, AIDX-06
**Gap Closure:** Closes gaps from v1.1 audit
**Success Criteria** (what must be TRUE):
  1. `packages/rialto/registry.json` has non-empty props arrays for high-use components (Table, Drawer, Checkbox, TextArea, and other frequently used components)
  2. Phase 08 VERIFICATION.md exists with verification evidence for AIDX-01, AIDX-04, AIDX-06
  3. CI drift check for registry.json continues to pass after props improvement

Plans: (to be planned)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Rialto-Web Migration | v1.0 | 3/3 | Complete | 2026-02-28 |
| 2. Dashboard Rename | v1.0 | 2/2 | Complete | 2026-02-28 |
| 3. Marketing Portfolio | v1.0 | 2/2 | Complete | 2026-02-28 |
| 4. Hospitality Migration + Full Hosting | v1.0 | 5/5 | Complete | 2026-03-04 |
| 5. Retroactive Verification & Gap Closure | v1.0 | 2/2 | Complete | 2026-03-04 |
| 6. Accessibility Foundation | v1.1 | 5/5 | Complete | 2026-03-23 |
| 7. Example Pages | v1.1 | 3/3 | Complete | 2026-03-23 |
| 8. AI Developer Experience | v1.1 | 3/3 | Complete | 2026-03-23 |
| 9. Polish and Documentation | v1.1 | 3/3 | Complete | 2026-03-23 |
| 10. Documentation Reconciliation & llms-full.txt Fix | v1.1 | 0/1 | Pending | - |
| 11. Registry Props & Phase 08 Verification | v1.1 | 0/0 | Pending | - |
