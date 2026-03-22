# Requirements: mattbutlerengineering v1.1

**Defined:** 2026-03-22
**Core Value:** Every web app uses Rialto as the single design system and is accessible at mattbutlerengineering.com

## v1.1 Requirements

Requirements for milestone v1.1: Rialto Accessibility & AI DX.

### Accessibility

- [ ] **A11Y-01**: All components meet WCAG AA color contrast (4.5:1 text, 3:1 UI controls) via token-level audit
- [ ] **A11Y-02**: All interactive components have visible `:focus-visible` keyboard focus indicators
- [ ] **A11Y-03**: All interactive components have correct ARIA roles, labels, and state attributes
- [ ] **A11Y-04**: Every component has an axe-core assertion in Vitest CI (`toHaveNoViolations`)
- [ ] **A11Y-05**: Keyboard navigation follows logical DOM order with no keyboard traps
- [ ] **A11Y-06**: Dynamic content changes use `aria-live` regions for screen reader announcements
- [ ] **A11Y-07**: Every form input has an associated visible or screen-reader-accessible label
- [ ] **A11Y-08**: Dialog, Drawer, and ConfirmDialog return focus to trigger element on close
- [ ] **A11Y-09**: Each component has a11y documentation in showcase (keyboard shortcuts, ARIA, screen reader behavior)
- [ ] **A11Y-10**: Contrast ratios verified and fixed at design token level, not per-component CSS

### Example Pages

- [ ] **EXMP-01**: Dashboard example page with KPI cards, DataTable, Badge, and Stat in realistic combination
- [ ] **EXMP-02**: Settings page example with Form, Input, Select, Toggle, Button in sectioned layout
- [ ] **EXMP-03**: Full form example with all validation states (default, focused, error, disabled, loading)
- [ ] **EXMP-04**: All component states shown in context (not isolated) within example pages
- [ ] **EXMP-05**: Examples use realistic content and data shapes (not Lorem ipsum or test data)
- [ ] **EXMP-06**: Each example page has a copy-to-clipboard button with the full page JSX
- [ ] **EXMP-07**: Annotated composition patterns explain why components are combined
- [ ] **EXMP-08**: Multi-state page flows showing empty → loading → populated for same layout

### AI Developer Experience

- [ ] **AIDX-01**: Component registry JSON at `packages/rialto/registry.json` with name, description, props, import path, examples
- [ ] **AIDX-02**: Two-tier llms.txt at repo root: overview (<20KB) + full (complete component API + patterns)
- [ ] **AIDX-03**: CLAUDE.md updated with Rialto usage section (imports, tokens, provider setup, top components)
- [ ] **AIDX-04**: CLI scaffold command (`mbe new`) creates app skeleton with RialtoProvider, layout, example page
- [ ] **AIDX-05**: Structured spec files (`.spec.md`) for top 20 most-used components with anatomy, tokens, props, states
- [ ] **AIDX-06**: Registry served as static JSON from rialto-web at `/rialto/registry.json`

## Future Requirements

Deferred to future milestones.

### Accessibility

- **A11Y-F01**: WCAG 2.2 specific criteria (2.4.11 Focus Appearance min focus ring size, 2.5.3 Label in Name)
- **A11Y-F02**: Full manual screen reader testing guide with platform-specific notes (VoiceOver, NVDA)

### AI Developer Experience

- **AIDX-F01**: Token audit CI script that blocks hardcoded hex values and suggests correct Rialto tokens
- **AIDX-F02**: AI-readable frontmatter annotations on example pages (components_used, patterns, when_to_use)

### Distribution

- **DIST-F01**: Publish @mbe/rialto to npm for external consumption
- **DIST-F02**: External developer onboarding documentation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Storybook / Storybook MCP server | Custom showcase (rialto-web) already exists; Storybook is explicitly out of scope |
| AAA compliance | WCAG AAA conflicts with normal design aesthetics; AA is the standard bar |
| Accessibility overlay / widget | Condemned by a11y community; fix components instead |
| Interactive prop editor (knobs) | High complexity; conflicts with "show realistic usage" goal |
| Auto-generated prop tables from TypeScript | Mechanical output; hand-written examples more useful for humans and AI |
| shadcn CLI registry format | Designed for external distribution; Rialto is monorepo-only |
| Figma plugin / design token sync | Adds Figma as required tool; out of scope for this milestone |
| npm publishing | Deferred to future milestone; monorepo-only for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| A11Y-01 | — | Pending |
| A11Y-02 | — | Pending |
| A11Y-03 | — | Pending |
| A11Y-04 | — | Pending |
| A11Y-05 | — | Pending |
| A11Y-06 | — | Pending |
| A11Y-07 | — | Pending |
| A11Y-08 | — | Pending |
| A11Y-09 | — | Pending |
| A11Y-10 | — | Pending |
| EXMP-01 | — | Pending |
| EXMP-02 | — | Pending |
| EXMP-03 | — | Pending |
| EXMP-04 | — | Pending |
| EXMP-05 | — | Pending |
| EXMP-06 | — | Pending |
| EXMP-07 | — | Pending |
| EXMP-08 | — | Pending |
| AIDX-01 | — | Pending |
| AIDX-02 | — | Pending |
| AIDX-03 | — | Pending |
| AIDX-04 | — | Pending |
| AIDX-05 | — | Pending |
| AIDX-06 | — | Pending |

**Coverage:**
- v1.1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
