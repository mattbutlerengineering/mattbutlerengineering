/**
 * Navigation sections data — single source of truth for sidebar and route generation.
 *
 * Each section maps to a functional category of components.
 * Each item's `id` is kebab-case and `path` is `/components/{id}`.
 *
 * Sections derived from App.tsx section numbers and titles.
 */

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** When true, item is rendered in a muted style with a "coming soon" indicator. */
  comingSoon?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Forms (sections 01–09 in App.tsx)
// ---------------------------------------------------------------------------
const FORMS: NavSection = {
  label: "Forms",
  items: [
    { id: "button", label: "Button", path: "/components/button" },
    { id: "input", label: "Input", path: "/components/input" },
    { id: "textarea", label: "TextArea", path: "/components/textarea" },
    { id: "number-input", label: "Number Input", path: "/components/number-input" },
    { id: "checkbox-radio", label: "Checkbox & Radio", path: "/components/checkbox-radio" },
    { id: "toggle", label: "Toggle", path: "/components/toggle" },
    { id: "master-override", label: "Master Override", path: "/components/master-override" },
    { id: "slider", label: "Slider", path: "/components/slider" },
    { id: "select", label: "Select", path: "/components/select" },
    { id: "pin-input", label: "Pin Input", path: "/components/pin-input" },
    { id: "segmented-control", label: "Segmented Control", path: "/components/segmented-control" },
    { id: "autocomplete", label: "Autocomplete", path: "/components/autocomplete" },
    { id: "input-group", label: "Input Group", path: "/components/input-group" },
  ],
};

// ---------------------------------------------------------------------------
// Data Display (sections 10–18 in App.tsx)
// ---------------------------------------------------------------------------
const DATA_DISPLAY: NavSection = {
  label: "Data Display",
  items: [
    { id: "card", label: "Card", path: "/components/card" },
    { id: "table", label: "Table", path: "/components/table" },
    { id: "badge", label: "Badge", path: "/components/badge" },
    { id: "tag", label: "Tag", path: "/components/tag" },
    { id: "avatar", label: "Avatar", path: "/components/avatar" },
    { id: "stat", label: "Stat", path: "/components/stat" },
    { id: "data-list", label: "Data List", path: "/components/data-list" },
    { id: "meter", label: "Meter", path: "/components/meter" },
    { id: "kbd", label: "Kbd", path: "/components/kbd" },
    { id: "flip-dot", label: "Flip Dot", path: "/components/flip-dot" },
    { id: "split-flap", label: "Split Flap", path: "/components/split-flap" },
    { id: "chalkboard", label: "Chalkboard", path: "/components/chalkboard" },
  ],
};

// ---------------------------------------------------------------------------
// Navigation (sections 19–25 in App.tsx)
// ---------------------------------------------------------------------------
const NAVIGATION: NavSection = {
  label: "Navigation",
  items: [
    { id: "tabs", label: "Tabs", path: "/components/tabs" },
    { id: "breadcrumb", label: "Breadcrumb", path: "/components/breadcrumb" },
    { id: "steps", label: "Steps", path: "/components/steps" },
    { id: "pagination", label: "Pagination", path: "/components/pagination" },
    { id: "navigation-menu", label: "Navigation Menu", path: "/components/navigation-menu" },
    { id: "tree", label: "Tree", path: "/components/tree" },
    { id: "sidebar", label: "Sidebar", path: "/components/sidebar" },
    { id: "navbar", label: "Navbar", path: "/components/navbar" },
  ],
};

// ---------------------------------------------------------------------------
// Feedback (sections 26–30 in App.tsx)
// ---------------------------------------------------------------------------
const FEEDBACK: NavSection = {
  label: "Feedback",
  items: [
    { id: "toast", label: "Toast", path: "/components/toast" },
    { id: "alert", label: "Alert", path: "/components/alert" },
    { id: "banner", label: "Banner", path: "/components/banner" },
    { id: "progress", label: "Progress", path: "/components/progress" },
    { id: "spinner", label: "Spinner", path: "/components/spinner" },
    { id: "skeleton", label: "Skeleton", path: "/components/skeleton" },
    { id: "empty-state", label: "Empty State", path: "/components/empty-state" },
  ],
};

// ---------------------------------------------------------------------------
// Overlays (sections 31–39 in App.tsx)
// ---------------------------------------------------------------------------
const OVERLAYS: NavSection = {
  label: "Overlays",
  items: [
    { id: "dialog", label: "Dialog", path: "/components/dialog" },
    { id: "confirm-dialog", label: "Confirm Dialog", path: "/components/confirm-dialog" },
    { id: "drawer", label: "Drawer", path: "/components/drawer" },
    { id: "command-palette", label: "Command Palette", path: "/components/command-palette" },
    { id: "tooltip", label: "Tooltip", path: "/components/tooltip" },
    { id: "popover", label: "Popover", path: "/components/popover" },
    { id: "hover-card", label: "Hover Card", path: "/components/hover-card" },
    { id: "dropdown-menu", label: "Dropdown Menu", path: "/components/dropdown-menu" },
    { id: "context-menu", label: "Context Menu", path: "/components/context-menu" },
    { id: "disabled-tooltip", label: "Disabled Tooltip", path: "/components/disabled-tooltip" },
  ],
};

// ---------------------------------------------------------------------------
// Layout (sections 40–48 in App.tsx)
// ---------------------------------------------------------------------------
const LAYOUT: NavSection = {
  label: "Layout",
  items: [
    { id: "divider", label: "Divider", path: "/components/divider" },
    { id: "text", label: "Text", path: "/components/text" },
    { id: "stack", label: "Stack", path: "/components/stack" },
    { id: "collapsible", label: "Collapsible", path: "/components/collapsible" },
    { id: "accordion", label: "Accordion", path: "/components/accordion" },
    { id: "aspect-ratio", label: "Aspect Ratio", path: "/components/aspect-ratio" },
    { id: "split-screen-exit", label: "Split Screen Exit", path: "/components/split-screen-exit" },
    { id: "scroll-area", label: "Scroll Area", path: "/components/scroll-area" },
    { id: "timeline", label: "Timeline", path: "/components/timeline" },
    { id: "hero", label: "Hero", path: "/components/hero" },
    { id: "footer", label: "Footer", path: "/components/footer" },
    { id: "page-header", label: "Page Header", path: "/components/page-header" },
  ],
};

// ---------------------------------------------------------------------------
// Tokens (sections 49–55 in App.tsx)
// ---------------------------------------------------------------------------
const TOKENS: NavSection = {
  label: "Tokens",
  items: [
    { id: "motion", label: "Motion", path: "/components/motion", comingSoon: true },
    { id: "typography", label: "Typography", path: "/components/typography", comingSoon: true },
    { id: "color", label: "Color", path: "/components/color", comingSoon: true },
    { id: "spacing", label: "Spacing", path: "/components/spacing", comingSoon: true },
    { id: "radius", label: "Radius", path: "/components/radius", comingSoon: true },
    { id: "shadows", label: "Shadows", path: "/components/shadows", comingSoon: true },
    { id: "surfaces", label: "Surfaces", path: "/components/surfaces", comingSoon: true },
    {
      id: "icon-vocabulary",
      label: "Icon Vocabulary",
      path: "/components/icon-vocabulary",
      comingSoon: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Examples
// ---------------------------------------------------------------------------
const EXAMPLES: NavSection = {
  label: "Examples",
  items: [
    { id: "example-dashboard", label: "Dashboard", path: "/examples/dashboard" },
    { id: "example-settings", label: "Settings", path: "/examples/settings" },
    { id: "example-form", label: "Form States", path: "/examples/form" },
  ],
};

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export const NAV_SECTIONS: NavSection[] = [
  FORMS,
  DATA_DISPLAY,
  NAVIGATION,
  FEEDBACK,
  OVERLAYS,
  LAYOUT,
  TOKENS,
  EXAMPLES,
];

/** Total number of showcased components across all sections. */
export const COMPONENT_COUNT = NAV_SECTIONS.reduce(
  (total, section) => total + section.items.length,
  0
);

/** Full-page demo routes (not component showcases). */
export const DEMO_PAGES = [
  { id: "sign-in", label: "Sign In", path: "/demos/login" },
  { id: "sign-up", label: "Sign Up", path: "/demos/signup" },
  { id: "dashboard", label: "Dashboard", path: "/demos/dashboard" },
  { id: "drivers", label: "Drivers CRUD", path: "/demos/drivers" },
  { id: "teams", label: "Team Create", path: "/demos/teams/new" },
  { id: "layouts", label: "Layout Demo", path: "/demos/layouts" },
] as const;
