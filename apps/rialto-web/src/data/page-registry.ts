/**
 * PageRegistry — single source of truth for all showcase pages.
 *
 * Nav sections, route definitions, and sitemap paths are all derived
 * from this registry. Adding a new page means one edit here, not three.
 *
 * Raw entries only need to declare `{id, label, category, comingSoon?}` —
 * `path` and `load` are derived by convention in `buildPageRegistry`:
 *   - path: /components/{id}, or /examples/{id sans "example-" prefix} for
 *     the Examples category, or /dashboard for the Dashboard category.
 *   - load: resolved by finding the page module whose file name matches
 *     PascalCase(label) + "Page" (or + "ExamplePage" for Examples), via
 *     import.meta.glob — this preserves per-page code splitting and fails
 *     at registry-build time (not click time) if no module matches.
 *
 * A handful of pages predate this convention (their module's file name or
 * export doesn't match their label) and carry an explicit `load` override.
 */

export interface PageEntry {
  id: string;
  label: string;
  category: string;
  path: string;
  comingSoon?: boolean;
  load: () => Promise<unknown>;
}

/** A registry entry as authored — see the module doc comment for derivation rules. */
export interface RawPageEntry {
  id: string;
  label: string;
  category: string;
  comingSoon?: boolean;
  /** Escape hatch for pages whose module doesn't follow the `{label}Page` convention. */
  load?: () => Promise<unknown>;
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
// Convention-based derivation of `path` and `load`
// ---------------------------------------------------------------------------

/**
 * All showcase page modules, keyed by import specifier. Lazy — preserves
 * per-page code splitting. Scoped to one-or-more subdirectories of "pages"
 * so top-level pages like OverviewPage/PrivacyPage — statically imported by
 * routes.tsx, not part of this registry — aren't swept in.
 */
const PAGE_MODULES = import.meta.glob("../pages/*/**/*Page.tsx") as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

function toPascalCase(label: string): string {
  return label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/** Derives a page module's expected named export from an entry's label + category. */
function deriveExportName(entry: Pick<RawPageEntry, "label" | "category">): string {
  const base = toPascalCase(entry.label);
  return entry.category === "Examples" ? `${base}ExamplePage` : `${base}Page`;
}

/**
 * Resolves a raw entry's `load` factory: an explicit override wins; otherwise
 * find the page module matching the `{label}Page` convention. Throws when no
 * module matches — a typo'd id/label fails loudly here, at registry-build
 * time, instead of silently at click time in the browser.
 */
function resolveLoad(entry: RawPageEntry): () => Promise<unknown> {
  if (entry.load) return entry.load;
  if (entry.comingSoon) return () => Promise.resolve({});

  const exportName = deriveExportName(entry);
  const modulePath = Object.keys(PAGE_MODULES).find((key) => key.endsWith(`/${exportName}.tsx`));
  if (!modulePath) {
    throw new Error(
      `PageRegistry: no page module found for "${entry.id}" (expected export "${exportName}"). ` +
        `Add an explicit "load" to the entry if its module doesn't follow the {label}Page convention.`
    );
  }

  const importModule = PAGE_MODULES[modulePath]!;
  return () => importModule().then((mod) => ({ default: mod[exportName] }));
}

/** Derives a page's route path from its id + category. */
function derivePath(entry: Pick<RawPageEntry, "id" | "category">): string {
  if (entry.category === "Dashboard") return "/dashboard";
  if (entry.category === "Examples") return `/examples/${entry.id.replace(/^example-/, "")}`;
  return `/components/${entry.id}`;
}

/** Builds full PageEntry objects (path + load resolved) from raw entries. */
export function buildPageRegistry(rawEntries: RawPageEntry[]): PageEntry[] {
  return rawEntries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    category: entry.category,
    path: derivePath(entry),
    ...(entry.comingSoon ? { comingSoon: true } : {}),
    load: resolveLoad(entry),
  }));
}

// ---------------------------------------------------------------------------
// The registry (raw entries)
// ---------------------------------------------------------------------------

const RAW_PAGE_ENTRIES: RawPageEntry[] = [
  // ── Forms ──────────────────────────────────────────────────────────────
  { id: "button", label: "Button", category: "Forms" },
  { id: "icon-button", label: "IconButton", category: "Forms" },
  { id: "input", label: "Input", category: "Forms" },
  { id: "textarea", label: "TextArea", category: "Forms" },
  { id: "number-input", label: "Number Input", category: "Forms" },
  { id: "checkbox-radio", label: "Checkbox & Radio", category: "Forms" },
  { id: "toggle", label: "Toggle", category: "Forms" },
  { id: "master-override", label: "Master Override", category: "Forms" },
  { id: "slider", label: "Slider", category: "Forms" },
  { id: "select", label: "Select", category: "Forms" },
  { id: "pin-input", label: "Pin Input", category: "Forms" },
  { id: "segmented-control", label: "Segmented Control", category: "Forms" },
  { id: "autocomplete", label: "Autocomplete", category: "Forms" },
  { id: "combobox", label: "Combobox", category: "Forms" },
  { id: "input-group", label: "Input Group", category: "Forms" },
  { id: "form", label: "Form", category: "Forms" },
  { id: "date-picker", label: "Date Picker", category: "Forms" },
  { id: "date-range", label: "Date Range", category: "Forms" },
  { id: "time-picker", label: "Time Picker", category: "Forms" },
  // ── Data Display ────────────────────────────────────────────────────────
  { id: "card", label: "Card", category: "Data Display" },
  { id: "table", label: "Table", category: "Data Display" },
  { id: "data-table", label: "DataTable", category: "Data Display" },
  { id: "badge", label: "Badge", category: "Data Display" },
  { id: "tag", label: "Tag", category: "Data Display" },
  { id: "avatar", label: "Avatar", category: "Data Display" },
  { id: "stat", label: "Stat", category: "Data Display" },
  { id: "data-list", label: "Data List", category: "Data Display" },
  { id: "meter", label: "Meter", category: "Data Display" },
  { id: "kbd", label: "Kbd", category: "Data Display" },
  { id: "flip-dot", label: "Flip Dot", category: "Data Display" },
  { id: "split-flap", label: "Split Flap", category: "Data Display" },
  { id: "departure-board", label: "Departure Board", category: "Data Display" },
  { id: "odometer", label: "Odometer", category: "Data Display" },
  { id: "chalkboard", label: "Chalkboard", category: "Data Display" },
  { id: "ferrofluid", label: "Ferrofluid", category: "Data Display" },
  { id: "silk-flow", label: "Silk Flow", category: "Data Display" },
  { id: "tape-chart", label: "Tape Chart", category: "Data Display" },
  // ── Navigation ──────────────────────────────────────────────────────────
  { id: "tabs", label: "Tabs", category: "Navigation" },
  { id: "breadcrumb", label: "Breadcrumb", category: "Navigation" },
  { id: "steps", label: "Steps", category: "Navigation" },
  { id: "pagination", label: "Pagination", category: "Navigation" },
  { id: "navigation-menu", label: "Navigation Menu", category: "Navigation" },
  { id: "tree", label: "Tree", category: "Navigation" },
  { id: "sidebar", label: "Sidebar", category: "Navigation" },
  { id: "navbar", label: "Navbar", category: "Navigation" },
  // ── Feedback ────────────────────────────────────────────────────────────
  { id: "toast", label: "Toast", category: "Feedback" },
  { id: "alert", label: "Alert", category: "Feedback" },
  { id: "banner", label: "Banner", category: "Feedback" },
  { id: "progress", label: "Progress", category: "Feedback" },
  { id: "spinner", label: "Spinner", category: "Feedback" },
  { id: "skeleton", label: "Skeleton", category: "Feedback" },
  { id: "empty-state", label: "Empty State", category: "Feedback" },
  // ── Overlays ────────────────────────────────────────────────────────────
  { id: "dialog", label: "Dialog", category: "Overlays" },
  { id: "confirm-dialog", label: "Confirm Dialog", category: "Overlays" },
  { id: "drawer", label: "Drawer", category: "Overlays" },
  { id: "command-palette", label: "Command Palette", category: "Overlays" },
  { id: "tooltip", label: "Tooltip", category: "Overlays" },
  { id: "popover", label: "Popover", category: "Overlays" },
  { id: "hover-card", label: "Hover Card", category: "Overlays" },
  { id: "dropdown-menu", label: "Dropdown Menu", category: "Overlays" },
  { id: "context-menu", label: "Context Menu", category: "Overlays" },
  { id: "disabled-tooltip", label: "Disabled Tooltip", category: "Overlays" },
  // ── Layout ──────────────────────────────────────────────────────────────
  { id: "divider", label: "Divider", category: "Layout" },
  { id: "text", label: "Text", category: "Layout" },
  { id: "stack", label: "Stack", category: "Layout" },
  { id: "collapsible", label: "Collapsible", category: "Layout" },
  { id: "accordion", label: "Accordion", category: "Layout" },
  { id: "aspect-ratio", label: "Aspect Ratio", category: "Layout" },
  { id: "split-screen-exit", label: "Split Screen Exit", category: "Layout" },
  { id: "scroll-area", label: "Scroll Area", category: "Layout" },
  { id: "timeline", label: "Timeline", category: "Layout" },
  { id: "hero", label: "Hero", category: "Layout" },
  { id: "footer", label: "Footer", category: "Layout" },
  { id: "page-header", label: "Page Header", category: "Layout" },
  // ── Tokens ──────────────────────────────────────────────────────────────
  { id: "motion", label: "Motion", category: "Tokens" },
  { id: "typography", label: "Typography", category: "Tokens" },
  { id: "color", label: "Color", category: "Tokens" },
  { id: "spacing", label: "Spacing", category: "Tokens" },
  { id: "radius", label: "Radius", category: "Tokens" },
  { id: "shadows", label: "Shadows", category: "Tokens" },
  { id: "surfaces", label: "Surfaces", category: "Tokens" },
  { id: "icon-vocabulary", label: "Icon Vocabulary", category: "Tokens" },
  // ── Dashboard ───────────────────────────────────────────────────────────
  // Reuses the /demos/dashboard page component — module name doesn't match label.
  {
    id: "acmm-dashboard",
    label: "ACMM Dashboard",
    category: "Dashboard",
    load: () => import("../pages/dashboard/Dashboard").then((m) => ({ default: m.Dashboard })),
  },
  // ── Examples ────────────────────────────────────────────────────────────
  { id: "example-dashboard", label: "Dashboard", category: "Examples" },
  { id: "example-settings", label: "Settings", category: "Examples" },
  { id: "example-form", label: "Form States", category: "Examples" },
  { id: "example-reservations", label: "Reservations List", category: "Examples" },
  // Module predates the "Guest Profile" label (originally "guest detail").
  {
    id: "example-guest-profile",
    label: "Guest Profile",
    category: "Examples",
    load: () =>
      import("../pages/examples/GuestDetailExamplePage").then((m) => ({
        default: m.GuestDetailExamplePage,
      })),
  },
  // Error pages use descriptive module names, not the numeric label.
  {
    id: "example-error-403",
    label: "Error 403",
    category: "Examples",
    load: () =>
      import("../pages/examples/ErrorForbiddenExamplePage").then((m) => ({
        default: m.ErrorForbiddenExamplePage,
      })),
  },
  {
    id: "example-error-404",
    label: "Error 404",
    category: "Examples",
    load: () =>
      import("../pages/examples/ErrorNotFoundExamplePage").then((m) => ({
        default: m.ErrorNotFoundExamplePage,
      })),
  },
  {
    id: "example-error-500",
    label: "Error 500",
    category: "Examples",
    load: () =>
      import("../pages/examples/ErrorServerExamplePage").then((m) => ({
        default: m.ErrorServerExamplePage,
      })),
  },
  { id: "example-booking-confirmed", label: "Booking Confirmed", category: "Examples" },
  { id: "example-booking-failed", label: "Booking Failed", category: "Examples" },
  { id: "example-pricing-table", label: "Pricing Table", category: "Examples" },
  { id: "example-command-palette", label: "Command Palette", category: "Examples" },
  { id: "example-booking-wizard", label: "Booking Wizard", category: "Examples" },
];

/** The full registry, derived from the raw entries above. */
export const PAGE_REGISTRY: PageEntry[] = buildPageRegistry(RAW_PAGE_ENTRIES);

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
