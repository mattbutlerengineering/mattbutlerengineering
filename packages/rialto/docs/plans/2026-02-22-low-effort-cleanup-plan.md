# Low-Effort Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate Dashboard header to use PageHeader component, and add anchor IDs to all doc headings for deep linking.

**Architecture:** Two independent tasks. Task 1 is a refactor of `Dashboard.tsx` to replace ~40 lines of inline header with the existing `PageHeader` component, removing ~65 lines of now-unused CSS. Task 2 adds `{#component-section}` anchor IDs to all `##` and `###` headings across 7 doc files (~303 headings).

**Tech Stack:** React, CSS Modules, Markdown

---

### Task 1: Refactor Dashboard to use PageHeader

**Files:**

- Modify: `src/pages/dashboard/Dashboard.tsx:1-223`
- Modify: `src/pages/dashboard/Dashboard.module.css:1-76`

**Step 1: Update imports in Dashboard.tsx**

Replace the `Breadcrumb` import with `PageHeader`:

```tsx
// Remove this line:
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";

// Add this line:
import { PageHeader } from "../../components/PageHeader/PageHeader";
```

**Step 2: Replace inline header JSX (lines 184–223) with PageHeader**

Replace the entire `{/* ── Dark header */}` block with:

```tsx
{
  /* ── Dark header ─────────────────────── */
}
<PageHeader
  breadcrumbs={[
    { label: "Home", href: "/" },
    { label: "Telemetry", href: "#" },
    { label: "Dashboard" },
  ]}
  title="Pit Wall"
  meta={
    <Badge variant="success" dot size="sm">
      Live
    </Badge>
  }
  actions={
    <AvatarGroup
      size="sm"
      max={4}
      avatars={[
        { name: "Charles Leclerc", status: "online" },
        { name: "Lewis Hamilton", status: "online" },
        { name: "Race Engineer", status: "online" },
        { name: "Strategist", status: "away" },
        { name: "Team Principal" },
      ]}
    />
  }
/>;
```

Note: The "Back to Design System" link is already in the footer (line 525), so the duplicate in the header is removed.

**Step 3: Remove unused CSS from Dashboard.module.css**

Delete these selectors (lines 11–75):

- `.header` (the composes + padding)
- `.headerInner`
- `.atmosphere`
- `.grain`
- `.titleRow`
- `.heading`
- `.titleMeta`
- `.backLink` (and its `:hover` and `:focus-visible` variants)

Also delete the responsive overrides that reference removed classes:

- `.titleMeta` in the tablet media query (line 144-146)
- `.header` padding in the mobile media query (lines 151-154)
- `.heading` font-size in the mobile media query (lines 164-166)

**Step 4: Verify the build compiles**

Run: `npm run build`
Expected: No type errors, no CSS module warnings.

**Step 5: Visual check**

Run: `npm run dev`
Navigate to the Dashboard page. Verify:

- Dark header band renders with breadcrumbs, "Pit Wall" title, Live badge, and avatar group
- Responsive behavior still works (avatars hide on tablet, title shrinks on mobile)
- Footer "Back to Design System" link still works

**Step 6: Run existing tests**

Run: `npm test`
Expected: All 137+ tests pass. No regressions.

**Step 7: Commit**

```bash
git add src/pages/dashboard/Dashboard.tsx src/pages/dashboard/Dashboard.module.css
git commit -m "refactor: replace Dashboard inline header with PageHeader component"
```

---

### Task 2: Add anchor IDs to doc headings

**Files:**

- Modify: `docs/data-display.md`
- Modify: `docs/data-structure.md`
- Modify: `docs/feedback.md`
- Modify: `docs/form-fields.md`
- Modify: `docs/layout.md`
- Modify: `docs/navigation.md`
- Modify: `docs/overlays.md`

All 7 files follow the same pattern. This task can be parallelized across files.

**Anchor ID format:**

For `##` component headings:

```markdown
## Card {#card}

## Table {#table}
```

For `###` subsections:

```markdown
### When to Use {#card-when-to-use}

### When NOT to Use {#card-when-not-to-use}

### Props {#card-props}

### States {#card-states}

### Accessibility {#card-accessibility}

### WCAG Conformance {#card-wcag-conformance}

### Common Mistakes {#card-common-mistakes}

### UX Patterns {#card-ux-patterns}
```

For `####` sub-subsections under UX Patterns:

```markdown
#### Interaction Flow {#card-interaction-flow}

#### Content Guidelines {#card-content-guidelines}

#### Composition Examples {#card-composition-examples}

#### Edge Cases {#card-edge-cases}
```

**Naming rules:**

- Kebab-case everything
- Component name prefix on all `###` and `####` headings
- `##` headings get just the component name
- `## Quick Reference` → `{#quick-reference}` (no component prefix for section-level headings)
- "When NOT to Use" → `when-not-to-use`
- "WCAG Conformance" → `wcag-conformance`

**Step 1: Add anchors to each doc file**

Process each file: read it, add `{#anchor-id}` to every `##`, `###`, and `####` heading. Use the component name from the nearest preceding `##` heading as the prefix for `###` and `####` anchors.

This step should be parallelized — all 7 files are independent.

**Step 2: Verify markdown renders correctly**

Spot-check a few files to ensure the `{#id}` syntax doesn't break rendering. GitHub-flavored markdown supports this syntax natively.

**Step 3: Commit**

```bash
git add docs/data-display.md docs/data-structure.md docs/feedback.md docs/form-fields.md docs/layout.md docs/navigation.md docs/overlays.md
git commit -m "docs: add anchor IDs to all component doc headings for deep linking"
```

---

### Task 3: Update TODO.md

**Files:**

- Modify: `TODO.md`

**Step 1: Mark both items as done in the Priority 4 table**

Update the two rows:

- "Investigate 3 header examples" → add `✅` status and notes about the refactor
- "Make each doc section deep linkable" → add `✅` status and notes about anchor count

**Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark header consolidation and deep-linkable docs as done"
```
