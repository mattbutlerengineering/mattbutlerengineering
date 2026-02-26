# Feedback Components

Communicating status and information to users.

## Quick Reference {#quick-reference}

| Need                    | Component    |
| ----------------------- | ------------ |
| Transient notifications | `Toast`      |
| Inline messages         | `Alert`      |
| Page-level messages     | `Banner`     |
| Completion tracking     | `Progress`   |
| Loading placeholders    | `Skeleton`   |
| Empty content           | `EmptyState` |

---

## Toast {#toast}

Transient notification appearing briefly.

### When to Use {#toast-when-to-use}

- Success confirmations
- Error messages
- Brief information
- Undo actions

### When NOT to Use {#toast-when-not-to-use}

- Critical errors → Use `Alert` or `Dialog`
- Persistent messages → Use `Banner`

### Usage {#toast-usage}

```tsx
const { toast } = useToast();

toast({ title: "Saved!", variant: "success" });
toast({ title: "Error", variant: "error" });
toast({ title: "Copied!", variant: "accent" });
```

### Props (toast function) {#toast-props-toast-function}

| Prop          | Type                                            | Required | Default     | Description        |
| ------------- | ----------------------------------------------- | -------- | ----------- | ------------------ |
| `title`       | `string`                                        | Yes      | -           | Message title      |
| `description` | `string`                                        | No       | -           | Additional details |
| `variant`     | `'default' \| 'success' \| 'error' \| 'accent'` | No       | `'default'` | Style              |
| `duration`    | `number`                                        | No       | `5000`      | Auto-dismiss ms    |

### States {#toast-states}

- Appearing (slide in), visible, disappearing (slide out)

### Accessibility {#toast-accessibility}

- `role="alert"`
- Focus trap when necessary
- Escape to dismiss

### WCAG Conformance {#toast-wcag-conformance}

| Criterion                    | Level | How                                                                                            |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Uses semantic markup with `role="alert"` to convey toast purpose                               |
| 2.2.1 Timing Adjustable      | A     | Auto-dismiss duration is configurable via `duration` prop; users can dismiss early with Escape |
| 2.4.7 Focus Visible          | AA    | Close button shows gold focus ring (`--rialto-shadow-focus`) when focused                      |
| 4.1.3 Status Messages        | AA    | `role="alert"` causes screen readers to announce the toast immediately without moving focus    |

### Common Mistakes {#toast-common-mistakes}

| Mistake                                          | Impact                                                                              | Fix                                                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Using toasts for errors that require user action | Users may miss critical errors when the toast auto-dismisses                        | Use `Alert` or `Dialog` for errors that need acknowledgment or corrective action        |
| Setting too-short duration for long text content | Screen reader users and slow readers cannot finish reading the message              | Scale `duration` with content length; minimum 5000ms for messages with descriptions     |
| Stacking many toasts simultaneously              | Overwhelms users and causes screen readers to rapidly announce overlapping messages | Limit visible toasts to 3; queue additional toasts to appear after earlier ones dismiss |

### Visual Design {#toast-visual-design}

- **Surface**: `glass` composition (translucent, blur backdrop)
- **Border**: 3px left accent border per variant — `--rialto-text-tertiary` (default), `--rialto-success`, `--rialto-error`, `--rialto-accent`
- **Radius**: `--rialto-radius-soft`
- **Typography**: Title `--rialto-weight-medium`, description `--rialto-text-sm`
- **Close button**: `--rialto-radius-sharp`, hover `--rialto-surface-recessed`
- **Countdown bar**: Accent-colored, shrinks over duration

### Animation {#toast-animation}

- Entry: spring physics — `opacity: 0, x: 80, scale: 0.95` → `opacity: 1, x: 0, scale: 1`
- Exit: spring — `opacity: 0, x: 40, scale: 0.95`
- Uses `layout` prop for stack reflow animation
- Countdown bar: linear scaleX over toast duration
- Reduced motion: opacity-only fade with `duration: 0.1`

### Related {#toast-related}

- `Alert` — Inline messages
- `Banner` — Persistent page messages

---

## Alert {#alert}

Inline informational message.

### When to Use {#alert-when-to-use}

- Form validation errors
- Important information in context
- Warnings within content

### When NOT to Use {#alert-when-not-to-use}

- Transient notifications → Use `Toast`
- Full-page messages → Use `Banner`

### Props {#alert-props}

| Prop          | Type                                            | Required | Default     | Description     |
| ------------- | ----------------------------------------------- | -------- | ----------- | --------------- |
| `variant`     | `'default' \| 'success' \| 'error' \| 'accent'` | No       | `'default'` | Style           |
| `title`       | `string`                                        | No       | -           | Alert title     |
| `children`    | `ReactNode`                                     | No       | -           | Message content |
| `dismissible` | `boolean`                                       | No       | `false`     | Show close      |

### Variants {#alert-variants}

- **Default**: Neutral information
- **Success**: Green, positive
- **Error**: Red, problems
- **Accent**: Gold, important

### Accessibility {#alert-accessibility}

- `role="alert"` for errors
- `aria-live` for dynamic content

### WCAG Conformance {#alert-wcag-conformance}

| Criterion                    | Level | How                                                                                                                            |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships | A     | Uses `role="alert"` on error variants to convey semantic importance                                                            |
| 2.4.7 Focus Visible          | AA    | Dismiss button shows gold focus ring (`--rialto-shadow-focus`) when focused                                                    |
| 4.1.3 Status Messages        | AA    | Error variants use `role="alert"` for immediate announcement; info variants use `aria-live="polite"` for non-intrusive updates |

### Common Mistakes {#alert-common-mistakes}

| Mistake                                  | Impact                                                                                  | Fix                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Missing `role="alert"` on error variants | Screen readers do not announce the error, so users are unaware of the problem           | Always apply `role="alert"` when `variant="error"`                                           |
| Using Alert for page-wide notices        | Creates visual clutter within content areas; page-wide messages belong outside the flow | Use `Banner` for page-level announcements; reserve `Alert` for contextual inline messages    |
| Omitting a title on complex alerts       | Users cannot quickly scan the alert's purpose, especially with assistive technology     | Provide a concise `title` that summarizes the message; use `children` for supporting details |

### Visual Design {#alert-visual-design}

- **Surface**: `--rialto-surface-elevated`, left accent border per variant
- **Variants**: `--rialto-border` (info), `--rialto-accent` (accent), `--rialto-success`, `--rialto-error` — each with subtle gradient background tint
- **Radius**: `--rialto-radius-soft`
- **Typography**: Title `--rialto-weight-medium`, description `--rialto-text-sm`, `--rialto-leading-relaxed`
- **Close button**: `--rialto-radius-sharp`, hover `--rialto-surface-recessed`

### Animation {#alert-animation}

- Entry: precision easing — `opacity: 0, y: -8` → `opacity: 1, y: 0`
- Exit: precision — collapses `height`, `padding`, and `marginBottom` to 0
- Reduced motion: opacity-only with `duration: 0.1`

### Related {#alert-related}

- `Toast` — Transient
- `Banner` — Page-level

### Example {#alert-example}

```tsx
<Alert variant="error" title="Error">
  Please correct the form errors.
</Alert>

<Alert variant="success" dismissible>
  Your changes have been saved.
</Alert>
```

---

## Banner {#banner}

Page-level informational message.

### When to Use {#banner-when-to-use}

- System status
- Maintenance notices
- Important announcements
- Full-width alerts

### When NOT to Use {#banner-when-not-to-use}

- Context-specific → Use `Alert`
- Transient → Use `Toast`

### Props {#banner-props}

| Prop          | Type                                            | Required | Default     | Description   |
| ------------- | ----------------------------------------------- | -------- | ----------- | ------------- |
| `variant`     | `'default' \| 'success' \| 'error' \| 'accent'` | No       | `'default'` | Style         |
| `title`       | `string`                                        | No       | -           | Banner title  |
| `action`      | `ReactNode`                                     | No       | -           | Action button |
| `dismissible` | `boolean`                                       | No       | `false`     | Close button  |

### Accessibility {#banner-accessibility}

- `role="alert"` for urgent variants
- `aria-live` for dynamic content
- Dismissible via close button

### WCAG Conformance {#banner-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                             |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Uses landmark-level placement and `role="alert"` on urgent variants to convey page-wide importance                                              |
| 2.4.7 Focus Visible          | AA    | Close button and action button show gold focus ring (`--rialto-shadow-focus`) when focused                                                      |
| 4.1.3 Status Messages        | AA    | Urgent variants use `role="alert"` for immediate announcement; informational variants use `aria-live="polite"` to announce without interrupting |

### Common Mistakes {#banner-common-mistakes}

| Mistake                                                 | Impact                                                                                       | Fix                                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Using Banner for field-level validation errors          | Field context is lost; users cannot associate the message with the specific input            | Use `Alert` positioned near the relevant field for inline validation feedback                            |
| Omitting `role="alert"` on error/urgent banners         | Screen readers do not announce the message, leaving users unaware of critical status changes | Apply `role="alert"` on error and urgent variants so assistive technology announces immediately          |
| Making all banners dismissible regardless of importance | Users may dismiss critical system notices they need to act on                                | Only set `dismissible` on informational banners; keep error and urgent banners persistent until resolved |

### Visual Design {#banner-visual-design}

- **Surface**: `--rialto-surface-elevated`, left accent border per variant
- **Variants**: `--rialto-border` (info), `--rialto-accent`, `--rialto-error` — each with gradient background tint
- **Radius**: `--rialto-radius-default`
- **Typography**: `--rialto-text-sm`, `--rialto-leading-relaxed`

### Animation {#banner-animation}

- Entry: precision easing — `opacity: 0, y: -8` → `opacity: 1, y: 0`
- Exit: precision — collapses `height`, `paddingTop`, `paddingBottom` to 0
- Reduced motion: animation skipped entirely

### Related {#banner-related}

- `Alert` — Inline
- `Toast` — Transient

### Example {#banner-example}

```tsx
<Banner variant="accent" title="New feature">
  Check out our updated documentation.
</Banner>

<Banner variant="error" title="System maintenance">
  Scheduled for Sunday at 2AM.
</Banner>
```

---

## Progress {#progress}

Completion tracking.

### When to Use {#progress-when-to-use}

- Upload progress
- Loading states
- Form completion
- Task progress

### When NOT to Use {#progress-when-not-to-use}

- Exact measurements → Use `Meter`
- Unknown duration → Use `Spinner`

### Props {#progress-props}

| Prop            | Type                                            | Required | Default    | Description           |
| --------------- | ----------------------------------------------- | -------- | ---------- | --------------------- |
| `value`         | `number`                                        | No       | -          | Current value (0-100) |
| `max`           | `number`                                        | No       | `100`      | Maximum value         |
| `variant`       | `'default' \| 'accent' \| 'success' \| 'error'` | No       | `'accent'` | Color                 |
| `indeterminate` | `boolean`                                       | No       | `false`    | Unknown progress      |
| `showValue`     | `boolean`                                       | No       | `false`    | Show percentage       |

### States {#progress-states}

- Determinate (value known)
- Indeterminate (value unknown)

### Accessibility {#progress-accessibility}

- `role="progressbar"`
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

### WCAG Conformance {#progress-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Uses `role="progressbar"` to convey the element's purpose programmatically                                                         |
| 2.4.7 Focus Visible          | AA    | Not applicable — Progress is non-interactive and does not receive focus                                                            |
| 4.1.3 Status Messages        | AA    | `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` allow assistive technology to announce progress changes without moving focus |

### Common Mistakes {#progress-common-mistakes}

| Mistake                                              | Impact                                                                         | Fix                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Missing `aria-valuenow` on determinate progress bars | Screen readers cannot report current progress to users                         | Always set `aria-valuenow` to match the `value` prop when progress is determinate          |
| Using indeterminate mode with no accessible label    | Screen readers announce a progress bar with no context about what is loading   | Provide an `aria-label` or visible label describing the operation (e.g., "Uploading file") |
| Not updating `aria-valuenow` as value changes        | Screen readers report stale progress, misleading users about actual completion | Ensure `aria-valuenow` updates reactively whenever the `value` prop changes                |

### Visual Design {#progress-visual-design}

- **Track**: `recessed` surface composition, `--rialto-radius-round`
- **Fill**: Gradient from `--rialto-accent` to `--rialto-accent-hover`, `transform-origin: left`
- **Indeterminate**: CSS shimmer animation over track
- **Value text**: `--rialto-font-mono`, `--rialto-text-xs`, `--rialto-tracking-wide`
- **Label**: `--rialto-text-secondary`, `--rialto-weight-medium`
- **Track sizes**: sm (4px), md (default), lg

### Animation {#progress-animation}

- Determinate fill: precision easing on `scaleX`
- Indeterminate: CSS `@keyframes shimmer` — 1.5s cubic-bezier loop
- Spinner variant: CSS `@keyframes trace` — 1.8s stroke-dashoffset animation with gold glow ring
- Reduced motion: animation disabled, opacity reduced to 0.5–0.7

### Related {#progress-related}

- `Meter` — Bounded values
- `Spinner` — Unknown duration

### Example {#progress-example}

```tsx
<Progress value={45} showValue />
<Progress indeterminate />
```

---

## Spinner {#spinner}

Loading indicator for unknown duration.

### When to Use {#spinner-when-to-use}

- Initial load
- Async operations
- Unknown duration tasks

### When NOT to Use {#spinner-when-not-to-use}

- Known progress → Use `Progress`
- Success/failure → Use `Toast`

### Props {#spinner-props}

| Prop    | Type                   | Required | Default     | Description |
| ------- | ---------------------- | -------- | ----------- | ----------- |
| `size`  | `'sm' \| 'md' \| 'lg'` | No       | `'md'`      | Size        |
| `label` | `string`               | No       | `'Loading'` | Aria label  |

### Accessibility {#spinner-accessibility}

- `role="status"`
- `aria-label` for screen readers

### WCAG Conformance {#spinner-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                                                |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships | A     | Uses `role="status"` to programmatically identify the element as a live status indicator                                                                           |
| 2.4.7 Focus Visible          | AA    | Not applicable — Spinner is non-interactive and does not receive focus                                                                                             |
| 4.1.3 Status Messages        | AA    | `role="status"` with implicit `aria-live="polite"` causes screen readers to announce loading state without moving focus; `aria-label` provides descriptive context |

### Common Mistakes {#spinner-common-mistakes}

| Mistake                                                | Impact                                                                           | Fix                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Using a spinner with no `aria-label`                   | Screen readers announce a generic "status" with no context about what is loading | Always provide a descriptive `label` prop (e.g., "Loading search results")              |
| Leaving the spinner in the DOM after loading completes | Screen readers never announce that loading has finished, leaving users uncertain | Remove the Spinner from the DOM or conditionally render it only while loading is active |

### Related {#spinner-related}

- `Progress` — Known progress
- `Skeleton` — Content placeholder

### Example {#spinner-example}

```tsx
<Spinner size="md" label="Loading data" />
```

---

## Skeleton {#skeleton}

Loading placeholder for content.

### When to Use {#skeleton-when-to-use}

- Anticipating content load
- Layout preservation
- Perceived performance

### When NOT to Use {#skeleton-when-not-to-use}

- Known completion → Use content directly
- Short loads → Not needed

### Props {#skeleton-props}

| Prop      | Type                                    | Required | Default  | Description   |
| --------- | --------------------------------------- | -------- | -------- | ------------- |
| `variant` | `'text' \| 'rectangular' \| 'circular'` | No       | `'text'` | Shape         |
| `width`   | `string`                                | No       | -        | Custom width  |
| `height`  | `string`                                | No       | -        | Custom height |

### Accessibility {#skeleton-accessibility}

- `aria-hidden="true"` — decorative placeholder
- Pair with `aria-busy` on parent container

### WCAG Conformance {#skeleton-wcag-conformance}

| Criterion                    | Level | How                                                                                                                                                                              |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Uses `aria-hidden="true"` to exclude decorative placeholders from the accessibility tree; parent container uses `aria-busy="true"` to signal loading state                       |
| 2.4.7 Focus Visible          | AA    | Not applicable — Skeleton is non-interactive and does not receive focus                                                                                                          |
| 4.1.3 Status Messages        | AA    | `aria-busy="true"` on the parent container informs assistive technology that content is loading; when loading completes and `aria-busy` is removed, the new content is announced |

### Common Mistakes {#skeleton-common-mistakes}

| Mistake                                                | Impact                                                                                     | Fix                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Not pairing Skeleton with `aria-busy` on the container | Screen readers do not know the region is loading, so users may perceive it as empty        | Set `aria-busy="true"` on the parent container while skeletons are visible; remove it when content loads |
| Forgetting `aria-hidden="true"` on Skeleton elements   | Screen readers attempt to read the placeholder markup, producing meaningless announcements | Skeleton uses `aria-hidden="true"` by default; do not override it                                        |
| Using Skeleton for very short loads (under 300ms)      | Brief skeleton flashes create visual noise and feel jarring                                | Only render skeletons when load times exceed a reasonable threshold; use a short delay before showing    |

### Visual Design {#skeleton-visual-design}

- **Background**: `--rialto-surface-recessed`
- **Shapes**: text (`--rialto-radius-default`), heading (`--rialto-radius-default`), circle (`--rialto-radius-round`), rect (`--rialto-radius-sharp`), card (`--rialto-radius-soft`)
- **Shimmer overlay**: Gold-tinted gradient sweep via `::after` pseudo-element

### Animation {#skeleton-animation}

- CSS `@keyframes shimmer` — 1.8s ease-in-out infinite `translateX` sweep
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables animation, sets `opacity: 0.5`

### Related {#skeleton-related}

- `Spinner` — Loading state
- `EmptyState` — No content

### Example {#skeleton-example}

```tsx
<Skeleton variant="rectangular" height={200} />
<Skeleton variant="text" width="60%" />
<SkeletonGroup>
  <Skeleton variant="circular" width={40} height={40} />
  <Skeleton variant="text" width="80%" />
</SkeletonGroup>
```

---

## EmptyState {#empty-state}

Display when no content is available.

### When to Use {#empty-state-when-to-use}

- Empty lists
- No search results
- First-time user states

### When NOT to Use {#empty-state-when-not-to-use}

- Errors → Use `Alert` or `Toast`
- Loading → Use `Skeleton` or `Spinner`

### Props {#empty-state-props}

| Prop          | Type        | Required | Default | Description  |
| ------------- | ----------- | -------- | ------- | ------------ |
| `title`       | `string`    | Yes      | -       | Title text   |
| `description` | `string`    | No       | -       | Help text    |
| `action`      | `ReactNode` | No       | -       | CTA button   |
| `icon`        | `ReactNode` | No       | -       | Illustration |

### Accessibility {#empty-state-accessibility}

- Heading level appropriate to context
- Action button is keyboard accessible

### WCAG Conformance {#empty-state-wcag-conformance}

| Criterion                    | Level | How                                                                                           |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships | A     | Uses semantic heading element for the title, maintaining document outline hierarchy           |
| 2.4.7 Focus Visible          | AA    | Action button (CTA) shows gold focus ring (`--rialto-shadow-focus`) when focused via keyboard |
| 4.1.3 Status Messages        | AA    | Not applicable — EmptyState is a static content region, not a dynamic status update           |

### Common Mistakes {#empty-state-common-mistakes}

| Mistake                                    | Impact                                                                               | Fix                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Missing an actionable CTA                  | Users see empty content with no path forward, increasing abandonment                 | Always provide an `action` prop with a clear next step (e.g., "Create item", "Clear filters")       |
| Heading level mismatch with page hierarchy | Screen reader users encounter a broken document outline, making navigation confusing | Choose a heading level that fits the surrounding page structure (e.g., `h3` inside an `h2` section) |
| Using EmptyState for error conditions      | Users expect error-specific styling and semantics that EmptyState does not provide   | Use `Alert` for errors with `role="alert"`; reserve EmptyState for zero-content situations          |

### Visual Design {#empty-state-visual-design}

- **Elevated variant**: `aluminum` surface composition
- **Text**: `--rialto-text-primary` (heading), `--rialto-text-secondary` (description)
- **Icon**: `--rialto-text-tertiary`, `--rialto-radius-soft` container
- **Spacing**: `--rialto-space-2xl` padding, `--rialto-space-lg` between sections
- **Sizes**: default and `sm` (reduced padding and typography)
- **Typography**: `--rialto-text-md` heading, `--rialto-text-sm` description

### Animation {#empty-state-animation}

- None — static component

### Related {#empty-state-related}

- `Skeleton` — Loading state
- `Alert` — Error messages

### Example {#empty-state-example}

```tsx
<EmptyState
  title="No results"
  description="Try adjusting your search"
  action={<Button>Clear filters</Button>}
/>
```
