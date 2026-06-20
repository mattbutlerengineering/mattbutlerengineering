/**
 * PageRegistry — single source of truth for all showcase pages.
 *
 * Nav sections, route definitions, and sitemap paths are all derived
 * from this registry. Adding a new page means one edit here, not three.
 *
 * Each entry carries:
 *   id       — kebab-case, unique. Component routes use /components/{id}.
 *   label    — display name in the sidebar.
 *   category — groups entries into nav sections (order of first appearance preserved).
 *   path     — full route path (e.g. /components/button, /examples/dashboard).
 *   comingSoon? — renders with a muted "coming soon" indicator in the nav.
 *   load     — lazy dynamic import factory (preserves per-page code splitting).
 */

export interface PageEntry {
  id: string;
  label: string;
  category: string;
  path: string;
  comingSoon?: boolean;
  load: () => Promise<unknown>;
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  comingSoon?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Registry validation helper
// ---------------------------------------------------------------------------

function validateEntry(entry: PageEntry): void {
  if (!entry.id) throw new Error(`PageRegistry: entry missing required field "id"`);
  if (!entry.label)
    throw new Error(`PageRegistry: entry "${entry.id}" missing required field "label"`);
  if (!entry.category)
    throw new Error(`PageRegistry: entry "${entry.id}" missing required field "category"`);
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const PAGE_REGISTRY: PageEntry[] = [
  // ── Forms ──────────────────────────────────────────────────────────────
  {
    id: "button",
    label: "Button",
    category: "Forms",
    path: "/components/button",
    load: () => import("../pages/forms/ButtonPage").then((m) => ({ default: m.ButtonPage })),
  },
  {
    id: "input",
    label: "Input",
    category: "Forms",
    path: "/components/input",
    load: () => import("../pages/forms/InputPage").then((m) => ({ default: m.InputPage })),
  },
  {
    id: "textarea",
    label: "TextArea",
    category: "Forms",
    path: "/components/textarea",
    load: () => import("../pages/forms/TextAreaPage").then((m) => ({ default: m.TextAreaPage })),
  },
  {
    id: "number-input",
    label: "Number Input",
    category: "Forms",
    path: "/components/number-input",
    load: () =>
      import("../pages/forms/NumberInputPage").then((m) => ({ default: m.NumberInputPage })),
  },
  {
    id: "checkbox-radio",
    label: "Checkbox & Radio",
    category: "Forms",
    path: "/components/checkbox-radio",
    load: () =>
      import("../pages/forms/CheckboxRadioPage").then((m) => ({ default: m.CheckboxRadioPage })),
  },
  {
    id: "toggle",
    label: "Toggle",
    category: "Forms",
    path: "/components/toggle",
    load: () => import("../pages/forms/TogglePage").then((m) => ({ default: m.TogglePage })),
  },
  {
    id: "master-override",
    label: "Master Override",
    category: "Forms",
    path: "/components/master-override",
    load: () =>
      import("../pages/forms/MasterOverridePage").then((m) => ({ default: m.MasterOverridePage })),
  },
  {
    id: "slider",
    label: "Slider",
    category: "Forms",
    path: "/components/slider",
    load: () => import("../pages/forms/SliderPage").then((m) => ({ default: m.SliderPage })),
  },
  {
    id: "select",
    label: "Select",
    category: "Forms",
    path: "/components/select",
    load: () => import("../pages/forms/SelectPage").then((m) => ({ default: m.SelectPage })),
  },
  {
    id: "pin-input",
    label: "Pin Input",
    category: "Forms",
    path: "/components/pin-input",
    load: () => import("../pages/forms/PinInputPage").then((m) => ({ default: m.PinInputPage })),
  },
  {
    id: "segmented-control",
    label: "Segmented Control",
    category: "Forms",
    path: "/components/segmented-control",
    load: () =>
      import("../pages/forms/SegmentedControlPage").then((m) => ({
        default: m.SegmentedControlPage,
      })),
  },
  {
    id: "autocomplete",
    label: "Autocomplete",
    category: "Forms",
    path: "/components/autocomplete",
    load: () =>
      import("../pages/forms/AutocompletePage").then((m) => ({ default: m.AutocompletePage })),
  },
  {
    id: "input-group",
    label: "Input Group",
    category: "Forms",
    path: "/components/input-group",
    load: () =>
      import("../pages/forms/InputGroupPage").then((m) => ({ default: m.InputGroupPage })),
  },
  // ── Data Display ────────────────────────────────────────────────────────
  {
    id: "card",
    label: "Card",
    category: "Data Display",
    path: "/components/card",
    load: () => import("../pages/data/CardPage").then((m) => ({ default: m.CardPage })),
  },
  {
    id: "table",
    label: "Table",
    category: "Data Display",
    path: "/components/table",
    load: () => import("../pages/data/TablePage").then((m) => ({ default: m.TablePage })),
  },
  {
    id: "badge",
    label: "Badge",
    category: "Data Display",
    path: "/components/badge",
    load: () => import("../pages/data/BadgePage").then((m) => ({ default: m.BadgePage })),
  },
  {
    id: "tag",
    label: "Tag",
    category: "Data Display",
    path: "/components/tag",
    load: () => import("../pages/data/TagPage").then((m) => ({ default: m.TagPage })),
  },
  {
    id: "avatar",
    label: "Avatar",
    category: "Data Display",
    path: "/components/avatar",
    load: () => import("../pages/data/AvatarPage").then((m) => ({ default: m.AvatarPage })),
  },
  {
    id: "stat",
    label: "Stat",
    category: "Data Display",
    path: "/components/stat",
    load: () => import("../pages/data/StatPage").then((m) => ({ default: m.StatPage })),
  },
  {
    id: "data-list",
    label: "Data List",
    category: "Data Display",
    path: "/components/data-list",
    load: () => import("../pages/data/DataListPage").then((m) => ({ default: m.DataListPage })),
  },
  {
    id: "meter",
    label: "Meter",
    category: "Data Display",
    path: "/components/meter",
    load: () => import("../pages/data/MeterPage").then((m) => ({ default: m.MeterPage })),
  },
  {
    id: "kbd",
    label: "Kbd",
    category: "Data Display",
    path: "/components/kbd",
    load: () => import("../pages/data/KbdPage").then((m) => ({ default: m.KbdPage })),
  },
  {
    id: "flip-dot",
    label: "Flip Dot",
    category: "Data Display",
    path: "/components/flip-dot",
    load: () => import("../pages/data/FlipDotPage").then((m) => ({ default: m.FlipDotPage })),
  },
  {
    id: "split-flap",
    label: "Split Flap",
    category: "Data Display",
    path: "/components/split-flap",
    load: () => import("../pages/data/SplitFlapPage").then((m) => ({ default: m.SplitFlapPage })),
  },
  {
    id: "chalkboard",
    label: "Chalkboard",
    category: "Data Display",
    path: "/components/chalkboard",
    load: () => import("../pages/data/ChalkboardPage").then((m) => ({ default: m.ChalkboardPage })),
  },
  {
    id: "ferrofluid",
    label: "Ferrofluid",
    category: "Data Display",
    path: "/components/ferrofluid",
    load: () => import("../pages/data/FerrofluidPage").then((m) => ({ default: m.FerrofluidPage })),
  },
  {
    id: "tape-chart",
    label: "Tape Chart",
    category: "Data Display",
    path: "/components/tape-chart",
    load: () => import("../pages/data/TapeChartPage").then((m) => ({ default: m.TapeChartPage })),
  },
  // ── Navigation ──────────────────────────────────────────────────────────
  {
    id: "tabs",
    label: "Tabs",
    category: "Navigation",
    path: "/components/tabs",
    load: () => import("../pages/navigation/TabsPage").then((m) => ({ default: m.TabsPage })),
  },
  {
    id: "breadcrumb",
    label: "Breadcrumb",
    category: "Navigation",
    path: "/components/breadcrumb",
    load: () =>
      import("../pages/navigation/BreadcrumbPage").then((m) => ({ default: m.BreadcrumbPage })),
  },
  {
    id: "steps",
    label: "Steps",
    category: "Navigation",
    path: "/components/steps",
    load: () => import("../pages/navigation/StepsPage").then((m) => ({ default: m.StepsPage })),
  },
  {
    id: "pagination",
    label: "Pagination",
    category: "Navigation",
    path: "/components/pagination",
    load: () =>
      import("../pages/navigation/PaginationPage").then((m) => ({ default: m.PaginationPage })),
  },
  {
    id: "navigation-menu",
    label: "Navigation Menu",
    category: "Navigation",
    path: "/components/navigation-menu",
    load: () =>
      import("../pages/navigation/NavigationMenuPage").then((m) => ({
        default: m.NavigationMenuPage,
      })),
  },
  {
    id: "tree",
    label: "Tree",
    category: "Navigation",
    path: "/components/tree",
    load: () => import("../pages/data/TreePage").then((m) => ({ default: m.TreePage })),
  },
  {
    id: "sidebar",
    label: "Sidebar",
    category: "Navigation",
    path: "/components/sidebar",
    load: () => import("../pages/navigation/SidebarPage").then((m) => ({ default: m.SidebarPage })),
  },
  {
    id: "navbar",
    label: "Navbar",
    category: "Navigation",
    path: "/components/navbar",
    load: () => import("../pages/navigation/NavbarPage").then((m) => ({ default: m.NavbarPage })),
  },
  // ── Feedback ────────────────────────────────────────────────────────────
  {
    id: "toast",
    label: "Toast",
    category: "Feedback",
    path: "/components/toast",
    load: () => import("../pages/feedback/ToastPage").then((m) => ({ default: m.ToastPage })),
  },
  {
    id: "alert",
    label: "Alert",
    category: "Feedback",
    path: "/components/alert",
    load: () => import("../pages/feedback/AlertPage").then((m) => ({ default: m.AlertPage })),
  },
  {
    id: "banner",
    label: "Banner",
    category: "Feedback",
    path: "/components/banner",
    load: () => import("../pages/feedback/BannerPage").then((m) => ({ default: m.BannerPage })),
  },
  {
    id: "progress",
    label: "Progress",
    category: "Feedback",
    path: "/components/progress",
    load: () => import("../pages/feedback/ProgressPage").then((m) => ({ default: m.ProgressPage })),
  },
  {
    id: "spinner",
    label: "Spinner",
    category: "Feedback",
    path: "/components/spinner",
    load: () => import("../pages/feedback/SpinnerPage").then((m) => ({ default: m.SpinnerPage })),
  },
  {
    id: "skeleton",
    label: "Skeleton",
    category: "Feedback",
    path: "/components/skeleton",
    load: () => import("../pages/feedback/SkeletonPage").then((m) => ({ default: m.SkeletonPage })),
  },
  {
    id: "empty-state",
    label: "Empty State",
    category: "Feedback",
    path: "/components/empty-state",
    load: () =>
      import("../pages/feedback/EmptyStatePage").then((m) => ({ default: m.EmptyStatePage })),
  },
  // ── Overlays ────────────────────────────────────────────────────────────
  {
    id: "dialog",
    label: "Dialog",
    category: "Overlays",
    path: "/components/dialog",
    load: () => import("../pages/overlays/DialogPage").then((m) => ({ default: m.DialogPage })),
  },
  {
    id: "confirm-dialog",
    label: "Confirm Dialog",
    category: "Overlays",
    path: "/components/confirm-dialog",
    load: () =>
      import("../pages/overlays/ConfirmDialogPage").then((m) => ({
        default: m.ConfirmDialogPage,
      })),
  },
  {
    id: "drawer",
    label: "Drawer",
    category: "Overlays",
    path: "/components/drawer",
    load: () => import("../pages/overlays/DrawerPage").then((m) => ({ default: m.DrawerPage })),
  },
  {
    id: "command-palette",
    label: "Command Palette",
    category: "Overlays",
    path: "/components/command-palette",
    load: () =>
      import("../pages/overlays/CommandPalettePage").then((m) => ({
        default: m.CommandPalettePage,
      })),
  },
  {
    id: "tooltip",
    label: "Tooltip",
    category: "Overlays",
    path: "/components/tooltip",
    load: () => import("../pages/overlays/TooltipPage").then((m) => ({ default: m.TooltipPage })),
  },
  {
    id: "popover",
    label: "Popover",
    category: "Overlays",
    path: "/components/popover",
    load: () => import("../pages/overlays/PopoverPage").then((m) => ({ default: m.PopoverPage })),
  },
  {
    id: "hover-card",
    label: "Hover Card",
    category: "Overlays",
    path: "/components/hover-card",
    load: () =>
      import("../pages/overlays/HoverCardPage").then((m) => ({ default: m.HoverCardPage })),
  },
  {
    id: "dropdown-menu",
    label: "Dropdown Menu",
    category: "Overlays",
    path: "/components/dropdown-menu",
    load: () =>
      import("../pages/overlays/DropdownMenuPage").then((m) => ({
        default: m.DropdownMenuPage,
      })),
  },
  {
    id: "context-menu",
    label: "Context Menu",
    category: "Overlays",
    path: "/components/context-menu",
    load: () =>
      import("../pages/overlays/ContextMenuPage").then((m) => ({
        default: m.ContextMenuPage,
      })),
  },
  {
    id: "disabled-tooltip",
    label: "Disabled Tooltip",
    category: "Overlays",
    path: "/components/disabled-tooltip",
    load: () =>
      import("../pages/overlays/DisabledTooltipPage").then((m) => ({
        default: m.DisabledTooltipPage,
      })),
  },
  // ── Layout ──────────────────────────────────────────────────────────────
  {
    id: "divider",
    label: "Divider",
    category: "Layout",
    path: "/components/divider",
    load: () => import("../pages/layout/DividerPage").then((m) => ({ default: m.DividerPage })),
  },
  {
    id: "text",
    label: "Text",
    category: "Layout",
    path: "/components/text",
    load: () => import("../pages/layout/TextPage").then((m) => ({ default: m.TextPage })),
  },
  {
    id: "stack",
    label: "Stack",
    category: "Layout",
    path: "/components/stack",
    load: () => import("../pages/layout/StackPage").then((m) => ({ default: m.StackPage })),
  },
  {
    id: "collapsible",
    label: "Collapsible",
    category: "Layout",
    path: "/components/collapsible",
    load: () =>
      import("../pages/layout/CollapsiblePage").then((m) => ({ default: m.CollapsiblePage })),
  },
  {
    id: "accordion",
    label: "Accordion",
    category: "Layout",
    path: "/components/accordion",
    load: () => import("../pages/layout/AccordionPage").then((m) => ({ default: m.AccordionPage })),
  },
  {
    id: "aspect-ratio",
    label: "Aspect Ratio",
    category: "Layout",
    path: "/components/aspect-ratio",
    load: () =>
      import("../pages/layout/AspectRatioPage").then((m) => ({ default: m.AspectRatioPage })),
  },
  {
    id: "split-screen-exit",
    label: "Split Screen Exit",
    category: "Layout",
    path: "/components/split-screen-exit",
    load: () =>
      import("../pages/layout/SplitScreenExitPage").then((m) => ({
        default: m.SplitScreenExitPage,
      })),
  },
  {
    id: "scroll-area",
    label: "Scroll Area",
    category: "Layout",
    path: "/components/scroll-area",
    load: () =>
      import("../pages/layout/ScrollAreaPage").then((m) => ({ default: m.ScrollAreaPage })),
  },
  {
    id: "timeline",
    label: "Timeline",
    category: "Layout",
    path: "/components/timeline",
    load: () => import("../pages/data/TimelinePage").then((m) => ({ default: m.TimelinePage })),
  },
  {
    id: "hero",
    label: "Hero",
    category: "Layout",
    path: "/components/hero",
    load: () => import("../pages/layout/HeroPage").then((m) => ({ default: m.HeroPage })),
  },
  {
    id: "footer",
    label: "Footer",
    category: "Layout",
    path: "/components/footer",
    load: () => import("../pages/layout/FooterPage").then((m) => ({ default: m.FooterPage })),
  },
  {
    id: "page-header",
    label: "Page Header",
    category: "Layout",
    path: "/components/page-header",
    load: () =>
      import("../pages/layout/PageHeaderPage").then((m) => ({ default: m.PageHeaderPage })),
  },
  // ── Tokens ──────────────────────────────────────────────────────────────
  {
    id: "motion",
    label: "Motion",
    category: "Tokens",
    path: "/components/motion",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "typography",
    label: "Typography",
    category: "Tokens",
    path: "/components/typography",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "color",
    label: "Color",
    category: "Tokens",
    path: "/components/color",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "spacing",
    label: "Spacing",
    category: "Tokens",
    path: "/components/spacing",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "radius",
    label: "Radius",
    category: "Tokens",
    path: "/components/radius",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "shadows",
    label: "Shadows",
    category: "Tokens",
    path: "/components/shadows",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "surfaces",
    label: "Surfaces",
    category: "Tokens",
    path: "/components/surfaces",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  {
    id: "icon-vocabulary",
    label: "Icon Vocabulary",
    category: "Tokens",
    path: "/components/icon-vocabulary",
    comingSoon: true,
    load: () => Promise.resolve({}),
  },
  // ── Dashboard ───────────────────────────────────────────────────────────
  {
    id: "acmm-dashboard",
    label: "ACMM Dashboard",
    category: "Dashboard",
    path: "/dashboard",
    load: () => import("../pages/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })),
  },
  // ── Examples ────────────────────────────────────────────────────────────
  {
    id: "example-dashboard",
    label: "Dashboard",
    category: "Examples",
    path: "/examples/dashboard",
    load: () =>
      import("../pages/examples/DashboardExamplePage").then((m) => ({
        default: m.DashboardExamplePage,
      })),
  },
  {
    id: "example-settings",
    label: "Settings",
    category: "Examples",
    path: "/examples/settings",
    load: () =>
      import("../pages/examples/SettingsExamplePage").then((m) => ({
        default: m.SettingsExamplePage,
      })),
  },
  {
    id: "example-form",
    label: "Form States",
    category: "Examples",
    path: "/examples/form",
    load: () =>
      import("../pages/examples/FormStatesExamplePage").then((m) => ({
        default: m.FormStatesExamplePage,
      })),
  },
];

// ---------------------------------------------------------------------------
// Derived nav sections
// ---------------------------------------------------------------------------

/**
 * Build nav sections from the registry, grouped by category.
 * Category order is determined by first appearance in the registry.
 * Throws if any entry is missing required fields.
 */
export function buildNavSections(entries: PageEntry[]): NavSection[] {
  // Validate all entries first
  for (const entry of entries) {
    validateEntry(entry);
  }

  const sectionMap = new Map<string, NavItem[]>();

  for (const entry of entries) {
    if (!sectionMap.has(entry.category)) {
      sectionMap.set(entry.category, []);
    }
    sectionMap.get(entry.category)!.push({
      id: entry.id,
      label: entry.label,
      path: entry.path,
      ...(entry.comingSoon ? { comingSoon: true } : {}),
    });
  }

  return Array.from(sectionMap.entries()).map(([label, items]) => ({ label, items }));
}

// ---------------------------------------------------------------------------
// Derived sitemap paths
// ---------------------------------------------------------------------------

/**
 * Returns all page paths for sitemap generation.
 */
export function buildSitemapPaths(entries: PageEntry[]): string[] {
  return entries.map((e) => e.path);
}

// ---------------------------------------------------------------------------
// Pre-built exports (derived from the registry at module load time)
// ---------------------------------------------------------------------------

/** Nav sections derived from PAGE_REGISTRY. Replaces the hand-written nav-sections list. */
export const REGISTRY_NAV_SECTIONS: NavSection[] = buildNavSections(PAGE_REGISTRY);

/** Sitemap paths derived from PAGE_REGISTRY. */
export const REGISTRY_SITEMAP_PATHS: string[] = buildSitemapPaths(PAGE_REGISTRY);
