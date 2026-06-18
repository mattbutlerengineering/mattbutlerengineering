import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { isNonAuditableFile } from "./file-classifier.js";

// ── Types ───────────────────────────────────────────────────────────

export type Zone =
  | "marketing"
  | "hospitality"
  | "rialto"
  | "gen"
  | "api:users"
  | "api:reservations"
  | "api:agent";

export const ZONES: readonly Zone[] = [
  "marketing",
  "hospitality",
  "rialto",
  "gen",
  "api:users",
  "api:reservations",
  "api:agent",
];

export const BASE_URL = "https://mattbutlerengineering.com";
export const INVENTORY_VERSION = 1;

export interface LighthouseScores {
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}

export interface ScoreEntry {
  readonly timestamp: string;
  readonly scores: LighthouseScores;
}

export interface AuditSurface {
  readonly id: string;
  readonly zone: Zone;
  readonly type: "page" | "api_endpoint";
  readonly url: string;
  readonly sourceFiles: readonly string[];
  readonly auth: "none" | "auth0";
  readonly lastChecked: string | null;
  readonly lastScore: LighthouseScores | null;
  readonly checkHistory: readonly ScoreEntry[];
  readonly checkCount: number;
}

export interface AuditInventory {
  readonly surfaces: readonly AuditSurface[];
  readonly lastUpdated: string;
  readonly version: number;
}

export interface Regression {
  readonly surfaceId: string;
  readonly category: keyof LighthouseScores;
  readonly previousScore: number;
  readonly currentScore: number;
  readonly drop: number;
}

// ── Surface Builder ─────────────────────────────────────────────────

function surface(
  id: string,
  zone: Zone,
  type: "page" | "api_endpoint",
  path: string,
  sourceFiles: readonly string[],
  auth: "none" | "auth0" = "none"
): AuditSurface {
  return {
    id,
    zone,
    type,
    url: `${BASE_URL}${path}`,
    sourceFiles,
    auth,
    lastChecked: null,
    lastScore: null,
    checkHistory: [],
    checkCount: 0,
  };
}

// ── Surface Registry ────────────────────────────────────────────────

const SURFACE_REGISTRY: readonly AuditSurface[] = [
  // Marketing
  surface("marketing:home", "marketing", "page", "/", [
    "apps/marketing/src/pages/HomePage.tsx",
    "apps/marketing/src/App.tsx",
  ]),

  // Hospitality
  surface(
    "hospitality:home",
    "hospitality",
    "page",
    "/hospitality",
    ["apps/hospitality/src/pages/HomePage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:reservations",
    "hospitality",
    "page",
    "/hospitality/reservations",
    ["apps/hospitality/src/pages/ReservationsPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:timeline",
    "hospitality",
    "page",
    "/hospitality/timeline",
    ["apps/hospitality/src/pages/TimelinePage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:guests",
    "hospitality",
    "page",
    "/hospitality/guests",
    ["apps/hospitality/src/pages/GuestsPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:floor-plans",
    "hospitality",
    "page",
    "/hospitality/floor-plans",
    ["apps/hospitality/src/pages/FloorPlansPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:booking-widget",
    "hospitality",
    "page",
    "/hospitality/booking-widget",
    ["apps/hospitality/src/pages/BookingWidgetDemoPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:onboarding",
    "hospitality",
    "page",
    "/hospitality/onboarding",
    ["apps/hospitality/src/pages/VenueOnboardingPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:profile",
    "hospitality",
    "page",
    "/hospitality/profile",
    ["apps/hospitality/src/pages/ProfilePage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:settings",
    "hospitality",
    "page",
    "/hospitality/settings",
    ["apps/hospitality/src/pages/SettingsPage.tsx"],
    "auth0"
  ),
  surface(
    "hospitality:admin",
    "hospitality",
    "page",
    "/hospitality/admin",
    ["apps/hospitality/src/pages/AdminPage.tsx"],
    "auth0"
  ),

  // Rialto Web — Overview
  surface("rialto:overview", "rialto", "page", "/rialto", [
    "apps/rialto-web/src/pages/OverviewPage.tsx",
  ]),

  // Rialto Web — Forms
  surface("rialto:button", "rialto", "page", "/rialto/components/button", [
    "apps/rialto-web/src/pages/forms/ButtonPage.tsx",
    "packages/rialto/src/components/button",
  ]),
  surface("rialto:input", "rialto", "page", "/rialto/components/input", [
    "apps/rialto-web/src/pages/forms/InputPage.tsx",
    "packages/rialto/src/components/input",
  ]),
  surface("rialto:textarea", "rialto", "page", "/rialto/components/textarea", [
    "apps/rialto-web/src/pages/forms/TextAreaPage.tsx",
    "packages/rialto/src/components/textarea",
  ]),
  surface("rialto:number-input", "rialto", "page", "/rialto/components/number-input", [
    "apps/rialto-web/src/pages/forms/NumberInputPage.tsx",
    "packages/rialto/src/components/number-input",
  ]),
  surface("rialto:checkbox-radio", "rialto", "page", "/rialto/components/checkbox-radio", [
    "apps/rialto-web/src/pages/forms/CheckboxRadioPage.tsx",
    "packages/rialto/src/components/checkbox",
  ]),
  surface("rialto:toggle", "rialto", "page", "/rialto/components/toggle", [
    "apps/rialto-web/src/pages/forms/TogglePage.tsx",
    "packages/rialto/src/components/toggle",
  ]),
  surface("rialto:slider", "rialto", "page", "/rialto/components/slider", [
    "apps/rialto-web/src/pages/forms/SliderPage.tsx",
    "packages/rialto/src/components/slider",
  ]),
  surface("rialto:select", "rialto", "page", "/rialto/components/select", [
    "apps/rialto-web/src/pages/forms/SelectPage.tsx",
    "packages/rialto/src/components/select",
  ]),
  surface("rialto:pin-input", "rialto", "page", "/rialto/components/pin-input", [
    "apps/rialto-web/src/pages/forms/PinInputPage.tsx",
    "packages/rialto/src/components/pin-input",
  ]),
  surface("rialto:segmented-control", "rialto", "page", "/rialto/components/segmented-control", [
    "apps/rialto-web/src/pages/forms/SegmentedControlPage.tsx",
    "packages/rialto/src/components/segmented-control",
  ]),
  surface("rialto:autocomplete", "rialto", "page", "/rialto/components/autocomplete", [
    "apps/rialto-web/src/pages/forms/AutocompletePage.tsx",
    "packages/rialto/src/components/autocomplete",
  ]),
  surface("rialto:input-group", "rialto", "page", "/rialto/components/input-group", [
    "apps/rialto-web/src/pages/forms/InputGroupPage.tsx",
    "packages/rialto/src/components/input-group",
  ]),

  // Rialto Web — Data Display
  surface("rialto:card", "rialto", "page", "/rialto/components/card", [
    "apps/rialto-web/src/pages/data/CardPage.tsx",
    "packages/rialto/src/components/card",
  ]),
  surface("rialto:table", "rialto", "page", "/rialto/components/table", [
    "apps/rialto-web/src/pages/data/TablePage.tsx",
    "packages/rialto/src/components/table",
  ]),
  surface("rialto:badge", "rialto", "page", "/rialto/components/badge", [
    "apps/rialto-web/src/pages/data/BadgePage.tsx",
    "packages/rialto/src/components/badge",
  ]),
  surface("rialto:tag", "rialto", "page", "/rialto/components/tag", [
    "apps/rialto-web/src/pages/data/TagPage.tsx",
    "packages/rialto/src/components/tag",
  ]),
  surface("rialto:avatar", "rialto", "page", "/rialto/components/avatar", [
    "apps/rialto-web/src/pages/data/AvatarPage.tsx",
    "packages/rialto/src/components/avatar",
  ]),
  surface("rialto:stat", "rialto", "page", "/rialto/components/stat", [
    "apps/rialto-web/src/pages/data/StatPage.tsx",
    "packages/rialto/src/components/stat",
  ]),
  surface("rialto:data-list", "rialto", "page", "/rialto/components/data-list", [
    "apps/rialto-web/src/pages/data/DataListPage.tsx",
    "packages/rialto/src/components/data-list",
  ]),
  surface("rialto:meter", "rialto", "page", "/rialto/components/meter", [
    "apps/rialto-web/src/pages/data/MeterPage.tsx",
    "packages/rialto/src/components/meter",
  ]),
  surface("rialto:kbd", "rialto", "page", "/rialto/components/kbd", [
    "apps/rialto-web/src/pages/data/KbdPage.tsx",
    "packages/rialto/src/components/kbd",
  ]),

  // Rialto Web — Navigation
  surface("rialto:tabs", "rialto", "page", "/rialto/components/tabs", [
    "apps/rialto-web/src/pages/navigation/TabsPage.tsx",
    "packages/rialto/src/components/tabs",
  ]),
  surface("rialto:breadcrumb", "rialto", "page", "/rialto/components/breadcrumb", [
    "apps/rialto-web/src/pages/navigation/BreadcrumbPage.tsx",
    "packages/rialto/src/components/breadcrumb",
  ]),
  surface("rialto:steps", "rialto", "page", "/rialto/components/steps", [
    "apps/rialto-web/src/pages/navigation/StepsPage.tsx",
    "packages/rialto/src/components/steps",
  ]),
  surface("rialto:pagination", "rialto", "page", "/rialto/components/pagination", [
    "apps/rialto-web/src/pages/navigation/PaginationPage.tsx",
    "packages/rialto/src/components/pagination",
  ]),
  surface("rialto:navigation-menu", "rialto", "page", "/rialto/components/navigation-menu", [
    "apps/rialto-web/src/pages/navigation/NavigationMenuPage.tsx",
    "packages/rialto/src/components/navigation-menu",
  ]),
  surface("rialto:tree", "rialto", "page", "/rialto/components/tree", [
    "apps/rialto-web/src/pages/data/TreePage.tsx",
    "packages/rialto/src/components/tree",
  ]),
  surface("rialto:sidebar", "rialto", "page", "/rialto/components/sidebar", [
    "apps/rialto-web/src/pages/navigation/SidebarPage.tsx",
    "packages/rialto/src/components/sidebar",
  ]),
  surface("rialto:navbar", "rialto", "page", "/rialto/components/navbar", [
    "apps/rialto-web/src/pages/navigation/NavbarPage.tsx",
    "packages/rialto/src/components/navbar",
  ]),

  // Rialto Web — Feedback
  surface("rialto:toast", "rialto", "page", "/rialto/components/toast", [
    "apps/rialto-web/src/pages/feedback/ToastPage.tsx",
    "packages/rialto/src/components/toast",
  ]),
  surface("rialto:alert", "rialto", "page", "/rialto/components/alert", [
    "apps/rialto-web/src/pages/feedback/AlertPage.tsx",
    "packages/rialto/src/components/alert",
  ]),
  surface("rialto:banner", "rialto", "page", "/rialto/components/banner", [
    "apps/rialto-web/src/pages/feedback/BannerPage.tsx",
    "packages/rialto/src/components/banner",
  ]),
  surface("rialto:progress", "rialto", "page", "/rialto/components/progress", [
    "apps/rialto-web/src/pages/feedback/ProgressPage.tsx",
    "packages/rialto/src/components/progress",
  ]),
  surface("rialto:spinner", "rialto", "page", "/rialto/components/spinner", [
    "apps/rialto-web/src/pages/feedback/SpinnerPage.tsx",
    "packages/rialto/src/components/spinner",
  ]),
  surface("rialto:skeleton", "rialto", "page", "/rialto/components/skeleton", [
    "apps/rialto-web/src/pages/feedback/SkeletonPage.tsx",
    "packages/rialto/src/components/skeleton",
  ]),
  surface("rialto:empty-state", "rialto", "page", "/rialto/components/empty-state", [
    "apps/rialto-web/src/pages/feedback/EmptyStatePage.tsx",
    "packages/rialto/src/components/empty-state",
  ]),

  // Rialto Web — Overlays
  surface("rialto:dialog", "rialto", "page", "/rialto/components/dialog", [
    "apps/rialto-web/src/pages/overlays/DialogPage.tsx",
    "packages/rialto/src/components/dialog",
  ]),
  surface("rialto:confirm-dialog", "rialto", "page", "/rialto/components/confirm-dialog", [
    "apps/rialto-web/src/pages/overlays/ConfirmDialogPage.tsx",
    "packages/rialto/src/components/confirm-dialog",
  ]),
  surface("rialto:drawer", "rialto", "page", "/rialto/components/drawer", [
    "apps/rialto-web/src/pages/overlays/DrawerPage.tsx",
    "packages/rialto/src/components/drawer",
  ]),
  surface("rialto:command-palette", "rialto", "page", "/rialto/components/command-palette", [
    "apps/rialto-web/src/pages/overlays/CommandPalettePage.tsx",
    "packages/rialto/src/components/command-palette",
  ]),
  surface("rialto:tooltip", "rialto", "page", "/rialto/components/tooltip", [
    "apps/rialto-web/src/pages/overlays/TooltipPage.tsx",
    "packages/rialto/src/components/tooltip",
  ]),
  surface("rialto:popover", "rialto", "page", "/rialto/components/popover", [
    "apps/rialto-web/src/pages/overlays/PopoverPage.tsx",
    "packages/rialto/src/components/popover",
  ]),
  surface("rialto:hover-card", "rialto", "page", "/rialto/components/hover-card", [
    "apps/rialto-web/src/pages/overlays/HoverCardPage.tsx",
    "packages/rialto/src/components/hover-card",
  ]),
  surface("rialto:dropdown-menu", "rialto", "page", "/rialto/components/dropdown-menu", [
    "apps/rialto-web/src/pages/overlays/DropdownMenuPage.tsx",
    "packages/rialto/src/components/dropdown-menu",
  ]),
  surface("rialto:context-menu", "rialto", "page", "/rialto/components/context-menu", [
    "apps/rialto-web/src/pages/overlays/ContextMenuPage.tsx",
    "packages/rialto/src/components/context-menu",
  ]),
  surface("rialto:disabled-tooltip", "rialto", "page", "/rialto/components/disabled-tooltip", [
    "apps/rialto-web/src/pages/overlays/DisabledTooltipPage.tsx",
    "packages/rialto/src/components/tooltip",
  ]),

  // Rialto Web — Layout
  surface("rialto:divider", "rialto", "page", "/rialto/components/divider", [
    "apps/rialto-web/src/pages/layout/DividerPage.tsx",
    "packages/rialto/src/components/divider",
  ]),
  surface("rialto:text", "rialto", "page", "/rialto/components/text", [
    "apps/rialto-web/src/pages/layout/TextPage.tsx",
    "packages/rialto/src/components/text",
  ]),
  surface("rialto:stack", "rialto", "page", "/rialto/components/stack", [
    "apps/rialto-web/src/pages/layout/StackPage.tsx",
    "packages/rialto/src/components/stack",
  ]),
  surface("rialto:collapsible", "rialto", "page", "/rialto/components/collapsible", [
    "apps/rialto-web/src/pages/layout/CollapsiblePage.tsx",
    "packages/rialto/src/components/collapsible",
  ]),
  surface("rialto:accordion", "rialto", "page", "/rialto/components/accordion", [
    "apps/rialto-web/src/pages/layout/AccordionPage.tsx",
    "packages/rialto/src/components/accordion",
  ]),
  surface("rialto:aspect-ratio", "rialto", "page", "/rialto/components/aspect-ratio", [
    "apps/rialto-web/src/pages/layout/AspectRatioPage.tsx",
    "packages/rialto/src/components/aspect-ratio",
  ]),
  surface("rialto:scroll-area", "rialto", "page", "/rialto/components/scroll-area", [
    "apps/rialto-web/src/pages/layout/ScrollAreaPage.tsx",
    "packages/rialto/src/components/scroll-area",
  ]),
  surface("rialto:timeline", "rialto", "page", "/rialto/components/timeline", [
    "apps/rialto-web/src/pages/data/TimelinePage.tsx",
    "packages/rialto/src/components/timeline",
  ]),
  surface("rialto:hero", "rialto", "page", "/rialto/components/hero", [
    "apps/rialto-web/src/pages/layout/HeroPage.tsx",
    "packages/rialto/src/components/hero",
  ]),
  surface("rialto:footer", "rialto", "page", "/rialto/components/footer", [
    "apps/rialto-web/src/pages/layout/FooterPage.tsx",
    "packages/rialto/src/components/footer",
  ]),
  surface("rialto:page-header", "rialto", "page", "/rialto/components/page-header", [
    "apps/rialto-web/src/pages/layout/PageHeaderPage.tsx",
    "packages/rialto/src/components/page-header",
  ]),

  // Rialto Web — Token Pages
  surface("rialto:motion", "rialto", "page", "/rialto/components/motion", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:typography", "rialto", "page", "/rialto/components/typography", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:color", "rialto", "page", "/rialto/components/color", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:spacing", "rialto", "page", "/rialto/components/spacing", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:radius", "rialto", "page", "/rialto/components/radius", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:shadows", "rialto", "page", "/rialto/components/shadows", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:surfaces", "rialto", "page", "/rialto/components/surfaces", [
    "apps/rialto-web/src/routes.tsx",
  ]),
  surface("rialto:icon-vocabulary", "rialto", "page", "/rialto/components/icon-vocabulary", [
    "apps/rialto-web/src/routes.tsx",
  ]),

  // Rialto Web — Examples
  surface("rialto:dashboard-example", "rialto", "page", "/rialto/examples/dashboard", [
    "apps/rialto-web/src/pages/examples/DashboardExamplePage.tsx",
  ]),
  surface("rialto:settings-example", "rialto", "page", "/rialto/examples/settings", [
    "apps/rialto-web/src/pages/examples/SettingsExamplePage.tsx",
  ]),
  surface("rialto:form-example", "rialto", "page", "/rialto/examples/form", [
    "apps/rialto-web/src/pages/examples/FormStatesExamplePage.tsx",
  ]),

  // Rialto Web — Demos
  surface("rialto:login-demo", "rialto", "page", "/rialto/demos/login", [
    "apps/rialto-web/src/pages/auth/SignIn.tsx",
  ]),
  surface("rialto:signup-demo", "rialto", "page", "/rialto/demos/signup", [
    "apps/rialto-web/src/pages/auth/SignUp.tsx",
  ]),
  surface("rialto:dashboard-demo", "rialto", "page", "/rialto/demos/dashboard", [
    "apps/rialto-web/src/pages/dashboard/Dashboard.tsx",
  ]),
  surface("rialto:teams-new-demo", "rialto", "page", "/rialto/demos/teams/new", [
    "apps/rialto-web/src/pages/teams/TeamCreate.tsx",
  ]),
  surface("rialto:layouts-demo", "rialto", "page", "/rialto/demos/layouts", [
    "apps/rialto-web/src/pages/layouts/LayoutDemo.tsx",
  ]),
  surface("rialto:drivers-demo", "rialto", "page", "/rialto/demos/drivers", [
    "apps/rialto-web/src/pages/drivers/DriverList.tsx",
  ]),
  surface("rialto:visual-test", "rialto", "page", "/rialto/visual-test", [
    "apps/rialto-web/src/pages/visual-test/VisualTest.tsx",
  ]),

  // Gen
  surface(
    "gen:playground",
    "gen",
    "page",
    "/gen",
    ["apps/gen/src/pages/PlaygroundPage.tsx"],
    "auth0"
  ),

  // API Health Endpoints
  surface("api:users:health", "api:users", "api_endpoint", "/api/v1/users/health", [
    "services/users/src/routes/health.ts",
    "services/users/src/app.ts",
  ]),
  surface("api:reservations:health", "api:reservations", "api_endpoint", "/api/health", [
    "services/reservations/src/routes/health.ts",
    "services/reservations/src/app.ts",
  ]),
  surface("api:agent:health", "api:agent", "api_endpoint", "/api/gen/health", [
    "services/agent/src/routes/health.ts",
    "services/agent/src/app.ts",
  ]),
];

// ── Build ───────────────────────────────────────────────────────────

export function buildInventory(): AuditInventory {
  return {
    surfaces: SURFACE_REGISTRY,
    lastUpdated: new Date().toISOString(),
    version: INVENTORY_VERSION,
  };
}

// ── Merge ───────────────────────────────────────────────────────────

export function mergeInventory(fresh: AuditInventory, existing: AuditInventory): AuditInventory {
  const existingMap = new Map(existing.surfaces.map((s) => [s.id, s]));

  const merged = fresh.surfaces.map((freshSurface) => {
    const prev = existingMap.get(freshSurface.id);
    if (!prev) return freshSurface;

    return {
      ...freshSurface,
      lastChecked: prev.lastChecked,
      lastScore: prev.lastScore,
      checkHistory: prev.checkHistory,
      checkCount: prev.checkCount,
    };
  });

  return {
    surfaces: merged,
    lastUpdated: new Date().toISOString(),
    version: INVENTORY_VERSION,
  };
}

// ── Load / Save ─────────────────────────────────────────────────────

const INVENTORY_PATH = ".audit-state/inventory.json";

export async function loadInventory(repoPath: string): Promise<AuditInventory> {
  const filePath = join(repoPath, INVENTORY_PATH);
  const fresh = buildInventory();

  try {
    const content = await readFile(filePath, "utf-8");
    const existing = JSON.parse(content) as AuditInventory;
    return mergeInventory(fresh, existing);
  } catch {
    return fresh;
  }
}

export async function saveInventory(repoPath: string, inventory: AuditInventory): Promise<void> {
  const filePath = join(repoPath, INVENTORY_PATH);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(inventory, null, 2));
}

// ── Non-Auditable File Detection ────────────────────────────────────

export { isNonAuditableFile };

/**
 * Returns true when every file in the list is non-auditable, meaning no
 * Lighthouse or API health checks are needed for this set of changes.
 *
 * An empty list returns false (nothing to skip).
 */
export function allFilesNonAuditable(changedFiles: readonly string[]): boolean {
  if (changedFiles.length === 0) return false;
  return changedFiles.every(isNonAuditableFile);
}

// ── File-to-Surface Mapping ─────────────────────────────────────────

const FRONTEND_ZONES: readonly Zone[] = ["marketing", "hospitality", "rialto", "gen"];

function fileToZones(filePath: string): readonly Zone[] | "all" | null {
  if (filePath.startsWith("infrastructure/")) return "all";
  if (filePath.startsWith("packages/rialto/")) return FRONTEND_ZONES;

  const appMatch = filePath.match(/^apps\/([^/]+)\//);
  if (appMatch) {
    const zoneMap: Record<string, Zone> = {
      marketing: "marketing",
      hospitality: "hospitality",
      "rialto-web": "rialto",
      gen: "gen",
    };
    const zone = zoneMap[appMatch[1]];
    return zone ? [zone] : null;
  }

  const svcMatch = filePath.match(/^services\/([^/]+)\//);
  if (svcMatch) {
    const zoneMap: Record<string, Zone> = {
      users: "api:users",
      reservations: "api:reservations",
      agent: "api:agent",
    };
    const zone = zoneMap[svcMatch[1]];
    return zone ? [zone] : null;
  }

  if (filePath.startsWith("packages/")) return FRONTEND_ZONES;

  return null;
}

export function mapFilesToSurfaces(
  inventory: AuditInventory,
  changedFiles: readonly string[]
): readonly AuditSurface[] {
  const matchedIds = new Set<string>();

  for (const file of changedFiles) {
    const zones = fileToZones(file);

    if (zones === "all") return [...inventory.surfaces];
    if (zones === null) continue;

    // Exact sourceFile match → specific surface
    for (const s of inventory.surfaces) {
      if (s.sourceFiles.some((sf) => file.startsWith(sf) || file === sf)) {
        matchedIds.add(s.id);
      }
    }

    // For frontend apps: page files map to specific surfaces (handled above).
    // Shared files (components, layouts, etc.) map to all surfaces in zone.
    // For services: ALL files map to all surfaces in that service's zone.
    const isFrontendPageFile = file.includes("/pages/") && !file.startsWith("services/");
    if (!isFrontendPageFile) {
      for (const zone of zones) {
        for (const s of inventory.surfaces) {
          if (s.zone === zone) matchedIds.add(s.id);
        }
      }
    }
  }

  return inventory.surfaces.filter((s) => matchedIds.has(s.id));
}

// ── Zone Staleness ──────────────────────────────────────────────────

export function findStalestZone(inventory: AuditInventory): Zone {
  const zoneAges = new Map<Zone, number>();

  for (const zone of ZONES) {
    const zoneSurfaces = inventory.surfaces.filter((s) => s.zone === zone);
    if (zoneSurfaces.length === 0) continue;

    const avgAge =
      zoneSurfaces.reduce((sum, s) => {
        if (!s.lastChecked) return sum + Infinity;
        return sum + (Date.now() - new Date(s.lastChecked).getTime());
      }, 0) / zoneSurfaces.length;

    zoneAges.set(zone, avgAge);
  }

  let stalest: Zone = ZONES[0];
  let maxAge = -1;

  for (const [zone, age] of zoneAges) {
    if (age > maxAge) {
      maxAge = age;
      stalest = zone;
    }
  }

  return stalest;
}

// ── Score Update ────────────────────────────────────────────────────

const MAX_HISTORY = 10;

export function updateSurfaceScore(s: AuditSurface, scores: LighthouseScores): AuditSurface {
  const entry: ScoreEntry = { timestamp: new Date().toISOString(), scores };
  const history = [...s.checkHistory, entry].slice(-MAX_HISTORY);

  return {
    ...s,
    lastChecked: entry.timestamp,
    lastScore: scores,
    checkHistory: history,
    checkCount: s.checkCount + 1,
  };
}

// ── Regression Detection ────────────────────────────────────────────

const REGRESSION_THRESHOLD = 0.05;

export function detectRegression(s: AuditSurface, newScores: LighthouseScores): Regression | null {
  if (!s.lastScore) return null;

  const categories: (keyof LighthouseScores)[] = [
    "performance",
    "accessibility",
    "bestPractices",
    "seo",
  ];

  let worst: Regression | null = null;

  for (const cat of categories) {
    const drop = s.lastScore[cat] - newScores[cat];
    if (drop > REGRESSION_THRESHOLD && (!worst || drop > worst.drop)) {
      worst = {
        surfaceId: s.id,
        category: cat,
        previousScore: s.lastScore[cat],
        currentScore: newScores[cat],
        drop,
      };
    }
  }

  return worst;
}
