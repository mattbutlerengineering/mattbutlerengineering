# Stat

**Import:** `import { Stat } from "@mattbutlerengineering/rialto"`
**Category:** Data Display

## Anatomy

```
Stat (div, role="group", aria-label={label})
+-- label (span) -- uppercase metric label text
+-- value (span) -- prominent metric value
+-- delta (span, optional) -- trend arrow SVG (aria-hidden) + change text
```

## When to Use

- Dashboard KPI cards where a single metric needs prominence
- Summary panels showing real-time values with trend direction
- Race telemetry, analytics stats, or any scalar metric readout

## States

| State | Description | Prop/Trigger |
|-------|-------------|--------------|
| Default | Label + value only | No `delta` or `trend` |
| With trend up | Green delta with upward arrow | `trend="up"` |
| With trend down | Red delta with downward arrow | `trend="down"` |
| With neutral trend | Tertiary-colored delta, no arrow | `trend="neutral"` (default) |
| Small | Reduced value font size | `size="sm"` |
| Large | Increased value font size | `size="lg"` |

## Design Tokens Used

| Token | Purpose |
|-------|---------|
| `--rialto-space-2xs` | Gap between label/value/delta |
| `--rialto-space-md` | Component padding |
| `--rialto-radius-soft` | Container border radius |
| `--rialto-font-sans` | Label font |
| `--rialto-font-mono` | Value and delta font |
| `--rialto-text-xs` | Label and delta font size |
| `--rialto-text-xl` | Value font size (md, default) |
| `--rialto-text-lg` | Value font size (sm) |
| `--rialto-text-2xl` | Value font size (lg) |
| `--rialto-weight-light` | Value font weight |
| `--rialto-weight-medium` | Label font weight |
| `--rialto-tracking-tight` | Value letter-spacing |
| `--rialto-tracking-wide` | Label letter-spacing |
| `--rialto-text-primary` | Value color |
| `--rialto-text-tertiary` | Label color and neutral delta color |
| `--rialto-success` | Up-trend delta color |
| `--rialto-error` | Down-trend delta color |

## Props

> See `registry.json` for authoritative prop types.

| Prop | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `value` | `ReactNode` | — | Yes | The metric value (e.g. `"1:25.410"`) |
| `label` | `string` | — | Yes | Descriptive label (e.g. `"Lap Time"`) |
| `delta` | `string` | `undefined` | No | Change indicator (e.g. `"-0.342"`) |
| `trend` | `"up" \| "down" \| "neutral"` | `"neutral"` | No | Direction of the change |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | No | Display size |

## Accessibility

| Attribute | Value | Notes |
|-----------|-------|-------|
| `role` | `"group"` | Groups label + value + delta semantically |
| `aria-label` | `{label}` | Announces the metric name as the group label |
| Trend arrow SVG | `aria-hidden="true"` | Visual decoration; trend conveyed by delta text |

**Keyboard:** Not interactive — no keyboard behavior.
**Screen reader:** Announces as a labeled group. Screen reader reads label first, then value, then delta text. Trend direction is conveyed by the delta string itself (e.g. `"-0.342"` implies down).

## Composition Examples

```tsx
// Basic metric
<Stat label="Lap Time" value="1:25.410" />

// With trend indicator
<Stat
  label="Lap Time"
  value="1:25.410"
  delta="-0.342"
  trend="down"
/>

// Dashboard row
<Stack direction="row" gap="lg">
  <Stat label="Total Laps" value="42" />
  <Stat label="Best Lap" value="1:24.068" delta="-1.342" trend="down" />
  <Stat label="Top Speed" value="312 km/h" delta="+8" trend="up" />
</Stack>
```
