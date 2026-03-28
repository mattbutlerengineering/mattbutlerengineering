/**
 * Rialto Catalog Configuration
 *
 * Hand-authored usage-oriented descriptions for each curated component.
 * Descriptions tell the AI WHEN to use the component, not what it is.
 *
 * Components with `include: false` are in the curated list but deliberately
 * excluded from AI generation (sub-components, providers, etc.).
 */

export interface ComponentConfig {
  /** Whether to include this component in the catalog */
  include: boolean;
  /** Usage-oriented description for the AI */
  description: string;
  /** Named slot keys — use ['default'] for children slots */
  slots?: string[];
}

export const catalogConfig: Record<string, ComponentConfig> = {
  // ── Layout ──────────────────────────────────────────────────────
  Stack: {
    include: true,
    description:
      "Primary layout primitive. Use direction=column for vertical stacking, direction=row for horizontal. Compose with Card, Text, and form elements to build any layout. Use gap to control spacing between children.",
    slots: ["default"],
  },
  Card: {
    include: true,
    description:
      "Content container. Use for grouping related information with a title. Compose inside Stack to build layouts. Use variant=elevated (default) for most cards, variant=flat for dense lists, variant=glass for overlaid content.",
    slots: ["default"],
  },
  Divider: {
    include: true,
    description:
      "Visual separator between content sections. Use orientation=horizontal (default) between vertical sections, orientation=vertical between horizontal items. Use label for short text like 'or' between form options.",
  },
  AspectRatio: {
    include: true,
    description:
      "Constrains children to a fixed width-to-height ratio. Use for images, videos, or media embeds to prevent layout shift. Common ratios: 16/9 (video), 4/3 (photo), 1 (square).",
    slots: ["default"],
  },

  // ── Typography ───────────────────────────────────────────────────
  Text: {
    include: true,
    description:
      "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata.",
    slots: ["default"],
  },
  Badge: {
    include: true,
    description:
      "Small status indicator label. Use variant=success for active/complete states, variant=warning for pending/attention states, variant=error for failed/blocked states, variant=neutral (default) for informational tags. Use dot=true to add a status circle.",
    slots: ["default"],
  },
  Avatar: {
    include: true,
    description:
      "Circular user avatar. Shows image if src provided, falls back to initials from name, then a generic icon. Use size=sm for compact lists, size=md (default) for most contexts, size=lg for profile headers. Use status to show online presence.",
  },

  // ── Forms ────────────────────────────────────────────────────────
  Button: {
    include: true,
    description:
      "Clickable action trigger. Use variant=primary for the main CTA; variant=secondary for supporting actions; variant=ghost for tertiary or inline actions. Use size=sm for compact UIs, size=md (default) for most contexts, size=lg for prominent calls-to-action.",
    slots: ["default"],
  },
  Input: {
    include: true,
    description:
      "Single-line text field. Always provide a label. Use hint for helper text below the field. Set error=true to show error styling. Use type attribute for email, password, number, etc.",
  },
  Select: {
    include: true,
    description:
      "Dropdown selection field. Always provide a label and options array. Use when users must pick one value from a known list. Prefer over radio buttons when there are more than 4 options.",
  },
  Toggle: {
    include: true,
    description:
      "Binary on/off switch. Use for settings and preferences that take effect immediately without a submit button. Always provide a label describing what is being toggled.",
  },
  Checkbox: {
    include: true,
    description:
      "Checkbox for boolean selection. Use when users need to opt-in or out of something. Provide a label. Use description for additional context below the label. Use indeterminate for 'select all' with partial selection.",
  },

  // ── Navigation ───────────────────────────────────────────────────
  Tabs: {
    include: true,
    description:
      "Horizontal panel switcher for content organized into distinct sections. Use when users need to switch between 2-6 related views without leaving the page. Provide a tabs array with id, label, and content for each tab.",
  },
  Breadcrumb: {
    include: true,
    description:
      "Navigation trail showing hierarchy position. Use on detail pages to help users navigate back. Provide an items array with label and href for each level; omit href on the last item (current page).",
  },
  NavigationMenu: {
    include: true,
    description:
      "Horizontal dropdown navigation bar for top-level site navigation. Use for the primary nav with 3-8 top-level items. Items with children render as dropdown menus on hover.",
    slots: ["default"],
  },

  // ── Feedback ─────────────────────────────────────────────────────
  Alert: {
    include: true,
    description:
      "Inline feedback message embedded in the page flow. Use variant=info (default) for guidance, variant=success for confirmations, variant=warning for time-sensitive messages, variant=error for failures. Set dismissible=true to allow users to close it.",
    slots: ["default"],
  },
  Banner: {
    include: true,
    description:
      "Full-width page-level message displayed at the top of a view. Use for one-per-page system announcements. Unlike Alert (inline), Banner spans the full width. Use variant=info (default) for announcements, variant=warning for important notices, variant=error for critical failures.",
    slots: ["default"],
  },
  Dialog: {
    include: true,
    description:
      "Modal dialog for focused interactions requiring user attention. Use for confirmations, forms, and detail views. Provide open state and onClose handler. Use title for the modal heading, description for subtitle text.",
    slots: ["default"],
  },
  Toast: {
    include: true,
    description:
      "Transient notification shown via useToast() hook. Use variant=success for completed actions, variant=error for failures, variant=accent for highlights. Always provide a title. Add description for additional context. Auto-dismisses after 4s by default.",
  },

  // ── Data Display ─────────────────────────────────────────────────
  Table: {
    include: true,
    description:
      "Data table with sortable columns. Use for structured tabular data with 2+ columns. Provide columns array (key, header, sortable) and data array. Use density=compact for dense lists, density=spacious for readable tables. Use striped=true for alternating row backgrounds.",
  },
  DataList: {
    include: true,
    description:
      "Definition list of label-value pairs. Use for spec sheets, metadata panels, or structured key-value display. Use orientation=horizontal (default) for side-by-side pairs, orientation=vertical for stacked pairs. Use striped=true for alternating rows.",
  },
  EmptyState: {
    include: true,
    description:
      "Centered placeholder for empty lists, tables, or content areas. Show when a collection has no items. Use heading for the main message, description to explain what to do next. Optionally add an action button.",
    slots: ["default"],
  },
  Accordion: {
    include: true,
    description:
      "Grouped set of collapsible panels. Use for FAQs, settings groups, or any content that benefits from progressive disclosure. Provide items array with id, title, and content. Set multiple=true to allow several panels open at once.",
    slots: ["default"],
  },

  // ── App Shell ────────────────────────────────────────────────────
  Sidebar: {
    include: true,
    description:
      "Vertical navigation panel for app-level navigation. Provide items (flat SidebarItem list or grouped SidebarSection array). Set collapsed=true for icon-only rail mode. Set active=true on the current page item.",
  },
  AppBar: {
    include: true,
    description:
      "Sticky horizontal header bar for app navigation. Use glass=true (default) for backdrop blur surface. Use logo slot for brand identity and actions slot for navigation controls. Fixed height defaults to 56px.",
  },
  Footer: {
    include: true,
    description:
      "Page footer. Use variant=minimal (default) for a slim utility bar with children content. Use variant=rich for a multi-column footer with logo, link groups, and copyright text.",
    slots: ["default"],
  },
};
