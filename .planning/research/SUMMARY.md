# Project Research Summary

**Project:** mattbutlerengineering — Rialto v1.1 (Accessibility, Example Pages, AI Developer Experience)
**Domain:** React design system — WCAG AA compliance, full-page showcase examples, and AI-friendly developer tooling
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

Rialto v1.1 is an enhancement milestone for an existing 55-component React design system. The primary success criterion is specific and testable: when an AI tool is given the prompt "Build a settings page with Rialto," it produces correct, accessible code using real components. Achieving this requires three workstreams in a strict dependency order — first, make the components themselves WCAG AA compliant; second, build polished example pages demonstrating correct composition patterns including non-happy-path states; third, publish machine-readable artifacts (registry, llms.txt) that make those patterns accessible to AI tooling. The research confirms that all necessary infrastructure already exists in the codebase — no new frameworks, build tools, or CI systems are required.

The recommended approach is sequential by necessity. Accessibility work must precede example pages because example pages are the canonical Rialto usage reference — they must themselves be accessible or they teach AI tools to generate inaccessible code. Example pages must precede llms.txt expansion because llms.txt should link to working, realistic examples. The component registry must be generated from TypeScript source (never hand-maintained), and llms.txt must be split into an index file (under 20KB) and a full file — the two-tier pattern used by Nord Design System and Ant Design. A single monolithic llms.txt exceeds AI context windows for a 55+ component library.

The most significant risk is subtle: axe-core cannot resolve CSS custom property values in jsdom, meaning the existing automated accessibility suite will never catch contrast failures in the token-based color system. A separate programmatic token-contrast test (importing hex values as JS constants, asserting 4.5:1 ratios) must be added before any accessibility work is marked complete. Additionally, 14 of 58 component directories currently have no axe tests — several of these (CommandPalette, DropdownMenu, Autocomplete) are the most ARIA-complex components and the most likely to harbor real violations. Both gaps must be closed during the accessibility phase before any fixing work begins.

## Key Findings

### Recommended Stack

The base stack is fixed (React 19, Vite 7, TypeScript 5.9.3) and production-validated. This milestone requires no stack changes. The existing test infrastructure in `packages/rialto` is already correct for the accessibility work: `vitest-axe` matchers are registered in `src/test/setup.ts`, canvas is stubbed for jsdom compatibility, and framer-motion is mocked to prevent animation interference during axe scans. The build pipeline already generates `dist/manifest.json` from TypeScript source via `scripts/generate-manifest.ts`. The `llms.txt` file already exists at `packages/rialto/llms.txt` and needs expansion, not replacement. The `tools/cli` package already provides the `mbe` command and needs one new `init.ts` command added following the established pattern.

**Core technologies:**
- `@mbe/rialto 0.1.0`: The design system under improvement — CSS Modules + CSS custom properties, Vite lib mode, 55+ components
- `vitest-axe`: axe-core integration for Vitest — already installed and wired; no new setup needed
- `scripts/generate-manifest.ts` + `dist/manifest.json`: TypeScript Compiler API → JSON build artifact; single source of truth for component names and props; never hand-edit
- `packages/rialto/llms.txt` + `llms-full.txt` (new): Hand-authored AI context files; index under 20KB, full file with complete API
- `tools/cli/src/commands/init.ts` (new): `mbe init <name>` scaffold command following established `agent.ts` / `users.ts` pattern

**Removing nothing:** This milestone adds; it does not remove existing infrastructure.

### Expected Features

**Must have (table stakes — P1):**
- WCAG AA color contrast on all components — 4.5:1 for normal text, 3:1 for UI controls; verified at token level via programmatic hex-constant test
- Keyboard focus indicators on all interactive components — `:focus-visible` styling audit across all 55+ components
- ARIA attributes on interactive components — roles, labels, `aria-expanded`, `aria-invalid`; semantic HTML first, ARIA only where HTML falls short
- axe-core CI gate — `toHaveNoViolations()` assertions covering all 58 component directories (14 currently missing), including portal components tested via `axe(document.body)`
- Programmatic token-contrast test — separate from axe; imports hex literals, asserts ratios for both light and dark themes
- Settings page example — the explicit AI success criterion; polished, realistic, accessible
- Dashboard example page — second most common pattern; validates Card + DataTable + Badge composition
- Full form example with all validation states — error, disabled, loading states as static renders (visible without interaction)
- Component registry JSON (`registry.json`) — generated from TypeScript source at build time; CI diff check prevents drift
- Two-tier llms.txt — index file under 20KB, full file with complete prop tables; both committed to repo
- CLAUDE.md Rialto usage section — import paths, RialtoProvider setup, top component APIs

**Should have (v1.1 polish — P2):**
- CLI scaffold command (`mbe init <name>`) — minimal app skeleton (shell, not copied implementation); reads `dist/manifest.json` to verify Rialto is built
- Per-component structured spec files (`.spec.md`) — top 20 most-used components first; a11y docs and API combined in one file
- Per-component a11y doc section in showcase — keyboard shortcuts, ARIA attributes, screen reader behavior
- Multi-state page flows — empty → loading → populated for same layout (high AI context value)
- Copy-this-page code snippet with syntax highlighting (Shiki)

**Defer to v1.2+:**
- Token audit CI script — scans app code for hardcoded hex values; low urgency until external devs use Rialto
- WCAG 2.2 specific criteria (focus appearance sizing, label-in-name) — after 2.1 AA is solid
- Mobile / responsive example pages — after core desktop patterns are established
- npm publishing / external registry distribution — explicitly out of scope for this milestone

### Architecture Approach

The architecture is additive: all changes are new files or extensions to existing files within the established package structure. The build dependency graph runs `packages/rialto` (source and tests) → `apps/rialto-web/src/pages/examples/` (new example pages consuming fixed components) → `packages/rialto/llms.txt` (expanded with links to new example routes) → `tools/cli/src/commands/init.ts` (new scaffold command reading `dist/manifest.json`). No new packages, no new CI infrastructure, and no Storybook dependency are required.

**Major components:**
1. `packages/rialto/src/components/accessibility.test.tsx` — single-file axe suite; extend to cover all 58 directories; portal components use `axe(document.body)`, not `axe(container)`; separate token-contrast Vitest file for color ratio assertions
2. `packages/rialto/scripts/generate-manifest.ts` + `dist/manifest.json` — TypeScript-to-JSON build artifact; CI diff check ensures committed registry matches generated output
3. `packages/rialto/llms.txt` + `llms-full.txt` — hand-authored AI context files; index file under 20KB; full file with complete prop tables and composition examples; linked from CLAUDE.md
4. `apps/rialto-web/src/pages/examples/` — new directory: DashboardPage, SettingsPage, DataTablePage; all pages render all component states statically including error and disabled
5. `tools/cli/src/commands/init.ts` — new command; generates `apps/<name>/` skeleton with RialtoProvider, base vite config, and dev port; outputs minimal shell, not copied implementations

### Critical Pitfalls

1. **axe-core cannot see CSS token contrast in jsdom** — axe sees blank strings for `var(--rialto-*)` values, so contrast failures are invisible to the automated suite. Add a separate Vitest test importing hex constants and asserting 4.5:1 ratios for both light and dark themes. This must be the first task of the accessibility phase.

2. **14 component directories have no axe tests** — The most ARIA-complex components (CommandPalette, DropdownMenu, Autocomplete, Popover, Tooltip, ContextMenu, plus 8 others) are the most likely to harbor real violations. Portal components need `axe(document.body)` after triggering the open state. Audit coverage gaps before beginning any fixes.

3. **Dialog focus-return-on-close is absent** — The Dialog component has a focus trap on open (correct) but does not return focus to the trigger element on close, violating WCAG 2.4.3. Implement capture inside the component (`previousFocus = useRef(document.activeElement)`) so callers require zero changes. Smoke-test hospitality's "Add Reservation" and "Walk-in" flows after any overlay component change.

4. **Component registry must be generated, never hand-maintained** — A hand-written registry drifts from TypeScript source within one sprint, causing AI tools to hallucinate prop names. Add a CI diff check that fails if committed `registry.json` diverges from regenerated output. Make this decision before writing any registry content.

5. **A single llms.txt exceeds AI context windows** — 55+ components at reasonable documentation depth produces 300KB+, which AI tools truncate or ignore. Split into `llms.txt` (index, under 20KB) and `llms-full.txt` (complete). Define this structure before writing any content.

6. **Example pages showing only happy-path defaults** — AI tools generate code matching the showcase. Every interactive component example must render error, disabled, and loading states as statically visible without any interaction. Make "all states visible without JavaScript" a done criterion for each example page.

## Implications for Roadmap

Based on the strict dependency chain identified across all four research files, a four-phase structure is recommended:

### Phase 1: Accessibility Foundation

**Rationale:** Accessibility must come first. Example pages are the canonical Rialto reference — they must be built on fixed, accessible components or they propagate inaccessible patterns into AI training context. The axe infrastructure is already in place; this phase is audit-and-fix work, not infrastructure work. Two pre-conditions must be met before fixing begins: write the token-contrast test (to catch what axe misses), and audit the 14 missing component test cases (to know the full scope of violations).

**Delivers:** All 58 components pass axe-core CI; programmatic token-contrast Vitest test passes for light and dark themes; focus management correct in Dialog/Drawer/ConfirmDialog (capture inside component, zero caller changes); keyboard navigation audited on complex interactive components; documented manual spot-check for Toast, CommandPalette, and DropdownMenu.

**Addresses:** WCAG AA color contrast, keyboard focus indicators, ARIA attributes on interactive components, axe-core CI gate, focus return on close (WCAG 2.4.3), screen reader live regions for Toast/Alert/Skeleton.

**Avoids:** CSS token contrast blind spot (Pitfall 1), missing axe coverage (Pitfall 2), focus return regression in hospitality dialogs (Pitfall 3), shipping inaccessible example pages.

### Phase 2: Example Pages

**Rationale:** Example pages depend on Phase 1 (components must be accessible before they appear in the canonical reference). They must precede llms.txt expansion because llms.txt links to example page routes that must exist. Example pages also serve as the scaffold templates for the CLI in Phase 3.

**Delivers:** DashboardPage, SettingsPage, DataTablePage in `apps/rialto-web/src/pages/examples/` — all statically rendering all component states (idle, error, disabled, loading) without interaction; realistic mock data using actual domain object shapes; annotated composition notes explaining why specific components are combined; routes wired into `apps/rialto-web/src/routes.tsx`.

**Addresses:** Settings page success criterion (the explicit v1.1 goal), dashboard example, form validation states, realistic data shapes, annotated composition patterns.

**Avoids:** Happy-path-only examples (Pitfall 6) by enforcing "all states visible without JavaScript" as the done criterion for each page.

### Phase 3: AI Developer Experience

**Rationale:** This phase depends on Phase 1 (a11y docs reference audited, accurate component behavior) and Phase 2 (llms.txt links to example pages that now exist; CLI scaffold uses example pages as templates). The registry generation pipeline decision must be made at the start of this phase, before any content is written.

**Delivers:** Registry generation pipeline (`pnpm build:registry`) with CI diff check; two-tier llms.txt (index + full) committed to repo; CLAUDE.md Rialto usage section; `mbe init <name>` CLI scaffold command generating minimal app skeletons (vite.config.ts with `base: "/<name>/"`, RialtoProvider in main.tsx, assigned dev port from 3005+).

**Addresses:** Component registry JSON, llms.txt AI context files (both tiers), CLAUDE.md update, CLI scaffold command.

**Avoids:** Registry drift (Pitfall 4), context-window overflow (Pitfall 5), scaffold copying implementations (Pitfall 8 — scaffold generates shells only, references `packages/rialto/CLAUDE.md` for authoring patterns).

### Phase 4: Polish and Documentation

**Rationale:** Per-component spec files and a11y docs in the showcase are writing work that can only be done accurately after the accessibility audit is complete and violations are fixed. This phase delivers the v1.1 polish items that don't block the core success criterion but significantly improve the developer experience long-term.

**Delivers:** Structured `.spec.md` files for top 20 components (combining API docs and a11y notes in one file, not two); per-component a11y doc section in rialto-web showcase (keyboard shortcuts, ARIA attributes, screen reader behavior); multi-state page flows (empty → loading → populated) for showcase; llms.txt sync lint script (verifies every manifest.json component has a llms.txt entry); manual verification checklist for Dialog, DropdownMenu, CommandPalette, and Toast.

**Addresses:** Per-component a11y docs, structured spec files, multi-state flows, copy-this-page snippets.

**Avoids:** Treating "axe passes" as "WCAG AA compliant" (Pitfall 7) — this phase includes the documented manual verification checklist as a required completion criterion.

### Phase Ordering Rationale

- Accessibility precedes everything because the example pages are meant to demonstrate correct usage — components with ARIA violations or broken focus management cannot be the canonical reference. This is not a preference; it is a logical dependency.
- Example pages precede llms.txt because llms.txt should reference working, deployable routes with realistic examples. Writing llms.txt before examples exist means documenting placeholder patterns that AI tools will faithfully reproduce.
- Registry, llms.txt, and CLI are in the same phase because they form a coherent artifact set: the registry is the machine-structured catalog, llms.txt is the narrative layer referencing the registry, and the CLI reads the registry to verify Rialto is built before scaffolding. Building them together ensures they are in sync from the start.
- Polish (Phase 4) is separated because spec file writing requires the audit to be complete — you cannot accurately document a11y behavior until violations are found and fixed. Attempting this in parallel with Phase 1 would mean rewriting spec files after the audit changes component behavior.

### Research Flags

Phases needing careful execution (well-researched, but non-trivial implementation):

- **Phase 1 (accessibility audit):** The axe coverage gaps for portal-rendering components (Popover, Tooltip, DropdownMenu, CommandPalette) require non-trivial test setup (trigger open state, `await act()`, `axe(document.body)`). The token-contrast programmatic test requires careful import resolution from the token source file — the exact hex constant import path needs verification. Dialog focus-return needs smoke-testing against hospitality production flows before the phase is marked complete.
- **Phase 3 (registry generation):** The generation pipeline decision (ts-morph vs react-docgen-typescript vs extending the existing TypeScript Compiler API in `generate-manifest.ts`) must be made as the first action of this phase. The CI diff check implementation is non-trivial but well-documented. Make both decisions before writing any registry content.

Phases with standard patterns (low research risk, skip research-phase):

- **Phase 2 (example pages):** Construction follows established Carbon / Atlassian patterns. File structure is defined by the architecture research. Main risk is discipline (showing all states), not technical complexity. No new dependencies required.
- **Phase 4 (polish and docs):** Pure documentation and writing work following established spec file patterns from Hardik Pandya's approach and Nord Design System. No technical risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing production stack; no new technologies required; all tool versions verified by direct code inspection of the codebase |
| Features | MEDIUM-HIGH | Core a11y patterns verified against axe-core docs and WCAG 2.2 spec; AI DX patterns verified against Nord Design System, shadcn registry, and Hardik Pandya's published techniques; example page patterns from Carbon and Atlassian |
| Architecture | HIGH | Existing codebase examined directly; all file paths and component boundaries confirmed; build pipeline verified; 14 missing test cases confirmed by diff; Dialog focus-return absence confirmed in Dialog.tsx source |
| Pitfalls | HIGH | Critical pitfalls derived from direct code inspection (14 missing tests confirmed, focus-return absence confirmed); supplemented by Deque's axe coverage research (57% WCAG coverage) and BOIA dark mode contrast guidance |

**Overall confidence:** HIGH

### Gaps to Address

- **Dark mode token contrast values:** The specific hex values for dark theme tokens have not been audited against 4.5:1 requirements. The programmatic contrast test in Phase 1 will surface these; expect fixes to the dark theme token set. Budget time for this discovery work.
- **Portal component test setup for axe:** The approach is confirmed (`axe(document.body)` + trigger open state + `await act()`), but exact implementation for each of the 14 missing components — especially CommandPalette (combobox role) and Autocomplete — will require per-component iteration during Phase 1.
- **Registry generation approach:** The existing `generate-manifest.ts` uses the TypeScript Compiler API. Whether to extend it or replace it with `ts-morph` (more ergonomic) or `react-docgen-typescript` (purpose-built for React props) is an unresolved decision. Evaluate at the start of Phase 3 with a 30-minute spike.
- **llms.txt content scope:** The research specifies the structure and size constraints (index under 20KB, full with complete prop tables) but not the exact composition examples to include. This is authoring work to be done in Phase 3 after example pages exist — the example pages become the source of truth for the composition guidance.
- **`mbe init` port assignment UX:** CLAUDE.md documents ports 3000-3004 as assigned; CLI assigns 3005+ or prompts. The exact interactive prompt design for the CLI is not specified — minor execution detail, but worth finalizing at the start of Phase 3 to avoid rework.

## Sources

### Primary (HIGH confidence)

- Existing codebase: `packages/rialto/src/test/setup.ts`, `accessibility.test.tsx`, `scripts/generate-manifest.ts`, `llms.txt`, `Dialog.tsx` — examined directly
- 58 component directories inspected; 44 covered by axe tests, 14 missing confirmed by diff against test file `it()` calls
- [vitest-axe — GitHub](https://github.com/chaance/vitest-axe) — official source; happy-dom incompatibility confirmed
- [llms.txt specification — llmstxt.org](https://llmstxt.org/) — file format, root path requirement
- [axe-core — Deque](https://www.deque.com/axe/axe-core/) — official tool documentation
- [WCAG 2.1 SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — contrast minimum requirements
- [WCAG 2.4.3 Focus Order](https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html) — focus return on close requirement
- [Accessibility Testing for Design System Components — VA.gov](https://design.va.gov/accessibility/accessibility-testing-for-design-system-components) — authoritative government design system reference
- [shadcn Registry Getting Started](https://ui.shadcean.com/docs/registry/getting-started) — registry JSON schema reference

### Secondary (MEDIUM confidence)

- [Nord Design System llms.txt](https://nordhealth.design/ai/llms-txt/) — two-tier index/full pattern in production; direct inspection
- [Expose Your Design System to LLMs — Hardik Pandya](https://hvpandya.com/llm-design-systems) — structured spec file approach; verified against our constraints
- [Carbon Design System Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) — example page pattern reference; direct inspection
- [Deque Automated Accessibility Coverage Report](https://www.deque.com/automated-accessibility-testing-coverage/) — axe-core catches 57% of WCAG issues on average
- [BOIA — Dark mode contrast requirements](https://www.boia.org/blog/offering-a-dark-mode-doesnt-satisfy-wcag-color-contrast-requirements) — each theme must be audited independently
- [Design Systems And AI: Why MCP Servers Are The Unlock — Figma Blog](https://www.figma.com/blog/design-systems-ai-mcp/) — Figma official blog; MCP pattern noted but not adopted
- [Supercharge your design system with LLMs and Storybook MCP — Codrops](https://tympanus.net/codrops/2025/12/09/supercharge-your-design-system-with-llms-and-storybook-mcp/) — Storybook MCP approach noted; custom registry chosen instead

### Tertiary (LOW confidence)

- [React & CSS in 2026: Best Styling Approaches Compared](https://medium.com/@imranmsa93/react-css-in-2026-best-styling-approaches-compared-d5e99a771753) — corroborates CSS Modules approach; used for ecosystem sentiment only, not as primary source

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
