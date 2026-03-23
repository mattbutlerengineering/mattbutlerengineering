# Feature Research

**Domain:** Design system accessibility, example pages, and AI-friendly developer tooling (Rialto v1.1)
**Researched:** 2026-03-22
**Confidence:** MEDIUM-HIGH (core a11y patterns verified against axe-core docs and WCAG 2.2 spec; AI DX patterns verified against Nord Design System, shadcn registry, and Hardik Pandya's published techniques; example page patterns from Carbon and Atlassian design systems)

---

## Scope

This research covers three dimensions of the v1.1 milestone:

1. **Accessibility** — WCAG AA compliance per component and automated axe-core CI enforcement
2. **Example pages** — Realistic, visually polished full-page patterns showing real-world Rialto usage
3. **AI developer experience** — Component registry, llms.txt, and CLI scaffold so AI tools produce correct Rialto code

The success criterion is: "Build a settings page with Rialto" → AI produces correct, accessible code using real components.

---

## Feature Landscape

### Surface 1: Accessibility (WCAG AA + axe-core)

#### Table Stakes (Must Have or the Milestone Fails)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| WCAG AA color contrast on all components | 4.5:1 for normal text, 3:1 for large text and UI controls — minimum legal and moral bar | MEDIUM | Audit all color tokens against backgrounds; fix any non-conformant combinations. CSS Modules means fixes are contained. |
| Visible keyboard focus indicators | All interactive components must have a clearly visible focus ring when tabbed to | MEDIUM | Check each interactive component (Button, Input, Select, Dialog, etc.) for `:focus-visible` styling. Common gap in custom design systems. |
| ARIA attributes on interactive components | Buttons, inputs, dialogs, modals, toggles all need correct roles, labels, and state attributes | MEDIUM | Use semantic HTML first; add ARIA only where HTML semantics fall short. Common issues: missing `aria-label` on icon-only buttons, missing `aria-expanded` on dropdowns. |
| axe-core test per component in Vitest | Automated gate that catches regressions in CI | LOW | `vitest-axe` package integrates axe-core with Vitest. One `toHaveNoViolations()` assertion per component. Note: color contrast does NOT work in jsdom — requires browser mode for that check. |
| Keyboard navigation order (tab order) | Interactive elements must be reachable in logical DOM order; no keyboard traps | MEDIUM | Audit complex components (modals, dropdowns, date pickers) for focus management. Dialogs need focus lock; modals need focus return on close. |
| Screen reader announcements for state changes | Dynamic content changes (loading states, error messages, live regions) must be announced | MEDIUM | Use `aria-live` regions for toast notifications, form errors, and async state. Common omission. |
| Form field labeling | Every input must have an associated visible or screen-reader-accessible label | LOW | Verify `<label>` pairing or `aria-label`/`aria-labelledby` on all form components. |

#### Differentiators (Sets Rialto Apart from Generic Component Libraries)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-component a11y doc section in showcase | Shows keyboard shortcuts, ARIA attributes, and screen reader behavior — rare among private design systems | MEDIUM | Short table per component: "Keyboard: Tab/Enter/Space/Escape", "ARIA: role, aria-label, aria-expanded". Written once per component. |
| Axe-core CI gate (blocks PR on violations) | Regressions caught automatically — team can't accidentally ship inaccessible components | LOW | Vitest already runs in CI; add axe assertions to existing component tests. Zero new infrastructure. |
| WCAG 2.2 (not just 2.1) compliance | 2.2 adds focus appearance, drag alternatives, accessible authentication — more current than most systems | MEDIUM | Key additions: 2.4.11 Focus Appearance (min focus ring size), 2.5.3 Label in Name. Worth targeting since we're auditing anyway. |
| Contrast ratio verified at token level | Fix contrast in design tokens, not component CSS — one fix propagates everywhere | MEDIUM | Audit `--rialto-*` CSS variables, not individual component files. More scalable than per-component fixes. |

#### Anti-Features (Do Not Build)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Full manual screen reader test suite as a CI gate | "Thorough testing" | Screen reader behavior is platform-specific (JAWS vs NVDA vs VoiceOver), can't automate reliably, blocks CI for non-deterministic reasons | Manual screen reader testing is a one-time audit with notes; axe-core handles regression prevention automatically |
| AAA compliance | "Better is better" | WCAG AAA includes criteria (1.4.6 enhanced contrast 7:1, no audio at all) that conflict with normal design system aesthetics; not required by any regulation | Target AA strictly; note where AAA is achievable without design tradeoffs |
| Accessibility overlay / third-party widget | "Quick fix for compliance" | Overlays are widely condemned by the accessibility community and don't fix underlying issues | Fix the components; no overlay |

---

### Surface 2: Example Pages (Realistic, Polished Full-Page Patterns)

#### Table Stakes (Must Have or the Milestone Fails)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dashboard example page | Most common "first page" pattern for any web app — KPI cards, tables, charts layout | MEDIUM | Show Rialto Card, DataTable, Badge, Stat components in realistic combination. Already partly exists in hospitality app. |
| Settings page example | Second most common pattern — form layout with sections, save/cancel, validation | MEDIUM | Show Rialto Form, Input, Select, Toggle, Button, Section Header in a real settings layout. This is the AI success criterion. |
| Data entry / form example | Full form with validation states, error messages, helper text, submit flow | MEDIUM | Show all form component states: default, focused, error, disabled, loading. |
| Component states in context | Every component shown in all meaningful states: default, hover, active, disabled, loading, error, empty | MEDIUM | Not just isolated knobs — show states as they appear in real usage (e.g., a disabled Submit button in a form). |
| Visual polish matching production quality | Examples that look like they belong in a real app, not a developer sandbox | MEDIUM | Realistic content (not "Lorem ipsum"), consistent spacing, realistic data. Carbon Design System and Atlassian are the reference bar. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Copy this page" code snippet for each example | Developers can take the full page as a starting point — high utility | LOW | Add a copy-to-clipboard button with the full page JSX. Requires syntax highlighting (Shiki). |
| Annotated composition patterns | Notes on why specific components are combined — "Use Card + DataTable for tabular dashboard sections, not nested Cards" | LOW | Short written annotations alongside each example. Guides correct AI code generation. |
| Multi-state page flows | Show page with empty state → loading state → populated state for the same layout | MEDIUM | This is rare and highly valuable for AI context — demonstrates that states aren't different components but different data conditions. |
| Real data shapes in examples | Use realistic mock data (not `{id: 1, name: "Test"}`) — proper domain objects matching hospitality app | LOW | Use actual reservation, floor plan, and user data shapes from the services layer. Gives AI correct context for the domain. |

#### Anti-Features

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Interactive prop editor (knobs/controls) | "Let users tweak props live" | High implementation complexity; conflicts with the "show realistic usage" goal; encourages prop-by-prop thinking instead of composition | Show multiple pre-built variants; provide copy-able code |
| Auto-generated prop tables from TypeScript | "Complete documentation" | Requires TypeDoc or ts-morph; significant tooling; output is mechanical and verbose | Hand-written examples showing the props that matter in context are more useful to humans and AI alike |
| Version history in examples | "Show what changed" | Only relevant when external consumers exist; Rialto is a private monorepo package currently | Deferred until npm publishing milestone |

---

### Surface 3: AI Developer Experience (Registry, llms.txt, CLI)

#### Table Stakes (Must Have or the Milestone Fails)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Component registry JSON | Machine-readable catalog of all components: name, description, props, import path, usage examples | MEDIUM | Not the shadcn CLI format (which requires external distribution); a simple `registry.json` file at `packages/rialto/registry.json`. Structure: `{components: [{name, description, importPath, props, examples}]}`. |
| llms.txt at project root | AI tools (Cursor, Windsurf, Claude) read this file to understand the design system before generating code | LOW | Two files: `/llms.txt` (~5K tokens, overview + component list) and `/llms-full.txt` (full component API + usage patterns). Nord Design System is the reference implementation. |
| CLAUDE.md updated with Rialto patterns | Ensures Claude starts every session with Rialto import paths, token names, component APIs | LOW | Add a `## Rialto Design System` section to CLAUDE.md (or a dedicated `.claude/skills/rialto-usage.md`) with import conventions, theme provider setup, and top 10 most-used components. |
| CLI scaffold command (`mbe new`) | Creates a new app skeleton in `apps/` with RialtoProvider, base layout, and example page | MEDIUM | Extend the existing `tools/cli` package. Interactive prompts: app name, port, example page type. Outputs wired Vite config, RialtoProvider setup, and one example page. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Structured spec files per component | Markdown files (not JSDoc) with metadata, anatomy, token references, props, states, and code examples — the format LLMs parse best | MEDIUM | One `.spec.md` file per component in `packages/rialto/src/components/<Name>/`. Hardik Pandya's approach: LLMs prefer structured markdown over inline comments or TypeDoc. |
| Token audit CI script | Scans app code for hardcoded hex values or raw CSS; suggests correct Rialto token; fails CI on violations | MEDIUM | Node.js script using regex on CSS Modules files. Exit code 1 on violations. Prevents "AI generated code with hardcoded #3B82F6 instead of var(--rialto-color-primary)". |
| Registry served as static JSON from rialto-web | Makes component registry discoverable at `mattbutlerengineering.com/rialto/registry.json` for tools that fetch it | LOW | Copy `registry.json` into `apps/rialto-web/public/` during build. Single line Turborepo pipeline addition. |
| AI-readable example page annotations | Each example page has a frontmatter block with `components_used`, `patterns`, and `when_to_use` fields — machine-readable metadata | LOW | Simple JSON block in a comment at the top of each example page file. Costs nothing; gives AI context for when to suggest which pattern. |

#### Anti-Features

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Storybook MCP server | "Industry standard for component discovery" | Requires full Storybook adoption (explicitly out of scope per PROJECT.md); the MCP pattern is correct but we achieve it with a custom registry | Custom `registry.json` + llms.txt gives the same machine-readable context without the Storybook dependency |
| External registry (npm publish to use it) | "Real distribution" | npm publishing is explicitly deferred to a future milestone; premature distribution creates maintenance obligations | Keep registry as a file-system artifact; serve it from rialto-web as a static JSON endpoint |
| shadcn CLI registry format | "Compatibility with shadcn tooling" | shadcn registry format is designed for external component installation workflows; Rialto is a private monorepo package, not a component distribution service | Simple bespoke JSON schema that serves Rialto's actual needs (AI context) better than a distribution-optimized format |
| Figma plugin or design token sync | "Source of truth in Figma" | Adds Figma as a required tool; creates a sync problem (code vs design drift); out of scope for this milestone | CSS token variables are the source of truth; document them in llms.txt and spec files |

---

## Feature Dependencies

```
[A11y: axe-core tests in Vitest]
    └──requires──> [Vitest component test files (some already exist)]
    └──requires──> [vitest-axe package installed]

[A11y: WCAG AA color contrast]
    └──requires──> [Token-level audit of CSS custom properties]
    └──enhances──> [AI DX: Token audit CI script] (same token knowledge)

[A11y: Per-component a11y doc section]
    └──requires──> [A11y audit completed first] (can't document until issues are found and fixed)
    └──enhances──> [AI DX: Structured spec files] (a11y docs live inside spec files)

[Example Pages: Settings page]
    └──requires──> [A11y: form field labeling complete] (example pages must be accessible)
    └──requires──> [A11y: WCAG contrast fixes] (can't ship polished examples with contrast failures)

[Example Pages: Copy-this-page snippet]
    └──requires──> [Syntax highlighting library (Shiki)] (already researched in v1 — defer or reuse)

[AI DX: Component registry JSON]
    └──enhances──> [AI DX: llms.txt] (llms.txt links to registry for detail)
    └──enhances──> [AI DX: CLI scaffold] (scaffold uses registry to know available components)

[AI DX: llms.txt]
    └──requires──> [Example pages complete] (llms.txt should reference realistic examples, not toy demos)
    └──requires──> [A11y audit complete] (llms.txt must document accessible usage patterns)

[AI DX: CLI scaffold]
    └──requires──> [Example pages] (scaffold templates are the example pages)
    └──requires──> [Component registry] (scaffold reads registry to offer component choices)

[AI DX: Structured spec files]
    └──enhances──> [A11y: Per-component a11y docs] (same file, a11y is one section)
    └──enhances──> [AI DX: llms.txt] (llms-full.txt aggregates spec files)

[AI DX: Token audit CI script]
    └──requires──> [Rialto token names documented] (script needs the valid token list)
    └──enhances──> [A11y: WCAG contrast fixes] (ensures fixes propagate from tokens, not component overrides)
```

### Dependency Notes

- **A11y must precede example pages**: Example pages are the canonical Rialto usage reference — they must themselves be fully accessible or they teach AI tools to generate inaccessible code.
- **Example pages must precede llms.txt**: The llms.txt "full" file should reference working examples; writing it before examples exist means it documents placeholder patterns.
- **Registry feeds CLI**: The scaffold CLI should generate code that uses real component names and import paths from the registry. Building the registry first means the CLI doesn't hardcode component lists.
- **Spec files and a11y docs are the same work**: Write one `.spec.md` per component that includes both the API documentation and the a11y notes — not two separate deliverables.

---

## MVP Definition

### Launch With (v1.1) — Minimum to Satisfy Success Criterion

The success criterion is: AI produces correct, accessible Rialto code for "Build a settings page."

- [ ] A11y: WCAG AA audit complete + critical violations fixed — accessibility is non-negotiable for the claim
- [ ] A11y: axe-core assertions in component tests, running in CI — automated regression gate
- [ ] A11y: Focus management fixed on interactive components (dialogs, dropdowns, forms)
- [ ] Examples: Settings page example, polished and realistic — the explicit success criterion
- [ ] Examples: Dashboard example — second most common pattern; validates component composition
- [ ] Examples: Full form with all validation states — validates form component coverage
- [ ] AI DX: Component registry JSON (`packages/rialto/registry.json`) — machine-readable component catalog
- [ ] AI DX: llms.txt at repo root (overview + full) — AI tool discovery
- [ ] AI DX: CLAUDE.md updated with Rialto usage section — ensures every Claude session has context

### Add After Core (v1.1 Polish)

- [ ] AI DX: CLI scaffold command (`mbe new`) — high value but not required for AI success criterion
- [ ] AI DX: Structured spec files per component — significant writing work; do for top 20 most-used components first
- [ ] A11y: Per-component a11y doc in showcase — write after audit is complete
- [ ] Examples: Multi-state page flows (empty → loading → populated) — valuable but tertiary

### Future Consideration (v1.2+)

- [ ] AI DX: Token audit CI script — good prevention; low urgency until external devs use Rialto
- [ ] A11y: WCAG 2.2 specific criteria (focus appearance sizing) — after 2.1 AA is solid
- [ ] Examples: Mobile / responsive example page — after core desktop patterns are established

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| A11y: WCAG AA color contrast fixes | HIGH | MEDIUM | P1 |
| A11y: Keyboard focus indicators | HIGH | MEDIUM | P1 |
| A11y: ARIA on interactive components | HIGH | MEDIUM | P1 |
| A11y: axe-core CI gate | HIGH | LOW | P1 |
| Examples: Settings page (success criterion) | HIGH | MEDIUM | P1 |
| Examples: Dashboard example | HIGH | MEDIUM | P1 |
| AI DX: Component registry JSON | HIGH | MEDIUM | P1 |
| AI DX: llms.txt (overview + full) | HIGH | LOW | P1 |
| AI DX: CLAUDE.md Rialto section | HIGH | LOW | P1 |
| Examples: Full form + validation states | MEDIUM | MEDIUM | P2 |
| A11y: Focus management (dialogs/dropdowns) | HIGH | MEDIUM | P1 |
| A11y: Per-component a11y docs in showcase | MEDIUM | MEDIUM | P2 |
| AI DX: CLI scaffold command | MEDIUM | MEDIUM | P2 |
| AI DX: Structured spec files (top 20 components) | MEDIUM | HIGH | P2 |
| Examples: Multi-state page flows | MEDIUM | MEDIUM | P2 |
| Examples: Copy-this-page code snippet | MEDIUM | LOW | P2 |
| AI DX: Token audit CI script | LOW | MEDIUM | P3 |
| A11y: WCAG 2.2 specific criteria | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1 milestone
- P2: Should have in v1.1, add after P1 is solid
- P3: Future milestone

---

## Reference Analysis

These systems informed the feature landscape (confidence noted):

| Feature | Nord Design System | Carbon (IBM) | Atlassian | Rialto v1.1 Approach |
|---------|--------------------|--------------|-----------|----------------------|
| llms.txt | Yes — `/llms.txt` + `/llms-full.txt`, ~5K and ~1M tokens | No | No | Yes — same two-file approach |
| Component registry | Via Storybook manifest | Yes — JSON | Yes — JSON | Custom `registry.json` without Storybook dependency |
| a11y docs per component | Yes | Yes — detailed WCAG references | Yes | Yes — inside spec files |
| Example page patterns | Limited | Yes — full dashboard/form patterns | Yes — product-level patterns | Yes — settings + dashboard + form |
| CLI scaffold | No | No | No | Yes — `mbe new` extends existing CLI |
| axe-core CI | Yes | Yes | Yes | Yes — vitest-axe |
| Per-component spec files | Informal | Via Storybook stories | Via Atlaskit docs | Markdown spec files |

---

## Sources

- [LLMs.txt — Nord Design System](https://nordhealth.design/ai/llms-txt/) — MEDIUM confidence (official docs, direct inspection)
- [Expose Your Design System to LLMs — Hardik Pandya](https://hvpandya.com/llm-design-systems) — MEDIUM confidence (practitioner writeup, verified against our constraints)
- [shadcn Registry Getting Started](https://ui.shadcn.com/docs/registry/getting-started) — HIGH confidence (official docs)
- [vitest-axe — GitHub](https://github.com/chaance/vitest-axe) — HIGH confidence (official source)
- [Preparing a Design System for Accessibility — Design Systems Collective](https://www.designsystemscollective.com/preparing-a-design-system-for-accessibility-af9e51015d9c) — MEDIUM confidence (practitioner article)
- [Accessibility Testing for Design System Components — VA.gov](https://design.va.gov/accessibility/accessibility-testing-for-design-system-components) — HIGH confidence (government design system, authoritative)
- [Axe-core — Deque](https://www.deque.com/axe/axe-core/) — HIGH confidence (official tool documentation)
- [Carbon Design System Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) — HIGH confidence (IBM official docs, direct inspection)
- [Supercharge Your Design System with LLMs and Storybook MCP — Codrops](https://tympanus.net/codrops/2025/12/09/supercharge-your-design-system-with-llms-and-storybook-mcp/) — MEDIUM confidence (industry article, Storybook MCP approach noted but not adopted)
- [Design Systems And AI: Why MCP Servers Are The Unlock — Figma Blog](https://www.figma.com/blog/design-systems-ai-mcp/) — MEDIUM confidence (Figma official blog)
- Existing codebase: `packages/rialto/`, `apps/rialto-web/`, `tools/cli/`, `CLAUDE.md` — HIGH confidence (direct inspection)

---

*Feature research for: Rialto v1.1 — Accessibility, Example Pages, AI Developer Experience*
*Researched: 2026-03-22*
