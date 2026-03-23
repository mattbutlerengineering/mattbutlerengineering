# Button

**Import:** `import { Button } from "@mbe/rialto"`
**Category:** Form

## Anatomy

```
Button (motion.button)
+-- children  -- label text or icon + text combination
```

Uses Framer Motion for tactile press feedback (scale + translateY on press). Respects `prefers-reduced-motion`.

## When to Use

- Any clickable action: form submission, dialog triggers, toolbar controls
- Primary actions use `variant="primary"` (gold fill) — one per section
- Default secondary actions use `variant="secondary"` (aluminum)
- Low-emphasis actions use `variant="ghost"` (transparent)

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Default | Resting with subtle shadow | No interaction |
| Hover | Lifts 1px (`translateY(-1px)`), shadow intensifies | Mouse hover |
| Primary hover | Inner-light sweep animation plays once | Mouse hover on `primary` |
| Pressed | Scale 0.975, translates down 1px | Mouse down / tap |
| Focus | Gold glow ring via `composes: focusRing` | Keyboard focus |
| Disabled | Desaturated, no pointer events, no motion | `disabled={true}` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-radius-default` | Border radius |
| `--rialto-font-sans` | Font family |
| `--rialto-text-sm` | Default font size (md) |
| `--rialto-text-xs` | sm size font |
| `--rialto-text-base` | lg size font |
| `--rialto-weight-medium` | Font weight |
| `--rialto-tracking-wide` | Letter spacing |
| `--rialto-space-xs` | md vertical padding |
| `--rialto-space-md` | md horizontal padding |
| `--rialto-space-2xs` | sm vertical padding |
| `--rialto-space-sm` | sm horizontal padding / lg vertical padding |
| `--rialto-space-lg` | lg horizontal padding |
| `--rialto-accent` | Primary variant border and fill gradient end |
| `--rialto-accent-hover` | Primary variant fill gradient start |
| `--rialto-accent-muted` | Ghost variant hover background |
| `--rialto-text-on-accent` | Primary variant text color |
| `--rialto-text-primary` | Secondary variant text color |
| `--rialto-text-secondary` | Ghost variant text color |
| `--rialto-shadow-pressed` | Inset shadow on secondary press |
| `--rialto-surface-recessed` | Secondary pressed background |
| `--rialto-ease-precision` | Box-shadow transition easing |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `variant` | `"primary" \| "secondary" \| "ghost"` | `"secondary"` | No | Visual treatment |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | No | Padding and font size |
| `disabled` | `boolean` | `undefined` | No | Disables all interactions and motion |
| `type` | `"button" \| "submit" \| "reset"` | `"button"` | No | Native button type |
| `onClick` | `MouseEventHandler` | `undefined` | No | Click handler |
| `aria-label` | `string` | `undefined` | No | Accessible label for icon-only buttons |
| `children` | `ReactNode` | — | Yes | Button label; wrap with `<span aria-live="polite">` for dynamic labels |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| element | `<button>` | Native button — keyboard accessible by default |
| `disabled` | HTML attribute | Removes from tab order and announces as "dimmed" |
| Focus ring | Gold glow | Applied via `composes: focusRing` on `:focus-visible` |

**Keyboard:** `Tab` to focus, `Enter`/`Space` to activate.

**Screen reader:** Announces button label. Use `aria-label` for icon-only buttons. For buttons with loading state, wrap the label in `<span aria-live="polite">` so state changes are announced.

## Composition Examples

```tsx
// Primary action
<Button variant="primary" onClick={handleSave}>Save changes</Button>

// Secondary default
<Button onClick={handleCancel}>Cancel</Button>

// Ghost for toolbar
<Button variant="ghost" size="sm" aria-label="Edit">
  <Pencil size={14} />
</Button>

// Disabled with intent
<Button variant="primary" disabled>Submit</Button>

// Size variants side by side
<Stack direction="row" gap="sm" align="center">
  <Button size="sm">Small</Button>
  <Button size="md">Medium</Button>
  <Button size="lg">Large</Button>
</Stack>
```
