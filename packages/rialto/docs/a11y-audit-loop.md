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

## Iteration 2: Form Components

### useFocusTrap.ts (shared hook)

useFocusTrap.ts - `FOCUSABLE_SELECTOR` matched `button`/`input`/`select`/`textarea` regardless of `disabled`, so a disabled first candidate made `first?.focus()` silently no-op. Flagged in Iteration 1 as Dialog.tsx:61 and Drawer.tsx:97 (not fixed). The focus-trap logic now lives in this shared hook, so one fix covers every overlay. **FIXED** (#5937): `:not(:disabled)` on each native-disableable selector; `[href]` unchanged. Regression tests cover a disabled-only panel and a mixed panel (initial focus and Tab-wrap).

### Input.tsx

**Not fixed** — already compliant (#5992). Label, description/error linkage, and `aria-invalid` all come from the shared `useField` hook (single stable `-hint` id, switched between description and error). Native `disabled`; no inline buttons.

### TextArea.tsx

TextArea.tsx:111 - character-counter "over limit" state was visual only. The counter turned red and a polite live region announced it once, but `aria-invalid` stayed unset unless the consumer also passed `error`, so an over-limit field gave no persistent invalid signal on return. **FIXED**: `aria-invalid={error || isOver ? true : undefined}`. Hint/error wiring still activates only on the explicit `error` prop (#5992).

Not fixed — otherwise compliant: label, description, and error wiring via `useField`, same as Input (#5992).

### Checkbox.tsx

**Not fixed** — already compliant (#5992), covers Radio/RadioGroup too. Native `<label htmlFor>`; `aria-describedby` only when `description` is present; native keyboard operation; native `disabled`; indeterminate exposed via the DOM `.indeterminate` property.

Checkbox.tsx - no `error`/validation-state prop, unlike Input, TextArea, Select, and NumberInput. Nothing is broken, but there is no validation-state surface to audit. **Defer** — adding error support is a feature addition, not an audit fix (#5992).

### Select.tsx

Select.tsx - trigger `required` was only an aria-hidden asterisk; the combobox never exposed it to AT. **FIXED**: `aria-required`.
Select.tsx - listbox `aria-label={label}` left the listbox unnamed when the trigger was named via `aria-label`/`aria-labelledby`. **FIXED**: falls back to `aria-label`/`aria-labelledby` (#6197).

**Not fixed** — already compliant (#6197): label via `htmlFor`, `role=combobox`, `aria-expanded`, `aria-controls`, `aria-haspopup=listbox`, `aria-activedescendant` only while open, `aria-invalid`, describedby via useField, disabled as `aria-disabled` with click and keys blocked, option `aria-selected`/`aria-disabled`, disabled options skipped by arrows, Escape/Tab close.

### NumberInput.tsx

NumberInput.tsx - ArrowUp/ArrowDown changed the value when `readOnly`, and the stepper buttons stayed enabled. **FIXED**: keydown is a no-op and steppers are disabled when `readOnly` (#6197).

**Not fixed** — already compliant (#6197): native `type=number` (spinbutton), label `htmlFor`, `aria-invalid`/describedby via useField, native `required`/`disabled`.

NumberInput.tsx - stepper names "Increase"/"Decrease" are not unique per field. **Defer** — the steppers are `tabIndex=-1` and the arrow keys are the keyboard path. Renaming would break consumer queries (e.g. the FormField integration test) (#6197).

### PinInput.tsx

PinInput.tsx - cells carried no `aria-invalid` when `error`; the error text was reachable only via the group's describedby. **FIXED**: per-cell `aria-invalid`.
PinInput.tsx - cells carried no required state. **FIXED**: per-cell `aria-required` (#6197).

**Not fixed** — already compliant (#6197): group `role=group` labelled by the label, describedby id resolves in hint and error states (shared id), per-cell names "Digit n of N", native disabled and readOnly, arrow/backspace/paste keyboard.

### Autocomplete.tsx

Autocomplete.tsx - listbox had no accessible name. **FIXED**: `aria-labelledby` label id, or `aria-label` fallback.
Autocomplete.tsx - `aria-activedescendant` stayed set after the listbox closed (dangling id), and pointed at a nonexistent id when no options matched. **FIXED**: only set while open and the index is rendered.
Autocomplete.tsx - Tab left the listbox open after focus moved on. **FIXED**: Tab closes it.
Autocomplete.tsx - a consumer-supplied `aria-describedby` replaced the hint link via the props spread. **FIXED**: merged (#6197).

**Not fixed** — already compliant (#6197): `role=combobox`, `aria-expanded`, `aria-controls`, `aria-autocomplete=list`, label `htmlFor`, focus stays on the input (APG), option `aria-selected` = active, Escape closes.

---

## Fixes applied this iteration (Iteration 2)

- useFocusTrap (shared): `:not(:disabled)` on `FOCUSABLE_SELECTOR` (1 fix, #5937)
- TextArea: `aria-invalid` for the over-limit state (1 fix, #5992)
- Select: `aria-required` on the trigger, listbox name fallback (2 fixes, #6197)
- NumberInput: readOnly keydown no-op, steppers disabled when readOnly (2 fixes, #6197)
- PinInput: per-cell `aria-invalid` and `aria-required` (2 fixes, #6197)
- Autocomplete: listbox name, `aria-activedescendant` lifecycle, Tab closes, describedby merged (4 fixes, #6197)

Final gates on merged main (#6197): `pnpm --dir packages/rialto test` 2379/2379, `typecheck` clean, `lint` 0 errors (pre-existing warnings only). Each part shipped with a patch changeset.

---

## Queue for next iterations

- ~~**Iteration 2**: Form components — Input, TextArea, Checkbox, Select, NumberInput, PinInput, Autocomplete~~ **Done** (see Iteration 2 above)
- **Iteration 3**: Invasive wrapper refactors — Popover, DropdownMenu, Tooltip (cloneElement patterns)
- **Iteration 4**: Non-overlay interactive — Slider, Tabs, Accordion, SegmentedControl
- **Iteration 5**: Navigation — Navbar, Sidebar, Breadcrumb, Pagination
- **Iteration 6**: Verify fixes with axe-core against showcase pages
