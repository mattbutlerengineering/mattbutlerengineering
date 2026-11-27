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
      "Sticky horizontal header bar for app navigation. Use glass=true (default) for the opaque glass surface. Use logo slot for brand identity and actions slot for navigation controls. Fixed height defaults to 56px.",
    charLimits: { height: 20 },
  },
  AspectRatio: {
    name: "AspectRatio",
    description:
      "Constrains children to a fixed width-to-height ratio. Use for images, videos, or media embeds to prevent layout shift. Common ratios: 16/9 (video), 4/3 (photo), 1 (square).",
    slots: ["default"],
  },
  Autocomplete: {
    name: "Autocomplete",
    description:
      "Text field with a filterable suggestion list. Use when the guest or staff member picks from a long list of known options (guests, tables, venues) but may type to narrow it. Always give a label and options; set emptyText for the no-match state.",
    charLimits: { label: 40, hint: 120, emptyText: 60 },
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
      "Small status indicator label. Use variant=success for active/complete states, variant=warning for pending/attention states, variant=error for failed/blocked states, variant=neutral (default) for informational tags. Use dot=true to add a status circle. Put its words in label (required unless it holds child elements).",
    slots: ["default"],
    aliases: { label: "children" },
  },
  Banner: {
    name: "Banner",
    description:
      "Full-width page-level message displayed at the top of a view. Use for one-per-page system announcements. Unlike Alert (inline), Banner spans the full width. Use variant=info (default) for announcements, variant=warning for important notices, variant=error for critical failures.",
    slots: ["default"],
  },
  BarChart: {
    name: "BarChart",
    description:
      "Vertical bar chart for a trend over time, such as revenue by month or signups by week. Use this instead of a paragraph or a Text element listing numbers. label is the accessible chart title (for example Revenue trend). data is an array of {label, value} points; value may be a number or a short formatted string such as $18.2k. Keep to about 12 points.",
    charLimits: { label: 60 },
  },
  Breadcrumb: {
    name: "Breadcrumb",
    description:
      "Navigation trail showing hierarchy position. Use on detail pages to help users navigate back. Provide an items array with label and href for each level; omit href on the last item (current page).",
  },
  Button: {
    name: "Button",
    description:
      "Clickable action trigger. Put the button's words in the label prop (for example, Contact sales). Use variant=primary for the main CTA; variant=secondary for supporting actions; variant=ghost for tertiary or inline actions. Use size=sm for compact UIs, size=md (default) for most contexts, size=lg for prominent calls-to-action.",
    slots: ["default"],
    aliases: { label: "children" },
  },
  Calendar: {
    name: "Calendar",
    include: false,
    description:
      "Inline, locale-aware month grid for single-date selection. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, an optional getDateLabel(iso) accessible-name callback, locale, and weekStartsOn. Keyboard-navigable ARIA grid.",
  },
  Card: {
    name: "Card",
    description:
      "Content container. Use for grouping related information with a title. Compose inside Stack to build layouts. Use variant=elevated (default) for most cards, variant=flat for dense lists, variant=glass for overlaid content.",
    slots: ["default"],
    charLimits: { title: 60, subtitle: 80 },
  },
  ChatPanel: {
    name: "ChatPanel",
    include: false,
    description:
      "Conversational panel that streams assistant replies and renders generated components inline. Use for an in-app assistant where staff ask questions or give commands in natural language.",
  },
  Checkbox: {
    name: "Checkbox",
    description:
      "Checkbox for boolean selection. Use when users need to opt-in or out of something. Provide a label of at most 80 characters (a full sentence such as a terms agreement fits). Use description for additional context below the label. Use indeterminate for 'select all' with partial selection. For single choice use RadioGroup (exported alongside): pass `options` (value, label, optional description/disabled/disabledReason), `orientation` (vertical or horizontal), `description`, `error` and `required`.",
    charLimits: { label: 80, description: 80 },
  },
  Collapsible: {
    name: "Collapsible",
    description:
      "Single show/hide section with a heading trigger. Use to tuck away secondary detail such as policies, notes, or advanced options so the main content stays scannable. Put the section content in the children slot.",
    slots: ["default"],
    charLimits: { trigger: 60 },
  },
  Combobox: {
    name: "Combobox",
    description:
      "Editable, filterable listbox for picking from many options. Always provide a label and options array. Use for single selection with type-ahead, or set multiple for tag-style multi-select with removable chips. Supports async/loading and empty states announced to screen readers. Prefer over Select when users benefit from typing to filter a long list.",
    charLimits: { label: 40 },
  },
  CommandPalette: {
    name: "CommandPalette",
    description:
      "Searchable command palette for jumping to pages or running actions by typing. Use for staff shortcuts across a busy service. Give items each with an id and short label, optionally grouped, and a placeholder.",
    charLimits: { placeholder: 60 },
  },
  ConfirmDialog: {
    name: "ConfirmDialog",
    description:
      "Confirmation dialog that asks the user to approve or cancel an action before it happens. Use for cancelling a booking, removing a guest or any step that is hard to undo. Give a short question as title, optional description, and set variant to destructive for irreversible actions.",
    charLimits: { title: 80, description: 200, confirmLabel: 24, cancelLabel: 24 },
  },
  ContextMenu: {
    name: "ContextMenu",
    description:
      "Right-click menu of actions attached to an element, such as a reservation or table. Use for secondary actions like edit, move or cancel. Give items with short labels; mark risky ones destructive.",
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
      "Date field: a read-only trigger input that opens a popover-hosted Calendar. Controlled via value (yyyy-mm-dd ISO string) and onChange; supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. editable lets the date be typed, with a problem shown for text that is not an allowed date; defaultMonth sets the month an empty field's calendar opens on. Focus lands on the selected or current day on open and returns to the trigger on select or Escape.",
  },
  DateRange: {
    name: "DateRange",
    include: false,
    description:
      "Inline, locale-aware month grid for date-range selection. Controlled via value ({ start, end } yyyy-mm-dd ISO strings, either endpoint nullable while picking) and onChange; the first activation sets the start, the second sets the end (endpoints auto-ordered, same-day allowed). Supports min/max bounds, an isDateDisabled predicate, locale, and weekStartsOn. Keyboard-navigable ARIA grid with an in-progress range preview.",
  },
  DateRangePicker: {
    name: "DateRangePicker",
    description:
      "Calendar popover for choosing a start and end date. Use for stays, multi-night bookings, and report periods. Set min and max to bound selectable dates and label to name the field.",
    charLimits: { label: 40, placeholder: 60 },
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
  DisabledTooltip: {
    name: "DisabledTooltip",
    description:
      "Wraps a control and explains why it is unavailable. Set disabled=true and give disabledReason a short sentence such as why a table cannot be booked; with no reason it renders its child unchanged.",
    slots: ["default"],
    charLimits: { disabledReason: 120 },
  },
  Divider: {
    name: "Divider",
    description:
      "Visual separator between content sections. Use orientation=horizontal (default) between vertical sections, orientation=vertical between horizontal items. Use label for short text like 'or' between form options.",
    charLimits: { label: 20 },
  },
  Drawer: {
    name: "Drawer",
    description:
      "Slide-out panel anchored to an edge for secondary tasks such as advanced settings, filters, or record details, without leaving the page. Provide open state and onClose handler, a title, and body content as children. Use side=right (default), left or bottom; size=compact, default, wide or full. Put action Buttons at the end of the body. A Button labelled 'Open ...' placed before the Drawer opens it; a Button labelled 'Close' inside closes it.",
    slots: ["default"],
    charLimits: { title: 60, description: 120 },
  },
  DropdownMenu: {
    name: "DropdownMenu",
    description:
      "Click-to-open menu of actions, such as a per-row overflow or an account menu. Set trigger to the trigger button label (e.g. 'Actions') and items to the entries: items have id and label (optional shortcut, disabled, destructive=true for dangerous actions like Delete); use type=divider to separate groups and type=label for a section heading. Use align=right when the trigger sits at the right edge.",
  },
  EmptyState: {
    name: "EmptyState",
    description:
      "Centered placeholder for empty lists, tables, or content areas. Show when a collection has no items. Use heading for the main message, description to explain what to do next. Optionally add an action button.",
    slots: ["default"],
    charLimits: { heading: 50, description: 300 },
    aliases: { title: "heading" },
  },
  ErrorBoundary: {
    name: "ErrorBoundary",
    description:
      "Safety wrapper that catches a rendering error in the content inside it and shows a calm fallback instead of a blank page. Wrap any section that loads data or renders something that could fail. It has no text of its own to write.",
    slots: ["default"],
  },
  FileUpload: {
    name: "FileUpload",
    description:
      "File picker with a drop zone and a removable file list. Use to collect documents or several files at once, such as a menu PDF or a CSV guest import. Give a label, and set accept (for example .pdf), maxSize and multiple to constrain the files.",
    charLimits: { label: 40, hint: 120, error: 120 },
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
  GlobalNav: {
    name: "GlobalNav",
    description:
      "Top bar that moves between the Mattbutler apps with a theme toggle. Use once at the top of a page. Set currentApp to the app being shown so its link is marked current.",
  },
  GuestCards: {
    name: "GuestCards",
    description:
      "One card per matching guest, stacked: name, visit count, risk and tags. Required: guests, an array of cards, at most five. Each card needs name, visits (a number) and risk (the raw value from the tool, such as trusted, copied as is); tags is the guest's tags, optional. The element writes the visit count and risk in words itself. Never put email, phone, notes or spend on a card. A card missing name, visits or risk is left out.",
  },
  Handshake: {
    name: "Handshake",
    description:
      "Instrument showing a multi-party exchange such as an OIDC sign-in, webhook confirmation, or device pairing: named stations joined by legs with a credential pulse travelling along the active one. Set stations to 2+ unique short names in order, state=idle, negotiating (default), settled or failed, and lane to the index of the active leg (0 = first to second station). aria-label is required and names the exchange (e.g. 'Verifying your sign-in'). Pair it with Text, Badge or DataList for per-station results.",
    charLimits: { "aria-label": 80 },
  },
  Heading: {
    name: "Heading",
    description:
      "Section heading. Use level to set the document outline (1 for the page title, 2 for sections, 3 below that) and size when the look should differ from the level. Put its words in text (required unless it holds child elements).",
    slots: ["default"],
    charLimits: { children: 120 },
    aliases: { text: "children" },
  },
  Hero: {
    name: "Hero",
    description:
      "Large opening section for a landing page, with a small eyebrow label, a big title, a subtitle and action buttons. Use once at the top of a marketing page. Keep title to one short line and subtitle to one or two sentences.",
    charLimits: { eyebrow: 40, subtitle: 200 },
  },
  HoverCard: {
    name: "HoverCard",
    description:
      "Rich preview card that opens when a trigger is hovered or focused. Use to show extra detail about a guest, table or reservation without leaving the page. Pass a short trigger element as children and the preview as content.",
  },
  IconButton: {
    name: "IconButton",
    description:
      "Icon-only action trigger for toolbars, dismiss affordances, and dense controls. Composes Button, so it shares the same variant (ghost default, secondary, primary) and size (sm/md/lg) options. Always provide aria-label — the button has no visible text, so the label is the only accessible name.",
  },
  ImageUpload: {
    name: "ImageUpload",
    description:
      "Image picker tile with preview, progress and validation. Use to collect a single photo such as a venue logo, menu photo or guest avatar. Give a label, and set accept and maxSize to constrain the file.",
    charLimits: { label: 40, hint: 120, error: 120 },
  },
  Input: {
    name: "Input",
    description:
      "Single-line text field. Always provide a label. Use hint for helper text below the field. Set error=true to show error styling. Use type attribute for email, password, number, etc.",
    charLimits: { label: 40, hint: 80 },
  },
  InputGroup: {
    name: "InputGroup",
    description:
      "Joins adjacent form controls into one visual row, for example a search Input beside a submit Button. Use only to pair related controls; place the controls as children.",
    slots: ["default"],
  },
  Kbd: {
    name: "Kbd",
    description:
      "Keyboard key cap for showing one key, such as Esc or K, inside help text or a hint. Put the key name in children.",
  },
  Listbox: {
    name: "Listbox",
    description:
      "Always-visible list for picking one option, or several with multiple=true. Use for short choices staff scan at a glance, such as a section, shift or table list. Give an aria-label and an options array of value and label.",
  },
  MasterOverride: {
    name: "MasterOverride",
    description:
      "Guarded master switch with a lift-to-arm safety cover. Use for high-stakes venue-wide toggles such as pausing all online bookings or closing the kitchen. Always give a label; the optional description explains the consequence, and variant danger signals the highest severity.",
    charLimits: { label: 40, idleLabel: 20, activeLabel: 20, coverLabel: 30 },
  },
  Meter: {
    name: "Meter",
    description:
      "Gauge showing a measured value within a known range, such as table occupancy or deposit goal. Unlike Progress it is not a task. Give value, min and max, a short label, and a variant (success, error) to signal good or bad.",
    charLimits: { label: 25 },
  },
  Navbar: {
    name: "Navbar",
    description:
      "Side navigation panel with a link list, user block and footer. Use for the main menu of a staff app. Give each link a short label and an href; nest links as children for sub-sections.",
    charLimits: { label: 40 },
  },
  NavigationMenu: {
    name: "NavigationMenu",
    description:
      "Horizontal dropdown navigation bar for top-level site navigation. Use for the primary nav with 3-8 top-level items. Items with children render as dropdown menus on hover.",
    slots: ["default"],
  },
  NumberInput: {
    name: "NumberInput",
    description:
      "Numeric field with stepper buttons. Use for counts and amounts such as party size, quantity, or price. Always give a label and a starting value; set min and max to bound it, and step (e.g. 0.5) to allow decimals.",
    charLimits: { label: 40, hint: 120, disabledReason: 120 },
  },
  PageHeader: {
    name: "PageHeader",
    description:
      "Page masthead with a title, optional breadcrumb trail, badges beside the title and action buttons. Use once at the top of a page. Keep title short and put the main actions in actions.",
    charLimits: { title: 80, breadcrumbLabel: 40 },
  },
  Pagination: {
    name: "Pagination",
    description:
      "Page navigation for long lists or tables, such as reservations or guests. Give page (starting at 1) and totalPages; use siblingCount to control how many neighbouring page numbers show.",
    charLimits: { ariaLabel: 60 },
  },
  PinInput: {
    name: "PinInput",
    description:
      "Row of single-character cells for a short one-time code, PIN, or verification code. Set length to the number of cells (default 4; use 6 for SMS codes), type=numeric (default) or alphanumeric, and mask=true for secrets. Always give a label and optionally a hint such as where the code was sent.",
    charLimits: { label: 40, hint: 120, disabledReason: 120 },
  },
  Popover: {
    name: "Popover",
    description:
      "Click-to-open floating panel anchored to a trigger button; it opens from that trigger (there is no open prop to set). Set trigger to the trigger button label (e.g. 'Pick a time') and put the panel body as children — text, Inputs, or a short list of Buttons. Use for small contextual choices or details that should not take permanent space; use Dialog for anything that needs the user attention. title is an optional panel heading; placement is bottom (default), top, left or right.",
    slots: ["default"],
    charLimits: { title: 60 },
  },
  Progress: {
    name: "Progress",
    description:
      "Progress bar for a task or flow that has a known or unknown duration, such as a booking import or an upload. Give a value from 0 to 100 for determinate progress, or omit it for an indeterminate bar. Add a short label saying what is in progress.",
    charLimits: { label: 40 },
  },
  ReservationList: {
    name: "ReservationList",
    description:
      "Bookings as aligned rows, in the order given (arrival order): time, guest, party size and status. Required: reservations, an array of rows. Each row needs time (the tool's localTime copied as is (HH:mm); the element writes it in the locale's clock. When the rows span several dates the tool's localTime already carries the date as YYYY-MM-DD HH:mm: copy all of it, never shorten it), partySize (a number) and status (the raw value from the tool, such as CONFIRMED, copied as is); guest is the guest name, left out for a walk-in. The element writes the party size and status in words itself. A row missing time, partySize or status is left out.",
  },
  ScrollArea: {
    name: "ScrollArea",
    description:
      "Fixed-height region whose content scrolls independently of the page. Set maxHeight (CSS value, e.g. '320px') and put the long content — a feed, list, or log — as children. Use when a long list must stay inside a panel or Card instead of lengthening the page.",
    slots: ["default"],
  },
  SegmentedControl: {
    name: "SegmentedControl",
    description:
      "Pill-style switch between 2-4 mutually exclusive options, such as Day / Week / Month. Provide a segments array (id and label for each) and value set to the id selected at first. Prefer over Tabs when the choice changes a view setting rather than navigating sections.",
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
  Skeleton: {
    name: "Skeleton",
    description:
      "Pulsing placeholder shape shown while content loads. Use variant=text or heading with lines=3 for a paragraph, variant=circle for an avatar, variant=card or rect for images and cards. Set width and height as CSS values (e.g. '100%', '48px'). Put Skeletons where the real content will appear, not as decoration.",
  },
  Slider: {
    name: "Slider",
    description:
      "Draggable single-value range control. Use to pick a number within a known range where precision matters less than feel, such as volume, brightness, or a budget. Provide a label, min, max, and defaultValue; set showValue to display the current number.",
    charLimits: { label: 40, disabledReason: 120 },
  },
  SplitScreenExit: {
    name: "SplitScreenExit",
    description:
      "Closing transition that splits the screen in two and reveals what is behind it. Set active=true when a finished flow, such as a confirmed booking, should exit. Give announcement a short sentence for screen readers.",
    slots: ["default"],
    charLimits: { announcement: 120 },
  },
  Stack: {
    name: "Stack",
    description:
      "Primary layout primitive. Use direction=column for vertical stacking, direction=row for horizontal. Compose with Card, Text, and form elements to build any layout. Use gap to control spacing between children.",
    slots: ["default"],
  },
  Stat: {
    name: "Stat",
    description:
      "A labelled headline number, such as covers tonight, open tables, or no-shows this week. value is the number (or short text such as 7:30 PM); label says what it counts. Add a delta such as +6 with trend=up|down|neutral to show a change. Put several Stats in a Stack with direction=row for a summary row.",
    charLimits: { label: 25, delta: 10 },
  },
  StatusLED: {
    name: "StatusLED",
    description:
      "A coloured status light with a label, such as a table's state. Use variant=success for free/available, variant=warning for needs attention (e.g. dirty), variant=danger for occupied or blocked, variant=accent for ready, variant=neutral or off otherwise. Always set label so the status is readable without colour.",
    charLimits: { label: 40 },
  },
  Steps: {
    name: "Steps",
    description:
      "Step indicator for a multi-step flow such as booking, checkout or onboarding. Give the ordered steps, each with a short label and optional description, and currentStep as a zero-based index of the active step.",
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
  Tag: {
    name: "Tag",
    description:
      "A short descriptive label, such as a guest tag (VIP, Regular), a dietary restriction (Gluten-free), an occasion (Birthday), or a seating preference. Put its words in label. Use Badge for status instead. variant=accent highlights, variant=success/error for positive or warning labels, default otherwise.",
    charLimits: { children: 30 },
    aliases: { label: "children" },
  },
  TagsInput: {
    name: "TagsInput",
    description:
      "Free-text tags entry where typing a value and pressing Enter or comma adds a removable chip. Use for open-ended notes such as guest dietary needs or venue tags. Give a label, and optionally maxTags and defaultValue.",
    charLimits: { label: 40, placeholder: 60, hint: 120 },
  },
  Text: {
    name: "Text",
    description:
      "Typography component for semantic text rendering. Use variant=display for page headings, variant=body (default) for paragraphs, variant=label for form labels, variant=caption for helper text, variant=detail for metadata. Put its words in text (required unless it holds child elements).",
    slots: ["default"],
    aliases: { text: "children" },
  },
  TextArea: {
    name: "TextArea",
    description:
      "Multi-line text field. Use for free-form input such as special requests, allergies, notes, or messages. Always give a label; add a hint for guidance and set maxLength when input must be bounded.",
    charLimits: { label: 40, hint: 120, disabledReason: 120 },
  },
  ThemeToggle: {
    name: "ThemeToggle",
    description:
      "Sun/moon icon button that switches between light and dark mode. Set theme to light or dark to match the current mode. Place it once, in the app bar or settings area.",
  },
  TimePicker: {
    name: "TimePicker",
    include: false,
    description:
      "Time field: a read-only trigger input that opens a popover-hosted listbox of interval slots. Controlled via value (24h HH:mm string) and onChange; supports a configurable step (default 15 min), min/max bounds, an isTimeDisabled predicate (authoritative over bounds), and locale-aware display. Focus returns to the trigger on select or Escape.",
  },
  TimeSlots: {
    name: "TimeSlots",
    description:
      "Open times for one date and party size, as static labels under a date line. Required: date (display text for the day, such as Friday, Oct 30), partySize (a number) and times (an array of open times in time order, each the tool's localTime copied as is (HH:mm); the element writes them in the locale's clock). List open times only; a closed or fully booked day is said in words, not with this element. The element writes the party size in words itself.",
    charLimits: { date: 40 },
  },
  Timeline: {
    name: "Timeline",
    description:
      "A time-ordered sequence of events, such as a guest's visit history. Each event has a title, optional description and timestamp (display text such as 7:30 PM), and status=completed|active|upcoming|error. Use compact=true for long lists.",
  },
  Toast: {
    name: "Toast",
    include: false,
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
  Tooltip: {
    name: "Tooltip",
    description:
      "Short hover/focus hint attached to one trigger element. Put the element being explained (a Button, IconButton, Badge, or Text) as the single child and the hint in content (one short sentence). Use for brief explanations of terms or icon-only controls; never for essential information, long text, or interactive content. placement is top (default), bottom, left or right.",
    slots: ["default"],
    charLimits: { content: 80 },
  },
  Tree: {
    name: "Tree",
    description:
      "Expandable hierarchy for navigating nested data such as floor plans, menu categories or organisation units. Provide a data array of nodes with id and label, and optional nested children.",
  },
};
