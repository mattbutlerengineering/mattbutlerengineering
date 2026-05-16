# Tabs

**Import:** `import { Tabs } from "@mattbutlerengineering/rialto"`
**Category:** Navigation

## Anatomy

```
Tabs (div wrapper)
+-- div.tabList (role="tablist", tabIndex=-1, onKeyDown)
|   +-- button (role="tab", id="tab-{id}", aria-selected, aria-controls="panel-{id}")
|       -- one per tab; tabIndex=0 if active, -1 otherwise
|   +-- motion.div.indicator -- spring-animated gold underline (aria-hidden)
+-- div.panel (role="tabpanel", id="panel-{id}", aria-labelledby="tab-{id}")
    -- content of the active tab only
```

The `Tab` data type describes both the trigger and panel content together:
```tsx
interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  content: ReactNode;
}
```

## When to Use

- Switching between related views within the same context
- Organizing settings panels, profile sections, or dashboard views
- When content groups are mutually exclusive and fit within the viewport

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Unselected | `tabIndex=-1`, default styling | Not active tab |
| Selected | `tabIndex=0`, gold indicator below | `tab.id === activeId` |
| Disabled | `aria-disabled=true`, click ignored | `tab.disabled=true` |
| Indicator animating | Gold bar slides to active tab position | Tab change |
| Reduced motion | Indicator snaps without animation | `prefers-reduced-motion: reduce` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-accent` | Active indicator color (gold underline) |
| `--rialto-text-primary` | Active tab label color |
| `--rialto-text-tertiary` | Inactive tab label color |
| `--rialto-text-secondary` | Disabled tab label color |
| `--rialto-border` | Tab list bottom border |
| `--rialto-space-md` | Tab horizontal padding |
| `--rialto-space-sm` | Tab vertical padding |
| `--rialto-space-lg` | Panel top padding |
| `--rialto-text-sm` | Tab label font size |
| `--rialto-weight-medium` | Active tab font weight |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `tabs` | `Tab[]` | — | Yes | Array of tab objects with `id`, `label`, `content`, and optional `disabled` |
| `defaultTab` | `string` | First tab's `id` | No | Tab `id` to show on first render |
| `onTabChange` | `(tabId: string) => void` | `undefined` | No | Called when active tab changes |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"tablist"` | On the tab list container |
| `role` | `"tab"` | On each tab button |
| `role` | `"tabpanel"` | On the active panel |
| `aria-selected` | `true \| false` | On each tab button |
| `aria-controls` | `"panel-{id}"` | Links tab to its panel |
| `id` | `"tab-{id}"` | Tab button ID (referenced by panel) |
| `aria-labelledby` | `"tab-{id}"` | Panel references its controlling tab |
| `aria-disabled` | `true` | On disabled tab buttons |
| `tabIndex` | `0` | Active tab only — roving tabindex pattern |
| `tabIndex` | `-1` | Inactive tabs — keyboard navigable via arrows |

**Keyboard:**
- `Tab` / `Shift+Tab` — moves focus to/from the tab list (lands on active tab)
- `ArrowRight` / `ArrowLeft` — moves focus between tabs, auto-activates the focused tab
- `Home` — moves to the first enabled tab
- `End` — moves to the last enabled tab
- Disabled tabs are skipped by arrow key navigation

**Screen reader:** Tab role and `aria-selected` state are announced. Panel content is associated with its tab via `aria-labelledby`. Changing tabs activates the panel immediately (auto-activate pattern, not manual activation).

## Composition Examples

```tsx
// Basic tabs
<Tabs
  tabs={[
    { id: "overview", label: "Overview", content: <OverviewPanel /> },
    { id: "telemetry", label: "Telemetry", content: <TelemetryPanel /> },
    { id: "history", label: "History", content: <HistoryPanel /> },
  ]}
  defaultTab="overview"
  onTabChange={(id) => console.log("Active:", id)}
/>

// With disabled tab
<Tabs
  tabs={[
    { id: "active", label: "Active", content: <ActiveContent /> },
    { id: "archived", label: "Archived", content: <ArchivedContent />, disabled: true },
  ]}
/>
```
