# Tooltip

**Import:** `import { Tooltip } from "@mbe/rialto"`
**Category:** Overlay

## Anatomy

```
Tooltip (div.wrapper — event handler host)
+-- children (trigger element — wrapped, not cloned)
+-- AnimatePresence
    +-- motion.div (role="tooltip") -- tooltip bubble (conditional, when open)
        +-- content (ReactNode) -- tooltip text
```

The trigger element is rendered as a child of the wrapper `div`. The tooltip bubble is conditionally mounted via `AnimatePresence` — it is only in the DOM when visible.

## When to Use

- Short supplemental text for icon buttons or truncated labels
- Providing context for abbreviations or technical terms
- NOT for required information — critical content must be visible without hover/focus
- NOT for interactive content — tooltips cannot contain buttons or links

## States

| State | Description | Trigger |
|-------|-------------|---------|
| Hidden | Tooltip unmounted from DOM | Default (no interaction) |
| Pending | Timer running before show | Mouse enter or focus |
| Visible | Tooltip mounted and animated in | After `delay` ms |
| Exiting | Tooltip animates out | Mouse leave or blur |
| Reduced motion | No enter/exit animation (opacity only) | `prefers-reduced-motion: reduce` |

## Placement

| Value | Position |
|-------|----------|
| `top` (default) | Above trigger, centered |
| `bottom` | Below trigger, centered |
| `left` | Left of trigger, vertically centered |
| `right` | Right of trigger, vertically centered |

The tooltip uses `translate` for centering (not absolute positioning offsets) so it stays centered regardless of trigger width.

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-surface-elevated` | Tooltip background |
| `--rialto-border` | Tooltip border |
| `--rialto-radius-default` | Tooltip border radius |
| `--rialto-shadow-md` | Tooltip shadow |
| `--rialto-text-primary` | Tooltip text color |
| `--rialto-text-xs` | Tooltip font size |
| `--rialto-space-xs` | Tooltip horizontal padding |
| `--rialto-space-2xs` | Tooltip vertical padding |
| `--rialto-ease-precision` | Enter/exit transition easing |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `content` | `ReactNode` | — | Yes | Text or content displayed in the tooltip bubble |
| `children` | `ReactNode` | — | Yes | The trigger element |
| `placement` | `"top" \| "bottom" \| "left" \| "right"` | `"top"` | No | Tooltip position relative to trigger |
| `delay` | `number` | `400` | No | Milliseconds before showing after hover/focus |
| `showOnFocus` | `boolean` | `true` | No | Whether tooltip shows on keyboard focus (default: true) |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"tooltip"` | On the tooltip bubble element |

**Important distinction:** The tooltip does NOT use `aria-describedby` on the trigger element. The tooltip bubble has `role="tooltip"` and is announced by screen readers when it becomes visible (because screen readers monitor `role="tooltip"` elements appearing in the DOM). Screen readers do NOT announce tooltip content on hover — only on focus (when `showOnFocus=true`).

**Keyboard:** `Tab` / `Shift+Tab` to focus the trigger element. When `showOnFocus=true`, tooltip appears after `delay` ms. `Blur` hides the tooltip. Focus does NOT move into the tooltip.

**Screen reader:**
- Tooltip content is announced when the tooltip becomes visible via focus
- The trigger element itself must have its own accessible name — the tooltip supplements it, it does not replace it
- For icon-only buttons, use `aria-label` on the button directly; use `Tooltip` for sighted users only, or set `showOnFocus=false` if redundant with `aria-label`
- Never put interactive elements (links, buttons) inside tooltip `content`

## Composition Examples

```tsx
// Icon button with tooltip
<Tooltip content="Copy to clipboard" placement="top">
  <IconButton aria-label="Copy to clipboard" icon={<CopyIcon />} />
</Tooltip>

// Abbreviated term
<Tooltip content="Personal best lap time">
  <abbr>PB</abbr>
</Tooltip>

// Immediate show (no delay)
<Tooltip content="Settings" delay={0} placement="right">
  <button aria-label="Settings"><SettingsIcon /></button>
</Tooltip>

// Focus-only (no hover tooltip)
<Tooltip content="Required field" showOnFocus placement="bottom">
  <Input label="Email" />
</Tooltip>
```
