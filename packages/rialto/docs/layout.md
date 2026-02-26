# Layout Components

Structuring page content.

## Quick Reference {#quick-reference}

| Need                   | Component     |
| ---------------------- | ------------- |
| Flexbox layout         | `Stack`       |
| Visual separation      | `Divider`     |
| Expand/collapse        | `Collapsible` |
| Grouped sections       | `Accordion`   |
| Responsive proportions | `AspectRatio` |
| Custom scroll          | `ScrollArea`  |
| Page footer            | `Footer`      |
| Marketing splash       | `Hero`        |
| Dark header band       | `PageHeader`  |

---

## Stack {#stack}

Flexbox layout container.

### When to Use {#stack-when-to-use}

- Vertical stacking of elements
- Horizontal alignment
- Gap control

### When NOT to Use {#stack-when-not-to-use}

- Grid layouts → Use CSS Grid directly
- Page structure → Use your framework's layout

### Props {#stack-props}

| Prop        | Type                                        | Required | Default | Description    |
| ----------- | ------------------------------------------- | -------- | ------- | -------------- |
| `direction` | `'row' \| 'column'`                         | No       | `'row'` | Flex direction |
| `gap`       | `GapToken`                                  | No       | -       | Space between  |
| `align`     | `'start' \| 'center' \| 'end' \| 'stretch'` | No       | -       | Cross axis     |
| `justify`   | `'start' \| 'center' \| 'end' \| 'between'` | No       | -       | Main axis      |

### Gap Tokens {#stack-gap-tokens}

`none`, `xs`, `sm`, `md`, `lg`, `xl`

### WCAG Conformance {#stack-wcag-conformance}

| Criterion                        | Level | How                                                                                         |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Pure layout container; semantic structure determined by children, not the Stack itself      |
| 1.3.2 Meaningful Sequence (A)    | A     | Reading order matches DOM order; visual direction (`row`/`column`) does not reorder the DOM |

### Common Mistakes {#stack-common-mistakes}

| Mistake                                                                                        | Impact                                                                        | Fix                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Using `direction="row-reverse"` or CSS `order` to visually reorder content away from DOM order | Screen reader users encounter content in a different order than sighted users | Keep DOM order matching the intended reading sequence; rearrange the source markup instead   |
| Nesting deeply without semantic landmarks                                                      | Assistive technology cannot convey structure to the user                      | Add semantic elements (`nav`, `section`, `main`) or ARIA roles as children where appropriate |

### Visual Design {#stack-visual-design}

- Pure layout primitive — no surface styling
- **Gap tokens**: Maps `gap` prop to `--rialto-space-*` (2xs through 3xl)
- Renders as `flex` container (column default, row optional)

### Animation {#stack-animation}

- None — static layout container

### Example {#stack-example}

```tsx
<Stack direction="column" gap="md">
  <div>Item 1</div>
  <div>Item 2</div>
</Stack>

<Stack direction="row" gap="sm" align="center">
  <Icon />
  <Text>Label</Text>
</Stack>
```

---

## Divider {#divider}

Visual line separating content.

### When to Use {#divider-when-to-use}

- Section separation
- Group boundaries
- Inline separation

### When NOT to Use {#divider-when-not-to-use}

- Page sections → Use separate sections
- Semantic separation → Use `<hr>` element

### Props {#divider-props}

| Prop      | Type                     | Required | Default     | Description    |
| --------- | ------------------------ | -------- | ----------- | -------------- |
| `label`   | `string`                 | No       | -           | Centered label |
| `spacing` | `'default' \| 'compact'` | No       | `'default'` | Vertical space |

### Variants {#divider-variants}

- **Default**: Full-width with vertical space
- **Compact**: Tighter spacing
- With label: "or", "and", etc.

### Accessibility {#divider-accessibility}

- Use `<hr>` when semantic
- `aria-label` for labeled dividers

### WCAG Conformance {#divider-wcag-conformance}

| Criterion                        | Level | How                                                                                         |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Decorative dividers use `aria-hidden="true"`; semantic separators render as `<hr>` elements |
| 1.3.2 Meaningful Sequence (A)    | A     | Divider position in the DOM reflects the visual separation point between content sections   |

### Common Mistakes {#divider-common-mistakes}

| Mistake                                                      | Impact                                                                                      | Fix                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Missing `aria-hidden="true"` on decorative dividers          | Screen readers announce an empty separator, adding noise to the reading experience          | Add `aria-hidden="true"` or `role="none"` to purely decorative dividers            |
| Using a decorative divider where a semantic `<hr>` is needed | Screen reader users miss meaningful content boundaries                                      | Use a semantic `<hr>` element when the divider represents an actual thematic break |
| Labeled dividers without `aria-label`                        | The visual label (e.g., "or") is not associated with the separator for assistive technology | Provide `aria-label` that matches or describes the visible label text              |

### Visual Design {#divider-visual-design}

- **Line**: CSS gradient using `--rialto-border` → `--rialto-border-strong` for emphasis
- **Accent variant**: Gold gradient using `--rialto-accent`
- **Label**: `--rialto-text-tertiary`, uppercase, centered between gradient lines
- **Spacing variants**: compact (`--rialto-space-sm`), default (`--rialto-space-md`), spacious (`--rialto-space-lg`)
- Supports both horizontal and vertical orientations

### Animation {#divider-animation}

- None — static separator

### Example {#divider-example}

```tsx
<Divider />

<Divider label="or" spacing="compact" />
```

---

## Collapsible {#collapsible}

Expand/collapse container.

### When to Use {#collapsible-when-to-use}

- Optional content
- Accordion sections
- Show/hide toggles

### When NOT to Use {#collapsible-when-not-to-use}

- Multiple sections → Use `Accordion`
- Navigation → Use `Tabs`

### Props {#collapsible-props}

| Prop           | Type                      | Required | Default | Description     |
| -------------- | ------------------------- | -------- | ------- | --------------- |
| `open`         | `boolean`                 | Yes      | -       | Open state      |
| `onOpenChange` | `(open: boolean) => void` | Yes      | -       | State handler   |
| `label`        | `ReactNode`               | Yes      | -       | Trigger element |

### States {#collapsible-states}

- Collapsed, expanding (animate height), expanded

### Accessibility {#collapsible-accessibility}

- `aria-expanded`
- Keyboard accessible trigger

### WCAG Conformance {#collapsible-wcag-conformance}

| Criterion                        | Level | How                                                                                                       |
| -------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Trigger communicates expanded/collapsed state via `aria-expanded`; content is associated with the trigger |
| 1.3.2 Meaningful Sequence (A)    | A     | Content follows its trigger in DOM order, matching the visual expand-below pattern                        |
| 4.1.2 Name, Role, Value (A)      | A     | Trigger element has an accessible name and `aria-expanded` reflects current state                         |

### Common Mistakes {#collapsible-common-mistakes}

| Mistake                                                  | Impact                                                                                  | Fix                                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Trigger is not a `<button>` or lacks `role="button"`     | Keyboard users cannot activate the trigger with Enter/Space                             | Use a native `<button>` element as the trigger, or add `role="button"` and `tabindex="0"` with key handlers |
| Collapsed content removed from DOM instead of hidden     | Screen reader users and find-in-page cannot discover collapsed content                  | Keep content in the DOM and hide it with `height: 0; overflow: hidden` or use `aria-hidden`                 |
| Missing `aria-controls` linking trigger to content panel | Assistive technology cannot programmatically associate the trigger with what it reveals | Add `aria-controls` on the trigger referencing the `id` of the content region                               |

### Visual Design {#collapsible-visual-design}

- **Container**: `--rialto-border`, `--rialto-radius-soft`, overflow hidden
- **Trigger**: `--rialto-surface` default, hover `--rialto-surface-elevated`
- **Open trigger**: `--rialto-accent` chevron color
- **Content**: `--rialto-text-secondary`, `--rialto-text-sm`, `--rialto-leading-relaxed`
- **Spacing**: `--rialto-space-sm` trigger padding, `--rialto-space-md` content padding

### Animation {#collapsible-animation}

- Chevron: `springGentle` rotation (0° → 180°)
- Content expand/collapse: `springGentle` height + opacity
- Trigger hover: precision easing (0.15s) background transition
- Reduced motion: `duration: 0`, content starts at `height: 'auto'`

### Related {#collapsible-related}

- `Accordion` — Multiple collapsible
- `Steps` — Sequential collapsible

### Example {#collapsible-example}

```tsx
<Collapsible
  open={isOpen}
  onOpenChange={setOpen}
  label={<Button>Toggle content</Button>}
>
  <p>Hidden content here</p>
</Collapsible>
```

---

## Accordion {#accordion}

Grouped collapsible panels.

### When to Use {#accordion-when-to-use}

- FAQ sections
- Property groups
- Multiple related collapsible areas

### When NOT to Use {#accordion-when-not-to-use}

- Single collapsible → Use `Collapsible`
- Tabs-like behavior → Use `Tabs`

### Props {#accordion-props}

| Prop            | Type              | Required | Default | Description       |
| --------------- | ----------------- | -------- | ------- | ----------------- |
| `items`         | `AccordionItem[]` | Yes      | -       | Panel definitions |
| `allowMultiple` | `boolean`         | No       | `false` | Multiple open     |

### Data Structure {#accordion-data-structure}

```typescript
interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}
```

### States {#accordion-states}

- Collapsed, expanded (per item)

### Accessibility {#accordion-accessibility}

- `aria-expanded` per panel
- Keyboard navigation

### WCAG Conformance {#accordion-wcag-conformance}

| Criterion                        | Level | How                                                                                                     |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Each panel trigger has `aria-expanded`; triggers and content panels are programmatically linked         |
| 1.3.2 Meaningful Sequence (A)    | A     | Panels appear in DOM order matching their visual stacking; content follows its trigger                  |
| 2.1.1 Keyboard (A)               | A     | Arrow keys navigate between panel triggers; Enter/Space toggles the focused panel                       |
| 4.1.2 Name, Role, Value (A)      | A     | Each trigger communicates its expanded/collapsed state and has an accessible name from the `title` prop |

### Common Mistakes {#accordion-common-mistakes}

| Mistake                                                                           | Impact                                                                                  | Fix                                                                                          |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| All panels collapsed on initial load with no visible indication of hidden content | Users may not realize there is content to expand, especially with assistive technology  | Expand the first panel by default, or provide clear visual cues that panels are expandable   |
| Missing keyboard navigation between panel triggers (Arrow Up/Down)                | Keyboard users must Tab through every focusable element to reach the next panel trigger | Implement arrow key navigation so Up/Down moves focus between triggers within the accordion  |
| No `aria-controls` linking each trigger to its content panel                      | Assistive technology cannot navigate directly from a trigger to its associated content  | Add `aria-controls` on each trigger referencing the `id` of its corresponding content region |

### Visual Design {#accordion-visual-design}

- **Container**: `--rialto-border`, `--rialto-radius-soft`, overflow hidden
- **Item dividers**: `border-top` between items
- **Trigger**: `--rialto-surface` default, hover `--rialto-surface-elevated`
- **Open trigger**: `--rialto-accent` chevron color, `data-open` attribute
- **Content**: `--rialto-text-secondary`, `--rialto-text-sm`, `--rialto-leading-relaxed`
- **Spacing**: `--rialto-space-sm` trigger padding, `--rialto-space-md` content padding

### Animation {#accordion-animation}

- Chevron: `springGentle` rotation (0° → 180°)
- Content expand/collapse: `springGentle` height + opacity per panel
- Uses `AnimatePresence` with `initial={false}` to avoid flash on mount
- Reduced motion: `duration: 0`, instant expand/collapse

### Related {#accordion-related}

- `Collapsible` — Single panel
- `Steps` — Sequential

### Example {#accordion-example}

```tsx
<Accordion
  items={[
    { id: 'faq1', title: 'What is this?', content: <p>Answer...</p> },
    { id: 'faq2', title: 'How do I use it?', content: <p>Answer...</p> },
  ]}
/>
```

---

## AspectRatio {#aspect-ratio}

Maintain proportional dimensions.

### When to Use {#aspect-ratio-when-to-use}

- Images
- Video embeds
- Responsive containers

### When NOT to Use {#aspect-ratio-when-not-to-use}

- Fixed dimensions → Use CSS directly
- Complex layouts → Use custom CSS

### Props {#aspect-ratio-props}

| Prop       | Type        | Required | Default | Description        |
| ---------- | ----------- | -------- | ------- | ------------------ |
| `ratio`    | `number`    | Yes      | -       | Width/height ratio |
| `children` | `ReactNode` | Yes      | -       | Content            |

### Common Ratios {#aspect-ratio-common-ratios}

- `16/9` — Video
- `4/3` — Photo
- `1/1` — Square
- `9/16` — Story/TikTok

### WCAG Conformance {#aspect-ratio-wcag-conformance}

| Criterion                        | Level | How                                                                                                     |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Pure layout wrapper; semantic meaning comes from children (e.g., `<img>` with `alt` text)               |
| 1.3.2 Meaningful Sequence (A)    | A     | Single-child container; reading order is unaffected by the aspect ratio constraint                      |
| 1.1.1 Non-text Content (A)       | A     | Content within the ratio container (images, video) must have text alternatives provided by the consumer |

### Common Mistakes {#aspect-ratio-common-mistakes}

| Mistake                                                                   | Impact                                                        | Fix                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Image inside AspectRatio missing `alt` text                               | Screen reader users have no description of the visual content | Always provide meaningful `alt` text on `<img>` elements, or `alt=""` for decorative images |
| Content overflows the aspect ratio container without handling             | Text or interactive content becomes clipped and inaccessible  | Use `overflow: auto` on the child or ensure content fits within the constrained dimensions  |
| Using AspectRatio for content that needs to be fully visible at all sizes | Important content may be cropped by `object-fit: cover`       | Use `object-fit: contain` instead, or choose a layout that does not crop content            |

### Visual Design {#aspect-ratio-visual-design}

- Pure layout constraint — no surface styling
- Sets CSS `aspect-ratio: var(--ratio)` via inline custom property
- Children are stretched with `object-fit: cover` and `inset: 0`

### Animation {#aspect-ratio-animation}

- None — static layout container

### Example {#aspect-ratio-example}

```tsx
<AspectRatio ratio={16/9}>
  <img src="image.jpg" alt="Landscape" />
</AspectRatio>

<AspectRatio ratio={1/1}>
  <img src="avatar.jpg" alt="Avatar" />
</AspectRatio>
```

---

## ScrollArea {#scroll-area}

Custom-styled scroll container.

### When to Use {#scroll-area-when-to-use}

- Overflowing content
- Custom scrollbar styling
- Horizontal scrolling

### When NOT to Use {#scroll-area-when-not-to-use}

- Simple overflow → Use CSS `overflow`
- Native scroll fine → Don't add complexity

### Props {#scroll-area-props}

| Prop     | Type     | Required | Default | Description      |
| -------- | -------- | -------- | ------- | ---------------- |
| `width`  | `string` | No       | -       | Container width  |
| `height` | `string` | No       | -       | Container height |

### Accessibility {#scroll-area-accessibility}

- Focus visible: `--rialto-shadow-focus` on the container
- Keyboard scrollable when focused

### WCAG Conformance {#scroll-area-wcag-conformance}

| Criterion                        | Level | How                                                                                    |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Scroll container is a generic `<div>`; semantic structure comes from its children      |
| 1.3.2 Meaningful Sequence (A)    | A     | Content within the scroll area maintains DOM order; scrolling does not reorder content |
| 2.1.1 Keyboard (A)               | A     | Container is focusable via `tabindex="0"` and scrollable with arrow keys when focused  |
| 2.4.7 Focus Visible (AA)         | AA    | Focused scroll container displays `--rialto-shadow-focus` gold glow ring               |

### Common Mistakes {#scroll-area-common-mistakes}

| Mistake                                                                              | Impact                                                               | Fix                                                                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scroll container not keyboard-focusable                                              | Keyboard-only users cannot scroll the content at all                 | Add `tabindex="0"` to the scroll container so it can receive focus and respond to arrow keys                         |
| Custom scrollbar is visual-only with no keyboard or assistive technology access      | Users who cannot use a mouse have no way to scroll                   | Ensure the container is focusable and that arrow keys scroll the content; avoid hiding the native scrollbar entirely |
| Missing `role="region"` and `aria-label` on scroll containers with important content | Screen reader users are not informed that a scrollable region exists | Add `role="region"` and a descriptive `aria-label` (e.g., "Scrollable code example") to the container                |

### Visual Design {#scroll-area-visual-design}

- **Scrollbar thumb**: `--rialto-surface-matte`, hover `--rialto-border-strong`
- **Scrollbar width**: 6px (webkit), `thin` (Firefox)
- **Thumb radius**: `--rialto-radius-round`
- Custom `scrollbar-color` for Firefox compatibility

### Animation {#scroll-area-animation}

- None — static scroll container

### Example {#scroll-area-example}

```tsx
<ScrollArea height={300}>
  <div>Long content...</div>
</ScrollArea>
```

---

## Footer {#footer}

Page footer with two layout variants.

### When to Use {#footer-when-to-use}

- Utility bar with links, copyright, and keyboard hints (minimal)
- Marketing footer with logo, link columns, and copyright (rich)
- Any page-level footer

### When NOT to Use {#footer-when-not-to-use}

- Inline content separator → Use `Divider`
- Navigation bar → Use `Navbar`

### Props {#footer-props}

| Prop        | Type                  | Required | Default     | Description                         |
| ----------- | --------------------- | -------- | ----------- | ----------------------------------- |
| `variant`   | `'minimal' \| 'rich'` | No       | `'minimal'` | Layout variant                      |
| `logo`      | `ReactNode`           | No       | "Rialto"    | Logo element (rich variant)         |
| `columns`   | `FooterColumn[]`      | No       | -           | Multi-column link groups (rich)     |
| `copyright` | `string`              | No       | -           | Bottom-line copyright text (rich)   |
| `children`  | `ReactNode`           | No       | -           | Arbitrary content (minimal variant) |

### Data Structures {#footer-data-structures}

```typescript
interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}
```

### States {#footer-states}

- Default, hover (links), focus-visible (links)

### Accessibility {#footer-accessibility}

- Footer links have `focusRing` for gold glow on focus-visible
- Column links wrapped in `<nav aria-label="Footer links">`
- Semantic `<footer>` element

### WCAG Conformance {#footer-wcag-conformance}

| Criterion                        | Level | How                                                                        |
| -------------------------------- | ----- | -------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses semantic `<footer>` element; link groups in `<nav>` with `aria-label` |
| 2.4.1 Bypass Blocks (A)          | A     | `<nav>` landmark allows skip-navigation to footer links                    |
| 2.4.7 Focus Visible (AA)         | AA    | Links display gold glow ring on `:focus-visible`                           |

### Common Mistakes {#footer-common-mistakes}

| Mistake                                      | Impact                                                      | Fix                                                      |
| -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Using `<div>` instead of `<footer>`          | Assistive technology cannot identify the footer landmark    | Component uses semantic `<footer>` automatically         |
| Footer links without visible focus indicator | Keyboard users cannot see which link is focused             | Links compose `focusRing` for gold glow on focus-visible |
| Missing `aria-label` on footer navigation    | Multiple `<nav>` landmarks are ambiguous for screen readers | Rich variant includes `aria-label="Footer links"` on nav |

### Visual Design {#footer-visual-design}

- **Gradient separator**: `::before` pseudo-element with horizontal gradient line
- **Link colors**: `--rialto-text-tertiary` default, `--rialto-accent` on hover
- **Column titles**: uppercase, tracked, `--rialto-text-xs`, weight 500
- **Copyright**: `--rialto-text-xs`, `--rialto-text-tertiary`
- **Responsive**: columns stack on mobile, reduced padding

### Animation {#footer-animation}

- None — hover color transitions use CSS `transition: color 0.15s ease`

### Example {#footer-example}

```tsx
// Minimal
<Footer>
  <span>&copy; 2026 Rialto</span>
  <a href="/privacy">Privacy</a>
</Footer>

// Rich
<Footer
  variant="rich"
  columns={[
    { title: 'Product', links: [{ label: 'Docs', href: '/docs' }] },
    { title: 'Resources', links: [{ label: 'GitHub', href: '/gh' }] },
  ]}
  copyright="&copy; 2026 Rialto Design System"
/>
```

---

## Hero {#hero}

Full-viewport marketing splash section.

### When to Use {#hero-when-to-use}

- Landing page hero sections
- Product marketing pages
- Feature announcement headers

### When NOT to Use {#hero-when-not-to-use}

- Page headers with breadcrumbs → Use `PageHeader`
- Content sections → Use `Stack` or custom layout

### Props {#hero-props}

| Prop          | Type        | Required | Default | Description                          |
| ------------- | ----------- | -------- | ------- | ------------------------------------ |
| `eyebrow`     | `string`    | No       | -       | Small uppercase label above title    |
| `title`       | `ReactNode` | Yes      | -       | Main heading (supports accent spans) |
| `subtitle`    | `string`    | No       | -       | Description paragraph                |
| `actions`     | `ReactNode` | No       | -       | CTA buttons/links slot               |
| `minHeight`   | `string`    | No       | `85vh`  | Minimum section height               |
| `showDivider` | `boolean`   | No       | `true`  | Gold accent divider                  |

### States {#hero-states}

- Entrance animation (fade-up with stagger), static after animation completes

### Accessibility {#hero-accessibility}

- Semantic `<section>` element with `<h1>` title
- Entrance animation respects `prefers-reduced-motion`
- Accent spans use `<span className="accent">` — color only, meaning conveyed by text

### WCAG Conformance {#hero-wcag-conformance}

| Criterion                               | Level | How                                                                         |
| --------------------------------------- | ----- | --------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A)        | A     | Uses semantic `<h1>` for the title; eyebrow and subtitle are `<p>` elements |
| 2.3.1 Three Flashes or Below (A)        | A     | Entrance animation is a single fade-up, no flashing                         |
| 2.3.3 Animation from Interactions (AAA) | AAA   | `useReducedMotion()` disables all entrance animations                       |

### Common Mistakes {#hero-common-mistakes}

| Mistake                                                   | Impact                                                | Fix                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Using gold accent color as the only way to convey meaning | Color-blind users miss the emphasis                   | Accent is decorative; meaning is always conveyed by the text itself |
| Not checking reduced motion before animating              | Users with vestibular disorders experience discomfort | Component checks `useReducedMotion()` and sets `duration: 0`        |
| Multiple `<h1>` elements on the same page                 | Heading hierarchy is broken for screen readers        | Use Hero once per page as the primary heading                       |

### Visual Design {#hero-visual-design}

- **Radial glow**: warm gold `::before` pseudo-element at 50% 45%
- **Machined edge**: gradient `::after` line at bottom
- **Eyebrow**: uppercase, tracked wide, `--rialto-text-xs`, `--rialto-text-tertiary`
- **Title**: `--rialto-text-4xl`, weight 300, tight tracking
- **Accent spans**: `color: var(--rialto-accent)`, italic
- **Divider**: 48px gold line, 2px height
- **Responsive**: title to `--rialto-text-3xl` at 768px, `--rialto-text-2xl` at 640px

### Animation {#hero-animation}

- `motion.section` container with stagger (0.08s between children)
- Each child fades up: `opacity: 0, y: 20` → `opacity: 1, y: 0`
- Transition: `precision` easing (0.15s, crisp)
- Reduced motion: `duration: 0` for all children

### Example {#hero-example}

```tsx
<Hero
  eyebrow="Design System"
  title={
    <>
      Precision meets <span className="accent">warmth</span>
    </>
  }
  subtitle="A component library for premium digital products."
  actions={
    <>
      <Button variant="primary">Get started</Button>
      <Button variant="secondary">Learn more</Button>
    </>
  }
/>
```

---

## PageHeader {#page-header}

Dark header band with breadcrumbs, title, and action buttons.

### When to Use {#page-header-when-to-use}

- Top of application pages with navigation context
- Pages that need breadcrumb trails
- Dark-band headers with action buttons

### When NOT to Use {#page-header-when-not-to-use}

- Marketing splash sections → Use `Hero`
- Navigation bars → Use `Navbar`
- Simple page titles → Use `Text` with heading variant

### Props {#page-header-props}

| Prop          | Type               | Required | Default | Description                                     |
| ------------- | ------------------ | -------- | ------- | ----------------------------------------------- |
| `title`       | `string`           | Yes      | -       | Page title                                      |
| `breadcrumbs` | `BreadcrumbItem[]` | No       | -       | Breadcrumb trail rendered above the title       |
| `actions`     | `ReactNode`        | No       | -       | Right-aligned action buttons (hidden on mobile) |
| `meta`        | `ReactNode`        | No       | -       | Badges or avatars beside the title              |
| `children`    | `ReactNode`        | No       | -       | Extra content below the title row               |

### States {#page-header-states}

- Default (dark surface with atmosphere and grain decorative layers)

### Accessibility {#page-header-accessibility}

- Semantic `<header>` element
- Breadcrumb rendered via `Breadcrumb` component with `aria-label`
- `<h1>` for the page title
- Actions hidden on narrow screens to prevent cramped touch targets

### WCAG Conformance {#page-header-wcag-conformance}

| Criterion                        | Level | How                                                                                      |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| 1.3.1 Info and Relationships (A) | A     | Uses semantic `<header>` with `<h1>` title; breadcrumbs via `Breadcrumb` component       |
| 1.4.3 Contrast Minimum (AA)      | AA    | `darkSurface` overrides ensure light text on dark background meets 4.5:1 contrast ratio  |
| 2.4.7 Focus Visible (AA)         | AA    | Breadcrumb links and action buttons inherit `focusRing` from their respective components |

### Common Mistakes {#page-header-common-mistakes}

| Mistake                                                       | Impact                                                | Fix                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Placing interactive content in the `meta` slot without labels | Screen readers cannot describe the metadata elements  | Ensure Badge/Avatar elements have accessible text or `aria-label` |
| Actions hidden on mobile with no alternative access           | Mobile users cannot reach action buttons              | Provide alternative navigation or inline the action in page body  |
| Using PageHeader without a breadcrumb on deep pages           | Users lose context of where they are in the hierarchy | Always provide breadcrumbs for pages nested 2+ levels deep        |

### Visual Design {#page-header-visual-design}

- **Surface**: `composes: darkSurface` — warm charcoal (#1a1918) with token overrides
- **Decorative layers**: atmosphere (gold ambient orbs) + grain (noise texture)
- **Title**: `--rialto-text-2xl`, weight 300, tight tracking, light text
- **Actions**: `margin-inline-start: auto` for right alignment
- **Inner container**: max-width 1200px, centered
- **Responsive**: title to `--rialto-text-xl` at 768px, actions hidden, reduced padding at 640px

### Animation {#page-header-animation}

- None — static header band

### Related {#page-header-related}

- `Hero` — Marketing splash (centered, full-viewport)
- `Breadcrumb` — Navigation trail (used internally)
- `Navbar` — Top navigation bar (horizontal links)

### Example {#page-header-example}

```tsx
<PageHeader
  breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
  title="Account Settings"
  meta={<Badge variant="accent">Pro</Badge>}
  actions={<Button size="sm">Save changes</Button>}
/>
```
