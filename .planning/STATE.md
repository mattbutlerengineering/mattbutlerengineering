---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Rialto Accessibility & AI DX
status: unknown
last_updated: "2026-03-23T04:37:36.681Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 14
  completed_plans: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com
**Current focus:** v1.1 — Phase 9: Polish and Documentation

## Current Position

Phase: 9 of 9 (Polish and Documentation)
Plan: 2 of 3 complete
Status: In Progress
Last activity: 2026-03-23 — Completed 09-02 component spec files (first 10)

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**
- Total plans completed: 5 (v1.1)
- Average duration: ~5 min
- Total execution time: ~23 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 06-accessibility-foundation | 5/5 | ~23 min | ~5 min |

*Updated after each plan completion*
| Phase 06-accessibility-foundation P03 | 4 min | 2 tasks | 7 files |
| Phase 06-accessibility-foundation P05 | 8min | 2 tasks | 17 files |
| Phase 07-example-pages P01 | 3 | 2 tasks | 7 files |
| Phase 07-example-pages P02 | 2 min | 1 task | 2 files |
| Phase 07-example-pages P03 | 8min | 2 tasks | 4 files |
| Phase 08-ai-developer-experience P02 | 2 | 2 tasks | 4 files |
| Phase 08-ai-developer-experience P01 | 2min | 2 tasks | 6 files |
| Phase 08-ai-developer-experience P03 | 3min | 2 tasks | 2 files |
| Phase 09-polish-and-documentation P02 | 4min | 2 tasks | 10 files |

## Accumulated Context

### Decisions

All v1.0 decisions archived in .planning/milestones/v1.0-phases/ SUMMARY.md files.
Key decisions summarized in PROJECT.md Key Decisions table.

v1.1 decisions pending ():
- [Phase 07-02]: Badge has no "info" variant — use "neutral" for neutral-status items (Confirmed)
- [Phase 07-02]: EmptyState uses "heading" prop not "title" — plan spec was incorrect
- [Phase 07-02]: Table Column.render receives full row (row: T), not (value, row) — plan spec was incorrect
- [Phase 07-02]: Table requires rowKey prop — not optional, must provide key extractor function
- [Phase 07-01]: Stack justify uses "between" not "space-between" — StackJustify type shorthand names
- [Phase 07-01]: Button doesn't forward aria-live — wrap label in <span aria-live="polite"> in children
- [Phase 07-01]: Plan specified nonexistent CSS tokens (--rialto-radius-md, --rialto-surface-secondary) — verified correct names from source
- Registry generation approach (ts-morph vs react-docgen-typescript vs extend generate-manifest.ts) — to be decided at start of Phase 8
- `mbe init` port assignment UX (auto-assign 3005+ vs prompt) — to be decided at start of Phase 8
- [Phase 06]: Use dark text (#1a1918) on light theme accent backgrounds — 6.26:1 vs 2.73:1 for white on #b0841e gold
- [Phase 06]: Accent darkened from #c4922a to #b0841e for 3:1 UI control threshold; dark text-tertiary opacity raised 0.38->0.50 after test revealed 3.49:1 failure
- [Phase 06-accessibility-foundation]: Disable region rule on document.body scans in accessibility tests — isolated test content lacks page-level landmarks; not a component responsibility
- [Phase 06-accessibility-foundation]: Use cloneElement to inject aria-haspopup/aria-expanded onto trigger elements in DropdownMenu and Popover — eliminates nested-interactive violation from role=button wrapper div
- [Phase 06-04]: Toast error variant routes to assertive region; both aria-live regions always mounted — screen readers register live regions at page load
- [Phase 06-04]: Skeleton bones use aria-hidden=true (visual-only); SkeletonGroup remains semantic status container
- [Phase 06-accessibility-foundation]: Use vi.useFakeTimers + vi.runAllTimers in focus-return tests — jsdom rAF backed by setTimeout; fake timers needed for reliable synchronous flushing
- [Phase 06-accessibility-foundation]: [Phase 06-03]: triggerRef focus-return effect declared before focus-trap effect in all components — React effect ordering ensures activeElement captured before trap moves focus
- [Phase 06-accessibility-foundation]: Steps .stepButton uses display:contents — focus ring applied via .stepButton:focus-visible .node descendant selector
- [Phase 06-accessibility-foundation]: composes: focusRing is the canonical focus pattern — never write inline :focus-visible box-shadow rules
- [Phase 07-example-pages]: Select has no error prop — error state shown via Input error+hint; error panel inputs use readOnly to avoid controlled/uncontrolled warnings
- [Phase 07-example-pages]: Spinner exported from @mbe/rialto via Progress module — not a separate package
- [Phase 08-ai-developer-experience]: Two-tier llms.txt: lean llms.txt (<20KB) at repo root for AI context windows, llms-full.txt (26KB) for complete reference
- [Phase 08-ai-developer-experience]: Registry output to packages/rialto/registry.json (package root, committed) not dist/ (gitignored)
- [Phase 08-ai-developer-experience]: importPath always '@mbe/rialto' — all components barrel-exported from single entry point
- [Phase 08-ai-developer-experience]: mbe init port assignment: auto-assign by scanning all apps/*/vite.config.ts for port values plus known ports 3000-3004, return max+1 (defaults to 3005)
- [Phase 09-polish-and-documentation]: Spec files for layout primitives (Stack, Text, Divider) kept at 40-60 lines — non-interactive components don't warrant over-documentation
- [Phase 09-polish-and-documentation]: Checkbox spec covers Radio and RadioGroup exports from same module — single spec per source file
- [Phase 09-polish-and-documentation]: Toast spec documents dual aria-live region pattern — both regions always mounted at page load for reliable screen reader registration

### Pending Todos

None.

### Blockers/Concerns

- [RESOLVED 06-01] Phase 6: axe-core cannot resolve CSS custom property contrast values in jsdom — token-contrast.test.ts now handles this programmatically
- [RESOLVED 06-02] Phase 6: 18 component directories had no axe tests — all 58 component directories now have axe-core WCAG 2.1 AA assertions
- [RESOLVED 06-03] Phase 6: Dialog focus-return-on-close is absent — triggerRef pattern now implemented in all 7 overlay components
- [RESOLVED 08-02] Phase 8: Single llms.txt would exceed AI context windows for 55+ components — two-tier structure implemented: llms.txt (11KB) + llms-full.txt (26KB)

## Session Continuity

Last session: 2026-03-23T04:36:49Z
Stopped at: Completed 09-02-PLAN.md — component spec files (first 10)
Resume file: .planning/phases/09-polish-and-documentation/09-03-PLAN.md
