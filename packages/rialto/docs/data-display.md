# Data Display Components

Presenting information to users.

## Quick Reference {#quick-reference}

| Need               | Component  |
| ------------------ | ---------- |
| Content containers | `Card`     |
| Structured data    | `Table`    |
| Status indicators  | `Badge`    |
| Selectable labels  | `Tag`      |
| User images        | `Avatar`   |
| Metric display     | `Stat`     |
| Key-value pairs    | `DataList` |
| Gauge display      | `Meter`    |
| Event sequence     | `Timeline` |

---

## Card {#card}

Content container with surface treatments.

### When to Use {#card-when-to-use}

- Grouping related content
- Creating visual hierarchy
- As a base for interactive elements

### When NOT to Use {#card-when-not-to-use}

- Full-page layouts → Use `Stack` or page structure
- Simple dividers → Use `Divider`

### Props {#card-props}

| Prop       | Type                              | Required | Default      | Description   |
| ---------- | --------------------------------- | -------- | ------------ | ------------- |
| `variant`  | `'elevated' \| 'glass' \| 'flat'` | No       | `'elevated'` | Visual style  |
| `title`    | `string`                          | No       | -            | Card title    |
| `subtitle` | `string`                          | No       | -            | Card subtitle |

### States {#card-states}

| State    | Description                |
| -------- | -------------------------- |
| Default  | Varies by variant          |
| Elevated | Subtle shadow, polished    |
| Glass    | Translucent, blur backdrop |
| Flat     | No shadow, matte           |

### Accessibility {#card-accessibility}

- Use semantic HTML inside (headings, paragraphs)
- No ARIA required unless interactive

### WCAG Conformance {#card-wcag-conformance}

| Criterion                        | Level | How                                                                              |
| -------------------------------- | ----- | -------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Use semantic HTML inside Card (headings, paragraphs, lists) to convey structure  |
| 1.3.2 Meaningful Sequence (A)    | A     | DOM order of Card content matches visual reading order                           |
| 1.4.11 Non-text Contrast (AA)    | AA    | Card border or shadow provides at least 3:1 contrast against the page background |

### Common Mistakes {#card-common-mistakes}

| Mistake                                                                        | Impact                                                                               | Fix                                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Wrong heading level inside Card, breaking document outline                     | Screen reader users lose page structure and cannot navigate by headings              | Choose the heading level that fits the page hierarchy, not the Card's visual size |
| Wrapping an entire Card in an `<a>` or `<button>` without accessible labelling | Assistive tech announces all inner content as one long label                         | Add a concise `aria-label` or use an inner link/button as the interactive target  |
| Nesting interactive elements inside a clickable Card                           | Click targets overlap, causing unpredictable behavior for keyboard and pointer users | Designate a single interactive element or use `aria-describedby` patterns         |

### Visual Design {#card-visual-design}

- **Elevated**: `--rialto-surface-elevated`, shadow, radius `--rialto-radius-soft`
- **Glass**: `backdrop-filter: blur(20px)`, semi-transparent
- **Flat**: `--rialto-surface`, no shadow
- **Padding**: `--rialto-space-lg`

### Animation {#card-animation}

- Hover: subtle lift on elevated variant
- Respects `prefers-reduced-motion`

### Related {#card-related}

- `Stack` — Layout container
- `Dialog` — Modal container

### Example {#card-example}

```tsx
<Card title="Profile" subtitle="User information">
  <p>Card content here</p>
</Card>

<Card variant="glass" title="Featured">
  <p>Translucent card</p>
</Card>
```

---

## Table {#table}

Structured data in rows and columns.

### When to Use {#table-when-to-use}

- Displaying datasets
- Comparing multiple records
- Sortable data

### When NOT to Use {#table-when-not-to-use}

- Single record → Use `DataList` or `Stat`
- Complex layouts → Use custom grid

### Props {#table-props}

| Prop      | Type              | Required | Default | Description        |
| --------- | ----------------- | -------- | ------- | ------------------ |
| `columns` | `Column[]`        | Yes      | -       | Column definitions |
| `data`    | `any[]`           | Yes      | -       | Row data           |
| `rowKey`  | `(row) => string` | Yes      | -       | Row identifier     |
| `striped` | `boolean`         | No       | `false` | Alternating rows   |

### States {#table-states}

| State             | Description            |
| ----------------- | ---------------------- |
| Default           | Header + rows          |
| Hover (row)       | Subtle highlight       |
| Striped           | Alternating background |
| Sortable (header) | Arrow indicator        |

### Accessibility {#table-accessibility}

- `role="table"`, `role="row"`, `role="columnheader"`, `role="cell"`
- Sortable headers keyboard accessible
- `aria-sort` on sortable columns

### WCAG Conformance {#table-wcag-conformance}

| Criterion                        | Level | How                                                                                                                |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships (A) | A     | Uses `role="table"` with proper `role="columnheader"` and `role="cell"` semantics; `aria-sort` on sortable columns |
| 1.3.2 Meaningful Sequence (A)    | A     | Column and row order in the DOM matches the visual left-to-right, top-to-bottom reading order                      |
| 1.4.11 Non-text Contrast (AA)    | AA    | Row borders and header background provide at least 3:1 contrast against adjacent surfaces                          |

### Common Mistakes {#table-common-mistakes}

| Mistake                                                  | Impact                                                            | Fix                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Missing `<th>` or `role="columnheader"` on header cells  | Screen readers cannot announce column names when navigating cells | Use `<th scope="col">` or `role="columnheader"` for every header cell                               |
| No `aria-sort` on sortable columns                       | Users cannot tell which column is sorted or in which direction    | Set `aria-sort="ascending"`, `"descending"`, or `"none"` on each sortable header                    |
| Relying only on an arrow icon to indicate sort direction | Screen reader users receive no sort information                   | Pair the visual arrow with `aria-sort` so the state is programmatically exposed                     |
| Table scrolls horizontally with no indication            | Keyboard users may not discover off-screen columns                | Wrap in a `tabindex="0"` container with `role="region"` and an `aria-label` like "Scrollable table" |

### Visual Design {#table-visual-design}

- **Header**: Gradient, `--rialto-surface-recessed`, bold
- **Row**: `--rialto-surface`, 48px height
- **Striped**: Alternating `--rialto-surface-matte`
- **Border**: `--rialto-border` between rows
- **Sortable**: Gold arrow on active

### Animation {#table-animation}

- Hover: background transition 100ms

### Responsiveness {#table-responsiveness}

- Horizontal scroll on overflow
- Consider collapsing columns on mobile

### Related {#table-related}

- `Pagination` — With paginated data
- `DataList` — Single record

### Example {#table-example}

```tsx
<Table
  columns={[
    { key: "name", header: "Name", sortable: true },
    { key: "email", header: "Email" },
  ]}
  data={users}
  rowKey={(u) => u.id}
  striped
/>
```

---

## Badge {#badge}

Small status indicator.

### When to Use {#badge-when-to-use}

- Status indicators (online, offline)
- Counts (notifications)
- Labels (version, tier)

### When NOT to Use {#badge-when-not-to-use}

- Large text → Use `Tag`
- Interactive elements → Use `Tag`

### Props {#badge-props}

| Prop       | Type                                            | Required | Default     | Description |
| ---------- | ----------------------------------------------- | -------- | ----------- | ----------- |
| `variant`  | `'neutral' \| 'accent' \| 'success' \| 'error'` | No       | `'neutral'` | Color       |
| `size`     | `'sm' \| 'md'`                                  | No       | `'md'`      | Size        |
| `dot`      | `boolean`                                       | No       | `false`     | Status dot  |
| `children` | `ReactNode`                                     | Yes      | -           | Badge text  |

### States {#badge-states}

| State   | Description                     |
| ------- | ------------------------------- |
| Default | Solid background                |
| Dot     | Animated pulse (success/accent) |

### Accessibility {#badge-accessibility}

- `role="status"` for status badges
- `aria-label` for custom text

### WCAG Conformance {#badge-wcag-conformance}

| Criterion                        | Level | How                                                                                       |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses `role="status"` so assistive tech treats the badge as a live-region status indicator |
| 1.3.2 Meaningful Sequence (A)    | A     | Badge appears adjacent to the element it describes, matching visual placement             |
| 1.4.11 Non-text Contrast (AA)    | AA    | Badge background provides at least 3:1 contrast against the surrounding surface           |

### Common Mistakes {#badge-common-mistakes}

| Mistake                                                      | Impact                                        | Fix                                                                                |
| ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Relying on color alone to convey status (e.g., green vs red) | Color-blind users cannot distinguish states   | Pair color with text labels or icons (e.g., "Online" text alongside the green dot) |
| Missing `role="status"` on status badges                     | Screen readers do not announce status changes | Add `role="status"` so updates are announced as a live region                      |
| Dot-only badge with no accessible text                       | Screen readers announce nothing for the badge | Provide visually hidden text or `aria-label` describing the status                 |

### Visual Design {#badge-visual-design}

- **Radius**: `--rialto-radius-sharp` (2px)
- **Padding**: `--rialto-space-2xs` vertical, `--rialto-space-xs` horizontal
- **Sizes**: sm (12px font), md (13px font)
- **Dot**: 8px circle, positioned left

### Animation {#badge-animation}

- Dot: pulse animation for online/active states
- Respects `prefers-reduced-motion`

### Related {#badge-related}

- `Tag` — Larger, interactive
- `Stat` — Metric display

### Example {#badge-example}

```tsx
<Badge variant="success">Online</Badge>
<Badge variant="error" dot>Offline</Badge>
<Badge size="sm" variant="accent">PRO</Badge>
```

---

## Tag {#tag}

Selectable label for filtering.

### When to Use {#tag-when-to-use}

- Multi-select filters
- Categories
- Selected removable items

### When NOT to Use {#tag-when-not-to-use}

- Status → Use `Badge`
- Binary state → Use `Toggle`

### Props {#tag-props}

| Prop          | Type                                            | Required | Default     | Description    |
| ------------- | ----------------------------------------------- | -------- | ----------- | -------------- |
| `variant`     | `'default' \| 'accent' \| 'success' \| 'error'` | No       | `'default'` | Color          |
| `selected`    | `boolean`                                       | No       | `false`     | Selected state |
| `dismissible` | `boolean`                                       | No       | `false`     | Remove button  |
| `onClick`     | `() => void`                                    | No       | -           | Click handler  |

### States {#tag-states}

| State       | Description                     |
| ----------- | ------------------------------- |
| Default     | Neutral background              |
| Hover       | Slight darken                   |
| Selected    | Variant background, gold border |
| Dismissible | Shows X button on hover         |

### Accessibility {#tag-accessibility}

- `role="button"` when interactive
- `aria-pressed` when selectable
- Keyboard: Enter/Space to toggle

### WCAG Conformance {#tag-wcag-conformance}

| Criterion                        | Level | How                                                                               |
| -------------------------------- | ----- | --------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses `role="button"` when interactive; `aria-pressed` communicates selected state |
| 1.3.2 Meaningful Sequence (A)    | A     | Tags appear in DOM order matching their visual arrangement                        |
| 1.4.11 Non-text Contrast (AA)    | AA    | Tag border and background provide at least 3:1 contrast against the page surface  |

### Common Mistakes {#tag-common-mistakes}

| Mistake                                             | Impact                                                         | Fix                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Missing keyboard interaction when Tag is selectable | Keyboard-only users cannot toggle the tag                      | Render as a `<button>` or add `tabindex="0"` with Enter/Space key handlers |
| No `aria-pressed` on selectable tags                | Screen reader users cannot tell whether the tag is selected    | Set `aria-pressed="true"` or `"false"` to reflect the current state        |
| Dismiss button has no accessible label              | Screen readers announce "X" or nothing for the dismiss control | Add `aria-label="Remove [tag name]"` to the dismiss button                 |

### Visual Design {#tag-visual-design}

- **Radius**: `--rialto-radius-sharp` (2px)
- **Padding**: `--rialto-space-xs` horizontal, `--rialto-space-2xs` vertical
- **Default**: `--rialto-surface-elevated`
- **Variant fills**: accent (gold), success (green), error (red)
- **Dismiss icon**: 12px X

### Animation {#tag-animation}

- Select: spring background transition
- Dismiss: spring animation on removal
- Respects `prefers-reduced-motion`

### Related {#tag-related}

- `Badge` — Status only
- `Checkbox` — Multiple selection

### Example {#tag-example}

```tsx
<Tag selected onClick={toggle}>Active</Tag>
<Tag variant="error" dismissible onDismiss={remove}>Removable</Tag>
```

---

## Avatar {#avatar}

User image or initials.

### When to Use {#avatar-when-to-use}

- User profiles
- Comments
- Group representations

### When NOT to Use {#avatar-when-not-to-use}

- Non-user images → Use `Image` component
- Status only → Use `Badge`

### Props {#avatar-props}

| Prop     | Type                                        | Required | Default | Description       |
| -------- | ------------------------------------------- | -------- | ------- | ----------------- |
| `src`    | `string`                                    | No       | -       | Image URL         |
| `name`   | `string`                                    | No       | -       | Name for initials |
| `size`   | `'sm' \| 'md' \| 'lg' \| 'xl'`              | No       | `'md'`  | Avatar size       |
| `status` | `'online' \| 'away' \| 'busy' \| 'offline'` | No       | -       | Status dot        |

### States {#avatar-states}

| State    | Description                  |
| -------- | ---------------------------- |
| Default  | Image or initials            |
| Loading  | Skeleton or placeholder      |
| Fallback | Initials extracted from name |
| Status   | Colored dot overlay          |

### Accessibility {#avatar-accessibility}

- `alt` on image (from name)
- Status announced to screen readers

### WCAG Conformance {#avatar-wcag-conformance}

| Criterion                        | Level | How                                                                                                                        |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Image `alt` text derived from the `name` prop conveys the user's identity                                                  |
| 1.3.2 Meaningful Sequence (A)    | A     | Avatar and its status dot appear in DOM order matching their visual stacking                                               |
| 1.4.11 Non-text Contrast (AA)    | AA    | Avatar border ring provides at least 3:1 contrast; status dot colors meet contrast requirements against the avatar surface |

### Common Mistakes {#avatar-common-mistakes}

| Mistake                                       | Impact                                                             | Fix                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| No `alt` text on the avatar image             | Screen readers announce the image as unnamed or read the file path | Pass the `name` prop so the component generates meaningful `alt` text      |
| Status dot conveyed by color only (green/red) | Color-blind users cannot determine online/offline state            | Include visually hidden text (e.g., "Online") alongside the colored dot    |
| Decorative avatar missing `alt=""`            | Screen readers announce an empty or broken image                   | Set `alt=""` and `aria-hidden="true"` when the avatar is purely decorative |

### Visual Design {#avatar-visual-design}

- **Shape**: Circle (border-radius: 50%)
- **Sizes**: sm (32px), md (40px), lg (48px), xl (64px)
- **Border**: 2px `--rialto-surface-elevated` ring
- **Status dot**: 10px, positioned bottom-right

### Animation {#avatar-animation}

- Image fade-in on load
- Respects `prefers-reduced-motion`

### Related {#avatar-related}

- `AvatarGroup` — Multiple avatars
- `Badge` — Status indicators

### Example {#avatar-example}

```tsx
<Avatar name="John Doe" />
<Avatar src="/path/to/image.jpg" name="Jane" size="lg" status="online" />
<AvatarGroup max={3} avatars={[{ name: 'User 1' }, { name: 'User 2' }]} />
```

---

## Stat {#stat}

Metric display with trend.

### When to Use {#stat-when-to-use}

- Dashboard metrics
- Key performance indicators
- Numbers with context

### When NOT to Use {#stat-when-not-to-use}

- Detailed data → Use `Table`
- Multiple related values → Use `DataList`

### Props {#stat-props}

| Prop    | Type                          | Required | Default | Description     |
| ------- | ----------------------------- | -------- | ------- | --------------- |
| `value` | `string \| number`            | Yes      | -       | Metric value    |
| `label` | `string`                      | Yes      | -       | Metric label    |
| `delta` | `string`                      | No       | -       | Change value    |
| `trend` | `'up' \| 'down' \| 'neutral'` | No       | -       | Trend direction |
| `size`  | `'sm' \| 'md' \| 'lg'`        | No       | `'md'`  | Display size    |

### States {#stat-states}

| State          | Description                 |
| -------------- | --------------------------- |
| Default        | Value + label               |
| With delta     | Trend arrow + colored delta |
| Positive trend | Green delta                 |
| Negative trend | Red delta                   |

### Accessibility {#stat-accessibility}

- `aria-label` with full context

### WCAG Conformance {#stat-wcag-conformance}

| Criterion                        | Level | How                                                                                                                           |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | `aria-label` combines label, value, and trend into a single programmatic description (e.g., "Lap Time: 1:25.410, down 0.342") |
| 1.3.2 Meaningful Sequence (A)    | A     | Label, value, and delta appear in DOM order matching the visual top-to-bottom layout                                          |
| 1.4.11 Non-text Contrast (AA)    | AA    | Trend arrow and delta text meet 3:1 contrast against the card surface                                                         |

### Common Mistakes {#stat-common-mistakes}

| Mistake                                                               | Impact                                                                     | Fix                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Trend direction conveyed only by color (green up, red down)           | Color-blind users cannot determine whether the metric improved or declined | Include a visible arrow icon or text label ("up"/"down") alongside the color   |
| `aria-label` contains only the value, missing label and trend context | Screen reader users hear "1:25.410" with no idea what metric it represents | Build the `aria-label` from all parts: label + value + delta + trend direction |
| Delta value has no sign or direction indicator                        | Users cannot tell if "+5%" is positive or negative without the color cue   | Prefix the delta with "+" or "-" and pair with a directional icon              |

### Visual Design {#stat-visual-design}

- **Value**: Monospace font, `--rialto-text-primary`
- **Label**: `--rialto-text-secondary`, uppercase optional
- **Delta**: `--rialto-success` (up) or `--rialto-error` (down)
- **Sizes**: sm (24px value), md (32px), lg (48px)

### Animation {#stat-animation}

- Delta color transition

### Related {#stat-related}

- `Table` — Detailed data
- `Meter` — Visual gauge

### Example {#stat-example}

```tsx
<Stat value="1:25.410" label="Lap Time" delta="-0.342" trend="up" />
<Stat value="342" label="Top Speed" size="lg" />
```

---

## DataList {#data-list}

Key-value pairs display.

### When to Use {#data-list-when-to-use}

- Details pages
- Property lists
- Configuration display

### When NOT to Use {#data-list-when-not-to-use}

- Complex data → Use `Table`
- Interactive values → Use `Form` components

### Props {#data-list-props}

| Prop          | Type                                 | Required | Default      | Description      |
| ------------- | ------------------------------------ | -------- | ------------ | ---------------- |
| `items`       | `{ label: string; value: string }[]` | Yes      | -            | Data pairs       |
| `orientation` | `'horizontal' \| 'vertical'`         | No       | `'vertical'` | Layout           |
| `striped`     | `boolean`                            | No       | `false`      | Alternating rows |

### States {#data-list-states}

| State      | Description                                  |
| ---------- | -------------------------------------------- |
| Default    | Label-value pairs, vertical layout           |
| Striped    | Alternating `--rialto-surface-recessed` rows |
| Horizontal | Side-by-side label (140px) + value           |

### Accessibility {#data-list-accessibility}

- Uses `<dl>`, `<dt>`, `<dd>` semantic elements
- Labels and values are naturally associated

### WCAG Conformance {#data-list-wcag-conformance}

| Criterion                        | Level | How                                                                                                |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses `<dl>`, `<dt>`, `<dd>` semantic elements so label-value pairs are programmatically associated |
| 1.3.2 Meaningful Sequence (A)    | A     | Key-value pairs appear in DOM order matching the visual vertical or horizontal layout              |
| 1.4.11 Non-text Contrast (AA)    | AA    | Container border and striped row backgrounds provide at least 3:1 contrast differentiation         |

### Common Mistakes {#data-list-common-mistakes}

| Mistake                                                       | Impact                                                          | Fix                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Using `<div>` elements instead of `<dl>`, `<dt>`, `<dd>`      | Screen readers cannot associate labels with their values        | Use the semantic description list elements provided by the component    |
| Labels and values visually aligned but not grouped in the DOM | Assistive tech reads labels and values as unrelated text        | Ensure each `<dt>`/`<dd>` pair is adjacent in the DOM within the `<dl>` |
| Long values truncated with no way to access full content      | Users with screen magnifiers or assistive tech miss hidden text | Use `title` attribute or expandable content for truncated values        |

### Visual Design {#data-list-visual-design}

- **Container**: `--rialto-border`, `--rialto-radius-soft`, overflow hidden
- **Labels**: `--rialto-font-mono`, `--rialto-text-xs`, `--rialto-text-tertiary`, uppercase, `--rialto-tracking-wide`
- **Values**: `--rialto-text-primary`, `--rialto-text-sm`
- **Striped**: Odd rows use `--rialto-surface-recessed`
- **Spacing**: `--rialto-space-xs` vertical, `--rialto-space-md` horizontal

### Animation {#data-list-animation}

- None — static data display

### Related {#data-list-related}

- `Table` — Complex data
- `Stat` — Single metric

### Example {#data-list-example}

```tsx
<DataList
  items={[
    { label: "Engine", value: "V8 Twin-Turbo" },
    { label: "Power", value: "1,200 PS" },
  ]}
/>
```

---

## Meter {#meter}

Gauge for bounded values.

### When to Use {#meter-when-to-use}

- Fuel levels
- Temperature
- Battery life
- Any bounded measurement

### When NOT to Use {#meter-when-not-to-use}

- Completion → Use `Progress`
- Exact values → Use `Stat`

### Props {#meter-props}

| Prop        | Type                                            | Required | Default     | Description   |
| ----------- | ----------------------------------------------- | -------- | ----------- | ------------- |
| `value`     | `number`                                        | Yes      | -           | Current value |
| `min`       | `number`                                        | No       | `0`         | Minimum       |
| `max`       | `number`                                        | No       | `100`       | Maximum       |
| `label`     | `string`                                        | No       | -           | Label         |
| `showValue` | `boolean`                                       | No       | `false`     | Show numeric  |
| `variant`   | `'default' \| 'accent' \| 'success' \| 'error'` | No       | `'default'` | Color         |
| `size`      | `'sm' \| 'md'`                                  | No       | `'md'`      | Size          |

### States {#meter-states}

| State   | Description                      |
| ------- | -------------------------------- |
| Default | Gauge bar + optional label/value |
| Low     | Default or accent color          |
| Medium  | Warning (if using thresholds)    |
| High    | Error color for danger values    |

### Accessibility {#meter-accessibility}

- `role="meter"` or `role="progressbar"`
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

### WCAG Conformance {#meter-wcag-conformance}

| Criterion                        | Level | How                                                                                                                           |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses `role="meter"` with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` to expose the gauge semantics programmatically |
| 1.3.2 Meaningful Sequence (A)    | A     | Label, gauge bar, and optional numeric value appear in DOM order matching the visual layout                                   |
| 1.4.11 Non-text Contrast (AA)    | AA    | Filled portion of the meter track meets 3:1 contrast against the recessed track background                                    |

### Common Mistakes {#meter-common-mistakes}

| Mistake                                                                                 | Impact                                                           | Fix                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Missing visible label for the meter                                                     | Users cannot tell what the gauge measures                        | Always pass the `label` prop or associate a visible label via `aria-labelledby`                                       |
| No textual value fallback when `showValue` is false                                     | Screen reader users hear the role but not the current reading    | Set `aria-valuenow` (always included by the component) and consider enabling `showValue` for sighted low-vision users |
| Using `role="progressbar"` for a bounded measurement that is not a completion indicator | Assistive tech may announce "loading" semantics, confusing users | Use `role="meter"` for bounded measurements; reserve `role="progressbar"` for task completion                         |
| Threshold color changes (green to red) with no text explanation                         | Color-blind users cannot interpret danger levels                 | Add a visible text label or `aria-valuetext` describing the severity (e.g., "Critical: 92%")                          |

### Visual Design {#meter-visual-design}

- **Track**: `--rialto-surface-recessed`, rounded
- **Fill**: Variant color, animated width
- **Sizes**: sm (4px bar), md (8px bar)
- **Radius**: rounded to track height

### Animation {#meter-animation}

- Fill: smooth width transition
- Respects `prefers-reduced-motion`

### Related {#meter-related}

- `Progress` — Completion percentage
- `Stat` — Value with label

### Example {#meter-example}

```tsx
<Meter value={72} label="Fuel" showValue variant="accent" />
<Meter value={88} label="Temperature" variant="error" showValue size="sm" />
```

---

## Timeline {#timeline}

Event sequence display.

### When to Use {#timeline-when-to-use}

- Activity feeds
- History logs
- Event sequences

### When NOT to Use {#timeline-when-not-to-use}

- Single event → Use `DataList`
- Complex data → Use `Table`

### Props {#timeline-props}

| Prop    | Type             | Required | Default | Description |
| ------- | ---------------- | -------- | ------- | ----------- |
| `items` | `TimelineItem[]` | Yes      | -       | Events      |

### Data Structure {#timeline-data-structure}

```typescript
interface TimelineItem {
  title: string;
  description?: string;
  timestamp?: string;
  variant?: "default" | "accent" | "success" | "error";
}
```

### States {#timeline-states}

| State     | Description                                |
| --------- | ------------------------------------------ |
| Upcoming  | Grey node, `--rialto-border-strong` border |
| Active    | Gold ring with glowing shadow              |
| Completed | Gold-filled node (`--rialto-accent`)       |
| Error     | Red node (`--rialto-error`)                |

### Accessibility {#timeline-accessibility}

- Semantic list structure
- Timestamps provide temporal context
- Status conveyed through both color and position

### WCAG Conformance {#timeline-wcag-conformance}

| Criterion                        | Level | How                                                                                                            |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses semantic list structure (`<ol>` or `<ul>`) so assistive tech conveys the sequence of events               |
| 1.3.2 Meaningful Sequence (A)    | A     | Events appear in DOM order matching the visual chronological sequence                                          |
| 1.4.11 Non-text Contrast (AA)    | AA    | Node and connector colors meet 3:1 contrast against the background; active gold glow is decorative enhancement |

### Common Mistakes {#timeline-common-mistakes}

| Mistake                                                      | Impact                                                                        | Fix                                                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Timestamps not programmatically associated with their events | Screen readers announce timestamps and event titles as unrelated text         | Place the `<time>` element inside the same `<li>` as the event content, or use `aria-describedby`      |
| Status conveyed only by node color (gold, green, red, grey)  | Color-blind users cannot distinguish completed, active, and error states      | Include a text label or `aria-label` per item indicating the status (e.g., "Completed", "In Progress") |
| Using `<div>` elements instead of a semantic list            | Assistive tech cannot convey the number of events or sequential relationship  | Wrap timeline items in an `<ol>` (ordered list) to communicate sequence                                |
| Missing accessible name for the overall timeline             | Screen reader users encounter a list with no context about what it represents | Add `aria-label="Project timeline"` or a visible heading preceding the component                       |

### Visual Design {#timeline-visual-design}

- **Layout**: CSS Grid — 64px timestamp, 28px track, 1fr content
- **Node**: 12px circle, `--rialto-radius-round`
- **Connector**: 2px vertical line, `--rialto-border` (completed: `--rialto-accent`)
- **Active glow**: 3px + 5px gold box-shadow with 10px blur
- **Timestamp**: `--rialto-font-mono`, `--rialto-text-xs`, right-aligned
- **Compact variant**: 48px timestamp, 22px track, 10px nodes, hidden descriptions

### Animation {#timeline-animation}

- CSS transitions only: node color/background (0.3s precision easing)
- Connector line color transitions
- No Framer Motion

### Example {#timeline-example}

```tsx
<Timeline
  items={[
    { title: "Started", timestamp: "9:00 AM" },
    { title: "In Progress", timestamp: "9:30 AM", variant: "accent" },
    { title: "Completed", timestamp: "10:00 AM", variant: "success" },
  ]}
/>
```
