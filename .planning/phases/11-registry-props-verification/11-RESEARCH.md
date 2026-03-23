# Phase 11: Registry Props & Phase 08 Verification - Research

**Researched:** 2026-03-23
**Domain:** Component registry JSON prop extraction, TypeScript Compiler API, phase verification documentation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIDX-01 | Component registry JSON at `packages/rialto/registry.json` with name, description, props, import path, examples | 49/90 components currently have empty `props` arrays. Root cause identified: Props interfaces are not exported from component files. Fix: add `export` to `interface ComponentNameProps` in 17 source files. This makes them visible to the TypeScript Compiler API's `getExportsOfModule` lookup in `generate-registry.ts`. |
| AIDX-04 | CLI scaffold command (`mbe new`) creates app skeleton with RialtoProvider, layout, example page | Implementation exists (`tools/cli/src/commands/new.ts`, 294 lines, `mbe new` + `mbe init` alias). Phase 08 SUMMARY confirms E2E verified. Needs formal VERIFICATION.md documenting evidence. |
| AIDX-06 | Registry served as static JSON from rialto-web at `/rialto/registry.json` | Implementation exists (prebuild script in `apps/rialto-web/package.json`, CI drift check in `ci.yml`). Needs formal VERIFICATION.md documenting evidence. |
</phase_requirements>

---

## Summary

Phase 11 has two distinct workstreams. The first fixes actual implementation gaps: 49 of 90 components in `registry.json` have empty `props` arrays because their Props interfaces are declared as `interface ComponentNameProps` (unexported) rather than `export interface ComponentNameProps`. The TypeScript Compiler API's `getExportsOfModule` call in `generate-registry.ts` only sees exported symbols — unexported interfaces are invisible. Fixing this requires adding `export` to Props interface declarations in 17 component source files, then regenerating `registry.json` and verifying CI drift check still passes.

The second workstream creates the missing Phase 08 VERIFICATION.md. The v1.1 milestone audit found that all three Phase 08 plans (08-01, 08-02, 08-03) were completed but never formally verified. AIDX-01, AIDX-04, and AIDX-06 are all in "partial" status (SUMMARY frontmatter claims completion but no VERIFICATION.md exists). The audit concluded implementations exist; they just lack formal verification evidence. The Phase 08 VERIFICATION.md must document observable truths with file-level evidence for each requirement.

**Primary recommendation:** Fix the 17 component files to export their Props interfaces, regenerate `registry.json`, then write Phase 08 VERIFICATION.md documenting what was already built in Phase 08.

---

## Root Cause Analysis: Empty Props Arrays

### Why 49 Components Have No Props

The `generate-registry.ts` script identifies component Props by name convention: for a component named `Foo`, it looks for an exported symbol named `FooProps` among the module's exports:

```typescript
// From packages/rialto/scripts/generate-registry.ts, lines 108-109
const propsTypeName = `${name}Props`;
const propsSymbol = exports.find((e) => e.getName() === propsTypeName);
```

`exports` here is the result of `checker.getExportsOfModule(moduleSymbol)` — **only exported symbols appear**. If `FooProps` is declared as a non-exported `interface`, the lookup returns `undefined` and props is an empty array.

### Categories of Empty-Props Components

**Category 1: Non-exported Props interface — 23 components in 17 files (FIXABLE)**

These have Props interfaces declared with `interface ComponentNameProps` (no `export` keyword). Fix: add `export` to the interface declaration, then add `export type { ComponentNameProps }` is not needed — just `export interface ComponentNameProps` is sufficient since `generate-registry.ts` looks at module exports.

| File | Components to Fix |
|------|-------------------|
| `src/components/Alert/Alert.tsx` | Alert |
| `src/components/Breadcrumb/Breadcrumb.tsx` | Breadcrumb |
| `src/components/Checkbox/Checkbox.tsx` | Checkbox, Radio, RadioGroup |
| `src/components/CommandPalette/CommandPalette.tsx` | CommandPalette |
| `src/components/DisabledTooltip/DisabledTooltip.tsx` | DisabledTooltip |
| `src/components/Divider/Divider.tsx` | Divider |
| `src/components/Drawer/Drawer.tsx` | Drawer |
| `src/components/DropdownMenu/DropdownMenu.tsx` | DropdownMenu |
| `src/components/Kbd/Kbd.tsx` | Kbd, Shortcut |
| `src/components/NumberInput/NumberInput.tsx` | NumberInput |
| `src/components/Pagination/Pagination.tsx` | Pagination |
| `src/components/Popover/Popover.tsx` | Popover |
| `src/components/Skeleton/Skeleton.tsx` | Skeleton, SkeletonGroup |
| `src/components/Steps/Steps.tsx` | Steps |
| `src/components/Tag/Tag.tsx` | Tag, TagGroup, AnimatedTag |
| `src/components/TextArea/TextArea.tsx` | TextArea |
| `src/components/Timeline/Timeline.tsx` | Timeline |

Note: `AnimatedTag` is defined as `interface AnimatedTagProps extends TagProps` — `TagProps` must be exported first. The `extends` chain will work once `TagProps` is exported, since `getProperties()` on an interface returns all properties including inherited ones from non-generic bases.

`TextArea` uses `interface TextAreaProps extends Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, ...>`. Once exported, the TS Compiler API will resolve `Pick<>` to its concrete property set — only the explicitly picked props will appear in the output, which is correct behavior (no HTML prop pollution).

**Category 2: Generic type parameter — 1 component (Table only, scope-limited fix)**

`TableProps<T>` is generic. The TS Compiler API cannot resolve a generic type without a concrete type argument. The current `generate-manifest.ts`/`generate-registry.ts` architecture does not support generics.

For `Table`, the props must be manually annotated in `registry.json` after generation via a manual-overrides mechanism, OR `TableProps` can be exported with `unknown` substituted for `T` in the Props declaration for registry purposes. The simplest approach: add a non-generic `export interface TableProps` that duplicates the props with `unknown` for T-dependent fields. This is the minimum viable fix.

**Category 3: Sub-component types — 24 components (out of scope for this phase)**

These are type aliases, plain objects, or inline function props for helper sub-components (`TimelineEvent`, `ToastProvider`, `BreadcrumbItem`, `TreeNode`, `UIEnvironment`, `VibeName`, `VibeOverrides`, etc.). They are not React components in the traditional sense or their types are defined as inline object types rather than named interfaces. These are architecture-level changes beyond the scope of this phase. The phase success criteria call out only Table, Drawer, Checkbox, TextArea, and "other frequently used components" — focus on Category 1 fixes.

### Side Effect: Bloated Props from HTML Inheritance

26 components currently have 277–313 props because their exported Props interfaces extend HTML element props (e.g., `ButtonProps extends Pick<ButtonHTMLAttributes<>, ...>` resolves to all picked HTML attrs). These are working — they appear in the registry. The question is whether this is desirable for AI consumption. The phase success criteria do not ask to fix this, so it is explicitly out of scope for Phase 11.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` (compiler API) | ^5.9.3 | Extract Props via `getExportsOfModule` | Already used in `generate-registry.ts` — no new dep |
| `tsx` | ^4.19.0 | Run `generate-registry.ts` directly | Already used via `pnpm build:registry` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `git diff --exit-code` | git built-in | CI drift check for `registry.json` | Already wired in `.github/workflows/ci.yml` |

**No new dependencies required for any part of Phase 11.**

---

## Architecture Patterns

### Pattern 1: Exporting Props Interface

**What:** Add `export` keyword to `interface ComponentNameProps` declarations.

**Why it works:** The `generate-registry.ts` script calls `checker.getExportsOfModule(moduleSymbol)` to enumerate all symbols exported from the barrel entry point. A non-exported interface is only reachable via the component function's type parameters — not as a named export. Adding `export` to the interface makes it available as a named export that `getExportsOfModule` can find.

**Example:**
```typescript
// Before (not found by generate-registry.ts):
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  // ...
}

// After (found by generate-registry.ts):
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  // ...
}
```

**For TextArea (extends Pick<>):** The same fix works. Once `TextAreaProps` is exported, `checker.getDeclaredTypeOfSymbol(propsResolved).getProperties()` resolves the `Pick<>` to its concrete properties. Only the picked fields appear — no full HTML interface pollution.

**For AnimatedTag (extends TagProps):** Export `TagProps` first, then `AnimatedTagProps extends TagProps` works naturally. The compiler resolves the inheritance chain.

### Pattern 2: Registry Regeneration + CI Validation

After fixing Props exports in source files, the registry must be regenerated and committed:

```bash
cd packages/rialto
pnpm build:registry
# Verify output:
node -e "const r=require('./registry.json'); console.log('Empty:', r.components.filter(c=>!c.props.length).map(c=>c.name).join(', '))"
```

The CI drift check in `.github/workflows/ci.yml` is already wired — it regenerates and fails if the committed version diverges.

### Pattern 3: Phase 08 VERIFICATION.md Structure

**What:** A `08-VERIFICATION.md` written in `.planning/phases/08-ai-developer-experience/` documenting observable truths for AIDX-01, AIDX-04, and AIDX-06.

**Structure to follow:** Match Phase 06's `06-VERIFICATION.md` format — frontmatter with `phase`, `verified`, `status`, `score`; Observable Truths table; Required Artifacts table; Requirements Coverage section.

**Content sources for each requirement:**

| Requirement | Evidence Already in Codebase |
|-------------|------------------------------|
| AIDX-01 | `packages/rialto/registry.json` exists, 90 components, `importPath: "@mbe/rialto"` on all; `packages/rialto/scripts/generate-registry.ts` exists; CI step "Check registry.json is up to date" in `ci.yml` |
| AIDX-04 | `tools/cli/src/commands/new.ts` exists (294 lines); `mbe new` + `mbe init` alias registered in `tools/cli/src/index.ts`; scaffolds 9 files in `apps/<name>/`; port auto-detection implemented |
| AIDX-06 | `apps/rialto-web/package.json` has `prebuild: cp ../../packages/rialto/registry.json public/registry.json`; `apps/rialto-web/.gitignore` excludes `public/registry.json`; CF Pages serves at `/rialto/registry.json` |

Note: AIDX-02 and AIDX-03 are marked "unsatisfied" in the audit because `08-02-SUMMARY.md` has missing `requirements-completed` frontmatter. The VERIFICATION.md should cover AIDX-01, AIDX-04, AIDX-06 (the Phase 11 requirements). AIDX-02 and AIDX-03 are outside Phase 11's scope per the phase description — the Phase 11 description says "Phase 08 Verification" for AIDX-01, AIDX-04, AIDX-06 specifically.

### Anti-Patterns to Avoid

- **Modifying `generate-registry.ts` to scan for non-exported interfaces:** This would work technically (scan AST nodes rather than just exports) but it changes the contract — generated Props would no longer be guaranteed to be the component's public API. Exporting the interfaces is the correct fix.
- **Hand-editing `registry.json` directly for the 23 non-generic components:** Defeats the purpose of the generation pipeline and will be overwritten by `pnpm build:registry`. Only use hand-editing or manual overrides for Table (the genuinely generic case).
- **Fixing all 49 empty-props components in one phase:** Sub-component types (Category 3) are not addressable without architecture changes. Scope to Category 1 (export fix) + Table (Category 2).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Props extraction | Custom AST walker | TypeScript Compiler API via existing `generate-registry.ts` | Already working for exported Props; fix is additive (export keyword) not architectural |
| CI freshness check | Custom diff script | Existing `git diff --exit-code` step in `ci.yml` | Already wired from Phase 08 |
| VERIFICATION.md content | New investigation | Grep and file existence checks against Phase 08 work | Implementation exists; verification is documentation of evidence, not re-implementation |

---

## Common Pitfalls

### Pitfall 1: Exporting Props Pollutes Public API with Internal Types

**What goes wrong:** Exporting `DrawerProps`, `CheckboxProps`, etc. means they are now importable by consumers: `import type { DrawerProps } from "@mbe/rialto"`. This is actually desirable for a component library (TypeScript consumers expect to import prop types) and matches the pattern already established by `ButtonProps`, `DialogProps`, `SelectProps`, etc.

**Why it happens:** Hesitation to change public API surface.

**How to avoid:** This is not a problem — it is the correct pattern. The existing working components (`Button`, `Dialog`, `Select`, `Collapsible`, etc.) already export their Props interfaces. Fixing the remaining 17 files makes the library consistent.

### Pitfall 2: TextArea Props Explosion After Export Fix

**What goes wrong:** Exporting `TextAreaProps` which `extends Pick<TextareaHTMLAttributes<>, ...>` might result in all resolved HTML attributes appearing in the registry (similar to the 277+ props problem in `Badge`, `Stack`, etc.).

**Why it won't happen:** `Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder" | "disabled" | "rows" | ...>` picks only 10 specific fields. The TypeScript Compiler API's `getProperties()` returns only the selected members of a `Pick<>`. Verify after regeneration that `TextArea` has approximately 10-18 props, not 277+.

**Warning signs:** `TextArea` shows 200+ props in registry after fix.

### Pitfall 3: AnimatedTag / TagProps Inheritance Chain Breaks

**What goes wrong:** `AnimatedTagProps extends TagProps` — if `TagProps` is exported but the compiler resolves `AnimatedTagProps` to include all of `TagProps`'s properties PLUS its own additions, the result is correct. But if `TagProps` itself extends something that generates noise, that noise propagates.

**How to avoid:** Verify `Tag` and `AnimatedTag` prop counts after regeneration. Expect `Tag` to have ~8-10 props, `AnimatedTag` to have `TagProps` + 1-2 animation extras.

### Pitfall 4: Table Generic Cannot Be Auto-Fixed

**What goes wrong:** Exporting `TableProps<T>` as `export interface TableProps<T>` does not help — the generator cannot instantiate a generic without a type argument. `checker.getDeclaredTypeOfSymbol(propsResolved)` on a generic interface returns an uninstantiated generic type whose `getProperties()` returns an empty array (or the raw parameter `T`).

**How to avoid:** For `Table`, create a non-generic export alias used only for registry documentation purposes:
```typescript
// In Table.tsx, add after the generic interface:
/** @internal Registry documentation type — concrete version of TableProps with unknown row type */
export interface TableProps extends TablePropsGeneric<unknown> {}
// ... or simply duplicate the props list:
export interface TableProps {
  columns: Column<unknown>[];
  data: unknown[];
  rowKey: (row: unknown) => string | number;
  density?: "compact" | "default" | "spacious";
  striped?: boolean;
  emptyMessage?: string;
  className?: string;
}
```
The cleanest approach without touching the generic: rename the generic to `TablePropsGeneric<T>` (unexported) and create an exported `TableProps` alias for the registry.

**Warning signs:** `Table` still shows 0 props after export fix attempt.

### Pitfall 5: CI Drift Check Fails After Props Fix

**What goes wrong:** After exporting Props interfaces and regenerating `registry.json`, developers might forget to commit the updated `registry.json`. The CI drift check catches this (`git diff --exit-code packages/rialto/registry.json`).

**How to avoid:** After running `pnpm build:registry`, immediately `git add packages/rialto/registry.json` and commit. The CI check is a safety net, not a workflow blocker if the commit is made.

---

## Code Examples

### Minimal Props Export Fix

```typescript
// Source: pattern from packages/rialto/src/components/Dialog/Dialog.tsx (already correct)
// BEFORE (broken — not visible to generate-registry.ts):
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  side?: "right" | "left" | "bottom";
  size?: "default" | "wide" | "full";
}

// AFTER (fixed — visible to generate-registry.ts):
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  side?: "right" | "left" | "bottom";
  size?: "default" | "wide" | "full";
}
```

### Verify Registry After Regeneration

```bash
# Run from packages/rialto
pnpm build:registry

# Quick verification: count empty-props components
node -e "
const r = require('./registry.json');
const empty = r.components.filter(c => !c.props.length).map(c => c.name);
console.log('Still empty (' + empty.length + '):', empty.join(', '));
console.log('Total:', r.components.length);
"
# Expected: only sub-components (Category 3) remain empty
# High-use components (Drawer, Checkbox, Table, TextArea, etc.) must have props
```

### Phase 08 VERIFICATION.md Frontmatter

```yaml
---
phase: 08-ai-developer-experience
verified: 2026-03-23
status: passed
score: 3/3 requirements verified (AIDX-01, AIDX-04, AIDX-06)
re_verification: false
human_verification: []
---
```

---

## State of the Art

| Old State | Current State | When Changed | Impact |
|-----------|---------------|--------------|--------|
| Props interfaces internal (unexported) | Props exported (aligned with existing `Button`, `Dialog`, `Select` pattern) | Phase 11 | TypeScript consumers can `import type { DrawerProps }` from library; registry generator finds all Props |
| 49/90 empty props in registry | Target: ~26/90 empty (only sub-components remain) | Phase 11 | AI tools get structured prop metadata for all primary components |
| Phase 08 unverified | Phase 08 VERIFICATION.md created | Phase 11 | Audit closes to full satisfaction; AIDX-01, AIDX-04, AIDX-06 formally verified |

---

## Open Questions

1. **Table generic Props — rename vs duplicate**
   - What we know: `TableProps<T>` cannot be auto-extracted due to generic type parameter
   - What's unclear: Whether to rename the generic to `TablePropsGeneric<T>` and create exported `TableProps` (cleaner), or duplicate the interface inline (simpler)
   - Recommendation: Rename approach (`TablePropsGeneric<T>` internal + `TableProps` exported with `unknown`) is cleaner and preserves type safety of the generic. Planner should choose one approach.

2. **AIDX-02 / AIDX-03 coverage in Phase 08 VERIFICATION.md**
   - What we know: Phase 11's description says "Phase 08 Verification" for AIDX-01, AIDX-04, AIDX-06. The audit shows AIDX-02 and AIDX-03 are "unsatisfied" partly due to missing SUMMARY frontmatter in 08-02-SUMMARY.md.
   - What's unclear: Whether Phase 11 should also cover AIDX-02/AIDX-03 verification in the Phase 08 VERIFICATION.md, or leave them to a separate cleanup.
   - Recommendation: Phase 11 success criteria explicitly list AIDX-01, AIDX-04, AIDX-06. The planner should include AIDX-02 and AIDX-03 in the Phase 08 VERIFICATION.md if they can be verified from existing artifacts (llms.txt, llms-full.txt, CLAUDE.md all exist). This would fully close Phase 08 in one pass. This is a planner decision, not a blocker.

---

## Sources

### Primary (HIGH confidence)
- `packages/rialto/scripts/generate-registry.ts` — Generator source, `getExportsOfModule` lookup pattern (lines 108-109), root cause of empty props
- `packages/rialto/registry.json` — Live registry, 90 components, 49 with empty props verified programmatically
- `packages/rialto/src/components/Dialog/Dialog.tsx` — Reference pattern for correctly exported Props interface
- `packages/rialto/src/components/Button/Button.tsx` — Reference pattern: `export interface ButtonProps extends Pick<...>`
- `packages/rialto/src/components/Drawer/Drawer.tsx` — Confirmed non-exported `interface DrawerProps`
- `packages/rialto/src/components/Checkbox/Checkbox.tsx` — Confirmed non-exported `interface CheckboxProps`, `RadioProps`, `RadioGroupProps`
- `packages/rialto/src/components/Table/Table.tsx` — Confirmed generic `interface TableProps<T>` (different problem)
- `packages/rialto/src/components/TextArea/TextArea.tsx` — Confirmed non-exported `interface TextAreaProps extends Pick<...>`
- `.planning/phases/08-ai-developer-experience/08-01-SUMMARY.md` — AIDX-01, AIDX-06 claimed as complete; evidence base for VERIFICATION.md
- `.planning/phases/08-ai-developer-experience/08-02-SUMMARY.md` — AIDX-02, AIDX-03 work described; missing frontmatter
- `.planning/phases/08-ai-developer-experience/08-03-SUMMARY.md` — AIDX-04 claimed as complete; evidence base for VERIFICATION.md
- `.planning/v1.1-MILESTONE-AUDIT.md` — Root cause analysis, 49/90 empty props, missing VERIFICATION.md identified
- `.planning/phases/06-accessibility-foundation/06-VERIFICATION.md` — Reference template for VERIFICATION.md format and structure

### Secondary (MEDIUM confidence)
- TypeScript Compiler API behavior: `getExportsOfModule` only returns exported symbols; `Pick<>` resolves to concrete properties — verified against working component behavior (Button, Dialog produce correct props with exported interfaces)

---

## Metadata

**Confidence breakdown:**
- Root cause analysis: HIGH — directly verified by reading source files and correlating with registry output
- Fix approach (export keyword): HIGH — matches working pattern from Button, Dialog, Select, Collapsible
- Table generic workaround: MEDIUM — approach is correct but exact rename strategy is a planner decision
- Phase 08 VERIFICATION.md content: HIGH — implementation artifacts confirmed present in Phase 08 SUMMARYs

**Research date:** 2026-03-23
**Valid until:** 2026-06-23 (stable — TypeScript Compiler API behavior, registry structure not changing)
