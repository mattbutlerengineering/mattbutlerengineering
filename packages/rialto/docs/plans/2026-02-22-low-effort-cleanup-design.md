# Low-Effort Cleanup: Header Consolidation + Deep Linkable Docs

## Date: 2026-02-22

---

## Task 1: Dashboard Header Consolidation

### Finding

Sign In/Sign Up use `AuthLayout` — a centered card layout with logotype. This is fundamentally different from the Dashboard's page header. No consolidation needed between auth pages and dashboard.

However, the Dashboard's inline header (~40 lines of JSX + ~65 lines of CSS) duplicates what the existing `PageHeader` component already provides: breadcrumbs, title, meta elements, and atmospheric dark surface styling.

### Approach

Refactor `src/pages/dashboard/Dashboard.tsx` to use `<PageHeader>` instead of the inline header. Pass:

- `breadcrumbs`: Home > Telemetry > Dashboard
- `title`: "Pit Wall"
- `meta`: Badge (Live) + AvatarGroup
- `actions`: Back link

Remove the corresponding header CSS from `Dashboard.module.css`.

### Impact

- ~40 lines of JSX removed
- ~65 lines of CSS removed
- Consistent header pattern across all demo pages

---

## Task 2: Deep Linkable Doc Sections

### Current State

- 7 doc files, ~303 `###` headings, zero anchor IDs
- Consistent subsection pattern per component (When to Use, Props, States, Accessibility, WCAG Conformance, Common Mistakes, UX Patterns)

### Approach

Add `{#component-section}` anchor IDs to all headings in the 7 doc files:

- `##` component headings get `{#component-name}` (e.g., `{#card}`, `{#dialog}`)
- `###` subsections get `{#component-section}` (e.g., `{#card-when-to-use}`, `{#dialog-wcag-conformance}`)

### Naming Convention

- Kebab-case throughout
- Component name prefix to avoid collisions
- Section names derived from heading text (e.g., "When to Use" → `when-to-use`, "WCAG Conformance" → `wcag-conformance`)

### Impact

- Every component section is externally linkable
- AI assistants and docs can reference specific sections by URL fragment
