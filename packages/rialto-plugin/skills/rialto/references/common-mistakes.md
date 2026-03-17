# Common Mistakes

Frequent errors when using Rialto, with corrections.

---

## Do / Don't

| Don't | Do | Why |
|-------|-----|-----|
| Hardcode hex colors (`#f8f6f3`, `red`) | Use `var(--rialto-*)` tokens | Tokens support theming and dark mode |
| Import from `"rialto/components/Button"` | Import from `"rialto"` barrel | Subpath imports break tree-shaking guarantees |
| Use gold accent for backgrounds or text | Use `--rialto-accent` only for focus/active/primary | Gold is surgical — never decorative |
| Use CSS transitions for interactive animations | Use Framer Motion presets | Spring physics provide the tactile Rialto feel |
| Use `--luce-*` prefix | Use `--rialto-*` prefix | `--luce-*` is the old prefix, no longer valid |
| Skip `forwardRef` on new components | Always wrap with `React.forwardRef` | Required for ref forwarding, composition, Radix |
| Call `useToast()` without `<ToastProvider>` | Wrap app root with `<ToastProvider>` | Hook depends on provider context |
| Call `useUIEnvironment()` without `<RialtoProvider>` | Wrap app root with `<RialtoProvider>` | Hook depends on provider context |
| Use more than 3 font weights | Stick to 300, 400, 500 | Design constraint: precision restraint |
| Use `margin-left` / `padding-right` | Use `margin-inline-start` / `padding-inline-end` | Logical properties support RTL |
| Hardcode `cubic-bezier()` in CSS | Use `var(--rialto-ease-precision)` or `var(--rialto-ease-smooth)` | Consistent easing across the system |
| Animate without checking reduced motion | Always check `useReducedMotion()` first | Accessibility requirement |

---

## Per-Component Gotchas

### Toast
- **Must have `<ToastProvider>` ancestor** — no provider = runtime error
- Title max 50 chars, description max 120 chars
- Auto-dismisses in ~4 seconds — don't use for errors that need user action

### Dialog / ConfirmDialog
- Title max 60 chars
- Use ConfirmDialog for simple yes/no, Dialog for complex forms
- Never stack multiple modals — nest feedback inside the dialog instead

### Table
- Always provide `rowKey` for efficient rendering
- Use `emptyMessage` prop for empty state (not a separate EmptyState inside)
- Pair with Pagination for paginated data

### Input / Select
- Label max 40 chars, hint/error max 80 chars
- Always provide a `label` — never use placeholder as the only label
- Use `error` prop for field-level validation, Alert for form-level

### Badge
- Children max 20 chars — short status labels only
- Non-interactive — use Tag if you need click/dismiss behavior

### Tag
- Children max 30 chars
- Use TagGroup to wrap multiple tags for proper spacing
- Use AnimatedTag for enter/exit transitions

### Button
- Children max 30 chars
- Use `loading` prop during async operations (disables + shows spinner)
- Dangerous actions: `variant="ghost"` + ConfirmDialog, NOT `variant="primary"` with red color

### Tabs
- Label max 20 chars per tab
- Don't use for sequential flows (use Steps instead)
- Content renders based on `activeId` — you manage the content switching

### Banner
- For page-wide announcements only
- Don't use for field-level validation (use Alert)
- Title max 60 chars

---

## Feedback Routing Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Toast for errors needing user action | User misses error (auto-hides) | Alert (P4) or Dialog (P2) |
| Dialog for success confirmations | Unnecessary interruption | Toast (P5) |
| Banner for field-level validation | Too far from the fault | Alert (P4) next to the field |
| Alert for system-wide announcements | Buried in page content | Banner (P3) at page top |
| ConfirmDialog for non-destructive actions | Modal fatigue | Toast (P5) or skip |
| Tooltip for critical information | Invisible to keyboard/touch users | Alert (P4) or visible text |
| Stacking multiple modals | Confusing focus trap | One modal at a time |

---

## Validation Anti-Patterns

| Wrong | Right |
|-------|-------|
| Toast for field errors | Input `error` prop + optional Alert summary |
| Validating only on submit | Validate on blur per-field, on submit for full form |
| Color-only error indicators | Include text/icon with error color |
| Missing `aria-invalid` on errored fields | Set `aria-invalid="true"` when error is present |
| Focus on submit button after error | Focus first errored field or error summary |
