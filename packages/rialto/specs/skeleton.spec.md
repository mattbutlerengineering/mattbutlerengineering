# Skeleton / SkeletonGroup

**Import:** `import { Skeleton, SkeletonGroup } from "@mbe/rialto"`
**Category:** Feedback

## Anatomy

```
SkeletonGroup (div, role="status", aria-busy="true", aria-label="Loading content")
+-- Skeleton (div, aria-hidden="true") -- individual pulsing bone
+-- Skeleton (div, aria-hidden="true") -- compose as many as needed
```

The two components have distinct roles:
- **SkeletonGroup** — semantic container. Announces the loading state to screen readers via `role="status"` and `aria-busy="true"`. Acts as an `aria-live` region.
- **Skeleton** — visual-only placeholder bone. Always `aria-hidden="true"` — never read aloud by screen readers.

## When to Use

- While data is loading, before real content is available
- Replace content regions (avatars, text blocks, cards) with matching skeleton shapes
- Always use `SkeletonGroup` to wrap multiple `Skeleton` elements — it provides the semantic loading announcement

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Animating | Continuous shimmer pulse | Default (CSS animation) |
| Reduced motion | Solid fill, no animation | `prefers-reduced-motion: reduce` |

## Skeleton Variants

| Variant | Border Radius | Typical Use |
|---------|--------------|-------------|
| `rect` (default) | `--rialto-radius-sharp` | Generic block, image placeholder |
| `text` | `--rialto-radius-round` | Body text line |
| `heading` | `--rialto-radius-round` | Heading text line |
| `circle` | `--rialto-radius-round` | Avatar, icon placeholder |
| `card` | `--rialto-radius-soft` | Card-shaped placeholder |

## Props — Skeleton

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `variant` | `"text" \| "heading" \| "circle" \| "rect" \| "card"` | `"rect"` | No | Shape variant |
| `width` | `string \| number` | `undefined` | No | Explicit width (CSS value or px number) |
| `height` | `string \| number` | `undefined` | No | Explicit height (CSS value or px number) |
| `lines` | `number` | `1` | No | Number of text lines (only for `text`/`heading` variants) |
| `gap` | `string \| number` | `8` | No | Gap between lines in px |

**Note on `lines`:** When `lines > 1` with `text` or `heading` variant, a flex column wrapper is rendered. The last line is automatically shortened to 60% width for a natural paragraph look.

**Note on `circle`:** When `variant="circle"` and only `width` is provided, height auto-matches width for a perfect circle.

## Props — SkeletonGroup

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `children` | `ReactNode` | — | Yes | One or more `Skeleton` elements |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"status"` | On `SkeletonGroup` — announces loading state |
| `aria-busy` | `"true"` | On `SkeletonGroup` — indicates async operation in progress |
| `aria-label` | `"Loading content"` | On `SkeletonGroup` — describes the loading region |
| `aria-hidden` | `"true"` | On every `Skeleton` bone — visual-only, not read aloud |

**Keyboard:** Not interactive — no keyboard behavior.
**Screen reader:** `SkeletonGroup` is announced as "Loading content" via its `role="status"`. Individual `Skeleton` bones are hidden from the accessibility tree. When the real content replaces the `SkeletonGroup`, screen readers pick up the new content naturally.

## Composition Examples

```tsx
// Single bone
<Skeleton variant="rect" width="100%" height={200} />

// Multi-line text paragraph
<Skeleton variant="text" lines={3} width="100%" />

// Semantic loading card
<SkeletonGroup>
  <Stack direction="row" gap="sm" align="center">
    <Skeleton variant="circle" width={40} />
    <Stack direction="column" gap="xs">
      <Skeleton variant="heading" width={160} />
      <Skeleton variant="text" width={120} />
    </Stack>
  </Stack>
</SkeletonGroup>
```
