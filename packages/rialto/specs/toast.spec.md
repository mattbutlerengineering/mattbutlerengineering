# Toast

**Import:** `import { ToastProvider, useToast } from "@mbe/rialto"`
**Category:** Feedback

## Anatomy

```
ToastProvider (wraps app root)
+-- {children}
+-- container (div[role="region"][aria-label="Notifications"])
    +-- polite region (div[aria-live="polite"])    -- info, success, accent, default
        +-- ToastItem (motion.div) per toast
            +-- icon (svg)                         -- success, error, accent variants
            +-- title (p)
            +-- description (p)                    -- optional
            +-- close button (button[aria-label="Dismiss"])
            +-- countdown (motion.div)             -- animated progress bar, auto-dismiss only
    +-- assertive region (div[aria-live="assertive"]) -- error variant only
        +-- ToastItem (motion.div) per error toast
```

Both `aria-live` regions are always mounted — screen readers only register live regions present at page load.

## When to Use

- Transient notifications that do not require user action (success, info)
- Error feedback that must immediately interrupt the user (`variant="error"` uses assertive live region)
- Post-action confirmations ("Saved", "Deleted", "Copied")
- Do NOT use for critical destructive warnings — use a Dialog instead

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Appearing | Slides in from inline-end (x: 80 → 0), fades in | `toast()` call |
| Visible | Resting with countdown bar animating | After appear |
| Auto-dismissing | Removed after duration (default 4000ms) | Timer expiry |
| Manual dismiss | Removed immediately | Close button click or `dismiss(id)` |
| Persistent | No countdown bar, no auto-dismiss | `duration: 0` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-surface-elevated` | Toast background |
| `--rialto-border` | Toast border |
| `--rialto-radius-default` | Toast border radius |
| `--rialto-shadow-lg` | Toast drop shadow |
| `--rialto-text-primary` | Title text color |
| `--rialto-text-secondary` | Description text color |
| `--rialto-success` | Success variant icon and accent |
| `--rialto-error` | Error variant icon and accent |
| `--rialto-accent` | Accent variant icon and bar |

## Hook API

```ts
const { toast, dismiss } = useToast();

// Show a toast
toast({
  title: string;                              // Required
  description?: string;
  variant?: "default" | "success" | "error" | "accent";
  duration?: number;                          // ms, default 4000; 0 = no auto-dismiss
});

// Dismiss programmatically
dismiss(id: string);
```

## Props

> See `registry.json` for authoritative prop types. ToastProvider takes only `children`.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `children` | `ReactNode` | — | Yes | App content — ToastProvider must wrap any component using `useToast()` |

### ToastInput shape (passed to `toast()`)

| Field | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `title` | `string` | — | Yes | Notification heading |
| `description` | `string` | `undefined` | No | Supporting detail text |
| `variant` | `"default" \| "success" \| "error" \| "accent"` | `"default"` | No | Visual treatment and aria-live routing |
| `duration` | `number` | `4000` | No | Auto-dismiss in ms. `0` = manual dismiss only |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role="region"` | container | Landmarks the notification area |
| `aria-label="Notifications"` | container | Labels the region |
| `aria-live="polite"` | polite region | Non-error toasts — announced at next idle |
| `aria-live="assertive"` | assertive region | Error toasts — interrupts immediately |
| `aria-atomic="false"` | polite region | Individual items announced as they arrive |
| `aria-atomic="true"` | assertive region | Full error toast read as a unit |
| `aria-label="Dismiss"` | close button | Identifies the dismiss action |

**Keyboard:** Close button is reachable via `Tab`. `Enter`/`Space` dismisses.
**Screen reader:** Non-error toasts are announced politely (at next pause in speech). Error toasts use the assertive region and interrupt immediately. Both regions are mounted at page load — dynamically-added regions would miss the first announcement.

## Composition Examples

```tsx
// 1. Wrap app root with ToastProvider (do this once in main.tsx)
<RialtoProvider>
  <ToastProvider>
    <App />
  </ToastProvider>
</RialtoProvider>

// 2. Use the hook in any component
function SaveButton() {
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await save();
      toast({ title: "Saved", variant: "success" });
    } catch {
      toast({
        title: "Save failed",
        description: "Check your connection and try again.",
        variant: "error",
      });
    }
  };

  return <Button variant="primary" onClick={handleSave}>Save</Button>;
}

// Persistent toast (manual dismiss only)
toast({ title: "Export in progress", description: "We'll notify you when it's ready.", duration: 0 });
```
