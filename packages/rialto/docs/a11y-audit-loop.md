# Rialto A11y Audit — Loop Session (Apr 16, 2026)

Deep accessibility review using Vercel Web Interface Guidelines + manual source inspection.
Scope narrower than `ui-audit.md` (UX+visual) — this document only covers accessibility semantics, focus management, and ARIA correctness.

## Iteration 1: Overlay Components

### Dialog.tsx

Dialog.tsx:27 - `description` prop rendered visually but not linked to dialog via `aria-describedby` — screen reader cannot announce it as the dialog's accessible description. **FIXED**: added `descriptionId = useId()`, `aria-describedby={description ? descriptionId : undefined}` on panel, `id={descriptionId}` on `<p>`.
Dialog.tsx:125 - close button missing `type="button"` — when Dialog is used inside a `<form>`, close button defaults to `type="submit"` and submits the form on Enter. **FIXED**.
Dialog.tsx:61 - focus trap querySelector matches `<button disabled>` and `<input disabled>` — disabled elements can't receive focus but satisfy the selector, causing `first?.focus()` to silently no-op. Edge-case impact: low. Not fixed.

### Drawer.tsx

Drawer.tsx:168 - hardcoded `id="rialto-drawer-title"` — two simultaneous drawers produce duplicate IDs; `aria-labelledby` resolution becomes undefined. **FIXED**: replaced with `titleId = useId()`.
Drawer.tsx:169 - `description` rendered visually but not linked to drawer via `aria-describedby`. **FIXED**: `descriptionId = useId()`, `aria-describedby={description ? descriptionId : undefined}`, `id={descriptionId}` on description `<p>`.
Drawer.tsx:97 - focus trap querySelector includes disabled elements (same as Dialog). Not fixed.

### Popover.tsx

Popover.tsx:164 - close button missing `type="button"`. **FIXED**.
Popover.tsx:132 - wrapper `<div role="presentation" onClick onKeyDown>` is invalid ARIA: the presentation role declares "no semantics" but the element carries interactive handlers. Recommendation: use Radix-style `cloneElement` pattern that attaches the handlers directly to the trigger element instead of wrapping it. **Defer** — invasive refactor, flagged in `ui-audit.md` summary item #9.
Popover.tsx:154 - `role="dialog"` without focus trap — users can tab out of the popover and lose context. For non-modal popovers this is acceptable; for form-containing popovers consider `aria-modal="false"` + explicit focus management.

### DropdownMenu.tsx

DropdownMenu.tsx:208 - wrapper `<div role="presentation" onClick onKeyDown>` — same pattern as Popover. **Defer** — already flagged in `ui-audit.md` summary.

### Tooltip.tsx

Tooltip.tsx:72 - `aria-describedby` applied to wrapper `<div>`, not to the trigger element inside. Screen readers associate descriptions with the focused element; wrapping with `<div aria-describedby>` does not expose the tooltip as the trigger button's accessible description when keyboard-focused. Recommended fix: use `cloneElement` on `children` to inject `aria-describedby` onto the actual trigger. **Defer** — invasive change requires refactor to accept a single `ReactElement` child instead of `ReactNode`.

---

## Fixes applied this iteration

- Dialog: `aria-describedby` for description, `type="button"` on close (3 edits)
- Drawer: `useId()` replacing hardcoded ID, `aria-describedby` for description (3 edits)
- Popover: `type="button"` on close (1 edit)

All 260 tests pass. `pnpm typecheck` clean.

---

## Queue for next iterations

- **Iteration 2**: Form components — Input, TextArea, Checkbox, Select, NumberInput, PinInput, Autocomplete
- **Iteration 3**: Invasive wrapper refactors — Popover, DropdownMenu, Tooltip (cloneElement patterns)
- **Iteration 4**: Non-overlay interactive — Slider, Tabs, Accordion, SegmentedControl
- **Iteration 5**: Navigation — Navbar, Sidebar, Breadcrumb, Pagination
- **Iteration 6**: Verify fixes with axe-core against showcase pages
