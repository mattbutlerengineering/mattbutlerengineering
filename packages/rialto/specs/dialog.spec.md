# Dialog

**Import:** `import { Dialog } from "@mbe/rialto"`
**Category:** Overlay

## Anatomy

```
AnimatePresence (Framer Motion — controls mount/unmount)
+-- motion.div.overlay (backdrop, onClick closes on backdrop click)
    +-- motion.div.panel (role="dialog", aria-modal, aria-label={title})
        +-- div.header
        |   +-- h2.title (optional) -- dialog title heading
        |   +-- button.close -- "Close dialog" aria-label
        +-- p.description (optional) -- descriptive text
        +-- children -- body content slot
        +-- div.footer (optional) -- fixed footer area
```

The `panel` element is the dialog container. It uses `aria-label={title}` rather than `aria-labelledby` because the title is always a direct child.

## When to Use

- Confirming irreversible actions (combined with title + footer actions)
- Forms that require focused attention (isolated from surrounding context)
- Alerts that require user acknowledgment
- Use `ConfirmDialog` for simple yes/no confirmations

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Closed | Unmounted from DOM | `open={false}` |
| Opening | Backdrop fades in, panel slides up with spring | `open` changes to `true` |
| Open | Focus trapped inside panel | `open={true}` |
| Closing | Panel exits, backdrop fades out | `open` changes to `false` |
| Reduced motion | No enter/exit animation | `prefers-reduced-motion: reduce` |

## Focus Behavior

The Dialog implements two coordinated focus effects (declared in order):

1. **Focus return (triggerRef):** On `open`, captures `document.activeElement` as `triggerRef.current`. On close, restores focus to `triggerRef.current` via `requestAnimationFrame` after exit animation completes.
2. **Focus trap:** On `open`, queries all focusable elements inside the panel, focuses the first one, and intercepts `Tab`/`Shift+Tab` to cycle within the panel boundary.

The triggerRef effect is declared **before** the focus-trap effect — this ensures `activeElement` is captured before the trap moves focus.

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-surface-elevated` | Panel background |
| `--rialto-border` | Panel border |
| `--rialto-radius-soft` | Panel border radius |
| `--rialto-shadow-lg` | Panel box shadow (modal elevation) |
| `--rialto-shadow-glass` | Backdrop visual treatment |
| `--rialto-text-primary` | Title and body text |
| `--rialto-text-secondary` | Description text |
| `--rialto-space-lg` | Panel internal padding |
| `--rialto-space-md` | Header and footer padding |
| `--rialto-ease-precision` | Backdrop fade transition |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `open` | `boolean` | — | Yes | Controls dialog visibility |
| `onClose` | `() => void` | — | Yes | Called on Escape key or backdrop click |
| `title` | `string` | `undefined` | No | Dialog title (also used as `aria-label`) |
| `description` | `string` | `undefined` | No | Descriptive subtitle text |
| `children` | `ReactNode` | `undefined` | No | Body content |
| `footer` | `ReactNode` | `undefined` | No | Footer slot (rendered below body) |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"dialog"` | On the panel element |
| `aria-modal` | `true` | Indicates modal context to screen readers |
| `aria-label` | `{title}` | Labels the dialog for screen reader announcement |
| Close button `aria-label` | `"Close dialog"` | Explicit accessible name |

**Keyboard:**
- `Escape` closes the dialog
- `Tab` / `Shift+Tab` cycles focus only within the dialog (focus trap)
- All focusable elements inside the dialog remain reachable

**Screen reader:**
- On open: announces "dialog" role and the `title` value (via `aria-label`)
- Focus moves to the first focusable element inside the panel on open
- On close: focus returns to the element that triggered the dialog (`triggerRef` pattern)
- Screen readers using virtual cursor mode should treat `aria-modal="true"` as a signal to restrict browsing to the dialog region

## Composition Examples

```tsx
// Basic confirmation dialog
const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Delete record</Button>

<Dialog
  open={open}
  onClose={() => setOpen(false)}
  title="Delete record?"
  description="This action cannot be undone."
  footer={
    <Stack direction="row" gap="sm" justify="end">
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="danger" onClick={handleDelete}>Delete</Button>
    </Stack>
  }
/>

// Form dialog
<Dialog open={open} onClose={() => setOpen(false)} title="Edit profile">
  <Stack direction="column" gap="md">
    <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
    <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
  </Stack>
</Dialog>
```
