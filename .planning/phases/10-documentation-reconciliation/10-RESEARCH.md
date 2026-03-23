# Phase 10: Documentation Reconciliation & llms-full.txt Fix — Research

**Researched:** 2026-03-23
**Domain:** Documentation correctness — YAML frontmatter, prop API accuracy in AI reference files, CLAUDE.md verification
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| A11Y-03 | All interactive components have correct ARIA roles, labels, and state attributes | Implemented in 06-02; 06-02-SUMMARY missing `requirements-completed` frontmatter — documentation gap only |
| A11Y-04 | Every component has an axe-core assertion in Vitest CI (`toHaveNoViolations`) | Implemented in 06-02 (63 assertions, all 58 dirs); 06-02-SUMMARY missing frontmatter |
| A11Y-05 | Keyboard navigation follows logical DOM order with no keyboard traps | Implemented in 06-03 (Drawer + CommandPalette Tab-wrap); 06-03-SUMMARY missing frontmatter |
| A11Y-07 | Every form input has an associated visible or screen-reader-accessible label | Implemented in 06-02 (axe-core catches missing labels, CommandPalette aria-label added); 06-02-SUMMARY missing frontmatter |
| A11Y-08 | Dialog, Drawer, and ConfirmDialog return focus to trigger element on close | Implemented in 06-03 (triggerRef pattern in all 7 overlay components); 06-03-SUMMARY missing frontmatter |
| AIDX-02 | Two-tier llms.txt at repo root: overview (<20KB) + full (complete component API + patterns) | Files exist and content is correct except 3 overlay components have stale prop names in llms-full.txt; needs prop name corrections + frontmatter claim |
| AIDX-03 | CLAUDE.md updated with Rialto usage section (imports, tokens, provider setup, top components) | CLAUDE.md Rialto section exists and is accurate per audit; needs formal verification against source |
</phase_requirements>

---

## Summary

Phase 10 is a pure documentation reconciliation phase — no new code is written and no new features are implemented. All seven requirements assigned to this phase were addressed by implementation work in Phase 06 and Phase 08, but were not properly registered in the documentation trail.

The work divides into three parallel tracks: (1) adding missing `requirements-completed` frontmatter to 06-02-SUMMARY.md and 06-03-SUMMARY.md, (2) correcting stale prop names in llms-full.txt and llms.txt for three overlay components (Drawer, ConfirmDialog, Popover), and (3) formally verifying the CLAUDE.md Rialto section against current component source.

**Primary recommendation:** Treat all three tracks as mechanical edits with no judgment calls required — the correct prop names are already known from reading source files, the SUMMARY files already contain the implementation evidence, and the CLAUDE.md section has already been audited as accurate.

---

## Standard Stack

### Core — No new dependencies

This phase introduces zero new packages. All work is file edits to existing documentation.

| File | Format | Edit Type |
|------|--------|-----------|
| `.planning/phases/06-accessibility-foundation/06-02-SUMMARY.md` | YAML frontmatter + Markdown | Add `requirements-completed` field |
| `.planning/phases/06-accessibility-foundation/06-03-SUMMARY.md` | YAML frontmatter + Markdown | Add `requirements-completed` field |
| `llms-full.txt` | Markdown reference doc | Correct 3 overlay prop names |
| `llms.txt` | Markdown reference doc | Correct 3 overlay prop names (must stay in sync with llms-full.txt) |
| `CLAUDE.md` | Markdown instructions | Verify Rialto section accuracy (may be no-op if correct) |

---

## Architecture Patterns

### SUMMARY.md Frontmatter Pattern

All SUMMARY files use YAML frontmatter (between `---` delimiters). The `requirements-completed` field is an array of requirement IDs. Only 06-01 (added `A11Y-01, A11Y-10`), 06-04 (added `A11Y-06`), and 06-05 (added `A11Y-02`) currently have this field. Plans 06-02 and 06-03 are missing it despite implementing the requirements.

**The correct pattern (source: 06-01-SUMMARY.md line 46):**
```yaml
requirements-completed: [A11Y-01, A11Y-10]
```

**06-02-SUMMARY.md needs:**
```yaml
requirements-completed: [A11Y-03, A11Y-04, A11Y-07]
```
Evidence from audit: A11Y-03 (ARIA roles/labels — CommandPalette aria-labels fixed), A11Y-04 (63 `toHaveNoViolations` assertions covering all 58 dirs), A11Y-07 (axe-core catches label violations; CommandPalette search input got `aria-label="Search commands"`).

**06-03-SUMMARY.md needs:**
```yaml
requirements-completed: [A11Y-05, A11Y-08]
```
Evidence from audit: A11Y-05 (Drawer + CommandPalette Tab-wrap focus traps), A11Y-08 (triggerRef pattern in all 7 overlay components: Dialog, Drawer, ConfirmDialog, DropdownMenu, CommandPalette, Popover, ContextMenu).

### llms-full.txt Prop Name Corrections

**Confirmed actual prop names from source files (HIGH confidence — read directly):**

| Component | Stale (llms-full.txt) | Correct (source) | File |
|-----------|----------------------|-----------------|------|
| Drawer | `open`, `onOpenChange`, `placement` | `open`, `onClose`, `title`, `side`, `size` | `Drawer.tsx` line 18–30 |
| ConfirmDialog | `open`, `onOpenChange`, `title`, `variant` | `open`, `onConfirm`, `onCancel`, `title`, `variant` | `ConfirmDialog.tsx` line 53–66 |
| Popover | `open`, `onOpenChange`, `content`, `placement` | `trigger`, `title`, `children`, `placement` (self-controlled — no `open`/`onOpenChange`) | `Popover.tsx` line 29–39 |

**Key distinction for Popover:** Popover is UNCONTROLLED — it manages its own `open` state internally via `useState`. There is no `open` or `onOpenChange` prop exposed to consumers. The correct consumer-facing props are `trigger` (the ReactElement that opens it), `title` (optional header), `children` (body content), and `placement` (`"top" | "bottom" | "left" | "right"`, default `"bottom"`).

**Correct llms-full.txt Overlay table row (verified against source):**
```
| Drawer         | Slide-out edge panel              | `open`, `onClose`, `title`, `side`, `size`    |
| ConfirmDialog  | Pre-built confirmation modal      | `open`, `onConfirm`, `onCancel`, `title`, `variant` |
| Popover        | Positioned floating content       | `trigger`, `children`, `placement`, `title`   |
```

**Code examples in llms-full.txt that must be corrected:**

The "Settings panel" composition example (lines 386–401) uses:
```tsx
<Drawer open={isOpen} onOpenChange={setOpen} title="Settings" placement="right">
```
Correct version:
```tsx
<Drawer open={isOpen} onClose={() => setOpen(false)} title="Settings" side="right">
```

The "Confirmation flow" composition example (lines 407–414) uses:
```tsx
<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  ...
  variant="danger"
/>
```
Correct version:
```tsx
<ConfirmDialog
  open={showConfirm}
  onConfirm={handleConfirm}
  onCancel={() => setShowConfirm(false)}
  ...
  variant="destructive"
/>
```
Note: `variant="danger"` is also wrong — the correct value is `"destructive"` per `ConfirmDialogProps` line 64.

**llms.txt Overlay table corrections needed:**

| Component | Stale | Correct |
|-----------|-------|---------|
| ConfirmDialog | `open`, `onOpenChange`, `title`, `variant` | `open`, `onConfirm`, `onCancel`, `title`, `variant` |
| Drawer | `open`, `onOpenChange`, `placement` | `open`, `onClose`, `title`, `side`, `size` |
| Popover | `open`, `onOpenChange`, `content`, `placement` | `trigger`, `children`, `placement`, `title` |

Note: `llms.txt` Dialog row correctly shows `onClose` already. Only the three above rows need updating in llms.txt.

### CLAUDE.md Rialto Section Verification

The audit (v1.1-MILESTONE-AUDIT.md line 25) states: "CLAUDE.md Rialto section exists and is accurate (Dialog onClose correct), but has not been formally verified."

Current CLAUDE.md Rialto section (in system context) documents:
- `Dialog`: `open`, `onClose` — CORRECT per Dialog.tsx
- `Drawer`: Not listed in CLAUDE.md's top-10 table — CORRECT (only top 10 listed)
- `Toggle`: `label`, `checked`, `onChange`, `disabled` — needs spot-check
- `Select`: `label`, `options`, `placeholder`, `value`, `onChange` — needs spot-check
- `Stack.justify`: documents `"between"` not `"space-between"` — CORRECT per STATE.md decision

The planner should verify 3–4 component APIs from the top-10 table against source, then confirm the CLAUDE.md section is accurate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discovering which requirements 06-02 and 06-03 addressed | Re-reading all plan files | Audit file at `.planning/v1.1-MILESTONE-AUDIT.md` | Audit already cross-referenced everything — findings are authoritative |
| Deciding correct prop names | Guessing from memory or docs | Reading component `.tsx` source files directly | Source is ground truth; llms-full.txt got it wrong precisely from stale knowledge |

---

## Common Pitfalls

### Pitfall 1: Adding requirements to the wrong SUMMARY file

**What goes wrong:** A11Y-05 (keyboard navigation / no traps) might be attributed to 06-02 (axe-core) when it was actually implemented in 06-03 (focus management).

**How to avoid:** Map requirements to the plan that contained the implementation:
- 06-02 = axe-core coverage → A11Y-03, A11Y-04, A11Y-07
- 06-03 = focus management / key traps → A11Y-05, A11Y-08

**Source:** v1.1-MILESTONE-AUDIT.md lines 30–61 (explicit per-requirement evidence).

### Pitfall 2: Correcting llms-full.txt but not llms.txt

**What goes wrong:** llms-full.txt gets correct prop names but llms.txt Overlays table still shows `onOpenChange` — now the two files are inconsistent, breaking AIDX-02's "consistent" requirement.

**How to avoid:** Fix both files in the same commit. llms.txt overlay rows for Drawer, ConfirmDialog, and Popover all need the same corrections.

### Pitfall 3: Treating CLAUDE.md verification as a no-op without checking

**What goes wrong:** CLAUDE.md was written during Phase 08 and has not been formally verified. It might reference prop names that are also stale (e.g., if Toggle or Select APIs diverged).

**How to avoid:** Check each component in the "Top 10 Component APIs" table against its source `.tsx` file. Cross-reference STATE.md decisions (especially the `Stack justify="between"` fix and `EmptyState heading` prop).

### Pitfall 4: Confusing Dialog vs Drawer prop name

**What goes wrong:** Both Dialog and Drawer use `onClose` (correct). The confusion is that ONLY Drawer was stale in llms-full.txt — Dialog was already correct in llms.txt but ALSO stale in llms-full.txt.

**How to avoid:** Check both files for Dialog as well. In llms-full.txt line 90, Dialog shows `onOpenChange` — this also needs to be corrected to `onClose`.

---

## Code Examples

### SUMMARY frontmatter insert location

The `requirements-completed` field belongs inside the YAML frontmatter block (between the `---` delimiters), after the last existing key-value pair and before the closing `---`. See 06-01-SUMMARY.md for the established pattern.

**06-02-SUMMARY.md current last line of frontmatter (line 29):**
```yaml
  files_modified: 5
---
```

**After fix:**
```yaml
  files_modified: 5
requirements-completed: [A11Y-03, A11Y-04, A11Y-07]
---
```

**06-03-SUMMARY.md current last lines of frontmatter (lines 29–30):**
```yaml
  files_modified: 7
---
```

**After fix:**
```yaml
  files_modified: 7
requirements-completed: [A11Y-05, A11Y-08]
---
```

### Drawer correct usage example for llms-full.txt

```tsx
// Source: packages/rialto/src/components/Drawer/Drawer.tsx interface DrawerProps
<Drawer open={isOpen} onClose={() => setOpen(false)} title="Settings" side="right">
  <Stack direction="column" gap="lg">
    <Toggle label="Dark mode" checked={dark} onChange={setDark} />
    <Divider />
    <Button variant="primary">Save changes</Button>
  </Stack>
</Drawer>
```

### ConfirmDialog correct usage example for llms-full.txt

```tsx
// Source: packages/rialto/src/components/ConfirmDialog/ConfirmDialog.tsx interface ConfirmDialogProps
<ConfirmDialog
  open={showConfirm}
  onConfirm={handleDelete}
  onCancel={() => setShowConfirm(false)}
  title="Delete project?"
  description="This action cannot be undone. All data will be permanently removed."
  confirmLabel="Delete"
  variant="destructive"
/>
```

### Popover correct usage example for llms-full.txt

```tsx
// Source: packages/rialto/src/components/Popover/Popover.tsx interface PopoverProps
// Note: Popover is UNCONTROLLED — no open/onOpenChange props exist
<Popover trigger={<Button>Filter</Button>} placement="bottom" title="Filters">
  <Stack direction="column" gap="sm">
    <Select label="Status" options={statusOptions} />
    <Button variant="primary">Apply</Button>
  </Stack>
</Popover>
```

---

## State of the Art

| Old (llms-full.txt) | Correct (source) | When Changed | Impact |
|---------------------|-----------------|--------------|--------|
| `Drawer onOpenChange` | `Drawer onClose` | Phase 06-03 (focus mgmt) | AI-generated Drawer code fails TypeScript compilation |
| `ConfirmDialog onOpenChange` | `ConfirmDialog onConfirm` + `onCancel` | Phase 06-03 | AI code fails TS; no way to wire confirm handler separately |
| `Popover open`, `onOpenChange`, `content` | `Popover trigger`, `children`, `placement` | Phase 06-02 (cloneElement refactor) | AI code fails TS; Popover is uncontrolled — these props don't exist |
| `ConfirmDialog variant="danger"` | `variant="destructive"` | Phase 06 initial implementation | Wrong variant value silently falls through to default styling |
| `Dialog onOpenChange` (llms-full.txt) | `Dialog onClose` | Phase 06-03 | AI-generated Dialog code fails TS |

---

## Open Questions

1. **Does Dialog also need fixing in llms-full.txt?**
   - What we know: llms.txt already has `onClose` for Dialog (correct). llms-full.txt Overlays table line 90 shows `onOpenChange` for Dialog.
   - What's unclear: Was this identified in the audit or is it a new finding?
   - Recommendation: Fix Dialog in llms-full.txt too — consistent with findings. Read line 90 of llms-full.txt during planning to confirm.

2. **Should 08-02-SUMMARY.md also get `requirements-completed` frontmatter for AIDX-02 and AIDX-03?**
   - What we know: The audit flags AIDX-02 and AIDX-03 as "unsatisfied" partly because 08-02-SUMMARY has no `requirements-completed` frontmatter.
   - What's unclear: Phase 10's scope description says "formally verify CLAUDE.md Rialto section" — implying AIDX-03 gets closed here. If AIDX-02 is also closed by the llms-full.txt fix in Phase 10, the 08-02-SUMMARY frontmatter could be updated here.
   - Recommendation: Update 08-02-SUMMARY.md `requirements-completed: [AIDX-02, AIDX-03]` in this phase as part of closing out those requirements. This is purely additive frontmatter — no content changes needed.

---

## Sources

### Primary (HIGH confidence)

- Direct read of `packages/rialto/src/components/Drawer/Drawer.tsx` — `DrawerProps` interface confirmed: `open`, `onClose`, `title`, `description`, `children`, `footer`, `side`, `size`
- Direct read of `packages/rialto/src/components/ConfirmDialog/ConfirmDialog.tsx` — `ConfirmDialogProps` interface confirmed: `open`, `onConfirm`, `onCancel`, `title`, `description`, `confirmLabel`, `cancelLabel`, `variant`
- Direct read of `packages/rialto/src/components/Popover/Popover.tsx` — `PopoverProps` interface confirmed: `trigger`, `title`, `children`, `placement` (self-controlled, no `open`/`onOpenChange`)
- Direct read of `.planning/v1.1-MILESTONE-AUDIT.md` — audit findings for all 7 requirements
- Direct read of `.planning/phases/06-accessibility-foundation/06-02-SUMMARY.md` — missing `requirements-completed` confirmed
- Direct read of `.planning/phases/06-accessibility-foundation/06-03-SUMMARY.md` — missing `requirements-completed` confirmed
- Direct read of `.planning/phases/06-accessibility-foundation/06-VERIFICATION.md` — evidence for A11Y-03, A11Y-04, A11Y-05, A11Y-07, A11Y-08 all VERIFIED
- Direct read of `llms-full.txt` lines 86–98, 386–414 — stale prop names confirmed
- Direct read of `llms.txt` lines 104–111 — partial staleness confirmed

---

## Metadata

**Confidence breakdown:**
- SUMMARY frontmatter gaps: HIGH — source files read, audit confirms exact requirements per plan
- llms-full.txt prop corrections: HIGH — all three component interfaces read directly from source
- CLAUDE.md accuracy: HIGH — audit says "accurate"; STATE.md has recorded decisions confirming key props (Stack justify="between", Dialog onClose)
- Dialog in llms-full.txt: MEDIUM — strong inference from llms.txt having correct `onClose`, needs line 90 confirmation during planning

**Research date:** 2026-03-23
**Valid until:** Until any overlay component API changes — stable, no external dependencies
