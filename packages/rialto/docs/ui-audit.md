# Rialto UI Audit — Web Interface Guidelines

Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
Audited against: `packages/rialto/src/components/*`

---

## Batch 1: Accordion → Banner

### src/components/Accordion/Accordion.tsx

✓ pass — keyboard nav (Arrow/Home/End), configurable heading level, delegates a11y to Collapsible

### src/components/Alert/Alert.tsx

src/components/Alert/Alert.tsx:126-130 — exit animates `height`, `marginBottom`, `padding` (non-compositor; rule: animate transform/opacity only)
src/components/Alert/Alert.tsx:143 — "Dismiss" label is vague → prefer "Dismiss alert" (specific button labels)

### src/components/AppBar/AppBar.tsx

✓ pass — reduced-motion handled; transform/opacity only

### src/components/AspectRatio/AspectRatio.tsx

✓ pass — presentational layout primitive

### src/components/Autocomplete/Autocomplete.tsx

src/components/Autocomplete/Autocomplete.tsx:181 — input missing `type="search"` / `inputmode="search"` for a search combobox
src/components/Autocomplete/Autocomplete.tsx:236 — `onMouseEnter` sets activeIndex; can fight keyboard nav when cursor rests over list (subtle UX; gate on pointer movement)
src/components/Autocomplete/Autocomplete.tsx:218 — empty `<li role="option" aria-disabled>` is focusable target in AT; consider `role="presentation"` on empty-state row

### src/components/Avatar/Avatar.tsx

src/components/Avatar/Avatar.tsx:48-53 — `<img>` missing explicit `width`/`height` (CLS risk)
src/components/Avatar/Avatar.tsx:42-46 — `<div aria-label>` without role; either use `role="img"` or drop label when purely decorative
src/components/Avatar/Avatar.tsx:117 — `key={i}` array-index key in AvatarGroup; prefer stable id (reorder churn)

### src/components/Badge/Badge.tsx

✓ pass — presentational; dot prop correct

### src/components/Banner/Banner.tsx

src/components/Banner/Banner.tsx:133 — `<button>` missing `type="button"` (submits if nested in a form)
src/components/Banner/Banner.tsx:121-125 — exit animates `height`, `paddingTop`, `paddingBottom` (non-compositor)
src/components/Banner/Banner.tsx:133 — "Dismiss" label is vague → prefer "Dismiss banner"

---

## Batch 2: Breadcrumb → ContextMenu

### src/components/Breadcrumb/Breadcrumb.tsx

src/components/Breadcrumb/Breadcrumb.tsx:91 — `key={i}` for list items; prefer stable key (e.g. `item.label` + href hash)
src/components/Breadcrumb/Breadcrumb.tsx:23 — user-supplied `icon?` not forced `aria-hidden` — document contract or wrap in `aria-hidden` span

### src/components/Button/Button.tsx

src/components/Button/Button.tsx:22 — `type` prop not defaulted to `"button"`; HTML default is `"submit"` → accidental form submission footgun
src/components/Button/Button.tsx:32 — no enforcement of `aria-label` when `children` is icon-only (icon-only button a11y)
src/components/Button/Button.tsx:90 — `loadingText` rendered as text swap with no `aria-live` announcement for screen readers (loading→done transition is silent)

### src/components/Card/Card.tsx

src/components/Card/Card.tsx:36 — `useTilt` runs regardless of `prefers-reduced-motion` (cursor-tracking 3D tilt is motion; honor reduced-motion)
src/components/Card/Card.tsx:68 — title hardcoded `<h3>`; no `headingLevel` prop → may break document hierarchy when used in non-h2 sections

### src/components/Checkbox/Checkbox.tsx

src/components/Checkbox/Checkbox.tsx:258-273 — RadioGroup only clones `children` when `Array.isArray`; single Radio child never receives `name`/`checked`/`onChange` injection (bug in documented API)
src/components/Checkbox/Checkbox.tsx:260 — uses `"props" in child` + `{...child.props}` without `isValidElement`; fragile to Fragment/string children

### src/components/Collapsible/Collapsible.tsx

src/components/Collapsible/Collapsible.tsx:117-120 — animates `height` (non-compositor); Framer Motion layout-height is heavy — consider `content-visibility` or accept cost with `layout` prop

### src/components/CommandPalette/CommandPalette.tsx

src/components/CommandPalette/CommandPalette.tsx:315 — list items are `<div>` with `onClick`/`onKeyDown`; acceptable under `role="option"` combobox pattern but loses native button semantics (flag for audit consistency)
src/components/CommandPalette/CommandPalette.tsx:331 — `onPointerMove` sets `activeIndex` without movement threshold → keyboard nav jumps when cursor rests over list
src/components/CommandPalette/CommandPalette.tsx:100 — global ⌘/Ctrl+K handler always attached while component mounted; may collide with host app shortcuts (no opt-out)
src/components/CommandPalette/CommandPalette.tsx:250-259 — overlay `<motion.div>` with `onClick` closes dialog; no `role="presentation"` and no pointer-only handling (OK under `role="dialog"` sibling pattern)

### src/components/ConfirmDialog/ConfirmDialog.tsx

src/components/ConfirmDialog/ConfirmDialog.tsx:114,121 — `<button>` missing `type="button"` (nested-form footgun)
src/components/ConfirmDialog/ConfirmDialog.tsx:89 — `setTimeout(..., 50)` for focus — fragile; prefer Dialog's own `initialFocus` ref pattern
src/components/ConfirmDialog/ConfirmDialog.tsx:127-133 — inline `style` object for layout; should use CSS module class

### src/components/ContextMenu/ContextMenu.tsx

src/components/ContextMenu/ContextMenu.tsx:113 — `menuHeight = items.length * 36` hardcodes item height (36px magic number) — breaks if theme changes row height
src/components/ContextMenu/ContextMenu.tsx:242 — `onMouseEnter` sets `activeIndex` without pointer-movement gate → same keyboard/mouse conflict
src/components/ContextMenu/ContextMenu.tsx:193 — wrapper `<div style="display: contents">` with `onContextMenu` — trigger's own context menu is hijacked even if nested element uses it
src/components/ContextMenu/ContextMenu.tsx:179 — Space and Enter both activate; per WAI-ARIA menu pattern Space should also open submenus (N/A here but flag if submenus added)

---

## Batch 3: DataList → ErrorBoundary

### src/components/DataList/DataList.tsx

src/components/DataList/DataList.tsx:51 — `key={i}` on row — prefer `item.label` for stability
✓ semantic `<dl>/<dt>/<dd>` structure otherwise

### src/components/Dialog/Dialog.tsx

src/components/Dialog/Dialog.tsx:125 — close `<button>` missing `type="button"`
src/components/Dialog/Dialog.tsx:84-89 — no `document.body` scroll lock while open (Drawer locks; Dialog doesn't — inconsistency, background scrolls behind modal)
src/components/Dialog/Dialog.tsx:61-66 — focus-trap querySelector matches disabled buttons and hidden inputs; `first?.focus()` silently no-ops when first is disabled
src/components/Dialog/Dialog.tsx:125 — "Close dialog" label ✓ specific (good — set the standard for other close buttons)

### src/components/DisabledTooltip/DisabledTooltip.tsx

src/components/DisabledTooltip/DisabledTooltip.tsx:13 — `showOnFocus={false}` hides the disabled-reason from keyboard users who can't hover; keyboard users are the population most likely to need to know _why_ an action is disabled

### src/components/Divider/Divider.tsx

✓ pass — proper `role="separator"` + `aria-orientation`

### src/components/Drawer/Drawer.tsx

src/components/Drawer/Drawer.tsx:157,168 — hardcoded id `"rialto-drawer-title"` — collides across multiple Drawers on one page; use `useId()` (Dialog does this correctly)
src/components/Drawer/Drawer.tsx:175 — "Close" label is vague → prefer "Close drawer"
src/components/Drawer/Drawer.tsx:97-101 — same focus-trap issue as Dialog (matches disabled elements)
src/components/Drawer/Drawer.tsx:144 — backdrop `<motion.div>` `onClick` closes but has no keyboard equivalent visible on the backdrop itself (Escape still works via document listener — acceptable)

### src/components/DropdownMenu/DropdownMenu.tsx

src/components/DropdownMenu/DropdownMenu.tsx:208-218 — wrapping `<div role="presentation">` with `onClick` + `onKeyDown` around user-supplied trigger — double handler layer; semantics sit on wrapper not trigger element
src/components/DropdownMenu/DropdownMenu.tsx:220-223 — `cloneElement` injects `aria-haspopup`/`aria-expanded` but not `aria-controls` referencing the menu id (menu has no id at all)
src/components/DropdownMenu/DropdownMenu.tsx:229-236 — no viewport-edge collision detection like ContextMenu has → menu overflows at right edge when `align="left"` near screen edge
src/components/DropdownMenu/DropdownMenu.tsx:271 — `onMouseEnter` sets activeIndex without movement threshold (keyboard/mouse conflict — third instance of this pattern)

### src/components/EmptyState/EmptyState.tsx

src/components/EmptyState/EmptyState.tsx:72 — heading rendered as `<p className={styles.heading}>` — not a real heading tag; screen readers skip it in outline; make `headingLevel` prop configurable (h2–h6) or use `role="heading" aria-level`
src/components/EmptyState/EmptyState.tsx:39 — user-supplied `icon?` not enforced `aria-hidden`

### src/components/ErrorBoundary/ErrorBoundary.tsx

src/components/ErrorBoundary/ErrorBoundary.tsx:52 — hardcoded `<h1>` inside fallback — misplaces document outline when boundary wraps mid-page region; should accept `headingLevel` prop
src/components/ErrorBoundary/ErrorBoundary.tsx:36 — `console.error` for error reporting; project rule: "No console.\* in production code — use proper logging libraries" (use the `onError` prop exclusively, or an injected logger)
src/components/ErrorBoundary/ErrorBoundary.tsx:41 — `window.location.reload()` loses unsaved work without warning; consumers may want `resetErrorBoundary()` style retry instead of hard reload

---

## Batch 4: FlipDot → Input

### src/components/FlipDot/FlipDot.tsx

src/components/FlipDot/FlipDot.tsx:74-79 — `Math.random()` called during render in `computeDelay`; stagger re-randomizes on every re-render, causing visible jitter on unrelated state changes (memoize delays per matrix)
src/components/FlipDot/FlipDot.tsx:207-225 — renders one `motion.div` per dot; grids >200 dots carry heavy FM overhead (no virtualization applicable — document dot-count guidance or use CSS-only animation for large grids)

### src/components/Footer/Footer.tsx

✓ pass — semantic `<footer>`, `<nav aria-label>`, stable keys

### src/components/GenCopilot/GenCopilot.tsx

✓ pass — inherits Drawer semantics; no direct a11y surface

### src/components/GlobalNav/GlobalNav.tsx

src/components/GlobalNav/GlobalNav.tsx:109-128 — mobile menu opens but focus doesn't move into menu, and no click-outside dismissal (focus lingers on hamburger; users keyboard-tab through page before reaching menu)
src/components/GlobalNav/GlobalNav.tsx:111 — hardcoded id `"global-nav-mobile-menu"` — collides if two GlobalNav ever render; use `useId()`

### src/components/Hero/Hero.tsx

src/components/Hero/Hero.tsx:19 — docstring example relies on consumer-supplied `className="accent"` — unscoped class name collides across apps; prefer a dedicated `<Accent>` subcomponent or pass-through slot
src/components/Hero/Hero.tsx:65 — `void rest` silently drops HTML attrs passed through props; consumers expect spread semantics from `HTMLAttributes<HTMLElement>`

### src/components/HoverCard/HoverCard.tsx

src/components/HoverCard/HoverCard.tsx:112-113 — `role="dialog" aria-label="Preview"` is wrong role for hover content; use `role="tooltip"` or no role with `aria-describedby` wire on trigger
src/components/HoverCard/HoverCard.tsx:98-107 — no touch/tap support — hover-only on mobile renders the card unreachable; needs click-to-toggle fallback under coarse pointer
src/components/HoverCard/HoverCard.tsx:107 — trigger gets no `aria-describedby` pointing to the panel id → screen readers don't associate trigger with preview

### src/components/ImageUpload/ImageUpload.tsx

src/components/ImageUpload/ImageUpload.tsx:185-205 — tile is a `<div role="button">` rather than a native `<button>`; works but guideline is "button for actions" — use native element
src/components/ImageUpload/ImageUpload.tsx:91 — error message "File exceeds maximum size" omits the actual limit → rule: error messages include fix/next step (e.g. "Max 2MB — this file is 3.4MB")
src/components/ImageUpload/ImageUpload.tsx:95 — "File type not accepted" omits accepted types
src/components/ImageUpload/ImageUpload.tsx:208-213 — preview `<img>` lacks `width`/`height` → CLS during upload
src/components/ImageUpload/ImageUpload.tsx:250-255 — error overlay has no `aria-live` → screen readers miss validation errors
src/components/ImageUpload/ImageUpload.tsx:226-229 — "Upload complete" checkmark span missing `role="status"` / `aria-live` → completion silent for AT users
src/components/ImageUpload/ImageUpload.tsx:252 — literal `"✕"` glyph as error icon — announced as "multiplication sign" by some screen readers; use `aria-hidden` SVG

### src/components/Input/Input.tsx

src/components/Input/Input.tsx:16-30 — no default `autoComplete` or guidance; consumers omitting it get browser default `"on"` — rule: "Inputs need autocomplete and meaningful name"
src/components/Input/Input.tsx:100-104 — hint acts as error text when `error=true` but has no `aria-live` → error appearance is silent
src/components/Input/Input.tsx:21 — `error?: boolean` is binary flag; no structured error-message prop means consumers embed error copy in `hint`, muddying semantics (non-error hint vs error message indistinguishable to AT)

---

## Batch 5: InputGroup → Pagination

### src/components/InputGroup/InputGroup.tsx

✓ pass — `role="group"` on wrapper

### src/components/Kbd/Kbd.tsx

src/components/Kbd/Kbd.tsx:49 — `key={i}` on shortcut keys (arrays rarely reorder here; minor)
✓ otherwise — semantic `<kbd>`

### src/components/Meter/Meter.tsx

✓ pass — `role="meter"` with full `aria-value*`; animates `scaleX` (compositor-friendly)

### src/components/Navbar/Navbar.tsx

src/components/Navbar/Navbar.tsx:79-113 — `<motion.button>` (chevron toggle) nested inside `<a href>` — invalid HTML (interactive-in-interactive); click on chevron also follows link. Restructure: render `<a>` and `<button>` as siblings
src/components/Navbar/Navbar.tsx:80 — `href={link.href || "#"}` fallback to `"#"` → non-link rows are still anchors with bad hrefs; branch to `<button type="button">` when no href
src/components/Navbar/Navbar.tsx:157-163 — search `<input>` has no label or `aria-label`, only `placeholder` → form-control a11y rule violated
src/components/Navbar/Navbar.tsx:158 — search input `type="text"` (default) should be `type="search"` + `inputmode="search"`
src/components/Navbar/Navbar.tsx:164 — `<kbd>Ctrl K</kbd>` advertised but no handler mounted — misleads keyboard users
src/components/Navbar/Navbar.tsx:132 — `onSearch` fires every keystroke with no debounce — performance foot-gun when consumer hits a network

### src/components/NavigationMenu/NavigationMenu.tsx

src/components/NavigationMenu/NavigationMenu.tsx:163-173 — dropdown `role="menu"` but items are `<a href>` with `role="menuitem"` — OK ARIA pattern; however no `aria-labelledby` linking panel back to trigger
src/components/NavigationMenu/NavigationMenu.tsx:141-144 — leaf items `<a href>` without any `onClick`/prefetch hint — if host app uses router, this forces full page reloads (document that links are `<a>` or accept `as` prop for Router Link)
src/components/NavigationMenu/NavigationMenu.tsx:149-159 — trigger `<button>` has no `aria-controls` linking to dropdown id

### src/components/NumberInput/NumberInput.tsx

src/components/NumberInput/NumberInput.tsx:146 — required `*` span missing `aria-hidden="true"` — screen readers announce the asterisk literally (Input and Autocomplete do this correctly; consistency drift)
src/components/NumberInput/NumberInput.tsx:180-182 — uses `aria-disabled`+`readOnly` instead of native `disabled` when disabled → focusable but non-editable and doesn't visually reflect disabled steppers consistently
src/components/NumberInput/NumberInput.tsx:172 — `type="number"` on mobile gives a numeric keypad but no `inputMode="decimal"` variant for decimal-step use cases
src/components/NumberInput/NumberInput.tsx:108 — silent no-op on `""` or `"-"` mid-edit — correct, but `onChange` never fires for partial states → controlled value and DOM value desync (consider internal uncontrolled mirror)

### src/components/PageHeader/PageHeader.tsx

src/components/PageHeader/PageHeader.tsx:25 — doc says "actions hidden on narrow screens" — critical actions silently disappear on mobile → UX concern; prefer overflow menu
src/components/PageHeader/PageHeader.tsx:43-44 — `<div className="atmosphere" />` + `<div className="grain" />` decorative layers missing `aria-hidden="true"`

### src/components/Pagination/Pagination.tsx

✓ pass — `<nav aria-label="Pagination">`, specific button labels, `aria-current="page"`, proper ellipsis handling

---

## Batch 6: PinInput → Skeleton

### src/components/PinInput/PinInput.tsx

src/components/PinInput/PinInput.tsx:86-88 — `onComplete` fires on "every cell full" but no `aria-live` announcement for AT users on completion
src/components/PinInput/PinInput.tsx:208 — when `mask=true` renders `type="password"`; password managers may offer to save per-cell characters — suppress via `data-1p-ignore`/`data-lpignore` or use `type="text"` + CSS text-security
src/components/PinInput/PinInput.tsx:28-47 — no `required` / `pattern` surface; inconsistent with Input which has `required`

### src/components/Popover/Popover.tsx

src/components/Popover/Popover.tsx:132-141 — same wrapper-div `role="presentation"` + `onClick`/`onKeyDown` pattern as DropdownMenu → double handler layer
src/components/Popover/Popover.tsx:142-145 — `cloneElement` adds `aria-haspopup`/`aria-expanded` but not `aria-controls` pointing to panel id
src/components/Popover/Popover.tsx:164 — close `<button>` missing `type="button"`
src/components/Popover/Popover.tsx:164 — "Close" label is vague → "Close popover"
src/components/Popover/Popover.tsx:132 — trigger wrapper makes the trigger element itself double-clickable (both wrapper and inner element receive click) — use `asChild`/ref pattern instead

### src/components/Progress/Progress.tsx

✓ pass — `role="progressbar"` + full `aria-value*`, indeterminate handled, Spinner uses `role="status"` `aria-live="polite"`

### src/components/ScrollArea/ScrollArea.tsx

src/components/ScrollArea/ScrollArea.tsx:35 — default `aria-label="Scrollable content"` is generic; flag that consumers should override with a meaningful name
✓ otherwise — `role="region"` + `tabIndex={0}` is correct for scrollable region

### src/components/SegmentedControl/SegmentedControl.tsx

src/components/SegmentedControl/SegmentedControl.tsx:105-114 — indicator animates `left`/`width` (layout props, non-compositor) → use `transform: translateX(offset)` + `scaleX(width)` for 60fps
src/components/SegmentedControl/SegmentedControl.tsx:120-143 — disabled segment uses `aria-disabled` + `e.preventDefault()` but is still focusable and can be clicked ignoring the preventDefault fallthrough; also add `disabled` attr or `pointer-events: none` via CSS
src/components/SegmentedControl/SegmentedControl.tsx:46-55 — `measure()` uses `getBoundingClientRect` (acceptable in useEffect, not render)

### src/components/Select/Select.tsx

src/components/Select/Select.tsx:302 — option `<div>` gets `onKeyDown` but `tabIndex={-1}` so never focused → dead handler (typeahead/nav lives on trigger); remove to reduce surface
src/components/Select/Select.tsx:289-321 — options are `<div role="option">` — fine under listbox pattern; however `onMouseEnter` sets `focusedIndex` without movement threshold (4th instance of kb/mouse conflict)
src/components/Select/Select.tsx:86 — fallback `triggerRef.current?.parentElement` for wrapper detection when forwardRef not passed — fragile; track with own `useRef`
src/components/Select/Select.tsx:284-287 — dropdown animates `scaleY` — compositor-friendly but origin defaults to center; should set `transform-origin: top` for natural dropdown feel

### src/components/Sidebar/Sidebar.tsx

src/components/Sidebar/Sidebar.tsx:107-113 — `motion.span` animates `width: 0/auto` — layout prop, non-compositor; for a collapse animation use `scaleX` + clip or CSS grid template columns
src/components/Sidebar/Sidebar.tsx:165-167 — section label removed from DOM when collapsed → AT users lose section grouping entirely; keep label with `aria-label` or visually-hidden class
src/components/Sidebar/Sidebar.tsx:124 — `tabIndex={item.disabled ? -1 : undefined}` on `<a>` — disabled anchor is non-standard; either skip render or use a visibly-disabled `<button>`

### src/components/Skeleton/Skeleton.tsx

✓ pass — `aria-hidden` on shapes; SkeletonGroup uses `role="status"` + `aria-busy="true"`

---

## Batch 7: Slider → Text

### src/components/Slider/Slider.tsx

src/components/Slider/Slider.tsx:190 — native `<input type="range">` receives arrow-key handling natively AND our custom `handleKeyDown` — each keypress moves **two** steps
src/components/Slider/Slider.tsx:199-205 — knob animates `left` (layout prop) → use `transform: translateX(%)` for compositor path
src/components/Slider/Slider.tsx:171-174 — pointer handlers on outer track but capture applied to `e.target` (may be knob/fill/track); capture on trackRef so drag doesn't break when pointer moves over sub-elements

### src/components/Stack/Stack.tsx

✓ pass — layout primitive, polymorphic via `as`

### src/components/Stat/Stat.tsx

src/components/Stat/Stat.tsx:40 — `aria-hidden` without explicit `"true"` (React serializes to correct value but inconsistent with rest of library that uses `aria-hidden="true"`)
src/components/Stat/Stat.tsx:22-24 — `delta` text like "-0.342" is ambiguous to AT (negative = good? bad?); consider `aria-label` on delta span like "decreased by 0.342"

### src/components/Steps/Steps.tsx

src/components/Steps/Steps.tsx:86 — check icon SVG missing `aria-hidden="true"` (every other icon in library has it)
src/components/Steps/Steps.tsx:82-92 — step node reads as bare number ("1", "2") to AT; wrap in `<span className="sr-only">Step {i+1}: </span>` or `aria-label` on node
src/components/Steps/Steps.tsx:86 — missing `fill="none"`/`stroke="currentColor"` on check SVG — relies on CSS; inconsistent with other SVGs

### src/components/Table/Table.tsx

src/components/Table/Table.tsx:170-196 — `<th onClick>` for sort is semantic content (not div/span) but no inner `<button>` → sort action is not announced as actionable by AT; wrap header label in `<button>` inside the `<th>`
src/components/Table/Table.tsx:164 — no `<caption>` support — tables without captions lose context for screen-reader users; add optional `caption` prop
src/components/Table/Table.tsx:137-152 — sorting uses `localeCompare` for strings but no locale parameter — uses default locale which may surprise i18n consumers; accept optional `locale`/`sortFn` prop
src/components/Table/Table.tsx:215-223 — no virtualization for large datasets; rule says ">50 items virtualize" — at minimum document the limit

### src/components/Tabs/Tabs.tsx

src/components/Tabs/Tabs.tsx:133,135,164-165 — ids hardcoded as `tab-${id}` and `panel-${id}` — two Tabs instances sharing any tab `id` collide; prefix with `useId()`
src/components/Tabs/Tabs.tsx:148-155 — indicator animates `left` + `width` (layout) → use `transform: translateX` + `scaleX` (matches SegmentedControl issue)
src/components/Tabs/Tabs.tsx:141 — disabled tab missing native `disabled` attr; currently only `aria-disabled` + onClick gate, still focusable on click

### src/components/Tag/Tag.tsx

src/components/Tag/Tag.tsx:64-98 — interactive Tag wraps dismiss `<button>` inside outer `<motion.button>` → invalid HTML (button-in-button); move dismiss to sibling or use `role="group"` span container with two buttons
src/components/Tag/Tag.tsx:26-28 — `selected` state has no `aria-pressed` on the interactive button → state not announced
src/components/Tag/Tag.tsx:73,104 — user-supplied `icon` not wrapped with `aria-hidden` — decorative icons announced as noise

### src/components/Text/Text.tsx

✓ pass — polymorphic typography primitive

---

## Batch 8: TextArea → Tree

### src/components/TextArea/TextArea.tsx

src/components/TextArea/TextArea.tsx:103 — required `*` span missing `aria-hidden="true"` (same drift as NumberInput)
src/components/TextArea/TextArea.tsx:115-117 — `aria-disabled` + `readOnly` instead of native `disabled` attr → focusable but non-editable
src/components/TextArea/TextArea.tsx:127-130 — character counter has no `aria-live` → over-max state silent to AT; also `currentLength/maxLength` text readable as "50/200" without unit context
src/components/TextArea/TextArea.tsx:24-36 — `Pick` excludes `spellCheck`, `autoComplete`, `maxLength` (HTML-native), `inputMode` → consumers can't set these
src/components/TextArea/TextArea.tsx:78-83 — `autoResize` on every change triggers layout thrash on long inputs; debounce or use `ResizeObserver`

### src/components/ThemeToggle/ThemeToggle.tsx

src/components/ThemeToggle/ThemeToggle.tsx:20-26 — toggle button missing `aria-pressed={isDark}` → toggle state not announced; consider `role="switch"` + `aria-checked` alternative
src/components/ThemeToggle/ThemeToggle.tsx:24 — aria-label text changes on every toggle — works but "Switch to light/dark mode" announces the _future_ state, which some screen readers read as current state. Use `aria-pressed` + static label "Dark mode" instead

### src/components/Timeline/Timeline.tsx

src/components/Timeline/Timeline.tsx:55-60 — status differentiation is color-only (completed/active/error) → fails WCAG 1.4.1 (Use of Color); add icon or text badge per status
src/components/Timeline/Timeline.tsx:65 — `<span>` for timestamp; should be `<time dateTime={iso}>` with ISO attr for semantic time
src/components/Timeline/Timeline.tsx:67 — visual node `<span>` missing `aria-hidden="true"` (purely decorative)
src/components/Timeline/Timeline.tsx:64 — `key={i}` on event (stable key on event.title + timestamp preferred)

### src/components/Toast/Toast.tsx

✓ pass — dual `aria-live` regions (polite + assertive) both mounted at page load (correctly avoids dynamic-region bug), lazy `ToastAnimated`, cleanup on unmount

### src/components/Toggle/Toggle.tsx

src/components/Toggle/Toggle.tsx:38-40 — `aria-checked` injected only for controlled case, but native `<input type="checkbox" role="switch">` with `checked` already exposes state; redundant (not harmful)
src/components/Toggle/Toggle.tsx:78-82 — second label for the text next to the toggle — two `<label htmlFor={id}>` point at same input (spec allows but AT may double-read label)

### src/components/Tooltip/Tooltip.tsx

src/components/Tooltip/Tooltip.tsx:68-77 — `aria-describedby={tooltipId}` set on the **wrapper** div, not the trigger element → AT may not associate tooltip text with the actual control; inject on children via `cloneElement` (Radix pattern)
src/components/Tooltip/Tooltip.tsx:73-77 — no touch/coarse-pointer fallback — mobile users can't access tooltip content
src/components/Tooltip/Tooltip.tsx:61-66 — centering `translateX(-50%)` not RTL-aware (minor — symmetric)
src/components/Tooltip/Tooltip.tsx:35 — `show` timeout not cleared in `hide` before state change (line 39-42 clears it); safe but `show` from rapid enter/leave/enter might leave dangling timer

### src/components/Tree/Tree.tsx

src/components/Tree/Tree.tsx:186-192 — toggle `<span role="presentation">` with `onClick` nested inside `<button>` (treeitem) — click-inside-button; event ordering relies on `stopPropagation` (line 151); works but fragile
src/components/Tree/Tree.tsx:176 — left indent via inline `paddingInlineStart` calculation — fine, RTL-aware via logical prop ✓
src/components/Tree/Tree.tsx:358-368 — Enter/Space both selects _and_ toggles — WAI-ARIA Tree pattern: Enter selects, Space toggles expansion (separate). Current collapses both into one action
src/components/Tree/Tree.tsx:244-245,374-393 — type-ahead timer ref uninitialized at first use; `clearTimeout(undefined)` safe but declare typed correctly

---

## Summary

**Total components audited:** 63 (all of `src/components/*`)
**Fully passing:** 10 — AppBar, AspectRatio, Badge, Divider, Footer, GenCopilot, InputGroup, Kbd, Meter, Pagination, Progress, ScrollArea, Skeleton, Stack, Text, Toast
**Components with findings:** 48

### Top systemic issues (priority-ordered)

1. **Invalid nested interactives** — `<button>` inside `<a>` (Navbar:79-113), `<button>` inside `<button>` (Tag:64-98). HTML spec violation, undefined event dispatch.
2. **Missing `type="button"` on `<button>`** — Banner, Dialog, Popover, ConfirmDialog. Nested-form submit footgun.
3. **Hardcoded ids** (collide across multiple instances) — Drawer, GlobalNav, Tabs. Replace with `useId()`.
4. **Non-compositor animations** — `height`, `width`, `left`, `padding` animated in Alert, Banner, Collapsible, SegmentedControl, Sidebar, Slider, Tabs. Use `transform`/`opacity`.
5. **Mouse/keyboard conflict on `onMouseEnter` setting activeIndex** — Autocomplete, CommandPalette, ContextMenu, DropdownMenu, Select. Needs movement threshold.
6. **Slider double arrow-step** (critical UX bug) — native range + custom keydown both fire.
7. **Headings not real heading tags** — EmptyState (`<p>`), ErrorBoundary (hardcoded `<h1>`), Card (`<h3>`). Outline breaks for AT.
8. **Required marker not `aria-hidden`** — NumberInput, TextArea inconsistent with Input/Autocomplete. Extract `<RequiredMarker>` primitive.
9. **Wrapper `role="presentation"` + click handlers around user trigger** — DropdownMenu, Popover, Select. Radix-style `cloneElement` pattern preferred.
10. **Color-only status** — Timeline variants. Fails WCAG 1.4.1.
11. **No `aria-live` for async state** — ImageUpload, Input error, TextArea counter, PinInput complete. Silent for AT.

### New component (not previously audited)

ImageUpload has 7 findings — should fix before ship. Hasn't been through the a11y pass (commits a8d5fb3, a9de220) that covered other 29 components.

### Reference implementations

Cleanest: Pagination, Progress, Toast, Skeleton. Model other components on these.
