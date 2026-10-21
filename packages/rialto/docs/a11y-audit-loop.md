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

## Iteration 3: Overlay Wrappers (cloneElement / trigger wrapping)

Re-audit of the wrapper patterns deferred in Iteration 1. Scope: trigger `aria-*` wiring, consumer prop preservation through `cloneElement`, focus trap and return, Escape, Tooltip-as-only-name, and non-element children (#6314).

### Popover.tsx

Popover.tsx - re-checked after the controlled `open` rework (#6298): `aria-expanded` and `aria-controls` derive from the resolved `open` (controlled or not), and Escape, outside press and the close button all route through `onOpenChange`. **Not fixed** — compliant.
Popover.tsx - trigger activated by keyboard never reached the consumer's `onClick`: the wrapper's Enter/Space handler called `preventDefault()` on the keydown, which cancels the native button click. Analytics or state handlers on the trigger silently skipped keyboard users. **FIXED**: the wrapper still handles Enter/Space (so keydown-driven activation and no double toggle are unchanged) but, for a native `<button>` trigger, re-dispatches a single `click()` so the consumer's `onClick` fires once and bubbles to the toggle.
Popover.tsx - `cloneElement` preserves the consumer's `ref`, `onKeyDown` and non-owned `aria-*` (e.g. `aria-describedby`, `aria-label`). **Not fixed** — compliant (regression test added). `aria-haspopup`/`aria-expanded`/`aria-controls` are owned by the component and intentionally override.
Popover.tsx - focus trap, initial focus and focus return (`useFocusTrap`, `useReturnFocus`) and Escape (`useEscapeKey`). **Not fixed** — compliant, covered by existing tests.
Popover.tsx - wrapper `<div role="presentation" onClick onKeyDown>` remains. **Defer** — removing it means moving the handlers onto the clone and changing layout and the existing keyboard tests that fire on the wrapper; the behavioural defect it caused is fixed above.
Popover.tsx - panel falls back to `aria-label="Popover"` when there is no `title`. **Defer** — a better name needs a new prop (no new APIs this iteration).
Popover.tsx - a non-element `trigger` (a string) throws in `cloneElement`. **Defer** — the prop is typed `ReactElement`; the type is the contract.

### DropdownMenu.tsx

DropdownMenu.tsx - same keyboard-activation defect as Popover (consumer `onClick` skipped on Enter/Space). **FIXED**: same change.
DropdownMenu.tsx - trigger had no `aria-controls` and the `role="menu"` had no accessible name. **FIXED**: menu gets a `useId` id; trigger gets `aria-controls` while open (no dangling reference when closed); menu is `aria-labelledby` the trigger. A consumer-supplied trigger `id` is kept; otherwise a generated one is injected.
DropdownMenu.tsx - `useReturnFocus` interaction (#5618): capture runs in a layout effect declared before the item-focus layout effect, so focus returns to the trigger, not the first item. **Not fixed** — compliant; regression test added for Escape and Enter-select.
DropdownMenu.tsx - Tab from an open menu leaves it open. **Defer** — closing on Tab races the return-focus `requestAnimationFrame` (focus would snap back to the trigger), which needs a hook change to opt out.
DropdownMenu.tsx - wrapper `role="presentation"` div. **Defer** — as Popover.

### Tooltip.tsx

Tooltip.tsx - `cloneElement` set `aria-describedby` to `undefined` while closed and to the tooltip id while open, so a consumer's own `aria-describedby` on the trigger was always clobbered. **FIXED**: ids are merged (consumer first, tooltip id appended while open).
Tooltip.tsx - a Fragment child received `aria-describedby`, producing a React "Invalid prop supplied to React.Fragment" warning and no effect. **FIXED**: Fragments are passed through untouched.
Tooltip.tsx - consumer `ref` and handlers are preserved; plain-text children render untouched; Escape closes. **Not fixed** — compliant (regression tests added).
Tooltip.tsx - the tooltip is exposed as a description only, never as the accessible name, so an icon-only trigger with no label stays unnamed. **Defer** — deriving a name from `content` would be a behaviour/API change; consumers must label icon-only triggers.

---

## Fixes applied this iteration (Iteration 3)

- Popover: native-button triggers activate natively so the consumer's `onClick` fires on keyboard (1 fix)
- DropdownMenu: same keyboard fix; `aria-controls` on trigger, `aria-labelledby` and id on the menu (2 fixes)
- Tooltip: `aria-describedby` merged with the consumer's; Fragment children skipped (2 fixes)

## Iteration 4: Non-overlay interactive (Slider, Tabs, Accordion, SegmentedControl)

Audit against the WAI-ARIA APG patterns (Slider, Tabs, Accordion, Radio Group), covering keyboard, roles/states/names and focus management (#6436). Accordion delegates its trigger/panel markup to Collapsible, so the Collapsible fix covers both.

### Slider.tsx

Slider.tsx - native `<input type="range">` with explicit `aria-valuemin/max/now/text`; Arrow keys and Home/End handled (and `preventDefault`ed), Page Up/Down left to the browser's native range handling (not observable in jsdom). Label via `aria-label`/`label`, `disabled` reaches the native input, focus ring shown on the knob via `:focus-visible`. **Not fixed** - compliant.
Slider.tsx - Arrow keys are not mirrored in RTL (ArrowRight always increments). **Defer** - APG leaves direction handling to the platform; changing it needs a design call and the native input already follows the writing direction for pointer use.
Slider.tsx - a slider with neither `label` nor `aria-label` is unnamed. **Defer** - enforcing a name is an API change (`label` is optional today).
Slider.tsx - `aria-disabled` on the role-less track wrapper carries no semantics (the native input already exposes disabled). **Defer** - harmless, and removing it risks styling hooks.

### Tabs.tsx

Tabs.tsx - every tab carried `aria-controls` pointing at its panel, but only the active panel is rendered, so inactive tabs referenced ids that do not exist. **FIXED**: `aria-controls` only on the selected tab.
Tabs.tsx - the `role="tablist"` had no accessible name, and a consumer `aria-label`/`aria-labelledby` landed on the wrapper div instead. **FIXED**: both are routed to the tablist (same pattern as SegmentedControl); no new props, they are already part of `HTMLAttributes`.
Tabs.tsx - if `defaultTab` matched no tab, every tab had `tabIndex=-1` (list unreachable by Tab) and ArrowLeft jumped to the second-to-last tab. **FIXED**: the first enabled tab is the tab stop, and ArrowLeft from no selection goes to the last tab.
Tabs.tsx - roles `tablist/tab/tabpanel`, `aria-selected`, roving `tabIndex`, `aria-labelledby` on the panel, Arrow/Home/End with wrap and disabled tabs skipped, focus follows selection. **Not fixed** - compliant.
Tabs.tsx - the `tabpanel` is not itself focusable (APG: `tabindex=0` when it has no focusable content). **Defer** - cannot be decided from the component without inspecting arbitrary content, and an unconditional stop adds a tab stop to every consumer.
Tabs.tsx - Arrow keys are not mirrored in RTL. **Defer** - as Slider.

### Accordion.tsx / Collapsible.tsx

Collapsible.tsx - trigger had `aria-controls` pointing at the content id while closed, but the content is unmounted when closed (dangling reference). **FIXED**: `aria-controls` only while open.
Accordion.tsx - heading-wrapped `button[aria-expanded]`, region `aria-labelledby` trigger, native Enter/Space, Arrow/Home/End focus movement with wrap, `aria-disabled` triggers stay focusable and do not toggle. **Not fixed** - compliant.
Accordion.tsx - arrow navigation queries every `button[aria-expanded]` inside the container, so a nested accordion or disclosure inside a panel joins the ring. **Defer** - needs a scoping marker on triggers; no consumer nests one today.

### SegmentedControl.tsx

SegmentedControl.tsx - roving `tabIndex` was only on the segment matching `value`; with an unmatched `value` (e.g. `""`) the whole group was unreachable by Tab, and ArrowLeft jumped to the second-to-last segment. **FIXED**: same fallback as Tabs (first enabled segment is the tab stop; ArrowLeft from no selection goes to last).
SegmentedControl.tsx - model is a single-select `role=radiogroup` of `role=radio` with `aria-checked` and roving tabindex (parity with Tabs); name routed to the radiogroup; arrows select and move focus, disabled segments skipped. `aria-pressed` would be wrong here because the options are mutually exclusive. **Not fixed** - compliant.

---

## Fixes applied this iteration (Iteration 4)

- Tabs: `aria-controls` only on the selected tab; `aria-label`/`aria-labelledby` routed to the tablist; tab-stop fallback and ArrowLeft from no selection (3 fixes)
- Collapsible (so Accordion): `aria-controls` only while open (1 fix)
- SegmentedControl: tab-stop fallback and ArrowLeft from no selection (1 fix)
- Slider: no change (compliant, 3 deferrals)

---

## Iteration 5: Navigation (Navbar, Sidebar, Breadcrumb, Pagination)

### Navbar.tsx

Navbar.tsx - the root `<nav>` had no accessible name, unlike Sidebar, Breadcrumb and Pagination. **FIXED**: optional `label` prop (default "Main navigation"); a consumer `aria-label`/`aria-labelledby` wins. (#6587)
Navbar.tsx - the submenu toggle had `aria-expanded` but no `aria-controls`. **FIXED**: each (recursive) `NavbarLinkItem` gets a `useId` id on its children container; `aria-controls` only while open (no dangling reference). (#6588)

### Sidebar.tsx

Sidebar.tsx - section label was a bare `<span>` with no association to its items. **FIXED**: each section is now `role="group"` with `aria-labelledby` pointing at the label (`useId`); the attribute is omitted when the section has no label or the sidebar is collapsed (no dangling reference). (#6589)

### Breadcrumb.tsx

Breadcrumb.tsx - when `maxItems` collapsed the trail, the "…" placeholder was an `<li>` whose only content was `aria-hidden`, so AT announced a list with an empty entry (one more item than real crumbs). **FIXED**: the placeholder `<li>` is `aria-hidden` (its separator already was), so the list count matches the visible links.
Breadcrumb.tsx - `nav[aria-label="Breadcrumb"]`, `ol` of `li`, the last item as `aria-current="page"`, decorative separators `aria-hidden`, native links and buttons. **Not fixed** - compliant with the APG breadcrumb pattern.
Breadcrumb.tsx - the collapsed middle items cannot be revealed (APG's expandable variant). **Defer** - needs new interaction and API.
Breadcrumb.tsx - the `nav` name was fixed to "Breadcrumb" and `HTMLAttributes` were not forwarded, so a page with two trails could not tell them apart. **FIXED**: `BreadcrumbProps` extends `HTMLAttributes<HTMLElement>` (minus `children`) and spreads onto the `nav`; the default `aria-label="Breadcrumb"` is kept (no new message key) and a consumer `aria-label` wins, while `aria-labelledby` replaces the default so the two never compete.
Breadcrumb.tsx - a non-last item with neither `href` nor `onClick` renders an inert button. **Defer** - a type-level contract decision.
Breadcrumb.tsx - `maxItems={1}` made `slice(-0)` return every item (the trail did not collapse at all). **FIXED**: with room for one entry only the current page is shown; `maxItems >= 2` is unchanged.

### Pagination.tsx

Pagination.tsx - `nav[aria-label="Pagination"]`, native buttons, `aria-label="Page N"` (contains the visible number, so label-in-name holds), `aria-current="page"` on the active page, ellipsis `aria-hidden`, arrows named and natively disabled at the bounds. **Not fixed** - compliant.
Pagination.tsx - activating Next/Previous onto the last/first page disabled the focused button, so focus fell to `body`. **FIXED**: when an arrow click lands on its bound, focus moves to the current-page button (it stays enabled and in the tab order); the native `disabled` contract is unchanged, and focus is left alone while the arrow is still enabled.
Pagination.tsx - page changes are not announced and the nav lacks a "page X of Y" description. **Defer** - needs a live region and new visible/spoken strings, which belong with the localisation work (#6616).
Pagination.tsx - the controls were flat children of the `nav`, not a list. **FIXED**: a `ul` of `li` inside the `nav` (list semantics, so AT announces "list, N items"); the ellipsis `li` is `aria-hidden`. CSS resets the list and keeps the same flex/gap layout, so there is no visual change.

---

## Fixes applied this iteration (Iteration 5)

- Navbar: landmark named; submenu toggle linked via `aria-controls` while open (2 fixes)
- Sidebar: sections grouped under their label (1 fix)
- Breadcrumb: collapsed-items placeholder hidden from the list; `maxItems={1}` collapses; rest props and a `nav` label override (3 fixes)
- Pagination: focus handed to the current page when an arrow disables; controls are a list (2 fixes); page-change announcement deferred to #6616

---

## Iteration 6: axe-core against the component showcase pages (#6715)

Re-ran axe (full rule set, `@axe-core/playwright`) against the built rialto-web pages for the 10 `"carrier": "seed"` P2 findings in `metrics/ui-quality-findings.json`, in light and dark. The JSON carries only the impact level, so the real rule ids below come from that re-run. `color-contrast` was the cause of 6 of the 10; the other two are `landmark-unique`.

| Page          | Finding      | axe rule                  | Outcome                                                                                                                                                   |
| ------------- | ------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| aspect-ratio  | axe-serious  | `color-contrast` (3.31:1) | **FIXED** (showcase): ratio label used tertiary text on the matte tile; now primary                                                                       |
| avatar        | axe-serious  | none reproducible         | **No change**: last seen 2026-10-01, clean in both themes now; covered by the new regression spec                                                         |
| breadcrumb    | axe-moderate | `landmark-unique`         | **FIXED** (showcase): five trails shared one `nav` name; each now passes its own `aria-label` (supported since Iteration 5)                               |
| data-list     | axe-serious  | `color-contrast` (4.07:1) | **FIXED** (component): `.striped .label` uses secondary text on the recessed stripe                                                                       |
| dialog        | axe-serious  | none reproducible         | **No change**: last seen 2026-10-01, clean now; Iteration 1 already linked title and description                                                          |
| divider       | axe-serious  | `color-contrast` (3.15:1) | **FIXED** (component): accent label is `color-mix(accent 70%, text-primary)` (5.1:1 light); the hue is kept, only darkened                                |
| drawer        | axe-serious  | none reproducible         | **No change**: last seen 2026-10-01, clean now                                                                                                            |
| dropdown-menu | axe-serious  | none reproducible         | **No change**: last seen 2026-10-01, clean now; Iteration 3 added `aria-controls` / `aria-labelledby`                                                     |
| pagination    | axe-serious  | `color-contrast` (3.4:1)  | **FIXED** (component): active page text was `white` on the gold fill (2.3:1 in dark); now `--rialto-text-on-accent`, matching SegmentedControl and Button |
| scroll-area   | axe-moderate | `landmark-unique`         | **FIXED** (showcase): four `role="region"` areas all named "Scrollable content"; each now passes a distinct `aria-label` (props spread, no new API)       |
| scroll-area   | axe-serious  | `color-contrast` (2.83:1) | **FIXED** (showcase): lap-time text used the accent colour; now primary                                                                                   |

Notes:

- No public API change. Pagination, Divider and DataList change colour only: the active page label goes from white to the dark on-accent text (the fill is unchanged), and the DataList label on odd rows is one text tier darker. These may move rialto-web visual baselines; they were not regenerated here (baselines are Linux-runner-specific, see the repo gotchas).
- The two overlay pages (dialog, drawer) and dropdown-menu are audited closed, as the loop captures them. The open states are not covered by axe on the showcase and remain a gap.
- **Deferred:** none needed a design call. The rule that gold is not a text colour (`packages/rialto/CLAUDE.md`) is still bent by the accent Divider label; it is now darkened enough to pass but a design decision on whether it should be gold at all is left open.

### Regression tests

- `src/test/iteration-6-contrast.test.ts`: reads the real stylesheets and token files and asserts 4.5:1 for the Pagination active page, Divider accent label and DataList striped label in both themes (jsdom cannot resolve custom-property contrast).
- `apps/rialto-web/e2e/a11y-pages.spec.ts`: all 10 pages, light and dark, zero violations of any impact with `color-contrast` enabled.

---

## Fixes applied this iteration (Iteration 6)

- Pagination: active page text uses `--rialto-text-on-accent` (1 fix)
- Divider: accent label contrast (1 fix)
- DataList: striped-row label contrast (1 fix)
- Showcase pages: AspectRatio and ScrollArea text colours, Breadcrumb and ScrollArea unique landmark names (4 fixes)
- Avatar, Dialog, Drawer, DropdownMenu: no reproducible finding (4 pages, regression spec only)

---

## Iteration 7: axe-core against example, demo and standalone pages (#7186)

Re-ran axe (full rule set, `@axe-core/playwright` 4.14, Chromium, reduced motion) in light and dark against every non-component `"carrier": "seed"` finding in `metrics/ui-quality-findings.json` for rialto-web: nine `examples/*`, `privacy` and `visual-test` pages (the 14 finding rows the issue names), plus `demos/signup`, `examples/checkout` and `examples/form`, which the loop also lists. The JSON carries only the impact level, so the rule ids below come from this re-run. Investigation only: no component or page code changed.

| Page                          | Finding  | axe rule (theme)                                                                                                                                         | Reproduces?                          |
| ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| examples/notification-center  | moderate | none                                                                                                                                                     | Already fixed (clean light and dark) |
| examples/notification-center  | serious  | none                                                                                                                                                     | Already fixed (clean light and dark) |
| examples/onboarding           | moderate | none                                                                                                                                                     | Already fixed (clean light and dark) |
| examples/pricing-table        | moderate | `heading-order` (light, dark), `#starter-name`                                                                                                           | Reproduces                           |
| examples/pricing-table        | serious  | none                                                                                                                                                     | Already fixed                        |
| examples/reservation-kanban   | moderate | none                                                                                                                                                     | Already fixed                        |
| examples/reservation-kanban   | serious  | `color-contrast` 4.07:1 (light), column-header label; `label-content-name-mismatch` x2 (light, dark), card ghost button                                  | Reproduces                           |
| examples/reservation-timeline | serious  | `label-content-name-mismatch` x5 (light, dark), timeline bars                                                                                            | Reproduces                           |
| examples/reservations         | moderate | none                                                                                                                                                     | Already fixed                        |
| examples/settings             | moderate | none                                                                                                                                                     | Already fixed                        |
| privacy                       | moderate | `landmark-one-main` and `region` (light, dark)                                                                                                           | Reproduces                           |
| visual-test                   | moderate | `landmark-unique` x1 (tape chart region), `region` x123 (light, dark)                                                                                    | Reproduces                           |
| visual-test                   | serious  | `aria-progressbar-name` x2, `label-content-name-mismatch` x64 (tape chart bars) (light, dark); `color-contrast` 3.4:1 light / 2.32:1 dark on `_selected` | Reproduces                           |
| demos/signup                  | serious  | none                                                                                                                                                     | Already fixed                        |
| examples/checkout             | moderate | `heading-order` (light, dark), card `h3`                                                                                                                 | Reproduces                           |
| examples/form                 | serious  | `color-contrast` 3.31:1 light / 4.22:1 dark, tertiary caption on the state-panel label                                                                   | Reproduces                           |

Notes:

- Contrast (feeds #7187): reservation-kanban column header (4.07:1 light), visual-test `_selected` control (3.4:1 light, 2.32:1 dark), form state-panel caption (3.31:1 light, 4.22:1 dark).
- Landmark and structure (feeds #7188): `heading-order` on pricing-table and checkout, `landmark-one-main` and `region` on privacy, `landmark-unique` and `region` on visual-test, `aria-progressbar-name` on visual-test.
- **Contrast fixes (#7187):** the reservation-kanban column header label and the `StatePanel` caption (every example's state panel, `examples/form`) now use primary text on their recessed/matte strip; both re-checked clean with axe in light and dark. **Deferred to a human:** the visual-test `_selected` accent `Tag` (3.4:1 light, 2.32:1 dark) fails inside the component, so it needs a Tag token decision, not a page change.
- **Landmark and structure fixes (#7188):** privacy is now a `main`; the standalone `visual-test` route is wrapped in a `main` (the `demos/visual-test` route already gets one from `DemoLayout`); pricing-table plan names and checkout card titles are `h2` under the page `h1`; the visual-test progress bars have `aria-label`s. Re-checked with axe in light and dark: privacy, pricing-table and checkout are clean, and on visual-test only the `_selected` Tag contrast and the TapeChart `label-content-name-mismatch` remain (both deferred above).
- **Deferred to a human:** `label-content-name-mismatch` on the TapeChart bars (visual-test, reservation-timeline) and the kanban card ghost button. The accessible name is set by the component and differs from the visible text, so the fix is a component naming contract, not page composition.
- The `region` x123 count on visual-test is the harness page rendering content outside landmarks by design; #7188 should decide between a `main` wrapper and a documented exemption.

---

## Queue for next iterations

- ~~**Iteration 2**: Form components — Input, TextArea, Checkbox, Select, NumberInput, PinInput, Autocomplete~~ **Done** (see Iteration 2 above)
- ~~**Iteration 3**: Invasive wrapper refactors — Popover, DropdownMenu, Tooltip (cloneElement patterns)~~ **Done** (see Iteration 3 above)
- ~~**Iteration 4**: Non-overlay interactive — Slider, Tabs, Accordion, SegmentedControl~~ **Done** (see Iteration 4 above)
- ~~**Iteration 5**: Navigation — Navbar, Sidebar, Breadcrumb, Pagination~~ **Done** (see Iteration 5 above)
- ~~**Iteration 6**: Verify fixes with axe-core against showcase pages~~ **Done for the 10 component pages** (see Iteration 6 above)
- **Iteration 7** (in progress, #7061): the 14 remaining seed findings on `examples/*`, `demos/*` and standalone pages (`visual-test`, `privacy`), composition-level rather than per-component
