// AUTO-GENERATED -- do not edit. Run: pnpm --filter @mbe/rialto-catalog generate
// Co-located metadata from packages/rialto/src/components/<Component>/<Component>.catalog.ts
import type { CatalogMeta } from "./catalog-meta.js";

export const catalogMeta: Record<string, CatalogMeta> = {
  Accordion: {
    name: "Accordion",
    description:
      "Grouped set of collapsible panels. Use for FAQs, settings groups, or any content that benefits from progressive disclosure. Provide items array with id, title, and content. Set multiple=true to allow several panels open at once.",
    slots: ["default"],
  },
  Alert: {
    name: "Alert",
    description:
      "Inline feedback message embedded in the page flow. Use variant=info (default) for guidance, variant=success for confirmations, variant=warning for time-sensitive messages, variant=error for failures. Set dismissible=true to allow users to close it.",
    slots: ["default"],
    charLimits: { title: 60 },
  },
  AppBar: {
    name: "AppBar",
    description:
      "Sticky horizontal header bar for app navigation. Use glass=true (default) for backdrop blur surface. Use logo slot for brand identity and actions slot for navigation controls. Fixed height defaults to 56px.",
    charLimits: { height: 20 },
  },
  AspectRatio: {
    name: "AspectRatio",
    description:
      "Constrains children to a fixed width-to-height ratio. Use for images, videos, or media embeds to prevent layout shift. Common ratios: 16/9 (video), 4/3 (photo), 1 (square).",
    slots: ["default"],
  },
  Avatar: {
    name: "Avatar",
    description:
      "Circular user avatar. Shows image if src provided, falls back to initials from name, then a generic icon. Use size=sm for compact lists, size=md (default) for most contexts, size=lg for profile headers. Use status to show online presence.",
    charLimits: { name: 30 },
  },
  Badge: {
    name: "Badge",
    description:
      "Small status indicator label. Use variant=success for active/complete states, variant=warning for pending/attention states, variant=error for failed/blocked states, variant=neutral (default) for informational tags. Use dot=true to add a status circle.",
    slots: ["default"],
  },
  Banner: {
    name: "Banner",
    description:
      "Full-width page-level message displayed at the top of a view. Use for one-per-page system announcements. Unlike Alert (inline), Banner spans the full width. Use variant=info (default) for announcements, variant=warning for important notices, variant=error for critical failures.",
    slots: ["default"],
  },
  Breadcrumb: {
    name: "Breadcrumb",
    description:
      "Navigation trail showing hierarchy position. Use on detail pages to help users navigate back. Provide an items array with label and href for each level; omit href on the last item (current page).",
  },
  Button: {
    name: "Button",
    description:
      "Clickable action trigger. Use variant=primary for the main CTA; variant=secondary for supporting actions; variant=ghost for tertiary or inline actions. Use size=sm for compact UIs, size=md (default) for most contexts, size=lg for prominent calls-to-action.",
    slots: ["default"],
    aliases: { label: "children" },
  },
  Calendar: {
    name: "Calendar",
    include: false,
    description:
      "Inline, locale-aware month grid for single-date selection. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Keyboard-navigable ARIA grid.",
  },
  Card: {
    name: "Card",
    description:
      "Content container. Use for grouping related information with a title. Compose inside Stack to build layouts. Use variant=elevated (default) for most cards, variant=flat for dense lists, variant=glass for overlaid content.",
    slots: ["default"],
    charLimits: { title: 60, subtitle: 80 },
  },
  Checkbox: {
    name: "Checkbox",
    description:
      "Checkbox for boolean selection. Use when users need to opt-in or out of something. Provide a label. Use description for additional context below the label. Use indeterminate for 'select all' with partial selection.",
    charLimits: { label: 30, description: 80 },
  },
  Combobox: {
    name: "Combobox",
    description:
      "Editable, filterable listbox for picking from many options. Always provide a label and options array. Use for single selection with type-ahead, or set multiple for tag-style multi-select with removable chips. Supports async/loading and empty states announced to screen readers. Prefer over Select when users benefit from typing to filter a long list.",
    charLimits: { label: 40 },
  },
  DataList: {
    name: "DataList",
    description:
      "Definition list of label-value pairs. Use for spec sheets, metadata panels, or structured key-value display. Use orientation=horizontal (default) for side-by-side pairs, orientation=vertical for stacked pairs. Use striped=true for alternating rows.",
  },
  DataTable: {
    name: "DataTable",
    description:
      "Sortable, selectable data grid built on a native table with grid ARIA. Use for interactive tabular data that needs column sorting (asc/desc/none) or row selection. Provide columns (key, header, sortable, rowHeader) and data arrays plus rowKey. Set selectionMode to single or multiple to add accessible selection checkboxes and a select-all. Prefer plain Table for read-only presentational tables.",
    charLimits: { emptyMessage: 60 },
  },
  DatePicker: {
    name: "DatePicker",
    include: false,
    description:
      "Date field: a read-only trigger input that opens a popover-hosted Calendar. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Focus returns to the trigger on select or Escape.",
  },
  DepartureBoard: {
    name: "DepartureBoard",
    description:
      "Split-flap departure board hero that cycles through a sequence of short headlines or value-props with a mechanical flap animation. Use as a marketing or landing-page hero. Provide phrases as the ordered list of lines; tune holdMs for how long each line stays before flipping. Respects reduced motion by showing static text.",
  },
  Dialog: {
    name: "Dialog",
    description:
      "Modal dialog for focused interactions requiring user attention. Use for confirmations, forms, and detail views. Provide open state and onClose handler. Use title for the modal heading, description for subtitle text.",
    slots: ["default"],
    charLimits: { title: 60, description: 120 },
  },
  Divider: {
    name: "Divider",
    description:
      "Visual separator between content sections. Use orientation=horizontal (default) between vertical sections, orientation=vertical between horizontal items. Use label for short text like 'or' between form options.",
    charLimits: { label: 20 },
  },
  EmptyState: {
    name: "EmptyState",
    description:
      "Centered placeholder for empty lists, tables, or content areas. Show when a collection has no items. Use heading for the main message, description to explain what to do next. Optionally add an action button.",
    slots: ["default"],
    charLimits: { heading: 50, description: 300 },
    aliases: { title: "heading" },
  },
  Footer: {
    name: "Footer",
    description:
      "Page footer. Use variant=minimal (default) for a slim utility bar with children content. Use variant=rich for a multi-column footer with logo, link groups, and copyright text.",
    slots: ["default"],
    charLimits: { copyright: 80 },
  },
  Form: {
    name: "Form",
    include: false,
    description:
      "Wraps a set of FormField-wrapped controls. Validates on submit and blocks submission while any field is invalid.",
  },
  FormField: {
    name: "FormField",
    include: false,
    description:
      "Wraps a single field control (Input, TextArea, NumberInput, Select, or Combobox) and connects it to the enclosing Form's validation state.",
  },
  IconButton: {
    name: "IconButton",
    description:
      "Icon-only action trigger for toolbars, dismiss affordances, and dense controls. Composes Button, so it shares the same variant (ghost default, secondary, primary) and size (sm/md/lg) options. Always provide aria-label — the button has no visible text, so the label is the only accessible name.",
  },
  Input: {
    name: "Input",
    description:
      "Single-line text field. Always provide a label. Use hint for helper text below the field. Set error=true to show error styling. Use type attribute for email, password, number, etc.",
    charLimits: { label: 40, hint: 80 },
  },
  NavigationMenu: {
    name: "NavigationMenu",
    description:
      "Horizontal dropdown navigation bar for top-level site navigation. Use for the primary nav with 3-8 top-level items. Items with children render as dropdown menus on hover.",
    slots: ["default"],
  },
  Odometer: {
    name: "Odometer",
    description:
      "Mechanical rolling-counter that animates a numeric value digit-by-digit by composing SplitFlap. Use for hero metrics, KPIs, and live counters that should feel physical as they update. Reads a real number and formats it with locale grouping (Intl.NumberFormat); pass formatOptions for currency, percentages, or fraction digits. Respects prefers-reduced-motion (snaps, no roll) and announces the whole value to screen readers. Pairs with Stat for dashboard tiles.",
  },
  Select: {
    name: "Select",
    description:
      "Dropdown selection field. Always provide a label and options array. Use when users must pick one value from a known list. Prefer over radio buttons when there are more than 4 options.",
    charLimits: { label: 40 },
  },
  Sidebar: {
    name: "Sidebar",
    description:
      "Vertical navigation panel for app-level navigation. Provide items (flat SidebarItem list or grouped SidebarSection array). Set collapsed=true for icon-only rail mode. Set active=true on the current page item.",
  },
  Stack: {
    name: "Stack",
    description:
      "Primary layout primitive. Use direction=column for vertical stacking, direction=row for horizontal. Compose with Card, Text, and form elements to build any layout. Use gap to control spacing between children.",
    slots: ["default"],
  },
  Table: {
    name: "Table",
    description:
      "Data table with sortable columns. Use for structured tabular data with 2+ columns. Provide columns array (key, header, sortable) and data array. Use density=compact for dense lists, density=spacious for readable tables. Use striped=true for alternating row backgrounds.",
    charLimits: { emptyMessage: 60 },
  },
  Tabs: {
    name: "Tabs",
    description:
      "Horizontal panel switcher for content organized into distinct sections. Use when users need to switch between 2-6 related views without leaving the page. Provide a tabs array with id, label, and content for each tab.",
    aliases: { items: "tabs", defaultValue: "defaultTab" },
  },
  Text: {
    name: "Text",
    description:
      "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata.",
    slots: ["default"],
  },
  Toast: {
    name: "Toast",
    description:
      "Transient notification shown via useToast() hook. Use variant=success for completed actions, variant=error for failures, variant=accent for highlights. Always provide a title. Add description for additional context. Auto-dismisses after 4s by default.",
    charLimits: { title: 50, description: 120 },
  },
  Toggle: {
    name: "Toggle",
    description:
      "Binary on/off switch. Use for settings and preferences that take effect immediately without a submit button. Always provide a label describing what is being toggled.",
    charLimits: { label: 30 },
  },
};
