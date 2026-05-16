# Tag / AnimatedTag / TagGroup

**Import:** `import { Tag, AnimatedTag, TagGroup } from "@mattbutlerengineering/rialto"`
**Category:** Data Display

## Anatomy

```
Tag
+-- (when interactive) motion.button -- Framer Motion boop hover
|   +-- icon span (optional) -- icon rendered before label
|   +-- children (string) -- label text
|   +-- dismiss button (optional) -- "Remove {label}" aria-label
+-- (when static) span
    +-- icon span (optional)
    +-- children (string)
    +-- dismiss button (optional)

AnimatedTag (motion.div, layout-animated)
+-- Tag

TagGroup (div with AnimatePresence)
+-- AnimatedTag children
```

Tag renders as a `button` when `onClick` is provided, otherwise as a `span`. The dismiss `×` button is a separate interactive child.

## When to Use

- Categorization labels (read-only `span` form)
- Filter chips (interactive `button` form with `onClick`)
- Dismissible selections (add `dismissible` + `onDismiss`)
- Use `TagGroup` + `AnimatedTag` for animated lists with coordinated enter/exit

## States

| State           | Description                   | Prop/Trigger         |
| --------------- | ----------------------------- | -------------------- |
| Default         | Static label                  | No `onClick`         |
| Interactive     | Renders as button, boop hover | `onClick` provided   |
| Selected        | Gold fill treatment           | `selected={true}`    |
| Dismissible     | Shows × remove button         | `dismissible={true}` |
| With icon       | Icon rendered before label    | `icon` provided      |
| Accent variant  | Gold tint                     | `variant="accent"`   |
| Success variant | Green tint                    | `variant="success"`  |
| Error variant   | Red tint                      | `variant="error"`    |

## Design Tokens Used

| Token                       | Purpose                    |
| --------------------------- | -------------------------- |
| `--rialto-radius-sharp`     | Tag border radius          |
| `--rialto-border`           | Default variant border     |
| `--rialto-surface-elevated` | Default variant background |
| `--rialto-text-secondary`   | Default variant text color |
| `--rialto-accent`           | Accent variant color       |
| `--rialto-success`          | Success variant color      |
| `--rialto-error`            | Error variant color        |
| `--rialto-shadow-xs`        | Tag resting shadow         |
| `--rialto-space-2xs`        | Icon gap, internal spacing |
| `--rialto-text-xs`          | Tag font size              |
| `--rialto-weight-medium`    | Tag font weight            |

## Props — Tag

> See `registry.json` for authoritative prop types.

| Prop          | Type                                            | Default     | Required | Description                           |
| ------------- | ----------------------------------------------- | ----------- | -------- | ------------------------------------- |
| `children`    | `string`                                        | —           | Yes      | Label text                            |
| `variant`     | `"default" \| "accent" \| "success" \| "error"` | `"default"` | No       | Color variant                         |
| `dismissible` | `boolean`                                       | `false`     | No       | Show dismiss button                   |
| `onDismiss`   | `() => void`                                    | `undefined` | No       | Called when dismiss button is clicked |
| `onClick`     | `() => void`                                    | `undefined` | No       | Makes tag an interactive button       |
| `selected`    | `boolean`                                       | `false`     | No       | Gold fill treatment                   |
| `icon`        | `ReactNode`                                     | `undefined` | No       | Icon rendered before label            |

## Props — AnimatedTag

Extends `TagProps` with:

| Prop | Type     | Required | Description                               |
| ---- | -------- | -------- | ----------------------------------------- |
| `id` | `string` | Yes      | Unique key for `AnimatePresence` tracking |

## Accessibility

| Attribute                   | Value                 | Notes                                      |
| --------------------------- | --------------------- | ------------------------------------------ |
| Dismiss button `aria-label` | `"Remove {children}"` | Unique accessible name per tag             |
| `type`                      | `"button"`            | On both interactive tag and dismiss button |

**Keyboard:** Interactive tags (`onClick`) respond to `Enter` and `Space`. Dismiss button is a separate focusable button within the tag.
**Screen reader:** Static tags are read as text. Interactive tags are announced as buttons with the label text. Dismiss button announces as "Remove [label]". When using `AnimatedTag` with `onDismiss`, removal is visually animated but content is immediately removed from the DOM (screen reader reads deletion naturally).

## Composition Examples

```tsx
// Static label
<Tag variant="success">Connected</Tag>

// Interactive filter chip
<Tag onClick={() => toggleFilter("telemetry")} selected={active}>
  Telemetry
</Tag>

// Dismissible with animation
<TagGroup>
  {activeTags.map((tag) => (
    <AnimatedTag
      key={tag}
      id={tag}
      dismissible
      onDismiss={() => removeTag(tag)}
    >
      {tag}
    </AnimatedTag>
  ))}
</TagGroup>
```
